import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/user.models.js';
import generateToken from '../utils/generateToken.js';
import logger from '../utils/logger.js';
import mongoose from 'mongoose';
import School from '../models/school.models.js';
import { generateOTP, canRequestNewOTP, getOTPCooldownTime } from '../utils/otp.js';
import {
    sendOTPEmail,
    sendPasswordResetOTP,
    sendWelcomeEmail,
    sendPasswordChangedEmail
} from '../utils/emailService.js';

// POST /signup
export const registerUser = async (req, res) => {
    const startTime = Date.now();
    logger.info('[AUTH] Starting user registration process');

    try {
        // Extract validated data from request body
        const { name, email, password, role, school } = req.body.user;

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            // If user exists but not verified, allow OTP resend
            if (!existingUser.isVerified) {
                logger.info('[AUTH] User exists but not verified, checking OTP resend eligibility', { email });

                // Check if user can request new OTP
                if (!existingUser.canRequestNewOTP()) {
                    const cooldownTime = getOTPCooldownTime(existingUser.otp.lastOTPSent);
                    return res.status(429).json({
                        success: false,
                        message: `Please wait ${cooldownTime} seconds before requesting a new OTP`
                    });
                }

                // Generate and send new OTP
                const otp = generateOTP();
                existingUser.setOTP(otp, 'email_verification');
                await existingUser.save();

                // Send OTP email
                const emailSent = await sendOTPEmail(existingUser.email, existingUser.name, otp);
                if (!emailSent) {
                    logger.error('[AUTH] Failed to send OTP email during registration resend');
                    return res.status(500).json({
                        success: false,
                        message: 'Failed to send verification email'
                    });
                }

                return res.status(200).json({
                    success: true,
                    message: 'New verification OTP sent to your email',
                    email: existingUser.email
                });
            }

            logger.warn('[AUTH] Registration failed: Email already in use', { email });
            return res.status(400).json({
                success: false,
                message: 'User with this email already exists'
            });
        }

        // If role is student or teacher, validate school
        if ((role === 'student' || role === 'teacher') && !school) {
            logger.warn('[AUTH] Registration failed: School required for student/teacher', { role });
            return res.status(400).json({
                success: false,
                message: `School is required for ${role} registration`
            });
        }

        // If school is provided, validate it exists
        let schoolExists = null;
        if (school) {
            // Check if school ID is valid
            if (!mongoose.Types.ObjectId.isValid(school)) {
                logger.warn('[AUTH] Registration failed: Invalid school ID format', { school });
                return res.status(400).json({
                    success: false,
                    message: 'Invalid school ID format'
                });
            }

            // Check if school exists
            schoolExists = await School.findById(school);
            if (!schoolExists) {
                logger.warn('[AUTH] Registration failed: School not found', { school });
                return res.status(400).json({
                    success: false,
                    message: 'School not found'
                });
            }
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // Generate OTP for email verification
        const otp = generateOTP();

        // Create user (not verified initially)
        const user = await User.create({
            name,
            email,
            password: hashedPassword,
            role,
            school: schoolExists ? schoolExists._id : undefined,
            isVerified: false
        });

        // Set OTP for email verification
        user.setOTP(otp, 'email_verification');
        await user.save();

        // Send OTP email
        const emailSent = await sendOTPEmail(user.email, user.name, otp);
        if (!emailSent) {
            logger.error('[AUTH] Failed to send OTP email during registration');
            // Don't fail registration, but warn user
        }

        // Calculate processing time
        const processingTime = Date.now() - startTime;
        logger.info(`[AUTH] User registered successfully - verification pending (${processingTime}ms)`, {
            userId: user._id,
            role: user.role,
            email: user.email,
            school: user.school ? user.school.toString() : 'none'
        });

        // Send successful response (no token until verified)
        return res.status(201).json({
            success: true,
            message: 'Registration successful! Please check your email for verification code.',
            email: user.email,
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                isVerified: user.isVerified
            }
        });
    } catch (error) {
        // Calculate processing time even for errors
        const processingTime = Date.now() - startTime;

        logger.error(`[AUTH] Registration failed (${processingTime}ms):`, error);

        // Check for specific MongoDB errors
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'User already exists with this information'
            });
        }

        // Handle validation errors
        if (error.name === 'ValidationError') {
            const validationErrors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: validationErrors
            });
        }

        // Default server error
        return res.status(500).json({
            success: false,
            message: 'Server error during registration',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};

// POST /verify-email
export const verifyEmail = async (req, res) => {
    const startTime = Date.now();
    logger.info('[AUTH] Processing email verification');

    try {
        const { email, otp } = req.body;

        // Find user by email
        const user = await User.findOne({ email });
        if (!user) {
            logger.warn('[AUTH] Email verification failed: User not found', { email });
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if user is already verified
        if (user.isVerified) {
            logger.warn('[AUTH] Email verification failed: User already verified', { userId: user._id });
            return res.status(400).json({
                success: false,
                message: 'Email is already verified'
            });
        }

        // Verify OTP
        const otpVerification = user.verifyOTP(otp, 'email_verification');
        if (!otpVerification.success) {
            logger.warn('[AUTH] Email verification failed: Invalid OTP', {
                userId: user._id,
                reason: otpVerification.message
            });
            await user.save(); // Save attempt count
            return res.status(400).json({
                success: false,
                message: otpVerification.message
            });
        }

        // Mark user as verified and clear OTP
        user.isVerified = true;
        user.clearOTP();

        // Add user to school if applicable
        if (user.school) {
            const school = await School.findById(user.school);
            if (school) {
                if (user.role === 'student') {
                    school.students.push(user._id);
                    await school.save();
                    logger.info(`[AUTH] Student added to school: ${school._id}`);
                } else if (user.role === 'teacher') {
                    school.teachers.push(user._id);
                    await school.save();
                    logger.info(`[AUTH] Teacher added to school: ${school._id}`);
                }
            }
        }

        await user.save();

        // Send welcome email
        await sendWelcomeEmail(user.email, user.name);

        // Generate token after verification
        const token = generateToken(user);

        // Calculate processing time
        const processingTime = Date.now() - startTime;
        logger.info(`[AUTH] Email verified successfully (${processingTime}ms)`, {
            userId: user._id
        });

        // Send successful response
        return res.status(200).json({
            success: true,
            message: 'Email verified successfully! Welcome to ObjectX!',
            token,
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                school: user.school,
                isVerified: user.isVerified
            }
        });
    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[AUTH] Email verification failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error during email verification',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};

// POST /resend-otp
export const resendOTP = async (req, res) => {
    const startTime = Date.now();
    logger.info('[AUTH] Processing OTP resend request');

    try {
        const { email, type = 'email_verification' } = req.body;

        // Find user by email
        const user = await User.findOne({ email });
        if (!user) {
            logger.warn('[AUTH] OTP resend failed: User not found', { email });
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if user can request new OTP
        if (!user.canRequestNewOTP()) {
            const cooldownTime = getOTPCooldownTime(user.otp.lastOTPSent);
            return res.status(429).json({
                success: false,
                message: `Please wait ${cooldownTime} seconds before requesting a new OTP`
            });
        }

        // For email verification, check if already verified
        if (type === 'email_verification' && user.isVerified) {
            return res.status(400).json({
                success: false,
                message: 'Email is already verified'
            });
        }

        // Generate and set new OTP
        const otp = generateOTP();
        user.setOTP(otp, type);
        await user.save();

        // Send appropriate email
        let emailSent = false;
        if (type === 'email_verification') {
            emailSent = await sendOTPEmail(user.email, user.name, otp);
        } else if (type === 'password_reset') {
            emailSent = await sendPasswordResetOTP(user.email, user.name, otp);
        }

        if (!emailSent) {
            logger.error('[AUTH] Failed to send OTP email during resend');
            return res.status(500).json({
                success: false,
                message: 'Failed to send OTP email'
            });
        }

        const processingTime = Date.now() - startTime;
        logger.info(`[AUTH] OTP resent successfully (${processingTime}ms)`, {
            userId: user._id,
            type
        });

        return res.status(200).json({
            success: true,
            message: 'New OTP sent to your email',
            email: user.email
        });
    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[AUTH] OTP resend failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error during OTP resend',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};

// POST /forgot-password
export const forgotPassword = async (req, res) => {
    const startTime = Date.now();
    logger.info('[AUTH] Processing forgot password request');

    try {
        const { email } = req.body;

        // Find user by email
        const user = await User.findOne({ email });
        if (!user) {
            // Don't reveal if email exists
            logger.warn('[AUTH] Forgot password: User not found', { email });
            return res.status(200).json({
                success: true,
                message: 'If an account with this email exists, you will receive a password reset code.'
            });
        }

        // Check if user can request new OTP
        if (!user.canRequestNewOTP()) {
            const cooldownTime = getOTPCooldownTime(user.otp.lastOTPSent);
            return res.status(429).json({
                success: false,
                message: `Please wait ${cooldownTime} seconds before requesting a new password reset code`
            });
        }

        // Generate and set OTP for password reset
        const otp = generateOTP();
        user.setOTP(otp, 'password_reset');
        await user.save();

        // Send password reset OTP email
        const emailSent = await sendPasswordResetOTP(user.email, user.name, otp);
        if (!emailSent) {
            logger.error('[AUTH] Failed to send password reset OTP email');
        }

        const processingTime = Date.now() - startTime;
        logger.info(`[AUTH] Password reset OTP sent (${processingTime}ms)`, {
            userId: user._id
        });

        return res.status(200).json({
            success: true,
            message: 'Password reset code sent to your email',
            email: user.email
        });
    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[AUTH] Forgot password failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error during password reset request',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};

// POST /reset-password
export const resetPassword = async (req, res) => {
    const startTime = Date.now();
    logger.info('[AUTH] Processing password reset');

    try {
        const { email, otp, newPassword } = req.body;

        // Find user by email
        const user = await User.findOne({ email });
        if (!user) {
            logger.warn('[AUTH] Password reset failed: User not found', { email });
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Verify OTP
        const otpVerification = user.verifyOTP(otp, 'password_reset');
        if (!otpVerification.success) {
            logger.warn('[AUTH] Password reset failed: Invalid OTP', {
                userId: user._id,
                reason: otpVerification.message
            });
            await user.save(); // Save attempt count
            return res.status(400).json({
                success: false,
                message: otpVerification.message
            });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password and clear OTP
        user.password = hashedPassword;
        user.lastPasswordReset = new Date();
        user.clearOTP();
        await user.save();

        // Send password changed confirmation email
        await sendPasswordChangedEmail(user.email, user.name);

        const processingTime = Date.now() - startTime;
        logger.info(`[AUTH] Password reset successfully (${processingTime}ms)`, {
            userId: user._id
        });

        return res.status(200).json({
            success: true,
            message: 'Password reset successfully'
        });
    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[AUTH] Password reset failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error during password reset',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};

// POST /login
export const loginUser = async (req, res) => {
    const startTime = Date.now();
    logger.info('[AUTH] Processing login request');

    try {
        // Extract validated data from request body
        const { email, password } = req.body.user;

        const user = await User.findOne({ email }).populate('school');
        if (!user) {
            logger.warn('[AUTH] Login failed: User not found', { email });
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Check if email is verified
        if (!user.isVerified) {
            logger.warn('[AUTH] Login failed: Email not verified', { userId: user._id });
            return res.status(401).json({
                success: false,
                message: 'Please verify your email before logging in',
                requiresVerification: true,
                email: user.email
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            logger.warn('[AUTH] Login failed: Invalid password', {
                userId: user._id,
                email: user.email
            });
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        const token = generateToken(user);

        // Calculate processing time
        const processingTime = Date.now() - startTime;
        logger.info(`[AUTH] User authenticated successfully (${processingTime}ms)`, {
            userId: user._id,
            role: user.role
        });

        // Send successful response
        return res.status(200).json({
            success: true,
            token,
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                school: user.school,
                isVerified: user.isVerified
            },
        });
    } catch (error) {
        // Calculate processing time even for errors
        const processingTime = Date.now() - startTime;

        logger.error(`[AUTH] Login failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error during login',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};

// GET /me
export const getMe = async (req, res) => {
    const startTime = Date.now();
    logger.info('[AUTH] Retrieving user profile', { userId: req.user._id });

    try {
        // Find user by ID (from auth middleware)
        logger.debug('[AUTH] Finding user details in database');
        const user = await User.findById(req.user._id)
            .populate('school')
            .select('-password -otp');

        // Check if user exists
        if (!user) {
            logger.warn('[AUTH] User profile retrieval failed: User not found', {
                userId: req.user._id
            });
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Calculate processing time
        const processingTime = Date.now() - startTime;
        logger.info(`[AUTH] User profile retrieved successfully (${processingTime}ms)`, {
            userId: user._id
        });

        // Send successful response
        return res.status(200).json({
            success: true,
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                school: user.school,
                avatar: user.avatar,
                bio: user.bio,
                isVerified: user.isVerified,
                createdAt: user.createdAt,
            },
        });
    } catch (error) {
        // Calculate processing time even for errors
        const processingTime = Date.now() - startTime;

        logger.error(`[AUTH] Profile retrieval failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error retrieving profile',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};

// PUT /me
export const updateProfile = async (req, res) => {
    const startTime = Date.now();
    logger.info('[AUTH] Processing profile update request', { userId: req.user._id });

    try {
        // Extract validated data
        const { name, avatar, bio } = req.body.user;

        // Find user by ID
        logger.debug('[AUTH] Finding user for update');
        const user = await User.findById(req.user._id);

        // Check if user exists
        if (!user) {
            logger.warn('[AUTH] Profile update failed: User not found', { userId: req.user._id });
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Update user fields if provided
        if (name) user.name = name;
        if (avatar) user.avatar = avatar;
        if (bio) user.bio = bio;

        // Save updated user
        logger.debug('[AUTH] Saving updated user profile');
        await user.save();

        // Calculate processing time
        const processingTime = Date.now() - startTime;
        logger.info(`[AUTH] User profile updated successfully (${processingTime}ms)`, {
            userId: user._id
        });

        // Send successful response
        return res.status(200).json({
            success: true,
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                avatar: user.avatar,
                bio: user.bio,
            },
        });
    } catch (error) {
        // Calculate processing time even for errors
        const processingTime = Date.now() - startTime;

        logger.error(`[AUTH] Profile update failed (${processingTime}ms):`, error);

        // Handle validation errors
        if (error.name === 'ValidationError') {
            const validationErrors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: validationErrors
            });
        }

        return res.status(500).json({
            success: false,
            message: 'Server error updating profile',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};

// PUT /password
export const changePassword = async (req, res) => {
    const startTime = Date.now();
    logger.info('[AUTH] Processing password change request', { userId: req.user._id });

    try {
        // Extract validated data
        const { currentPassword, newPassword } = req.body.passwords;

        // Find user with password
        logger.debug('[AUTH] Finding user with password for verification');
        const user = await User.findById(req.user._id);

        // Verify current password
        const isMatch = await bcrypt.compare(currentPassword, user.password);

        if (!isMatch) {
            logger.warn('[AUTH] Password change failed: Current password invalid', {
                userId: user._id
            });
            return res.status(401).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        // Hash new password
        logger.debug('[AUTH] Hashing new password');
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password
        user.password = hashedPassword;
        user.lastPasswordReset = new Date();
        await user.save();

        // Send password changed confirmation email
        await sendPasswordChangedEmail(user.email, user.name);

        // Calculate processing time
        const processingTime = Date.now() - startTime;
        logger.info(`[AUTH] Password changed successfully (${processingTime}ms)`, {
            userId: user._id
        });

        // Send successful response
        return res.status(200).json({
            success: true,
            message: 'Password updated successfully',
        });
    } catch (error) {
        // Calculate processing time even for errors
        const processingTime = Date.now() - startTime;

        logger.error(`[AUTH] Password change failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error changing password',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};