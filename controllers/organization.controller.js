// File: controllers/organization.controller.js

import bcrypt from 'bcryptjs';
import User from '../models/user.model.js';
import Organization from '../models/organization.model.js';
import logger from '../utils/logger.js';
import { generateStrongPassword } from '../utils/generatePassword.js';
import { sendEmail } from '../utils/emailService.js';

// POST /organizations - Create new organization (SuperAdmin only)
export const createOrganization = async (req, res) => {
    const startTime = Date.now();
    logger.info('[ORG] Starting organization creation process', { superAdminId: req.user._id });

    try {
        // Extract data from request body
        const {
            name,
            brandName,
            organizationCode,
            emails,
            phones,
            websites,
            address,
            contentAccess,
            apiAccess,
            studentEnrollment,
            maxStudentsPerSection
        } = req.body;

        // Verify user is SuperAdmin
        if (req.user.role !== 'superAdmin') {
            logger.warn('[ORG] Unauthorized organization creation attempt', { userId: req.user._id, role: req.user.role });
            return res.status(403).json({
                success: false,
                message: 'Only SuperAdmins can create organizations'
            });
        }

        // Check if organization name already exists
        const existingOrgByName = await Organization.findOne({ name });
        if (existingOrgByName) {
            logger.warn('[ORG] Organization creation failed: Name already exists', { name });
            return res.status(400).json({
                success: false,
                message: 'An organization with this name already exists'
            });
        }

        // Check if organization code already exists (if provided)
        if (organizationCode) {
            const existingOrgByCode = await Organization.findOne({ organizationCode });
            if (existingOrgByCode) {
                logger.warn('[ORG] Organization creation failed: Code already exists', { organizationCode });
                return res.status(400).json({
                    success: false,
                    message: 'An organization with this code already exists'
                });
            }
        }

        // Create organization
        const organization = await Organization.create({
            name,
            brandName,
            organizationCode: organizationCode || undefined, // Let pre-save middleware generate if not provided
            emails: emails || [],
            phones: phones || [],
            websites: websites || [],
            address: {
                street: address?.street || '',
                city: address?.city || '',
                state: address?.state || '',
                country: address?.country || 'India',
                pincode: address?.pincode || ''
            },
            contentAccess: {
                allowedSubjects: contentAccess?.allowedSubjects || ['all'],
                allowedGrades: contentAccess?.allowedGrades || ['all']
            },
            apiAccess: {
                isEnabled: apiAccess?.isEnabled || false,
                allowedDomains: apiAccess?.allowedDomains || []
            },
            studentEnrollment: {
                autoGenerateCredentials: studentEnrollment?.autoGenerateCredentials ?? true,
                passwordPolicy: studentEnrollment?.passwordPolicy || 'medium',
                sendWelcomeEmail: studentEnrollment?.sendWelcomeEmail ?? true,
                requireEmailVerification: studentEnrollment?.requireEmailVerification ?? false
            },
            maxStudentsPerSection: maxStudentsPerSection || 30,
            createdBy: req.user._id,
            admins: [], // Will be empty initially
            stats: {
                totalStudents: 0,
                totalTeachers: 0,
                totalClasses: 0,
                lastActiveDate: new Date()
            }
        });

        // Calculate processing time
        const processingTime = Date.now() - startTime;
        logger.info(`[ORG] Organization created successfully (${processingTime}ms)`, {
            organizationId: organization._id,
            superAdminId: req.user._id,
            organizationCode: organization.organizationCode
        });

        // Send successful response
        return res.status(201).json({
            success: true,
            message: 'Organization created successfully!',
            organization: {
                _id: organization._id,
                name: organization.name,
                brandName: organization.brandName,
                organizationCode: organization.organizationCode,
                emails: organization.emails,
                phones: organization.phones,
                websites: organization.websites,
                address: organization.address,
                contentAccess: organization.contentAccess,
                apiAccess: organization.apiAccess,
                studentEnrollment: organization.studentEnrollment,
                maxStudentsPerSection: organization.maxStudentsPerSection,
                admins: organization.admins,
                stats: organization.stats,
                isActive: organization.isActive,
                createdAt: organization.createdAt,
                createdBy: {
                    _id: req.user._id,
                    name: req.user.name,
                    email: req.user.email
                }
            }
        });

    } catch (error) {
        // Calculate processing time even for errors
        const processingTime = Date.now() - startTime;

        logger.error(`[ORG] Organization creation failed (${processingTime}ms):`, error);

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
                message: 'An organization with this information already exists'
            });
        }

        // Default server error
        return res.status(500).json({
            success: false,
            message: 'Server error during organization creation',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};

// GET /organizations - Get all organizations (SuperAdmin only)
export const getAllOrganizations = async (req, res) => {
    const startTime = Date.now();
    logger.info('[ORG] Retrieving all organizations', { superAdminId: req.user._id });

    try {
        // Verify user is SuperAdmin
        if (req.user.role !== 'superAdmin') {
            logger.warn('[ORG] Unauthorized organization list access attempt', { userId: req.user._id, role: req.user.role });
            return res.status(403).json({
                success: false,
                message: 'Only SuperAdmins can view all organizations'
            });
        }

        // Get query parameters for filtering
        const {
            page = 1,
            limit = 10,
            sortBy = 'createdAt',
            sortOrder = 'desc',
            search,
            isActive,
            brandName
        } = req.query;

        // Build filter query
        const filterQuery = { isDeleted: false };

        if (search) {
            filterQuery.$or = [
                { name: { $regex: search, $options: 'i' } },
                { brandName: { $regex: search, $options: 'i' } },
                { organizationCode: { $regex: search, $options: 'i' } }
            ];
        }

        if (isActive !== undefined) {
            filterQuery.isActive = isActive === 'true';
        }

        if (brandName) {
            filterQuery.brandName = { $regex: brandName, $options: 'i' };
        }

        // Calculate pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const sortOptions = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

        // Get organizations with pagination
        const [organizations, totalCount] = await Promise.all([
            Organization.find(filterQuery)
                .populate('createdBy', 'name email')
                .populate('admins.user', 'name email')
                .sort(sortOptions)
                .skip(skip)
                .limit(parseInt(limit)),
            Organization.countDocuments(filterQuery)
        ]);

        // Calculate pagination info
        const totalPages = Math.ceil(totalCount / parseInt(limit));
        const hasNextPage = parseInt(page) < totalPages;
        const hasPrevPage = parseInt(page) > 1;

        const processingTime = Date.now() - startTime;
        logger.info(`[ORG] Organizations retrieved successfully (${processingTime}ms)`, {
            superAdminId: req.user._id,
            organizationCount: organizations.length,
            totalCount,
            page: parseInt(page)
        });

        return res.status(200).json({
            success: true,
            organizations: organizations.map(org => ({
                _id: org._id,
                name: org.name,
                brandName: org.brandName,
                organizationCode: org.organizationCode,
                emails: org.emails,
                phones: org.phones,
                websites: org.websites,
                address: org.address,
                isActive: org.isActive,
                stats: org.stats,
                adminCount: org.admins.length,
                admins: org.admins.map(admin => ({
                    _id: admin.user._id,
                    name: admin.user.name,
                    email: admin.user.email,
                    role: admin.role,
                    addedAt: admin.addedAt
                })),
                createdAt: org.createdAt,
                createdBy: org.createdBy
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
        logger.error(`[ORG] Organization list retrieval failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error retrieving organizations',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};

// GET /organizations/:id - Get organization by ID
export const getOrganizationById = async (req, res) => {
    const startTime = Date.now();
    logger.info('[ORG] Retrieving organization by ID', {
        userId: req.user._id,
        organizationId: req.params.id
    });

    try {
        const organizationId = req.params.id;

        // Find organization
        const organization = await Organization.findById(organizationId)
            .populate('createdBy', 'name email')
            .populate('admins.user', 'name email lastLogin')
            .populate('admins.addedBy', 'name email');

        if (!organization) {
            logger.warn('[ORG] Organization not found', { organizationId });
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        // Check access permissions
        const canAccess = req.user.role === 'superAdmin' ||
            (req.user.role === 'admin' && organization.isAdmin(req.user._id));

        if (!canAccess) {
            logger.warn('[ORG] Unauthorized organization access attempt', {
                userId: req.user._id,
                organizationId,
                userRole: req.user.role
            });
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to view this organization'
            });
        }

        const processingTime = Date.now() - startTime;
        logger.info(`[ORG] Organization retrieved successfully (${processingTime}ms)`, {
            userId: req.user._id,
            organizationId
        });

        return res.status(200).json({
            success: true,
            organization: {
                _id: organization._id,
                name: organization.name,
                brandName: organization.brandName,
                organizationCode: organization.organizationCode,
                emails: organization.emails,
                phones: organization.phones,
                websites: organization.websites,
                address: organization.address,
                contentAccess: organization.contentAccess,
                apiAccess: organization.apiAccess,
                studentEnrollment: organization.studentEnrollment,
                maxStudentsPerSection: organization.maxStudentsPerSection,
                isActive: organization.isActive,
                stats: organization.stats,
                admins: organization.admins.map(admin => ({
                    _id: admin.user._id,
                    name: admin.user.name,
                    email: admin.user.email,
                    role: admin.role,
                    permissions: admin.permissions,
                    addedAt: admin.addedAt,
                    addedBy: admin.addedBy ? {
                        _id: admin.addedBy._id,
                        name: admin.addedBy.name
                    } : null,
                    lastLogin: admin.user.lastLogin
                })),
                createdAt: organization.createdAt,
                createdBy: organization.createdBy
            }
        });

    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[ORG] Organization retrieval failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error retrieving organization',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};

// PUT /organizations/:id - Update organization (SuperAdmin only)
export const updateOrganization = async (req, res) => {
    const startTime = Date.now();
    logger.info('[ORG] Starting organization update process', {
        superAdminId: req.user._id,
        organizationId: req.params.id
    });

    try {
        const organizationId = req.params.id;

        // Verify user is SuperAdmin
        if (req.user.role !== 'superAdmin') {
            logger.warn('[ORG] Unauthorized organization update attempt', { userId: req.user._id, role: req.user.role });
            return res.status(403).json({
                success: false,
                message: 'Only SuperAdmins can update organizations'
            });
        }

        // Find organization
        const organization = await Organization.findById(organizationId);
        if (!organization) {
            logger.warn('[ORG] Organization update failed: Organization not found', { organizationId });
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        // Extract update data
        const {
            name,
            brandName,
            emails,
            phones,
            websites,
            address,
            contentAccess,
            apiAccess,
            studentEnrollment,
            maxStudentsPerSection,
            isActive
        } = req.body;

        // Check if new name conflicts with existing organizations
        if (name && name !== organization.name) {
            const existingOrgByName = await Organization.findOne({ name, _id: { $ne: organizationId } });
            if (existingOrgByName) {
                return res.status(400).json({
                    success: false,
                    message: 'An organization with this name already exists'
                });
            }
        }

        // Update organization fields
        if (name) organization.name = name;
        if (brandName) organization.brandName = brandName;
        if (emails) organization.emails = emails;
        if (phones) organization.phones = phones;
        if (websites) organization.websites = websites;
        if (address) organization.address = { ...organization.address, ...address };
        if (contentAccess) organization.contentAccess = { ...organization.contentAccess, ...contentAccess };
        if (apiAccess) organization.apiAccess = { ...organization.apiAccess, ...apiAccess };
        if (studentEnrollment) organization.studentEnrollment = { ...organization.studentEnrollment, ...studentEnrollment };
        if (maxStudentsPerSection !== undefined) organization.maxStudentsPerSection = maxStudentsPerSection;
        if (isActive !== undefined) organization.isActive = isActive;

        // Save updated organization
        await organization.save();

        const processingTime = Date.now() - startTime;
        logger.info(`[ORG] Organization updated successfully (${processingTime}ms)`, {
            organizationId,
            superAdminId: req.user._id
        });

        return res.status(200).json({
            success: true,
            message: 'Organization updated successfully',
            organization: {
                _id: organization._id,
                name: organization.name,
                brandName: organization.brandName,
                organizationCode: organization.organizationCode,
                emails: organization.emails,
                phones: organization.phones,
                websites: organization.websites,
                address: organization.address,
                contentAccess: organization.contentAccess,
                apiAccess: organization.apiAccess,
                studentEnrollment: organization.studentEnrollment,
                maxStudentsPerSection: organization.maxStudentsPerSection,
                isActive: organization.isActive,
                stats: organization.stats,
                updatedAt: organization.updatedAt
            }
        });

    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[ORG] Organization update failed (${processingTime}ms):`, error);

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
            message: 'Server error updating organization',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};

// DELETE /organizations/:id - Delete organization (SuperAdmin only)
export const deleteOrganization = async (req, res) => {
    const startTime = Date.now();
    logger.info('[ORG] Starting organization deletion process', {
        superAdminId: req.user._id,
        organizationId: req.params.id
    });

    try {
        const organizationId = req.params.id;

        // Verify user is SuperAdmin
        if (req.user.role !== 'superAdmin') {
            logger.warn('[ORG] Unauthorized organization deletion attempt', { userId: req.user._id, role: req.user.role });
            return res.status(403).json({
                success: false,
                message: 'Only SuperAdmins can delete organizations'
            });
        }

        // Find organization
        const organization = await Organization.findById(organizationId);
        if (!organization) {
            logger.warn('[ORG] Organization deletion failed: Organization not found', { organizationId });
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        // Check if organization has users (prevent deletion if has users)
        const userCount = await User.countDocuments({
            organization: organizationId,
            isDeleted: false
        });

        if (userCount > 0) {
            logger.warn('[ORG] Organization deletion failed: Has active users', {
                organizationId,
                userCount
            });
            return res.status(400).json({
                success: false,
                message: `Cannot delete organization with ${userCount} active users. Please remove all users first.`,
                userCount
            });
        }

        // Soft delete organization
        organization.isDeleted = true;
        organization.isActive = false;
        await organization.save();

        const processingTime = Date.now() - startTime;
        logger.info(`[ORG] Organization deleted successfully (${processingTime}ms)`, {
            organizationId,
            superAdminId: req.user._id
        });

        return res.status(200).json({
            success: true,
            message: 'Organization deleted successfully'
        });

    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[ORG] Organization deletion failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error deleting organization',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};

// POST /organizations/:id/add-primary-admin - Add primary admin to organization (SuperAdmin only)
export const addPrimaryAdminToOrganization = async (req, res) => {
    const startTime = Date.now();
    logger.info('[ORG] Starting primary admin addition process', {
        superAdminId: req.user._id,
        organizationId: req.params.id
    });

    try {
        const organizationId = req.params.id;
        const { name, email } = req.body;

        // Verify user is SuperAdmin
        if (req.user.role !== 'superAdmin') {
            logger.warn('[ORG] Unauthorized primary admin addition attempt', { userId: req.user._id, role: req.user.role });
            return res.status(403).json({
                success: false,
                message: 'Only SuperAdmins can add primary admins to organizations'
            });
        }

        // Find organization
        const organization = await Organization.findById(organizationId);
        if (!organization) {
            logger.warn('[ORG] Primary admin addition failed: Organization not found', { organizationId });
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        // Check if email already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            logger.warn('[ORG] Primary admin addition failed: Email already exists', { email });
            return res.status(400).json({
                success: false,
                message: 'A user with this email already exists'
            });
        }

        // Check if organization already has a primary admin
        const existingPrimaryAdmin = organization.admins.find(admin => admin.role === 'primary_admin');
        if (existingPrimaryAdmin) {
            logger.warn('[ORG] Primary admin addition failed: Organization already has primary admin', {
                organizationId,
                existingPrimaryAdminId: existingPrimaryAdmin.user
            });
            return res.status(400).json({
                success: false,
                message: 'Organization already has a primary admin'
            });
        }

        // Generate strong password for admin
        const generatedPassword = generateStrongPassword();
        const hashedPassword = await bcrypt.hash(generatedPassword, 10);

        // Create admin user
        const admin = await User.create({
            name,
            email,
            password: hashedPassword,
            role: 'admin',
            organization: organizationId,
            isVerified: true, // Pre-verified since SuperAdmin created them
            managingOrganizations: [organizationId]
        });

        // Add admin to organization as primary admin
        await organization.addAdmin(admin._id, 'primary_admin', {
            canEnrollStudents: true,
            canEnrollTeachers: true,
            canManageClasses: true,
            canViewAnalytics: true,
            canManageContent: true,
            canManageAdmins: true
        }, req.user._id);

        // Update organization stats
        await organization.updateStats();

        // Send credentials email to admin
        const emailSent = await sendEmail(
            admin.email,
            'ADMIN_CREDENTIALS',
            {
                name: admin.name,
                organization: organization.name,
                email: admin.email,
                password: generatedPassword,
                adminRole: 'primary_admin'
            }
        );

        if (!emailSent) {
            logger.warn('[ORG] Failed to send primary admin credentials email', { adminId: admin._id });
        }

        const processingTime = Date.now() - startTime;
        logger.info(`[ORG] Primary admin added successfully (${processingTime}ms)`, {
            adminId: admin._id,
            organizationId,
            superAdminId: req.user._id
        });

        return res.status(201).json({
            success: true,
            message: 'Primary admin created and added to organization successfully! Login credentials have been sent to their email.',
            admin: {
                _id: admin._id,
                name: admin.name,
                email: admin.email,
                role: 'primary_admin',
                organization: {
                    _id: organization._id,
                    name: organization.name
                },
                password: generatedPassword // Include in response for SuperAdmin
            }
        });

    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[ORG] Primary admin addition failed (${processingTime}ms):`, error);

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
                message: 'An admin with this information already exists'
            });
        }

        return res.status(500).json({
            success: false,
            message: 'Server error adding primary admin',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};