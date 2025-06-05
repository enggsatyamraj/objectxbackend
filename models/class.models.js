import mongoose from "mongoose";

const classSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Class name is required'],
            trim: true,
        },

        school: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'School',
            required: true,
        },

        // Students are now in sections, not directly in class
        // students: [] - REMOVED

        sections: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Section',
            },
        ],

        courses: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Course',
            },
        ],
    },
    {
        timestamps: true,
        indexes: [
            { school: 1 },
            { name: 1, school: 1 }, // Unique class names within school
        ]
    }
);

// Ensure unique class names within the same school
classSchema.index({ name: 1, school: 1 }, { unique: true });

// Virtual to get total students count across all sections
classSchema.virtual('totalStudents').get(function () {
    if (this.populated('sections')) {
        return this.sections.reduce((total, section) => {
            return total + (section.students ? section.students.length : 0);
        }, 0);
    }
    return 0;
});

// Virtual to get total sections count
classSchema.virtual('totalSections').get(function () {
    return this.sections.length;
});

const ClassModel = mongoose.model('Class', classSchema);
export default ClassModel;