import mongoose from "mongoose";

const contentSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: [true, 'Content title is required'],
            trim: true,
        },

        description: {
            type: String,
            required: [true, 'Content description is required'],
            trim: true,
        },

        // Content type
        type: {
            type: String,
            enum: ['ar', 'vr', 'mixed_reality', '3d_model', 'video', 'interactive'],
            required: [true, 'Content type is required'],
        },

        // Subject/topic this content covers
        subject: {
            type: String,
            required: [true, 'Subject is required'],
            trim: true,
            lowercase: true,
        },

        // Grade levels this content is suitable for
        gradeLevel: [
            {
                type: Number,
                min: [1, 'Grade must be at least 1'],
                max: [12, 'Grade cannot exceed 12'],
            }
        ],

        // Content difficulty level
        difficultyLevel: {
            type: String,
            enum: ['beginner', 'intermediate', 'advanced'],
            default: 'beginner',
        },

        // File information
        fileInfo: {
            // Main content file (APK for AR/VR)
            mainFile: {
                url: {
                    type: String,
                    required: [true, 'Main file URL is required'],
                },
                fileName: {
                    type: String,
                    required: [true, 'File name is required'],
                },
                fileSize: {
                    type: Number, // in bytes
                    required: [true, 'File size is required'],
                },
                fileType: {
                    type: String,
                    enum: ['apk', 'exe', 'zip', 'mp4', 'webm'],
                    required: [true, 'File type is required'],
                },
            },

            // Preview/thumbnail files
            thumbnail: {
                type: String,
                default: '',
            },

            // Preview video
            previewVideo: {
                type: String,
                default: '',
            },

            // Screenshots
            screenshots: [
                {
                    type: String,
                }
            ],

            // Additional resources
            additionalFiles: [
                {
                    name: {
                        type: String,
                        required: true,
                    },
                    url: {
                        type: String,
                        required: true,
                    },
                    type: {
                        type: String,
                        enum: ['pdf', 'doc', 'ppt', 'zip', 'image'],
                        required: true,
                    },
                }
            ],
        },

        // Technical requirements
        requirements: {
            // Minimum Android/iOS version
            minVersion: {
                android: {
                    type: String,
                    default: '7.0',
                },
                ios: {
                    type: String,
                    default: '12.0',
                },
            },

            // Hardware requirements
            hardware: {
                ram: {
                    type: String,
                    default: '4GB',
                },
                storage: {
                    type: String,
                    default: '2GB',
                },
                gpu: {
                    type: String,
                    default: 'Adreno 530 or equivalent',
                },
            },

            // VR headset compatibility
            vrHeadsets: [
                {
                    type: String,
                    enum: ['oculus_quest', 'oculus_rift', 'htc_vive', 'cardboard', 'gear_vr', 'daydream'],
                }
            ],
        },

        // Content metadata
        metadata: {
            duration: {
                type: Number, // in minutes
                min: [1, 'Duration must be at least 1 minute'],
            },

            language: {
                type: String,
                enum: ['english', 'hindi', 'bengali', 'tamil', 'telugu', 'marathi'],
                default: 'english',
            },

            keywords: [
                {
                    type: String,
                    trim: true,
                }
            ],

            learningObjectives: [
                {
                    type: String,
                    trim: true,
                }
            ],

            ageGroup: {
                min: {
                    type: Number,
                    min: 5,
                    max: 18,
                },
                max: {
                    type: Number,
                    min: 5,
                    max: 18,
                },
            },
        },

        // Pricing information (for future)
        pricing: {
            isFree: {
                type: Boolean,
                default: true,
            },
            price: {
                type: Number,
                default: 0,
                min: 0,
            },
            currency: {
                type: String,
                default: 'INR',
            },
        },

        // Content status and visibility
        status: {
            type: String,
            enum: ['draft', 'review', 'approved', 'published', 'archived'],
            default: 'draft',
        },

        isPublic: {
            type: Boolean,
            default: false, // Private by default
        },

        isFeatured: {
            type: Boolean,
            default: false,
        },

        isActive: {
            type: Boolean,
            default: true,
        },

        isDeleted: {
            type: Boolean,
            default: false,
        },

        // Content statistics
        stats: {
            views: {
                type: Number,
                default: 0,
            },
            downloads: {
                type: Number,
                default: 0,
            },
            rating: {
                average: {
                    type: Number,
                    default: 0,
                    min: 0,
                    max: 5,
                },
                count: {
                    type: Number,
                    default: 0,
                },
            },
            lastViewed: {
                type: Date,
                default: null,
            },
        },

        // Content versioning
        version: {
            type: String,
            default: '1.0.0',
        },

        changelog: [
            {
                version: {
                    type: String,
                    required: true,
                },
                changes: {
                    type: String,
                    required: true,
                },
                date: {
                    type: Date,
                    default: Date.now,
                },
            }
        ],

        // Content creator information
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

        // Approval workflow
        approvalWorkflow: {
            reviewedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
            },
            reviewedAt: {
                type: Date,
            },
            approvedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
            },
            approvedAt: {
                type: Date,
            },
            rejectionReason: {
                type: String,
                trim: true,
            },
        },
    },
    {
        timestamps: true,
        indexes: [
            { subject: 1 },
            { gradeLevel: 1 },
            { type: 1 },
            { status: 1 },
            { isPublic: 1 },
            { isActive: 1 },
            { isDeleted: 1 },
            { isFeatured: 1 },
            { 'stats.rating.average': -1 },
            { 'stats.views': -1 },
            { createdAt: -1 },
        ]
    }
);

// Text search index for title, description, and keywords
contentSchema.index({
    title: 'text',
    description: 'text',
    'metadata.keywords': 'text'
});

// Virtual to get file size in human readable format
contentSchema.virtual('fileSize').get(function () {
    const bytes = this.fileInfo.mainFile.fileSize;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Byte';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
});

// Virtual to check if content is published
contentSchema.virtual('isPublished').get(function () {
    return this.status === 'published' && this.isActive && !this.isDeleted;
});

// Virtual to get average rating
contentSchema.virtual('averageRating').get(function () {
    return this.stats.rating.average;
});

// Virtual to check if content needs review
contentSchema.virtual('needsReview').get(function () {
    return this.status === 'review';
});

// Method to increment view count
contentSchema.methods.incrementViews = function () {
    this.stats.views += 1;
    this.stats.lastViewed = new Date();
    return this.save();
};

// Method to increment download count
contentSchema.methods.incrementDownloads = function () {
    this.stats.downloads += 1;
    return this.save();
};

// Method to update rating
contentSchema.methods.updateRating = function (newRating) {
    const currentAvg = this.stats.rating.average;
    const currentCount = this.stats.rating.count;

    // Calculate new average
    const newAvg = ((currentAvg * currentCount) + newRating) / (currentCount + 1);

    this.stats.rating.average = Math.round(newAvg * 10) / 10; // Round to 1 decimal
    this.stats.rating.count += 1;

    return this.save();
};

// Method to check if user can access this content
contentSchema.methods.canUserAccess = function (userRole, userGrade = null, userSubjects = []) {
    // SuperAdmin can access everything
    if (userRole === 'superAdmin') return true;

    // Admin can access everything
    if (userRole === 'admin') return true;

    // Content must be published and active
    if (!this.isPublished) return false;

    // Check if content is public or user has access
    if (this.isPublic) return true;

    // For students, check grade level
    if (userRole === 'student' && userGrade) {
        return this.gradeLevel.includes(userGrade);
    }

    // For teachers, check if they teach this subject or grade
    if (userRole === 'teacher') {
        if (userSubjects.includes(this.subject)) return true;
        if (userGrade && this.gradeLevel.includes(userGrade)) return true;
    }

    return false;
};

// Method to approve content
contentSchema.methods.approve = function (approvedBy) {
    this.status = 'approved';
    this.approvalWorkflow.approvedBy = approvedBy;
    this.approvalWorkflow.approvedAt = new Date();
    return this.save();
};

// Method to reject content
contentSchema.methods.reject = function (rejectedBy, reason) {
    this.status = 'draft';
    this.approvalWorkflow.rejectionReason = reason;
    this.approvalWorkflow.reviewedBy = rejectedBy;
    this.approvalWorkflow.reviewedAt = new Date();
    return this.save();
};

// Method to publish content
contentSchema.methods.publish = function (publishedBy) {
    if (this.status !== 'approved') {
        throw new Error('Content must be approved before publishing');
    }
    this.status = 'published';
    this.lastUpdatedBy = publishedBy;
    return this.save();
};

// Static method to find content by subject and grade
contentSchema.statics.findBySubjectAndGrade = function (subject, gradeLevel) {
    return this.find({
        subject: subject,
        gradeLevel: { $in: [gradeLevel] },
        status: 'published',
        isActive: true,
        isDeleted: false
    });
};

// Static method to find featured content
contentSchema.statics.findFeatured = function () {
    return this.find({
        isFeatured: true,
        status: 'published',
        isActive: true,
        isDeleted: false
    }).sort({ 'stats.rating.average': -1 });
};

// Static method to find popular content
contentSchema.statics.findPopular = function (limit = 10) {
    return this.find({
        status: 'published',
        isActive: true,
        isDeleted: false
    })
        .sort({ 'stats.views': -1 })
        .limit(limit);
};

// Static method to search content
contentSchema.statics.searchContent = function (searchTerm, filters = {}) {
    const query = {
        $text: { $search: searchTerm },
        status: 'published',
        isActive: true,
        isDeleted: false,
        ...filters
    };

    return this.find(query, { score: { $meta: 'textScore' } })
        .sort({ score: { $meta: 'textScore' } });
};

// Static method to find public content
contentSchema.statics.findPublic = function () {
    return this.find({
        isPublic: true,
        status: 'published',
        isActive: true,
        isDeleted: false
    });
};

// Static method to soft delete content
contentSchema.statics.softDelete = function (id) {
    return this.findByIdAndUpdate(id, {
        isDeleted: true,
        isActive: false
    });
};

// Static method to restore deleted content
contentSchema.statics.restore = function (id) {
    return this.findByIdAndUpdate(id, {
        isDeleted: false,
        isActive: true
    });
};

const Content = mongoose.model('Content', contentSchema);
export default Content;