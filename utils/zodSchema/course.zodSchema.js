import { z } from 'zod';
import mongoose from 'mongoose';

// Course Schema
export const courseSchema = z.object({
    course: z.object({
        title: z.string({ required_error: "Course title is required" })
            .min(2, 'Course title must be at least 2 characters long')
            .trim(),

        description: z.string()
            .optional(),

        class: z.string({ required_error: "Class ID is required" })
            .refine(val => mongoose.Types.ObjectId.isValid(val), {
                message: 'Invalid class ID format'
            }),

        school: z.string({ required_error: "School ID is required" })
            .refine(val => mongoose.Types.ObjectId.isValid(val), {
                message: 'Invalid school ID format'
            }),

        teacher: z.string({ required_error: "Teacher ID is required" })
            .refine(val => mongoose.Types.ObjectId.isValid(val), {
                message: 'Invalid teacher ID format'
            }),
    })
});

// Course Update Schema
export const courseUpdateSchema = z.object({
    course: z.object({
        title: z.string()
            .min(2, 'Course title must be at least 2 characters long')
            .trim()
            .optional(),

        description: z.string()
            .optional(),
    })
});

// Schema for adding a student to a course
export const addStudentToCourseSchema = z.object({
    studentId: z.string({ required_error: "Student ID is required" })
        .refine(val => mongoose.Types.ObjectId.isValid(val), {
            message: 'Invalid student ID format'
        })
});