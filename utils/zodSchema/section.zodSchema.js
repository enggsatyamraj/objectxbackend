import { z } from 'zod';
import mongoose from 'mongoose';

// Section Creation Schema
export const sectionSchema = z.object({
    section: z.object({
        name: z.string({ required_error: "Section name is required" })
            .min(1, 'Section name is required')
            .max(1, 'Section name must be a single letter')
            .regex(/^[A-Za-z]$/, 'Section name must be a letter (A-Z)')
            .transform(str => str.toUpperCase()),

        class: z.string({ required_error: "Class ID is required" })
            .refine(val => mongoose.Types.ObjectId.isValid(val), {
                message: 'Invalid class ID format'
            }),

        teacher: z.string({ required_error: "Teacher ID is required" })
            .refine(val => mongoose.Types.ObjectId.isValid(val), {
                message: 'Invalid teacher ID format'
            }),

        school: z.string({ required_error: "School ID is required" })
            .refine(val => mongoose.Types.ObjectId.isValid(val), {
                message: 'Invalid school ID format'
            }),
    })
});

// Section Update Schema
export const sectionUpdateSchema = z.object({
    section: z.object({
        name: z.string()
            .min(1, 'Section name is required')
            .max(1, 'Section name must be a single letter')
            .regex(/^[A-Za-z]$/, 'Section name must be a letter (A-Z)')
            .transform(str => str.toUpperCase())
            .optional(),

        teacher: z.string()
            .refine(val => mongoose.Types.ObjectId.isValid(val), {
                message: 'Invalid teacher ID format'
            })
            .optional(),
    })
});

// Schema for adding a student to a section
export const addStudentToSectionSchema = z.object({
    studentId: z.string({ required_error: "Student ID is required" })
        .refine(val => mongoose.Types.ObjectId.isValid(val), {
            message: 'Invalid student ID format'
        })
});

// Schema for adding multiple students to a section
export const addMultipleStudentsToSectionSchema = z.object({
    studentIds: z.array(
        z.string().refine(val => mongoose.Types.ObjectId.isValid(val), {
            message: 'Invalid student ID format'
        })
    )
        .min(1, 'At least one student ID is required')
        .max(40, 'Cannot add more than 40 students to a section')
});