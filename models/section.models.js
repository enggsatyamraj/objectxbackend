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

        class: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Class',
            required: [true, 'Class reference is required'],
        },

        teacher: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'Section teacher is required'],
        },

        school: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'School',
            required: [true, 'School reference is required'],
        },

        students: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
                validate: {
                    validator: function (students) {
                        return students.length <= 40;
                    },
                    message: 'Section cannot have more than 40 students'
                }
            },
        ],
    },
    {
        timestamps: true,
        // Compound index to ensure unique section names within a class
        indexes: [
            { class: 1, name: 1 }, // Unique combination
            { school: 1 },
            { teacher: 1 },
        ]
    }
);

// Compound unique index to prevent duplicate section names in same class
sectionSchema.index({ class: 1, name: 1 }, { unique: true });

// Virtual to get full section name (like "10-A")
sectionSchema.virtual('fullName').get(function () {
    if (this.populated('class') && this.class.name) {
        return `${this.class.name}-${this.name}`;
    }
    return this.name;
});

// Pre-save middleware to validate teacher role
sectionSchema.pre('save', async function (next) {
    if (this.isModified('teacher')) {
        const User = mongoose.model('User');
        const teacher = await User.findById(this.teacher);

        if (!teacher) {
            return next(new Error('Teacher not found'));
        }

        if (teacher.role !== 'teacher') {
            return next(new Error('Assigned user must have teacher role'));
        }

        if (teacher.school.toString() !== this.school.toString()) {
            return next(new Error('Teacher must belong to the same school as the section'));
        }
    }
    next();
});

// Pre-save middleware to validate students
sectionSchema.pre('save', async function (next) {
    if (this.isModified('students') && this.students.length > 0) {
        const User = mongoose.model('User');
        const students = await User.find({
            _id: { $in: this.students },
            role: 'student',
            school: this.school
        });

        if (students.length !== this.students.length) {
            return next(new Error('All students must be valid student users from the same school'));
        }
    }
    next();
});

const Section = mongoose.model('Section', sectionSchema);
export default Section;