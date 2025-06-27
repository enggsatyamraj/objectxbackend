import mongoose from "mongoose";
import crypto from "crypto";

const apiKeySchema = new mongoose.Schema(
    {
        // API Key identification
        keyName: {
            type: String,
            required: [true, 'API key name is required'],
            trim: true,
        },

        // The actual API key (hashed for security)
        hashedKey: {
            type: String,
            required: [true, 'API key is required'],
            unique: true,
        },

        // Prefix for easy identification (first 8 chars of key)
        keyPrefix: {
            type: String,
            required: [true, 'Key prefix is required'],
            length: 8,
        },

        // Organization this API key belongs to
        organization: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Organization',
            required: [true, 'Organization is required'],
        },

        // User who created this API key
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'Created by user is required'],
        },

        // Simple rate limiting
        rateLimit: {
            requestsPerDay: {
                type: Number,
                default: 10000,
                min: [1, 'Minimum 1 request per day'],
                max: [100000, 'Maximum 100000 requests per day'],
            },
        },

        // API key status
        isActive: {
            type: Boolean,
            default: true,
        },

        isDeleted: {
            type: Boolean,
            default: false,
        },

        // Expiry settings
        expiresAt: {
            type: Date,
            default: function () {
                // Default to 1 year from now
                const date = new Date();
                date.setFullYear(date.getFullYear() + 1);
                return date;
            }
        },

        neverExpires: {
            type: Boolean,
            default: false,
        },

        // Usage statistics
        stats: {
            totalRequests: {
                type: Number,
                default: 0,
            },
            lastUsed: {
                type: Date,
                default: null,
            },
            firstUsed: {
                type: Date,
                default: null,
            },
            // Daily usage tracking (last 30 days)
            dailyUsage: [
                {
                    date: {
                        type: Date,
                        required: true,
                    },
                    requests: {
                        type: Number,
                        default: 0,
                    },
                }
            ],
        },

        // API key metadata
        description: {
            type: String,
            trim: true,
            default: '',
        },

        // Last regenerated
        lastRegenerated: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
        indexes: [
            { hashedKey: 1 },
            { keyPrefix: 1 },
            { organization: 1 },
            { isActive: 1 },
            { isDeleted: 1 },
            { expiresAt: 1 },
            { 'stats.lastUsed': -1 },
        ]
    }
);

// Index for expiry cleanup
apiKeySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Virtual to check if API key is expired
apiKeySchema.virtual('isExpired').get(function () {
    if (this.neverExpires) return false;
    return new Date() > this.expiresAt;
});

// Virtual to check if API key is valid
apiKeySchema.virtual('isValid').get(function () {
    return this.isActive && !this.isDeleted && !this.isExpired;
});

// Virtual to get daily usage percentage
apiKeySchema.virtual('dailyUsagePercentage').get(function () {
    const today = new Date().toDateString();
    const todayUsage = this.stats.dailyUsage.find(usage =>
        usage.date.toDateString() === today
    );

    if (!todayUsage) return 0;
    return (todayUsage.requests / this.rateLimit.requestsPerDay) * 100;
});

// Method to generate API key
apiKeySchema.statics.generateAPIKey = function () {
    // Generate a secure random API key
    const key = 'ox_' + crypto.randomBytes(32).toString('hex');
    const hashedKey = crypto.createHash('sha256').update(key).digest('hex');
    const keyPrefix = key.substring(0, 8);

    return {
        plainKey: key,
        hashedKey: hashedKey,
        keyPrefix: keyPrefix
    };
};

// Method to verify API key
apiKeySchema.statics.verifyAPIKey = function (plainKey) {
    const hashedKey = crypto.createHash('sha256').update(plainKey).digest('hex');
    return this.findOne({
        hashedKey: hashedKey,
        isActive: true,
        isDeleted: false,
        $or: [
            { neverExpires: true },
            { expiresAt: { $gt: new Date() } }
        ]
    });
};

// Method to track API usage
apiKeySchema.methods.trackUsage = function () {
    // Update overall stats
    this.stats.totalRequests += 1;
    this.stats.lastUsed = new Date();

    // Set first used if not set
    if (!this.stats.firstUsed) {
        this.stats.firstUsed = new Date();
    }

    // Update daily usage
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existingUsage = this.stats.dailyUsage.find(usage =>
        usage.date.getTime() === today.getTime()
    );

    if (existingUsage) {
        existingUsage.requests += 1;
    } else {
        this.stats.dailyUsage.push({
            date: today,
            requests: 1
        });
    }

    // Keep only last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    this.stats.dailyUsage = this.stats.dailyUsage.filter(usage =>
        usage.date >= thirtyDaysAgo
    );

    return this.save();
};

// Method to check rate limit
apiKeySchema.methods.checkRateLimit = function () {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check daily limit
    const todayUsage = this.stats.dailyUsage.find(usage =>
        usage.date.getTime() === today.getTime()
    );

    const dailyRequests = todayUsage ? todayUsage.requests : 0;

    if (dailyRequests >= this.rateLimit.requestsPerDay) {
        return {
            allowed: false,
            reason: 'Daily rate limit exceeded',
            resetTime: new Date(today.getTime() + 24 * 60 * 60 * 1000)
        };
    }

    return {
        allowed: true,
        remaining: this.rateLimit.requestsPerDay - dailyRequests
    };
};

// Method to regenerate API key
apiKeySchema.methods.regenerateKey = function () {
    const newKeyData = this.constructor.generateAPIKey();

    this.hashedKey = newKeyData.hashedKey;
    this.keyPrefix = newKeyData.keyPrefix;
    this.lastRegenerated = new Date();

    return {
        apiKey: this.save(),
        plainKey: newKeyData.plainKey
    };
};

// Static method to find keys by organization
apiKeySchema.statics.findByOrganization = function (organizationId) {
    return this.find({
        organization: organizationId,
        isDeleted: false
    });
};

// Static method to find active keys
apiKeySchema.statics.findActive = function () {
    return this.find({
        isActive: true,
        isDeleted: false,
        $or: [
            { neverExpires: true },
            { expiresAt: { $gt: new Date() } }
        ]
    });
};

// Static method to soft delete API key
apiKeySchema.statics.softDelete = function (id) {
    return this.findByIdAndUpdate(id, {
        isDeleted: true,
        isActive: false
    });
};

// Static method to restore deleted API key
apiKeySchema.statics.restore = function (id) {
    return this.findByIdAndUpdate(id, {
        isDeleted: false,
        isActive: true
    });
};

const APIKey = mongoose.model('APIKey', apiKeySchema);
export default APIKey;