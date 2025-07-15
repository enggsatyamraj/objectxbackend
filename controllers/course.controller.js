// File: controllers/course.controller.js

import Course from '../models/course.model.js';
import logger from '../utils/logger.js';

// POST /superadmin/courses - Create new course
export const createCourse = async (req, res) => {
    const startTime = Date.now();
    logger.info('[COURSE] Starting course creation process', { superAdminId: req.user._id });

    try {
        // Extract data from request body
        const {
            title,
            subject,
            gradeLevel,
            chapterNumber,
            curriculum,
            description,
            topics
        } = req.body;

        // Verify user is SuperAdmin
        if (req.user.role !== 'superAdmin') {
            logger.warn('[COURSE] Unauthorized course creation attempt', {
                userId: req.user._id,
                role: req.user.role
            });
            return res.status(403).json({
                success: false,
                message: 'Only SuperAdmins can create courses'
            });
        }

        // Check if course already exists
        const existingCourse = await Course.findOne({
            gradeLevel,
            subject,
            chapterNumber,
            curriculum,
            isDeleted: false
        });

        if (existingCourse) {
            logger.warn('[COURSE] Course creation failed: Course already exists', {
                gradeLevel,
                subject,
                chapterNumber,
                curriculum
            });
            return res.status(400).json({
                success: false,
                message: `Course already exists: Grade ${gradeLevel} ${subject} Chapter ${chapterNumber} (${curriculum})`
            });
        }

        // Validate topics and activities structure
        if (!topics || !Array.isArray(topics) || topics.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'At least one topic is required'
            });
        }

        // Validate each topic
        for (const topic of topics) {
            if (!topic.topicNumber || !topic.title || !topic.activities || !Array.isArray(topic.activities)) {
                return res.status(400).json({
                    success: false,
                    message: 'Each topic must have topicNumber, title, and activities array'
                });
            }

            // Validate each activity
            for (const activity of topic.activities) {
                if (!activity.activityNumber || !activity.title || !activity.description || !activity.videos || !activity.duration) {
                    return res.status(400).json({
                        success: false,
                        message: 'Each activity must have activityNumber, title, description, videos, and duration'
                    });
                }

                // Validate video links
                const { vrLink, mobileLink, demoLink } = activity.videos;
                if (!vrLink || !mobileLink || !demoLink) {
                    return res.status(400).json({
                        success: false,
                        message: 'Each activity must have VR, Mobile, and Demo video links'
                    });
                }
            }
        }

        // Create course
        const course = await Course.create({
            title,
            subject,
            gradeLevel,
            chapterNumber,
            curriculum,
            description,
            topics,
            createdBy: req.user._id
        });

        const processingTime = Date.now() - startTime;
        logger.info(`[COURSE] Course created successfully (${processingTime}ms)`, {
            courseId: course._id,
            superAdminId: req.user._id,
            title: course.title
        });

        return res.status(201).json({
            success: true,
            message: 'Course created successfully!',
            course: {
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
                totalDuration: course.totalDuration,
                createdAt: course.createdAt
            }
        });

    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[COURSE] Course creation failed (${processingTime}ms):`, error);

        // Handle validation errors
        if (error.name === 'ValidationError') {
            const validationErrors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: validationErrors
            });
        }

        // Handle duplicate key error
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Course with this grade, subject, and chapter already exists'
            });
        }

        return res.status(500).json({
            success: false,
            message: 'Server error during course creation',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};

// GET /superadmin/courses - Get all courses organized by grade and subject
export const getAllCourses = async (req, res) => {
    const startTime = Date.now();
    logger.info('[COURSE] Retrieving all courses', { superAdminId: req.user._id });

    try {
        // Verify user is SuperAdmin
        if (req.user.role !== 'superAdmin') {
            return res.status(403).json({
                success: false,
                message: 'Only SuperAdmins can view all courses'
            });
        }

        // Get query parameters for filtering
        const {
            page = 1,
            limit = 50, // Increase default limit for better organization view
            subject,
            gradeLevel,
            curriculum,
            search,
            sortBy = 'gradeLevel',
            sortOrder = 'asc',
            organize = 'true' // New parameter to control organization
        } = req.query;

        // Build filter query
        const filterQuery = { isDeleted: false };

        if (subject) {
            filterQuery.subject = subject;
        }

        if (gradeLevel) {
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

        // Get all courses that match filter
        const courses = await Course.find(filterQuery)
            .populate('createdBy', 'name email')
            .select('-topics') // Exclude topics for list view (performance)
            .sort({ gradeLevel: 1, subject: 1, chapterNumber: 1 }); // Always sort by grade, subject, chapter

        let responseData;

        // If organize=true and no specific filters, organize by grade and subject
        if (organize === 'true' && !gradeLevel && !subject && !search) {
            // Organize courses by grade level and subject
            const organizedCourses = {};

            courses.forEach(course => {
                const grade = `Grade ${course.gradeLevel}`;
                const subject = course.subject;

                if (!organizedCourses[grade]) {
                    organizedCourses[grade] = {};
                }

                if (!organizedCourses[grade][subject]) {
                    organizedCourses[grade][subject] = [];
                }

                organizedCourses[grade][subject].push({
                    _id: course._id,
                    title: course.title,
                    chapterNumber: course.chapterNumber,
                    curriculum: course.curriculum,
                    description: course.description,
                    displayName: course.displayName,
                    totalTopics: course.stats.totalTopics,
                    totalActivities: course.stats.totalActivities,
                    averageDuration: course.stats.averageDuration,
                    isActive: course.isActive,
                    createdAt: course.createdAt,
                    createdBy: {
                        _id: course.createdBy._id,
                        name: course.createdBy.name
                    }
                });
            });

            // Convert organized data to array format for easier frontend handling
            const organizedArray = [];
            Object.keys(organizedCourses).sort((a, b) => {
                const gradeA = parseInt(a.replace('Grade ', ''));
                const gradeB = parseInt(b.replace('Grade ', ''));
                return gradeA - gradeB;
            }).forEach(grade => {
                const gradeData = {
                    grade: grade,
                    gradeLevel: parseInt(grade.replace('Grade ', '')),
                    subjects: []
                };

                Object.keys(organizedCourses[grade]).sort().forEach(subject => {
                    gradeData.subjects.push({
                        subject: subject,
                        courseCount: organizedCourses[grade][subject].length,
                        courses: organizedCourses[grade][subject].sort((a, b) => a.chapterNumber - b.chapterNumber)
                    });
                });

                organizedArray.push(gradeData);
            });

            responseData = {
                success: true,
                organized: true,
                totalCourses: courses.length,
                totalGrades: organizedArray.length,
                totalSubjects: [...new Set(courses.map(c => c.subject))].length,
                data: organizedArray,
                availableFilters: {
                    grades: [...new Set(courses.map(c => c.gradeLevel))].sort((a, b) => a - b),
                    subjects: [...new Set(courses.map(c => c.subject))].sort(),
                    curricula: [...new Set(courses.map(c => c.curriculum))].sort()
                }
            };

        } else {
            // Return flat list with pagination when filters are applied
            const skip = (parseInt(page) - 1) * parseInt(limit);
            const paginatedCourses = courses.slice(skip, skip + parseInt(limit));
            const totalCount = courses.length;
            const totalPages = Math.ceil(totalCount / parseInt(limit));
            const hasNextPage = parseInt(page) < totalPages;
            const hasPrevPage = parseInt(page) > 1;

            responseData = {
                success: true,
                organized: false,
                courses: paginatedCourses.map(course => ({
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
                    isActive: course.isActive,
                    createdAt: course.createdAt,
                    createdBy: {
                        _id: course.createdBy._id,
                        name: course.createdBy.name
                    }
                })),
                pagination: {
                    currentPage: parseInt(page),
                    totalPages,
                    totalCount,
                    hasNextPage,
                    hasPrevPage,
                    limit: parseInt(limit)
                },
                appliedFilters: {
                    gradeLevel: gradeLevel ? parseInt(gradeLevel) : null,
                    subject: subject || null,
                    curriculum: curriculum || null,
                    search: search || null
                }
            };
        }

        const processingTime = Date.now() - startTime;
        logger.info(`[COURSE] Courses retrieved successfully (${processingTime}ms)`, {
            superAdminId: req.user._id,
            courseCount: courses.length,
            organized: organize === 'true' && !gradeLevel && !subject && !search
        });

        return res.status(200).json(responseData);

    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[COURSE] Courses retrieval failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error retrieving courses',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};

// GET /superadmin/courses/:id - Get course details by ID
export const getCourseById = async (req, res) => {
    const startTime = Date.now();
    logger.info('[COURSE] Retrieving course by ID', {
        superAdminId: req.user._id,
        courseId: req.params.id
    });

    try {
        // Verify user is SuperAdmin
        if (req.user.role !== 'superAdmin') {
            return res.status(403).json({
                success: false,
                message: 'Only SuperAdmins can view course details'
            });
        }

        const courseId = req.params.id;

        // Find course by ID
        const course = await Course.findById(courseId)
            .populate('createdBy', 'name email')
            .populate('lastUpdatedBy', 'name email');

        if (!course || course.isDeleted) {
            logger.warn('[COURSE] Course not found', { courseId });
            return res.status(404).json({
                success: false,
                message: 'Course not found'
            });
        }

        const processingTime = Date.now() - startTime;
        logger.info(`[COURSE] Course retrieved successfully (${processingTime}ms)`, {
            superAdminId: req.user._id,
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
                isActive: course.isActive,
                createdAt: course.createdAt,
                updatedAt: course.updatedAt,
                createdBy: course.createdBy,
                lastUpdatedBy: course.lastUpdatedBy
            }
        });

    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[COURSE] Course retrieval failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error retrieving course',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};

// PUT /superadmin/courses/:id - Update course
export const updateCourse = async (req, res) => {
    const startTime = Date.now();
    logger.info('[COURSE] Starting course update process', {
        superAdminId: req.user._id,
        courseId: req.params.id
    });

    try {
        // Verify user is SuperAdmin
        if (req.user.role !== 'superAdmin') {
            return res.status(403).json({
                success: false,
                message: 'Only SuperAdmins can update courses'
            });
        }

        const courseId = req.params.id;
        const updateData = req.body;

        // Find course
        const course = await Course.findById(courseId);
        if (!course || course.isDeleted) {
            return res.status(404).json({
                success: false,
                message: 'Course not found'
            });
        }

        // Check for conflicts if updating key fields
        if (updateData.gradeLevel || updateData.subject || updateData.chapterNumber || updateData.curriculum) {
            const conflictCourse = await Course.findOne({
                _id: { $ne: courseId },
                gradeLevel: updateData.gradeLevel || course.gradeLevel,
                subject: updateData.subject || course.subject,
                chapterNumber: updateData.chapterNumber || course.chapterNumber,
                curriculum: updateData.curriculum || course.curriculum,
                isDeleted: false
            });

            if (conflictCourse) {
                return res.status(400).json({
                    success: false,
                    message: 'Another course with this grade, subject, and chapter already exists'
                });
            }
        }

        // Update course
        updateData.lastUpdatedBy = req.user._id;
        const updatedCourse = await Course.findByIdAndUpdate(
            courseId,
            updateData,
            { new: true, runValidators: true }
        ).populate('createdBy lastUpdatedBy', 'name email');

        const processingTime = Date.now() - startTime;
        logger.info(`[COURSE] Course updated successfully (${processingTime}ms)`, {
            superAdminId: req.user._id,
            courseId
        });

        return res.status(200).json({
            success: true,
            message: 'Course updated successfully',
            course: {
                _id: updatedCourse._id,
                title: updatedCourse.title,
                subject: updatedCourse.subject,
                gradeLevel: updatedCourse.gradeLevel,
                chapterNumber: updatedCourse.chapterNumber,
                curriculum: updatedCourse.curriculum,
                description: updatedCourse.description,
                displayName: updatedCourse.displayName,
                totalTopics: updatedCourse.stats.totalTopics,
                totalActivities: updatedCourse.stats.totalActivities,
                totalDuration: updatedCourse.totalDuration,
                updatedAt: updatedCourse.updatedAt,
                lastUpdatedBy: updatedCourse.lastUpdatedBy
            }
        });

    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[COURSE] Course update failed (${processingTime}ms):`, error);

        if (error.name === 'ValidationError') {
            const validationErrors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: validationErrors
            });
        }

        return res.status(500).json({
            success: false,
            message: 'Server error updating course',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};

// DELETE /superadmin/courses/:id - Delete course (soft delete)
export const deleteCourse = async (req, res) => {
    const startTime = Date.now();
    logger.info('[COURSE] Starting course deletion process', {
        superAdminId: req.user._id,
        courseId: req.params.id
    });

    try {
        // Verify user is SuperAdmin
        if (req.user.role !== 'superAdmin') {
            return res.status(403).json({
                success: false,
                message: 'Only SuperAdmins can delete courses'
            });
        }

        const courseId = req.params.id;

        // Find and soft delete course
        const course = await Course.findById(courseId);
        if (!course || course.isDeleted) {
            return res.status(404).json({
                success: false,
                message: 'Course not found'
            });
        }

        // Soft delete
        await Course.softDelete(courseId);

        const processingTime = Date.now() - startTime;
        logger.info(`[COURSE] Course deleted successfully (${processingTime}ms)`, {
            superAdminId: req.user._id,
            courseId
        });

        return res.status(200).json({
            success: true,
            message: 'Course deleted successfully'
        });

    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[COURSE] Course deletion failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error deleting course',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};

// GET /superadmin/courses/stats - Get course statistics
export const getCourseStatistics = async (req, res) => {
    const startTime = Date.now();
    logger.info('[COURSE] Retrieving course statistics', { superAdminId: req.user._id });

    try {
        // Verify user is SuperAdmin
        if (req.user.role !== 'superAdmin') {
            return res.status(403).json({
                success: false,
                message: 'Only SuperAdmins can view course statistics'
            });
        }

        // Get comprehensive statistics
        const stats = await Course.getCourseStats();

        const processingTime = Date.now() - startTime;
        logger.info(`[COURSE] Course statistics retrieved successfully (${processingTime}ms)`, {
            superAdminId: req.user._id
        });

        return res.status(200).json({
            success: true,
            statistics: stats
        });

    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[COURSE] Course statistics retrieval failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error retrieving course statistics',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};