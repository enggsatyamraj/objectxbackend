// File: middleware/adminPermissions.middleware.js

import logger from '../utils/logger.js';
import Organization from '../models/organization.model.js';

/**
 * Validate admin permissions middleware
 * Checks if the admin has specific permissions within their organization
 * @param {Array<string>} requiredPermissions - Array of permissions required
 * @returns {Function} Express middleware function
 */
export const validateAdminPermissions = (requiredPermissions) => {
    return async (req, res, next) => {
        const startTime = Date.now();

        try {
            // Check if user is authenticated (should be set by protect middleware)
            if (!req.user) {
                logger.warn('[ADMIN_PERM] Authorization failed: No authenticated user', {
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
                logger.debug('[ADMIN_PERM] SuperAdmin access granted', {
                    userId,
                    path: req.path,
                    requiredPermissions
                });
                return next();
            }

            // Only admins can have specific permissions
            if (userRole !== 'admin') {
                logger.warn('[ADMIN_PERM] Access denied: User is not an admin', {
                    userId,
                    userRole,
                    path: req.path,
                    requiredPermissions
                });

                return res.status(403).json({
                    success: false,
                    message: 'Admin role required for this action'
                });
            }

            // Check if user belongs to an organization
            if (!req.user.organization) {
                logger.warn('[ADMIN_PERM] Access denied: Admin without organization', {
                    userId,
                    path: req.path
                });

                return res.status(400).json({
                    success: false,
                    message: 'Admin must belong to an organization'
                });
            }

            // Get organization and check admin permissions
            const organization = await Organization.findById(req.user.organization._id || req.user.organization);
            if (!organization) {
                logger.warn('[ADMIN_PERM] Organization not found', {
                    userId,
                    organizationId: req.user.organization._id || req.user.organization
                });

                return res.status(404).json({
                    success: false,
                    message: 'Organization not found'
                });
            }

            // Find admin record in organization
            const adminRecord = organization.admins.find(admin =>
                admin.user.toString() === userId.toString()
            );

            if (!adminRecord) {
                logger.warn('[ADMIN_PERM] User is not an admin of this organization', {
                    userId,
                    organizationId: organization._id,
                    path: req.path
                });

                return res.status(403).json({
                    success: false,
                    message: 'You are not an admin of this organization'
                });
            }

            // Get admin permissions
            const adminPermissions = adminRecord.permissions;

            // Check each required permission
            const missingPermissions = requiredPermissions.filter(permission =>
                !adminPermissions[permission]
            );

            if (missingPermissions.length > 0) {
                logger.warn('[ADMIN_PERM] Admin permission denied', {
                    userId,
                    organizationId: organization._id,
                    adminRole: adminRecord.role,
                    requiredPermissions,
                    missingPermissions,
                    userPermissions: adminPermissions,
                    path: req.path
                });

                return res.status(403).json({
                    success: false,
                    message: `Access denied. Missing permissions: ${missingPermissions.join(', ')}`,
                    requiredPermissions,
                    missingPermissions,
                    currentRole: adminRecord.role
                });
            }

            // Attach admin info to request for use in controllers
            req.adminInfo = {
                role: adminRecord.role,
                permissions: adminPermissions,
                organizationId: organization._id,
                addedAt: adminRecord.addedAt,
                addedBy: adminRecord.addedBy
            };

            const processingTime = Date.now() - startTime;
            logger.debug(`[ADMIN_PERM] Admin permission validation successful (${processingTime}ms)`, {
                userId,
                adminRole: adminRecord.role,
                requiredPermissions,
                organizationId: organization._id,
                path: req.path
            });

            next();

        } catch (error) {
            const processingTime = Date.now() - startTime;
            logger.error(`[ADMIN_PERM] Admin permission validation failed (${processingTime}ms):`, error);

            return res.status(500).json({
                success: false,
                message: 'Server error during permission validation',
                error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
            });
        }
    };
};

/**
 * Require primary admin role middleware
 * Only allows primary admins to access the route
 * @returns {Function} Express middleware function
 */
export const requirePrimaryAdmin = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // SuperAdmin can do everything
        if (req.user.role === 'superAdmin') {
            return next();
        }

        // Must be an admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Admin role required'
            });
        }

        // Check if user is primary admin
        if (!req.user.organization) {
            return res.status(400).json({
                success: false,
                message: 'Admin must belong to an organization'
            });
        }

        const organization = await Organization.findById(req.user.organization._id || req.user.organization);
        if (!organization) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        const adminRecord = organization.admins.find(a => a.user.toString() === req.user._id.toString());

        if (!adminRecord || adminRecord.role !== 'primary_admin') {
            logger.warn('[ADMIN_PERM] Primary admin access denied', {
                userId: req.user._id,
                adminRole: adminRecord?.role,
                organizationId: organization._id
            });

            return res.status(403).json({
                success: false,
                message: 'Primary admin role required for this action',
                currentRole: adminRecord?.role || 'not_admin'
            });
        }

        // Attach admin info
        req.adminInfo = {
            role: adminRecord.role,
            permissions: adminRecord.permissions,
            organizationId: organization._id
        };

        next();

    } catch (error) {
        logger.error('[ADMIN_PERM] Primary admin check failed:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error during admin verification'
        });
    }
};

/**
 * Check if admin can manage specific resource
 * @param {string} resourceType - Type of resource (student, teacher, class, etc.)
 * @returns {Function} Express middleware function
 */
export const canManageResource = (resourceType) => {
    const permissionMap = {
        'student': ['canEnrollStudents'],
        'teacher': ['canEnrollTeachers'],
        'class': ['canManageClasses'],
        'section': ['canManageClasses'],
        'admin': ['canManageAdmins'],
        'content': ['canManageContent'],
        'analytics': ['canViewAnalytics']
    };

    const requiredPermissions = permissionMap[resourceType];

    if (!requiredPermissions) {
        throw new Error(`Unknown resource type: ${resourceType}`);
    }

    return validateAdminPermissions(requiredPermissions);
};

/**
 * Log admin action for audit trail
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