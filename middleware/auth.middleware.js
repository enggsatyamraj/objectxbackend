// File: middleware/auth.middleware.js

import jwt from 'jsonwebtoken';
import User from '../models/user.model.js';
import logger from '../utils/logger.js';

/**
 * Protect middleware - Verify JWT token and authenticate user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export const protect = async (req, res, next) => {
    const startTime = Date.now();

    try {
        let token;

        // Check for token in Authorization header
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }

        // Check if token exists
        if (!token) {
            logger.warn('[AUTH] Access denied: No token provided', {
                path: req.path,
                method: req.method,
                ip: req.ip
            });

            return res.status(401).json({
                success: false,
                message: 'Access denied. No token provided.'
            });
        }

        try {
            // Verify token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Find user by ID from token
            const user = await User.findById(decoded._id)
                .populate('organization')
                .populate('section')
                .populate('teachingSections')
                .select('-password -otp');

            // Check if user exists
            if (!user) {
                logger.warn('[AUTH] Token valid but user not found', {
                    userId: decoded._id,
                    path: req.path
                });

                return res.status(401).json({
                    success: false,
                    message: 'Token is valid but user no longer exists'
                });
            }

            // Check if user is active
            if (!user.isActive) {
                logger.warn('[AUTH] Inactive user attempted access', {
                    userId: user._id,
                    email: user.email
                });

                return res.status(401).json({
                    success: false,
                    message: 'Your account has been deactivated'
                });
            }

            // Check if user is deleted
            if (user.isDeleted) {
                logger.warn('[AUTH] Deleted user attempted access', {
                    userId: user._id,
                    email: user.email
                });

                return res.status(401).json({
                    success: false,
                    message: 'Your account has been deleted'
                });
            }

            // Check if user is verified (except for SuperAdmin)
            if (!user.isVerified && user.role !== 'superAdmin') {
                logger.warn('[AUTH] Unverified user attempted access', {
                    userId: user._id,
                    email: user.email,
                    role: user.role
                });

                return res.status(401).json({
                    success: false,
                    message: 'Please verify your email before accessing this resource',
                    requiresVerification: true
                });
            }

            // Attach user to request object
            req.user = user;

            const processingTime = Date.now() - startTime;
            logger.debug(`[AUTH] User authenticated successfully (${processingTime}ms)`, {
                userId: user._id,
                role: user.role,
                path: req.path
            });

            next();

        } catch (jwtError) {
            const processingTime = Date.now() - startTime;

            // Handle specific JWT errors
            if (jwtError.name === 'TokenExpiredError') {
                logger.warn(`[AUTH] Token expired (${processingTime}ms)`, {
                    path: req.path,
                    expiredAt: jwtError.expiredAt
                });

                return res.status(401).json({
                    success: false,
                    message: 'Token has expired. Please login again.',
                    expired: true
                });
            }

            if (jwtError.name === 'JsonWebTokenError') {
                logger.warn(`[AUTH] Invalid token (${processingTime}ms)`, {
                    path: req.path,
                    error: jwtError.message
                });

                return res.status(401).json({
                    success: false,
                    message: 'Invalid token. Please login again.'
                });
            }

            if (jwtError.name === 'NotBeforeError') {
                logger.warn(`[AUTH] Token not active yet (${processingTime}ms)`, {
                    path: req.path,
                    notBefore: jwtError.date
                });

                return res.status(401).json({
                    success: false,
                    message: 'Token not active yet. Please try again later.'
                });
            }

            // Generic JWT error
            logger.error(`[AUTH] JWT verification failed (${processingTime}ms):`, jwtError);

            return res.status(401).json({
                success: false,
                message: 'Invalid token. Please login again.'
            });
        }

    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[AUTH] Authentication middleware failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error during authentication',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};

/**
 * Optional protect middleware - Similar to protect but doesn't fail if no token
 * Used for routes that work for both authenticated and unauthenticated users
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export const optionalProtect = async (req, res, next) => {
    try {
        let token;

        // Check for token in Authorization header
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }

        // If no token, continue without authentication
        if (!token) {
            return next();
        }

        try {
            // Verify token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Find user by ID from token
            const user = await User.findById(decoded._id)
                .populate('organization')
                .populate('section')
                .select('-password -otp');

            // If user exists and is active, attach to request
            if (user && user.isActive && !user.isDeleted) {
                req.user = user;
            }

        } catch (jwtError) {
            // Continue without authentication if token is invalid
            logger.debug('[AUTH] Optional auth failed, continuing without user', {
                error: jwtError.message
            });
        }

        next();

    } catch (error) {
        logger.error('[AUTH] Optional authentication middleware failed:', error);
        // Continue without authentication on server error
        next();
    }
};

/**
 * Check if user has account lock (for security)
 * @param {Object} user - User object
 * @returns {boolean} True if account is locked
 */
const isAccountLocked = (user) => {
    return user.lockUntil && user.lockUntil > Date.now();
};

/**
 * Enhanced protect middleware with account locking
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export const protectWithLocking = async (req, res, next) => {
    try {
        // First run standard protection
        await protect(req, res, () => { });

        // If we have a user, check for account locking
        if (req.user && isAccountLocked(req.user)) {
            const lockUntil = new Date(req.user.lockUntil);
            logger.warn('[AUTH] Locked account attempted access', {
                userId: req.user._id,
                lockUntil
            });

            return res.status(423).json({
                success: false,
                message: `Account is temporarily locked until ${lockUntil.toLocaleString()}`,
                locked: true,
                lockUntil: lockUntil
            });
        }

        next();

    } catch (error) {
        return res.status(401).json({
            success: false,
            message: 'Authentication failed'
        });
    }
};