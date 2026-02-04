import mongoose from 'mongoose';

/**
 * Loyalty Redemption Rule Schema
 * Enterprise-grade schema for managing loyalty point redemption rules
 * Each document represents a single redemption rule with point range and discount amount
 */
const loyaltyRedemptionRuleSchema = new mongoose.Schema(
  {
    // Rule name for identification
    ruleName: {
      type: String,
      required: [true, 'Rule name is required'],
      trim: true,
      maxlength: [100, 'Rule name cannot exceed 100 characters'],
    },

    // Point range: minimum points required (must be positive)
    pointFrom: {
      type: Number,
      required: [true, 'Point from is required'],
      min: [1, 'Point from must be a positive number (minimum 1)'],
      validate: {
        validator: function (v) {
          return this.pointTo === undefined || v <= this.pointTo;
        },
        message: 'Point from must be less than or equal to point to',
      },
    },

    // Point range: maximum points for this rule (must be positive)
    pointTo: {
      type: Number,
      required: [true, 'Point to is required'],
      min: [1, 'Point to must be a positive number (minimum 1)'],
      validate: {
        validator: function (v) {
          return this.pointFrom === undefined || v >= this.pointFrom;
        },
        message: 'Point to must be greater than or equal to point from',
      },
    },

    // Discount amount for this point range
    amount: {
      type: Number,
      required: [true, 'Discount amount is required'],
      min: [0, 'Discount amount cannot be negative'],
    },

    // Status: Active/Inactive
    status: {
      type: Boolean,
      default: true,
    },

    // Soft Delete
    isDeleted: {
      type: Boolean,
      default: false,
    },

    // Audit fields
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for better query performance
loyaltyRedemptionRuleSchema.index({ status: 1 });
loyaltyRedemptionRuleSchema.index({ isDeleted: 1 });
loyaltyRedemptionRuleSchema.index({ pointFrom: 1, pointTo: 1 });
loyaltyRedemptionRuleSchema.index({ ruleName: 1 });

// Compound index for active, non-deleted rules
loyaltyRedemptionRuleSchema.index({
  status: 1,
  isDeleted: 1,
});

// Virtual for checking if rule is active
loyaltyRedemptionRuleSchema.virtual('isActive').get(function () {
  return this.status === true && this.isDeleted === false;
});

// Static method to find active rules
loyaltyRedemptionRuleSchema.statics.findActiveRules = function (options = {}) {
  const query = {
    status: true,
    isDeleted: false,
    ...options,
  };

  return this.find(query).sort({ pointFrom: 1 });
};

// Static method to find rule by point value
loyaltyRedemptionRuleSchema.statics.findByPointValue = function (
  points,
  options = {},
) {
  const query = {
    pointFrom: { $lte: points },
    pointTo: { $gte: points },
    status: true,
    isDeleted: false,
    ...options,
  };

  return this.findOne(query);
};

export { loyaltyRedemptionRuleSchema as LoyaltyRedemptionRuleSchema };
