import Class from '../models/class.models.js';
import School from '../models/school.models.js';
import User from '../models/user.models.js';
import logger from '../utils/logger.js';
import mongoose from 'mongoose';

/**
 * @desc    Create a new class
 * @route   POST /api/v1/classes
 * @access  Private/Admin/SuperAdmin/Teacher
 */
export const createClass = async (req, res) => {
    const startTime = Date.now();
    logger.info('[CLASS] Starting class creation process');

    try {
        // Extract validated data from the request
        const { name, school: schoolId } = req.body.class;

        // Check if school exists
        const school = await School.findById(schoolId);
        if (!school) {
            logger.warn('[CLASS] School not found', { schoolId });
            return res.status(404).json({
                success: false,
                message: 'School not found',
            });
        }

        // Access control for teachers - they can only create classes in their school
        if (req.user.role === 'teacher') {
            if (!req.user.school || req.user.school.toString() !== schoolId) {
                logger.warn('[CLASS] Teacher attempted to create class in another school', {
                    teacherId: req.user._id,
                    teacherSchool: req.user.school,
                    requestedSchool: schoolId,
                });
                return res.status(403).json({
                    success: false,
                    message: 'You can only create classes in your own school',
                });
            }
        }

        // Create new class
        const newClass = new Class({
            name,
            school: schoolId,
        });

        await newClass.save();

        // Add class to school
        school.classes.push(newClass._id);
        await school.save();

        // Calculate processing time
        const processingTime = Date.now() - startTime;
        logger.info(`[CLASS] Class created successfully (${processingTime}ms)`, {
            classId: newClass._id,
            schoolId,
            createdBy: req.user._id,
        });

        // Send successful response
        return res.status(201).json({
            success: true,
            class: newClass,
        });
    } catch (error) {
        // Calculate processing time even for errors
        const processingTime = Date.now() - startTime;

        logger.error(`[CLASS] Class creation failed (${processingTime}ms):`, error);

        // Check for duplicate key error
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'A class with this name already exists in this school',
            });
        }

        // Handle validation errors
        if (error.name === 'ValidationError') {
            const validationErrors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: validationErrors,
            });
        }

        // Default server error
        return res.status(500).json({
            success: false,
            message: 'Server error during class creation',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
        });
    }
};

/**
 * @desc    Get all classes
 * @route   GET /api/v1/classes
 * @access  Private/Admin/SuperAdmin
 */
export const getAllClasses = async (req, res) => {
    const startTime = Date.now();
    logger.info('[CLASS] Fetching all classes');

    try {
        // Setup pagination
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // Setup filters
        const filter = {};

        // Filter by school if provided
        if (req.query.school && mongoose.Types.ObjectId.isValid(req.query.school)) {
            filter.school = req.query.school;
        }

        // Filter by name if provided (case insensitive partial match)
        if (req.query.name) {
            filter.name = { $regex: req.query.name, $options: 'i' };
        }

        // Role-based filtering
        if (req.user.role === 'teacher') {
            // Teachers can only see classes in their school
            filter.school = req.user.school;
        }

        // Count total documents for pagination info
        const total = await Class.countDocuments(filter);

        // Fetch classes with pagination
        const classes = await Class.find(filter)
            .populate('school', 'name email')
            .sort({ name: 1 })
            .skip(skip)
            .limit(limit);

        // Calculate processing time
        const processingTime = Date.now() - startTime;
        logger.info(`[CLASS] Classes fetched successfully (${processingTime}ms)`, {
            count: classes.length,
            totalCount: total,
            page,
        });

        // Send successful response
        return res.status(200).json({
            success: true,
            count: classes.length,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            totalResults: total,
            classes,
        });
    } catch (error) {
        // Calculate processing time even for errors
        const processingTime = Date.now() - startTime;

        logger.error(`[CLASS] Fetching classes failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error fetching classes',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
        });
    }
};

/**
 * @desc    Get class by ID
 * @route   GET /api/v1/classes/:id
 * @access  Private
 */
export const getClassById = async (req, res) => {
    const startTime = Date.now();
    logger.info('[CLASS] Fetching class by ID', { classId: req.params.id });

    try {
        const classId = req.params.id;

        // Validate MongoDB ID
        if (!mongoose.Types.ObjectId.isValid(classId)) {
            logger.warn('[CLASS] Invalid class ID format', { classId });
            return res.status(400).json({
                success: false,
                message: 'Invalid class ID',
            });
        }

        // Fetch class with related data
        const classData = await Class.findById(classId)
            .populate('school', 'name email')
            .populate('students', 'name email')
            .populate('courses', 'title description');

        // Check if class exists
        if (!classData) {
            logger.warn('[CLASS] Class not found', { classId });
            return res.status(404).json({
                success: false,
                message: 'Class not found',
            });
        }

        // Role-based access control
        if (req.user.role === 'teacher' || req.user.role === 'student') {
            // Check if user belongs to the class's school
            if (!req.user.school || req.user.school.toString() !== classData.school._id.toString()) {
                logger.warn('[CLASS] Unauthorized access attempt', {
                    userId: req.user._id,
                    userSchool: req.user.school,
                    classSchool: classData.school._id,
                });
                return res.status(403).json({
                    success: false,
                    message: 'You do not have permission to access this class',
                });
            }
        }

        // Calculate processing time
        const processingTime = Date.now() - startTime;
        logger.info(`[CLASS] Class fetched successfully (${processingTime}ms)`, { classId });

        // Send successful response
        return res.status(200).json({
            success: true,
            class: classData,
        });
    } catch (error) {
        // Calculate processing time even for errors
        const processingTime = Date.now() - startTime;

        logger.error(`[CLASS] Fetching class failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error fetching class',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
        });
    }
};

/**
 * @desc    Update class by ID
 * @route   PUT /api/v1/classes/:id
 * @access  Private/Admin/SuperAdmin/Teacher
 */
export const updateClass = async (req, res) => {
    const startTime = Date.now();
    logger.info('[CLASS] Updating class', { classId: req.params.id });

    try {
        const classId = req.params.id;

        // Validate MongoDB ID
        if (!mongoose.Types.ObjectId.isValid(classId)) {
            logger.warn('[CLASS] Invalid class ID format', { classId });
            return res.status(400).json({
                success: false,
                message: 'Invalid class ID',
            });
        }

        // Extract validated data
        const { name } = req.body.class;

        // Find class to update
        const classData = await Class.findById(classId).populate('school');

        // Check if class exists
        if (!classData) {
            logger.warn('[CLASS] Class not found for update', { classId });
            return res.status(404).json({
                success: false,
                message: 'Class not found',
            });
        }

        // Role-based access control
        if (req.user.role === 'teacher') {
            // Teachers can only update classes in their school
            if (!req.user.school || req.user.school.toString() !== classData.school._id.toString()) {
                logger.warn('[CLASS] Teacher attempted to update class in another school', {
                    teacherId: req.user._id,
                    teacherSchool: req.user.school,
                    classSchool: classData.school._id,
                });
                return res.status(403).json({
                    success: false,
                    message: 'You can only update classes in your own school',
                });
            }
        }

        // Update class fields
        classData.name = name;

        // Save updated class
        await classData.save();

        // Calculate processing time
        const processingTime = Date.now() - startTime;
        logger.info(`[CLASS] Class updated successfully (${processingTime}ms)`, { classId });

        // Send successful response
        return res.status(200).json({
            success: true,
            class: classData,
        });
    } catch (error) {
        // Calculate processing time even for errors
        const processingTime = Date.now() - startTime;

        logger.error(`[CLASS] Class update failed (${processingTime}ms):`, error);

        // Handle validation errors
        if (error.name === 'ValidationError') {
            const validationErrors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: validationErrors,
            });
        }

        // Handle duplicate key errors
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'A class with this name already exists in this school',
            });
        }

        return res.status(500).json({
            success: false,
            message: 'Server error updating class',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
        });
    }
};

/**
 * @desc    Delete class by ID
 * @route   DELETE /api/v1/classes/:id
 * @access  Private/Admin/SuperAdmin
 */
export const deleteClass = async (req, res) => {
    const startTime = Date.now();
    logger.info('[CLASS] Deleting class', { classId: req.params.id });

    try {
        const classId = req.params.id;

        // Validate MongoDB ID
        if (!mongoose.Types.ObjectId.isValid(classId)) {
            logger.warn('[CLASS] Invalid class ID format', { classId });
            return res.status(400).json({
                success: false,
                message: 'Invalid class ID',
            });
        }

        // Find class to delete
        const classData = await Class.findById(classId);

        // Check if class exists
        if (!classData) {
            logger.warn('[CLASS] Class not found for deletion', { classId });
            return res.status(404).json({
                success: false,
                message: 'Class not found',
            });
        }

        // Role-based access control for school admin
        if (req.user.role !== 'superAdmin' && req.user.role !== 'admin') {
            logger.warn('[CLASS] Unauthorized delete attempt', {
                userId: req.user._id,
                role: req.user.role,
            });
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to delete this class',
            });
        }

        // Check if class has associated courses
        if (classData.courses && classData.courses.length > 0) {
            logger.warn('[CLASS] Cannot delete class with associated courses', {
                classId,
                courseCount: classData.courses.length,
            });
            return res.status(400).json({
                success: false,
                message: 'Cannot delete class with associated courses. Remove all courses first.',
            });
        }

        // Remove class from school
        await School.findByIdAndUpdate(classData.school, {
            $pull: { classes: classId },
        });

        // Delete the class
        await Class.findByIdAndDelete(classId);

        // Calculate processing time
        const processingTime = Date.now() - startTime;
        logger.info(`[CLASS] Class deleted successfully (${processingTime}ms)`, { classId });

        // Send successful response
        return res.status(200).json({
            success: true,
            message: 'Class deleted successfully',
        });
    } catch (error) {
        // Calculate processing time even for errors
        const processingTime = Date.now() - startTime;

        logger.error(`[CLASS] Class deletion failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error deleting class',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
        });
    }
};

/**
 * @desc    Add a student to class
 * @route   POST /api/v1/classes/:id/students
 * @access  Private/Admin/SuperAdmin/Teacher
 */
export const addStudentToClass = async (req, res) => {
    const startTime = Date.now();
    logger.info('[CLASS] Adding student to class', { classId: req.params.id });

    try {
        const classId = req.params.id;

        // Get studentId from validated data
        const { studentId } = req.body;

        // Validate MongoDB IDs
        if (!mongoose.Types.ObjectId.isValid(classId) || !mongoose.Types.ObjectId.isValid(studentId)) {
            logger.warn('[CLASS] Invalid ID format');
            return res.status(400).json({
                success: false,
                message: 'Invalid ID format',
            });
        }

        // Find class
        const classData = await Class.findById(classId).populate('school');
        if (!classData) {
            logger.warn('[CLASS] Class not found', { classId });
            return res.status(404).json({
                success: false,
                message: 'Class not found',
            });
        }

        // Find student
        const student = await User.findById(studentId);
        if (!student) {
            logger.warn('[CLASS] Student not found', { studentId });
            return res.status(404).json({
                success: false,
                message: 'Student not found',
            });
        }

        // Verify user is a student
        if (student.role !== 'student') {
            logger.warn('[CLASS] User is not a student', { userId: studentId, role: student.role });
            return res.status(400).json({
                success: false,
                message: 'User is not a student',
            });
        }

        // Verify student belongs to the same school as the class
        if (!student.school || student.school.toString() !== classData.school._id.toString()) {
            logger.warn('[CLASS] Student belongs to a different school', {
                studentId,
                studentSchool: student.school,
                classSchool: classData.school._id,
            });
            return res.status(400).json({
                success: false,
                message: 'Student must belong to the same school as the class',
            });
        }

        // Role-based access control
        if (req.user.role === 'teacher') {
            // Teachers can only add students to classes in their school
            if (!req.user.school || req.user.school.toString() !== classData.school._id.toString()) {
                logger.warn('[CLASS] Teacher attempted to add student to class in another school', {
                    teacherId: req.user._id,
                    teacherSchool: req.user.school,
                    classSchool: classData.school._id,
                });
                return res.status(403).json({
                    success: false,
                    message: 'You can only add students to classes in your own school',
                });
            }
        }

        // Check if student is already in class
        if (classData.students.includes(studentId)) {
            logger.warn('[CLASS] Student already in class', { classId, studentId });
            return res.status(400).json({
                success: false,
                message: 'Student is already in this class',
            });
        }

        // Add student to class
        classData.students.push(studentId);
        await classData.save();

        // Calculate processing time
        const processingTime = Date.now() - startTime;
        logger.info(`[CLASS] Student added to class successfully (${processingTime}ms)`, {
            classId,
            studentId,
        });

        // Send successful response
        return res.status(200).json({
            success: true,
            message: 'Student added to class successfully',
            class: {
                _id: classData._id,
                name: classData.name,
            },
            student: {
                _id: student._id,
                name: student.name,
                email: student.email,
            },
        });
    } catch (error) {
        // Calculate processing time even for errors
        const processingTime = Date.now() - startTime;

        logger.error(`[CLASS] Adding student to class failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error adding student to class',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
        });
    }
};

/**
 * @desc    Remove a student from class
 * @route   DELETE /api/v1/classes/:id/students/:studentId
 * @access  Private/Admin/SuperAdmin/Teacher
 */
export const removeStudentFromClass = async (req, res) => {
    const startTime = Date.now();
    logger.info('[CLASS] Removing student from class', {
        classId: req.params.id,
        studentId: req.params.studentId,
    });

    try {
        const classId = req.params.id;
        const studentId = req.params.studentId;

        // Validate MongoDB IDs
        if (!mongoose.Types.ObjectId.isValid(classId) || !mongoose.Types.ObjectId.isValid(studentId)) {
            logger.warn('[CLASS] Invalid ID format');
            return res.status(400).json({
                success: false,
                message: 'Invalid ID format',
            });
        }

        // Find class
        const classData = await Class.findById(classId).populate('school');
        if (!classData) {
            logger.warn('[CLASS] Class not found', { classId });
            return res.status(404).json({
                success: false,
                message: 'Class not found',
            });
        }

        // Role-based access control
        if (req.user.role === 'teacher') {
            // Teachers can only remove students from classes in their school
            if (!req.user.school || req.user.school.toString() !== classData.school._id.toString()) {
                logger.warn('[CLASS] Teacher attempted to remove student from class in another school', {
                    teacherId: req.user._id,
                    teacherSchool: req.user.school,
                    classSchool: classData.school._id,
                });
                return res.status(403).json({
                    success: false,
                    message: 'You can only remove students from classes in your own school',
                });
            }
        }

        // Check if student is in class
        if (!classData.students.includes(studentId)) {
            logger.warn('[CLASS] Student not in class', { classId, studentId });
            return res.status(400).json({
                success: false,
                message: 'Student is not in this class',
            });
        }

        // Remove student from class
        classData.students = classData.students.filter(id => id.toString() !== studentId);
        await classData.save();

        // Calculate processing time
        const processingTime = Date.now() - startTime;
        logger.info(`[CLASS] Student removed from class successfully (${processingTime}ms)`, {
            classId,
            studentId,
        });

        // Send successful response
        return res.status(200).json({
            success: true,
            message: 'Student removed from class successfully',
        });
    } catch (error) {
        // Calculate processing time even for errors
        const processingTime = Date.now() - startTime;

        logger.error(`[CLASS] Removing student from class failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error removing student from class',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
        });
    }
};