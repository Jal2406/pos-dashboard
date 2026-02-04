import { BaseService } from '../utils/index.js';
import { TransactionUtils } from '../utils/index.js';
import { Coupon, CouponUsage, TransactionLog, Plan } from '../models/index.js';
import mongoose from 'mongoose';

// Simple in-memory cache for frequently accessed coupons
const couponCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

class CouponServices extends BaseService {
  constructor() {
    super(Coupon);
  }

  async create(data, options = {}) {
    // Normalize and validate discount inputs before creation
    const payload = { ...data };

    // Map camelCase fields to snake_case for schema compatibility
    if (payload.startDate !== undefined) {
      payload.start_date = new Date(payload.startDate);
      delete payload.startDate;
    }
    if (payload.endDate !== undefined) {
      payload.end_date = new Date(payload.endDate);
      delete payload.endDate;
    }
    if (payload.discountAmount !== undefined) {
      payload.discount_amount = payload.discountAmount;
      delete payload.discountAmount;
    }

    // Normalize type to match schema enum ['Percentage', 'Fixed']
    if (payload.type) {
      const t = String(payload.type).toLowerCase();
      payload.type =
        t === 'percentage'
          ? 'Percentage'
          : t === 'fixed'
            ? 'Fixed'
            : payload.type;
    }

    // Coerce discount_amount
    if (payload.discount_amount !== undefined) {
      payload.discount_amount = Number(payload.discount_amount);
      if (
        Number.isNaN(payload.discount_amount) ||
        payload.discount_amount < 0
      ) {
        throw new Error('discount_amount must be a non-negative number');
      }
    }

    // Validation for Percentage coupons
    if (payload.type === 'Percentage') {
      if (payload.discount_amount === undefined) {
        throw new Error('discount_amount is required for Percentage coupons');
      }
      if (payload.discount_amount > 100) {
        throw new Error('Percentage discount cannot exceed 100');
      }
    }

    // Validation for Fixed coupons against provided plans
    if (
      payload.type === 'Fixed' &&
      Array.isArray(payload.plans) &&
      payload.plans.length > 0
    ) {
      // Fetch plan prices and ensure discount does not exceed minimum price
      const plans = await Plan.find({ _id: { $in: payload.plans } }).select(
        'price isTrial',
      );
      if (!plans || plans.length === 0) {
        throw new Error('Provided planIds are invalid');
      }

      const prices = plans
        .map((p) => Number(p.price || 0))
        .filter((n) => Number.isFinite(n) && n >= 0);

      if (prices.length === 0) {
        // If all selected plans have no price, only zero discount is allowed
        if ((payload.discount_amount || 0) > 0) {
          throw new Error(
            'Fixed discount cannot exceed the minimum plan price (0)',
          );
        }
      } else {
        const minPrice = Math.min(...prices);
        if (payload.discount_amount > minPrice) {
          throw new Error(
            `Fixed discount cannot exceed the minimum price among selected plans (${minPrice})`,
          );
        }
      }
    }

    return await super.create(payload, options);
  }

  async updateById(id, data) {
    const payload = { ...data };

    this.validateObjectId(id);

    // Fetch existing coupon first to check expiration
    const existingCoupon = await Coupon.findOne({
      _id: id,
      isDeleted: false,
    }).select('code end_date');

    if (!existingCoupon) {
      throw new Error('Coupon not found');
    }

    // Check if coupon has expired - use end of day comparison
    const now = new Date();
    const endOfCouponDay = new Date(existingCoupon.end_date);
    endOfCouponDay.setHours(23, 59, 59, 999);

    if (now > endOfCouponDay) {
      throw new Error(
        'Cannot modify an expired coupon. The end date has already passed.',
      );
    }

    // Map camelCase fields to snake_case for schema compatibility
    if (payload.startDate !== undefined) {
      payload.start_date = new Date(payload.startDate);
      delete payload.startDate;
    }
    if (payload.endDate !== undefined) {
      payload.end_date = new Date(payload.endDate);
      delete payload.endDate;
    }
    if (payload.discountAmount !== undefined) {
      payload.discount_amount = payload.discountAmount;
      delete payload.discountAmount;
    }

    // Normalize type values to schema enum
    if (payload.type) {
      const t = String(payload.type).toLowerCase();
      payload.type =
        t === 'percentage'
          ? 'Percentage'
          : t === 'fixed'
            ? 'Fixed'
            : payload.type;
    }

    // Coerce discount_amount
    if (payload.discount_amount !== undefined) {
      payload.discount_amount = Number(payload.discount_amount);
      if (
        Number.isNaN(payload.discount_amount) ||
        payload.discount_amount < 0
      ) {
        throw new Error('discount_amount must be a non-negative number');
      }
    }

    // Sanitize plans: remove invalid or non-existent IDs
    let existingPlans = null;
    if (payload.plans !== undefined) {
      const plansArray = Array.isArray(payload.plans)
        ? payload.plans
        : [payload.plans];

      const validIds = plansArray.filter((p) => mongoose.isValidObjectId(p));

      if (validIds.length > 0) {
        existingPlans = await Plan.find({ _id: { $in: validIds } }).select(
          'price',
        );
        const existingIdSet = new Set(
          existingPlans.map((p) => p._id.toString()),
        );
        payload.plans = validIds.filter((id) =>
          existingIdSet.has(id.toString()),
        );
      } else {
        payload.plans = [];
        existingPlans = [];
      }
    }

    // Percentage validation
    if (
      payload.type === 'Percentage' &&
      payload.discount_amount !== undefined
    ) {
      if (payload.discount_amount > 100) {
        throw new Error('Percentage discount cannot exceed 100');
      }
    }

    // Fixed validation against selected plans (if plans being updated or provided)
    const shouldValidateFixed =
      payload.type === 'Fixed' &&
      payload.discount_amount !== undefined &&
      Array.isArray(payload.plans) &&
      payload.plans.length > 0 &&
      Array.isArray(existingPlans);

    if (shouldValidateFixed) {
      const prices = existingPlans
        .map((p) => Number(p.price || 0))
        .filter((n) => Number.isFinite(n) && n >= 0);

      if (prices.length === 0) {
        if ((payload.discount_amount || 0) > 0) {
          throw new Error(
            'Fixed discount cannot exceed the minimum plan price (0)',
          );
        }
      } else {
        const minPrice = Math.min(...prices);
        if (payload.discount_amount > minPrice) {
          throw new Error(
            `Fixed discount cannot exceed the minimum price among selected plans (${minPrice})`,
          );
        }
      }
    }

    const updatedCoupon = await Coupon.findOneAndUpdate(
      { _id: id, isDeleted: false },
      payload,
      {
        new: true,
        runValidators: true,
        context: 'query', // Required for update validators to access 'this'
      },
    );

    if (!updatedCoupon) {
      throw new Error('Coupon not found');
    }

    if (existingCoupon.code) {
      this._invalidateCouponCache(existingCoupon.code);
    }

    if (updatedCoupon.code && updatedCoupon.code !== existingCoupon.code) {
      this._invalidateCouponCache(updatedCoupon.code);
    }

    return updatedCoupon;
  }

  /**
   * Get cached coupon or fetch from database
   * @param {string} couponCode - Coupon code
   * @returns {Object|null} Cached coupon or null
   */
  _getCachedCoupon(couponCode) {
    const cacheKey = `coupon_${couponCode.toUpperCase()}`;
    const cached = couponCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }

    return null;
  }

  /**
   * Cache coupon data
   * @param {string} couponCode - Coupon code
   * @param {Object} couponData - Coupon data to cache
   */
  _cacheCoupon(couponCode, couponData) {
    const cacheKey = `coupon_${couponCode.toUpperCase()}`;
    couponCache.set(cacheKey, {
      data: couponData,
      timestamp: Date.now(),
    });
  }

  /**
   * Invalidate coupon cache
   * @param {string} couponCode - Coupon code to invalidate
   */
  _invalidateCouponCache(couponCode) {
    const cacheKey = `coupon_${couponCode.toUpperCase()}`;
    couponCache.delete(cacheKey);
  }

  /**
   * Get cache statistics for monitoring
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    return {
      size: couponCache.size,
      maxAge: CACHE_TTL,
      keys: Array.from(couponCache.keys()),
    };
  }

  async list(queryParams = {}) {
    const { status, type, activeOn, isActive, category, all, ...otherParams } =
      queryParams;

    // Define search fields for Coupon
    const searchFields = ['code', 'description'];

    // Build filters object
    const filters = { isDeleted: false }; // Only show non-deleted coupons

    // Handle status filter (prioritize status over isActive)
    if (status !== undefined) {
      filters.status = status === 'true' || status === true;
    } else if (isActive !== undefined) {
      filters.status = isActive === 'true' || isActive === true;
    }

    // Handle type/category filter
    const filterType = type || category;
    if (filterType) {
      const t = String(filterType).toLowerCase();
      filters.type =
        t === 'percentage'
          ? 'Percentage'
          : t === 'fixed'
            ? 'Fixed'
            : filterType;
    }

    // Active on date filter
    if (activeOn) {
      const date = new Date(activeOn);
      filters.start_date = { $lte: date };
      filters.end_date = { $gte: date };
    }

    // Check if non-paginated mode is requested
    if (all === 'true' || all === true) {
      // Non-paginated mode: return all data with filters and search
      const {
        search = '',
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = otherParams;

      // Build filter object
      const filter = { ...filters };

      // Add search functionality
      if (search && searchFields.length > 0) {
        filter.$or = searchFields.map((field) => ({
          [field]: { $regex: search, $options: 'i' },
        }));
      }

      // Build sort object
      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      // Get all coupons without pagination
      const Model = await this.getModelRef();
      const coupons = await Model.find(filter)
        .sort(sort)
        .populate('plans', 'name price duration status')
        .exec();

      return {
        data: coupons,
        total: coupons.length,
      };
    }

    // Paginated mode: Use BaseService list method with Coupon specific configuration
    return await super.list({
      ...otherParams,
      searchFields,
      filters,
    });
  }

  async getById(id) {
    this.validateObjectId(id);

    const coupon = await Coupon.findOne({
      _id: id,
      isDeleted: false,
    }).populate('plans', 'name price duration status');

    if (!coupon) {
      throw new Error('Coupon not found');
    }

    return coupon;
  }

  /**
   * Cancel applied coupon
   * @param {string} usageId - Coupon usage ID
   * @param {string} userId - User ID
   * @returns {Object} Cancellation result
   */
  async cancelCoupon(usageId, userId) {
    try {
      const usage = await CouponUsage.findById(usageId);
      if (!usage) {
        throw new Error('Coupon usage not found');
      }

      if (usage.userId.toString() !== userId) {
        throw new Error('Unauthorized to cancel this coupon usage');
      }

      if (usage.status !== 'applied') {
        throw new Error('Coupon usage cannot be cancelled');
      }

      // Cancel the usage
      await usage.cancel();

      // Note: No need to decrement usage count since we only increment on successful payment

      // Invalidate cache since usage count changed
      this._invalidateCouponCache(usage.couponId);

      // Log transaction
      await TransactionLog.create({
        entityId: usage._id.toString(),
        entityType: 'coupon_usage',
        action: 'coupon_cancelled',
        details: {
          couponId: usage.couponId,
          orderId: usage.orderId,
          planId: usage.planId,
          discountAmount: usage.discountAmount,
        },
      });

      return {
        success: true,
        message: 'Coupon cancelled successfully',
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get coupon usage history for a user
   * @param {string} userId - User ID
   * @param {Object} queryParams - Query parameters
   * @returns {Object} Usage history
   */
  async getUserCouponHistory(userId, queryParams = {}) {
    try {
      const { page = 1, limit = 10 } = queryParams;

      const query = { userId };

      const [usageRecords, total] = await Promise.all([
        CouponUsage.find(query)
          .populate('couponId', 'code type discount_amount description')
          .populate('planId', 'name price duration')
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        CouponUsage.countDocuments(query),
      ]);

      return {
        data: usageRecords,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: limit,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get coupon analytics for system
   * @param {Object} dateRange - Date range for analytics
   * @returns {Object} Analytics data
   */
  async getCouponAnalytics(dateRange = {}) {
    try {
      const { startDate, endDate } = dateRange;
      const query = {};

      if (startDate && endDate) {
        query.createdAt = {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        };
      }

      const [totalUsage, totalDiscount, activeCoupons, expiredCoupons] =
        await Promise.all([
          CouponUsage.countDocuments(query),
          CouponUsage.aggregate([
            { $match: query },
            { $group: { _id: null, total: { $sum: '$discountAmount' } } },
          ]),
          Coupon.countDocuments({
            isDeleted: false,
            status: true,
            end_date: { $gte: new Date() },
          }),
          Coupon.countDocuments({
            isDeleted: false,
            end_date: { $lt: new Date() },
          }),
        ]);

      return {
        totalUsage: totalUsage || 0,
        totalDiscount: totalDiscount[0]?.total || 0,
        activeCoupons,
        expiredCoupons,
        averageDiscount:
          totalUsage > 0 ? (totalDiscount[0]?.total || 0) / totalUsage : 0,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Soft delete coupon
   * @param {string} id - Coupon ID
   * @returns {Object} Soft deleted coupon
   */
  async softDeleteById(id) {
    try {
      this.validateObjectId(id);

      const coupon = await Coupon.findOneAndUpdate(
        { _id: id, isDeleted: false },
        {
          $set: {
            isDeleted: true,
            deletedAt: new Date(),
            status: false, // Also deactivate the coupon
          },
        },
        { new: true },
      );

      if (!coupon) {
        throw new Error('Coupon not found');
      }

      // Invalidate cache
      this._invalidateCouponCache(coupon.code);

      return coupon;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Auto-deactivate expired coupons
   * @returns {Object} Cleanup result
   */
  async cleanupExpiredCoupons() {
    try {
      const result = await Coupon.updateMany(
        {
          isDeleted: false,
          end_date: { $lt: new Date() },
          status: true,
        },
        {
          status: false,
        },
      );

      return {
        success: true,
        deactivatedCount: result.modifiedCount,
        message: `${result.modifiedCount} expired coupons deactivated`,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get coupons applicable to a specific plan
   * @param {string} planId - Plan ID
   * @param {Object} options - Optional filters
   * @param {boolean} options.includeGlobal - Include coupons with no specific plans (default: true)
   * @param {boolean} options.onlyActive - Only include active & in-date coupons (default: true)
   * @returns {Array} Coupons
   */
  async getCouponsByPlan(planId, options = {}) {
    try {
      const { includeGlobal = true, onlyActive = true } = options;

      const now = new Date();
      const query = { isDeleted: false };

      const planFilter = includeGlobal
        ? { $or: [{ plans: { $size: 0 } }, { plans: planId }] }
        : { plans: planId };

      Object.assign(query, planFilter);

      if (onlyActive) {
        Object.assign(query, {
          status: true,
          start_date: { $lte: now },
          end_date: { $gte: now },
        });
      }

      const coupons = await Coupon.find(query)
        .select(
          'code type discount_amount description status start_date end_date plans applicableFor maxUsagePerUser usageCount',
        )
        .sort({ createdAt: -1 })
        .lean();

      return coupons;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Bulk update the status field for multiple coupons
   * @param {Array<string>} ids - Array of document ObjectIds
   * @param {boolean} status - Status value to set
   * @param {Object} options - Optional options { session }
   * @returns {Promise<{ matchedCount: number, modifiedCount: number, skippedExpired: number }>} Result summary
   */
  async bulkUpdateStatus(ids = [], status, options = {}) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new Error('ids must be a non-empty array');
    }
    if (typeof status !== 'boolean') {
      throw new Error('status must be a boolean');
    }

    // Validate ids format early for clearer errors
    for (const id of ids) {
      this.validateObjectId(id);
    }

    const Model = await this.getModelRef();
    const update = { $set: { status } };

    // Calculate end of today for the expiration check
    const now = new Date();
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    // Only update non-expired coupons (end_date is still today or in the future)
    const filter = {
      _id: { $in: ids },
      isDeleted: false,
      end_date: { $gte: now },
    };

    // Count how many are expired before update
    const expiredCount = await Model.countDocuments({
      _id: { $in: ids },
      isDeleted: false,
      end_date: { $lt: now },
    });

    const result = await Model.updateMany(filter, update, {
      session: options.session || undefined,
      runValidators: true,
    });

    // Invalidate cache for affected coupons
    const affectedCoupons = await Model.find(filter).select('code');
    affectedCoupons.forEach((coupon) => {
      this._invalidateCouponCache(coupon.code);
    });

    return {
      matchedCount: result.matchedCount || 0,
      modifiedCount: result.modifiedCount || 0,
      skippedExpired: expiredCount,
    };
  }

  /**
   * Bulk soft delete coupons by ids
   * @param {Array<string>} ids - Array of document ObjectIds
   * @param {Object} options - Optional options { session }
   * @returns {Promise<{ deletedCount: number }>} Result summary
   */
  async bulkDelete(ids = [], options = {}) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new Error('ids must be a non-empty array');
    }
    for (const id of ids) {
      this.validateObjectId(id);
    }

    const Model = await this.getModelRef();
    const filter = { _id: { $in: ids }, isDeleted: false };

    // Get coupons to invalidate cache
    const affectedCoupons = await Model.find(filter).select('code');

    const result = await Model.updateMany(
      filter,
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
          status: false, // Also deactivate the coupons
        },
      },
      { session: options.session || undefined },
    );

    // Invalidate cache for affected coupons
    affectedCoupons.forEach((coupon) => {
      this._invalidateCouponCache(coupon.code);
    });

    return { deletedCount: result.modifiedCount || 0 };
  }

  /**
   * Bulk get coupons by IDs
   * @param {Array<string>} ids - Array of coupon IDs to retrieve
   * @param {Object} options - Optional configuration
   * @param {Boolean} options.lean - Return plain JavaScript objects (default: true)
   * @param {Boolean} options.throwOnNotFound - Throw error if any ID not found (default: false)
   * @returns {Promise<Object>} Object containing:
   *   - coupons: Array of found coupons
   *   - found: Number of coupons found
   *   - notFound: Array of IDs that were not found
   *   - totalRequested: Total number of IDs requested
   */
  async bulkGetCoupons(ids, options = {}) {
    try {
      // Validate input
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('Coupon IDs array is required and must not be empty');
      }

      // Extract options with defaults
      const {
        lean = true,
        throwOnNotFound = false,
      } = options;

      // Use BaseService bulkGetByIds with coupon-specific populate
      const result = await this.bulkGetByIds(ids, {
        populate: {
          path: 'plans',
          select: 'name price duration status',
        },
        lean,
        throwOnNotFound,
      });

      // Return with renamed 'documents' to 'data' for consistency
      return {
        data: result.documents,
        found: result.found,
        notFound: result.notFound,
        totalRequested: result.totalRequested,
      };
    } catch (error) {
      throw new Error(`Bulk get coupons failed: ${error.message}`);
    }
  }

  async deleteById(id) {
    return this.softDeleteById(id);
  }
}

export default CouponServices;
