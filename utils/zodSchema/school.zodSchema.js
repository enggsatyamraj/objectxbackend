import { z } from 'zod';
import mongoose from 'mongoose';

// School Schema
export const schoolSchema = z.object({
    school: z.object({
        name: z.string({ required_error: "School name is required" })
            .min(2, 'School name must be at least 2 characters long')
            .trim(),

        email: z.string({ required_error: "Email is required" })
            .email('Please provide a valid email address')
            .trim()
            .toLowerCase(),

        phone: z.string()
            .optional(),

        address: z.string()
            .optional(),

        website: z.string()
            .url('Website must be a valid URL')
            .optional()
            .or(z.literal('')),
    })
});

// School Update Schema
export const schoolUpdateSchema = z.object({
    school: z.object({
        name: z.string()
            .min(2, 'School name must be at least 2 characters long')
            .trim()
            .optional(),

        email: z.string()
            .email('Please provide a valid email address')
            .trim()
            .toLowerCase()
            .optional(),

        phone: z.string()
            .optional(),

        address: z.string()
            .optional(),

        website: z.string()
            .url('Website must be a valid URL')
            .optional()
            .or(z.literal('')),
    })
});

// Schema for adding a teacher to a school
export const addTeacherSchema = z.object({
    teacherId: z.string({ required_error: "Teacher ID is required" })
        .refine(val => mongoose.Types.ObjectId.isValid(val), {
            message: 'Invalid teacher ID format'
        })
});

// Schema for adding a student to a school
export const addStudentToSchoolSchema = z.object({
    studentId: z.string({ required_error: "Student ID is required" })
        .refine(val => mongoose.Types.ObjectId.isValid(val), {
            message: 'Invalid student ID format'
        })
});