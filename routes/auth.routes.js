import express from 'express';
import {
    getMe,
    loginUser,
    registerUser,
    updateProfile,
    changePassword,
    verifyEmail,
    resendOTP,
    forgotPassword,
    resetPassword
} from '../controllers/auth.controllers.js';
import { updatePassword } from '../controllers/updatePassword.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const authRouter = express.Router();

// Public routes - Registration and Email Verification
authRouter.post('/signup', registerUser);
authRouter.post('/verify-email', verifyEmail);
authRouter.post('/resend-otp', resendOTP);

// Public routes - Login
authRouter.post('/login', loginUser);

// Public routes - Password Reset
authRouter.post('/forgot-password', forgotPassword);
authRouter.post('/reset-password', resetPassword);

// Protected routes - User Profile
// authRouter.get('/me', getMe);
// authRouter.put('/me', updateProfile);
// authRouter.put('/password', changePassword);

// update password
authRouter.put('/update-password', protect, updatePassword);

export default authRouter;