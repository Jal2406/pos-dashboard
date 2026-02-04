import mongoose from 'mongoose';

const taxSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxLength: 100,
    },
    type: {
      type: String,
      enum: ['Percentage', 'Fixed'],
      required: true,
    },
    value: {
      type: Number,
      required: true,
      min: [0, 'Value must be a positive number'],
      validate: {
        validator(value) {
          return this.type === 'Percentage'
            ? value >= 0 && value <= 100
            : value >= 0;
        },
        message: (props) =>
          'Value must be between 0 and 100 for Percentage type, or a positive number for Fixed type.',
      },
    },
    status: {
      type: Boolean,
      default: true,
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

taxSchema.index({ isDeleted: 1, status: 1 });

const Tax = mongoose.model('Tax', taxSchema);
export default Tax;
