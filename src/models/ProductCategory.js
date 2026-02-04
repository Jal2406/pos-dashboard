import mongoose from 'mongoose';

const productCategorySchema = new mongoose.Schema(
  {
    categoryName: {
      type: String,
      required: [true, 'Category name is required'],
      trim: true,
      minlength: [2, 'Category name must be at least 2 characters long'],
      maxlength: [100, 'Category name cannot exceed 100 characters'],
      validate: {
        validator(v) {
          return /^[a-zA-Z0-9\s\-_&]+$/.test(v);
        },
        message:
          'Category name can only contain letters, numbers, spaces, hyphens, underscores, and ampersands',
      },
    },
    description: {
      type: String,
      trim: true,
      required: [true, 'Description is required'],
      minlength: [10, 'Description must be at least 10 characters long'],
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    slug: {
      type: String,
      trim: true,
      lowercase: true,
      validate: {
        validator(v) {
          return /^[a-z0-9-]+$/.test(v);
        },
        message:
          'Slug can only contain lowercase letters, numbers, and hyphens',
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    hasExpiry: {
      type: Boolean,
      default: false,
      index: true,
    },
    hasWarranty: {
      type: Boolean,
      default: false,
      index: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret.id;
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  },
);

// Compound unique index for categoryName
productCategorySchema.index({ categoryName: 1 }, { unique: true });

// Compound unique index for slugs
productCategorySchema.index({ slug: 1 }, { unique: true });

// Add index for isActive alone for general active queries
productCategorySchema.index({ isActive: 1 });
productCategorySchema.index({ isDeleted: 1 });

// Add index for timestamps for sorting
productCategorySchema.index({ createdAt: -1 });
productCategorySchema.index({ updatedAt: -1 });

// Generate slug from categoryName before saving
productCategorySchema.pre('save', function (next) {
  if (this.isModified('categoryName') && !this.slug) {
    this.slug = this.categoryName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim('-');
  }
  next();
});

export { productCategorySchema as ProductCategorySchema };
