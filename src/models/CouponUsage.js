import mongoose from 'mongoose';

const couponUsageSchema = new mongoose.Schema(
  {
    couponId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Coupon',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Removed businessId - coupons are system-wide for plan purchases
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plan',
      required: true,
      index: true,
    },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
      required: false, // Will be set when subscription is created
      index: true,
    },
    orderId: {
      type: String,
      required: true,
      index: true,
    },
    orderAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    discountAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    finalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ['applied', 'consumed', 'released', 'cancelled', 'refunded'],
      default: 'applied',
    },
    appliedAt: {
      type: Date,
      default: Date.now,
    },
    consumedAt: {
      type: Date,
      default: null,
    },
    releasedAt: {
      type: Date,
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    refundedAt: {
      type: Date,
      default: null,
    },
    metadata: {
      type: Object,
      default: {},
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Compound indexes for better performance
couponUsageSchema.index({ couponId: 1, userId: 1 });
couponUsageSchema.index({ planId: 1, status: 1 });
couponUsageSchema.index({ orderId: 1, status: 1 });

// Method to consume coupon usage (payment successful)
couponUsageSchema.methods.consume = function () {
  this.status = 'consumed';
  this.consumedAt = new Date();
  return this.save();
};

// Method to release coupon usage (payment failed/cancelled)
couponUsageSchema.methods.release = function () {
  this.status = 'released';
  this.releasedAt = new Date();
  return this.save();
};

// Method to cancel coupon usage
couponUsageSchema.methods.cancel = function () {
  this.status = 'cancelled';
  this.cancelledAt = new Date();
  return this.save();
};

// Method to refund coupon usage
couponUsageSchema.methods.refund = function () {
  this.status = 'refunded';
  this.refundedAt = new Date();
  return this.save();
};

// Static method to get usage count for a user
couponUsageSchema.statics.getUserUsageCount = function (couponId, userId) {
  return this.countDocuments({
    couponId,
    userId,
    status: { $in: ['consumed', 'refunded'] }, // Only count finalized usages
  });
};

// Static method to check if user can use coupon
couponUsageSchema.statics.canUserUseCoupon = function (
  couponId,
  userId,
  maxUsagePerUser = 1,
) {
  return this.getUserUsageCount(couponId, userId).then(
    (count) => count < maxUsagePerUser,
  );
};

const CouponUsage = mongoose.model('CouponUsage', couponUsageSchema);
export default CouponUsage;
