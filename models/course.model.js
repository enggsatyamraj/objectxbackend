import mongoose from "mongoose";

const courseSchema = new mongoose.Schema(
    {
        // Basic Course Information
        title: {
            type: String,
            required: [true, 'Course title is required'],
            trim: true,
        },

        subject: {
            type: String,
            required: [true, 'Subject is required'],
            trim: true,
            enum: ['Mathematics', 'Science', 'Physics', 'Chemistry', 'Biology', 'English', 'Hindi', 'History', 'Geography', 'Computer Science', 'Social Science'],
        },

        gradeLevel: {
            type: Number,
            required: [true, 'Grade level is required'],
            min: [1, 'Grade must be at least 1'],
            max: [12, 'Grade cannot exceed 12'],
        },

        chapterNumber: {
            type: Number,
            required: [true, 'Chapter number is required'],
            min: [1, 'Chapter number must be at least 1'],
        },

        curriculum: {
            type: String,
            enum: ['NCERT', 'CBSE', 'ICSE', 'State Board'],
            default: 'NCERT',
        },

        description: {
            type: String,
            required: [true, 'Course description is required'],
            trim: true,
        },

        // Nested Topics with Activities
        topics: [
            {
                topicNumber: {
                    type: String,
                    required: [true, 'Topic number is required'],
                    trim: true,
                },
                title: {
                    type: String,
                    required: [true, 'Topic title is required'],
                    trim: true,
                },
                activities: [
                    {
                        activityNumber: {
                            type: String,
                            required: [true, 'Activity number is required'],
                            trim: true,
                        },
                        title: {
                            type: String,
                            required: [true, 'Activity title is required'],
                            trim: true,
                        },
                        description: {
                            type: String,
                            required: [true, 'Activity description is required'],
                            trim: true,
                        },
                        videos: {
                            vrLink: {
                                type: String,
                                required: [true, 'VR link is required'],
                                trim: true,
                                match: [/^https?:\/\/.+/, 'VR link must be a valid URL'],
                            },
                            mobileLink: {
                                type: String,
                                required: [true, 'Mobile link is required'],
                                trim: true,
                                match: [/^https?:\/\/.+/, 'Mobile link must be a valid URL'],
                            },
                            demoLink: {
                                type: String,
                                required: [true, 'Demo link is required'],
                                trim: true,
                                match: [/^https?:\/\/.+/, 'Demo link must be a valid URL'],
                            },
                        },
                        duration: {
                            type: Number,
                            required: [true, 'Activity duration is required'],
                            min: [1, 'Duration must be at least 1 minute'],
                            max: [120, 'Duration cannot exceed 120 minutes'],
                        },
                        isActive: {
                            type: Boolean,
                            default: true,
                        },
                    },
                ],
            },
        ],

        // Course Status
        isActive: {
            type: Boolean,
            default: true,
        },

        // Soft delete flag
        isDeleted: {
            type: Boolean,
            default: false,
        },

        // Who created this course (SuperAdmin only)
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },

        // Last updated by
        lastUpdatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },

        // Course statistics
        stats: {
            totalTopics: {
                type: Number,
                default: 0,
            },
            totalActivities: {
                type: Number,
                default: 0,
            },
            averageDuration: {
                type: Number,
                default: 0,
            },
            lastUpdated: {
                type: Date,
                default: Date.now,
            },
        },
    },
    {
        timestamps: true,
        indexes: [
            { subject: 1 },
            { gradeLevel: 1 },
            { chapterNumber: 1 },
            { curriculum: 1 },
            { isActive: 1 },
            { isDeleted: 1 },
            { createdBy: 1 },
            { gradeLevel: 1, subject: 1 }, // Compound index for efficient filtering
            { gradeLevel: 1, subject: 1, chapterNumber: 1 }, // Unique course identification
        ]
    }
);

// Compound unique index to prevent duplicate courses
courseSchema.index(
    { gradeLevel: 1, subject: 1, chapterNumber: 1, curriculum: 1 },
    { unique: true, partialFilterExpression: { isDeleted: { $ne: true } } }
);

// Virtual to get course display name
courseSchema.virtual('displayName').get(function () {
    return `Grade ${this.gradeLevel} ${this.subject} - Chapter ${this.chapterNumber}`;
});

// Virtual to get total course duration
courseSchema.virtual('totalDuration').get(function () {
    let totalDuration = 0;
    this.topics.forEach(topic => {
        topic.activities.forEach(activity => {
            totalDuration += activity.duration;
        });
    });
    return totalDuration;
});

// Virtual to check if course has any active activities
courseSchema.virtual('hasActiveActivities').get(function () {
    return this.topics.some(topic =>
        topic.activities.some(activity => activity.isActive)
    );
});

// Pre-save middleware to update stats
courseSchema.pre('save', function (next) {
    if (this.isModified('topics')) {
        let totalActivities = 0;
        let totalDuration = 0;

        this.topics.forEach(topic => {
            totalActivities += topic.activities.length;
            topic.activities.forEach(activity => {
                totalDuration += activity.duration;
            });
        });

        this.stats.totalTopics = this.topics.length;
        this.stats.totalActivities = totalActivities;
        this.stats.averageDuration = totalActivities > 0 ? Math.round(totalDuration / totalActivities) : 0;
        this.stats.lastUpdated = new Date();
    }
    next();
});

// Method to add topic to course
courseSchema.methods.addTopic = function (topicData) {
    this.topics.push(topicData);
    return this.save();
};

// Method to add activity to a specific topic
courseSchema.methods.addActivityToTopic = function (topicNumber, activityData) {
    const topic = this.topics.find(t => t.topicNumber === topicNumber);
    if (!topic) {
        throw new Error('Topic not found');
    }
    topic.activities.push(activityData);
    return this.save();
};

// Method to get activities by topic
courseSchema.methods.getActivitiesByTopic = function (topicNumber) {
    const topic = this.topics.find(t => t.topicNumber === topicNumber);
    return topic ? topic.activities : [];
};

// Method to check if user can access this course
courseSchema.methods.canUserAccess = function (userRole, userGrade = null) {
    // SuperAdmin can access everything
    if (userRole === 'superAdmin') return true;

    // Admin can access everything
    if (userRole === 'admin') return true;

    // Course must be active
    if (!this.isActive || this.isDeleted) return false;

    // For students and teachers, check grade level
    if (userRole === 'student' || userRole === 'teacher') {
        return userGrade === this.gradeLevel;
    }

    return false;
};

// Static method to find courses by grade level
courseSchema.statics.findByGrade = function (gradeLevel) {
    return this.find({
        gradeLevel: gradeLevel,
        isActive: true,
        isDeleted: false
    });
};

// Static method to find courses by subject and grade
courseSchema.statics.findBySubjectAndGrade = function (subject, gradeLevel) {
    return this.find({
        subject: subject,
        gradeLevel: gradeLevel,
        isActive: true,
        isDeleted: false
    }).sort({ chapterNumber: 1 });
};

// Static method to find courses by curriculum
courseSchema.statics.findByCurriculum = function (curriculum) {
    return this.find({
        curriculum: curriculum,
        isActive: true,
        isDeleted: false
    }).sort({ gradeLevel: 1, subject: 1, chapterNumber: 1 });
};

// Static method to get course statistics
courseSchema.statics.getCourseStats = async function () {
    const pipeline = [
        { $match: { isActive: true, isDeleted: false } },
        {
            $group: {
                _id: null,
                totalCourses: { $sum: 1 },
                totalTopics: { $sum: '$stats.totalTopics' },
                totalActivities: { $sum: '$stats.totalActivities' },
                averageCourseDuration: { $avg: '$stats.averageDuration' },
                subjects: { $addToSet: '$subject' },
                grades: { $addToSet: '$gradeLevel' },
                curricula: { $addToSet: '$curriculum' }
            }
        }
    ];

    const stats = await this.aggregate(pipeline);
    return stats[0] || {
        totalCourses: 0,
        totalTopics: 0,
        totalActivities: 0,
        averageCourseDuration: 0,
        subjects: [],
        grades: [],
        curricula: []
    };
};

// Static method to soft delete course
courseSchema.statics.softDelete = function (id) {
    return this.findByIdAndUpdate(id, {
        isDeleted: true,
        isActive: false
    });
};

// Static method to restore deleted course
courseSchema.statics.restore = function (id) {
    return this.findByIdAndUpdate(id, {
        isDeleted: false,
        isActive: true
    });
};

const Course = mongoose.model('Course', courseSchema);
export default Course;