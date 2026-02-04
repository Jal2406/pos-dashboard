import mongoose from 'mongoose';

const variantSchema = new mongoose.Schema(
  {
    variant: {
      type: String,
      required: [true, 'Variant name is required'],
      trim: true,
      unique: true,
      minlength: [2, 'Variant name must be at least 2 characters long'],
      maxlength: [50, 'Variant name cannot exceed 50 characters'],
    },
    values: {
      type: [
        {
          value: {
            type: String,
            required: true,
            trim: true,
          },
        },
      ],
      required: [true, 'Variant values are required'],
      validate: {
        validator(arr) {
          return Array.isArray(arr) && arr.length > 0;
        },
        message: 'Provide at least one value',
      },
    },
    status: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

variantSchema.index({ status: 1 });
variantSchema.index({ 'values.value': 1 });

export { variantSchema as VariantSchema };
