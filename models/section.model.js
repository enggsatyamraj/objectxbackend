// File: models/section.model.js (Updated)

import mongoose from "mongoose";

const sectionSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Section name is required'],
            trim: true,
            uppercase: true,
            match: [/^[A-Z]$/, 'Section name must be a single letter (A-Z)']
        },

        // Reference to the class this section belongs to
        class: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Class',
            required: [true, 'Class reference is required'],
        },

        // Reference to organization for easier querying
        organization: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Organization',
            required: [true, 'Organization reference is required'],
        },

        // Section teacher - now optional, can be assigned later
        sectionTeacher: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null, // Allow null initially
            required: false // Make it optional
        },

        // Students in this section
        students: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            }
        ],

        // Section capacity
        maxStudents: {
            type: Number,
            default: 30,
            min: [1, 'Max students must be at least 1'],
            max: [50, 'Max students cannot exceed 50'],
        },

        // Section status
        isActive: {
            type: Boolean,
            default: true,
        },

        // Soft delete flag
        isDeleted: {
            type: Boolean,
            default: false,
        },

        // Academic year
        academicYear: {
            type: String,
            trim: true,
            default: function () {
                const year = new Date().getFullYear();
                return `${year}-${year + 1}`;
            }
        },

        // Section statistics
        stats: {
            currentStudentCount: {
                type: Number,
                default: 0,
            },
            availableSeats: {
                type: Number,
                default: function () {
                    return this.maxStudents || 30;
                }
            },
            lastUpdated: {
                type: Date,
                default: Date.now,
            },
        },

        // Who created this section
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
    },
    {
        timestamps: true,
        indexes: [
            { class: 1 },
            { organization: 1 },
            { sectionTeacher: 1 },
            { isActive: 1 },
            { isDeleted: 1 },
            { class: 1, name: 1 }, // Unique section names within class
        ]
    }
);

// Compound unique index to prevent duplicate section names in same class
sectionSchema.index({ class: 1, name: 1 }, { unique: true });

// Virtual to get full section name (like "10-A")
sectionSchema.virtual('fullName').get(function () {
    if (this.populated('class') && this.class.name) {
        return `${this.class.grade}-${this.name}`;
    }
    return this.name;
});

// Virtual to check if section is full
sectionSchema.virtual('isFull').get(function () {
    return this.students.length >= this.maxStudents;
});

// Virtual to get available seats
sectionSchema.virtual('availableSeats').get(function () {
    return Math.max(0, this.maxStudents - this.students.length);
});

// Virtual to get current student count
sectionSchema.virtual('currentStudentCount').get(function () {
    return this.students.length;
});

// Virtual to check if section has teacher
sectionSchema.virtual('hasTeacher').get(function () {
    return !!this.sectionTeacher;
});

// Pre-save middleware to validate section teacher (only if provided)
sectionSchema.pre('save', async function (next) {
    if (this.isModified('sectionTeacher') && this.sectionTeacher) {
        const User = mongoose.model('User');
        const teacher = await User.findById(this.sectionTeacher);

        if (!teacher) {
            return next(new Error('Section teacher not found'));
        }

        if (teacher.role !== 'teacher') {
            return next(new Error('Section teacher must have teacher role'));
        }

        if (teacher.organization && teacher.organization.toString() !== this.organization.toString()) {
            return next(new Error('Section teacher must belong to the same organization'));
        }
    }
    next();
});

// Pre-save middleware to validate students and capacity
sectionSchema.pre('save', async function (next) {
    // Validate student capacity
    if (this.isModified('students')) {
        if (this.students.length > this.maxStudents) {
            return next(new Error(`Section cannot have more than ${this.maxStudents} students. Current: ${this.students.length}`));
        }

        // Validate students if any exist
        if (this.students.length > 0) {
            const User = mongoose.model('User');
            const students = await User.find({
                _id: { $in: this.students },
                role: 'student',
                organization: this.organization,
                isDeleted: false
            });

            if (students.length !== this.students.length) {
                return next(new Error('All students must be valid student users from the same organization'));
            }
        }

        // Update stats
        this.stats.currentStudentCount = this.students.length;
        this.stats.availableSeats = Math.max(0, this.maxStudents - this.students.length);
        this.stats.lastUpdated = new Date();
    }
    next();
});

// Method to assign teacher to section
sectionSchema.methods.assignTeacher = async function (teacherId) {
    const User = mongoose.model('User');
    const teacher = await User.findById(teacherId);

    if (!teacher) {
        throw new Error('Teacher not found');
    }

    if (teacher.role !== 'teacher') {
        throw new Error('User is not a teacher');
    }

    if (teacher.organization.toString() !== this.organization.toString()) {
        throw new Error('Teacher must belong to the same organization');
    }

    this.sectionTeacher = teacherId;
    await this.save();

    // Add section to teacher's teaching sections
    await teacher.addTeachingSection(this._id);

    return this;
};

// Method to remove teacher from section
sectionSchema.methods.removeTeacher = async function () {
    if (this.sectionTeacher) {
        const User = mongoose.model('User');
        const teacher = await User.findById(this.sectionTeacher);

        if (teacher) {
            await teacher.removeTeachingSection(this._id);
        }

        this.sectionTeacher = null;
        await this.save();
    }
    return this;
};

// Method to add student to section
sectionSchema.methods.addStudent = async function (studentId) {
    // Check if section is full
    if (this.students.length >= this.maxStudents) {
        throw new Error(`Section is full. Maximum ${this.maxStudents} students allowed.`);
    }

    // Check if student is already in section
    if (this.students.some(id => id.toString() === studentId.toString())) {
        throw new Error('Student is already in this section');
    }

    // Add student to the array
    this.students.push(studentId);

    // Save the section
    return await this.save();
};

// Method to remove student from section
sectionSchema.methods.removeStudent = function (studentId) {
    this.students = this.students.filter(id => id.toString() !== studentId.toString());
    return this.save();
};

// Method to check if section can accept more students
sectionSchema.methods.canAcceptStudents = function (count = 1) {
    return (this.students.length + count) <= this.maxStudents;
};

// Method to get section details with class info
sectionSchema.methods.getFullDetails = async function () {
    await this.populate([
        { path: 'class', select: 'name grade' },
        { path: 'sectionTeacher', select: 'name email' },
        { path: 'students', select: 'name email' },
        { path: 'organization', select: 'name' }
    ]);
    return this;
};

// Method to check if user can access this section
sectionSchema.methods.canUserAccess = function (userId, userRole) {
    if (userRole === 'superAdmin') return true;
    if (userRole === 'admin') return true;
    if (userRole === 'teacher' && this.sectionTeacher && this.sectionTeacher.toString() === userId.toString()) return true;
    if (userRole === 'student' && this.students.includes(userId)) return true;

    return false;
};

// Static method to find sections by class
sectionSchema.statics.findByClass = function (classId) {
    return this.find({
        class: classId,
        isDeleted: false
    });
};

// Static method to find sections by organization
sectionSchema.statics.findByOrganization = function (organizationId) {
    return this.find({
        organization: organizationId,
        isDeleted: false
    });
};

// Static method to find sections by teacher
sectionSchema.statics.findByTeacher = function (teacherId) {
    return this.find({
        sectionTeacher: teacherId,
        isDeleted: false
    });
};

// Static method to find available sections (not full)
sectionSchema.statics.findAvailable = function (organizationId = null) {
    const pipeline = [
        { $match: { isDeleted: false, isActive: true } },
        { $addFields: { studentCount: { $size: "$students" } } },
        { $match: { $expr: { $lt: ["$studentCount", "$maxStudents"] } } }
    ];

    if (organizationId) {
        pipeline[0].$match.organization = new mongoose.Types.ObjectId(organizationId);
    }

    return this.aggregate(pipeline);
};

// Static method to find sections without teachers
sectionSchema.statics.findWithoutTeachers = function (organizationId = null) {
    const query = {
        sectionTeacher: null,
        isDeleted: false,
        isActive: true
    };

    if (organizationId) {
        query.organization = organizationId;
    }

    return this.find(query);
};

// Static method to find active sections
sectionSchema.statics.findActive = function () {
    return this.find({
        isActive: true,
        isDeleted: false
    });
};

// Static method to soft delete section
sectionSchema.statics.softDelete = function (id) {
    return this.findByIdAndUpdate(id, {
        isDeleted: true,
        isActive: false
    });
};

// Static method to restore deleted section
sectionSchema.statics.restore = function (id) {
    return this.findByIdAndUpdate(id, {
        isDeleted: false,
        isActive: true
    });
};

const Section = mongoose.model('Section', sectionSchema);
export default Section;