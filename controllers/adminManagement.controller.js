// File: controllers/adminManagement.controller.js

import bcrypt from 'bcryptjs';
import User from '../models/user.model.js';
import Organization from '../models/organization.model.js';
import logger from '../utils/logger.js';
import { generateStrongPassword } from '../utils/generatePassword.js';
import { sendEmail } from '../utils/emailService.js';

// POST /admin/create-secondary-admin
export const createSecondaryAdmin = async (req, res) => {
    const startTime = Date.now();
    logger.info('[ADMIN] Starting secondary admin creation process', { adminId: req.user._id });

    try {
        // Extract data from request body
        const {
            name,
            email,
            permissions = {} // Custom permissions for secondary admin
        } = req.body;

        // Verify admin permissions - Only primary admin can create secondary admins
        const primaryAdmin = await User.findById(req.user._id).populate('organization');
        if (!primaryAdmin || !['admin'].includes(primaryAdmin.role)) {
            logger.warn('[ADMIN] Unauthorized secondary admin creation attempt', { userId: req.user._id, role: primaryAdmin?.role });
            return res.status(403).json({
                success: false,
                message: 'Only organization admins can create secondary admins'
            });
        }

        // Verify admin belongs to an organization
        if (!primaryAdmin.organization) {
            logger.warn('[ADMIN] Admin without organization attempted secondary admin creation', { adminId: primaryAdmin._id });
            return res.status(400).json({
                success: false,
                message: 'Admin must belong to an organization to create secondary admins'
            });
        }

        // Check if user is primary admin of the organization
        const organization = await Organization.findById(primaryAdmin.organization._id);
        const primaryAdminRecord = organization.admins.find(a => a.user.toString() === primaryAdmin._id.toString());

        if (!primaryAdminRecord || primaryAdminRecord.role !== 'primary_admin') {
            logger.warn('[ADMIN] Non-primary admin attempted to create secondary admin', {
                adminId: primaryAdmin._id,
                organizationId: organization._id,
                adminRole: primaryAdminRecord?.role
            });
            return res.status(403).json({
                success: false,
                message: 'Only primary admins can create secondary admins'
            });
        }

        // Check if email already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            logger.warn('[ADMIN] Secondary admin creation failed: Email already exists', { email });
            return res.status(400).json({
                success: false,
                message: 'A user with this email already exists'
            });
        }

        // Generate strong password for admin
        const generatedPassword = generateStrongPassword();
        const hashedPassword = await bcrypt.hash(generatedPassword, 10);

        // Create secondary admin user
        const secondaryAdmin = await User.create({
            name,
            email,
            password: hashedPassword,
            role: 'admin',
            organization: primaryAdmin.organization._id,
            isVerified: true, // Pre-verified since primary admin created them
            managingOrganizations: [primaryAdmin.organization._id]
        });

        // Define default permissions for secondary admin
        const defaultSecondaryPermissions = {
            canEnrollStudents: true,
            canEnrollTeachers: true,
            canManageClasses: true,
            canViewAnalytics: true,
            canManageContent: false, // Only primary admin by default
            canManageAdmins: false   // Only primary admin by default
        };

        // Merge with custom permissions (but don't allow elevation of restricted permissions)
        const finalPermissions = {
            ...defaultSecondaryPermissions,
            ...permissions,
            // Force these to false for secondary admins
            canManageContent: false,
            canManageAdmins: false
        };

        // Add secondary admin to organization using the organization method
        await organization.addAdmin(
            secondaryAdmin._id,
            'secondary_admin',
            finalPermissions,
            primaryAdmin._id
        );

        // Update organization stats
        await organization.updateStats();

        // Send credentials email to secondary admin
        const emailSent = await sendEmail(
            secondaryAdmin.email,
            'ADMIN_CREDENTIALS',
            {
                name: secondaryAdmin.name,
                organization: organization.name,
                email: secondaryAdmin.email,
                password: generatedPassword,
                adminRole: 'secondary_admin'
            }
        );

        if (!emailSent) {
            logger.warn('[ADMIN] Failed to send secondary admin credentials email', { adminId: secondaryAdmin._id });
        }

        // Calculate processing time
        const processingTime = Date.now() - startTime;
        logger.info(`[ADMIN] Secondary admin created successfully (${processingTime}ms)`, {
            secondaryAdminId: secondaryAdmin._id,
            primaryAdminId: req.user._id,
            organizationId: organization._id
        });

        // Send successful response
        return res.status(201).json({
            success: true,
            message: 'Secondary admin created successfully! Login credentials have been sent to their email.',
            admin: {
                _id: secondaryAdmin._id,
                name: secondaryAdmin.name,
                email: secondaryAdmin.email,
                role: 'secondary_admin',
                permissions: finalPermissions,
                organization: {
                    _id: organization._id,
                    name: organization.name
                },
                createdBy: {
                    _id: primaryAdmin._id,
                    name: primaryAdmin.name
                }
            }
        });

    } catch (error) {
        // Calculate processing time even for errors
        const processingTime = Date.now() - startTime;

        logger.error(`[ADMIN] Secondary admin creation failed (${processingTime}ms):`, error);

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

        // Default server error
        return res.status(500).json({
            success: false,
            message: 'Server error during secondary admin creation',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};

// GET /admin/list-admins - List all admins in organization
export const listOrganizationAdmins = async (req, res) => {
    const startTime = Date.now();
    logger.info('[ADMIN] Listing organization admins', { adminId: req.user._id });

    try {
        // Verify admin permissions
        const admin = await User.findById(req.user._id).populate('organization');
        if (!admin || !['admin'].includes(admin.role)) {
            logger.warn('[ADMIN] Unauthorized admin list attempt', { userId: req.user._id, role: admin?.role });
            return res.status(403).json({
                success: false,
                message: 'Only organization admins can view admin list'
            });
        }

        if (!admin.organization) {
            return res.status(400).json({
                success: false,
                message: 'Admin must belong to an organization'
            });
        }

        // Get organization with populated admin details
        const organization = await Organization.findById(admin.organization._id)
            .populate('admins.user', 'name email createdAt lastLogin')
            .populate('admins.addedBy', 'name email');

        if (!organization) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        // Format admin list
        const adminList = organization.admins.map(adminRecord => ({
            _id: adminRecord.user._id,
            name: adminRecord.user.name,
            email: adminRecord.user.email,
            role: adminRecord.role,
            permissions: adminRecord.permissions,
            addedAt: adminRecord.addedAt,
            addedBy: adminRecord.addedBy ? {
                _id: adminRecord.addedBy._id,
                name: adminRecord.addedBy.name
            } : null,
            lastLogin: adminRecord.user.lastLogin,
            createdAt: adminRecord.user.createdAt
        }));

        const processingTime = Date.now() - startTime;
        logger.info(`[ADMIN] Admin list retrieved successfully (${processingTime}ms)`, {
            adminId: req.user._id,
            organizationId: organization._id,
            adminCount: adminList.length
        });

        return res.status(200).json({
            success: true,
            organization: {
                _id: organization._id,
                name: organization.name
            },
            admins: adminList,
            totalAdmins: adminList.length
        });

    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[ADMIN] Admin list retrieval failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error retrieving admin list',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};

// PUT /admin/update-admin-permissions/:adminId - Update admin permissions (Primary admin only)
export const updateAdminPermissions = async (req, res) => {
    const startTime = Date.now();
    logger.info('[ADMIN] Updating admin permissions', {
        adminId: req.user._id,
        targetAdminId: req.params.adminId
    });

    try {
        const { permissions } = req.body;
        const targetAdminId = req.params.adminId;

        // Verify primary admin permissions
        const primaryAdmin = await User.findById(req.user._id).populate('organization');
        if (!primaryAdmin || !['admin'].includes(primaryAdmin.role)) {
            return res.status(403).json({
                success: false,
                message: 'Only organization admins can update permissions'
            });
        }

        if (!primaryAdmin.organization) {
            return res.status(400).json({
                success: false,
                message: 'Admin must belong to an organization'
            });
        }

        // Get organization and verify primary admin status
        const organization = await Organization.findById(primaryAdmin.organization._id);
        const primaryAdminRecord = organization.admins.find(a => a.user.toString() === primaryAdmin._id.toString());

        if (!primaryAdminRecord || primaryAdminRecord.role !== 'primary_admin') {
            return res.status(403).json({
                success: false,
                message: 'Only primary admins can update admin permissions'
            });
        }

        // Find target admin in organization
        const targetAdminRecord = organization.admins.find(a => a.user.toString() === targetAdminId);
        if (!targetAdminRecord) {
            return res.status(404).json({
                success: false,
                message: 'Admin not found in this organization'
            });
        }

        // Prevent primary admin from updating their own permissions
        if (targetAdminId === primaryAdmin._id.toString()) {
            return res.status(400).json({
                success: false,
                message: 'Cannot update your own permissions'
            });
        }

        // Prevent updating primary admin permissions
        if (targetAdminRecord.role === 'primary_admin') {
            return res.status(400).json({
                success: false,
                message: 'Cannot update primary admin permissions'
            });
        }

        // Update permissions (but enforce restrictions for secondary admins)
        const updatedPermissions = {
            ...targetAdminRecord.permissions,
            ...permissions,
            // Force these to false for secondary admins
            canManageContent: false,
            canManageAdmins: false
        };

        // Update the admin record in organization
        targetAdminRecord.permissions = updatedPermissions;
        await organization.save();

        const processingTime = Date.now() - startTime;
        logger.info(`[ADMIN] Admin permissions updated successfully (${processingTime}ms)`, {
            primaryAdminId: primaryAdmin._id,
            targetAdminId,
            organizationId: organization._id
        });

        return res.status(200).json({
            success: true,
            message: 'Admin permissions updated successfully',
            admin: {
                _id: targetAdminId,
                permissions: updatedPermissions
            }
        });

    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[ADMIN] Admin permissions update failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error updating admin permissions',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};

// DELETE /admin/remove-admin/:adminId - Remove admin from organization (Primary admin only)
export const removeAdmin = async (req, res) => {
    const startTime = Date.now();
    logger.info('[ADMIN] Removing admin from organization', {
        adminId: req.user._id,
        targetAdminId: req.params.adminId
    });

    try {
        const targetAdminId = req.params.adminId;

        // Verify primary admin permissions
        const primaryAdmin = await User.findById(req.user._id).populate('organization');
        if (!primaryAdmin || !['admin'].includes(primaryAdmin.role)) {
            return res.status(403).json({
                success: false,
                message: 'Only organization admins can remove admins'
            });
        }

        if (!primaryAdmin.organization) {
            return res.status(400).json({
                success: false,
                message: 'Admin must belong to an organization'
            });
        }

        // Get organization and verify primary admin status
        const organization = await Organization.findById(primaryAdmin.organization._id);
        const primaryAdminRecord = organization.admins.find(a => a.user.toString() === primaryAdmin._id.toString());

        if (!primaryAdminRecord || primaryAdminRecord.role !== 'primary_admin') {
            return res.status(403).json({
                success: false,
                message: 'Only primary admins can remove other admins'
            });
        }

        // Prevent primary admin from removing themselves
        if (targetAdminId === primaryAdmin._id.toString()) {
            return res.status(400).json({
                success: false,
                message: 'Cannot remove yourself from organization'
            });
        }

        // Find target admin
        const targetAdminRecord = organization.admins.find(a => a.user.toString() === targetAdminId);
        if (!targetAdminRecord) {
            return res.status(404).json({
                success: false,
                message: 'Admin not found in this organization'
            });
        }

        // Prevent removing other primary admins
        if (targetAdminRecord.role === 'primary_admin') {
            return res.status(400).json({
                success: false,
                message: 'Cannot remove primary admin'
            });
        }

        // Remove admin from organization using the organization method
        await organization.removeAdmin(targetAdminId);

        // Update the user's role and organization references
        await User.findByIdAndUpdate(targetAdminId, {
            role: 'specialUser', // Convert to special user
            organization: null,
            managingOrganizations: []
        });

        const processingTime = Date.now() - startTime;
        logger.info(`[ADMIN] Admin removed successfully (${processingTime}ms)`, {
            primaryAdminId: primaryAdmin._id,
            removedAdminId: targetAdminId,
            organizationId: organization._id
        });

        return res.status(200).json({
            success: true,
            message: 'Admin removed from organization successfully'
        });

    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[ADMIN] Admin removal failed (${processingTime}ms):`, error);

        return res.status(500).json({
            success: false,
            message: 'Server error removing admin',
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
};