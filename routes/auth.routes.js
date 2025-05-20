import express from 'express';
import {
    getMe,
    loginUser,
    registerUser,
    updateProfile,
    changePassword
} from '../controllers/auth.controllers.js';
import { protect } from '../middleware/auth.middleware.js';
import { zodValidator } from '../utils/zodSchema/zodValidator.js';
import {
    registerSchema,
    loginSchema,
    profileUpdateSchema,
    passwordChangeSchema
} from '../utils/zodSchema/auth.zodSchema.js';

const authRouter = express.Router();

// Public routes
authRouter.post('/signup', zodValidator(registerSchema), registerUser);
authRouter.post('/login', zodValidator(loginSchema), loginUser);

// Protected routes
authRouter.get('/me', protect, getMe);
authRouter.put('/me', protect, zodValidator(profileUpdateSchema), updateProfile);
authRouter.put('/password', protect, zodValidator(passwordChangeSchema), changePassword);

export default authRouter;