import mongoose from 'mongoose';

const warrantySchema = new mongoose.Schema(
  {
    warranty: {
      type: String,
      required: [true, 'Warranty name is required'],
      trim: true,
      minlength: [3, 'Warranty name must be at least 3 characters'],
      maxlength: [100, 'Warranty name cannot exceed 100 characters'],
    },
    duration: {
      type: Number,
      required: [true, 'Duration is required'],
      min: [1, 'Duration must be at least 1'],
    },
    period: {
      type: String,
      enum: {
        values: ['Day', 'Month', 'Year'],
        message: 'Period must be either Day, Month, or Year',
      },
      required: [true, 'Period is required'],
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      minlength: [10, 'Description must be at least 10 characters'],
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    status: {
      type: Boolean,
      required: [true, 'Status is required'],
      default: true, // true = Active, false = Inactive
    },
  },
  { timestamps: true },
);

export { warrantySchema as WarrantySchema };
