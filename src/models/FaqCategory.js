import mongoose from 'mongoose';

const faqCategorySchema = new mongoose.Schema(
    {
        categoryName: {
            type: String,
            required: [true, 'Category name is required'],
            trim: true,
            minlength: [2, 'Category name must be at least 2 characters'],
            maxlength: [100, 'Category name cannot exceed 100 characters'],
            index: true,
        },
        status: {
            type: Boolean,
            default: true, // true = Active, false = Inactive
            index: true,
        },
        isDeleted: {
            type: Boolean,
            default: false,
            index: true,
        },
        deletedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    },
);

// Indexes for efficient queries
faqCategorySchema.index({ categoryName: 1, status: 1 });
faqCategorySchema.index({ isDeleted: 1, status: 1 }); // For soft delete queries

const FaqCategory = mongoose.model('FaqCategory', faqCategorySchema);
export default FaqCategory;
