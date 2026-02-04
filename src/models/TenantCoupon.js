import mongoose from 'mongoose';

const tenantCouponSchema = new mongoose.Schema(
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
          // Only validate on new documents, not updates
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
          return value > this.start_date;
        },
        message: 'End date must be later than start date.',
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
    status: {
      type: Boolean,
      default: true,
    },
    // Customer Scope (Specific / All)
    customerScope: {
      type: String,
      enum: ['Specific', 'All'],
      required: true,
      default: 'All',
    },
    // Specific customer IDs if customerScope is "Specific"
    assignedCustomerIds: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Customer',
        },
      ],
      default: [],
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
    // Track per-customer usage: { customerId: usageCount }
    customerUsage: {
      type: Map,
      of: Number,
      default: new Map(),
    },
  },
  { timestamps: true },
);

// Indexes for better performance
tenantCouponSchema.index({ code: 1 });
tenantCouponSchema.index({ status: 1, isDeleted: 1 });
tenantCouponSchema.index({ start_date: 1, end_date: 1 });
tenantCouponSchema.index({ usageCount: 1, limit: 1 });
// Compound index for optimized isActive=true queries
tenantCouponSchema.index({ isDeleted: 1, status: 1, start_date: 1, end_date: 1 });
// Customer scope indexes
tenantCouponSchema.index({ customerScope: 1, status: 1 });
tenantCouponSchema.index({ assignedCustomerIds: 1 });
// Index for sorting by createdAt (common pagination query)
tenantCouponSchema.index({ createdAt: -1 });

// Pre-save middleware to ensure code is uppercase and validate customer scope
tenantCouponSchema.pre('save', function (next) {
  if (this.code) {
    this.code = this.code.toUpperCase();
  }

  // Optimize assignedCustomerIds based on scope
  if (this.customerScope === 'All') {
    this.assignedCustomerIds = [];
  } else if (
    this.customerScope === 'Specific' &&
    (!this.assignedCustomerIds || this.assignedCustomerIds.length === 0)
  ) {
    return next(
      new Error(
        'At least one customer ID is required when customer scope is "Specific"',
      ),
    );
  }

  next();
});

// Method to increment usage count (global)
tenantCouponSchema.methods.incrementUsage = function () {
  this.usageCount += 1;
  return this.save();
};

// Method to increment per-customer usage count
tenantCouponSchema.methods.incrementCustomerUsage = function (customerId) {
  if (!customerId) return this;
  
  const customerIdStr = customerId.toString();
  const currentUsage = this.customerUsage?.get(customerIdStr) || 0;
  
  if (!this.customerUsage) {
    this.customerUsage = new Map();
  }
  this.customerUsage.set(customerIdStr, currentUsage + 1);
  
  return this;
};

// Method to get customer's usage count
tenantCouponSchema.methods.getCustomerUsageCount = function (customerId) {
  if (!customerId || !this.customerUsage) return 0;
  return this.customerUsage.get(customerId.toString()) || 0;
};

// Method to check if customer has reached their usage limit
tenantCouponSchema.methods.hasCustomerReachedLimit = function (customerId) {
  if (!customerId) return false;
  const customerUsageCount = this.getCustomerUsageCount(customerId);
  return customerUsageCount >= this.maxUsagePerUser;
};

// Check if coupon can be used by a specific customer
tenantCouponSchema.methods.canBeUsedByCustomer = function (customerId) {
  // If scope is All, any customer can use it
  if (this.customerScope === 'All') {
    return true;
  }

  // If scope is Specific, check if customer is in assigned list
  if (this.customerScope === 'Specific' && customerId) {
    return this.assignedCustomerIds.some(
      (id) => id.toString() === customerId.toString(),
    );
  }

  return false;
};

// Method to calculate discount amount
tenantCouponSchema.methods.calculateDiscount = function (orderAmount) {
  let discount = 0;

  if (this.type === 'Percentage') {
    discount = (orderAmount * this.discount_amount) / 100;
  } else {
    discount = this.discount_amount;
  }

  return Math.min(discount, orderAmount); // Discount cannot exceed order amount
};

export { tenantCouponSchema as TenantCouponSchema };
