// File: routes/admin.routes.js

import express from 'express';
import { protect } from '../middleware/auth.middleware.js';
import { authorizeRoles } from '../middleware/role.middleware.js';
import { requireAdmin } from '../middleware/adminPermissions.middleware.js';
import User from '../models/user.model.js';
import Organization from '../models/organization.model.js';
import logger from '../utils/logger.js';

// Import enrollment controllers
import {
    enrollStudent,
    enrollTeacher
} from '../controllers/enroll.admin.controller.js';

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

import {
    getOrganizationAnalytics,
    getOrganizationDetails,
    getOrganizationUsers,
    updateOrganizationSettings
} from '../controllers/adminControllers/adminOrganization.controller.js';

// Import course viewing controllers for admin
import {
    getOrganizationCourses,
    getOrganizationCourseDetails
} from '../controllers/courseViewing.controller.js';

const adminRouter = express.Router();

// Apply auth middleware to all admin routes
adminRouter.use(protect);
adminRouter.use(authorizeRoles(['admin']));
adminRouter.use(requireAdmin); // SIMPLIFIED: Just check if admin of organization

// ==================== CLASS AND SECTION MANAGEMENT ====================

// Create class
adminRouter.post('/create-class', createClass);

// List all classes in organization
adminRouter.get('/list-classes', listClasses);

// Create section for a class
adminRouter.post('/create-section', createSection);

// List sections for a specific class
adminRouter.get('/list-sections/:classId', listSectionsByClass);

// ==================== STUDENT AND TEACHER ONBOARDING ====================

// Student enrollment/onboarding
adminRouter.post('/enroll-student', enrollStudent);

// Teacher enrollment/onboarding  
adminRouter.post('/enroll-teacher', enrollTeacher);

// ==================== SECTION MANAGEMENT ROUTES ====================

// Assign teacher to section
adminRouter.post('/assign-teacher-to-section', assignTeacherToSection);

// Remove teacher from section
adminRouter.delete('/remove-teacher-from-section/:sectionId', removeTeacherFromSection);

// Move student between sections
adminRouter.put('/move-student-to-section', moveStudentToSection);

// Get all sections for a class
adminRouter.get('/class-sections/:classId', getClassSections);

// Get sections assigned to a teacher
adminRouter.get('/teacher-sections/:teacherId', getTeacherSections);

// ==================== ORGANIZATION MANAGEMENT ====================

// Get comprehensive organization details
adminRouter.get('/organization/details', getOrganizationDetails);

// Get organization analytics and insights
adminRouter.get('/organization/analytics', getOrganizationAnalytics);

// Get all users in organization with filtering and pagination
adminRouter.get('/organization/users', getOrganizationUsers);

// Update organization settings (contact info, enrollment settings, etc.)
adminRouter.put('/organization/settings', updateOrganizationSettings);

// ==================== COURSE VIEWING FOR ADMINS ====================

// Get courses available for organization's classes
adminRouter.get('/courses', getOrganizationCourses);

// Get detailed course for organization
adminRouter.get('/courses/:courseId', getOrganizationCourseDetails);

// ==================== ADDITIONAL ADMIN ENDPOINTS ====================

// Get organization dashboard stats
adminRouter.get('/organization/dashboard-stats', async (req, res) => {
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
adminRouter.get('/organization/organization-overview', async (req, res) => {
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