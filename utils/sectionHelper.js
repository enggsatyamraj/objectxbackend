// File: utils/sectionHelper.js

import Section from '../models/section.model.js';
import Class from '../models/class.model.js';
import logger from './logger.js';

/**
 * Find available section in a class with capacity
 * @param {string} classId - MongoDB ObjectId of the class
 * @param {number} requiredCapacity - Number of students to accommodate (default: 1)
 * @returns {Promise<Object|null>} Available section or null if none found
 */
export const findAvailableSection = async (classId, requiredCapacity = 1) => {
    try {
        logger.debug('[SECTION] Searching for available section', {
            classId,
            requiredCapacity
        });

        // Get all sections for this class, sorted by name (A, B, C...)
        const sections = await Section.find({
            class: classId,
            isActive: true,
            isDeleted: false
        })
            .populate('class', 'name grade')
            .sort({ name: 1 });

        if (sections.length === 0) {
            logger.warn('[SECTION] No sections found for class', { classId });
            return null;
        }

        // Find first section that has enough capacity
        for (const section of sections) {
            const currentStudents = section.students.length;
            const availableSpots = section.maxStudents - currentStudents;

            logger.debug('[SECTION] Checking section capacity', {
                sectionId: section._id,
                sectionName: section.name,
                currentStudents,
                maxStudents: section.maxStudents,
                availableSpots,
                requiredCapacity
            });

            if (availableSpots >= requiredCapacity) {
                logger.info('[SECTION] Found available section', {
                    sectionId: section._id,
                    sectionName: section.name,
                    availableSpots
                });
                return section;
            }
        }

        logger.warn('[SECTION] No available sections found with required capacity', {
            classId,
            requiredCapacity,
            totalSections: sections.length
        });

        return null;
    } catch (error) {
        logger.error('[SECTION] Error finding available section:', {
            classId,
            requiredCapacity,
            error: error.message
        });
        return null;
    }
};

/**
 * Get section capacity summary for a class
 * @param {string} classId - MongoDB ObjectId of the class
 * @returns {Promise<Object>} Section capacity summary
 */
export const getClassCapacitySummary = async (classId) => {
    try {
        const sections = await Section.find({
            class: classId,
            isActive: true,
            isDeleted: false
        }).populate('class', 'name grade');

        const summary = {
            classId,
            className: sections[0]?.class?.name || 'Unknown',
            totalSections: sections.length,
            totalCapacity: 0,
            totalStudents: 0,
            totalAvailableSpots: 0,
            sections: [],
            hasAvailableSpots: false
        };

        sections.forEach(section => {
            const currentStudents = section.students.length;
            const availableSpots = section.maxStudents - currentStudents;

            summary.totalCapacity += section.maxStudents;
            summary.totalStudents += currentStudents;
            summary.totalAvailableSpots += availableSpots;

            if (availableSpots > 0) {
                summary.hasAvailableSpots = true;
            }

            summary.sections.push({
                sectionId: section._id,
                name: section.name,
                maxStudents: section.maxStudents,
                currentStudents,
                availableSpots,
                isFull: availableSpots === 0,
                teacherId: section.sectionTeacher
            });
        });

        // Sort sections by name
        summary.sections.sort((a, b) => a.name.localeCompare(b.name));

        logger.debug('[SECTION] Generated capacity summary', summary);
        return summary;
    } catch (error) {
        logger.error('[SECTION] Error generating capacity summary:', {
            classId,
            error: error.message
        });
        throw error;
    }
};

/**
 * Find best section for student placement
 * @param {string} classId - MongoDB ObjectId of the class
 * @param {Object} options - Placement options
 * @returns {Promise<Object|null>} Best section for placement
 */
export const findBestSectionForPlacement = async (classId, options = {}) => {
    try {
        const {
            preferredSectionName = null,
            balanceLoad = true,
            minAvailableSpots = 1
        } = options;

        const sections = await Section.find({
            class: classId,
            isActive: true,
            isDeleted: false
        })
            .populate('sectionTeacher', 'name')
            .sort({ name: 1 });

        if (sections.length === 0) {
            return null;
        }

        // If preferred section is specified and available
        if (preferredSectionName) {
            const preferredSection = sections.find(s =>
                s.name === preferredSectionName &&
                (s.maxStudents - s.students.length) >= minAvailableSpots
            );

            if (preferredSection) {
                logger.info('[SECTION] Using preferred section', {
                    sectionName: preferredSectionName,
                    sectionId: preferredSection._id
                });
                return preferredSection;
            }
        }

        // Filter available sections
        const availableSections = sections.filter(section =>
            (section.maxStudents - section.students.length) >= minAvailableSpots
        );

        if (availableSections.length === 0) {
            return null;
        }

        // If balancing load, find section with most available spots
        if (balanceLoad) {
            const bestSection = availableSections.reduce((best, current) => {
                const bestAvailable = best.maxStudents - best.students.length;
                const currentAvailable = current.maxStudents - current.students.length;
                return currentAvailable > bestAvailable ? current : best;
            });

            logger.info('[SECTION] Selected section with load balancing', {
                sectionId: bestSection._id,
                sectionName: bestSection.name,
                availableSpots: bestSection.maxStudents - bestSection.students.length
            });

            return bestSection;
        }

        // Otherwise, return first available section (alphabetical order)
        const firstAvailable = availableSections[0];
        logger.info('[SECTION] Selected first available section', {
            sectionId: firstAvailable._id,
            sectionName: firstAvailable.name
        });

        return firstAvailable;
    } catch (error) {
        logger.error('[SECTION] Error finding best section for placement:', {
            classId,
            error: error.message
        });
        throw error;
    }
};

/**
 * Check if a section can accommodate students
 * @param {string} sectionId - MongoDB ObjectId of the section
 * @param {number} studentCount - Number of students to check
 * @returns {Promise<Object>} Capacity check result
 */
export const checkSectionCapacity = async (sectionId, studentCount = 1) => {
    try {
        const section = await Section.findById(sectionId);

        if (!section) {
            return {
                canAccommodate: false,
                reason: 'Section not found',
                currentStudents: 0,
                maxStudents: 0,
                availableSpots: 0
            };
        }

        const currentStudents = section.students.length;
        const availableSpots = section.maxStudents - currentStudents;
        const canAccommodate = availableSpots >= studentCount;

        return {
            canAccommodate,
            reason: canAccommodate ? 'Sufficient capacity' : 'Insufficient capacity',
            currentStudents,
            maxStudents: section.maxStudents,
            availableSpots,
            requestedSpots: studentCount,
            sectionName: section.name
        };
    } catch (error) {
        logger.error('[SECTION] Error checking section capacity:', {
            sectionId,
            studentCount,
            error: error.message
        });

        return {
            canAccommodate: false,
            reason: 'Error checking capacity',
            error: error.message
        };
    }
};