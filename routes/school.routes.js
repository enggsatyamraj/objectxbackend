import express from 'express';
import {
    createSchool,
    getAllSchools,
    getSchoolById,
    updateSchool,
    deleteSchool,
    addTeacherToSchool,
    addStudentToSchool
} from '../controllers/school.controllers.js';
import { protect } from '../middleware/auth.middleware.js';
import { authorizeRoles } from '../middleware/role.middleware.js';
import { zodValidator } from '../utils/zodSchema/zodValidator.js';
import {
    schoolSchema,
    schoolUpdateSchema,
    addTeacherSchema,
    addStudentToSchoolSchema
} from '../utils/zodSchema/school.zodSchema.js';

const schoolRouter = express.Router();

// Base routes
schoolRouter.route('/')
    .post(protect, authorizeRoles(['admin', 'superAdmin']), zodValidator(schoolSchema), createSchool)
    .get(protect, authorizeRoles(['admin', 'superAdmin']), getAllSchools);

// School by ID routes
schoolRouter.route('/:id')
    .get(protect, getSchoolById)
    .put(protect, authorizeRoles(['admin', 'superAdmin']), zodValidator(schoolUpdateSchema), updateSchool)
    .delete(protect, authorizeRoles(['superAdmin']), deleteSchool);

// School member management
schoolRouter.post('/:id/teachers', protect, authorizeRoles(['admin', 'superAdmin']), zodValidator(addTeacherSchema), addTeacherToSchool);
schoolRouter.post('/:id/students', protect, authorizeRoles(['admin', 'superAdmin', 'teacher']), zodValidator(addStudentToSchoolSchema), addStudentToSchool);

export default schoolRouter;