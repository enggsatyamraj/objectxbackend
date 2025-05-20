import mongoose from 'mongoose';

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
    },
    {
        timestamps: true,
    }
);

const User = mongoose.model('User', userSchema);
export default User;