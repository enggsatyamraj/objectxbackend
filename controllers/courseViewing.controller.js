// File: controllers/courseViewing.controller.js

import Course from '../models/course.model.js';
import Class from '../models/class.model.js';
import Section from '../models/section.model.js';
import User from '../models/user.model.js';
import Organization from '../models/organization.model.js';
import logger from '../utils/logger.js';

// ==================== ORGANIZATION COURSE VIEWING ====================

// GET /admin/courses - Get courses available for organization's classes
export const getOrganizationCourses = async (req, res) => {
    const startTime = Date.now();
    logger.info('[COURSE-VIEW] Getting organization courses', { adminId: req.user._id });

    try {
        const admin = await User.findById(req.user._id).populate('organization');
        if (!admin?.organization) {
            return res.status(400).json({
                success: false,
                message: 'Admin must belong to an organization'
            });
        }

        const organizationId = admin.organization._id;

        // Get query parameters for filtering
        const {
            page = 1,
            limit = 12,
            subject,
            gradeLevel,
            curriculum = 'NCERT',
            search,
            sortBy = 'gradeLevel',
            sortOrder = 'asc'
        } = req.query;

        // Get all classes in this organization to determine available grades
        const organizationClasses = await Class.find({
            organization: organizationId,
            isDeleted: false,
            isActive: true
        }).select('grade');

        const availableGrades = [...new Set(organizationClasses.map(cls => cls.grade))];

        if (availableGrades.length === 0) {
            return res.status(200).json({
                success: true,
                courses: [],
                totalCourses: 0,
                availableGrades: [],
                message: 'No classes found in organization'
            });
        }

        // Build filter query for courses
        const filterQuery = {
            gradeLevel: { $in: availableGrades },
            isActive: true,
            isDeleted: false
        };

        if (subject) {
            filterQuery.subject = subject;
        }

        if (gradeLevel && availableGrades.includes(parseInt(gradeLevel))) {
            filterQuery.gradeLevel = parseInt(gradeLevel);
        }

        if (curriculum) {
            filterQuery.curriculum = curriculum;
        }

        if (search) {
            filterQuery.$or = [
                { title: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        // Calculate pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const sortOptions = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

        // Get courses with pagination
        const [courses, totalCount] = await Promise.all([
            Course.find(filterQuery)
                .select('-topics') // Exclude detailed topics for list view
                .sort(sortOptions)
                .skip(skip)
                .limit(parseInt(limit)),
            Course.countDocuments(filterQuery)
        ]);

        // Calculate pagination info
        const totalPages = Math.ceil(totalCount / parseInt(limit));
        const hasNextPage = parseInt(page) < totalPages;
        const hasPrevPage = parseInt(page) > 1;

        // Group courses by grade for better organization
        const coursesByGrade = {};
        courses.forEach(course => {
            const grade = `Grade ${course.gradeLevel}`;
            if (!coursesByGrade[grade]) {
                coursesByGrade[grade] = [];
            }
            coursesByGrade[grade].push({
                _id: course._id,
                title: course.title,
                subject: course.subject,
                chapterNumber: course.chapterNumber,
                curriculum: course.curriculum,
                description: course.description,
                displayName: course.displayName,
                totalTopics: course.stats.totalTopics,
                totalActivities: course.stats.totalActivities,
                averageDuration: course.stats.averageDuration,
                createdAt: course.createdAt
            });
        });

        const processingTime = Date.now() - startTime;
        logger.info(`[COURSE-VIEW] Organization courses retrieved successfully (${processingTime}ms)`, {
            adminId: req.user._id,
            organizationId,
            courseCount: courses.length,
            totalCount
        });

        return res.status(200).json({
            success: true,
            courses: courses.map(course => ({
                _id: course._id,
                title: course.title,
                subject: course.subject,
                gradeLevel: course.gradeLevel,
                chapterNumber: course.chapterNumber,
                curriculum: course.curriculum,
                description: course.description,
                displayName: course.displayName,
                totalTopics: course.stats.totalTopics,
                totalActivities: course.stats.totalActivities,
                averageDuration: course.stats.averageDuration,
                createdAt: course.createdAt
            })),
            coursesByGrade,
            pagination: {
                currentPage: parseInt(page),
                totalPages,
                totalCount,
                hasNextPage,
                hasPrevPage,
                limit: parseInt(limit)
            },
            filters: {
                availableGrades: availableGrades.sort(),
                availableSubjects: [...new Set(courses.map(c => c.subject))].sort(),
                appliedFilters: {
                    gradeLevel: gradeLevel ? parseInt(gradeLevel) : null,
                    subject: subject || null,
                    curriculum: curriculum,
                    search: search || null
                }
            }
        });

    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[COURSE-VIEW] Organization courses retrieval failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error retrieving courses',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};

// GET /admin/courses/:courseId - Get detailed course for organization
export const getOrganizationCourseDetails = async (req, res) => {
    const startTime = Date.now();
    logger.info('[COURSE-VIEW] Getting organization course details', {
        adminId: req.user._id,
        courseId: req.params.courseId
    });

    try {
        const admin = await User.findById(req.user._id).populate('organization');
        if (!admin?.organization) {
            return res.status(400).json({
                success: false,
                message: 'Admin must belong to an organization'
            });
        }

        const courseId = req.params.courseId;

        // Get organization's available grades
        const organizationClasses = await Class.find({
            organization: admin.organization._id,
            isDeleted: false,
            isActive: true
        }).select('grade');

        const availableGrades = [...new Set(organizationClasses.map(cls => cls.grade))];

        // Find course and check if it's available for this organization
        const course = await Course.findById(courseId);

        if (!course || course.isDeleted || !course.isActive) {
            return res.status(404).json({
                success: false,
                message: 'Course not found'
            });
        }

        // Check if organization has classes for this course grade
        if (!availableGrades.includes(course.gradeLevel)) {
            return res.status(403).json({
                success: false,
                message: 'This course is not available for your organization\'s grade levels'
            });
        }

        const processingTime = Date.now() - startTime;
        logger.info(`[COURSE-VIEW] Organization course details retrieved successfully (${processingTime}ms)`, {
            adminId: req.user._id,
            courseId
        });

        return res.status(200).json({
            success: true,
            course: {
                _id: course._id,
                title: course.title,
                subject: course.subject,
                gradeLevel: course.gradeLevel,
                chapterNumber: course.chapterNumber,
                curriculum: course.curriculum,
                description: course.description,
                displayName: course.displayName,
                topics: course.topics,
                totalDuration: course.totalDuration,
                stats: course.stats,
                createdAt: course.createdAt,
                updatedAt: course.updatedAt
            }
        });

    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[COURSE-VIEW] Organization course details retrieval failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error retrieving course details',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};

// ==================== TEACHER COURSE VIEWING ====================

// GET /teacher/courses - Get courses for teacher's sections
export const getTeacherCourses = async (req, res) => {
    const startTime = Date.now();
    logger.info('[COURSE-VIEW] Getting teacher courses', { teacherId: req.user._id });

    try {
        const teacher = await User.findById(req.user._id)
            .populate('organization')
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
                message: 'Only teachers can access teacher courses'
            });
        }

        if (!teacher.organization) {
            return res.status(400).json({
                success: false,
                message: 'Teacher must belong to an organization'
            });
        }

        // Get grades from teacher's sections
        const teachingGrades = [...new Set(
            teacher.teachingSections
                .filter(section => section.class)
                .map(section => section.class.grade)
        )];

        if (teachingGrades.length === 0) {
            return res.status(200).json({
                success: true,
                courses: [],
                totalCourses: 0,
                teachingSections: [],
                message: 'No teaching sections assigned'
            });
        }

        const {
            page = 1,
            limit = 12,
            subject,
            gradeLevel,
            curriculum = 'NCERT',
            search
        } = req.query;

        // Build filter query
        const filterQuery = {
            gradeLevel: { $in: teachingGrades },
            isActive: true,
            isDeleted: false
        };

        if (subject) {
            filterQuery.subject = subject;
        }

        if (gradeLevel && teachingGrades.includes(parseInt(gradeLevel))) {
            filterQuery.gradeLevel = parseInt(gradeLevel);
        }

        if (curriculum) {
            filterQuery.curriculum = curriculum;
        }

        if (search) {
            filterQuery.$or = [
                { title: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        // Get courses with pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [courses, totalCount] = await Promise.all([
            Course.find(filterQuery)
                .select('-topics')
                .sort({ gradeLevel: 1, subject: 1, chapterNumber: 1 })
                .skip(skip)
                .limit(parseInt(limit)),
            Course.countDocuments(filterQuery)
        ]);

        const totalPages = Math.ceil(totalCount / parseInt(limit));

        const processingTime = Date.now() - startTime;
        logger.info(`[COURSE-VIEW] Teacher courses retrieved successfully (${processingTime}ms)`, {
            teacherId: req.user._id,
            courseCount: courses.length,
            teachingGrades
        });

        return res.status(200).json({
            success: true,
            courses: courses.map(course => ({
                _id: course._id,
                title: course.title,
                subject: course.subject,
                gradeLevel: course.gradeLevel,
                chapterNumber: course.chapterNumber,
                curriculum: course.curriculum,
                description: course.description,
                displayName: course.displayName,
                totalTopics: course.stats.totalTopics,
                totalActivities: course.stats.totalActivities,
                averageDuration: course.stats.averageDuration
            })),
            teachingSections: teacher.teachingSections.map(section => ({
                _id: section._id,
                name: section.name,
                class: section.class,
                fullName: `${section.class.grade}-${section.name}`,
                studentCount: section.students.length
            })),
            pagination: {
                currentPage: parseInt(page),
                totalPages,
                totalCount,
                hasNextPage: parseInt(page) < totalPages,
                hasPrevPage: parseInt(page) > 1,
                limit: parseInt(limit)
            },
            filters: {
                teachingGrades: teachingGrades.sort(),
                availableSubjects: [...new Set(courses.map(c => c.subject))].sort()
            }
        });

    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[COURSE-VIEW] Teacher courses retrieval failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error retrieving teacher courses',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};

// GET /teacher/courses/:courseId - Get detailed course for teacher
export const getTeacherCourseDetails = async (req, res) => {
    const startTime = Date.now();
    logger.info('[COURSE-VIEW] Getting teacher course details', {
        teacherId: req.user._id,
        courseId: req.params.courseId
    });

    try {
        const teacher = await User.findById(req.user._id)
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
                message: 'Only teachers can access teacher courses'
            });
        }

        const courseId = req.params.courseId;
        const teachingGrades = [...new Set(
            teacher.teachingSections
                .filter(section => section.class)
                .map(section => section.class.grade)
        )];

        // Find course
        const course = await Course.findById(courseId);

        if (!course || course.isDeleted || !course.isActive) {
            return res.status(404).json({
                success: false,
                message: 'Course not found'
            });
        }

        // Check if teacher teaches this grade
        if (!teachingGrades.includes(course.gradeLevel)) {
            return res.status(403).json({
                success: false,
                message: 'You do not teach classes for this course grade level'
            });
        }

        const processingTime = Date.now() - startTime;
        logger.info(`[COURSE-VIEW] Teacher course details retrieved successfully (${processingTime}ms)`, {
            teacherId: req.user._id,
            courseId
        });

        return res.status(200).json({
            success: true,
            course: {
                _id: course._id,
                title: course.title,
                subject: course.subject,
                gradeLevel: course.gradeLevel,
                chapterNumber: course.chapterNumber,
                curriculum: course.curriculum,
                description: course.description,
                displayName: course.displayName,
                topics: course.topics,
                totalDuration: course.totalDuration,
                stats: course.stats
            },
            relevantSections: teacher.teachingSections
                .filter(section => section.class && section.class.grade === course.gradeLevel)
                .map(section => ({
                    _id: section._id,
                    name: section.name,
                    fullName: `${section.class.grade}-${section.name}`,
                    studentCount: section.students.length
                }))
        });

    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[COURSE-VIEW] Teacher course details retrieval failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error retrieving course details',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};

// ==================== STUDENT COURSE VIEWING ====================

// GET /student/courses - Get courses for student's grade
export const getStudentCourses = async (req, res) => {
    const startTime = Date.now();
    logger.info('[COURSE-VIEW] Getting student courses', { studentId: req.user._id });

    try {
        const student = await User.findById(req.user._id)
            .populate('organization')
            .populate({
                path: 'section',
                populate: {
                    path: 'class',
                    select: 'name grade'
                }
            });

        if (!student || student.role !== 'student') {
            return res.status(403).json({
                success: false,
                message: 'Only students can access student courses'
            });
        }

        if (!student.section || !student.section.class) {
            return res.status(400).json({
                success: false,
                message: 'Student must be enrolled in a section to view courses'
            });
        }

        const studentGrade = student.section.class.grade;

        const {
            page = 1,
            limit = 12,
            subject,
            curriculum = 'NCERT',
            search
        } = req.query;

        // Build filter query for student's grade
        const filterQuery = {
            gradeLevel: studentGrade,
            isActive: true,
            isDeleted: false
        };

        if (subject) {
            filterQuery.subject = subject;
        }

        if (curriculum) {
            filterQuery.curriculum = curriculum;
        }

        if (search) {
            filterQuery.$or = [
                { title: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        // Get courses with pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [courses, totalCount] = await Promise.all([
            Course.find(filterQuery)
                .select('-topics') // Students see overview, detailed topics in separate endpoint
                .sort({ subject: 1, chapterNumber: 1 })
                .skip(skip)
                .limit(parseInt(limit)),
            Course.countDocuments(filterQuery)
        ]);

        const totalPages = Math.ceil(totalCount / parseInt(limit));

        const processingTime = Date.now() - startTime;
        logger.info(`[COURSE-VIEW] Student courses retrieved successfully (${processingTime}ms)`, {
            studentId: req.user._id,
            courseCount: courses.length,
            studentGrade
        });

        return res.status(200).json({
            success: true,
            courses: courses.map(course => ({
                _id: course._id,
                title: course.title,
                subject: course.subject,
                gradeLevel: course.gradeLevel,
                chapterNumber: course.chapterNumber,
                curriculum: course.curriculum,
                description: course.description,
                displayName: course.displayName,
                totalTopics: course.stats.totalTopics,
                totalActivities: course.stats.totalActivities,
                averageDuration: course.stats.averageDuration
            })),
            studentInfo: {
                name: student.name,
                rollNumber: student.studentDetails?.rollNumber,
                class: student.section.class.name,
                section: student.section.name,
                fullSection: `${student.section.class.grade}-${student.section.name}`,
                grade: studentGrade
            },
            pagination: {
                currentPage: parseInt(page),
                totalPages,
                totalCount,
                hasNextPage: parseInt(page) < totalPages,
                hasPrevPage: parseInt(page) > 1,
                limit: parseInt(limit)
            },
            filters: {
                availableSubjects: [...new Set(courses.map(c => c.subject))].sort(),
                appliedFilters: {
                    subject: subject || null,
                    curriculum: curriculum,
                    search: search || null
                }
            }
        });

    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[COURSE-VIEW] Student courses retrieval failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error retrieving student courses',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};

// GET /student/courses/:courseId - Get detailed course for student
export const getStudentCourseDetails = async (req, res) => {
    const startTime = Date.now();
    logger.info('[COURSE-VIEW] Getting student course details', {
        studentId: req.user._id,
        courseId: req.params.courseId
    });

    try {
        const student = await User.findById(req.user._id)
            .populate({
                path: 'section',
                populate: {
                    path: 'class',
                    select: 'name grade'
                }
            });

        if (!student || student.role !== 'student') {
            return res.status(403).json({
                success: false,
                message: 'Only students can access student courses'
            });
        }

        if (!student.section || !student.section.class) {
            return res.status(400).json({
                success: false,
                message: 'Student must be enrolled in a section to view courses'
            });
        }

        const courseId = req.params.courseId;
        const studentGrade = student.section.class.grade;

        // Find course
        const course = await Course.findById(courseId);

        if (!course || course.isDeleted || !course.isActive) {
            return res.status(404).json({
                success: false,
                message: 'Course not found'
            });
        }

        // Check if course is for student's grade
        if (course.gradeLevel !== studentGrade) {
            return res.status(403).json({
                success: false,
                message: 'This course is not available for your grade level'
            });
        }

        const processingTime = Date.now() - startTime;
        logger.info(`[COURSE-VIEW] Student course details retrieved successfully (${processingTime}ms)`, {
            studentId: req.user._id,
            courseId
        });

        return res.status(200).json({
            success: true,
            course: {
                _id: course._id,
                title: course.title,
                subject: course.subject,
                gradeLevel: course.gradeLevel,
                chapterNumber: course.chapterNumber,
                curriculum: course.curriculum,
                description: course.description,
                displayName: course.displayName,
                topics: course.topics, // Students get full topics and activities
                totalDuration: course.totalDuration,
                stats: course.stats
            },
            studentInfo: {
                name: student.name,
                rollNumber: student.studentDetails?.rollNumber,
                class: student.section.class.name,
                section: student.section.name,
                fullSection: `${student.section.class.grade}-${student.section.name}`
            }
        });

    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[COURSE-VIEW] Student course details retrieval failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error retrieving course details',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};