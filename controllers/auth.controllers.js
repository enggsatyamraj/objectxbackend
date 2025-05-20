import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/user.models.js';
import generateToken from '../utils/generateToken.js';
import logger from '../utils/logger.js';

// POST /signup
export const registerUser = async (req, res) => {
    const startTime = Date.now();
    logger.info('[AUTH] Starting user registration process');

    try {
        // Extract validated data from request body
        // The zodValidator middleware has already validated and parsed the data
        const { name, email, password, role, school } = req.body.user;

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            logger.warn('[AUTH] Registration failed: Email already in use', { email });
            return res.status(400).json({
                success: false,
                message: 'User with this email already exists'
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await User.create({
            name,
            email,
            password: hashedPassword,
            role,
            school,
        });

        const token = generateToken(user);

        // Calculate processing time
        const processingTime = Date.now() - startTime;
        logger.info(`[AUTH] User registered successfully (${processingTime}ms)`, {
            userId: user._id,
            role: user.role,
            email: user.email
        });

        // Send successful response
        return res.status(201).json({
            success: true,
            token,
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                school: user.school,
            },
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
            .select('-password');

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
        await user.save();

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