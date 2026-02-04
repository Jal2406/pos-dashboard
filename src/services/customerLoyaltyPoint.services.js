import { BaseService } from '../utils/index.js';
import {
  CustomerLoyaltyPointSchema,
  LoyaltyPointSchema,
  LoyaltyRedemptionRuleSchema,
} from '../models/index.js';
import mongoose from 'mongoose';

/**
 * Customer Loyalty Point Service
 *
 * Enterprise-grade service for managing customer loyalty point transactions
 * with tenant-specific database support.
 *
 * @class CustomerLoyaltyPointService
 * @extends BaseService
 */
class CustomerLoyaltyPointService extends BaseService {
  /**
   * Initialize Customer Loyalty Point Service with tenant-specific database support
   * @param {String} businessId - Business/tenant ID for multi-tenant isolation
   */
  constructor(businessId) {
    if (!businessId) {
      throw new Error(
        'CustomerLoyaltyPointService initialized without businessId',
      );
    }
    super({
      modelName: 'CustomerLoyaltyPoint',
      schema: CustomerLoyaltyPointSchema,
      collection: 'customerLoyaltyPoints',
      businessId,
    });

    this._modelRef = null;
    this._loyaltyPointModelRef = null;
    this._redemptionRuleModelRef = null;
  }

  /**
   * Get cached model reference for better performance
   * @returns {Promise<Model>} Cached model reference
   */
  async getCachedModel() {
    if (!this._modelRef) {
      this._modelRef = await this.getModelRef();
    }
    return this._modelRef;
  }

  /**
   * Get loyalty point configuration model
   * @returns {Promise<Model>} Loyalty point model reference
   */
  async getLoyaltyPointModel() {
    if (!this._loyaltyPointModelRef) {
      this._loyaltyPointModelRef = await this.getModel(
        'LoyaltyPoint',
        LoyaltyPointSchema,
        'loyaltyPoints',
      );
    }
    return this._loyaltyPointModelRef;
  }

  /**
   * Get redemption rule model
   * @returns {Promise<Model>} Redemption rule model reference
   */
  async getRedemptionRuleModel() {
    if (!this._redemptionRuleModelRef) {
      this._redemptionRuleModelRef = await this.getModel(
        'LoyaltyRedemptionRule',
        LoyaltyRedemptionRuleSchema,
        'loyaltyRedemptionRules',
      );
    }
    return this._redemptionRuleModelRef;
  }

  /**
   * Get the applicable loyalty point configuration for a purchase amount
   * @param {Number} purchaseAmount - The purchase amount
   * @returns {Promise<Object|null>} Applicable loyalty point configuration
   */
  async getApplicableConfig(purchaseAmount) {
    try {
      const LoyaltyPointModel = await this.getLoyaltyPointModel();

      const config = await LoyaltyPointModel.findOne({
        $or: [
          { businessId: this.businessId },
          { businessId: { $exists: false } },
        ],
        isDeleted: { $ne: true },
        status: true,
        minimumAmount: { $lte: purchaseAmount },
        maximumAmount: { $gte: purchaseAmount },
      }).lean();

      return config;
    } catch (error) {
      throw new Error(
        `Failed to get applicable loyalty config: ${error.message}`,
      );
    }
  }

  /**
   * Award loyalty points to a customer based on purchase amount
   * @param {Object} params - Award parameters
   * @param {String} params.customerId - Customer ID
   * @param {Number} params.purchaseAmount - Purchase amount
   * @param {String} params.sourceId - Source document ID (e.g., Sale ID)
   * @param {String} params.sourceModel - Source model name (e.g., 'Sales')
   * @param {String} params.createdBy - User ID who created this transaction
   * @param {String} params.description - Optional description
   * @param {Object} options - Optional options { session }
   * @returns {Promise<Object>} Created loyalty point transaction
   */
  async awardPoints({
    customerId,
    purchaseAmount,
    sourceId = null,
    sourceModel = null,
    createdBy = null,
    description = null,
    options = {},
  }) {
    try {
      this.validateObjectId(customerId);

      if (
        typeof purchaseAmount !== 'number' ||
        purchaseAmount < 0 ||
        Number.isNaN(purchaseAmount)
      ) {
        throw new Error('Purchase amount must be a non-negative number');
      }

      // Get applicable loyalty point configuration
      const config = await this.getApplicableConfig(purchaseAmount);

      if (!config) {
        return null; // No applicable configuration for this purchase amount
      }

      // Calculate expiry date based on configuration
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + config.expiryDuration);

      // Get current balance for balanceAfter calculation
      const currentBalance = await this.getBalance(customerId);

      const Model = await this.getCachedModel();
      const transaction = new Model({
        customerId,
        points: config.loyaltyPoints,
        transactionType: 'accrual',
        source: 'purchase',
        sourceId,
        sourceModel,
        loyaltyPointConfigId: config._id,
        purchaseAmount,
        expiryDate,
        status: 'active',
        remainingPoints: config.loyaltyPoints,
        balanceAfter: currentBalance + config.loyaltyPoints,
        description:
          description ||
          `Earned ${config.loyaltyPoints} points for purchase of ${purchaseAmount}`,
        createdBy,
      });

      // Save with session if provided for transaction support
      if (options.session) {
        await transaction.save({ session: options.session });
      } else {
        await transaction.save();
      }

      return transaction;
    } catch (error) {
      if (
        error.message.includes('not found') ||
        error.message.includes('Invalid')
      ) {
        throw error;
      }
      throw new Error(`Failed to award loyalty points: ${error.message}`);
    }
  }

  /**
   * Manually add loyalty points to a customer
   * @param {Object} params - Parameters
   * @param {String} params.customerId - Customer ID
   * @param {Number} params.points - Points to add
   * @param {Number} params.expiryDays - Days until expiry (optional)
   * @param {String} params.description - Description
   * @param {String} params.createdBy - User ID who created this
   * @returns {Promise<Object>} Created transaction
   */
  async addManualPoints({
    customerId,
    points,
    expiryDays = 365,
    description = null,
    createdBy = null,
  }) {
    try {
      this.validateObjectId(customerId);

      if (typeof points !== 'number' || points <= 0) {
        throw new Error('Points must be a positive number');
      }

      // Calculate expiry date
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + expiryDays);

      // Get current balance
      const currentBalance = await this.getBalance(customerId);

      const Model = await this.getCachedModel();
      const transaction = new Model({
        customerId,
        points,
        transactionType: 'manual',
        source: 'manual',
        expiryDate,
        status: 'active',
        remainingPoints: points,
        balanceAfter: currentBalance + points,
        description: description || `Manually added ${points} points`,
        createdBy,
      });

      await transaction.save();

      return transaction;
    } catch (error) {
      if (
        error.message.includes('not found') ||
        error.message.includes('Invalid')
      ) {
        throw error;
      }
      throw new Error(`Failed to add manual points: ${error.message}`);
    }
  }

  /**
   * Redeem loyalty points for a customer
   * @param {Object} params - Redemption parameters
   * @param {String} params.customerId - Customer ID
   * @param {Number} params.pointsToRedeem - Points to redeem
   * @param {String} params.sourceId - Source document ID (e.g., Sale ID)
   * @param {String} params.sourceModel - Source model name
   * @param {Number} params.redemptionValue - Monetary value of redemption
   * @param {String} params.redemptionRuleId - Redemption rule ID used
   * @param {String} params.createdBy - User ID
   * @param {String} params.description - Description
   * @param {Object} params.options - Optional options { session }
   * @returns {Promise<Object>} Created redemption transaction
   */
  async redeemPoints({
    customerId,
    pointsToRedeem,
    sourceId = null,
    sourceModel = null,
    redemptionValue = null,
    redemptionRuleId = null,
    createdBy = null,
    description = null,
    options = {},
  }) {
    try {
      this.validateObjectId(customerId);

      if (typeof pointsToRedeem !== 'number' || pointsToRedeem <= 0) {
        throw new Error('Points to redeem must be a positive number');
      }

      // Check available points
      const availablePoints = await this.getAvailablePoints(customerId);

      if (availablePoints < pointsToRedeem) {
        throw new Error(
          `Insufficient points. Available: ${availablePoints}, Requested: ${pointsToRedeem}`,
        );
      }

      const Model = await this.getCachedModel();

      // Get active point transactions to deduct from (FIFO - oldest first)
      const findQuery = Model.find({
        customerId,
        isDeleted: { $ne: true },
        status: 'active',
        transactionType: 'accrual',
        remainingPoints: { $gt: 0 },
        $or: [{ expiryDate: null }, { expiryDate: { $gt: new Date() } }],
      }).sort({ expiryDate: 1, createdAt: 1 }); // Expire soonest first

      // Apply session if provided
      if (options.session) {
        findQuery.session(options.session);
      }

      const activeTransactions = await findQuery;

      let remainingToRedeem = pointsToRedeem;
      const redeemedFrom = [];

      // Deduct points from active transactions
      for (const transaction of activeTransactions) {
        if (remainingToRedeem <= 0) break;

        const deductAmount = Math.min(
          transaction.remainingPoints,
          remainingToRedeem,
        );
        transaction.remainingPoints -= deductAmount;

        if (transaction.remainingPoints === 0) {
          transaction.status = 'redeemed';
        }

        // Save with session if provided
        if (options.session) {
          await transaction.save({ session: options.session });
        } else {
          await transaction.save();
        }

        redeemedFrom.push({
          transactionId: transaction._id,
          pointsDeducted: deductAmount,
        });

        remainingToRedeem -= deductAmount;
      }

      // Get current balance after deduction
      const currentBalance = await this.getBalance(customerId);

      // Create redemption transaction
      const redemptionTransaction = new Model({
        customerId,
        points: -pointsToRedeem, // Negative for redemption
        transactionType: 'redemption',
        source: 'purchase',
        sourceId,
        sourceModel,
        redemptionRuleId,
        redemptionValue,
        status: 'active',
        remainingPoints: 0,
        balanceAfter: currentBalance,
        description:
          description ||
          `Redeemed ${pointsToRedeem} points for ${redemptionValue || 0} value`,
        createdBy,
      });

      // Save with session if provided
      if (options.session) {
        await redemptionTransaction.save({ session: options.session });
      } else {
        await redemptionTransaction.save();
      }

      return {
        redemptionTransaction,
        redeemedFrom,
        totalRedeemed: pointsToRedeem,
        newBalance: currentBalance,
      };
    } catch (error) {
      if (
        error.message.includes('not found') ||
        error.message.includes('Invalid') ||
        error.message.includes('Insufficient')
      ) {
        throw error;
      }
      throw new Error(`Failed to redeem loyalty points: ${error.message}`);
    }
  }

  /**
   * Adjust loyalty points (add or subtract)
   * @param {Object} params - Adjustment parameters
   * @param {String} params.customerId - Customer ID
   * @param {Number} params.points - Points to adjust (positive or negative)
   * @param {String} params.description - Reason for adjustment
   * @param {String} params.createdBy - User ID
   * @returns {Promise<Object>} Created adjustment transaction
   */
  async adjustPoints({ customerId, points, description, createdBy = null }) {
    try {
      this.validateObjectId(customerId);

      if (typeof points !== 'number' || points === 0) {
        throw new Error('Points must be a non-zero number');
      }

      // For negative adjustments, check available points
      if (points < 0) {
        const availablePoints = await this.getAvailablePoints(customerId);
        if (availablePoints < Math.abs(points)) {
          throw new Error(
            `Insufficient points for negative adjustment. Available: ${availablePoints}`,
          );
        }
      }

      const currentBalance = await this.getBalance(customerId);

      const Model = await this.getCachedModel();
      const transaction = new Model({
        customerId,
        points,
        transactionType: 'adjustment',
        source: 'adjustment',
        status: 'active',
        remainingPoints: points > 0 ? points : 0,
        balanceAfter: currentBalance + points,
        description: description || `Point adjustment: ${points}`,
        createdBy,
      });

      await transaction.save();

      return transaction;
    } catch (error) {
      if (
        error.message.includes('not found') ||
        error.message.includes('Invalid') ||
        error.message.includes('Insufficient')
      ) {
        throw error;
      }
      throw new Error(`Failed to adjust loyalty points: ${error.message}`);
    }
  }

  /**
   * Get customer's current loyalty point balance
   * @param {String} customerId - Customer ID
   * @returns {Promise<Number>} Current balance
   */
  async getBalance(customerId) {
    try {
      this.validateObjectId(customerId);

      const Model = await this.getCachedModel();
      return Model.getBalance(customerId);
    } catch (error) {
      throw new Error(`Failed to get loyalty point balance: ${error.message}`);
    }
  }

  /**
   * Get customer's available (redeemable) points
   * @param {String} customerId - Customer ID
   * @returns {Promise<Number>} Available points
   */
  async getAvailablePoints(customerId) {
    try {
      this.validateObjectId(customerId);

      const Model = await this.getCachedModel();
      return Model.getAvailablePoints(customerId);
    } catch (error) {
      throw new Error(`Failed to get available points: ${error.message}`);
    }
  }

  /**
   * Get customer's point transaction history
   * @param {String} customerId - Customer ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Transaction history
   */
  async getTransactionHistory(customerId, options = {}) {
    try {
      this.validateObjectId(customerId);

      const Model = await this.getCachedModel();
      return Model.getTransactionHistory(customerId, options);
    } catch (error) {
      throw new Error(`Failed to get transaction history: ${error.message}`);
    }
  }

  /**
   * Get customer's points summary
   * @param {String} customerId - Customer ID
   * @returns {Promise<Object>} Points summary
   */
  async getPointsSummary(customerId) {
    try {
      this.validateObjectId(customerId);

      const Model = await this.getCachedModel();
      return Model.getPointsSummary(customerId);
    } catch (error) {
      throw new Error(`Failed to get points summary: ${error.message}`);
    }
  }

  /**
   * Get points expiring soon for a customer
   * @param {String} customerId - Customer ID
   * @param {Number} days - Days to look ahead
   * @returns {Promise<Array>} Points expiring soon
   */
  async getPointsExpiringSoon(customerId, days = 30) {
    try {
      this.validateObjectId(customerId);

      const Model = await this.getCachedModel();
      const now = new Date();
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + days);

      return Model.find({
        customerId,
        expiryDate: {
          $gte: now,
          $lte: futureDate,
        },
        status: 'active',
        remainingPoints: { $gt: 0 },
        isDeleted: { $ne: true },
      }).sort({ expiryDate: 1 });
    } catch (error) {
      throw new Error(`Failed to get expiring points: ${error.message}`);
    }
  }

  /**
   * Process expired points (batch job)
   * @returns {Promise<Object>} Result with count of expired points
   */
  async processExpiredPoints() {
    try {
      const Model = await this.getCachedModel();
      return Model.processExpiredPoints();
    } catch (error) {
      throw new Error(`Failed to process expired points: ${error.message}`);
    }
  }

  /**
   * Get all points expiring soon across all customers
   * @param {Number} days - Days to look ahead
   * @returns {Promise<Array>} Points expiring soon
   */
  async getAllPointsExpiringSoon(days = 30) {
    try {
      const Model = await this.getCachedModel();
      return Model.findExpiringSoon(days);
    } catch (error) {
      throw new Error(`Failed to get expiring points: ${error.message}`);
    }
  }

  /**
   * Cancel a point transaction
   * @param {String} transactionId - Transaction ID to cancel
   * @param {String} updatedBy - User ID who cancelled
   * @returns {Promise<Object>} Updated transaction
   */
  async cancelTransaction(transactionId, updatedBy = null) {
    try {
      this.validateObjectId(transactionId);

      const Model = await this.getCachedModel();
      const transaction = await Model.findOne({
        _id: transactionId,
        isDeleted: { $ne: true },
      });

      if (!transaction) {
        throw new Error('Transaction not found');
      }

      if (transaction.status === 'cancelled') {
        throw new Error('Transaction is already cancelled');
      }

      transaction.status = 'cancelled';
      transaction.remainingPoints = 0;
      transaction.updatedBy = updatedBy;

      await transaction.save();

      return transaction;
    } catch (error) {
      if (
        error.message.includes('not found') ||
        error.message.includes('already cancelled')
      ) {
        throw error;
      }
      throw new Error(`Failed to cancel transaction: ${error.message}`);
    }
  }

  /**
   * Get loyalty point history for display
   * @param {Object} options - Query options { limit, skip, search, transactionType, startDate, endDate }
   * @returns {Promise<Array>} Formatted history
   */
  async getLoyaltyPointHistory(options = {}) {
    try {
      const Model = await this.getCachedModel();
      const {
        page = 1,
        limit = 10,
        search,
        transactionType,
        startDate,
        endDate,
        all
      } = options;

      const {
        page: validatedPage,
        limit: validatedLimit,
        skip,
      } = this.validatePagination(page, limit);

      const pipeline = [
        {
          $match: {
            isDeleted: { $ne: true },
          },
        },
      ];

      if (transactionType) {
        pipeline[0].$match.transactionType = transactionType;
      }

      if (startDate || endDate) {
        const dateQuery = {};
        if (startDate) dateQuery.$gte = new Date(startDate);
        if (endDate) dateQuery.$lte = new Date(endDate);
        if (Object.keys(dateQuery).length > 0) {
          pipeline[0].$match.createdAt = dateQuery;
        }
      }

      pipeline.push({ $sort: { createdAt: -1 } });

      // Lookup Customer
      pipeline.push({
        $lookup: {
          from: 'customers',
          localField: 'customerId',
          foreignField: '_id',
          as: 'customer',
        },
      });

      pipeline.push({
        $unwind: {
          path: '$customer',
          preserveNullAndEmptyArrays: true,
        },
      });

      // Lookup Creator (Handled By)
      pipeline.push({
        $lookup: {
          from: 'users',
          localField: 'createdBy',
          foreignField: '_id',
          as: 'creator',
        },
      });

      pipeline.push({
        $unwind: {
          path: '$creator',
          preserveNullAndEmptyArrays: true,
        },
      });

      if (search) {
        pipeline.push({
          $match: {
            $or: [
              { 'customer.customerName': { $regex: search, $options: 'i' } },
              { transactionType: { $regex: search, $options: 'i' } },
              { 'creator.name': { $regex: search, $options: 'i' } },
              { sourceId: { $regex: search, $options: 'i' } },
            ],
          },
        });
      }

      const projectStage = {
        $project: {
          transactionId: '$_id',
          customer: {
            customerId: '$customer._id',
            customerName: '$customer.customerName',
            customerEmail: '$customer.email'
          },
          orderId: '$sourceId',
          earnedPoints: {
            $cond: {
              if: { $gt: ['$points', 0] },
              then: '$points',
              else: 0,
            },
          },
          redeemedPoints: {
            $cond: {
              if: { $lt: ['$points', 0] },
              then: { $abs: '$points' },
              else: 0,
            },
          },
          balancePoints: '$balanceAfter',
          transactionType: 1,
          transactiondateTime: '$createdAt',
          handledBy: '$creator.name',
        },
      };

      const paginationPipeline = [
        ...pipeline,
        {
          $facet: {
            metadata: [{ $count: 'total' }],
            data: [
              projectStage,
              { $skip: skip },
              { $limit: validatedLimit },
            ],
          },
        },
      ];

      const result = await Model.aggregate(paginationPipeline);

      const total = result[0].metadata[0] ? result[0].metadata[0].total : 0;
      const data = result[0].data;

      return {
        data,
        pagination: {
          currentPage: validatedPage,
          totalPages: Math.ceil(total / validatedLimit),
          totalItems: total,
          itemsPerPage: validatedLimit,
          hasNext: validatedPage * validatedLimit < total,
          hasPrev: validatedPage > 1,
        },
      };
    } catch (error) {
      throw new Error(`Failed to get loyalty point history: ${error.message}`);
    }
  }

  /**
   * Get loyalty points data for a customer (to include in getActiveCustomers)
   * @param {String} customerId - Customer ID
   * @returns {Promise<Object>} Loyalty points data
   */
  async getCustomerLoyaltyData(customerId) {
    try {
      this.validateObjectId(customerId);

      const [summary, expiringSoon] = await Promise.all([
        this.getPointsSummary(customerId),
        this.getPointsExpiringSoon(customerId, 30),
      ]);

      return {
        ...summary,
        pointsExpiringSoon: expiringSoon,
      };
    } catch (error) {
      // Return default values if error occurs
      return {
        totalEarned: 0,
        totalRedeemed: 0,
        totalExpired: 0,
        totalAdjusted: 0,
        currentBalance: 0,
        availablePoints: 0,
        transactionCount: 0,
        pointsExpiringSoon: [],
      };
    }
  }

  /**
   * Validate ObjectId
   * @param {String} id - ID to validate
   */
  validateObjectId(id) {
    if (!mongoose.isValidObjectId(id)) {
      throw new Error(`Invalid ID: ${id}`);
    }
  }
}

export default CustomerLoyaltyPointService;
