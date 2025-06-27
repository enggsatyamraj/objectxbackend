// File: utils/generatePassword.js

import crypto from 'crypto';
import logger from './logger.js';

/**
 * Generate a secure random password with specified requirements
 * @param {number} length - Password length (default: 8, min: 8, max: 20)
 * @param {object} options - Password generation options
 * @returns {string} Generated password
 */
export const generatePassword = (length = 8, options = {}) => {
    // Validate length
    if (length < 8) {
        logger.warn('[PASSWORD] Password length too short, using minimum of 8');
        length = 8;
    }
    if (length > 20) {
        logger.warn('[PASSWORD] Password length too long, using maximum of 20');
        length = 20;
    }

    // Default options
    const defaultOptions = {
        includeUppercase: true,
        includeLowercase: true,
        includeNumbers: true,
        includeSpecialChars: true,
        excludeAmbiguous: true, // Exclude 0, O, l, I, etc.
        minUppercase: 1,
        minLowercase: 1,
        minNumbers: 1,
        minSpecialChars: 1
    };

    const config = { ...defaultOptions, ...options };

    // Character sets
    const uppercase = config.excludeAmbiguous
        ? 'ABCDEFGHJKMNPQRSTUVWXYZ'
        : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

    const lowercase = config.excludeAmbiguous
        ? 'abcdefghijkmnpqrstuvwxyz'
        : 'abcdefghijklmnopqrstuvwxyz';

    const numbers = config.excludeAmbiguous
        ? '23456789'
        : '0123456789';

    const specialChars = config.excludeAmbiguous
        ? '!@#$%^&*()_+-=[]{}|;:,.<>?'
        : '!@#$%^&*()_+-=[]{}|;:,.<>?';

    let charset = '';
    let password = '';
    let requiredChars = [];

    // Build charset and ensure minimum requirements
    if (config.includeUppercase) {
        charset += uppercase;
        for (let i = 0; i < config.minUppercase; i++) {
            requiredChars.push(uppercase[Math.floor(Math.random() * uppercase.length)]);
        }
    }

    if (config.includeLowercase) {
        charset += lowercase;
        for (let i = 0; i < config.minLowercase; i++) {
            requiredChars.push(lowercase[Math.floor(Math.random() * lowercase.length)]);
        }
    }

    if (config.includeNumbers) {
        charset += numbers;
        for (let i = 0; i < config.minNumbers; i++) {
            requiredChars.push(numbers[Math.floor(Math.random() * numbers.length)]);
        }
    }

    if (config.includeSpecialChars) {
        charset += specialChars;
        for (let i = 0; i < config.minSpecialChars; i++) {
            requiredChars.push(specialChars[Math.floor(Math.random() * specialChars.length)]);
        }
    }

    // Add required characters to password
    password += requiredChars.join('');

    // Fill remaining length with random characters from charset
    const remainingLength = length - password.length;
    for (let i = 0; i < remainingLength; i++) {
        password += charset[Math.floor(Math.random() * charset.length)];
    }

    // Shuffle the password to randomize position of required characters
    password = password.split('').sort(() => Math.random() - 0.5).join('');

    logger.debug('[PASSWORD] Generated secure password', {
        length: password.length,
        hasUppercase: /[A-Z]/.test(password),
        hasLowercase: /[a-z]/.test(password),
        hasNumbers: /[0-9]/.test(password),
        hasSpecialChars: /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)
    });

    return password;
};

/**
 * Generate a simple password for students (8 characters, easy to type)
 * @returns {string} Simple password
 */
export const generateSimplePassword = () => {
    return generatePassword(8, {
        includeSpecialChars: true,
        excludeAmbiguous: true,
        minSpecialChars: 1
    });
};

/**
 * Generate a strong password for admins/teachers (12 characters)
 * @returns {string} Strong password
 */
export const generateStrongPassword = () => {
    return generatePassword(12, {
        includeSpecialChars: true,
        excludeAmbiguous: false,
        minUppercase: 2,
        minLowercase: 2,
        minNumbers: 2,
        minSpecialChars: 2
    });
};

/**
 * Generate a temporary password (shorter, for OTP-like usage)
 * @returns {string} Temporary password
 */
export const generateTempPassword = () => {
    return generatePassword(6, {
        includeSpecialChars: false,
        excludeAmbiguous: true,
        minUppercase: 1,
        minLowercase: 1,
        minNumbers: 1,
        minSpecialChars: 0
    });
};

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {object} Validation result with score and feedback
 */
export const validatePasswordStrength = (password) => {
    let score = 0;
    const feedback = [];

    // Length check
    if (password.length >= 8) score += 1;
    else feedback.push('Password should be at least 8 characters long');

    if (password.length >= 12) score += 1;

    // Character type checks
    if (/[A-Z]/.test(password)) score += 1;
    else feedback.push('Password should contain uppercase letters');

    if (/[a-z]/.test(password)) score += 1;
    else feedback.push('Password should contain lowercase letters');

    if (/[0-9]/.test(password)) score += 1;
    else feedback.push('Password should contain numbers');

    if (/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) score += 1;
    else feedback.push('Password should contain special characters');

    // Common patterns check
    if (!/(.)\1{2,}/.test(password)) score += 1;
    else feedback.push('Password should not contain repeated characters');

    const strength = score >= 6 ? 'Strong' : score >= 4 ? 'Medium' : 'Weak';

    return {
        score,
        maxScore: 7,
        strength,
        isValid: score >= 4,
        feedback
    };
};