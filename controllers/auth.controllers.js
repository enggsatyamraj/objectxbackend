// File: controllers/auth.controller.js

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/user.model.js';
import Organization from '../models/organization.model.js';
import generateToken from '../utils/generateToken.js';
import logger from '../utils/logger.js';
import { generateOTP, canRequestNewOTP, getOTPCooldownTime } from '../utils/otp.js';
import {
    sendOTPEmail,
    sendPasswordResetOTP,
    sendWelcomeEmail,
    sendPasswordChangedEmail
} from '../utils/emailService.js';

// POST /signup - Only for SuperAdmin and SpecialUser
export const registerUser = async (req, res) => {
    const startTime = Date.now();
    logger.info('[AUTH] Starting user registration process');

    try {
        // Extract validated data from request body
        const { name, email, password, role } = req.body;

        // Validate allowed roles for public registration
        if (!['superAdmin', 'specialUser'].includes(role)) {
            logger.warn('[AUTH] Registration failed: Invalid role for public registration', {
                email,
                role,
                message: 'Only superAdmin and specialUser can register publicly'
            });
            return res.status(400).json({
                success: false,
                message: 'Students, teachers, and admins must be enrolled by organization admins'
            });
        }

        // Check if user already exists
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

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Generate OTP for email verification
        const otp = generateOTP();

        // Create user (not verified initially)
        const user = await User.create({
            name,
            email,
            password: hashedPassword,
            role,
            isVerified: false,
            // No organization for superAdmin and specialUser
            organization: undefined,
            section: undefined,
            teachingSections: [],
            managingOrganizations: []
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
            email: user.email
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

// POST /verify-email - Updated for new structure
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
                organization: user.organization,
                section: user.section,
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

// POST /login - Updated for new structure
export const loginUser = async (req, res) => {
    const startTime = Date.now();
    logger.info('[AUTH] Processing login request');

    try {
        // Extract validated data from request body
        const { email, password } = req.body;

        const user = await User.findOne({ email })
            .populate('organization')
            .populate('section');

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

        // Update last login
        await user.updateLastLogin();

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
                organization: user.organization,
                section: user.section,
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

// GET /me - Updated to return organization and section data
export const getMe = async (req, res) => {
    const startTime = Date.now();
    logger.info('[AUTH] Retrieving user profile', { userId: req.user._id });

    try {
        // Find user by ID (from auth middleware)
        const user = await User.findById(req.user._id)
            .populate('organization')
            .populate('section')
            .populate('teachingSections')
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
                organization: user.organization,
                section: user.section,
                teachingSections: user.teachingSections,
                avatar: user.avatar,
                bio: user.bio,
                isVerified: user.isVerified,
                preferences: user.preferences,
                studentDetails: user.studentDetails,
                teacherDetails: user.teacherDetails,
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

// PUT /me - Profile update (keeping existing functionality)
export const updateProfile = async (req, res) => {
    const startTime = Date.now();
    logger.info('[AUTH] Processing profile update request', { userId: req.user._id });

    try {
        // Extract validated data
        const { name, avatar, bio } = req.body;

        // Find user by ID
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

// PUT /password - Password change (keeping existing functionality)
export const changePassword = async (req, res) => {
    const startTime = Date.now();
    logger.info('[AUTH] Processing password change request', { userId: req.user._id });

    try {
        // Extract validated data
        const { currentPassword, newPassword } = req.body;

        // Find user with password
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