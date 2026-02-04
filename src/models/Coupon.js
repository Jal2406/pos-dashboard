import mongoose from 'mongoose';

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    start_date: {
      type: Date,
      required: true,
      validate: {
        validator(value) {
          // Only validate start_date for new documents (creation)
          // Skip validation during updates to allow modifying existing coupons
          if (!this.isNew) {
            return true;
          }
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          return value >= today;
        },
        message: 'Start date must be today or later.',
      },
    },
    end_date: {
      type: Date,
      required: true,
      validate: {
        validator(value) {
          if (!this.start_date) {
            return true;
          }
          // Allow same-day coupons (end_date >= start_date)
          const startDay = new Date(this.start_date);
          startDay.setHours(0, 0, 0, 0);
          const endDay = new Date(value);
          endDay.setHours(0, 0, 0, 0);
          return endDay >= startDay;
        },
        message: 'End date must be same as or later than start date.',
      },
    },
    type: {
      type: String,
      enum: ['Percentage', 'Fixed'],
      required: true,
    },
    discount_amount: {
      type: Number,
      required: true,
    },
    limit: {
      type: Number,
      required: true,
    },
    plans: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Plan',
      },
    ],
    status: {
      type: Boolean,
      default: true,
    },
    // New fields for enhanced functionality
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    usageCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    maxUsagePerUser: {
      type: Number,
      default: 1,
      min: 1,
    },
    applicableFor: {
      type: String,
      enum: ['all', 'new_users', 'existing_users'],
      default: 'all',
    },
    // Removed businessId - coupons are system-wide for plan purchases
  },
  { timestamps: true },
);

// Indexes for better performance
couponSchema.index({ code: 1 });
couponSchema.index({ status: 1, isDeleted: 1 });
couponSchema.index({ start_date: 1, end_date: 1 });
couponSchema.index({ usageCount: 1, limit: 1 });

// Virtual for checking if coupon is expired
couponSchema.virtual('isExpired').get(function () {
  return new Date() > this.end_date;
});

// Virtual for checking if coupon usage limit reached
couponSchema.virtual('isLimitReached').get(function () {
  return this.usageCount >= this.limit;
});

// Virtual for checking if coupon is active
couponSchema.virtual('isActive').get(function () {
  const now = new Date();
  return (
    this.status &&
    !this.isDeleted &&
    now >= this.start_date &&
    now <= this.end_date &&
    !this.isLimitReached
  );
});

// Pre-save middleware to ensure code is uppercase
couponSchema.pre('save', function (next) {
  if (this.code) {
    this.code = this.code.toUpperCase();
  }
  next();
});

// Method to increment usage count
couponSchema.methods.incrementUsage = function () {
  this.usageCount += 1;
  return this.save();
};

// Method to check if user can use this coupon
couponSchema.methods.canBeUsedByUser = function (
  userId,
  userType = 'existing',
) {
  if (!this.isActive) {
    return false;
  }

  if (this.applicableFor === 'new_users' && userType !== 'new') {
    return false;
  }
  if (this.applicableFor === 'existing_users' && userType !== 'existing') {
    return false;
  }

  return true;
};

// Method to calculate discount amount
couponSchema.methods.calculateDiscount = function (orderAmount) {
  let discount = 0;

  if (this.type === 'Percentage') {
    discount = (orderAmount * this.discount_amount) / 100;
  } else {
    discount = this.discount_amount;
  }

  return Math.min(discount, orderAmount); // Discount cannot exceed order amount
};

const Coupon = mongoose.model('Coupon', couponSchema);
export default Coupon;
