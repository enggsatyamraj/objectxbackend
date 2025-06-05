import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import logger from './logger.js';
import { EMAIL_TEMPLATES } from './emailTemplates.js';

dotenv.config();

/**
 * Email service configuration
 */
let transporter = null;

// Initialize email transporter
const initializeEmailService = () => {
    try {
        // Configure Gmail transporter (using your working config)
        transporter = nodemailer.createTransport({
            service: 'gmail',
            secure: true,
            port: 465,
            auth: {
                user: process.env.MAIL_USER || process.env.EMAIL_USER,
                pass: process.env.MAIL_PASSWORD || process.env.EMAIL_PASSWORD
            }
        });

        logger.info('[EMAIL] Email service initialized successfully');
    } catch (error) {
        logger.error('[EMAIL] Failed to initialize email service:', error);
    }
};

/**
 * Send email using template
 * @param {string} to - Recipient email address
 * @param {string} templateType - Email template type from EmailType
 * @param {object} templateData - Data to populate the template
 * @returns {Promise<boolean>} Success status
 */
export const sendEmail = async (to, templateType, templateData) => {
    const startTime = Date.now();

    try {
        // Initialize transporter if not already done
        if (!transporter) {
            initializeEmailService();
        }

        if (!transporter) {
            throw new Error('Email transporter not initialized');
        }

        // Get email template
        const template = EMAIL_TEMPLATES(templateData, templateType);

        if (!template) {
            throw new Error(`Email template not found for type: ${templateType}`);
        }

        // Email options (using your working format)
        const mailOptions = {
            from: `"ObjectX Innovatech" <${process.env.MAIL_USER || process.env.EMAIL_USER}>`,
            to: to,
            subject: template.subject,
            text: template.subject, // Fallback text
            html: template.html
        };

        // Send email
        logger.info(`[EMAIL] Sending ${templateType} email to ${to}`);
        const info = await transporter.sendMail(mailOptions);

        const processingTime = Date.now() - startTime;
        logger.info(`[EMAIL] Email sent successfully (${processingTime}ms)`, {
            templateType,
            recipient: to,
            messageId: info.messageId
        });

        console.log('Email sent: ', info.messageId);
        console.log("Email to: ", to);

        return true;
    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[EMAIL] Failed to send email (${processingTime}ms):`, {
            templateType,
            recipient: to,
            error: error.message
        });
        console.error('Error sending email:', error);
        return false;
    }
};

/**
 * Send OTP verification email
 * @param {string} email - Recipient email
 * @param {string} name - Recipient name
 * @param {string} otp - OTP code
 * @returns {Promise<boolean>} Success status
 */
export const sendOTPEmail = async (email, name, otp) => {
    return await sendEmail(email, 'VERIFY_OTP', { name, otp });
};

/**
 * Send password reset OTP email
 * @param {string} email - Recipient email
 * @param {string} name - Recipient name
 * @param {string} otp - OTP code
 * @returns {Promise<boolean>} Success status
 */
export const sendPasswordResetOTP = async (email, name, otp) => {
    return await sendEmail(email, 'RESET_PASSWORD_OTP', { name, otp });
};

/**
 * Send welcome email after successful verification
 * @param {string} email - Recipient email
 * @param {string} name - Recipient name
 * @param {string} dashboardUrl - Dashboard URL (optional)
 * @returns {Promise<boolean>} Success status
 */
export const sendWelcomeEmail = async (email, name, dashboardUrl = null) => {
    return await sendEmail(email, 'WELCOME', { name, dashboardUrl });
};

/**
 * Send password changed confirmation email
 * @param {string} email - Recipient email
 * @param {string} name - Recipient name
 * @returns {Promise<boolean>} Success status
 */
export const sendPasswordChangedEmail = async (email, name) => {
    return await sendEmail(email, 'PASSWORD_CHANGED', { name });
};

// Initialize email service when module is imported
initializeEmailService();