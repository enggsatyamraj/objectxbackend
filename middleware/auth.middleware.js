import jwt from 'jsonwebtoken';
import User from '../models/user.models.js';
import logger from '../utils/logger.js';

export const protect = async (req, res, next) => {
    logger.debug('Processing authorization middleware');
    let token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        logger.warn('Access attempt without token');
        return res.status(401).json({ message: 'No token, unauthorized' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = await User.findById(decoded._id).select('-password');

        if (!req.user) {
            logger.warn(`Token contains invalid user ID: ${decoded._id}`);
            return res.status(401).json({ message: 'User not found' });
        }

        logger.debug(`User authenticated: ${req.user._id}, role: ${req.user.role}`);
        next();
    } catch (err) {
        logger.warn('Token verification failed', err);
        return res.status(401).json({ message: 'Token failed' });
    }
};