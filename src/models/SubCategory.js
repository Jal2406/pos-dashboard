import mongoose from 'mongoose';

export const subCategorySchema = new mongoose.Schema(
  {
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProductCategory',
      required: [true, 'Category reference is required'],
    },
    subcategory: {
      type: String,
      required: [true, 'Subcategory name is required'],
      trim: true,
      minlength: [2, 'Subcategory name must be at least 2 characters long'],
      maxlength: [100, 'Subcategory name cannot exceed 100 characters'],
    },
    categorycode: {
      type: String,
      required: [true, 'Category code is required'],
      trim: true,
      uppercase: true,
      match: [
        /^[A-Z0-9_-]+$/,
        'Category code can only contain letters, numbers, underscores, and dashes',
      ],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [250, 'Description cannot exceed 250 characters'],
    },
    subCategoryImage: {
      type: String, // will store image URL or path
      trim: true,
    },
    status: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

// Prevent duplicate subcategories under the same category
subCategorySchema.index({ category: 1, subcategory: 1 }, { unique: true });

// Add index for categorycode for faster lookups
subCategorySchema.index({ categorycode: 1 }, { unique: true });

// Add text index for subcategory name to improve case-insensitive search performance
subCategorySchema.index({ subcategory: 'text' });

// Add compound index for category and status for filtering
subCategorySchema.index({ category: 1, status: 1 });

// Add index for status alone for active subcategories queries
subCategorySchema.index({ status: 1 });
subCategorySchema.index({ isDeleted: 1 });

// Add compound index for category and subcategory for inventory queries
subCategorySchema.index({ category: 1, status: 1, subcategory: 1 });

// Add index for timestamps for sorting
subCategorySchema.index({ createdAt: -1 });
subCategorySchema.index({ updatedAt: -1 });

