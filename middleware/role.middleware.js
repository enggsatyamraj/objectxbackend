// File: middleware/role.middleware.js

import logger from '../utils/logger.js';
import Organization from '../models/organization.model.js';

/**
 * Role hierarchy for permission checking
 * Higher numbers have more permissions
 */
const ROLE_HIERARCHY = {
    student: 1,
    teacher: 2,
    admin: 3,
    superAdmin: 4,
    specialUser: 1 // Same level as student
};

/**
 * Authorize roles middleware - Check if user has required role
 * @param {Array<string>} allowedRoles - Array of roles that can access this route
 * @returns {Function} Express middleware function
 */
export const authorizeRoles = (allowedRoles) => {
    return async (req, res, next) => {
        const startTime = Date.now();

        try {
            // Check if user is authenticated (should be set by protect middleware)
            if (!req.user) {
                logger.warn('[ROLE] Authorization failed: No authenticated user', {
                    path: req.path,
                    method: req.method
                });

                return res.status(401).json({
                    success: false,
                    message: 'Authentication required to access this resource'
                });
            }

            const userRole = req.user.role;
            const userId = req.user._id;

            // Check if user role is in allowed roles
            if (!allowedRoles.includes(userRole)) {
                logger.warn('[ROLE] Access denied: Insufficient permissions', {
                    userId,
                    userRole,
                    allowedRoles,
                    path: req.path,
                    method: req.method
                });

                return res.status(403).json({
                    success: false,
                    message: `Access denied. Required roles: ${allowedRoles.join(', ')}. Your role: ${userRole}`
                });
            }

            const processingTime = Date.now() - startTime;
            logger.debug(`[ROLE] Role authorization successful (${processingTime}ms)`, {
                userId,
                userRole,
                allowedRoles,
                path: req.path
            });

            next();

        } catch (error) {
            const processingTime = Date.now() - startTime;
            logger.error(`[ROLE] Role authorization failed (${processingTime}ms):`, error);

            return res.status(500).json({
                success: false,
                message: 'Server error during role authorization',
                error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
            });
        }
    };
};

/**
 * Authorize minimum role level - Check if user has at least the minimum role level
 * @param {string} minRole - Minimum required role level
 * @returns {Function} Express middleware function
 */
export const authorizeMinRole = (minRole) => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required'
                });
            }

            const userRoleLevel = ROLE_HIERARCHY[req.user.role] || 0;
            const minRoleLevel = ROLE_HIERARCHY[minRole] || 0;

            if (userRoleLevel < minRoleLevel) {
                logger.warn('[ROLE] Access denied: Role level insufficient', {
                    userId: req.user._id,
                    userRole: req.user.role,
                    userLevel: userRoleLevel,
                    minRole,
                    minLevel: minRoleLevel
                });

                return res.status(403).json({
                    success: false,
                    message: `Access denied. Minimum role required: ${minRole}. Your role: ${req.user.role}`
                });
            }

            next();

        } catch (error) {
            logger.error('[ROLE] Minimum role authorization failed:', error);
            return res.status(500).json({
                success: false,
                message: 'Server error during role authorization'
            });
        }
    };
};

/**
 * Authorize organization access - Check if user belongs to the organization
 * @param {string} paramName - Name of the parameter containing organization ID (default: 'organizationId')
 * @returns {Function} Express middleware function
 */
export const authorizeOrganizationAccess = (paramName = 'organizationId') => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required'
                });
            }

            // SuperAdmin can access any organization
            if (req.user.role === 'superAdmin') {
                return next();
            }

            const organizationId = req.params[paramName] || req.body[paramName];

            if (!organizationId) {
                return res.status(400).json({
                    success: false,
                    message: 'Organization ID is required'
                });
            }

            // Check if user belongs to this organization
            const hasAccess = req.user.canAccessOrganization(organizationId);

            if (!hasAccess) {
                logger.warn('[ROLE] Organization access denied', {
                    userId: req.user._id,
                    userRole: req.user.role,
                    requestedOrgId: organizationId,
                    userOrgId: req.user.organization?._id
                });

                return res.status(403).json({
                    success: false,
                    message: 'Access denied. You do not have permission to access this organization.'
                });
            }

            next();

        } catch (error) {
            logger.error('[ROLE] Organization authorization failed:', error);
            return res.status(500).json({
                success: false,
                message: 'Server error during organization authorization'
            });
        }
    };
};

/**
 * Authorize admin permissions - Check specific admin permissions within organization
 * @param {Array<string>} requiredPermissions - Array of permissions required
 * @returns {Function} Express middleware function
 */
export const authorizeAdminPermissions = (requiredPermissions) => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required'
                });
            }

            // SuperAdmin has all permissions
            if (req.user.role === 'superAdmin') {
                return next();
            }

            // Only admins can have specific permissions
            if (req.user.role !== 'admin') {
                return res.status(403).json({
                    success: false,
                    message: 'Admin role required for this action'
                });
            }

            // Check if user belongs to an organization
            if (!req.user.organization) {
                return res.status(400).json({
                    success: false,
                    message: 'Admin must belong to an organization'
                });
            }

            // Get organization and check admin permissions
            const organization = await Organization.findById(req.user.organization._id);
            if (!organization) {
                return res.status(404).json({
                    success: false,
                    message: 'Organization not found'
                });
            }

            const adminPermissions = organization.getAdminPermissions(req.user._id);
            if (!adminPermissions) {
                return res.status(403).json({
                    success: false,
                    message: 'You are not an admin of this organization'
                });
            }

            // Check each required permission
            const missingPermissions = requiredPermissions.filter(permission =>
                !adminPermissions[permission]
            );

            if (missingPermissions.length > 0) {
                logger.warn('[ROLE] Admin permission denied', {
                    userId: req.user._id,
                    organizationId: organization._id,
                    requiredPermissions,
                    missingPermissions,
                    userPermissions: adminPermissions
                });

                return res.status(403).json({
                    success: false,
                    message: `Access denied. Missing permissions: ${missingPermissions.join(', ')}`
                });
            }

            // Attach admin permissions to request for use in controllers
            req.adminPermissions = adminPermissions;

            next();

        } catch (error) {
            logger.error('[ROLE] Admin permission authorization failed:', error);
            return res.status(500).json({
                success: false,
                message: 'Server error during permission authorization'
            });
        }
    };
};

/**
 * Authorize resource owner - Check if user owns or can access specific resource
 * @param {string} resourceModel - Model name for the resource
 * @param {string} paramName - Parameter name containing resource ID
 * @param {string} ownerField - Field name that contains the owner ID (default: 'createdBy')
 * @returns {Function} Express middleware function
 */
export const authorizeResourceOwner = (resourceModel, paramName = 'id', ownerField = 'createdBy') => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required'
                });
            }

            // SuperAdmin can access any resource
            if (req.user.role === 'superAdmin') {
                return next();
            }

            const resourceId = req.params[paramName];
            if (!resourceId) {
                return res.status(400).json({
                    success: false,
                    message: 'Resource ID is required'
                });
            }

            // Dynamically import the model
            const Model = await import(`../models/${resourceModel.toLowerCase()}.model.js`);
            const resource = await Model.default.findById(resourceId);

            if (!resource) {
                return res.status(404).json({
                    success: false,
                    message: `${resourceModel} not found`
                });
            }

            // Check ownership
            const ownerId = resource[ownerField];
            if (ownerId && ownerId.toString() !== req.user._id.toString()) {
                logger.warn('[ROLE] Resource access denied: Not owner', {
                    userId: req.user._id,
                    resourceId,
                    ownerId,
                    resourceModel
                });

                return res.status(403).json({
                    success: false,
                    message: 'Access denied. You do not own this resource.'
                });
            }

            next();

        } catch (error) {
            logger.error('[ROLE] Resource owner authorization failed:', error);
            return res.status(500).json({
                success: false,
                message: 'Server error during resource authorization'
            });
        }
    };
};

/**
 * Check if user is organization primary admin
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
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

        const organization = await Organization.findById(req.user.organization._id);
        const adminRecord = organization.admins.find(a => a.user.toString() === req.user._id.toString());

        if (!adminRecord || adminRecord.role !== 'primary_admin') {
            return res.status(403).json({
                success: false,
                message: 'Primary admin role required for this action'
            });
        }

        next();

    } catch (error) {
        logger.error('[ROLE] Primary admin check failed:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error during admin verification'
        });
    }
};