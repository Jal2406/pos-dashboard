import mongoose from 'mongoose';

const currencySchema = new mongoose.Schema(
  {
    isPrimary: {
      type: Boolean,
      default: true,
    },
    currencyName: {
      type: String,
      required: [true, 'Currency name is required'],
      trim: true,
      default: 'Indian Rupee',
    },
    currencySymbol: {
      type: String,
      required: [true, 'Currency symbol is required'],
      trim: true,
      default: '₹',
    },
    currencyCode: {
      type: String,
      required: [true, 'Currency code is required'],
      uppercase: true,
      minlength: 3,
      maxlength: 3,
      default: 'INR',
    },
    currencyPosition: {
      type: String,
      enum: ['Left', 'Right'],
      default: 'Left',
    },
    thousandSeparator: {
      type: String,
      required: [true, 'Thousand separator is required'],
      default: ',',
    },
    decimalSeparator: {
      type: String,
      required: [true, 'Decimal separator is required'],
      default: '.',
    },
    numberOfDecimals: {
      type: Number,
      required: [true, 'Number of decimals is required'],
      default: 2,
      min: 0,
      max: 4,
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

// Add indexes for better performance
currencySchema.index({ isPrimary: 1 }); // For primary currency queries
currencySchema.index(
  { currencyCode: 1 },
  {
    unique: true,
    partialFilterExpression: { isDeleted: false },
  },
); // For currency code lookups
currencySchema.index({ isDeleted: 1, deletedAt: 1 }); // For soft delete queries

// Ensure only one primary currency
currencySchema.pre('save', async function (next) {
  try {
    // If setting as primary, unset all other primary currencies
    if (this.isPrimary) {
      await this.constructor.updateMany(
        { _id: { $ne: this._id }, isDeleted: false },
        { isPrimary: false },
      );
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Post-save middleware to update existing plans when currency becomes primary
currencySchema.post('save', async function (doc, next) {
  try {
    // If this currency was just set as primary, update all non-trial plans
    if (doc.isPrimary && doc.isDeleted === false) {
      const Plan = mongoose.model('Plan');
      await Plan.updateMany(
        {
          isTrial: false,
          currencyId: { $ne: doc._id }, // Only update plans that don't already use this currency
        },
        { currencyId: doc._id },
      );
    }
    next();
  } catch (error) {
    next(error);
  }
});

export default mongoose.model('Currency', currencySchema);
