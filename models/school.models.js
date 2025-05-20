import mongoose from "mongoose";

const schoolSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'School name is required'],
            trim: true,
        },

        email: {
            type: String,
            required: [true, 'School email is required'],
            unique: true,
            lowercase: true,
        },

        phone: {
            type: String,
            default: '',
        },

        address: {
            type: String,
            default: '',
        },

        website: {
            type: String,
            default: '',
        },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },

        students: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
            },
        ],

        teachers: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
            },
        ],

        classes: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Class',
            },
        ],
    },
    { timestamps: true }
);

const School = mongoose.model('School', schoolSchema);
export default School;
