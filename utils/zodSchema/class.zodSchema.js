import { z } from 'zod';
import mongoose from 'mongoose';

// Class Schema
export const classSchema = z.object({
    class: z.object({
        name: z.string({ required_error: "Class name is required" })
            .min(2, 'Class name must be at least 2 characters long')
            .trim(),

        school: z.string({ required_error: "School ID is required" })
            .refine(val => mongoose.Types.ObjectId.isValid(val), {
                message: 'Invalid school ID format'
            }),
    })
});

// Class Update Schema
export const classUpdateSchema = z.object({
    class: z.object({
        name: z.string({ required_error: "Class name is required" })
            .min(2, 'Class name must be at least 2 characters long')
            .trim(),
    })
});

// Schema for adding a student to a class
export const addStudentToClassSchema = z.object({
    studentId: z.string({ required_error: "Student ID is required" })
        .refine(val => mongoose.Types.ObjectId.isValid(val), {
            message: 'Invalid student ID format'
        })
});