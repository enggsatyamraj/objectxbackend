import mongoose from 'mongoose';
import { z } from 'zod';

// User Registration Schema
export const registerSchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters long'),
    email: z.string().email('Please provide a valid email address'),
    password: z
        .string()
        .min(8, 'Password must be at least 8 characters long')
        .regex(
            /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
            'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
        ),
    role: z
        .enum(['superAdmin', 'admin', 'teacher', 'student', 'specialUser'], {
            errorMap: () => ({ message: 'Invalid role selected' }),
        })
        .optional()
        .default('student'),
    school: z.string().optional(),
});

// User Login Schema
export const loginSchema = z.object({
    email: z.string().email('Please provide a valid email address'),
    password: z.string().min(1, 'Password is required'),
});

// Profile Update Schema
export const profileUpdateSchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters long').optional(),
    avatar: z.string().url('Avatar must be a valid URL').optional(),
    bio: z.string().max(500, 'Bio cannot exceed 500 characters').optional(),
});

// Password Change Schema
export const passwordChangeSchema = z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
        .string()
        .min(8, 'New password must be at least 8 characters long')
        .regex(
            /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
            'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
        ),
    confirmPassword: z.string().min(1, 'Please confirm your new password'),
}).refine(data => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
});

// School Schema
export const schoolSchema = z.object({
    name: z.string().min(2, 'School name must be at least 2 characters long'),
    email: z.string().email('Please provide a valid email address'),
    phone: z.string().optional(),
    address: z.string().optional(),
    website: z.string().url('Website must be a valid URL').optional().or(z.literal('')),
});

// School Update Schema
export const schoolUpdateSchema = z.object({
    name: z.string().min(2, 'School name must be at least 2 characters long').optional(),
    email: z.string().email('Please provide a valid email address').optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
    website: z.string().url('Website must be a valid URL').optional().or(z.literal('')),
});

// ID Schema for validation
export const idSchema = z.object({
    id: z.string().refine(val => mongoose.Types.ObjectId.isValid(val), {
        message: 'Invalid ID format'
    })
});

// Schema for adding a teacher to a school
export const addTeacherSchema = z.object({
    teacherId: z.string().refine(val => mongoose.Types.ObjectId.isValid(val), {
        message: 'Invalid teacher ID format'
    })
});

// Schema for adding a student to a school
export const addStudentSchema = z.object({
    studentId: z.string().refine(val => mongoose.Types.ObjectId.isValid(val), {
        message: 'Invalid student ID format'
    })
});

// Error formatter for Zod validation errors
export const formatZodError = error => {
    const formattedErrors = {};
    error.errors.forEach(err => {
        formattedErrors[err.path.join('.')] = err.message;
    });
    return {
        success: false,
        message: 'Validation failed',
        errors: formattedErrors,
    };
};

// Middleware for Zod validation
export const validateRequest = schema => (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
        return res.status(400).json(formatZodError(result.error));
    }
    req.validatedData = result.data;
    next();
};