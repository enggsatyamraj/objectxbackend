import mongoose from "mongoose";

const schoolSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'School name is required'],
            trim: true,
        },

        // Changed back to single email
        email: {
            type: String,
            required: [true, 'Email is required'],
            lowercase: true,
            trim: true,
            match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
            unique: true,
        },

        // Changed back to single phone
        phone: {
            type: String,
            default: '',
            trim: true,
        },

        // Changed back to single website
        website: {
            type: String,
            default: '',
            trim: true,
            match: [/^https?:\/\/.+/, 'Please provide a valid website URL'],
        },

        address: {
            type: String,
            default: '',
            trim: true,
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
    {
        timestamps: true,
        indexes: [
            { email: 1 },
            { phone: 1 },
            { name: 1 },
        ]
    }
);

const School = mongoose.model('School', schoolSchema);
export default School;