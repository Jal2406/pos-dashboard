import mongoose from 'mongoose';

/**
 * Customer Loyalty Point Schema
 * Tracks individual loyalty point transactions for customers
 * Supports point accrual, redemption, expiry, and adjustments
 */
const customerLoyaltyPointSchema = new mongoose.Schema(
  {
    // Reference to the customer
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: [true, 'Customer ID is required'],
      index: true,
    },

    // Points in this transaction (positive for accrual, negative for redemption)
    points: {
      type: Number,
      required: [true, 'Points is required'],
      validate: {
        validator: function (v) {
          // Points can be negative for redemptions
          return typeof v === 'number' && !Number.isNaN(v);
        },
        message: 'Points must be a valid number',
      },
    },

    // Transaction type
    transactionType: {
      type: String,
      enum: {
        values: ['accrual', 'redemption', 'adjustment', 'expiry', 'manual'],
        message:
          'Transaction type must be one of: accrual, redemption, adjustment, expiry, manual',
      },
      required: [true, 'Transaction type is required'],
      index: true,
    },

    // Source of the transaction
    source: {
      type: String,
      enum: {
        values: ['purchase', 'refund', 'manual', 'promotion', 'adjustment', 'system'],
        message:
          'Source must be one of: purchase, refund, manual, promotion, adjustment, system',
      },
      required: [true, 'Source is required'],
    },

    // Reference to the source document (e.g., Sale ID)
    sourceId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'sourceModel',
      default: null,
    },

    // Model name for the source reference
    sourceModel: {
      type: String,
      enum: ['Sales', 'PurchaseReturn', 'Manual', null],
      default: null,
    },

    // Reference to the loyalty point configuration used
    loyaltyPointConfigId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LoyaltyPoint',
      default: null,
    },

    // Reference to the redemption rule used (for redemptions)
    redemptionRuleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LoyaltyRedemptionRule',
      default: null,
    },

    // Purchase amount that triggered this transaction (for accruals)
    purchaseAmount: {
      type: Number,
      min: [0, 'Purchase amount cannot be negative'],
      default: null,
    },

    // Redemption value (monetary value for redemptions)
    redemptionValue: {
      type: Number,
      min: [0, 'Redemption value cannot be negative'],
      default: null,
    },

    // Expiry date for these points
    expiryDate: {
      type: Date,
      default: null,
      index: true,
    },

    // Status of the points
    status: {
      type: String,
      enum: {
        values: ['active', 'redeemed', 'expired', 'cancelled'],
        message: 'Status must be one of: active, redeemed, expired, cancelled',
      },
      default: 'active',
      index: true,
    },

    // Remaining points (for partial redemptions)
    remainingPoints: {
      type: Number,
      default: function () {
        return this.points > 0 ? this.points : 0;
      },
      min: [0, 'Remaining points cannot be negative'],
    },

    // Balance after this transaction
    balanceAfter: {
      type: Number,
      default: 0,
    },

    // Description/notes for the transaction
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
      default: null,
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

    // Soft delete
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ===== INDEXES =====

// Compound index for customer point queries
customerLoyaltyPointSchema.index({ customerId: 1, status: 1 });
customerLoyaltyPointSchema.index({ customerId: 1, transactionType: 1 });
customerLoyaltyPointSchema.index({ customerId: 1, createdAt: -1 });

// Index for expiry processing
customerLoyaltyPointSchema.index({ expiryDate: 1, status: 1 });

// Index for finding active points that can be redeemed
customerLoyaltyPointSchema.index({
  customerId: 1,
  status: 1,
  remainingPoints: 1,
  expiryDate: 1,
});

// Index for source lookups
customerLoyaltyPointSchema.index({ sourceId: 1, sourceModel: 1 });

// Index for soft delete
customerLoyaltyPointSchema.index({ isDeleted: 1 });

// ===== VIRTUALS =====

// Check if points are expired
customerLoyaltyPointSchema.virtual('isExpired').get(function () {
  if (!this.expiryDate) return false;
  return new Date() > this.expiryDate;
});

// Check if points are available for redemption
customerLoyaltyPointSchema.virtual('isRedeemable').get(function () {
  return (
    this.status === 'active' &&
    this.remainingPoints > 0 &&
    !this.isExpired &&
    !this.isDeleted
  );
});

// ===== STATIC METHODS =====

/**
 * Get customer's current loyalty point balance
 * @param {ObjectId} customerId - Customer ID
 * @returns {Promise<Number>} Current point balance
 */
customerLoyaltyPointSchema.statics.getBalance = async function (customerId) {
  const result = await this.aggregate([
    {
      $match: {
        customerId: new mongoose.Types.ObjectId(customerId),
        isDeleted: { $ne: true },
        status: { $in: ['active', 'redeemed'] },
      },
    },
    {
      $group: {
        _id: null,
        totalPoints: { $sum: '$points' },
      },
    },
  ]);

  return result.length > 0 ? result[0].totalPoints : 0;
};

/**
 * Get customer's available (redeemable) points
 * @param {ObjectId} customerId - Customer ID
 * @returns {Promise<Number>} Available points for redemption
 */
customerLoyaltyPointSchema.statics.getAvailablePoints = async function (
  customerId,
) {
  const result = await this.aggregate([
    {
      $match: {
        customerId: new mongoose.Types.ObjectId(customerId),
        isDeleted: { $ne: true },
        status: 'active',
        transactionType: 'accrual',
        remainingPoints: { $gt: 0 },
        $or: [{ expiryDate: null }, { expiryDate: { $gt: new Date() } }],
      },
    },
    {
      $group: {
        _id: null,
        availablePoints: { $sum: '$remainingPoints' },
      },
    },
  ]);

  return result.length > 0 ? result[0].availablePoints : 0;
};

/**
 * Get customer's point transaction history
 * @param {ObjectId} customerId - Customer ID
 * @param {Object} options - Query options { limit, skip, transactionType }
 * @returns {Promise<Array>} Transaction history
 */
customerLoyaltyPointSchema.statics.getTransactionHistory = function (
  customerId,
  options = {},
) {
  const query = {
    customerId,
    isDeleted: { $ne: true },
  };

  if (options.transactionType) {
    query.transactionType = options.transactionType;
  }

  if (options.status) {
    query.status = options.status;
  }

  let queryBuilder = this.find(query).sort({ createdAt: -1 });

  if (options.limit) {
    queryBuilder = queryBuilder.limit(options.limit);
  }

  if (options.skip) {
    queryBuilder = queryBuilder.skip(options.skip);
  }

  if (options.populate) {
    queryBuilder = queryBuilder.populate(options.populate);
  }

  return queryBuilder;
};

/**
 * Find points expiring soon
 * @param {Number} days - Number of days to look ahead
 * @returns {Promise<Array>} Points expiring soon
 */
customerLoyaltyPointSchema.statics.findExpiringSoon = function (days = 30) {
  const now = new Date();
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);

  return this.find({
    expiryDate: {
      $gte: now,
      $lte: futureDate,
    },
    status: 'active',
    remainingPoints: { $gt: 0 },
    isDeleted: { $ne: true },
  }).populate('customerId', 'customerName email phone');
};

/**
 * Expire points that have passed their expiry date
 * @returns {Promise<Object>} Result with count of expired points
 */
customerLoyaltyPointSchema.statics.processExpiredPoints = async function () {
  const result = await this.updateMany(
    {
      expiryDate: { $lte: new Date() },
      status: 'active',
      remainingPoints: { $gt: 0 },
      isDeleted: { $ne: true },
    },
    {
      $set: {
        status: 'expired',
        updatedAt: new Date(),
      },
    },
  );

  return {
    expiredCount: result.modifiedCount,
    message: `${result.modifiedCount} point records expired`,
  };
};

/**
 * Get points summary for a customer
 * @param {ObjectId} customerId - Customer ID
 * @returns {Promise<Object>} Points summary
 */
customerLoyaltyPointSchema.statics.getPointsSummary = async function (
  customerId,
) {
  const [summary] = await this.aggregate([
    {
      $match: {
        customerId: new mongoose.Types.ObjectId(customerId),
        isDeleted: { $ne: true },
      },
    },
    {
      $group: {
        _id: null,
        totalEarned: {
          $sum: {
            $cond: [{ $eq: ['$transactionType', 'accrual'] }, '$points', 0],
          },
        },
        totalRedeemed: {
          $sum: {
            $cond: [
              { $eq: ['$transactionType', 'redemption'] },
              { $abs: '$points' },
              0,
            ],
          },
        },
        totalExpired: {
          $sum: {
            $cond: [{ $eq: ['$status', 'expired'] }, '$remainingPoints', 0],
          },
        },
        totalAdjusted: {
          $sum: {
            $cond: [{ $eq: ['$transactionType', 'adjustment'] }, '$points', 0],
          },
        },
        currentBalance: { $sum: '$points' },
        transactionCount: { $sum: 1 },
      },
    },
  ]);

  if (!summary) {
    return {
      totalEarned: 0,
      totalRedeemed: 0,
      totalExpired: 0,
      totalAdjusted: 0,
      currentBalance: 0,
      transactionCount: 0,
    };
  }

  // Calculate available points separately
  const availablePoints = await this.getAvailablePoints(customerId);

  return {
    ...summary,
    availablePoints,
  };
};

// ===== INSTANCE METHODS =====

/**
 * Mark points as redeemed
 * @param {Number} pointsToRedeem - Points to redeem from this transaction
 * @returns {Promise<Object>} Updated document
 */
customerLoyaltyPointSchema.methods.redeem = async function (pointsToRedeem) {
  if (this.status !== 'active') {
    throw new Error('Cannot redeem points: Points are not active');
  }

  if (this.remainingPoints < pointsToRedeem) {
    throw new Error('Cannot redeem more points than available');
  }

  this.remainingPoints -= pointsToRedeem;

  if (this.remainingPoints === 0) {
    this.status = 'redeemed';
  }

  return this.save();
};

/**
 * Cancel this point transaction
 * @returns {Promise<Object>} Updated document
 */
customerLoyaltyPointSchema.methods.cancel = async function () {
  if (this.status === 'cancelled') {
    throw new Error('Points are already cancelled');
  }

  this.status = 'cancelled';
  this.remainingPoints = 0;

  return this.save();
};

// ===== PRE-SAVE HOOKS =====

customerLoyaltyPointSchema.pre('save', function (next) {
  // Set remaining points for accruals
  if (this.isNew && this.transactionType === 'accrual' && this.points > 0) {
    this.remainingPoints = this.points;
  }

  // Set remaining points to 0 for non-accrual transactions
  if (
    this.isNew &&
    this.transactionType !== 'accrual' &&
    this.remainingPoints === undefined
  ) {
    this.remainingPoints = 0;
  }

  next();
});

export { customerLoyaltyPointSchema as CustomerLoyaltyPointSchema };
