// File: controllers/student.course.controller.js

import Course from '../models/course.model.js';
import User from '../models/user.model.js';
import logger from '../utils/logger.js';

// ==================== STUDENT COURSE ACCESS CONTROLLERS ====================

// GET /student/courses - Get all courses available for student's grade
export const getStudentCourses = async (req, res) => {
    const startTime = Date.now();
    logger.info('[STUDENT-COURSE] Getting courses for student', { studentId: req.user._id });

    try {
        // Get student with section and class details
        const student = await User.findById(req.user._id)
            .populate({
                path: 'section',
                populate: {
                    path: 'class',
                    select: 'name grade academicYear'
                }
            })
            .populate('organization', 'name brandName');

        // Verify student role and section enrollment
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

        // Get query parameters for filtering
        const {
            page = 1,
            limit = 12,
            subject,
            curriculum = 'NCERT',
            search,
            sortBy = 'subject',
            sortOrder = 'asc'
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

        // Group courses by subject for better organization
        const coursesBySubject = {};
        courses.forEach(course => {
            if (!coursesBySubject[course.subject]) {
                coursesBySubject[course.subject] = [];
            }
            coursesBySubject[course.subject].push({
                _id: course._id,
                title: course.title,
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

        // Sort courses within each subject by chapter number
        Object.keys(coursesBySubject).forEach(subject => {
            coursesBySubject[subject].sort((a, b) => a.chapterNumber - b.chapterNumber);
        });

        const processingTime = Date.now() - startTime;
        logger.info(`[STUDENT-COURSE] Student courses retrieved successfully (${processingTime}ms)`, {
            studentId: req.user._id,
            studentGrade,
            courseCount: courses.length,
            totalCount
        });

        return res.status(200).json({
            success: true,
            courses: courses.map(course => ({
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
            })),
            coursesBySubject,
            studentInfo: {
                name: student.name,
                rollNumber: student.studentDetails?.rollNumber,
                class: student.section.class.name,
                section: student.section.name,
                fullSection: `${student.section.class.grade}-${student.section.name}`,
                grade: studentGrade,
                organization: student.organization
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
                currentGrade: studentGrade,
                availableSubjects: [...new Set(courses.map(c => c.subject))].sort(),
                availableCurricula: [...new Set(courses.map(c => c.curriculum))].sort(),
                appliedFilters: {
                    subject: subject || null,
                    curriculum: curriculum,
                    search: search || null
                }
            }
        });

    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[STUDENT-COURSE] Student courses retrieval failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error retrieving courses',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};

// GET /student/courses/:courseId - Get detailed course with full topics and activities
export const getStudentCourseDetails = async (req, res) => {
    const startTime = Date.now();
    logger.info('[STUDENT-COURSE] Getting course details for student', {
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
                message: 'Only students can access course details'
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

        // Find course and verify it's for student's grade
        const course = await Course.findById(courseId);

        if (!course || course.isDeleted || !course.isActive) {
            return res.status(404).json({
                success: false,
                message: 'Course not found or not available'
            });
        }

        // Check if course is for student's grade
        if (course.gradeLevel !== studentGrade) {
            logger.warn('[STUDENT-COURSE] Student attempted to access course for different grade', {
                studentId: req.user._id,
                studentGrade,
                courseGrade: course.gradeLevel,
                courseId
            });

            return res.status(403).json({
                success: false,
                message: `This course is for Grade ${course.gradeLevel}, but you are in Grade ${studentGrade}`
            });
        }

        // Get learning progress (you can implement this later with a Progress model)
        const learningProgress = {
            completedTopics: 0,
            completedActivities: 0,
            totalTopics: course.stats.totalTopics,
            totalActivities: course.stats.totalActivities,
            progressPercentage: 0,
            lastAccessedActivity: null,
            timeSpent: 0 // in minutes
        };

        const processingTime = Date.now() - startTime;
        logger.info(`[STUDENT-COURSE] Course details retrieved successfully (${processingTime}ms)`, {
            studentId: req.user._id,
            courseId,
            studentGrade
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
                topics: course.topics, // Full topics with activities for learning
                totalDuration: course.totalDuration,
                stats: course.stats,
                createdAt: course.createdAt,
                updatedAt: course.updatedAt
            },
            studentInfo: {
                name: student.name,
                rollNumber: student.studentDetails?.rollNumber,
                class: student.section.class.name,
                section: student.section.name,
                fullSection: `${student.section.class.grade}-${student.section.name}`
            },
            learningProgress
        });

    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[STUDENT-COURSE] Course details retrieval failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error retrieving course details',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};

// GET /student/courses/subjects - Get available subjects for student's grade
export const getAvailableSubjects = async (req, res) => {
    const startTime = Date.now();
    logger.info('[STUDENT-COURSE] Getting available subjects for student', { studentId: req.user._id });

    try {
        const student = await User.findById(req.user._id)
            .populate({
                path: 'section',
                populate: {
                    path: 'class',
                    select: 'grade'
                }
            });

        if (!student || student.role !== 'student') {
            return res.status(403).json({
                success: false,
                message: 'Only students can access subject information'
            });
        }

        if (!student.section || !student.section.class) {
            return res.status(400).json({
                success: false,
                message: 'Student must be enrolled in a section'
            });
        }

        const studentGrade = student.section.class.grade;

        // Get all unique subjects available for student's grade
        const subjects = await Course.distinct('subject', {
            gradeLevel: studentGrade,
            isActive: true,
            isDeleted: false
        });

        // Get course count for each subject
        const subjectStats = await Promise.all(
            subjects.map(async (subject) => {
                const courseCount = await Course.countDocuments({
                    gradeLevel: studentGrade,
                    subject: subject,
                    isActive: true,
                    isDeleted: false
                });

                return {
                    subject,
                    courseCount,
                    displayName: subject.charAt(0).toUpperCase() + subject.slice(1)
                };
            })
        );

        // Sort subjects alphabetically
        subjectStats.sort((a, b) => a.subject.localeCompare(b.subject));

        const processingTime = Date.now() - startTime;
        logger.info(`[STUDENT-COURSE] Available subjects retrieved successfully (${processingTime}ms)`, {
            studentId: req.user._id,
            studentGrade,
            subjectCount: subjects.length
        });

        return res.status(200).json({
            success: true,
            subjects: subjectStats,
            studentGrade,
            totalSubjects: subjects.length,
            totalCourses: subjectStats.reduce((total, subject) => total + subject.courseCount, 0)
        });

    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[STUDENT-COURSE] Available subjects retrieval failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error retrieving available subjects',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};

// GET /student/courses/search - Advanced course search for students
export const searchStudentCourses = async (req, res) => {
    const startTime = Date.now();
    logger.info('[STUDENT-COURSE] Searching courses for student', { studentId: req.user._id });

    try {
        const student = await User.findById(req.user._id)
            .populate({
                path: 'section',
                populate: {
                    path: 'class',
                    select: 'grade'
                }
            });

        if (!student || student.role !== 'student') {
            return res.status(403).json({
                success: false,
                message: 'Only students can search courses'
            });
        }

        if (!student.section || !student.section.class) {
            return res.status(400).json({
                success: false,
                message: 'Student must be enrolled in a section'
            });
        }

        const {
            q: searchQuery,
            subject,
            curriculum,
            minDuration,
            maxDuration,
            limit = 10
        } = req.query;

        if (!searchQuery || searchQuery.trim().length < 2) {
            return res.status(400).json({
                success: false,
                message: 'Search query must be at least 2 characters long'
            });
        }

        const studentGrade = student.section.class.grade;

        // Build search filter
        const filterQuery = {
            gradeLevel: studentGrade,
            isActive: true,
            isDeleted: false,
            $or: [
                { title: { $regex: searchQuery, $options: 'i' } },
                { description: { $regex: searchQuery, $options: 'i' } },
                { 'topics.title': { $regex: searchQuery, $options: 'i' } },
                { 'topics.activities.title': { $regex: searchQuery, $options: 'i' } }
            ]
        };

        if (subject) {
            filterQuery.subject = subject;
        }

        if (curriculum) {
            filterQuery.curriculum = curriculum;
        }

        // Duration filter (if provided)
        if (minDuration || maxDuration) {
            filterQuery.$expr = {};
            if (minDuration) {
                filterQuery.$expr.$gte = [{ $sum: '$topics.activities.duration' }, parseInt(minDuration)];
            }
            if (maxDuration) {
                filterQuery.$expr.$lte = [{ $sum: '$topics.activities.duration' }, parseInt(maxDuration)];
            }
        }

        // Execute search
        const courses = await Course.find(filterQuery)
            .select('title subject chapterNumber curriculum description displayName stats createdAt')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit));

        const processingTime = Date.now() - startTime;
        logger.info(`[STUDENT-COURSE] Course search completed (${processingTime}ms)`, {
            studentId: req.user._id,
            searchQuery,
            resultCount: courses.length
        });

        return res.status(200).json({
            success: true,
            searchQuery,
            results: courses.map(course => ({
                _id: course._id,
                title: course.title,
                subject: course.subject,
                chapterNumber: course.chapterNumber,
                curriculum: course.curriculum,
                description: course.description,
                displayName: course.displayName,
                totalTopics: course.stats.totalTopics,
                totalActivities: course.stats.totalActivities,
                averageDuration: course.stats.averageDuration
            })),
            totalResults: courses.length,
            studentGrade
        });

    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[STUDENT-COURSE] Course search failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error during course search',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};

// GET /student/dashboard/course-summary - Get course summary for student dashboard
export const getStudentCourseSummary = async (req, res) => {
    const startTime = Date.now();
    logger.info('[STUDENT-COURSE] Getting course summary for student dashboard', { studentId: req.user._id });

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
                message: 'Only students can access course summary'
            });
        }

        if (!student.section || !student.section.class) {
            return res.status(400).json({
                success: false,
                message: 'Student must be enrolled in a section'
            });
        }

        const studentGrade = student.section.class.grade;

        // Get course statistics for student's grade
        const [
            totalCourses,
            subjectCount,
            recentCourses,
            subjectDistribution
        ] = await Promise.all([
            Course.countDocuments({
                gradeLevel: studentGrade,
                isActive: true,
                isDeleted: false
            }),
            Course.distinct('subject', {
                gradeLevel: studentGrade,
                isActive: true,
                isDeleted: false
            }).then(subjects => subjects.length),
            Course.find({
                gradeLevel: studentGrade,
                isActive: true,
                isDeleted: false
            })
                .select('title subject chapterNumber displayName createdAt')
                .sort({ createdAt: -1 })
                .limit(5),
            Course.aggregate([
                {
                    $match: {
                        gradeLevel: studentGrade,
                        isActive: true,
                        isDeleted: false
                    }
                },
                {
                    $group: {
                        _id: '$subject',
                        count: { $sum: 1 },
                        totalActivities: { $sum: '$stats.totalActivities' }
                    }
                },
                {
                    $sort: { count: -1 }
                }
            ])
        ]);

        const processingTime = Date.now() - startTime;
        logger.info(`[STUDENT-COURSE] Course summary retrieved successfully (${processingTime}ms)`, {
            studentId: req.user._id,
            studentGrade,
            totalCourses
        });

        return res.status(200).json({
            success: true,
            summary: {
                totalCourses,
                totalSubjects: subjectCount,
                averageCoursesPerSubject: subjectCount > 0 ? Math.round(totalCourses / subjectCount) : 0,
                studentGrade
            },
            recentCourses: recentCourses.map(course => ({
                _id: course._id,
                title: course.title,
                subject: course.subject,
                chapterNumber: course.chapterNumber,
                displayName: course.displayName,
                createdAt: course.createdAt
            })),
            subjectDistribution: subjectDistribution.map(item => ({
                subject: item._id,
                courseCount: item.count,
                totalActivities: item.totalActivities
            }))
        });

    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[STUDENT-COURSE] Course summary retrieval failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error retrieving course summary',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};