// File: routes/organization.routes.js

import express from 'express';
import { protect } from '../middleware/auth.middleware.js';
import { authorizeRoles } from '../middleware/role.middleware.js';
import {
    createOrganization,
    getAllOrganizations,
    getOrganizationById,
    updateOrganization,
    deleteOrganization,
    addPrimaryAdminToOrganization
} from '../controllers/organization.controller.js';

const organizationRouter = express.Router();

// Apply auth middleware to all organization routes
organizationRouter.use(protect);

// ==================== ORGANIZATION CRUD ROUTES ====================

// Create organization (SuperAdmin only)
organizationRouter.post('/',
    authorizeRoles(['superAdmin']),
    createOrganization
);

// Get all organizations (SuperAdmin only)
organizationRouter.get('/',
    authorizeRoles(['superAdmin']),
    getAllOrganizations
);

// Get organization by ID (SuperAdmin and Organization Admins)
organizationRouter.get('/:id',
    authorizeRoles(['superAdmin', 'admin']),
    getOrganizationById
);

// Update organization (SuperAdmin only)
organizationRouter.put('/:id',
    authorizeRoles(['superAdmin']),
    updateOrganization
);

// Delete organization (SuperAdmin only)
organizationRouter.delete('/:id',
    authorizeRoles(['superAdmin']),
    deleteOrganization
);

// ==================== ORGANIZATION ADMIN MANAGEMENT ====================

// Add primary admin to organization (SuperAdmin only)
organizationRouter.post('/:id/add-primary-admin',
    authorizeRoles(['superAdmin']),
    addPrimaryAdminToOrganization
);

export default organizationRouter;