// File: controllers/updatePassword.controller.js

import bcrypt from 'bcryptjs';
import User from '../models/user.model.js';
import logger from '../utils/logger.js';
import { sendPasswordChangedEmail } from '../utils/emailService.js';

// PUT /update-password - Update user password
export const updatePassword = async (req, res) => {
    const startTime = Date.now();
    logger.info('[PASSWORD] Starting password update process', { userId: req.user._id });

    try {
        const { currentPassword, newPassword } = req.body;

        // Validate required fields
        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Current password and new password are required'
            });
        }

        // Find user with password
        const user = await User.findById(req.user._id);
        if (!user) {
            logger.warn('[PASSWORD] User not found during password update', { userId: req.user._id });
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Verify current password
        const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
        if (!isCurrentPasswordValid) {
            logger.warn('[PASSWORD] Invalid current password provided', { userId: user._id });
            return res.status(400).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        // Check if new password is same as current password
        const isSamePassword = await bcrypt.compare(newPassword, user.password);
        if (isSamePassword) {
            return res.status(400).json({
                success: false,
                message: 'New password must be different from current password'
            });
        }

        // Hash new password
        const hashedNewPassword = await bcrypt.hash(newPassword, 10);

        // Update password
        user.password = hashedNewPassword;
        user.lastPasswordReset = new Date();
        await user.save();

        // Send password changed confirmation email
        const emailSent = await sendPasswordChangedEmail(user.email, user.name);
        if (!emailSent) {
            logger.warn('[PASSWORD] Failed to send password changed email', { userId: user._id });
        }

        const processingTime = Date.now() - startTime;
        logger.info(`[PASSWORD] Password updated successfully (${processingTime}ms)`, {
            userId: user._id
        });

        return res.status(200).json({
            success: true,
            message: 'Password updated successfully'
        });

    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[PASSWORD] Password update failed (${processingTime}ms):`, error);

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
            message: 'Server error during password update',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};