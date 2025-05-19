import express from 'express';
import { getMe, loginUser, registerUser } from '../controllers/auth.controllers.js';
import { protect } from '../middleware/auth.middleware.js';

const authRouter = express.Router();

authRouter.post('/signup', registerUser);
authRouter.post('/login', loginUser);
authRouter.get('/me', protect, getMe);

export default authRouter;
