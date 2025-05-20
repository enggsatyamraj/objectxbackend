import { z } from 'zod';
import mongoose from 'mongoose';

// Generic ID Schema for validation
export const idSchema = z.object({
    id: z.string({ required_error: "ID is required" })
        .refine(val => mongoose.Types.ObjectId.isValid(val), {
            message: 'Invalid ID format'
        })
});