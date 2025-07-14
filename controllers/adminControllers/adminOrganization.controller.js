// File: adminControllers/adminOrganization.controller.js

import Organization from '../../models/organization.model.js';
import Class from '../../models/class.model.js';
import Section from '../../models/section.model.js';
import logger from '../../utils/logger.js';
import User from '../../models/user.model.js';

// GET /admin/organization/details - Get comprehensive organization details
export const getOrganizationDetails = async (req, res) => {
    const startTime = Date.now();
    logger.info('[ADMIN-ORG] Getting comprehensive organization details', { adminId: req.user._id });

    try {
        // Verify admin permissions
        const admin = await User.findById(req.user._id).populate('organization');
        if (!admin || !['admin'].includes(admin.role)) {
            logger.warn('[ADMIN-ORG] Unauthorized organization details access attempt', {
                userId: req.user._id,
                role: admin?.role
            });
            return res.status(403).json({
                success: false,
                message: 'Only organization admins can view organization details'
            });
        }

        if (!admin.organization) {
            logger.warn('[ADMIN-ORG] Admin without organization attempted to get details', {
                adminId: admin._id
            });
            return res.status(400).json({
                success: false,
                message: 'Admin must belong to an organization'
            });
        }

        const organizationId = admin.organization._id;

        // Get comprehensive organization data
        const organization = await Organization.findById(organizationId)
            .populate('admins.user', 'name email lastLogin createdAt')
            .populate('admins.addedBy', 'name email')
            .populate('createdBy', 'name email');

        if (!organization) {
            logger.warn('[ADMIN-ORG] Organization not found', { organizationId });
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        // Get detailed statistics
        const [
            totalStudents,
            totalTeachers,
            totalClasses,
            totalSections,
            activeStudents,
            activeTeachers
        ] = await Promise.all([
            User.countDocuments({ organization: organizationId, role: 'student', isDeleted: false }),
            User.countDocuments({ organization: organizationId, role: 'teacher', isDeleted: false }),
            Class.countDocuments({ organization: organizationId, isDeleted: false }),
            Section.countDocuments({ organization: organizationId, isDeleted: false }),
            User.countDocuments({ organization: organizationId, role: 'student', isActive: true, isDeleted: false }),
            User.countDocuments({ organization: organizationId, role: 'teacher', isActive: true, isDeleted: false })
        ]);

        // Get class-wise breakdown
        const classBreakdown = await Class.aggregate([
            { $match: { organization: organizationId, isDeleted: false } },
            {
                $lookup: {
                    from: 'sections',
                    localField: '_id',
                    foreignField: 'class',
                    as: 'sections'
                }
            },
            {
                $project: {
                    name: 1,
                    grade: 1,
                    sectionCount: { $size: '$sections' },
                    studentCount: {
                        $sum: {
                            $map: {
                                input: '$sections',
                                as: 'section',
                                in: { $size: '$$section.students' }
                            }
                        }
                    }
                }
            },
            { $sort: { grade: 1 } }
        ]);

        // Get recent activities (last 10 enrollments)
        const recentStudents = await User.find({
            organization: organizationId,
            role: 'student',
            isDeleted: false
        })
            .select('name email createdAt')
            .sort({ createdAt: -1 })
            .limit(5);

        const recentTeachers = await User.find({
            organization: organizationId,
            role: 'teacher',
            isDeleted: false
        })
            .select('name email createdAt')
            .sort({ createdAt: -1 })
            .limit(5);

        // Calculate capacity utilization
        const sectionsWithCapacity = await Section.find({
            organization: organizationId,
            isDeleted: false
        }).select('maxStudents students');

        const totalCapacity = sectionsWithCapacity.reduce((sum, section) => sum + section.maxStudents, 0);
        const totalOccupied = sectionsWithCapacity.reduce((sum, section) => sum + section.students.length, 0);
        const capacityUtilization = totalCapacity > 0 ? Math.round((totalOccupied / totalCapacity) * 100) : 0;

        // Update organization stats
        await organization.updateStats();

        const processingTime = Date.now() - startTime;
        logger.info(`[ADMIN-ORG] Organization details retrieved successfully (${processingTime}ms)`, {
            adminId: req.user._id,
            organizationId
        });

        return res.status(200).json({
            success: true,
            organization: {
                // Basic Information
                _id: organization._id,
                name: organization.name,
                brandName: organization.brandName,
                organizationCode: organization.organizationCode,

                // Contact Information
                emails: organization.emails,
                phones: organization.phones,
                websites: organization.websites,
                address: organization.address,

                // Settings
                contentAccess: organization.contentAccess,
                apiAccess: organization.apiAccess,
                studentEnrollment: organization.studentEnrollment,
                maxStudentsPerSection: organization.maxStudentsPerSection,

                // Status
                isActive: organization.isActive,
                createdAt: organization.createdAt,
                createdBy: organization.createdBy,

                // Statistics
                statistics: {
                    totalStudents,
                    totalTeachers,
                    totalClasses,
                    totalSections,
                    activeStudents,
                    activeTeachers,
                    totalAdmins: organization.admins.length,
                    capacityUtilization: `${capacityUtilization}%`,
                    totalCapacity,
                    totalOccupied
                },

                // Admin Management
                admins: organization.admins.map(adminRecord => ({
                    _id: adminRecord.user._id,
                    name: adminRecord.user.name,
                    email: adminRecord.user.email,
                    addedAt: adminRecord.addedAt,
                    addedBy: adminRecord.addedBy ? {
                        _id: adminRecord.addedBy._id,
                        name: adminRecord.addedBy.name
                    } : null,
                    lastLogin: adminRecord.user.lastLogin,
                    createdAt: adminRecord.user.createdAt
                })),

                // Academic Structure
                classBreakdown,

                // Recent Activity
                recentActivity: {
                    recentStudents: recentStudents.map(student => ({
                        _id: student._id,
                        name: student.name,
                        email: student.email,
                        enrolledAt: student.createdAt
                    })),
                    recentTeachers: recentTeachers.map(teacher => ({
                        _id: teacher._id,
                        name: teacher.name,
                        email: teacher.email,
                        enrolledAt: teacher.createdAt
                    }))
                }
            }
        });

    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[ADMIN-ORG] Organization details retrieval failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error retrieving organization details',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};

// GET /admin/organization/analytics - Get detailed analytics
export const getOrganizationAnalytics = async (req, res) => {
    const startTime = Date.now();
    logger.info('[ADMIN-ORG] Getting organization analytics', { adminId: req.user._id });

    try {
        const admin = await User.findById(req.user._id).populate('organization');
        if (!admin?.organization) {
            return res.status(400).json({
                success: false,
                message: 'Admin must belong to an organization'
            });
        }

        const organizationId = admin.organization._id;

        // Get enrollment trends (last 12 months)
        const enrollmentTrends = await User.aggregate([
            {
                $match: {
                    organization: organizationId,
                    role: { $in: ['student', 'teacher'] },
                    isDeleted: false,
                    createdAt: { $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' },
                        role: '$role'
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { '_id.year': 1, '_id.month': 1 }
            }
        ]);

        // Get grade-wise distribution
        const gradeDistribution = await Section.aggregate([
            {
                $match: {
                    organization: organizationId,
                    isDeleted: false
                }
            },
            {
                $lookup: {
                    from: 'classes',
                    localField: 'class',
                    foreignField: '_id',
                    as: 'classInfo'
                }
            },
            {
                $unwind: '$classInfo'
            },
            {
                $group: {
                    _id: '$classInfo.grade',
                    totalSections: { $sum: 1 },
                    totalStudents: { $sum: { $size: '$students' } },
                    totalCapacity: { $sum: '$maxStudents' }
                }
            },
            {
                $sort: { '_id': 1 }
            }
        ]);

        // Get teacher-to-student ratio
        const teacherStudentRatio = await Promise.all([
            User.countDocuments({ organization: organizationId, role: 'teacher', isActive: true }),
            User.countDocuments({ organization: organizationId, role: 'student', isActive: true })
        ]);

        const ratio = teacherStudentRatio[0] > 0 ?
            Math.round(teacherStudentRatio[1] / teacherStudentRatio[0]) : 0;

        // Get section utilization
        const sectionUtilization = await Section.aggregate([
            {
                $match: {
                    organization: organizationId,
                    isDeleted: false
                }
            },
            {
                $project: {
                    name: 1,
                    currentStudents: { $size: '$students' },
                    maxStudents: 1,
                    utilizationPercent: {
                        $multiply: [
                            { $divide: [{ $size: '$students' }, '$maxStudents'] },
                            100
                        ]
                    },
                    hasTeacher: { $cond: [{ $ne: ['$sectionTeacher', null] }, 1, 0] }
                }
            }
        ]);

        const avgUtilization = sectionUtilization.length > 0 ?
            Math.round(sectionUtilization.reduce((sum, s) => sum + s.utilizationPercent, 0) / sectionUtilization.length) : 0;

        const sectionsWithTeachers = sectionUtilization.reduce((sum, s) => sum + s.hasTeacher, 0);
        const teacherAssignmentRate = sectionUtilization.length > 0 ?
            Math.round((sectionsWithTeachers / sectionUtilization.length) * 100) : 0;

        const processingTime = Date.now() - startTime;
        logger.info(`[ADMIN-ORG] Organization analytics retrieved successfully (${processingTime}ms)`, {
            adminId: req.user._id,
            organizationId
        });

        return res.status(200).json({
            success: true,
            analytics: {
                enrollmentTrends,
                gradeDistribution,
                ratios: {
                    teacherToStudent: `1:${ratio}`,
                    totalTeachers: teacherStudentRatio[0],
                    totalStudents: teacherStudentRatio[1]
                },
                utilization: {
                    averageSectionUtilization: `${avgUtilization}%`,
                    teacherAssignmentRate: `${teacherAssignmentRate}%`,
                    sectionsWithTeachers,
                    totalSections: sectionUtilization.length
                },
                sectionDetails: sectionUtilization
            }
        });

    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[ADMIN-ORG] Organization analytics retrieval failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error retrieving organization analytics',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};

// GET /admin/organization/users - Get all users in organization with filtering
export const getOrganizationUsers = async (req, res) => {
    const startTime = Date.now();
    logger.info('[ADMIN-ORG] Getting organization users', { adminId: req.user._id });

    try {
        const admin = await User.findById(req.user._id).populate('organization');
        if (!admin?.organization) {
            return res.status(400).json({
                success: false,
                message: 'Admin must belong to an organization'
            });
        }

        const organizationId = admin.organization._id;
        const {
            role = null,
            page = 1,
            limit = 10,
            search = '',
            sortBy = 'createdAt',
            sortOrder = 'desc',
            isActive = null
        } = req.query;

        // Build filter query
        const filterQuery = {
            organization: organizationId,
            isDeleted: false
        };

        if (role && ['student', 'teacher', 'admin'].includes(role)) {
            filterQuery.role = role;
        }

        if (search) {
            filterQuery.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        if (isActive !== null) {
            filterQuery.isActive = isActive === 'true';
        }

        // Calculate pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const sortOptions = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

        // Get users with pagination
        const [users, totalCount] = await Promise.all([
            User.find(filterQuery)
                .populate('section', 'name class')
                .populate('teachingSections', 'name class')
                .select('-password -otp')
                .sort(sortOptions)
                .skip(skip)
                .limit(parseInt(limit)),
            User.countDocuments(filterQuery)
        ]);

        // Calculate pagination info
        const totalPages = Math.ceil(totalCount / parseInt(limit));
        const hasNextPage = parseInt(page) < totalPages;
        const hasPrevPage = parseInt(page) > 1;

        const processingTime = Date.now() - startTime;
        logger.info(`[ADMIN-ORG] Organization users retrieved successfully (${processingTime}ms)`, {
            adminId: req.user._id,
            organizationId,
            userCount: users.length,
            totalCount
        });

        return res.status(200).json({
            success: true,
            users: users.map(user => ({
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                isActive: user.isActive,
                isVerified: user.isVerified,
                section: user.section,
                teachingSections: user.teachingSections,
                identification: user.identification,
                lastLogin: user.lastLogin,
                createdAt: user.createdAt
            })),
            pagination: {
                currentPage: parseInt(page),
                totalPages,
                totalCount,
                hasNextPage,
                hasPrevPage,
                limit: parseInt(limit)
            }
        });

    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[ADMIN-ORG] Organization users retrieval failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error retrieving organization users',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};

// PUT /admin/organization/settings - Update organization settings
export const updateOrganizationSettings = async (req, res) => {
    const startTime = Date.now();
    logger.info('[ADMIN-ORG] Updating organization settings', { adminId: req.user._id });

    try {
        const admin = await User.findById(req.user._id).populate('organization');
        if (!admin?.organization) {
            return res.status(400).json({
                success: false,
                message: 'Admin must belong to an organization'
            });
        }

        const organization = await Organization.findById(admin.organization._id);
        if (!organization) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        // Check if admin is authorized to update settings
        const isAdminOfOrg = organization.isAdmin(admin._id);
        if (!isAdminOfOrg) {
            return res.status(403).json({
                success: false,
                message: 'You are not authorized to update organization settings'
            });
        }

        const {
            emails,
            phones,
            websites,
            address,
            studentEnrollment,
            maxStudentsPerSection
        } = req.body;

        // Update allowed fields
        if (emails) organization.emails = emails;
        if (phones) organization.phones = phones;
        if (websites) organization.websites = websites;
        if (address) organization.address = { ...organization.address, ...address };
        if (studentEnrollment) organization.studentEnrollment = { ...organization.studentEnrollment, ...studentEnrollment };
        if (maxStudentsPerSection !== undefined) organization.maxStudentsPerSection = maxStudentsPerSection;

        await organization.save();

        const processingTime = Date.now() - startTime;
        logger.info(`[ADMIN-ORG] Organization settings updated successfully (${processingTime}ms)`, {
            adminId: req.user._id,
            organizationId: organization._id
        });

        return res.status(200).json({
            success: true,
            message: 'Organization settings updated successfully',
            organization: {
                _id: organization._id,
                name: organization.name,
                emails: organization.emails,
                phones: organization.phones,
                websites: organization.websites,
                address: organization.address,
                studentEnrollment: organization.studentEnrollment,
                maxStudentsPerSection: organization.maxStudentsPerSection,
                updatedAt: organization.updatedAt
            }
        });

    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[ADMIN-ORG] Organization settings update failed (${processingTime}ms):`, error);

        // Handle validation errors
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
            message: 'Server error updating organization settings',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};