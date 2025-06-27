// File: seeders/superAdminSeeder.js

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import User from '../models/user.model.js';
import logger from '../utils/logger.js';
import { generateStrongPassword } from '../utils/generatePassword.js';

// Load environment variables
dotenv.config();

/**
 * Create SuperAdmin user in the database
 */
const createSuperAdmin = async () => {
    const startTime = Date.now();

    try {
        logger.info('[SEED] Starting SuperAdmin creation process...');

        // Connect to database
        if (mongoose.connection.readyState === 0) {
            logger.info('[SEED] Connecting to database...');
            await mongoose.connect(process.env.MONGO_URI);
            logger.info('[SEED] Database connected successfully');
        }

        // Get SuperAdmin details from environment or use defaults
        const superAdminData = {
            name: process.env.SUPERADMIN_NAME || 'ObjectX SuperAdmin',
            email: process.env.SUPERADMIN_EMAIL || 'superadmin@objectx.in',
            password: process.env.SUPERADMIN_PASSWORD || generateStrongPassword()
        };

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(superAdminData.email)) {
            throw new Error('Invalid email format for SuperAdmin');
        }

        // Check if this specific email already exists (any role)
        const existingUser = await User.findOne({ email: superAdminData.email });
        if (existingUser) {
            logger.warn('[SEED] User with this email already exists', {
                userId: existingUser._id,
                email: existingUser.email,
                name: existingUser.name,
                role: existingUser.role
            });

            console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    User Already Exists                      ║
╠══════════════════════════════════════════════════════════════╣
║  📧 Email: ${existingUser.email.padEnd(45)} ║
║  👤 Name:  ${existingUser.name.padEnd(45)} ║
║  👥 Role:  ${existingUser.role.padEnd(45)} ║
║  🆔 ID:    ${existingUser._id.toString().padEnd(45)} ║
║  📅 Created: ${existingUser.createdAt.toLocaleDateString().padEnd(41)} ║
╠══════════════════════════════════════════════════════════════╣
║  ${existingUser.role === 'superAdmin' ? '⚠️  SuperAdmin with this email already exists' : '⚠️  Email is already in use by another user'} ║
║  Use different email or remove existing user                 ║
╚══════════════════════════════════════════════════════════════╝
            `);

            return {
                success: false,
                message: `Email ${superAdminData.email} is already in use`,
                existingUser: {
                    _id: existingUser._id,
                    name: existingUser.name,
                    email: existingUser.email,
                    role: existingUser.role,
                    createdAt: existingUser.createdAt
                }
            };
        }

        // Hash password
        logger.info('[SEED] Hashing SuperAdmin password...');
        const hashedPassword = await bcrypt.hash(superAdminData.password, 12); // Higher salt rounds for SuperAdmin

        // Create SuperAdmin user
        logger.info('[SEED] Creating SuperAdmin user...');
        const superAdmin = await User.create({
            name: superAdminData.name,
            email: superAdminData.email,
            password: hashedPassword,
            role: 'superAdmin',
            isVerified: true, // SuperAdmin is pre-verified
            organization: undefined, // SuperAdmin doesn't belong to any organization
            section: undefined,
            teachingSections: [],
            managingOrganizations: [],
            preferences: {
                language: 'english',
                theme: 'light',
                notifications: {
                    email: true,
                    sms: false,
                    push: true
                }
            }
        });

        const processingTime = Date.now() - startTime;
        logger.info(`[SEED] SuperAdmin created successfully (${processingTime}ms)`, {
            superAdminId: superAdmin._id,
            email: superAdmin.email,
            name: superAdmin.name
        });

        // Get total SuperAdmin count
        const totalSuperAdmins = await User.countDocuments({ role: 'superAdmin' });

        // Display success message with credentials
        console.log(`
╔══════════════════════════════════════════════════════════════╗
║                  SuperAdmin Created Successfully            ║
╠══════════════════════════════════════════════════════════════╣
║  🎉 SuperAdmin has been created for ObjectX Platform        ║
║                                                              ║
║  👤 Name:     ${superAdminData.name.padEnd(45)} ║
║  📧 Email:    ${superAdminData.email.padEnd(45)} ║
║  🔑 Password: ${superAdminData.password.padEnd(45)} ║
║  🆔 ID:       ${superAdmin._id.toString().padEnd(45)} ║
║  📊 Total SuperAdmins: ${totalSuperAdmins.toString().padEnd(35)} ║
║                                                              ║
╠══════════════════════════════════════════════════════════════╣
║  ⚠️  IMPORTANT SECURITY NOTES:                               ║
║  • Save these credentials securely                          ║
║  • Change password after first login                        ║
║  • Delete this seeder after use in production               ║
║  • Never commit credentials to version control              ║
╚══════════════════════════════════════════════════════════════╝
        `);

        return {
            success: true,
            message: 'SuperAdmin created successfully',
            superAdmin: {
                _id: superAdmin._id,
                name: superAdmin.name,
                email: superAdmin.email,
                password: superAdminData.password, // Return plain password for display
                createdAt: superAdmin.createdAt
            },
            totalSuperAdmins
        };

    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[SEED] SuperAdmin creation failed (${processingTime}ms):`, error);

        console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    SuperAdmin Creation Failed               ║
╠══════════════════════════════════════════════════════════════╣
║  ❌ Error: ${error.message.padEnd(50)} ║
║                                                              ║
║  💡 Possible solutions:                                      ║
║  • Check database connection                                ║
║  • Verify environment variables                             ║
║  • Ensure email is not already in use                       ║
║  • Check database permissions                               ║
╚══════════════════════════════════════════════════════════════╝
        `);

        throw error;
    }
};

/**
 * Remove SuperAdmin (for development/testing purposes)
 */
const removeSuperAdmin = async (email) => {
    try {
        logger.info('[SEED] Removing SuperAdmin...', { email });

        // Connect to database
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(process.env.MONGO_URI);
        }

        const result = await User.deleteOne({
            email: email,
            role: 'superAdmin'
        });

        if (result.deletedCount === 0) {
            logger.warn('[SEED] No SuperAdmin found with that email', { email });
            console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    SuperAdmin Not Found                     ║
╠══════════════════════════════════════════════════════════════╣
║  📧 Email: ${email.padEnd(45)} ║
║  ❌ No SuperAdmin found with this email                      ║
╚══════════════════════════════════════════════════════════════╝
            `);
            return { success: false, message: 'SuperAdmin not found' };
        }

        const remainingSuperAdmins = await User.countDocuments({ role: 'superAdmin' });

        logger.info('[SEED] SuperAdmin removed successfully', { email, remainingSuperAdmins });

        console.log(`
╔══════════════════════════════════════════════════════════════╗
║                SuperAdmin Removed Successfully              ║
╠══════════════════════════════════════════════════════════════╣
║  📧 Email: ${email.padEnd(45)} ║
║  ✅ SuperAdmin has been removed                              ║
║  📊 Remaining SuperAdmins: ${remainingSuperAdmins.toString().padEnd(31)} ║
╚══════════════════════════════════════════════════════════════╝
        `);

        return { success: true, message: 'SuperAdmin removed successfully', remainingSuperAdmins };

    } catch (error) {
        logger.error('[SEED] SuperAdmin removal failed:', error);
        throw error;
    }
};

/**
 * List all SuperAdmins
 */
const listSuperAdmins = async () => {
    try {
        logger.info('[SEED] Listing all SuperAdmins...');

        // Connect to database
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(process.env.MONGO_URI);
        }

        const superAdmins = await User.find({
            role: 'superAdmin',
            isDeleted: { $ne: true } // Handle both false and undefined
        }).select('name email createdAt lastLogin isVerified').sort({ createdAt: -1 });

        console.log(`
╔══════════════════════════════════════════════════════════════╗
║                       SuperAdmin List                       ║
║                    Total: ${superAdmins.length.toString().padStart(2)} SuperAdmin(s)                   ║
╠══════════════════════════════════════════════════════════════╣`);

        if (superAdmins.length === 0) {
            console.log('║  📭 No SuperAdmins found in the system                      ║');
        } else {
            superAdmins.forEach((admin, index) => {
                const lastLogin = admin.lastLogin ? admin.lastLogin.toLocaleDateString() : 'Never';
                console.log(`║  ${(index + 1).toString().padStart(2)}. Name: ${admin.name.padEnd(30)} ║`);
                console.log(`║      Email: ${admin.email.padEnd(40)} ║`);
                console.log(`║      Created: ${admin.createdAt.toLocaleDateString().padEnd(12)} | Verified: ${(admin.isVerified ? 'Yes' : 'No').padEnd(3)} | Last Login: ${lastLogin.padEnd(10)} ║`);
                console.log('║                                                              ║');
            });
        }

        console.log('╚══════════════════════════════════════════════════════════════╝');

        return { success: true, superAdmins, total: superAdmins.length };

    } catch (error) {
        logger.error('[SEED] SuperAdmin listing failed:', error);
        throw error;
    }
};

// Handle command line arguments
const handleCommand = async () => {
    const command = process.argv[2];
    const email = process.argv[3];

    try {
        switch (command) {
            case 'create':
                await createSuperAdmin();
                break;

            case 'remove':
                if (!email) {
                    console.log('❌ Email required for remove command');
                    console.log('Usage: npm run seed:superadmin remove <email>');
                    process.exit(1);
                }
                await removeSuperAdmin(email);
                break;

            case 'list':
                await listSuperAdmins();
                break;

            default:
                console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    SuperAdmin Seeder Usage                  ║
╠══════════════════════════════════════════════════════════════╣
║  📝 Available Commands:                                      ║
║                                                              ║
║  • npm run seed:superadmin create                           ║
║    Creates a new SuperAdmin user                            ║
║                                                              ║
║  • npm run seed:superadmin list                             ║
║    Lists all existing SuperAdmins                           ║
║                                                              ║
║  • npm run seed:superadmin remove <email>                   ║
║    Removes SuperAdmin with specified email                  ║
║                                                              ║
╠══════════════════════════════════════════════════════════════╣
║  🔧 Environment Variables (optional):                       ║
║  • SUPERADMIN_NAME - Name for SuperAdmin                    ║
║  • SUPERADMIN_EMAIL - Email for SuperAdmin                  ║
║  • SUPERADMIN_PASSWORD - Password (auto-generated if empty) ║
║                                                              ║
║  💡 Note: Multiple SuperAdmins are supported!               ║
║  Each must have a unique email address.                     ║
╚══════════════════════════════════════════════════════════════╝
                `);
        }
    } catch (error) {
        logger.error('[SEED] Command execution failed:', error);
        process.exit(1);
    } finally {
        // Close database connection
        if (mongoose.connection.readyState !== 0) {
            await mongoose.connection.close();
            logger.info('[SEED] Database connection closed');
        }
        process.exit(0);
    }
};

// Export functions for use in other files
export { createSuperAdmin, removeSuperAdmin, listSuperAdmins };

// Run command if file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    handleCommand();
}