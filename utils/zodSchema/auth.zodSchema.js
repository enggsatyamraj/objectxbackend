import { z } from 'zod';

// User Registration Schema
export const registerSchema = z.object({
    user: z.object({
        name: z.string({ required_error: "Name is required" })
            .min(2, 'Name must be at least 2 characters long')
            .trim(),

        email: z.string({ required_error: "Email is required" })
            .email('Please provide a valid email address')
            .trim()
            .toLowerCase(),

        password: z.string({ required_error: "Password is required" })
            .min(8, 'Password must be at least 8 characters long')
            .regex(
                /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
                'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
            ),

        role: z.enum(['superAdmin', 'admin', 'teacher', 'student', 'specialUser'], {
            errorMap: () => ({ message: 'Invalid role selected' }),
        })
            .optional()
            .default('student'),

        school: z.string()
            .optional(),
    })
});

// User Login Schema
export const loginSchema = z.object({
    user: z.object({
        email: z.string({ required_error: "Email is required" })
            .email('Please provide a valid email address')
            .trim()
            .toLowerCase(),

        password: z.string({ required_error: "Password is required" })
            .min(1, 'Password is required'),
    })
});

// Profile Update Schema
export const profileUpdateSchema = z.object({
    user: z.object({
        name: z.string()
            .min(2, 'Name must be at least 2 characters long')
            .trim()
            .optional(),

        avatar: z.string()
            .url('Avatar must be a valid URL')
            .optional(),

        bio: z.string()
            .max(500, 'Bio cannot exceed 500 characters')
            .optional(),
    })
});

// Password Change Schema
export const passwordChangeSchema = z.object({
    passwords: z.object({
        currentPassword: z.string({ required_error: "Current password is required" })
            .min(1, 'Current password is required'),

        newPassword: z.string({ required_error: "New password is required" })
            .min(8, 'New password must be at least 8 characters long')
            .regex(
                /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
                'New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
            ),

        confirmPassword: z.string({ required_error: "Confirm password is required" })
            .min(1, 'Please confirm your new password'),
    }).refine(data => data.newPassword === data.confirmPassword, {
        message: 'Passwords do not match',
        path: ['confirmPassword'],
    })
});