// File: controllers/sectionManagement.controller.js

import User from '../models/user.model.js';
import Organization from '../models/organization.model.js';
import Class from '../models/class.model.js';
import Section from '../models/section.model.js';
import logger from '../utils/logger.js';
import { getClassCapacitySummary, checkSectionCapacity } from '../utils/sectionHelper.js';

// POST /admin/assign-teacher-to-section - Assign teacher to section (Primary admin only)
export const assignTeacherToSection = async (req, res) => {
    const startTime = Date.now();
    logger.info('[SECTION] Starting teacher section assignment', { adminId: req.user._id });

    try {
        const { teacherId, sectionId } = req.body;

        // Verify primary admin permissions
        const primaryAdmin = await User.findById(req.user._id).populate('organization');
        if (!primaryAdmin || !['admin'].includes(primaryAdmin.role)) {
            logger.warn('[SECTION] Unauthorized teacher assignment attempt', { userId: req.user._id, role: primaryAdmin?.role });
            return res.status(403).json({
                success: false,
                message: 'Only organization admins can assign teachers to sections'
            });
        }

        if (!primaryAdmin.organization) {
            return res.status(400).json({
                success: false,
                message: 'Admin must belong to an organization'
            });
        }

        // Check if user is primary admin of the organization
        const organization = await Organization.findById(primaryAdmin.organization._id);
        const primaryAdminRecord = organization.admins.find(a => a.user.toString() === primaryAdmin._id.toString());

        if (!primaryAdminRecord || primaryAdminRecord.role !== 'primary_admin') {
            logger.warn('[SECTION] Non-primary admin attempted teacher assignment', {
                adminId: primaryAdmin._id,
                organizationId: organization._id
            });
            return res.status(403).json({
                success: false,
                message: 'Only primary admins can assign teachers to sections'
            });
        }

        // Find and validate teacher
        const teacher = await User.findById(teacherId);
        if (!teacher) {
            return res.status(404).json({
                success: false,
                message: 'Teacher not found'
            });
        }

        if (teacher.role !== 'teacher') {
            return res.status(400).json({
                success: false,
                message: 'User is not a teacher'
            });
        }

        if (teacher.organization.toString() !== organization._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Teacher must belong to the same organization'
            });
        }

        // Find and validate section
        const section = await Section.findById(sectionId).populate('class');
        if (!section) {
            return res.status(404).json({
                success: false,
                message: 'Section not found'
            });
        }

        if (section.organization.toString() !== organization._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Section must belong to the same organization'
            });
        }

        // Check if section already has a teacher
        if (section.sectionTeacher) {
            // Get current teacher details
            const currentTeacher = await User.findById(section.sectionTeacher);
            logger.warn('[SECTION] Section already has a teacher', {
                sectionId,
                currentTeacherId: section.sectionTeacher,
                currentTeacherName: currentTeacher?.name
            });
            return res.status(400).json({
                success: false,
                message: `Section ${section.name} already has a teacher assigned: ${currentTeacher?.name}`,
                currentTeacher: {
                    _id: currentTeacher?._id,
                    name: currentTeacher?.name,
                    email: currentTeacher?.email
                }
            });
        }

        // Assign teacher to section
        section.sectionTeacher = teacherId;
        await section.save();

        // Add section to teacher's teaching sections
        await teacher.addTeachingSection(sectionId);

        const processingTime = Date.now() - startTime;
        logger.info(`[SECTION] Teacher assigned to section successfully (${processingTime}ms)`, {
            teacherId,
            sectionId,
            primaryAdminId: primaryAdmin._id,
            organizationId: organization._id
        });

        return res.status(200).json({
            success: true,
            message: 'Teacher assigned to section successfully',
            assignment: {
                teacher: {
                    _id: teacher._id,
                    name: teacher.name,
                    email: teacher.email
                },
                section: {
                    _id: section._id,
                    name: section.name,
                    fullName: `${section.class.grade}-${section.name}`,
                    class: {
                        _id: section.class._id,
                        name: section.class.name,
                        grade: section.class.grade
                    }
                }
            }
        });

    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[SECTION] Teacher assignment failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error during teacher assignment',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};

// DELETE /admin/remove-teacher-from-section/:sectionId - Remove teacher from section
export const removeTeacherFromSection = async (req, res) => {
    const startTime = Date.now();
    logger.info('[SECTION] Removing teacher from section', { adminId: req.user._id, sectionId: req.params.sectionId });

    try {
        const sectionId = req.params.sectionId;

        // Verify primary admin permissions
        const primaryAdmin = await User.findById(req.user._id).populate('organization');
        if (!primaryAdmin || !['admin'].includes(primaryAdmin.role)) {
            return res.status(403).json({
                success: false,
                message: 'Only organization admins can remove teachers from sections'
            });
        }

        if (!primaryAdmin.organization) {
            return res.status(400).json({
                success: false,
                message: 'Admin must belong to an organization'
            });
        }

        // Check if user is primary admin
        const organization = await Organization.findById(primaryAdmin.organization._id);
        const primaryAdminRecord = organization.admins.find(a => a.user.toString() === primaryAdmin._id.toString());

        if (!primaryAdminRecord || primaryAdminRecord.role !== 'primary_admin') {
            return res.status(403).json({
                success: false,
                message: 'Only primary admins can remove teachers from sections'
            });
        }

        // Find section
        const section = await Section.findById(sectionId).populate('class').populate('sectionTeacher');
        if (!section) {
            return res.status(404).json({
                success: false,
                message: 'Section not found'
            });
        }

        if (section.organization.toString() !== organization._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Section must belong to the same organization'
            });
        }

        // Check if section has a teacher
        if (!section.sectionTeacher) {
            return res.status(400).json({
                success: false,
                message: 'Section does not have a teacher assigned'
            });
        }

        const teacher = section.sectionTeacher;

        // Remove teacher from section
        section.sectionTeacher = null;
        await section.save();

        // Remove section from teacher's teaching sections
        if (teacher) {
            await teacher.removeTeachingSection(sectionId);
        }

        const processingTime = Date.now() - startTime;
        logger.info(`[SECTION] Teacher removed from section successfully (${processingTime}ms)`, {
            teacherId: teacher?._id,
            sectionId,
            primaryAdminId: primaryAdmin._id
        });

        return res.status(200).json({
            success: true,
            message: 'Teacher removed from section successfully',
            section: {
                _id: section._id,
                name: section.name,
                fullName: `${section.class.grade}-${section.name}`
            },
            removedTeacher: teacher ? {
                _id: teacher._id,
                name: teacher.name,
                email: teacher.email
            } : null
        });

    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[SECTION] Teacher removal failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error removing teacher from section',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};

// PUT /admin/move-student-to-section - Move student to different section
export const moveStudentToSection = async (req, res) => {
    const startTime = Date.now();
    logger.info('[SECTION] Moving student to different section', { adminId: req.user._id });

    try {
        const { studentId, newSectionId } = req.body;

        // Verify admin permissions
        const admin = await User.findById(req.user._id).populate('organization');
        if (!admin || !['admin'].includes(admin.role)) {
            return res.status(403).json({
                success: false,
                message: 'Only organization admins can move students between sections'
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

        if (!adminRecord || !adminRecord.permissions.canEnrollStudents) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to move students'
            });
        }

        // Find and validate student
        const student = await User.findById(studentId).populate('section');
        if (!student) {
            return res.status(404).json({
                success: false,
                message: 'Student not found'
            });
        }

        if (student.role !== 'student') {
            return res.status(400).json({
                success: false,
                message: 'User is not a student'
            });
        }

        if (student.organization.toString() !== organization._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Student must belong to the same organization'
            });
        }

        // Find current and new sections
        const currentSection = student.section;
        const newSection = await Section.findById(newSectionId).populate('class');

        if (!newSection) {
            return res.status(404).json({
                success: false,
                message: 'New section not found'
            });
        }

        if (newSection.organization.toString() !== organization._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'New section must belong to the same organization'
            });
        }

        // Check if already in the target section
        if (currentSection && currentSection._id.toString() === newSectionId) {
            return res.status(400).json({
                success: false,
                message: 'Student is already in this section'
            });
        }

        // Check new section capacity
        const capacityCheck = await checkSectionCapacity(newSectionId, 1);
        if (!capacityCheck.canAccommodate) {
            return res.status(400).json({
                success: false,
                message: `Cannot move student to section ${newSection.name}: ${capacityCheck.reason}`,
                sectionCapacity: {
                    currentStudents: capacityCheck.currentStudents,
                    maxStudents: capacityCheck.maxStudents,
                    availableSpots: capacityCheck.availableSpots
                }
            });
        }

        // Remove student from current section if exists
        if (currentSection) {
            await currentSection.removeStudent(studentId);
        }

        // Add student to new section
        await newSection.addStudent(studentId);

        // Update student's section reference
        student.section = newSectionId;
        await student.save();

        // Update class student counts
        if (currentSection) {
            const currentClass = await Class.findById(currentSection.class);
            await currentClass?.updateStudentCount();
        }

        const newClass = await Class.findById(newSection.class._id);
        await newClass?.updateStudentCount();

        const processingTime = Date.now() - startTime;
        logger.info(`[SECTION] Student moved successfully (${processingTime}ms)`, {
            studentId,
            currentSectionId: currentSection?._id,
            newSectionId,
            adminId: admin._id
        });

        return res.status(200).json({
            success: true,
            message: 'Student moved to new section successfully',
            student: {
                _id: student._id,
                name: student.name,
                email: student.email
            },
            previousSection: currentSection ? {
                _id: currentSection._id,
                name: currentSection.name
            } : null,
            newSection: {
                _id: newSection._id,
                name: newSection.name,
                fullName: `${newSection.class.grade}-${newSection.name}`,
                availableSpots: newSection.maxStudents - (newSection.students.length + 1)
            }
        });

    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[SECTION] Student move failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error moving student',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};

// GET /admin/class-sections/:classId - Get all sections for a class with capacity info
export const getClassSections = async (req, res) => {
    const startTime = Date.now();
    logger.info('[SECTION] Retrieving class sections', { adminId: req.user._id, classId: req.params.classId });

    try {
        const classId = req.params.classId;

        // Verify admin permissions
        const admin = await User.findById(req.user._id).populate('organization');
        if (!admin || !['admin'].includes(admin.role)) {
            return res.status(403).json({
                success: false,
                message: 'Only organization admins can view class sections'
            });
        }

        if (!admin.organization) {
            return res.status(400).json({
                success: false,
                message: 'Admin must belong to an organization'
            });
        }

        // Find and validate class
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
                message: 'Class must belong to the same organization'
            });
        }

        // Get capacity summary using utility function
        const capacitySummary = await getClassCapacitySummary(classId);

        // Get detailed sections with teacher and student info
        const sections = await Section.find({
            class: classId,
            isActive: true,
            isDeleted: false
        })
            .populate('sectionTeacher', 'name email')
            .populate('students', 'name email studentDetails.rollNumber')
            .sort({ name: 1 });

        const detailedSections = sections.map(section => ({
            _id: section._id,
            name: section.name,
            fullName: `${classDoc.grade}-${section.name}`,
            maxStudents: section.maxStudents,
            currentStudents: section.students.length,
            availableSpots: section.maxStudents - section.students.length,
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
            createdAt: section.createdAt
        }));

        const processingTime = Date.now() - startTime;
        logger.info(`[SECTION] Class sections retrieved successfully (${processingTime}ms)`, {
            classId,
            sectionCount: detailedSections.length,
            adminId: admin._id
        });

        return res.status(200).json({
            success: true,
            class: {
                _id: classDoc._id,
                name: classDoc.name,
                grade: classDoc.grade
            },
            capacitySummary,
            sections: detailedSections,
            totalSections: detailedSections.length
        });

    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[SECTION] Class sections retrieval failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error retrieving class sections',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};

// GET /admin/teacher-sections/:teacherId - Get all sections assigned to a teacher
export const getTeacherSections = async (req, res) => {
    const startTime = Date.now();
    logger.info('[SECTION] Retrieving teacher sections', { adminId: req.user._id, teacherId: req.params.teacherId });

    try {
        const teacherId = req.params.teacherId;

        // Verify admin permissions
        const admin = await User.findById(req.user._id).populate('organization');
        if (!admin || !['admin'].includes(admin.role)) {
            return res.status(403).json({
                success: false,
                message: 'Only organization admins can view teacher sections'
            });
        }

        if (!admin.organization) {
            return res.status(400).json({
                success: false,
                message: 'Admin must belong to an organization'
            });
        }

        // Find and validate teacher
        const teacher = await User.findById(teacherId).populate('teachingSections');
        if (!teacher) {
            return res.status(404).json({
                success: false,
                message: 'Teacher not found'
            });
        }

        if (teacher.role !== 'teacher') {
            return res.status(400).json({
                success: false,
                message: 'User is not a teacher'
            });
        }

        if (teacher.organization.toString() !== admin.organization._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Teacher must belong to the same organization'
            });
        }

        // Get detailed sections where teacher is assigned
        const sections = await Section.find({
            sectionTeacher: teacherId,
            isActive: true,
            isDeleted: false
        })
            .populate('class', 'name grade')
            .populate('students', 'name email studentDetails.rollNumber')
            .sort({ 'class.grade': 1, name: 1 });

        const teacherSections = sections.map(section => ({
            _id: section._id,
            name: section.name,
            fullName: `${section.class.grade}-${section.name}`,
            class: {
                _id: section.class._id,
                name: section.class.name,
                grade: section.class.grade
            },
            studentCount: section.students.length,
            maxStudents: section.maxStudents,
            students: section.students.map(student => ({
                _id: student._id,
                name: student.name,
                email: student.email,
                rollNumber: student.studentDetails?.rollNumber
            }))
        }));

        const processingTime = Date.now() - startTime;
        logger.info(`[SECTION] Teacher sections retrieved successfully (${processingTime}ms)`, {
            teacherId,
            sectionCount: teacherSections.length,
            adminId: admin._id
        });

        return res.status(200).json({
            success: true,
            teacher: {
                _id: teacher._id,
                name: teacher.name,
                email: teacher.email,
                employeeId: teacher.teacherDetails?.employeeId
            },
            sections: teacherSections,
            totalSections: teacherSections.length,
            totalStudents: teacherSections.reduce((total, section) => total + section.studentCount, 0)
        });

    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[SECTION] Teacher sections retrieval failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error retrieving teacher sections',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};