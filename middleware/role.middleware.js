import logger from '../utils/logger.js';

/**
 * Middleware to restrict routes to specific user roles
 * @param {Array} roles Array of authorized roles
 * @returns {Function} Express middleware function
 */
export const authorizeRoles = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
            logger.warn('[AUTH] Role authorization attempted without user');
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        if (!roles.includes(req.user.role)) {
            logger.warn('[AUTH] Unauthorized role access attempt', {
                userId: req.user._id,
                userRole: req.user.role,
                requiredRoles: roles.join(', ')
            });

            return res.status(403).json({
                success: false,
                message: `Access denied. Role '${req.user.role}' is not authorized to access this resource`
            });
        }

        logger.debug('[AUTH] Role authorization successful', {
            userId: req.user._id,
            role: req.user.role
        });

        next();
    };
};