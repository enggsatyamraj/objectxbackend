import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import logger from './utils/logger.js';
import authRouter from './routes/auth.routes.js';
import organizationRouter from './routes/organization.routes.js';
import cors from 'cors'
import User from './models/user.model.js';
import Organization from './models/organization.model.js';
import Class from './models/class.model.js';
import Section from './models/section.model.js';
import Content from './models/content.model.js';
import APIKey from './models/apikey.model.js';
import adminRouter from './routes/admin.routes.js';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
app.use(cors());
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Database connection
const connectDB = async () => {
    try {
        const DB_URI = process.env.MONGO_URI;

        // Validate database URI
        if (!DB_URI) {
            throw new Error('MongoDB connection string is missing');
        }

        logger.info('Initializing database connection...');

        await mongoose.connect(DB_URI);

        logger.info('MongoDB connected successfully');
    } catch (error) {
        logger.error('MongoDB connection failed:', error);
        process.exit(1);
    }
};

// Routes
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/organizations', organizationRouter);
app.use('/api/v1/admin', adminRouter);

app.get('/', (req, res) => {
    res.json({ message: 'Welcome to the ObjectX API' });
});

app.get('/health', (req, res) => {
    res.status(200).json({
        status: "healthy"
    })
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ message: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
    logger.error(`Error: ${err.message}`);
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
        message: err.message,
        stack: process.env.NODE_ENV === 'production' ? '🥞' : err.stack,
    });
});

// Bootstrap function to start the application
const bootstrap = async () => {
    const startTime = Date.now();

    try {
        logger.info('Starting application bootstrap process...');

        // Connect to database
        await connectDB();

        // Start the server
        app.listen(PORT, () => {
            const bootTime = (Date.now() - startTime) / 1000;
            logger.info(`Server running on port ${PORT}`);
            logger.info(`Application started successfully in ${bootTime.toFixed(2)} seconds`);
            logger.info(`Server is running in ${process.env.NODE_ENV || 'development'} mode`);
        });
    } catch (error) {
        const bootTime = (Date.now() - startTime) / 1000;
        logger.error(`Application startup failed after ${bootTime.toFixed(2)} seconds:`, error);
        process.exit(1);
    }
};

// Start the application
bootstrap();

// https://claude.ai/chat/34273b02-152c-4c09-a22f-ef39435a145b