import mongoose from "mongoose";

const courseSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: [true, 'Course title is required'],
            trim: true,
        },

        description: {
            type: String,
            default: '',
            trim: true,
        },

        class: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Class',
            required: [true, 'Class reference is required'],
        },

        school: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'School',
            required: [true, 'School reference is required'],
        },

        // Changed from single teacher to array of teachers
        teachers: [
            {
                teacher: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'User', // must have role: teacher
                    required: true,
                },
                role: {
                    type: String,
                    enum: ['primary', 'assistant', 'guest', 'substitute'],
                    default: 'primary',
                },
                isPrimary: {
                    type: Boolean,
                    default: false,
                }
            }
        ],

        students: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
            },
        ],
    },
    {
        timestamps: true,
        indexes: [
            { school: 1 },
            { class: 1 },
            { 'teachers.teacher': 1 },
        ]
    }
);

// Ensure at least one teacher is assigned
courseSchema.path('teachers').validate(function (teachers) {
    return teachers && teachers.length > 0;
}, 'Course must have at least one teacher');

// Ensure only one primary teacher
courseSchema.pre('save', function (next) {
    const primaryTeachers = this.teachers.filter(t => t.isPrimary);

    if (primaryTeachers.length > 1) {
        return next(new Error('Course can have only one primary teacher'));
    }

    // If no primary teacher is set and there are teachers, make the first one primary
    if (primaryTeachers.length === 0 && this.teachers.length > 0) {
        this.teachers[0].isPrimary = true;
        this.teachers[0].role = 'primary';
    }

    next();
});

// Pre-save middleware to validate teachers
courseSchema.pre('save', async function (next) {
    if (this.isModified('teachers') && this.teachers.length > 0) {
        const User = mongoose.model('User');
        const teacherIds = this.teachers.map(t => t.teacher);

        const teachers = await User.find({
            _id: { $in: teacherIds },
            role: 'teacher',
            school: this.school
        });

        if (teachers.length !== teacherIds.length) {
            return next(new Error('All assigned users must be valid teachers from the same school'));
        }
    }
    next();
});

// Virtual to get primary teacher
courseSchema.virtual('primaryTeacher').get(function () {
    const primary = this.teachers.find(t => t.isPrimary);
    return primary ? primary.teacher : (this.teachers.length > 0 ? this.teachers[0].teacher : null);
});

const Course = mongoose.model('Course', courseSchema);
export default Course;