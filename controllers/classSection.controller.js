// File: controllers/classSection.controller.js

import Class from '../models/class.model.js';
import Section from '../models/section.model.js';
import Organization from '../models/organization.model.js';
import User from '../models/user.model.js';
import logger from '../utils/logger.js';

// ==================== CLASS MANAGEMENT ====================

// POST /admin/create-class
export const createClass = async (req, res) => {
    const startTime = Date.now();
    logger.info('[CLASS] Starting class creation process', { adminId: req.user._id });

    try {
        const { name, grade, academicYear, schedule } = req.body;

        // Verify admin permissions
        const admin = await User.findById(req.user._id).populate('organization');
        if (!admin || !['admin'].includes(admin.role)) {
            logger.warn('[CLASS] Unauthorized class creation attempt', {
                userId: req.user._id,
                role: admin?.role
            });
            return res.status(403).json({
                success: false,
                message: 'Only organization admins can create classes'
            });
        }

        if (!admin.organization) {
            logger.warn('[CLASS] Admin without organization attempted class creation', {
                adminId: admin._id
            });
            return res.status(400).json({
                success: false,
                message: 'Admin must belong to an organization to create classes'
            });
        }

        // Check admin permissions
        const organization = await Organization.findById(admin.organization._id);
        const adminRecord = organization.admins.find(a => a.user.toString() === admin._id.toString());

        if (!adminRecord || !adminRecord.permissions.canManageClasses) {
            logger.warn('[CLASS] Admin lacks class management permission', {
                adminId: admin._id,
                organizationId: organization._id
            });
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to manage classes'
            });
        }

        // Validate required fields
        if (!name || !grade) {
            return res.status(400).json({
                success: false,
                message: 'Class name and grade are required'
            });
        }

        // Validate grade range
        if (grade < 1 || grade > 12) {
            return res.status(400).json({
                success: false,
                message: 'Grade must be between 1 and 12'
            });
        }

        // Check if class with same name already exists in organization
        const existingClass = await Class.findOne({
            name,
            organization: admin.organization._id,
            isDeleted: false
        });

        if (existingClass) {
            logger.warn('[CLASS] Class creation failed: Name already exists', {
                name,
                organizationId: admin.organization._id
            });
            return res.status(400).json({
                success: false,
                message: 'A class with this name already exists in your organization'
            });
        }

        // Create class
        const classDoc = await Class.create({
            name,
            grade,
            organization: admin.organization._id,
            academicYear: academicYear || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
            schedule: schedule || {
                startTime: '09:00',
                endTime: '15:00',
                workingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
            },
            createdBy: admin._id
        });

        // Update organization stats
        await organization.updateStats();

        const processingTime = Date.now() - startTime;
        logger.info(`[CLASS] Class created successfully (${processingTime}ms)`, {
            classId: classDoc._id,
            adminId: req.user._id,
            organizationId: organization._id
        });

        return res.status(201).json({
            success: true,
            message: 'Class created successfully',
            class: {
                _id: classDoc._id,
                name: classDoc.name,
                grade: classDoc.grade,
                academicYear: classDoc.academicYear,
                schedule: classDoc.schedule,
                organization: {
                    _id: organization._id,
                    name: organization.name
                },
                stats: classDoc.stats,
                createdAt: classDoc.createdAt
            }
        });

    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[CLASS] Class creation failed (${processingTime}ms):`, error);

        if (error.name === 'ValidationError') {
            const validationErrors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: validationErrors
            });
        }

        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'A class with this information already exists'
            });
        }

        return res.status(500).json({
            success: false,
            message: 'Server error during class creation',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};

// GET /admin/list-classes
export const listClasses = async (req, res) => {
    const startTime = Date.now();
    logger.info('[CLASS] Retrieving classes list', { adminId: req.user._id });

    try {
        const admin = await User.findById(req.user._id).populate('organization');
        if (!admin.organization) {
            return res.status(400).json({
                success: false,
                message: 'Admin must belong to an organization'
            });
        }

        const classes = await Class.find({
            organization: admin.organization._id,
            isDeleted: false
        })
            .populate('sections', 'name maxStudents students')
            .sort({ grade: 1, name: 1 });

        const classesWithStats = classes.map(classDoc => ({
            _id: classDoc._id,
            name: classDoc.name,
            grade: classDoc.grade,
            academicYear: classDoc.academicYear,
            schedule: classDoc.schedule,
            totalSections: classDoc.sections.length,
            totalStudents: classDoc.sections.reduce((total, section) => {
                return total + (section.students ? section.students.length : 0);
            }, 0),
            stats: classDoc.stats,
            isActive: classDoc.isActive,
            createdAt: classDoc.createdAt
        }));

        const processingTime = Date.now() - startTime;
        logger.info(`[CLASS] Classes retrieved successfully (${processingTime}ms)`, {
            adminId: req.user._id,
            classCount: classesWithStats.length
        });

        return res.status(200).json({
            success: true,
            classes: classesWithStats,
            totalClasses: classesWithStats.length
        });

    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[CLASS] Classes retrieval failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error retrieving classes',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};

// ==================== SECTION MANAGEMENT ====================

// POST /admin/create-section
export const createSection = async (req, res) => {
    const startTime = Date.now();
    logger.info('[SECTION] Starting section creation process', { adminId: req.user._id });

    try {
        const { name, classId, sectionTeacher, maxStudents, academicYear } = req.body;

        // Verify admin permissions
        const admin = await User.findById(req.user._id).populate('organization');
        if (!admin || !['admin'].includes(admin.role)) {
            return res.status(403).json({
                success: false,
                message: 'Only organization admins can create sections'
            });
        }

        if (!admin.organization) {
            return res.status(400).json({
                success: false,
                message: 'Admin must belong to an organization'
            });
        }

        // Check admin permissions
        const organization = await Organization.findById(admin.organization._id);
        const adminRecord = organization.admins.find(a => a.user.toString() === admin._id.toString());

        if (!adminRecord || !adminRecord.permissions.canManageClasses) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to manage sections'
            });
        }

        // Validate required fields
        if (!name || !classId) {
            return res.status(400).json({
                success: false,
                message: 'Section name and class ID are required'
            });
        }

        // Validate section name (should be A-Z)
        if (!/^[A-Za-z]$/.test(name)) {
            return res.status(400).json({
                success: false,
                message: 'Section name must be a single letter (A-Z)'
            });
        }

        // Verify class exists and belongs to same organization
        const classDoc = await Class.findById(classId);
        if (!classDoc) {
            return res.status(404).json({
                success: false,
                message: 'Class not found'
            });
        }

        if (classDoc.organization.toString() !== admin.organization._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'You can only create sections in classes within your organization'
            });
        }

        // Check if section with same name already exists in the class
        const existingSection = await Section.findOne({
            name: name.toUpperCase(),
            class: classId,
            isDeleted: false
        });

        if (existingSection) {
            return res.status(400).json({
                success: false,
                message: `Section '${name.toUpperCase()}' already exists in this class`
            });
        }

        // Verify section teacher if provided
        let teacher = null;
        if (sectionTeacher) {
            teacher = await User.findById(sectionTeacher);
            if (!teacher) {
                return res.status(404).json({
                    success: false,
                    message: 'Section teacher not found'
                });
            }

            if (teacher.role !== 'teacher') {
                return res.status(400).json({
                    success: false,
                    message: 'Section teacher must have teacher role'
                });
            }

            if (teacher.organization.toString() !== admin.organization._id.toString()) {
                return res.status(403).json({
                    success: false,
                    message: 'Section teacher must belong to the same organization'
                });
            }
        }

        // Create section
        const section = await Section.create({
            name: name.toUpperCase(),
            class: classId,
            organization: admin.organization._id,
            sectionTeacher: sectionTeacher || null,
            maxStudents: maxStudents || organization.maxStudentsPerSection || 30,
            academicYear: academicYear || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
            createdBy: admin._id
        });

        // Add section to class
        await classDoc.addSection(section._id);

        // Add section to teacher's teaching sections if teacher assigned
        if (teacher) {
            await teacher.addTeachingSection(section._id);
        }

        // Update organization stats
        await organization.updateStats();

        const processingTime = Date.now() - startTime;
        logger.info(`[SECTION] Section created successfully (${processingTime}ms)`, {
            sectionId: section._id,
            classId,
            adminId: req.user._id,
            organizationId: organization._id
        });

        return res.status(201).json({
            success: true,
            message: 'Section created successfully',
            section: {
                _id: section._id,
                name: section.name,
                fullName: `${classDoc.grade}-${section.name}`,
                class: {
                    _id: classDoc._id,
                    name: classDoc.name,
                    grade: classDoc.grade
                },
                maxStudents: section.maxStudents,
                currentStudents: 0,
                availableSeats: section.maxStudents,
                teacher: teacher ? {
                    _id: teacher._id,
                    name: teacher.name,
                    email: teacher.email
                } : null,
                academicYear: section.academicYear,
                createdAt: section.createdAt
            }
        });

    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[SECTION] Section creation failed (${processingTime}ms):`, error);

        if (error.name === 'ValidationError') {
            const validationErrors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: validationErrors
            });
        }

        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'A section with this name already exists in the class'
            });
        }

        return res.status(500).json({
            success: false,
            message: 'Server error during section creation',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};

// GET /admin/list-sections/:classId
export const listSectionsByClass = async (req, res) => {
    const startTime = Date.now();
    logger.info('[SECTION] Retrieving sections for class', {
        adminId: req.user._id,
        classId: req.params.classId
    });

    try {
        const { classId } = req.params;

        const admin = await User.findById(req.user._id).populate('organization');
        if (!admin.organization) {
            return res.status(400).json({
                success: false,
                message: 'Admin must belong to an organization'
            });
        }

        // Verify class exists and belongs to admin's organization
        const classDoc = await Class.findById(classId);
        if (!classDoc) {
            return res.status(404).json({
                success: false,
                message: 'Class not found'
            });
        }

        if (classDoc.organization.toString() !== admin.organization._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'You can only view sections in classes within your organization'
            });
        }

        const sections = await Section.find({
            class: classId,
            isDeleted: false
        })
            .populate('sectionTeacher', 'name email')
            .populate('students', 'name email studentDetails.rollNumber')
            .sort({ name: 1 });

        const sectionsWithStats = sections.map(section => ({
            _id: section._id,
            name: section.name,
            fullName: `${classDoc.grade}-${section.name}`,
            maxStudents: section.maxStudents,
            currentStudents: section.students.length,
            availableSeats: section.maxStudents - section.students.length,
            isFull: section.students.length >= section.maxStudents,
            teacher: section.sectionTeacher ? {
                _id: section.sectionTeacher._id,
                name: section.sectionTeacher.name,
                email: section.sectionTeacher.email
            } : null,
            students: section.students.map(student => ({
                _id: student._id,
                name: student.name,
                email: student.email,
                rollNumber: student.studentDetails?.rollNumber
            })),
            academicYear: section.academicYear,
            isActive: section.isActive,
            createdAt: section.createdAt
        }));

        const processingTime = Date.now() - startTime;
        logger.info(`[SECTION] Sections retrieved successfully (${processingTime}ms)`, {
            adminId: req.user._id,
            classId,
            sectionCount: sectionsWithStats.length
        });

        return res.status(200).json({
            success: true,
            class: {
                _id: classDoc._id,
                name: classDoc.name,
                grade: classDoc.grade
            },
            sections: sectionsWithStats,
            totalSections: sectionsWithStats.length,
            totalStudents: sectionsWithStats.reduce((total, section) => total + section.currentStudents, 0)
        });

    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[SECTION] Sections retrieval failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error retrieving sections',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};