import mongoose from "mongoose";

const schoolSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'School name is required'],
            trim: true,
        },

        // Changed from single email to array of emails
        emails: [
            {
                email: {
                    type: String,
                    required: [true, 'Email is required'],
                    lowercase: true,
                    trim: true,
                    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
                },
                type: {
                    type: String,
                    enum: ['primary', 'admin', 'admission', 'support', 'other'],
                    default: 'primary',
                },
                label: {
                    type: String,
                    default: '',
                    trim: true,
                },
                isPrimary: {
                    type: Boolean,
                    default: false,
                }
            }
        ],

        // Changed from single phone to array of phones
        phones: [
            {
                number: {
                    type: String,
                    required: [true, 'Phone number is required'],
                    trim: true,
                },
                type: {
                    type: String,
                    enum: ['primary', 'admin', 'emergency', 'department', 'admission', 'other'],
                    default: 'primary',
                },
                label: {
                    type: String,
                    default: '',
                    trim: true, // e.g., "Principal Office", "Admission Desk"
                },
                isPrimary: {
                    type: Boolean,
                    default: false,
                }
            }
        ],

        // Changed from single website to array of websites
        websites: [
            {
                url: {
                    type: String,
                    trim: true,
                    match: [/^https?:\/\/.+/, 'Please provide a valid website URL'],
                },
                type: {
                    type: String,
                    enum: ['main', 'admission', 'portal', 'library', 'other'],
                    default: 'main',
                },
                label: {
                    type: String,
                    default: '',
                    trim: true, // e.g., "Main Website", "Student Portal"
                },
                isPrimary: {
                    type: Boolean,
                    default: false,
                }
            }
        ],

        address: {
            type: String,
            default: '',
            trim: true,
        },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },

        students: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
            },
        ],

        teachers: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
            },
        ],

        classes: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Class',
            },
        ],
    },
    {
        timestamps: true,
        indexes: [
            { 'emails.email': 1 },
            { 'phones.number': 1 },
            { name: 1 },
        ]
    }
);

// Ensure at least one email is provided
schoolSchema.path('emails').validate(function (emails) {
    return emails && emails.length > 0;
}, 'School must have at least one email address');

// Ensure unique email addresses within the school
schoolSchema.path('emails').validate(function (emails) {
    const emailAddresses = emails.map(e => e.email);
    return emailAddresses.length === new Set(emailAddresses).size;
}, 'Duplicate email addresses are not allowed');

// Pre-save middleware to ensure only one primary email
schoolSchema.pre('save', function (next) {
    // Handle primary emails
    const primaryEmails = this.emails.filter(e => e.isPrimary);

    if (primaryEmails.length > 1) {
        return next(new Error('School can have only one primary email'));
    }

    // If no primary email is set and there are emails, make the first one primary
    if (primaryEmails.length === 0 && this.emails.length > 0) {
        this.emails[0].isPrimary = true;
    }

    // Handle primary phones
    if (this.phones && this.phones.length > 0) {
        const primaryPhones = this.phones.filter(p => p.isPrimary);

        if (primaryPhones.length > 1) {
            return next(new Error('School can have only one primary phone'));
        }

        // If no primary phone is set and there are phones, make the first one primary
        if (primaryPhones.length === 0) {
            this.phones[0].isPrimary = true;
        }
    }

    // Handle primary websites
    if (this.websites && this.websites.length > 0) {
        const primaryWebsites = this.websites.filter(w => w.isPrimary);

        if (primaryWebsites.length > 1) {
            return next(new Error('School can have only one primary website'));
        }

        // If no primary website is set and there are websites, make the first one primary
        if (primaryWebsites.length === 0) {
            this.websites[0].isPrimary = true;
        }
    }

    next();
});

// Virtual to get primary email
schoolSchema.virtual('primaryEmail').get(function () {
    const primary = this.emails.find(e => e.isPrimary);
    return primary ? primary.email : (this.emails.length > 0 ? this.emails[0].email : null);
});

// Virtual to get primary phone
schoolSchema.virtual('primaryPhone').get(function () {
    if (!this.phones || this.phones.length === 0) return null;
    const primary = this.phones.find(p => p.isPrimary);
    return primary ? primary.number : this.phones[0].number;
});

// Virtual to get primary website
schoolSchema.virtual('primaryWebsite').get(function () {
    if (!this.websites || this.websites.length === 0) return null;
    const primary = this.websites.find(w => w.isPrimary);
    return primary ? primary.url : this.websites[0].url;
});

const School = mongoose.model('School', schoolSchema);
export default School;