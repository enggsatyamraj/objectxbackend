// File: seeders/databaseCleaner.js

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import logger from '../utils/logger.js';

// Load environment variables
dotenv.config();

/**
 * Get all collection names from the database
 */
const getAllCollections = async () => {
    try {
        const collections = await mongoose.connection.db.listCollections().toArray();
        return collections.map(collection => collection.name);
    } catch (error) {
        logger.error('[CLEANER] Error getting collections:', error);
        return [];
    }
};

/**
 * Clean all collections in the database
 */
const cleanDatabase = async (options = {}) => {
    const startTime = Date.now();

    try {
        const {
            confirmClean = false,
            preserveIndexes = true,
            showProgress = true
        } = options;

        logger.info('[CLEANER] Starting database cleanup process...');

        // Connect to database if not connected
        if (mongoose.connection.readyState === 0) {
            logger.info('[CLEANER] Connecting to database...');
            await mongoose.connect(process.env.MONGO_URI);
            logger.info('[CLEANER] Database connected successfully');
        }

        // Get database information
        const dbName = mongoose.connection.name;
        const collections = await getAllCollections();

        logger.info('[CLEANER] Database cleanup details', {
            database: dbName,
            collectionsFound: collections.length,
            collections: collections
        });

        if (showProgress) {
            console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    Database Cleanup Process                 ║
╠══════════════════════════════════════════════════════════════╣
║  🗄️  Database: ${dbName.padEnd(45)} ║
║  📊 Collections Found: ${collections.length.toString().padEnd(37)} ║
║                                                              ║
║  📋 Collections to be cleaned:                               ║`);

            collections.forEach((collection, index) => {
                console.log(`║  ${(index + 1).toString().padStart(2)}. ${collection.padEnd(55)} ║`);
            });

            console.log(`║                                                              ║
╚══════════════════════════════════════════════════════════════╝`);
        }

        // Safety check - require confirmation for production
        if (process.env.NODE_ENV === 'production' && !confirmClean) {
            console.log(`
╔═════════════════════════════════════════════════════════════╗
║                        ⚠️  WARNING ⚠️                       ║
╠═════════════════════════════════════════════════════════════╣
║  You are about to clean the PRODUCTION database!            ║
║                                                             ║
║  This will permanently delete ALL data including:           ║
║  • All users (including SuperAdmins)                        ║
║  • All organizations and schools                            ║
║  • All classes, sections, and students                      ║
║  • All content and API keys                                 ║
║  • All application data                                     ║
║                                                             ║
║  To proceed with production cleanup, run:                   ║
║  npm run db:clean:force                                     ║
╚═════════════════════════════════════════════════════════════╝
            `);
            return {
                success: false,
                message: 'Production cleanup requires confirmation',
                requiresConfirmation: true
            };
        }

        if (collections.length === 0) {
            logger.info('[CLEANER] No collections found to clean');
            console.log(`
╔══════════════════════════════════════════════════════════════╗
║                     Database Already Clean                  ║
╠══════════════════════════════════════════════════════════════╣
║  ✅ No collections found in the database                    ║
║  📊 Database is already clean and ready for fresh data      ║
╚══════════════════════════════════════════════════════════════╝
            `);
            return {
                success: true,
                message: 'Database is already clean',
                collectionsRemoved: 0
            };
        }

        // Start cleanup process
        let cleanedCollections = 0;
        let errors = [];

        logger.info('[CLEANER] Starting collection cleanup...');

        for (const collectionName of collections) {
            try {
                logger.debug(`[CLEANER] Cleaning collection: ${collectionName}`);

                if (preserveIndexes) {
                    // Delete documents but preserve indexes
                    const result = await mongoose.connection.db.collection(collectionName).deleteMany({});
                    logger.debug(`[CLEANER] Deleted ${result.deletedCount} documents from ${collectionName}`);
                } else {
                    // Drop entire collection (removes indexes too)
                    await mongoose.connection.db.collection(collectionName).drop();
                    logger.debug(`[CLEANER] Dropped collection: ${collectionName}`);
                }

                cleanedCollections++;

                if (showProgress) {
                    process.stdout.write(`\r[CLEANER] Cleaned ${cleanedCollections}/${collections.length} collections...`);
                }

            } catch (error) {
                logger.error(`[CLEANER] Error cleaning collection ${collectionName}:`, error);
                errors.push({
                    collection: collectionName,
                    error: error.message
                });
            }
        }

        if (showProgress) {
            process.stdout.write('\n');
        }

        const processingTime = Date.now() - startTime;

        if (errors.length === 0) {
            logger.info(`[CLEANER] Database cleaned successfully (${processingTime}ms)`, {
                collectionsRemoved: cleanedCollections,
                preservedIndexes: preserveIndexes
            });

            console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    Database Cleaned Successfully            ║
╠══════════════════════════════════════════════════════════════╣
║  ✅ Collections Cleaned: ${cleanedCollections.toString().padEnd(37)} ║
║  ⏱️  Processing Time: ${(processingTime / 1000).toFixed(2)}s${' '.repeat(36)} ║
║  🔄 Indexes Preserved: ${(preserveIndexes ? 'Yes' : 'No').padEnd(36)} ║
║                                                              ║
║  🎉 Database is now clean and ready for fresh data!         ║
║                                                              ║
║  📝 Next Steps:                                              ║
║  1. Run: npm run seed:superadmin:create                     ║
║  2. Start your application: npm run start:dev               ║
║  3. Begin creating organizations and users                  ║
╚══════════════════════════════════════════════════════════════╝
            `);

            return {
                success: true,
                message: 'Database cleaned successfully',
                collectionsRemoved: cleanedCollections,
                processingTime: processingTime,
                errors: []
            };

        } else {
            logger.warn(`[CLEANER] Database cleanup completed with errors (${processingTime}ms)`, {
                collectionsRemoved: cleanedCollections,
                errorCount: errors.length,
                errors: errors
            });

            console.log(`
╔══════════════════════════════════════════════════════════════╗
║                Database Cleanup Completed with Errors       ║
╠══════════════════════════════════════════════════════════════╣
║  ⚠️  Collections Cleaned: ${cleanedCollections.toString().padEnd(33)} ║
║  ❌ Errors Encountered: ${errors.length.toString().padEnd(35)} ║
║                                                              ║
║  🔍 Error Details:                                           ║`);

            errors.forEach((error, index) => {
                console.log(`║  ${(index + 1).toString().padStart(2)}. ${error.collection}: ${error.error.substring(0, 35).padEnd(35)} ║`);
            });

            console.log(`║                                                              ║
║  💡 Most errors are non-critical (empty collections, etc.)  ║
╚══════════════════════════════════════════════════════════════╝
            `);

            return {
                success: true,
                message: 'Database cleanup completed with some errors',
                collectionsRemoved: cleanedCollections,
                processingTime: processingTime,
                errors: errors
            };
        }

    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[CLEANER] Database cleanup failed (${processingTime}ms):`, error);

        console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    Database Cleanup Failed                  ║
╠══════════════════════════════════════════════════════════════╣
║  ❌ Error: ${error.message.substring(0, 50).padEnd(50)} ║
║                                                              ║
║  💡 Possible solutions:                                      ║
║  • Check database connection                                ║
║  • Verify MongoDB is running                               ║
║  • Check database permissions                               ║
║  • Ensure no other processes are using the database        ║
╚══════════════════════════════════════════════════════════════╝
        `);

        throw error;
    }
};

/**
 * Get database statistics before cleanup
 */
const getDatabaseStats = async () => {
    try {
        logger.info('[CLEANER] Getting database statistics...');

        // Connect to database if not connected
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(process.env.MONGO_URI);
        }

        const dbName = mongoose.connection.name;
        const collections = await getAllCollections();

        const stats = {
            database: dbName,
            totalCollections: collections.length,
            collections: []
        };

        // Get document count for each collection
        for (const collectionName of collections) {
            try {
                const count = await mongoose.connection.db.collection(collectionName).countDocuments();
                stats.collections.push({
                    name: collectionName,
                    documentCount: count
                });
            } catch (error) {
                logger.warn(`[CLEANER] Could not get count for collection ${collectionName}:`, error);
                stats.collections.push({
                    name: collectionName,
                    documentCount: 'Unknown'
                });
            }
        }

        // Calculate total documents
        stats.totalDocuments = stats.collections.reduce((total, collection) => {
            return total + (typeof collection.documentCount === 'number' ? collection.documentCount : 0);
        }, 0);

        console.log(`
╔══════════════════════════════════════════════════════════════╗
║                      Database Statistics                    ║
╠══════════════════════════════════════════════════════════════╣
║  🗄️  Database: ${dbName.padEnd(45)} ║
║  📊 Total Collections: ${stats.totalCollections.toString().padEnd(37)} ║
║  📄 Total Documents: ${stats.totalDocuments.toString().padEnd(39)} ║
║                                                              ║
║  📋 Collection Details:                                      ║`);

        stats.collections.forEach((collection, index) => {
            const countStr = collection.documentCount.toString();
            console.log(`║  ${(index + 1).toString().padStart(2)}. ${collection.name.padEnd(35)} (${countStr.padEnd(8)} docs) ║`);
        });

        console.log(`╚══════════════════════════════════════════════════════════════╝`);

        return stats;

    } catch (error) {
        logger.error('[CLEANER] Error getting database statistics:', error);
        throw error;
    }
};

// Handle command line arguments
const handleCommand = async () => {
    const command = process.argv[2];

    try {
        switch (command) {
            case 'clean':
                await cleanDatabase({
                    confirmClean: false,
                    preserveIndexes: true,
                    showProgress: true
                });
                break;

            case 'clean:force':
                console.log('🚨 Force cleaning database (including production)...');
                await cleanDatabase({
                    confirmClean: true,
                    preserveIndexes: true,
                    showProgress: true
                });
                break;

            case 'clean:drop':
                console.log('🗑️  Dropping all collections (removes indexes)...');
                await cleanDatabase({
                    confirmClean: true,
                    preserveIndexes: false,
                    showProgress: true
                });
                break;

            case 'stats':
                await getDatabaseStats();
                break;

            default:
                console.log(`
╔══════════════════════════════════════════════════════════════╗
║                     Database Cleaner Usage                  ║
╠══════════════════════════════════════════════════════════════╣
║  📝 Available Commands:                                      ║
║                                                              ║
║  • npm run db:clean                                         ║
║    Clean all collections (preserves indexes)               ║
║                                                              ║
║  • npm run db:clean:force                                   ║
║    Force clean (works in production)                       ║
║                                                              ║
║  • npm run db:clean:drop                                    ║
║    Drop collections (removes indexes too)                  ║
║                                                              ║
║  • npm run db:stats                                         ║
║    Show database statistics                                 ║
║                                                              ║
╠══════════════════════════════════════════════════════════════╣
║  ⚠️  WARNING: These commands will delete ALL data!          ║
║  📋 Always backup important data before cleaning            ║
╚══════════════════════════════════════════════════════════════╝
                `);
        }
    } catch (error) {
        logger.error('[CLEANER] Command execution failed:', error);
        process.exit(1);
    } finally {
        // Close database connection
        if (mongoose.connection.readyState !== 0) {
            await mongoose.connection.close();
            logger.info('[CLEANER] Database connection closed');
        }
        process.exit(0);
    }
};

// Export functions for use in other files
export { cleanDatabase, getDatabaseStats };

// Run command if file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    handleCommand();
}