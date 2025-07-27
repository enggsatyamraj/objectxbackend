// File: routes/courseViewing.routes.js

import express from 'express';
import { protect } from '../middleware/auth.middleware.js';
import { authorizeRoles } from '../middleware/role.middleware.js';
import { requireAdmin } from '../middleware/adminPermissions.middleware.js';
import {
    // Organization/Admin course viewing
    getOrganizationCourses,
    getOrganizationCourseDetails,

    // Teacher course viewing
    getTeacherCourses,
    getTeacherCourseDetails,

    // Student course viewing
    getStudentCourses,
    getStudentCourseDetails
} from '../controllers/courseViewing.controller.js';

const courseViewingRouter = express.Router();

// Apply auth middleware to all routes
courseViewingRouter.use(protect);

// ==================== ORGANIZATION/ADMIN COURSE ROUTES ====================

// Admin routes for viewing courses available to their organization
courseViewingRouter.get('/admin/courses',
    authorizeRoles(['admin']),
    requireAdmin,
    getOrganizationCourses
);

courseViewingRouter.get('/admin/courses/:courseId',
    authorizeRoles(['admin']),
    requireAdmin,
    getOrganizationCourseDetails
);

// ==================== TEACHER COURSE ROUTES ====================

// Teacher routes for viewing courses relevant to their sections
courseViewingRouter.get('/teacher/courses',
    authorizeRoles(['teacher']),
    getTeacherCourses
);

courseViewingRouter.get('/teacher/courses/:courseId',
    authorizeRoles(['teacher']),
    getTeacherCourseDetails
);

// ==================== STUDENT COURSE ROUTES ====================

// Student routes for viewing courses for their grade
courseViewingRouter.get('/student/courses',
    authorizeRoles(['student']),
    getStudentCourses
);

courseViewingRouter.get('/student/courses/:courseId',
    authorizeRoles(['student']),
    getStudentCourseDetails
);

export default courseViewingRouter;