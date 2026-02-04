import mongoose from 'mongoose';
import Subscription from './Subscription.js';

const paymentSchema = new mongoose.Schema(
  {
    // Provider information
    provider: {
      type: String,
      required: [true, 'Payment provider is required'],
      enum: [
        'razorpay',
        'paypal',
        'cinet',
        'sadad',
        'airtelmoney',
        'phonepe',
        'midtrans',
        'paystack',
        'flutterwave',
      ],
      index: true,
    },
    providerOrderId: {
      type: String,
      required: [true, 'Provider order ID is required'],
      unique: true,
      index: true,
      trim: true,
    },
    providerPaymentId: {
      type: String,
      unique: true,
      sparse: true, // can be null until payment is confirmed
      trim: true,
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [1, 'Amount must be greater than 0'], // amount in paise
      validate: {
        validator: (val) => Number.isInteger(val),
        message: 'Amount must be in smallest currency unit (integer paise)',
      },
    },
    currencyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Currency',
      required: [true, 'Currency reference is required'],
      index: true,
      default: null,
    },
    status: {
      type: String,
      enum: ['created', 'authorized', 'captured', 'failed', 'refunded'],
      default: 'created',
      index: true,
    },
    method: {
      type: String,
      trim: true,
      enum: [
        'card',
        'netbanking',
        'wallet',
        'upi',
        'emi',
        'debit_card',
        'credit_card',
        'unknown',
        'Razorpay',
        'paypal',
        'bank_transfer',
        'cash',
        'apple_pay',
        'google_pay',
        'amazon_pay',
      ],
      default: 'unknown',
    },
    subscription: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
      required: [true, 'Linked subscription is required'],
      index: true,
    },
    rawPayload: {
      type: Object,
      default: {},
      validate: {
        validator(v) {
          // Prevent saving extremely large payloads
          return JSON.stringify(v).length <= 5000;
        },
        message: 'Raw payload size exceeds limit',
      },
    },
    metadata: {
      type: Object,
      default: {},
      validate: {
        validator(v) {
          return typeof v === 'object' && v !== null;
        },
        message: 'Metadata must be a valid object',
      },
    },
  },
  {
    timestamps: true,
    minimize: false, // keep empty objects for metadata
    versionKey: false, // prevent "__v" clutter
  },
);

// Compound index for fast lookup of subscription payments
paymentSchema.index({ subscription: 1, status: 1 });

// Pre-save hook to enforce immutability on critical fields after creation
paymentSchema.pre('save', function (next) {
  if (!this.isNew) {
    if (this.isModified('providerOrderId') || this.isModified('amount')) {
      return next(
        new Error('Order ID and amount cannot be modified after creation'),
      );
    }
  }

  // For backward compatibility, sync providerOrderId with razorpayOrderId
  if (
    this.provider === 'razorpay' &&
    this.providerOrderId &&
    !this.razorpayOrderId
  ) {
    this.razorpayOrderId = this.providerOrderId;
  }
  if (
    this.provider === 'razorpay' &&
    this.providerPaymentId &&
    !this.razorpayPaymentId
  ) {
    this.razorpayPaymentId = this.providerPaymentId;
  }

  next();
});

// Post-save hook to sync latest payment reference on Subscription
// Only update if payment is in a final state (captured) to prevent unnecessary updates
paymentSchema.post('save', async function (doc, next) {
  try {
    // Only update subscription payment reference if payment is captured
    // This prevents updates during payment creation/processing
    if (doc?.subscription && doc.status === 'captured') {
      await Subscription.findByIdAndUpdate(doc.subscription, {
        $set: { payment: doc._id },
      });
    }
    next();
  } catch (err) {
    // Don't fail the save if subscription update fails
    console.warn(
      'Failed to update subscription payment reference in post-save hook:',
      err?.message,
    );
    next();
  }
});

// Post findOneAndUpdate to sync on status/method changes as well
// TEMPORARILY DISABLED: This hook was causing transaction retry loops
// The subscription payment reference update is now handled manually in UnifiedPaymentService
// after the transaction commits to avoid interference with transaction execution
paymentSchema.post('findOneAndUpdate', async function (result, next) {
  // Hook disabled - subscription payment reference is updated manually after transaction commits
  // This prevents the hook from interfering with transaction execution
  next();
});

const Payment = mongoose.model('Payment', paymentSchema);
export default Payment;
