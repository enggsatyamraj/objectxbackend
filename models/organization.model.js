import mongoose from "mongoose";

const organizationSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Organization name is required'],
            trim: true,
            unique: true,
        },

        // Brand/franchise name like "DPS", "DAV", "Ryan International"
        brandName: {
            type: String,
            required: [true, 'Brand name is required'],
            trim: true,
        },

        // Organization code for easy identification (like "DPS001", "DAV002")
        organizationCode: {
            type: String,
            required: [true, 'Organization code is required'],
            unique: true,
            uppercase: true,
            trim: true,
        },

        // Contact information - Multiple emails for different purposes
        emails: [
            {
                type: {
                    type: String,
                    required: true,
                    trim: true,
                },
                email: {
                    type: String,
                    required: true,
                    lowercase: true,
                    trim: true,
                    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
                },
            },
        ],

        // Multiple phone numbers for different purposes
        phones: [
            {
                type: {
                    type: String,
                    required: true,
                    trim: true,
                },
                phone: {
                    type: String,
                    required: true,
                    trim: true,
                },
            },
        ],

        // Multiple websites
        websites: [
            {
                type: {
                    type: String,
                    required: true,
                    trim: true,
                },
                website: {
                    type: String,
                    required: true,
                    trim: true,
                    match: [/^https?:\/\/.+/, 'Please provide a valid website URL'],
                },
            },
        ],

        // Organization address
        address: {
            street: {
                type: String,
                default: '',
                trim: true,
            },
            city: {
                type: String,
                required: [true, 'City is required'],
                trim: true,
            },
            state: {
                type: String,
                required: [true, 'State is required'],
                trim: true,
            },
            country: {
                type: String,
                required: [true, 'Country is required'],
                trim: true,
                default: 'India',
            },
            pincode: {
                type: String,
                required: [true, 'Pincode is required'],
                trim: true,
            },
        },

        // Organization status
        isActive: {
            type: Boolean,
            default: true,
        },

        // Soft delete flag
        isDeleted: {
            type: Boolean,
            default: false,
        },

        // SIMPLIFIED: Just list of admin users (no roles, no permissions)
        admins: [
            {
                user: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'User',
                    required: true,
                },
                addedBy: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'User',
                },
                addedAt: {
                    type: Date,
                    default: Date.now,
                },
            },
        ],

        // Content access permissions
        contentAccess: {
            allowedSubjects: [
                {
                    type: String,
                    enum: ['mathematics', 'science', 'physics', 'chemistry', 'biology', 'english', 'history', 'geography', 'computer_science', 'all'],
                    default: 'all',
                },
            ],
            allowedGrades: [
                {
                    type: String,
                    enum: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', 'all'],
                    default: 'all',
                },
            ],
        },

        // API access for LMS integration
        apiAccess: {
            isEnabled: {
                type: Boolean,
                default: false,
            },
            allowedDomains: [
                {
                    type: String,
                    trim: true,
                },
            ],
        },

        // Who created this organization (superAdmin)
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },

        // Student enrollment settings
        studentEnrollment: {
            autoGenerateCredentials: {
                type: Boolean,
                default: true,
            },
            passwordPolicy: {
                type: String,
                enum: ['simple', 'medium', 'strong'],
                default: 'medium',
            },
            sendWelcomeEmail: {
                type: Boolean,
                default: true,
            },
            requireEmailVerification: {
                type: Boolean,
                default: false, // Since admin enrolls, verification might not be needed
            },
        },
        maxStudentsPerSection: {
            type: Number,
            default: 30,
            min: 1,
            max: 50,
        },
        allowSelfRegistration: {
            type: Boolean,
            default: false,
        },
        requireEmailVerification: {
            type: Boolean,
            default: true,
        },

        // Usage statistics (for analytics)
        stats: {
            totalStudents: {
                type: Number,
                default: 0,
            },
            totalTeachers: {
                type: Number,
                default: 0,
            },
            totalClasses: {
                type: Number,
                default: 0,
            },
            lastActiveDate: {
                type: Date,
                default: Date.now,
            },
        },
    },
    {
        timestamps: true,
    }
);

// Indexes
organizationSchema.index({ name: 1 });
organizationSchema.index({ organizationCode: 1 });
organizationSchema.index({ 'emails.email': 1 });
organizationSchema.index({ brandName: 1 });
organizationSchema.index({ isActive: 1 });
organizationSchema.index({ isDeleted: 1 });

// Ensure unique organization code
organizationSchema.index({ organizationCode: 1 }, { unique: true });

// Virtual to get full address
organizationSchema.virtual('fullAddress').get(function () {
    const addr = this.address;
    return `${addr.street ? addr.street + ', ' : ''}${addr.city}, ${addr.state}, ${addr.country} - ${addr.pincode}`;
});

// Pre-save middleware to generate organization code if not provided
organizationSchema.pre('save', function (next) {
    if (!this.organizationCode) {
        // Generate code based on brand name + random number
        const brandCode = this.brandName.substring(0, 3).toUpperCase();
        const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        this.organizationCode = `${brandCode}${randomNum}`;
    }
    next();
});

// SIMPLIFIED: Add admin to organization (no roles, no permissions)
organizationSchema.methods.addAdmin = function (userId, addedBy = null) {
    // Check if user is already an admin
    const existingAdmin = this.admins.find(admin => admin.user.toString() === userId.toString());
    if (existingAdmin) {
        throw new Error('User is already an admin of this organization');
    }

    this.admins.push({
        user: userId,
        addedBy,
    });

    return this.save();
};

// SIMPLIFIED: Remove admin from organization
organizationSchema.methods.removeAdmin = function (userId) {
    this.admins = this.admins.filter(admin => admin.user.toString() !== userId.toString());
    return this.save();
};

// SIMPLIFIED: Check if user is admin of this organization
organizationSchema.methods.isAdmin = function (userId) {
    return this.admins.some(admin => admin.user.toString() === userId.toString());
};

// SIMPLIFIED: Update organization stats (unchanged)
organizationSchema.methods.updateStats = async function () {
    const User = mongoose.model('User');
    const Class = mongoose.model('Class');

    // Count students and teachers for this organization
    const students = await User.countDocuments({
        organization: this._id,
        role: 'student'
    });

    const teachers = await User.countDocuments({
        organization: this._id,
        role: 'teacher'
    });

    const classes = await Class.countDocuments({
        organization: this._id
    });

    this.stats.totalStudents = students;
    this.stats.totalTeachers = teachers;
    this.stats.totalClasses = classes;
    this.stats.lastActiveDate = new Date();

    return this.save();
};

// Static method to find organizations by brand
organizationSchema.statics.findByBrand = function (brandName) {
    return this.find({ brandName: new RegExp(brandName, 'i') });
};

// Static method to find active organizations
organizationSchema.statics.findActive = function () {
    return this.find({
        isActive: true,
        isDeleted: false
    });
};

// Static method to soft delete organization
organizationSchema.statics.softDelete = function (id) {
    return this.findByIdAndUpdate(id, {
        isDeleted: true,
        isActive: false
    });
};

// Static method to restore deleted organization
organizationSchema.statics.restore = function (id) {
    return this.findByIdAndUpdate(id, {
        isDeleted: false,
        isActive: true
    });
};

const Organization = mongoose.model('Organization', organizationSchema);
export default Organization;