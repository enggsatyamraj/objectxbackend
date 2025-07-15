// File: routes/course.routes.js

import express from 'express';
import { protect } from '../middleware/auth.middleware.js';
import { authorizeRoles } from '../middleware/role.middleware.js';
import {
    createCourse,
    getAllCourses,
    getCourseById,
    updateCourse,
    deleteCourse,
    getCourseStatistics
} from '../controllers/course.controller.js';

const courseRouter = express.Router();

// Apply auth middleware to all course routes
courseRouter.use(protect);
courseRouter.use(authorizeRoles(['superAdmin'])); // Only SuperAdmin can access these routes

// ==================== COURSE CRUD ROUTES ====================

// GET /superadmin/courses/stats - Get course statistics (must be before /:id route)
courseRouter.get('/stats', getCourseStatistics);

// POST /superadmin/courses - Create new course
courseRouter.post('/', createCourse);

// GET /superadmin/courses - Get all courses with filtering and pagination
courseRouter.get('/', getAllCourses);

// GET /superadmin/courses/:id - Get course details by ID
courseRouter.get('/:id', getCourseById);

// PUT /superadmin/courses/:id - Update course
courseRouter.put('/:id', updateCourse);

// DELETE /superadmin/courses/:id - Delete course (soft delete)
courseRouter.delete('/:id', deleteCourse);

export default courseRouter;