import School from '../models/school.models.js';
import User from '../models/user.models.js';
import logger from '../utils/logger.js';
import mongoose from 'mongoose';

/**
 * @desc    Create a new school
 * @route   POST /api/v1/schools
 * @access  Private/Admin/SuperAdmin
 */
export const createSchool = async (req, res) => {
    const startTime = Date.now();
    logger.info('[SCHOOL] Starting school creation process');

    try {
        // Extract validated data from request body
        const { name, email, phone, address, website } = req.body.school;

        // Check if school with email already exists
        const existingSchool = await School.findOne({ email });
        if (existingSchool) {
            logger.warn('[SCHOOL] Creation failed: Email already in use', { email });
            return res.status(400).json({
                success: false,
                message: 'School with this email already exists',
            });
        }

        // Create school object
        const school = new School({
            name,
            email,
            phone: phone || '',
            address: address || '',
            website: website || '',
            createdBy: req.user._id,
        });

        // Save school to database
        await school.save();

        // Calculate processing time
        const processingTime = Date.now() - startTime;
        logger.info(`[SCHOOL] School created successfully (${processingTime}ms)`, {
            schoolId: school._id,
            name: school.name,
            createdBy: req.user._id,
        });

        // Send successful response
        return res.status(201).json({
            success: true,
            school,
        });
    } catch (error) {
        // Calculate processing time even for errors
        const processingTime = Date.now() - startTime;

        logger.error(`[SCHOOL] School creation failed (${processingTime}ms):`, error);

        // Check for duplicate key error
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'School with this information already exists',
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
            message: 'Server error during school creation',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
        });
    }
};

/**
 * @desc    Get all schools
 * @route   GET /api/v1/schools
 * @access  Private/Admin/SuperAdmin
 */
export const getAllSchools = async (req, res) => {
    const startTime = Date.now();
    logger.info('[SCHOOL] Fetching all schools');

    try {
        // Setup pagination
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // Setup filters
        const filter = {};
        if (req.query.name) {
            filter.name = { $regex: req.query.name, $options: 'i' };
        }

        // Count total documents for pagination info
        const total = await School.countDocuments(filter);

        // Fetch schools with pagination
        const schools = await School.find(filter)
            .populate('createdBy', 'name email')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // Calculate processing time
        const processingTime = Date.now() - startTime;
        logger.info(`[SCHOOL] Schools fetched successfully (${processingTime}ms)`, {
            count: schools.length,
            totalCount: total,
            page,
        });

        // Send successful response
        return res.status(200).json({
            success: true,
            count: schools.length,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            totalResults: total,
            schools,
        });
    } catch (error) {
        // Calculate processing time even for errors
        const processingTime = Date.now() - startTime;

        logger.error(`[SCHOOL] Fetching schools failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error fetching schools',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
        });
    }
};

/**
 * @desc    Get school by ID
 * @route   GET /api/v1/schools/:id
 * @access  Private/Admin/SuperAdmin/Teacher
 */
export const getSchoolById = async (req, res) => {
    const startTime = Date.now();
    logger.info('[SCHOOL] Fetching school by ID', { schoolId: req.params.id });

    try {
        const schoolId = req.params.id;

        // Validate MongoDB ID
        if (!mongoose.Types.ObjectId.isValid(schoolId)) {
            logger.warn('[SCHOOL] Invalid school ID format', { schoolId });
            return res.status(400).json({
                success: false,
                message: 'Invalid school ID',
            });
        }

        // Fetch school with related data
        const school = await School.findById(schoolId)
            .populate('createdBy', 'name email')
            .populate('students', 'name email')
            .populate('teachers', 'name email')
            .populate('classes');

        // Check if school exists
        if (!school) {
            logger.warn('[SCHOOL] School not found', { schoolId });
            return res.status(404).json({
                success: false,
                message: 'School not found',
            });
        }

        // Access control for non-admin users
        if (req.user.role !== 'superAdmin' && req.user.role !== 'admin') {
            // Teachers can only see their own school
            if (req.user.role === 'teacher' && !school.teachers.some(teacher => teacher._id.toString() === req.user._id.toString())) {
                logger.warn('[SCHOOL] Unauthorized access attempt', { userId: req.user._id, schoolId });
                return res.status(403).json({
                    success: false,
                    message: 'You are not authorized to view this school',
                });
            }

            // Students can only see their own school
            if (req.user.role === 'student' && !school.students.some(student => student._id.toString() === req.user._id.toString())) {
                logger.warn('[SCHOOL] Unauthorized access attempt', { userId: req.user._id, schoolId });
                return res.status(403).json({
                    success: false,
                    message: 'You are not authorized to view this school',
                });
            }
        }

        // Calculate processing time
        const processingTime = Date.now() - startTime;
        logger.info(`[SCHOOL] School fetched successfully (${processingTime}ms)`, { schoolId });

        // Send successful response
        return res.status(200).json({
            success: true,
            school,
        });
    } catch (error) {
        // Calculate processing time even for errors
        const processingTime = Date.now() - startTime;

        logger.error(`[SCHOOL] Fetching school failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error fetching school',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
        });
    }
};

/**
 * @desc    Update school by ID
 * @route   PUT /api/v1/schools/:id
 * @access  Private/Admin/SuperAdmin
 */
export const updateSchool = async (req, res) => {
    const startTime = Date.now();
    logger.info('[SCHOOL] Updating school', { schoolId: req.params.id });

    try {
        const schoolId = req.params.id;

        // Validate MongoDB ID
        if (!mongoose.Types.ObjectId.isValid(schoolId)) {
            logger.warn('[SCHOOL] Invalid school ID format', { schoolId });
            return res.status(400).json({
                success: false,
                message: 'Invalid school ID',
            });
        }

        // Extract validated data
        const { name, email, phone, address, website } = req.body.school;

        // Find school to update
        const school = await School.findById(schoolId);

        // Check if school exists
        if (!school) {
            logger.warn('[SCHOOL] School not found for update', { schoolId });
            return res.status(404).json({
                success: false,
                message: 'School not found',
            });
        }

        // Check for email uniqueness if email is being updated
        if (email && email !== school.email) {
            const existingSchool = await School.findOne({ email });
            if (existingSchool) {
                logger.warn('[SCHOOL] Update failed: Email already in use', { email });
                return res.status(400).json({
                    success: false,
                    message: 'School with this email already exists',
                });
            }
        }

        // Update school fields
        if (name) school.name = name;
        if (email) school.email = email;
        if (phone !== undefined) school.phone = phone;
        if (address !== undefined) school.address = address;
        if (website !== undefined) school.website = website;

        // Save updated school
        await school.save();

        // Calculate processing time
        const processingTime = Date.now() - startTime;
        logger.info(`[SCHOOL] School updated successfully (${processingTime}ms)`, { schoolId });

        // Send successful response
        return res.status(200).json({
            success: true,
            school,
        });
    } catch (error) {
        // Calculate processing time even for errors
        const processingTime = Date.now() - startTime;

        logger.error(`[SCHOOL] School update failed (${processingTime}ms):`, error);

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
                message: 'School with this information already exists',
            });
        }

        return res.status(500).json({
            success: false,
            message: 'Server error updating school',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
        });
    }
};

/**
 * @desc    Delete school by ID
 * @route   DELETE /api/v1/schools/:id
 * @access  Private/SuperAdmin
 */
export const deleteSchool = async (req, res) => {
    const startTime = Date.now();
    logger.info('[SCHOOL] Deleting school', { schoolId: req.params.id });

    try {
        const schoolId = req.params.id;

        // Validate MongoDB ID
        if (!mongoose.Types.ObjectId.isValid(schoolId)) {
            logger.warn('[SCHOOL] Invalid school ID format', { schoolId });
            return res.status(400).json({
                success: false,
                message: 'Invalid school ID',
            });
        }

        // Find school to delete
        const school = await School.findById(schoolId);

        // Check if school exists
        if (!school) {
            logger.warn('[SCHOOL] School not found for deletion', { schoolId });
            return res.status(404).json({
                success: false,
                message: 'School not found',
            });
        }

        // Only superAdmin can delete schools
        if (req.user.role !== 'superAdmin') {
            logger.warn('[SCHOOL] Unauthorized delete attempt', { userId: req.user._id, role: req.user.role });
            return res.status(403).json({
                success: false,
                message: 'Only superAdmin can delete schools',
            });
        }

        // Check if there are associated users
        const associatedUsers = await User.countDocuments({ school: schoolId });
        if (associatedUsers > 0) {
            logger.warn('[SCHOOL] Cannot delete school with associated users', { schoolId, userCount: associatedUsers });
            return res.status(400).json({
                success: false,
                message: 'Cannot delete school with associated users. Remove all students and teachers first.',
            });
        }

        // Delete the school
        await School.findByIdAndDelete(schoolId);

        // Calculate processing time
        const processingTime = Date.now() - startTime;
        logger.info(`[SCHOOL] School deleted successfully (${processingTime}ms)`, { schoolId });

        // Send successful response
        return res.status(200).json({
            success: true,
            message: 'School deleted successfully',
        });
    } catch (error) {
        // Calculate processing time even for errors
        const processingTime = Date.now() - startTime;

        logger.error(`[SCHOOL] School deletion failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error deleting school',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
        });
    }
};

/**
 * @desc    Add a teacher to school
 * @route   POST /api/v1/schools/:id/teachers
 * @access  Private/Admin/SuperAdmin
 */
export const addTeacherToSchool = async (req, res) => {
    const startTime = Date.now();
    logger.info('[SCHOOL] Adding teacher to school', { schoolId: req.params.id });

    try {
        const schoolId = req.params.id;
        const { teacherId } = req.body;

        // Validate MongoDB IDs
        if (!mongoose.Types.ObjectId.isValid(schoolId) || !mongoose.Types.ObjectId.isValid(teacherId)) {
            logger.warn('[SCHOOL] Invalid ID format');
            return res.status(400).json({
                success: false,
                message: 'Invalid ID format',
            });
        }

        // Find school
        const school = await School.findById(schoolId);
        if (!school) {
            logger.warn('[SCHOOL] School not found', { schoolId });
            return res.status(404).json({
                success: false,
                message: 'School not found',
            });
        }

        // Find teacher
        const teacher = await User.findById(teacherId);
        if (!teacher) {
            logger.warn('[SCHOOL] Teacher not found', { teacherId });
            return res.status(404).json({
                success: false,
                message: 'Teacher not found',
            });
        }

        // Verify user is a teacher
        if (teacher.role !== 'teacher') {
            logger.warn('[SCHOOL] User is not a teacher', { userId: teacherId, role: teacher.role });
            return res.status(400).json({
                success: false,
                message: 'User is not a teacher',
            });
        }

        // Check if teacher is already in school
        if (school.teachers.includes(teacherId)) {
            logger.warn('[SCHOOL] Teacher already in school', { schoolId, teacherId });
            return res.status(400).json({
                success: false,
                message: 'Teacher is already associated with this school',
            });
        }

        // Add teacher to school
        school.teachers.push(teacherId);
        await school.save();

        // Update teacher's school
        teacher.school = schoolId;
        await teacher.save();

        // Calculate processing time
        const processingTime = Date.now() - startTime;
        logger.info(`[SCHOOL] Teacher added to school successfully (${processingTime}ms)`, { schoolId, teacherId });

        // Send successful response
        return res.status(200).json({
            success: true,
            message: 'Teacher added to school successfully',
            school: {
                _id: school._id,
                name: school.name,
            },
            teacher: {
                _id: teacher._id,
                name: teacher.name,
                email: teacher.email,
            },
        });
    } catch (error) {
        // Calculate processing time even for errors
        const processingTime = Date.now() - startTime;

        logger.error(`[SCHOOL] Adding teacher to school failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error adding teacher to school',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
        });
    }
};

/**
 * @desc    Add a student to school
 * @route   POST /api/v1/schools/:id/students
 * @access  Private/Admin/SuperAdmin/Teacher
 */
export const addStudentToSchool = async (req, res) => {
    const startTime = Date.now();
    logger.info('[SCHOOL] Adding student to school', { schoolId: req.params.id });

    try {
        const schoolId = req.params.id;
        const { studentId } = req.body;

        // Validate MongoDB IDs
        if (!mongoose.Types.ObjectId.isValid(schoolId) || !mongoose.Types.ObjectId.isValid(studentId)) {
            logger.warn('[SCHOOL] Invalid ID format');
            return res.status(400).json({
                success: false,
                message: 'Invalid ID format',
            });
        }

        // Find school
        const school = await School.findById(schoolId);
        if (!school) {
            logger.warn('[SCHOOL] School not found', { schoolId });
            return res.status(404).json({
                success: false,
                message: 'School not found',
            });
        }

        // If user is a teacher, check if they belong to this school
        if (req.user.role === 'teacher') {
            if (!school.teachers.includes(req.user._id)) {
                logger.warn('[SCHOOL] Teacher not authorized for this school', { userId: req.user._id, schoolId });
                return res.status(403).json({
                    success: false,
                    message: 'You are not authorized to add students to this school',
                });
            }
        }

        // Find student
        const student = await User.findById(studentId);
        if (!student) {
            logger.warn('[SCHOOL] Student not found', { studentId });
            return res.status(404).json({
                success: false,
                message: 'Student not found',
            });
        }

        // Verify user is a student
        if (student.role !== 'student') {
            logger.warn('[SCHOOL] User is not a student', { userId: studentId, role: student.role });
            return res.status(400).json({
                success: false,
                message: 'User is not a student',
            });
        }

        // Check if student is already in school
        if (school.students.includes(studentId)) {
            logger.warn('[SCHOOL] Student already in school', { schoolId, studentId });
            return res.status(400).json({
                success: false,
                message: 'Student is already associated with this school',
            });
        }

        // Add student to school
        school.students.push(studentId);
        await school.save();

        // Update student's school
        student.school = schoolId;
        await student.save();

        // Calculate processing time
        const processingTime = Date.now() - startTime;
        logger.info(`[SCHOOL] Student added to school successfully (${processingTime}ms)`, { schoolId, studentId });

        // Send successful response
        return res.status(200).json({
            success: true,
            message: 'Student added to school successfully',
            school: {
                _id: school._id,
                name: school.name,
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

        logger.error(`[SCHOOL] Adding student to school failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error adding student to school',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
        });
    }
};