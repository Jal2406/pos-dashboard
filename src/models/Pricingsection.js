import mongoose from 'mongoose';

const PricingSectionSchema = new mongoose.Schema(
  {
    sectionTitle: {
      type: String,
      required: [true, 'Section title is required'],
      trim: true,
      minlength: [3, 'Section title must be at least 3 characters long'],
      maxlength: [100, 'Section title cannot exceed 100 characters'],
    },
    sectionSubtitle: {
      type: String,
      required: [true, 'Section subtitle is required'],
      trim: true,
      minlength: [10, 'Section subtitle must be at least 10 characters long'],
      maxlength: [300, 'Section subtitle cannot exceed 300 characters'],
    },
  },
  { timestamps: true },
);

export const PricingSection = mongoose.model(
  'PricingSection',
  PricingSectionSchema,
);
export default PricingSection;
