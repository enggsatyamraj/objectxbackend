// File: routes/admin.routes.js

import express from 'express';
import { protect } from '../middleware/auth.middleware.js';
import { authorizeRoles } from '../middleware/role.middleware.js';
import {
    validateAdminPermissions,
    requirePrimaryAdmin,
    canManageResource
} from '../middleware/adminPermissions.middleware.js';
import User from '../models/user.model.js';
import Organization from '../models/organization.model.js';
import logger from '../utils/logger.js';

// Import enrollment controllers
import {
    enrollStudent,
    enrollTeacher
} from '../controllers/enroll.admin.controller.js';

// Import admin management controllers
import {
    createSecondaryAdmin,
    listOrganizationAdmins,
    updateAdminPermissions,
    removeAdmin
} from '../controllers/adminManagement.controller.js';

// Import class and section management controllers
import {
    createClass,
    listClasses,
    createSection,
    listSectionsByClass
} from '../controllers/classSection.controller.js';
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

// ==================== CLASS AND SECTION MANAGEMENT ====================

// Create class
adminRouter.post('/create-class', canManageResource('class'), createClass);

// List all classes in organization
adminRouter.get('/list-classes', canManageResource('class'), listClasses);

// Create section for a class
adminRouter.post('/create-section', canManageResource('section'), createSection);

// List sections for a specific class
adminRouter.get('/list-sections/:classId', canManageResource('section'), listSectionsByClass);

// ==================== STUDENT AND TEACHER ONBOARDING ====================

// Student enrollment/onboarding
adminRouter.post('/enroll-student', canManageResource('student'), enrollStudent);

// Teacher enrollment/onboarding  
adminRouter.post('/enroll-teacher', canManageResource('teacher'), enrollTeacher);

// ==================== ADMIN MANAGEMENT ROUTES ====================

// Secondary admin creation (Primary admin only)
adminRouter.post('/create-secondary-admin', requirePrimaryAdmin, createSecondaryAdmin);

// List organization admins
adminRouter.get('/list-admins', validateAdminPermissions(['canViewAnalytics']), listOrganizationAdmins);

// Update admin permissions (Primary admin only)
adminRouter.put('/update-admin-permissions/:adminId', requirePrimaryAdmin, updateAdminPermissions);

// Remove admin (Primary admin only)
adminRouter.delete('/remove-admin/:adminId', requirePrimaryAdmin, removeAdmin);

// ==================== SECTION MANAGEMENT ROUTES ====================

// Assign teacher to section (Primary admin only)
adminRouter.post('/assign-teacher-to-section', requirePrimaryAdmin, assignTeacherToSection);

// Remove teacher from section (Primary admin only)
adminRouter.delete('/remove-teacher-from-section/:sectionId', requirePrimaryAdmin, removeTeacherFromSection);

// Move student between sections
adminRouter.put('/move-student-to-section', canManageResource('student'), moveStudentToSection);

// Get all sections for a class
adminRouter.get('/class-sections/:classId', canManageResource('class'), getClassSections);

// Get sections assigned to a teacher
adminRouter.get('/teacher-sections/:teacherId', validateAdminPermissions(['canViewAnalytics']), getTeacherSections);

// ==================== ADDITIONAL ADMIN ENDPOINTS ====================

// Get organization dashboard stats
adminRouter.get('/dashboard-stats', validateAdminPermissions(['canViewAnalytics']), async (req, res) => {
    try {
        const admin = await User.findById(req.user._id).populate('organization');
        if (!admin.organization) {
            return res.status(400).json({
                success: false,
                message: 'Admin must belong to an organization'
            });
        }

        const organization = await Organization.findById(admin.organization._id);
        await organization.updateStats();

        return res.status(200).json({
            success: true,
            stats: {
                totalStudents: organization.stats.totalStudents,
                totalTeachers: organization.stats.totalTeachers,
                totalClasses: organization.stats.totalClasses,
                totalAdmins: organization.admins.length,
                lastActiveDate: organization.stats.lastActiveDate
            }
        });
    } catch (error) {
        logger.error('[ADMIN] Dashboard stats failed:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error retrieving dashboard stats'
        });
    }
});

// Get organization overview
adminRouter.get('/organization-overview', validateAdminPermissions(['canViewAnalytics']), async (req, res) => {
    try {
        const admin = await User.findById(req.user._id).populate('organization');
        if (!admin.organization) {
            return res.status(400).json({
                success: false,
                message: 'Admin must belong to an organization'
            });
        }

        const organization = admin.organization;

        return res.status(200).json({
            success: true,
            organization: {
                _id: organization._id,
                name: organization.name,
                brandName: organization.brandName,
                organizationCode: organization.organizationCode,
                emails: organization.emails,
                phones: organization.phones,
                address: organization.address,
                stats: organization.stats,
                isActive: organization.isActive
            }
        });
    } catch (error) {
        logger.error('[ADMIN] Organization overview failed:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error retrieving organization overview'
        });
    }
});

export default adminRouter;