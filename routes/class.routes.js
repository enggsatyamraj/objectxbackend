import express from 'express';
import {
    createClass,
    getAllClasses,
    getClassById,
    updateClass,
    deleteClass,
    addStudentToClass,
    removeStudentFromClass
} from '../controllers/class.controllers.js';
import { protect } from '../middleware/auth.middleware.js';
import { authorizeRoles } from '../middleware/role.middleware.js';
import { zodValidator } from '../utils/zodSchema/zodValidator.js';
import {
    classSchema,
    classUpdateSchema,
    addStudentToClassSchema
} from '../utils/zodSchema/class.zodSchema.js';

const classRouter = express.Router();

// Base routes
classRouter.route('/')
    .post(
        protect,
        authorizeRoles(['admin', 'superAdmin', 'teacher']),
        zodValidator(classSchema),
        createClass
    )
    .get(
        protect,
        getAllClasses
    );

// Class by ID routes
classRouter.route('/:id')
    .get(
        protect,
        getClassById
    )
    .put(
        protect,
        authorizeRoles(['admin', 'superAdmin', 'teacher']),
        zodValidator(classUpdateSchema),
        updateClass
    )
    .delete(
        protect,
        authorizeRoles(['admin', 'superAdmin']),
        deleteClass
    );

// Class student management
classRouter.route('/:id/students')
    .post(
        protect,
        authorizeRoles(['admin', 'superAdmin', 'teacher']),
        zodValidator(addStudentToClassSchema),
        addStudentToClass
    );

classRouter.route('/:id/students/:studentId')
    .delete(
        protect,
        authorizeRoles(['admin', 'superAdmin', 'teacher']),
        removeStudentFromClass
    );

export default classRouter;