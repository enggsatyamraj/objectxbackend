import crypto from 'crypto';
import logger from './logger.js';

/**
 * Generate a 6-character alphanumeric OTP
 * @returns {string} 6-character OTP (mix of letters and numbers)
 */
export const generateOTP = () => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let otp = '';

    for (let i = 0; i < 6; i++) {
        otp += characters.charAt(Math.floor(Math.random() * characters.length));
    }

    logger.debug('[OTP] Generated new OTP');
    return otp;
};

/**
 * Generate OTP hash for secure storage
 * @param {string} otp - The OTP to hash
 * @returns {string} Hashed OTP
 */
export const hashOTP = (otp) => {
    return crypto.createHash('sha256').update(otp).digest('hex');
};

/**
 * Verify OTP against stored hash
 * @param {string} otp - The OTP to verify
 * @param {string} hashedOTP - The stored hashed OTP
 * @returns {boolean} True if OTP matches
 */
export const verifyOTP = (otp, hashedOTP) => {
    const otpHash = hashOTP(otp);
    return crypto.timingSafeEqual(Buffer.from(otpHash), Buffer.from(hashedOTP));
};

/**
 * Check if OTP has expired
 * @param {Date} createdAt - When the OTP was created
 * @param {number} expiryMinutes - Expiry time in minutes (default: 10)
 * @returns {boolean} True if OTP has expired
 */
export const isOTPExpired = (createdAt, expiryMinutes = 10) => {
    const now = new Date();
    const expiryTime = new Date(createdAt.getTime() + (expiryMinutes * 60 * 1000));
    return now > expiryTime;
};

/**
 * Create OTP expiry time (10 minutes from now)
 * @returns {Date} Expiry time
 */
export const createOTPExpiry = () => {
    const expiryTime = new Date();
    expiryTime.setMinutes(expiryTime.getMinutes() + 10);
    return expiryTime;
};

/**
 * Check if user can request new OTP (rate limiting - 1 minute)
 * @param {Date} lastOTPSent - When the last OTP was sent
 * @returns {boolean} True if user can request new OTP
 */
export const canRequestNewOTP = (lastOTPSent) => {
    if (!lastOTPSent) return true;

    const timeSinceLastOTP = Date.now() - lastOTPSent.getTime();
    const oneMinute = 60 * 1000; // 1 minute in milliseconds

    return timeSinceLastOTP >= oneMinute;
};

/**
 * Get time remaining until next OTP can be requested
 * @param {Date} lastOTPSent - When the last OTP was sent
 * @returns {number} Seconds remaining (0 if can request now)
 */
export const getOTPCooldownTime = (lastOTPSent) => {
    if (!lastOTPSent) return 0;

    const timeSinceLastOTP = Date.now() - lastOTPSent.getTime();
    const oneMinute = 60 * 1000;

    if (timeSinceLastOTP >= oneMinute) return 0;

    return Math.ceil((oneMinute - timeSinceLastOTP) / 1000);
};