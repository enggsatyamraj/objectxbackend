// File: routes/admin.routes.js

import express from 'express';
import { protect } from '../middleware/auth.middleware.js';
import { authorizeRoles } from '../middleware/role.middleware.js';
import { validateAdminPermissions } from '../middleware/adminPermissions.middleware.js';

// Import enrollment controllers
import {
    enrollStudent,
    enrollTeacher
} from '../controllers/enrollment.controller.js';

// Import admin management controllers
import {
    createSecondaryAdmin,
    listOrganizationAdmins,
    updateAdminPermissions,
    removeAdmin
} from '../controllers/adminManagement.controller.js';

// Import section management controllers
import {
    assignTeacherToSection,
    removeTeacherFromSection,
    moveStudentToSection,
    getClassSections,
    getTeacherSections
} from '../controllers/sectionManagement.controller.js';

const adminRouter = express.Router();

// Apply auth middleware to all admin routes
adminRouter.use(protect);
adminRouter.use(authorizeRoles(['admin']));

// ==================== ENROLLMENT ROUTES ====================

// Student enrollment
adminRouter.post('/enroll-student',
    validateAdminPermissions(['canEnrollStudents']),
    enrollStudent
);

// Teacher enrollment  
adminRouter.post('/enroll-teacher',
    validateAdminPermissions(['canEnrollTeachers']),
    enrollTeacher
);

// ==================== ADMIN MANAGEMENT ROUTES ====================

// Secondary admin creation (Primary admin only)
adminRouter.post('/create-secondary-admin',
    validateAdminPermissions(['canManageAdmins']),
    createSecondaryAdmin
);

// List organization admins
adminRouter.get('/list-admins',
    listOrganizationAdmins
);

// Update admin permissions (Primary admin only)
adminRouter.put('/update-admin-permissions/:adminId',
    validateAdminPermissions(['canManageAdmins']),
    updateAdminPermissions
);

// Remove admin (Primary admin only)
adminRouter.delete('/remove-admin/:adminId',
    validateAdminPermissions(['canManageAdmins']),
    removeAdmin
);

// ==================== SECTION MANAGEMENT ROUTES ====================

// Assign teacher to section (Primary admin only)
adminRouter.post('/assign-teacher-to-section',
    validateAdminPermissions(['canManageAdmins']), // Primary admin only
    assignTeacherToSection
);

// Remove teacher from section (Primary admin only)
adminRouter.delete('/remove-teacher-from-section/:sectionId',
    validateAdminPermissions(['canManageAdmins']), // Primary admin only
    removeTeacherFromSection
);

// Move student between sections
adminRouter.put('/move-student-to-section',
    validateAdminPermissions(['canEnrollStudents']),
    moveStudentToSection
);

// Get all sections for a class
adminRouter.get('/class-sections/:classId',
    validateAdminPermissions(['canManageClasses']),
    getClassSections
);

// Get sections assigned to a teacher
adminRouter.get('/teacher-sections/:teacherId',
    validateAdminPermissions(['canViewAnalytics']),
    getTeacherSections
);

export default adminRouter;