// File: controllers/admin.controller.js

import bcrypt from 'bcryptjs';
import User from '../models/user.model.js';
import Organization from '../models/organization.model.js';
import Class from '../models/class.model.js';
import Section from '../models/section.model.js';
import logger from '../utils/logger.js';
import { generateSimplePassword, generateStrongPassword } from '../utils/generatePassword.js';
import { sendEmail } from '../utils/emailService.js';
import { findAvailableSection } from '../utils/sectionHelper.js';


// POST /admin/enroll-student
export const enrollStudent = async (req, res) => {
    const startTime = Date.now();
    logger.info('[ADMIN] Starting student enrollment process', { adminId: req.user._id });

    try {
        // Extract data from request body
        const {
            name,
            email,
            classId,
            rollNumber,
            parentContact,
            address
        } = req.body;

        // Verify admin permissions
        const admin = await User.findById(req.user._id).populate('organization');
        if (!admin || !['admin'].includes(admin.role)) {
            logger.warn('[ADMIN] Unauthorized enrollment attempt', { userId: req.user._id, role: admin?.role });
            return res.status(403).json({
                success: false,
                message: 'Only organization admins can enroll students'
            });
        }

        // Verify admin belongs to an organization
        if (!admin.organization) {
            logger.warn('[ADMIN] Admin without organization attempted enrollment', { adminId: admin._id });
            return res.status(400).json({
                success: false,
                message: 'Admin must belong to an organization to enroll students'
            });
        }

        // Check if admin has permission to enroll students
        const organization = await Organization.findById(admin.organization._id);
        const adminRecord = organization.admins.find(a => a.user.toString() === admin._id.toString());

        if (!adminRecord || !adminRecord.permissions.canEnrollStudents) {
            logger.warn('[ADMIN] Admin lacks student enrollment permission', {
                adminId: admin._id,
                organizationId: organization._id
            });
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to enroll students'
            });
        }

        // Check if email already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            logger.warn('[ADMIN] Student enrollment failed: Email already exists', { email });
            return res.status(400).json({
                success: false,
                message: 'A user with this email already exists'
            });
        }

        // Verify class exists and belongs to same organization
        const classDoc = await Class.findById(classId);
        if (!classDoc) {
            logger.warn('[ADMIN] Student enrollment failed: Class not found', { classId });
            return res.status(404).json({
                success: false,
                message: 'Class not found'
            });
        }

        if (classDoc.organization.toString() !== admin.organization._id.toString()) {
            logger.warn('[ADMIN] Admin attempted to enroll student in different organization class', {
                adminId: admin._id,
                adminOrg: admin.organization._id,
                classOrg: classDoc.organization
            });
            return res.status(403).json({
                success: false,
                message: 'You can only enroll students in classes within your organization'
            });
        }

        // Find available section in the class using utility function
        const availableSection = await findAvailableSection(classId);
        if (!availableSection) {
            logger.warn('[ADMIN] No available sections found', { classId });
            return res.status(400).json({
                success: false,
                message: 'No available sections found in this class. All sections are full.'
            });
        }

        // Generate simple password for student
        const generatedPassword = generateSimplePassword();
        const hashedPassword = await bcrypt.hash(generatedPassword, 10);

        // Create student user
        const student = await User.create({
            name,
            email,
            password: hashedPassword,
            role: 'student',
            organization: admin.organization._id,
            section: availableSection._id,
            isVerified: true, // Pre-verified since admin enrolled them
            studentDetails: {
                rollNumber: rollNumber || `${classDoc.grade}${availableSection.name}${Date.now().toString().slice(-4)}`,
                admissionDate: new Date(),
                parentContact: parentContact || {},
                address: address || {}
            }
        });

        // Add student to section
        await availableSection.addStudent(student._id);

        // Update class student count
        await classDoc.updateStudentCount();

        // Update organization stats
        await organization.updateStats();

        // Send credentials email to student using existing email service
        const emailSent = await sendEmail(
            student.email,
            'STUDENT_CREDENTIALS',
            {
                name: student.name,
                organization: organization.name,
                email: student.email,
                password: generatedPassword,
                rollNumber: student.studentDetails.rollNumber,
                className: classDoc.name,
                sectionName: availableSection.name
            }
        );

        if (!emailSent) {
            logger.warn('[ADMIN] Failed to send credentials email', { studentId: student._id });
        }

        // Calculate processing time
        const processingTime = Date.now() - startTime;
        logger.info(`[ADMIN] Student enrolled successfully (${processingTime}ms)`, {
            studentId: student._id,
            adminId: req.user._id,
            organizationId: organization._id,
            classId: classDoc._id,
            sectionId: availableSection._id
        });

        // Send successful response
        return res.status(201).json({
            success: true,
            message: 'Student enrolled successfully! Login credentials have been sent to their email.',
            student: {
                _id: student._id,
                name: student.name,
                email: student.email,
                rollNumber: student.studentDetails.rollNumber,
                class: {
                    _id: classDoc._id,
                    name: classDoc.name,
                    grade: classDoc.grade
                },
                section: {
                    _id: availableSection._id,
                    name: availableSection.name,
                    fullName: `${classDoc.grade}-${availableSection.name}`
                },
                organization: {
                    _id: organization._id,
                    name: organization.name
                }
            }
        });

    } catch (error) {
        // Calculate processing time even for errors
        const processingTime = Date.now() - startTime;

        logger.error(`[ADMIN] Student enrollment failed (${processingTime}ms):`, error);

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
                message: 'A student with this information already exists'
            });
        }

        // Default server error
        return res.status(500).json({
            success: false,
            message: 'Server error during student enrollment',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};

// POST /admin/enroll-teacher
export const enrollTeacher = async (req, res) => {
    const startTime = Date.now();
    logger.info('[ADMIN] Starting teacher enrollment process', { adminId: req.user._id });

    try {
        // Extract data from request body
        const {
            name,
            email,
            employeeId,
            qualification,
            experience,
            subjects,
            phone,
            department
        } = req.body;

        // Verify admin permissions
        const admin = await User.findById(req.user._id).populate('organization');
        if (!admin || !['admin'].includes(admin.role)) {
            logger.warn('[ADMIN] Unauthorized teacher enrollment attempt', { userId: req.user._id, role: admin?.role });
            return res.status(403).json({
                success: false,
                message: 'Only organization admins can enroll teachers'
            });
        }

        // Verify admin belongs to an organization
        if (!admin.organization) {
            logger.warn('[ADMIN] Admin without organization attempted teacher enrollment', { adminId: admin._id });
            return res.status(400).json({
                success: false,
                message: 'Admin must belong to an organization to enroll teachers'
            });
        }

        // Check if admin has permission to enroll teachers
        const organization = await Organization.findById(admin.organization._id);
        const adminRecord = organization.admins.find(a => a.user.toString() === admin._id.toString());

        if (!adminRecord || !adminRecord.permissions.canEnrollTeachers) {
            logger.warn('[ADMIN] Admin lacks teacher enrollment permission', {
                adminId: admin._id,
                organizationId: organization._id
            });
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to enroll teachers'
            });
        }

        // Check if email already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            logger.warn('[ADMIN] Teacher enrollment failed: Email already exists', { email });
            return res.status(400).json({
                success: false,
                message: 'A user with this email already exists'
            });
        }

        // Check if employee ID already exists within the organization
        if (employeeId) {
            const existingEmployee = await User.findOne({
                'teacherDetails.employeeId': employeeId,
                organization: admin.organization._id,
                role: 'teacher'
            });

            if (existingEmployee) {
                logger.warn('[ADMIN] Teacher enrollment failed: Employee ID already exists', { employeeId });
                return res.status(400).json({
                    success: false,
                    message: 'A teacher with this employee ID already exists in your organization'
                });
            }
        }

        // Generate strong password for teacher
        const generatedPassword = generateStrongPassword();
        const hashedPassword = await bcrypt.hash(generatedPassword, 10);

        // Create teacher user
        const teacher = await User.create({
            name,
            email,
            password: hashedPassword,
            role: 'teacher',
            organization: admin.organization._id,
            isVerified: true, // Pre-verified since admin enrolled them
            teacherDetails: {
                employeeId: employeeId || `EMP${Date.now().toString().slice(-6)}`,
                joiningDate: new Date(),
                qualification: qualification || '',
                experience: experience || 0,
                subjects: subjects || [],
                phone: phone || ''
            }
        });

        // Update organization stats
        await organization.updateStats();

        // Send credentials email to teacher
        const emailSent = await sendEmail(
            teacher.email,
            'TEACHER_CREDENTIALS',
            {
                name: teacher.name,
                organization: organization.name,
                email: teacher.email,
                password: generatedPassword,
                employeeId: teacher.teacherDetails.employeeId,
                department: department || 'To be assigned'
            }
        );

        if (!emailSent) {
            logger.warn('[ADMIN] Failed to send teacher credentials email', { teacherId: teacher._id });
        }

        // Calculate processing time
        const processingTime = Date.now() - startTime;
        logger.info(`[ADMIN] Teacher enrolled successfully (${processingTime}ms)`, {
            teacherId: teacher._id,
            adminId: req.user._id,
            organizationId: organization._id
        });

        // Send successful response
        return res.status(201).json({
            success: true,
            message: 'Teacher enrolled successfully! Login credentials have been sent to their email.',
            teacher: {
                _id: teacher._id,
                name: teacher.name,
                email: teacher.email,
                employeeId: teacher.teacherDetails.employeeId,
                qualification: teacher.teacherDetails.qualification,
                experience: teacher.teacherDetails.experience,
                subjects: teacher.teacherDetails.subjects,
                organization: {
                    _id: organization._id,
                    name: organization.name
                }
            }
        });

    } catch (error) {
        // Calculate processing time even for errors
        const processingTime = Date.now() - startTime;

        logger.error(`[ADMIN] Teacher enrollment failed (${processingTime}ms):`, error);

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
                message: 'A teacher with this information already exists'
            });
        }

        // Default server error
        return res.status(500).json({
            success: false,
            message: 'Server error during teacher enrollment',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};