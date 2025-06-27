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

        // Reference to organization (replaces school)
        organization: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Organization',
            required: function () {
                return ['student', 'teacher', 'admin'].includes(this.role);
            },
        },

        // For students - reference to their section
        section: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Section',
            required: function () {
                return this.role === 'student';
            },
        },

        // For teachers - sections they teach (can teach multiple sections)
        teachingSections: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Section',
            },
        ],

        // For admins - reference to organizations they manage
        managingOrganizations: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Organization',
            },
        ],

        // User status
        isActive: {
            type: Boolean,
            default: true,
        },

        // Soft delete flag
        isDeleted: {
            type: Boolean,
            default: false,
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

        // User preferences
        preferences: {
            language: {
                type: String,
                enum: ['english', 'hindi', 'bengali', 'tamil', 'telugu', 'marathi'],
                default: 'english',
            },
            notifications: {
                email: {
                    type: Boolean,
                    default: true,
                },
                sms: {
                    type: Boolean,
                    default: false,
                },
                push: {
                    type: Boolean,
                    default: true,
                },
            },
            theme: {
                type: String,
                enum: ['light', 'dark', 'auto'],
                default: 'light',
            },
        },

        // Profile details for students
        studentDetails: {
            rollNumber: {
                type: String,
                trim: true,
                sparse: true, // Allows multiple null values
            },
            admissionDate: {
                type: Date,
            },
            parentContact: {
                fatherName: {
                    type: String,
                    trim: true,
                },
                motherName: {
                    type: String,
                    trim: true,
                },
                phone: {
                    type: String,
                    trim: true,
                },
                email: {
                    type: String,
                    trim: true,
                    lowercase: true,
                },
            },
            address: {
                street: {
                    type: String,
                    trim: true,
                },
                city: {
                    type: String,
                    trim: true,
                },
                state: {
                    type: String,
                    trim: true,
                },
                pincode: {
                    type: String,
                    trim: true,
                },
            },
        },

        // Profile details for teachers
        teacherDetails: {
            employeeId: {
                type: String,
                trim: true,
                sparse: true,
            },
            joiningDate: {
                type: Date,
            },
            qualification: {
                type: String,
                trim: true,
            },
            experience: {
                type: Number, // in years
                min: 0,
            },
            subjects: [
                {
                    type: String,
                    trim: true,
                },
            ],
            phone: {
                type: String,
                trim: true,
            },
        },

        // Last login tracking
        lastLogin: {
            type: Date,
            default: null,
        },

        // Device info (for security)
        lastLoginDevice: {
            type: String,
            default: '',
        },
    },
    {
        timestamps: true,
        indexes: [
            { email: 1 },
            { role: 1 },
            { organization: 1 },
            { section: 1 },
            { isActive: 1 },
            { isDeleted: 1 },
            { 'studentDetails.rollNumber': 1 },
            { 'teacherDetails.employeeId': 1 },
        ]
    }
);

// Index for OTP expiry cleanup
userSchema.index({ 'otp.otpExpiry': 1 }, { expireAfterSeconds: 0 });

// Virtual to get user's full name with role
userSchema.virtual('displayName').get(function () {
    const rolePrefix = {
        'student': 'Student',
        'teacher': 'Teacher',
        'admin': 'Admin',
        'superAdmin': 'Super Admin',
        'specialUser': 'User'
    };
    return `${rolePrefix[this.role]} ${this.name}`;
});

// Virtual to check if user belongs to an organization
userSchema.virtual('hasOrganization').get(function () {
    return !!this.organization;
});

// Virtual to get user identification (roll number for students, employee ID for teachers)
userSchema.virtual('identification').get(function () {
    if (this.role === 'student' && this.studentDetails?.rollNumber) {
        return this.studentDetails.rollNumber;
    }
    if (this.role === 'teacher' && this.teacherDetails?.employeeId) {
        return this.teacherDetails.employeeId;
    }
    return this.email;
});

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

// Method to check if user can access organization
userSchema.methods.canAccessOrganization = function (organizationId) {
    if (this.role === 'superAdmin') return true;
    if (this.role === 'admin' && this.managingOrganizations.includes(organizationId)) return true;
    if (this.organization && this.organization.toString() === organizationId.toString()) return true;
    return false;
};

// Method to check if user can access section
userSchema.methods.canAccessSection = function (sectionId) {
    if (this.role === 'superAdmin') return true;
    if (this.role === 'student' && this.section && this.section.toString() === sectionId.toString()) return true;
    if (this.role === 'teacher' && this.teachingSections.includes(sectionId)) return true;
    return false;
};

// Method to add teaching section for teachers
userSchema.methods.addTeachingSection = function (sectionId) {
    if (this.role !== 'teacher') {
        throw new Error('Only teachers can have teaching sections');
    }

    if (!this.teachingSections.includes(sectionId)) {
        this.teachingSections.push(sectionId);
    }
    return this.save();
};

// Method to remove teaching section for teachers
userSchema.methods.removeTeachingSection = function (sectionId) {
    this.teachingSections = this.teachingSections.filter(id => id.toString() !== sectionId.toString());
    return this.save();
};

// Method to update last login
userSchema.methods.updateLastLogin = function (deviceInfo = '') {
    this.lastLogin = new Date();
    this.lastLoginDevice = deviceInfo;
    return this.save();
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

// Pre-save middleware to validate section assignment for students
userSchema.pre('save', async function (next) {
    if (this.role === 'student' && this.isModified('section') && this.section) {
        const Section = mongoose.model('Section');
        const section = await Section.findById(this.section);

        if (!section) {
            return next(new Error('Section not found'));
        }

        if (section.organization.toString() !== this.organization.toString()) {
            return next(new Error('Student section must belong to the same organization'));
        }
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

// Static method to find users by organization
userSchema.statics.findByOrganization = function (organizationId, role = null) {
    const query = {
        organization: organizationId,
        isDeleted: false
    };

    if (role) {
        query.role = role;
    }

    return this.find(query);
};

// Static method to find users by section
userSchema.statics.findBySection = function (sectionId) {
    return this.find({
        section: sectionId,
        role: 'student',
        isDeleted: false
    });
};

// Static method to find active users
userSchema.statics.findActive = function () {
    return this.find({
        isActive: true,
        isDeleted: false
    });
};

// Static method to soft delete user
userSchema.statics.softDelete = function (id) {
    return this.findByIdAndUpdate(id, {
        isDeleted: true,
        isActive: false
    });
};

// Static method to restore deleted user
userSchema.statics.restore = function (id) {
    return this.findByIdAndUpdate(id, {
        isDeleted: false,
        isActive: true
    });
};

const User = mongoose.model('User', userSchema);
export default User;