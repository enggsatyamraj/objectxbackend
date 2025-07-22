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

        // Validate each topic (no need to validate topicNumber as it's auto-generated)
        for (const topic of topics) {
            if (!topic.title || !topic.activities || !Array.isArray(topic.activities)) {
                return res.status(400).json({
                    success: false,
                    message: 'Each topic must have title and activities array'
                });
            }

            // Validate each activity (no need to validate activityNumber as it's auto-generated)
            for (const activity of topic.activities) {
                if (!activity.title || !activity.description || !activity.videos || !activity.duration) {
                    return res.status(400).json({
                        success: false,
                        message: 'Each activity must have title, description, videos, and duration'
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

        // If organize=true and no specific filters, organize by grade and subject as key-value object
        if (organize === 'true' && !gradeLevel && !subject && !search) {
            // Organize courses as key-value object: Grade -> Subject -> Courses
            const organizedCourses = {};

            courses.forEach(course => {
                const grade = `Grade ${course.gradeLevel}`;
                const subject = course.subject;

                // Initialize grade if doesn't exist
                if (!organizedCourses[grade]) {
                    organizedCourses[grade] = {};
                }

                // Initialize subject array if doesn't exist
                if (!organizedCourses[grade][subject]) {
                    organizedCourses[grade][subject] = [];
                }

                // Add course to the appropriate grade and subject
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

            // Sort courses within each subject by chapter number
            Object.keys(organizedCourses).forEach(grade => {
                Object.keys(organizedCourses[grade]).forEach(subject => {
                    organizedCourses[grade][subject].sort((a, b) => a.chapterNumber - b.chapterNumber);
                });
            });

            responseData = {
                success: true,
                organized: true,
                totalCourses: courses.length,
                totalGrades: Object.keys(organizedCourses).length,
                totalSubjects: [...new Set(courses.map(c => c.subject))].length,
                data: organizedCourses, // Key-value object instead of array
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
        const existingCourse = await Course.findById(courseId);
        if (!existingCourse || existingCourse.isDeleted) {
            return res.status(404).json({
                success: false,
                message: 'Course not found'
            });
        }

        // Check for conflicts if updating key fields (grade, subject, chapter, curriculum)
        if (updateData.gradeLevel || updateData.subject || updateData.chapterNumber || updateData.curriculum) {
            const conflictQuery = {
                _id: { $ne: courseId },
                gradeLevel: updateData.gradeLevel || existingCourse.gradeLevel,
                subject: updateData.subject || existingCourse.subject,
                chapterNumber: updateData.chapterNumber || existingCourse.chapterNumber,
                curriculum: updateData.curriculum || existingCourse.curriculum,
                isDeleted: false
            };

            const conflictCourse = await Course.findOne(conflictQuery);
            if (conflictCourse) {
                return res.status(400).json({
                    success: false,
                    message: `Another course already exists: Grade ${conflictQuery.gradeLevel} ${conflictQuery.subject} Chapter ${conflictQuery.chapterNumber} (${conflictQuery.curriculum})`
                });
            }
        }

        // Validate topics structure if topics are being updated
        if (updateData.topics) {
            if (!Array.isArray(updateData.topics) || updateData.topics.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Topics must be a non-empty array'
                });
            }

            // Validate each topic (no need to validate topicNumber as it's auto-generated)
            for (let topicIndex = 0; topicIndex < updateData.topics.length; topicIndex++) {
                const topic = updateData.topics[topicIndex];

                if (!topic.title || !topic.activities || !Array.isArray(topic.activities)) {
                    return res.status(400).json({
                        success: false,
                        message: `Topic ${topicIndex + 1} must have title and activities array`
                    });
                }

                // Validate each activity (no need to validate activityNumber as it's auto-generated)
                for (let activityIndex = 0; activityIndex < topic.activities.length; activityIndex++) {
                    const activity = topic.activities[activityIndex];

                    if (!activity.title || !activity.description || !activity.videos || !activity.duration) {
                        return res.status(400).json({
                            success: false,
                            message: `Activity ${activityIndex + 1} in Topic ${topicIndex + 1} must have title, description, videos, and duration`
                        });
                    }

                    // Validate video links
                    const { vrLink, mobileLink, demoLink } = activity.videos;
                    if (!vrLink || !mobileLink || !demoLink) {
                        return res.status(400).json({
                            success: false,
                            message: `Activity ${activityIndex + 1} in Topic ${topicIndex + 1} must have VR, Mobile, and Demo video links`
                        });
                    }

                    // Validate URLs
                    const urlPattern = /^https?:\/\/.+/;
                    if (!urlPattern.test(vrLink) || !urlPattern.test(mobileLink) || !urlPattern.test(demoLink)) {
                        return res.status(400).json({
                            success: false,
                            message: `Activity ${activityIndex + 1} in Topic ${topicIndex + 1} has invalid video URLs`
                        });
                    }

                    // Validate duration
                    if (typeof activity.duration !== 'number' || activity.duration < 1 || activity.duration > 120) {
                        return res.status(400).json({
                            success: false,
                            message: `Activity ${activityIndex + 1} in Topic ${topicIndex + 1} duration must be between 1 and 120 minutes`
                        });
                    }
                }
            }
        }

        // Prepare update object
        const updateFields = {};

        // Update basic course info
        if (updateData.title) updateFields.title = updateData.title.trim();
        if (updateData.subject) updateFields.subject = updateData.subject;
        if (updateData.gradeLevel) updateFields.gradeLevel = parseInt(updateData.gradeLevel);
        if (updateData.chapterNumber) updateFields.chapterNumber = parseInt(updateData.chapterNumber);
        if (updateData.curriculum) updateFields.curriculum = updateData.curriculum;
        if (updateData.description) updateFields.description = updateData.description.trim();
        if (updateData.topics) updateFields.topics = updateData.topics;
        if (typeof updateData.isActive === 'boolean') updateFields.isActive = updateData.isActive;

        // Always update lastUpdatedBy
        updateFields.lastUpdatedBy = req.user._id;

        // Update course (pre-save middleware will auto-generate topic/activity numbers)
        const updatedCourse = await Course.findByIdAndUpdate(
            courseId,
            updateFields,
            {
                new: true,
                runValidators: true
            }
        ).populate('createdBy lastUpdatedBy', 'name email');

        const processingTime = Date.now() - startTime;
        logger.info(`[COURSE] Course updated successfully (${processingTime}ms)`, {
            superAdminId: req.user._id,
            courseId,
            fieldsUpdated: Object.keys(updateFields)
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
                topics: updatedCourse.topics, // Include full topics with auto-generated numbers
                totalTopics: updatedCourse.stats.totalTopics,
                totalActivities: updatedCourse.stats.totalActivities,
                totalDuration: updatedCourse.totalDuration,
                averageDuration: updatedCourse.stats.averageDuration,
                isActive: updatedCourse.isActive,
                createdAt: updatedCourse.createdAt,
                updatedAt: updatedCourse.updatedAt,
                createdBy: updatedCourse.createdBy,
                lastUpdatedBy: updatedCourse.lastUpdatedBy
            }
        });

    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[COURSE] Course update failed (${processingTime}ms):`, error);

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
                message: 'A course with this grade, subject, and chapter already exists'
            });
        }

        // Handle cast errors (invalid ObjectId, etc.)
        if (error.name === 'CastError') {
            return res.status(400).json({
                success: false,
                message: 'Invalid course ID format'
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