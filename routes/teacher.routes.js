// File: routes/teacher.routes.js

import express from 'express';
import { protect } from '../middleware/auth.middleware.js';
import { authorizeRoles } from '../middleware/role.middleware.js';
import {
    getTeacherCourses,
    getTeacherCourseDetails
} from '../controllers/courseViewing.controller.js';
import User from '../models/user.model.js';
import Section from '../models/section.model.js';
import logger from '../utils/logger.js';

const teacherRouter = express.Router();

// Apply auth middleware to all teacher routes
teacherRouter.use(protect);
teacherRouter.use(authorizeRoles(['teacher']));

// ==================== TEACHER COURSE ROUTES ====================

// Get courses available for teacher's sections
teacherRouter.get('/courses', getTeacherCourses);

// Get detailed course for teacher
teacherRouter.get('/courses/:courseId', getTeacherCourseDetails);

// ==================== TEACHER DASHBOARD & INFO ====================

// Get teacher dashboard information
teacherRouter.get('/dashboard', async (req, res) => {
    try {
        const teacher = await User.findById(req.user._id)
            .populate('organization', 'name')
            .populate({
                path: 'teachingSections',
                populate: {
                    path: 'class',
                    select: 'name grade'
                }
            });

        if (!teacher || teacher.role !== 'teacher') {
            return res.status(403).json({
                success: false,
                message: 'Only teachers can access teacher dashboard'
            });
        }

        // Calculate statistics
        const totalSections = teacher.teachingSections.length;
        const totalStudents = teacher.teachingSections.reduce((total, section) => {
            return total + section.students.length;
        }, 0);

        const sectionsByGrade = {};
        teacher.teachingSections.forEach(section => {
            if (section.class) {
                const grade = section.class.grade;
                if (!sectionsByGrade[grade]) {
                    sectionsByGrade[grade] = [];
                }
                sectionsByGrade[grade].push({
                    _id: section._id,
                    name: section.name,
                    className: section.class.name,
                    fullName: `${grade}-${section.name}`,
                    studentCount: section.students.length,
                    maxStudents: section.maxStudents
                });
            }
        });

        return res.status(200).json({
            success: true,
            teacher: {
                _id: teacher._id,
                name: teacher.name,
                email: teacher.email,
                employeeId: teacher.teacherDetails?.employeeId,
                organization: teacher.organization
            },
            stats: {
                totalSections,
                totalStudents,
                totalGrades: Object.keys(sectionsByGrade).length
            },
            sectionsByGrade,
            teachingSections: teacher.teachingSections.map(section => ({
                _id: section._id,
                name: section.name,
                class: section.class,
                fullName: section.class ? `${section.class.grade}-${section.name}` : section.name,
                studentCount: section.students.length,
                maxStudents: section.maxStudents,
                isFull: section.students.length >= section.maxStudents
            }))
        });

    } catch (error) {
        logger.error('[TEACHER] Dashboard retrieval failed:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error retrieving teacher dashboard'
        });
    }
});

// Get teacher's sections with students
teacherRouter.get('/sections', async (req, res) => {
    try {
        const teacher = await User.findById(req.user._id)
            .populate({
                path: 'teachingSections',
                populate: [
                    {
                        path: 'class',
                        select: 'name grade'
                    },
                    {
                        path: 'students',
                        select: 'name email studentDetails.rollNumber'
                    }
                ]
            });

        if (!teacher || teacher.role !== 'teacher') {
            return res.status(403).json({
                success: false,
                message: 'Only teachers can access section information'
            });
        }

        const sectionsWithDetails = teacher.teachingSections.map(section => ({
            _id: section._id,
            name: section.name,
            class: section.class,
            fullName: section.class ? `${section.class.grade}-${section.name}` : section.name,
            maxStudents: section.maxStudents,
            currentStudents: section.students.length,
            availableSeats: section.maxStudents - section.students.length,
            students: section.students.map(student => ({
                _id: student._id,
                name: student.name,
                email: student.email,
                rollNumber: student.studentDetails?.rollNumber
            }))
        }));

        return res.status(200).json({
            success: true,
            sections: sectionsWithDetails,
            totalSections: sectionsWithDetails.length,
            totalStudents: sectionsWithDetails.reduce((total, section) => total + section.currentStudents, 0)
        });

    } catch (error) {
        logger.error('[TEACHER] Sections retrieval failed:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error retrieving sections'
        });
    }
});

// Get specific section details
teacherRouter.get('/sections/:sectionId', async (req, res) => {
    try {
        const teacher = await User.findById(req.user._id);
        const sectionId = req.params.sectionId;

        // Check if teacher teaches this section
        if (!teacher.teachingSections.includes(sectionId)) {
            return res.status(403).json({
                success: false,
                message: 'You do not teach this section'
            });
        }

        const section = await Section.findById(sectionId)
            .populate('class', 'name grade')
            .populate('students', 'name email studentDetails.rollNumber isActive')
            .populate('organization', 'name');

        if (!section) {
            return res.status(404).json({
                success: false,
                message: 'Section not found'
            });
        }

        return res.status(200).json({
            success: true,
            section: {
                _id: section._id,
                name: section.name,
                class: section.class,
                fullName: `${section.class.grade}-${section.name}`,
                organization: section.organization,
                maxStudents: section.maxStudents,
                currentStudents: section.students.length,
                availableSeats: section.maxStudents - section.students.length,
                students: section.students.map(student => ({
                    _id: student._id,
                    name: student.name,
                    email: student.email,
                    rollNumber: student.studentDetails?.rollNumber,
                    isActive: student.isActive
                })),
                academicYear: section.academicYear,
                createdAt: section.createdAt
            }
        });

    } catch (error) {
        logger.error('[TEACHER] Section details retrieval failed:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error retrieving section details'
        });
    }
});

export default teacherRouter;