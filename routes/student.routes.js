// File: routes/student.routes.js (Updated)

import express from 'express';
import { protect } from '../middleware/auth.middleware.js';
import { authorizeRoles } from '../middleware/role.middleware.js';

// Import existing student controllers
import User from '../models/user.model.js';
import logger from '../utils/logger.js';

// Import new student course controllers
import {
    getStudentCourses,
    getStudentCourseDetails,
    getAvailableSubjects,
    searchStudentCourses,
    getStudentCourseSummary
} from '../controllers/student.course.controller.js';

const studentRouter = express.Router();

// Apply auth middleware to all student routes
studentRouter.use(protect);
studentRouter.use(authorizeRoles(['student']));

// ==================== STUDENT COURSE ACCESS ROUTES ====================

// IMPORTANT: Order matters! Specific routes must come BEFORE parameterized routes

// Get available subjects for student's grade (MUST be before /:courseId)
studentRouter.get('/courses/subjects', getAvailableSubjects);

// Advanced course search (MUST be before /:courseId)
studentRouter.get('/courses/search', searchStudentCourses);

// Get course summary for dashboard
studentRouter.get('/dashboard/course-summary', getStudentCourseSummary);

// Get all courses available for student's grade
studentRouter.get('/courses', getStudentCourses);

// Get detailed course with full topics and activities (MUST be LAST among /courses routes)
studentRouter.get('/courses/:courseId', getStudentCourseDetails);

// ==================== EXISTING STUDENT DASHBOARD & INFO ROUTES ====================

// Get student dashboard information
studentRouter.get('/dashboard', async (req, res) => {
    try {
        const student = await User.findById(req.user._id)
            .populate('organization', 'name brandName')
            .populate({
                path: 'section',
                populate: [
                    {
                        path: 'class',
                        select: 'name grade academicYear'
                    },
                    {
                        path: 'sectionTeacher',
                        select: 'name email'
                    }
                ]
            });

        if (!student || student.role !== 'student') {
            return res.status(403).json({
                success: false,
                message: 'Only students can access student dashboard'
            });
        }

        if (!student.section) {
            return res.status(400).json({
                success: false,
                message: 'Student must be enrolled in a section'
            });
        }

        // Get classmates count
        const classmatesCount = student.section.students.length - 1; // Exclude self

        return res.status(200).json({
            success: true,
            student: {
                _id: student._id,
                name: student.name,
                email: student.email,
                rollNumber: student.studentDetails?.rollNumber,
                admissionDate: student.studentDetails?.admissionDate,
                organization: student.organization
            },
            academic: {
                class: student.section.class,
                section: {
                    _id: student.section._id,
                    name: student.section.name,
                    fullName: `${student.section.class.grade}-${student.section.name}`
                },
                teacher: student.section.sectionTeacher,
                academicYear: student.section.academicYear || student.section.class.academicYear
            },
            stats: {
                grade: student.section.class.grade,
                classmatesCount,
                sectionCapacity: student.section.maxStudents
            }
        });

    } catch (error) {
        logger.error('[STUDENT] Dashboard retrieval failed:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error retrieving student dashboard'
        });
    }
});

// Get student's classmates
studentRouter.get('/classmates', async (req, res) => {
    try {
        const student = await User.findById(req.user._id)
            .populate({
                path: 'section',
                populate: {
                    path: 'students',
                    select: 'name email studentDetails.rollNumber isActive'
                }
            });

        if (!student || student.role !== 'student') {
            return res.status(403).json({
                success: false,
                message: 'Only students can access classmate information'
            });
        }

        if (!student.section) {
            return res.status(400).json({
                success: false,
                message: 'Student must be enrolled in a section'
            });
        }

        // Filter out the current student and get only active classmates
        const classmates = student.section.students
            .filter(classmate =>
                classmate._id.toString() !== student._id.toString() &&
                classmate.isActive
            )
            .map(classmate => ({
                _id: classmate._id,
                name: classmate.name,
                email: classmate.email,
                rollNumber: classmate.studentDetails?.rollNumber
            }));

        return res.status(200).json({
            success: true,
            classmates,
            totalClassmates: classmates.length,
            section: {
                _id: student.section._id,
                name: student.section.name,
                totalStudents: student.section.students.length
            }
        });

    } catch (error) {
        logger.error('[STUDENT] Classmates retrieval failed:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error retrieving classmates'
        });
    }
});

// Get student's section information
studentRouter.get('/section', async (req, res) => {
    try {
        const student = await User.findById(req.user._id)
            .populate({
                path: 'section',
                populate: [
                    {
                        path: 'class',
                        select: 'name grade academicYear'
                    },
                    {
                        path: 'sectionTeacher',
                        select: 'name email teacherDetails.employeeId'
                    },
                    {
                        path: 'organization',
                        select: 'name brandName'
                    }
                ]
            });

        if (!student || student.role !== 'student') {
            return res.status(403).json({
                success: false,
                message: 'Only students can access section information'
            });
        }

        if (!student.section) {
            return res.status(400).json({
                success: false,
                message: 'Student must be enrolled in a section'
            });
        }

        return res.status(200).json({
            success: true,
            section: {
                _id: student.section._id,
                name: student.section.name,
                fullName: `${student.section.class.grade}-${student.section.name}`,
                class: student.section.class,
                teacher: student.section.sectionTeacher,
                organization: student.section.organization,
                maxStudents: student.section.maxStudents,
                currentStudents: student.section.students.length,
                academicYear: student.section.academicYear,
                createdAt: student.section.createdAt
            },
            studentPosition: {
                rollNumber: student.studentDetails?.rollNumber,
                admissionDate: student.studentDetails?.admissionDate
            }
        });

    } catch (error) {
        logger.error('[STUDENT] Section information retrieval failed:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error retrieving section information'
        });
    }
});

// Get student profile
studentRouter.get('/profile', async (req, res) => {
    try {
        const student = await User.findById(req.user._id)
            .populate('organization', 'name brandName')
            .populate({
                path: 'section',
                populate: {
                    path: 'class',
                    select: 'name grade'
                }
            })
            .select('-password -otp');

        if (!student || student.role !== 'student') {
            return res.status(403).json({
                success: false,
                message: 'Only students can access student profile'
            });
        }

        return res.status(200).json({
            success: true,
            profile: {
                _id: student._id,
                name: student.name,
                email: student.email,
                avatar: student.avatar,
                bio: student.bio,
                isVerified: student.isVerified,
                isActive: student.isActive,
                organization: student.organization,
                section: student.section,
                studentDetails: student.studentDetails,
                preferences: student.preferences,
                lastLogin: student.lastLogin,
                createdAt: student.createdAt
            }
        });

    } catch (error) {
        logger.error('[STUDENT] Profile retrieval failed:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error retrieving student profile'
        });
    }
});

export default studentRouter;