import mongoose from 'mongoose';

const businessCategorySchema = new mongoose.Schema(
  {
    categoryName: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: false,
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
  { timestamps: true },
);

businessCategorySchema.index({ isDeleted: 1, isActive: 1 });

const BusinessCategory = mongoose.model(
  'BusinessCategory',
  businessCategorySchema,
);
export default BusinessCategory;
