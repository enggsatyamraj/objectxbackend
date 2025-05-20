import mongoose from "mongoose";

const courseSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: [true, 'Course title is required'],
        },

        description: {
            type: String,
            default: '',
        },

        class: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Class',
            required: true,
        },

        school: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'School',
            required: true,
        },

        teacher: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User', // must have role: teacher
            required: true,
        },

        students: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
            },
        ],
    },
    { timestamps: true }
);

const Course = mongoose.model('Course', courseSchema);
export default Course;
