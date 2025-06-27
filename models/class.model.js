import mongoose from "mongoose";

const classSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Class name is required'],
            trim: true,
        },

        // Grade level (1 to 12)
        grade: {
            type: Number,
            required: [true, 'Grade level is required'],
            min: [1, 'Grade must be at least 1'],
            max: [12, 'Grade cannot exceed 12'],
        },

        // Reference to organization (replaces school)
        organization: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Organization',
            required: [true, 'Organization reference is required'],
        },

        // All sections under this class (10-A, 10-B, 10-C)
        // Each section will have its own section teacher
        sections: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Section',
            },
        ],

        // Courses/subjects taught in this class
        courses: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Course',
            },
        ],

        // Class status
        isActive: {
            type: Boolean,
            default: true,
        },

        // Soft delete flag
        isDeleted: {
            type: Boolean,
            default: false,
        },

        // Academic year (optional)
        academicYear: {
            type: String,
            trim: true,
            default: function () {
                const year = new Date().getFullYear();
                return `${year}-${year + 1}`;
            }
        },

        // Class schedule/timing (optional for future)
        schedule: {
            startTime: {
                type: String,
                default: '09:00',
            },
            endTime: {
                type: String,
                default: '15:00',
            },
            workingDays: [
                {
                    type: String,
                    enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
                    default: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
                }
            ],
        },

        // Class statistics
        stats: {
            totalSections: {
                type: Number,
                default: 0,
            },
            totalStudents: {
                type: Number,
                default: 0,
            },
            lastUpdated: {
                type: Date,
                default: Date.now,
            },
        },

        // Who created this class
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
    },
    {
        timestamps: true,
        indexes: [
            { organization: 1 },
            { grade: 1 },
            { isActive: 1 },
            { isDeleted: 1 },
            { name: 1, organization: 1 }, // Unique class names within organization
        ]
    }
);

// Ensure unique class names within the same organization
classSchema.index({ name: 1, organization: 1 }, { unique: true });

// Virtual to get total students across all sections
classSchema.virtual('totalStudents').get(function () {
    if (this.populated('sections')) {
        return this.sections.reduce((total, section) => {
            return total + (section.students ? section.students.length : 0);
        }, 0);
    }
    return this.stats.totalStudents;
});

// Virtual to get total sections count
classSchema.virtual('totalSections').get(function () {
    return this.sections.length;
});

// Virtual to get class display name (like "Class 10" or "Grade 10")
classSchema.virtual('displayName').get(function () {
    return `Class ${this.grade}`;
});

// Pre-save middleware to update stats
classSchema.pre('save', function (next) {
    if (this.isModified('sections')) {
        this.stats.totalSections = this.sections.length;
        this.stats.lastUpdated = new Date();
    }
    next();
});

// Method to add section to class
classSchema.methods.addSection = function (sectionId) {
    if (!this.sections.includes(sectionId)) {
        this.sections.push(sectionId);
        this.stats.totalSections = this.sections.length;
        this.stats.lastUpdated = new Date();
    }
    return this.save();
};

// Method to remove section from class
classSchema.methods.removeSection = function (sectionId) {
    this.sections = this.sections.filter(id => id.toString() !== sectionId.toString());
    this.stats.totalSections = this.sections.length;
    this.stats.lastUpdated = new Date();
    return this.save();
};

// Method to update student count
classSchema.methods.updateStudentCount = async function () {
    const Section = mongoose.model('Section');
    const sections = await Section.find({
        _id: { $in: this.sections },
        isDeleted: false
    });

    const totalStudents = sections.reduce((total, section) => {
        return total + (section.students ? section.students.length : 0);
    }, 0);

    this.stats.totalStudents = totalStudents;
    this.stats.lastUpdated = new Date();
    return this.save();
};

// Method to check if user can access this class
classSchema.methods.canUserAccess = function (userId, userRole) {
    if (userRole === 'superAdmin') return true;
    if (userRole === 'admin') return true;

    // For teachers and students, check through sections
    return false;
};

// Static method to find classes by organization
classSchema.statics.findByOrganization = function (organizationId) {
    return this.find({
        organization: organizationId,
        isDeleted: false
    });
};

// Static method to find classes by grade
classSchema.statics.findByGrade = function (grade, organizationId = null) {
    const query = {
        grade: grade,
        isDeleted: false
    };

    if (organizationId) {
        query.organization = organizationId;
    }

    return this.find(query);
};

// Static method to find active classes
classSchema.statics.findActive = function () {
    return this.find({
        isActive: true,
        isDeleted: false
    });
};

// Static method to soft delete class
classSchema.statics.softDelete = function (id) {
    return this.findByIdAndUpdate(id, {
        isDeleted: true,
        isActive: false
    });
};

// Static method to restore deleted class
classSchema.statics.restore = function (id) {
    return this.findByIdAndUpdate(id, {
        isDeleted: false,
        isActive: true
    });
};

const Class = mongoose.model('Class', classSchema);
export default Class;