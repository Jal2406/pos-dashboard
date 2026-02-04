import mongoose from 'mongoose';

const subscriptionSchema = new mongoose.Schema(
  {
    purchaseDate: { type: Date, required: true },
    planName: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plan',
      required: true,
    },
    payment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      default: null,
      index: true,
    },
    currencyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Currency',
      immutable: true,
    },
    duration: {
      type: Number,
      required: true,
      min: [1, 'Duration must be a positive number'],
    },
    amount: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: Boolean,
      default: false,
    },
    isTrial: {
      type: Boolean,
      default: false,
    },
    expiryDate: {
      type: Date,
    },
    planSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      validate: {
        validator: function (v) {
          // If planSnapshot is set, validate it has required fields
          if (v === null || v === undefined) {
            return true; // Allow null/undefined (optional field)
          }
          // Validate structure when present
          return (
            typeof v === 'object' &&
            v !== null &&
            typeof v.name === 'string' &&
            typeof v.type === 'string' &&
            ['monthly', 'yearly', 'daily', 'weekly'].includes(v.type) &&
            typeof v.price === 'number' &&
            typeof v.duration === 'number' &&
            typeof v.storeLimit === 'number' &&
            typeof v.staffLimit === 'number'
          );
        },
        message:
          'planSnapshot must be a valid object with name, type, price, duration, storeLimit, and staffLimit fields',
      },
    },
  },
  { timestamps: true },
);

// Pre-save hook to enforce immutability of planSnapshot
subscriptionSchema.pre('save', async function (next) {
  // If planSnapshot already exists and is being modified, prevent the change
  if (!this.isNew && this.isModified('planSnapshot')) {
    try {
      const originalDoc = await this.constructor.findById(this._id).lean();
      if (originalDoc && originalDoc.planSnapshot) {
        // Restore the original value to prevent modification
        this.planSnapshot = originalDoc.planSnapshot;
      }
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// Add indexes for better performance on trial-related queries
subscriptionSchema.index({ user: 1, planName: 1, status: 1 }); // For user subscription queries
subscriptionSchema.index({ user: 1, isTrial: 1 }); // For trial subscription queries
subscriptionSchema.index({ user: 1, status: 1 }); // For active subscription queries
subscriptionSchema.index({ user: 1 });
subscriptionSchema.index({ planName: 1, status: 1 }); // For plan-based queries
subscriptionSchema.index(
  { user: 1, planName: 1 },
  { unique: true, partialFilterExpression: { status: true } },
); // Ensure only one active subscription per plan per user

const Subscription = mongoose.model('Subscription', subscriptionSchema);

export default Subscription;
