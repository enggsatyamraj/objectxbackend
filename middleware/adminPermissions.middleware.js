// File: middleware/adminPermissions.middleware.js

import logger from '../utils/logger.js';
import Organization from '../models/organization.model.js';

/**
 * SIMPLIFIED: Check if user is admin of their organization
 * @returns {Function} Express middleware function
 */
export const requireAdmin = async (req, res, next) => {
    const startTime = Date.now();

    try {
        // Check if user is authenticated (should be set by protect middleware)
        if (!req.user) {
            logger.warn('[ADMIN] Authorization failed: No authenticated user', {
                path: req.path,
                method: req.method
            });

            return res.status(401).json({
                success: false,
                message: 'Authentication required to access this resource'
            });
        }

        const userId = req.user._id;
        const userRole = req.user.role;

        // SuperAdmin has all permissions
        if (userRole === 'superAdmin') {
            logger.debug('[ADMIN] SuperAdmin access granted', {
                userId,
                path: req.path
            });
            return next();
        }

        // Only admins can access admin routes
        if (userRole !== 'admin') {
            logger.warn('[ADMIN] Access denied: User is not an admin', {
                userId,
                userRole,
                path: req.path
            });

            return res.status(403).json({
                success: false,
                message: 'Admin role required for this action'
            });
        }

        // Check if user belongs to an organization
        if (!req.user.organization) {
            logger.warn('[ADMIN] Access denied: Admin without organization', {
                userId,
                path: req.path
            });

            return res.status(400).json({
                success: false,
                message: 'Admin must belong to an organization'
            });
        }

        // Get organization and check if user is admin
        const organization = await Organization.findById(req.user.organization._id || req.user.organization);
        if (!organization) {
            logger.warn('[ADMIN] Organization not found', {
                userId,
                organizationId: req.user.organization._id || req.user.organization
            });

            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        // SIMPLIFIED: Just check if user is admin of this organization
        const isAdminOfOrg = organization.isAdmin(userId);

        if (!isAdminOfOrg) {
            logger.warn('[ADMIN] User is not an admin of this organization', {
                userId,
                organizationId: organization._id,
                path: req.path
            });

            return res.status(403).json({
                success: false,
                message: 'You are not an admin of this organization'
            });
        }

        // Attach admin info to request for use in controllers
        req.adminInfo = {
            organizationId: organization._id
        };

        const processingTime = Date.now() - startTime;
        logger.debug(`[ADMIN] Admin access granted (${processingTime}ms)`, {
            userId,
            organizationId: organization._id,
            path: req.path
        });

        next();

    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[ADMIN] Admin verification failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error during admin verification',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};

/**
 * SIMPLIFIED: Log admin action for audit trail
 * @param {string} action - Action performed
 * @param {Object} details - Additional details
 * @returns {Function} Express middleware function
 */
export const logAdminAction = (action, details = {}) => {
    return (req, res, next) => {
        // Store action info for post-processing
        req.auditLog = {
            action,
            performedBy: req.user._id,
            organizationId: req.adminInfo?.organizationId,
            timestamp: new Date(),
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            ...details
        };

        // Continue to next middleware
        next();
    };
};