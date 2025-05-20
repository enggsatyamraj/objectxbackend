import { ZodSchema } from 'zod';
import logger from '../logger.js';

/**
 * Custom middleware for validating request data using Zod schemas
 * @param {ZodSchema} schema - The Zod schema to validate against
 * @param {string} type - The request property to validate ('body', 'query', or 'params')
 * @returns {Function} Express middleware function
 */
export const zodValidator = (schema, type = 'body') => async (req, res, next) => {
    try {
        // Parse and validate the request data
        const parseResult = await schema.parseAsync(req[type]);

        // Replace the request data with the validated data
        req[type] = parseResult;

        next();
    } catch (error) {
        // Extract the first error message for a cleaner error response
        const errorMessage = error.errors && error.errors.length > 0
            ? error.errors[0].message
            : 'Validation failed';

        // Log the validation error with details
        try {
            // Try to use the logger if available
            logger.warn(`[VALIDATION] ${type} validation failed: ${errorMessage}`, {
                path: req.path,
                errors: error.errors
            });
        } catch (logError) {
            // Fallback to console.warn if logger not available
            console.warn(`[VALIDATION] ${type} validation failed: ${errorMessage}`);
        }

        // Send a clean error response
        return res.status(400).json({
            success: false,
            message: errorMessage
        });
    }
};