import mongoose from 'mongoose';

const businessTypeSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Business type title is required'],
      trim: true,
      maxlength: 150,
    },
    description: {
      type: String,
      required: [true, 'Business type description is required'],
      trim: true,
      maxlength: 300,
    },
    status: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true },
);
const BusinessType = mongoose.model('BusinessType', businessTypeSchema);
export default BusinessType;
