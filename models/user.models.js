import mongoose from 'mongoose';
import crypto from 'crypto';
import { hashOTP } from '../utils/otp.js';

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Name is required'],
            trim: true,
        },

        email: {
            type: String,
            required: [true, 'Email is required'],
            unique: true,
            lowercase: true,
            trim: true,
        },

        password: {
            type: String,
            required: [true, 'Password is required'],
        },

        role: {
            type: String,
            enum: ['superAdmin', 'admin', 'teacher', 'student', 'specialUser'],
            required: true,
            default: 'student',
        },

        avatar: {
            type: String,
            default: '',
        },

        bio: {
            type: String,
            default: '',
        },

        isVerified: {
            type: Boolean,
            default: false,
        },

        school: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'School',
            required: function () {
                return ['student', 'teacher'].includes(this.role);
            },
        },

        // OTP-related fields
        otp: {
            hashedOTP: {
                type: String,
                default: null,
            },
            otpExpiry: {
                type: Date,
                default: null,
            },
            otpType: {
                type: String,
                enum: ['email_verification', 'password_reset'],
                default: null,
            },
            otpAttempts: {
                type: Number,
                default: 0,
                max: 5, // Maximum 5 attempts
            },
            lastOTPSent: {
                type: Date,
                default: null,
            }
        },

        // Password reset fields
        passwordResetAttempts: {
            type: Number,
            default: 0,
        },

        lastPasswordReset: {
            type: Date,
            default: null,
        },

        // Account security
        loginAttempts: {
            type: Number,
            default: 0,
        },

        lockUntil: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

// Index for OTP expiry cleanup
userSchema.index({ 'otp.otpExpiry': 1 }, { expireAfterSeconds: 0 });

// Method to set OTP with automatic expiry (10 minutes)
userSchema.methods.setOTP = function (plainOTP, type = 'email_verification') {
    const expiryTime = new Date();
    expiryTime.setMinutes(expiryTime.getMinutes() + 10); // 10 minutes from now

    this.otp = {
        hashedOTP: hashOTP(plainOTP),
        otpExpiry: expiryTime,
        otpType: type,
        otpAttempts: 0,
        lastOTPSent: new Date()
    };

    return this;
};

// Method to verify OTP
userSchema.methods.verifyOTP = function (plainOTP, type = 'email_verification') {
    // Check if OTP exists and matches type
    if (!this.otp.hashedOTP || this.otp.otpType !== type) {
        return { success: false, message: 'Invalid OTP request' };
    }

    // Check if OTP has expired
    if (new Date() > this.otp.otpExpiry) {
        return { success: false, message: 'OTP has expired' };
    }

    // Check attempts limit
    if (this.otp.otpAttempts >= 5) {
        return { success: false, message: 'Too many attempts. Please request a new OTP' };
    }

    // Verify OTP using crypto (ES6 import)
    const hashedInput = crypto.createHash('sha256').update(plainOTP).digest('hex');
    const isValid = crypto.timingSafeEqual(
        Buffer.from(hashedInput),
        Buffer.from(this.otp.hashedOTP)
    );

    if (!isValid) {
        this.otp.otpAttempts += 1;
        return { success: false, message: 'Invalid OTP' };
    }

    return { success: true, message: 'OTP verified successfully' };
};

// Method to clear OTP after successful verification
userSchema.methods.clearOTP = function () {
    this.otp = {
        hashedOTP: null,
        otpExpiry: null,
        otpType: null,
        otpAttempts: 0,
        lastOTPSent: null
    };
    return this;
};

// Method to check if user can request new OTP (rate limiting)
userSchema.methods.canRequestNewOTP = function () {
    if (!this.otp.lastOTPSent) return true;

    const timeSinceLastOTP = Date.now() - this.otp.lastOTPSent.getTime();
    const oneMinute = 60 * 1000; // 1 minute in milliseconds

    return timeSinceLastOTP >= oneMinute;
};

// Virtual to check if OTP is expired
userSchema.virtual('isOTPExpired').get(function () {
    if (!this.otp.otpExpiry) return true;
    return new Date() > this.otp.otpExpiry;
});

// Virtual to get time remaining for OTP
userSchema.virtual('otpTimeRemaining').get(function () {
    if (!this.otp.otpExpiry || this.isOTPExpired) return 0;
    return Math.max(0, this.otp.otpExpiry.getTime() - Date.now());
});

// Pre-save middleware to handle OTP cleanup on verification
userSchema.pre('save', function (next) {
    // If user is being verified, clear OTP
    if (this.isModified('isVerified') && this.isVerified) {
        this.clearOTP();
    }
    next();
});

// Static method to clean expired OTPs
userSchema.statics.cleanExpiredOTPs = async function () {
    const result = await this.updateMany(
        { 'otp.otpExpiry': { $lt: new Date() } },
        {
            $set: {
                'otp.hashedOTP': null,
                'otp.otpExpiry': null,
                'otp.otpType': null,
                'otp.otpAttempts': 0
            }
        }
    );
    return result;
};

const User = mongoose.model('User', userSchema);
export default User;