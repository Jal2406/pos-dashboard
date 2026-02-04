import { BaseService } from '../utils/index.js';
import { TenantCouponSchema } from '../models/index.js';
import { CustomerSchema } from '../models/index.js';
import TenantNotificationDispatcher from './tenantNotification/notificationDispatcher.service.js';
import mongoose from 'mongoose';

// Simple in-memory cache for frequently accessed tenant coupons
const couponCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const DEFAULT_COUPON_TEMPLATE_LABEL = 'coupon_receive';
const EMAIL_BATCH_SIZE = 50;

/**
 * Tenant Coupon Service
 *
 * Enterprise-grade service for managing tenant-specific coupon operations.
 * Extends BaseService to provide comprehensive CRUD operations and additional business logic.
 *
 * @class TenantCouponServices
 * @extends BaseService
 */
class TenantCouponServices extends BaseService {
  /**
   * Initialize Tenant Coupon Service with tenant-specific database support
   * @param {String} businessId - Business/tenant ID for multi-tenant isolation
   * @param {Object} options - Optional configuration
   */
  constructor(businessId, options = {}) {
    if (!businessId) {
      throw new Error('TenantCouponServices initialized without businessId');
    }
    super({
      modelName: 'TenantCoupon',
      schema: TenantCouponSchema,
      collection: 'tenantcoupons',
      businessId,
    });

    // Cache the model reference to avoid repeated resolution
    this._modelRef = null;
  }

  /**
   * Get cached model reference for better performance
   * @returns {Promise<Model>} Cached model reference
   */
  async getModelRef() {
    if (!this._modelRef) {
      this._modelRef = await this.getModel();
    }
    return this._modelRef;
  }

  /**
   * Create a new tenant coupon with validation
   * @param {Object} data - Coupon data
   * @param {Object} options - Optional options
   * @returns {Promise<Object>} Created coupon
   */
  async create(data, options = {}) {
    const { notificationContext = {}, ...createOptions } = options || {};
    const {
      couponPayload,
      notificationOptions,
      notificationContext: inlineNotificationContext,
    } = this._splitNotificationOptions(data);

    const mergedNotificationContext = {
      ...(notificationContext || {}),
      ...(inlineNotificationContext || {}),
    };

    // Normalize and validate discount inputs before creation
    const payload = { ...couponPayload };

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

    // Validate date range
    if (payload.start_date && payload.end_date) {
      const startDate = new Date(payload.start_date);
      const endDate = new Date(payload.end_date);

      if (startDate >= endDate) {
        throw new Error('end_date must be after start_date');
      }
    }

    // Validate limit
    if (payload.limit !== undefined) {
      payload.limit = Number(payload.limit);
      if (Number.isNaN(payload.limit) || payload.limit < 1) {
        throw new Error('limit must be a positive number');
      }
    }

    // Validate maxUsagePerUser
    if (payload.maxUsagePerUser !== undefined) {
      payload.maxUsagePerUser = Number(payload.maxUsagePerUser);
      if (
        Number.isNaN(payload.maxUsagePerUser) ||
        payload.maxUsagePerUser < 1
      ) {
        throw new Error('maxUsagePerUser must be a positive number');
      }
    }

    // Validate customer scope and assigned customers
    if (payload.customerScope === 'Specific') {
      if (
        !payload.assignedCustomerIds ||
        !Array.isArray(payload.assignedCustomerIds) ||
        payload.assignedCustomerIds.length === 0
      ) {
        throw new Error(
          'assignedCustomerIds is required when customerScope is Specific',
        );
      }
    } else if (payload.customerScope === 'All') {
      payload.assignedCustomerIds = [];
    }

    // Check for duplicate code within tenant
    if (payload.code) {
      const Model = await this.getModelRef();
      const existingCoupon = await Model.findOne({
        code: payload.code.toUpperCase(),
        isDeleted: false,
      });

      if (existingCoupon) {
        throw new Error('Coupon code already exists');
      }
    }

    const createdCoupon = await super.create(payload, createOptions);

    if (notificationOptions.sendEmail) {
      console.log('Sending coupon notifications...');
      this._dispatchCouponNotifications({
        coupon: createdCoupon,
        notificationOptions,
        notificationContext: mergedNotificationContext,
      }).catch((err) => {
        console.error(
          '[TenantCouponServices] Failed to dispatch coupon notifications (async):',
          err,
        );
      });
    }

    return createdCoupon;
  }

  /**
   * Update tenant coupon by ID with validation
   * @param {String} id - Coupon ID
   * @param {Object} data - Update data
   * @returns {Promise<Object>} Updated coupon
   */
  async updateById(id, data, options = {}) {
    const { notificationContext = {}, ...updateOptions } = options || {};
    const {
      couponPayload,
      notificationOptions,
      notificationContext: inlineNotificationContext,
    } = this._splitNotificationOptions(data);

    const mergedNotificationContext = {
      ...(notificationContext || {}),
      ...(inlineNotificationContext || {}),
    };

    const payload = { ...couponPayload };

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

    // Percentage validation
    if (
      payload.type === 'Percentage' &&
      payload.discount_amount !== undefined
    ) {
      if (payload.discount_amount > 100) {
        throw new Error('Percentage discount cannot exceed 100');
      }
    }

    // Validate date range if both dates are provided
    if (payload.start_date && payload.end_date) {
      const startDate = new Date(payload.start_date);
      const endDate = new Date(payload.end_date);

      if (startDate >= endDate) {
        throw new Error('end_date must be after start_date');
      }
    }

    // Validate limit
    if (payload.limit !== undefined) {
      payload.limit = Number(payload.limit);
      if (Number.isNaN(payload.limit) || payload.limit < 1) {
        throw new Error('limit must be a positive number');
      }
    }

    // Validate maxUsagePerUser
    if (payload.maxUsagePerUser !== undefined) {
      payload.maxUsagePerUser = Number(payload.maxUsagePerUser);
      if (
        Number.isNaN(payload.maxUsagePerUser) ||
        payload.maxUsagePerUser < 1
      ) {
        throw new Error('maxUsagePerUser must be a positive number');
      }
    }

    // Validate customer scope
    if (payload.customerScope === 'Specific') {
      if (
        payload.assignedCustomerIds &&
        (!Array.isArray(payload.assignedCustomerIds) ||
          payload.assignedCustomerIds.length === 0)
      ) {
        throw new Error(
          'assignedCustomerIds must be a non-empty array when customerScope is Specific',
        );
      }
    } else if (payload.customerScope === 'All') {
      payload.assignedCustomerIds = [];
    }

    // Check for duplicate code within tenant (excluding current coupon)
    if (payload.code) {
      const Model = await this.getModelRef();
      const existingCoupon = await Model.findOne({
        code: payload.code.toUpperCase(),
        isDeleted: false,
        _id: { $ne: id },
      });

      if (existingCoupon) {
        throw new Error('Coupon code already exists');
      }
    }

    const updatedCoupon = await super.updateById(id, payload, updateOptions);

    if (notificationOptions.sendEmail) {
      // Re-fetch to ensure we have populated fields if needed, or use updatedCoupon if sufficient
      // Ideally dispatch logic should handle normalized data
      this._dispatchCouponNotifications({
        coupon: updatedCoupon,
        notificationOptions,
        notificationContext: mergedNotificationContext,
      }).catch((err) => {
        console.error(
          '[TenantCouponServices] Failed to dispatch update notifications (async):',
          err,
        );
      });
    }

    return updatedCoupon;
  }

  /**
   * Get cached coupon or fetch from database
   * @param {string} couponCode - Coupon code
   * @returns {Object|null} Cached coupon or null
   */
  _getCachedCoupon(couponCode) {
    const cacheKey = `coupon_${this.businessId}_${couponCode.toUpperCase()}`;
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
    const cacheKey = `coupon_${this.businessId}_${couponCode.toUpperCase()}`;
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
    const cacheKey = `coupon_${this.businessId}_${couponCode.toUpperCase()}`;
    couponCache.delete(cacheKey);
  }

  /**
   * Get cache statistics for monitoring
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    const tenantKeys = Array.from(couponCache.keys()).filter((key) =>
      key.startsWith(`coupon_${this.businessId}_`),
    );
    return {
      size: tenantKeys.length,
      maxAge: CACHE_TTL,
      keys: tenantKeys,
    };
  }

  /**
   * Fetch all active coupons (status true, within date range, usage below limit)
   * @param {Object} [filters={}] - Optional filters (e.g., type)
   * @returns {Promise<Array>} Active coupons
   */
  async getActiveCoupons(filters = {}) {
    const Model = await this.getModelRef();
    const now = new Date();

    const query = {
      isDeleted: false,
      status: true,
      start_date: { $lte: now },
      end_date: { $gte: now },
    };

    if (filters.type) {
      query.type = filters.type;
    }

    const projection = {
      code: 1,
      description: 1,
      start_date: 1,
      end_date: 1,
      type: 1,
      discount_amount: 1,
      limit: 1,
      status: 1,
      usageCount: 1,
      maxUsagePerUser: 1,
      createdAt: 1,
      updatedAt: 1,
    };

    const coupons = await Model.find(query)
      .select(projection)
      .sort({ start_date: 1 })
      .lean()
      .exec();

    // Filter out coupons that have exhausted their usage limit
    return coupons.filter((coupon) => coupon.usageCount < coupon.limit);
  }

  /**
   * List tenant coupons with filtering and pagination
   * Optimized for high performance with lean queries and efficient filtering
   * @param {Object} queryParams - Query parameters
   * @returns {Promise<Object>} Paginated coupon list
   */
  async list(queryParams = {}) {
    const {
      status,
      type,
      activeOn,
      isActive,
      page = 1,
      limit = 10,
      search = '',
      sortBy = 'createdAt',
      sortOrder = 'desc',
      ...otherParams
    } = queryParams;

    const Model = await this.getModelRef();
    const now = new Date();

    // Validate pagination
    const validatedPage = Math.max(1, parseInt(page, 10) || 1);
    const validatedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const skip = (validatedPage - 1) * validatedLimit;

    // Build optimized filters - avoid $expr for index utilization
    const filters = { isDeleted: { $ne: true } };

    // Handle isActive filter with optimized approach
    let requiresUsageLimitFilter = false;
    let usageLimitFilterType = null; // 'active' or 'inactive'

    if (isActive !== undefined) {
      const isActiveValue = isActive === 'true' || isActive === true;

      if (isActiveValue) {
        // Active coupons: status=true AND within date range
        // Usage limit check done post-query for better index usage
        filters.status = true;
        filters.start_date = { $lte: now };
        filters.end_date = { $gte: now };
        requiresUsageLimitFilter = true;
        usageLimitFilterType = 'active';
      } else {
        // Inactive: status=false OR outside date range
        // Simplified $or without $expr for better performance
        filters.$or = [
          { status: false },
          { start_date: { $gt: now } },
          { end_date: { $lt: now } },
        ];
        requiresUsageLimitFilter = true;
        usageLimitFilterType = 'inactive';
      }
    } else if (status !== undefined) {
      filters.status = status === 'true' || status === true;
    }

    if (type) {
      filters.type = type;
    }

    // Active on date filter
    if (activeOn) {
      const date = new Date(activeOn);
      filters.start_date = { $lte: date };
      filters.end_date = { $gte: date };
    }

    // Add search functionality
    if (search) {
      const searchRegex = { $regex: search, $options: 'i' };
      filters.$or = filters.$or
        ? [...filters.$or, { code: searchRegex }, { description: searchRegex }]
        : [{ code: searchRegex }, { description: searchRegex }];
    }

    // Build sort object
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    // Optimized projection - only fetch needed fields
    const projection = {
      code: 1,
      description: 1,
      start_date: 1,
      end_date: 1,
      type: 1,
      discount_amount: 1,
      limit: 1,
      status: 1,
      usageCount: 1,
      maxUsagePerUser: 1,
      createdAt: 1,
      updatedAt: 1,
    };

    // Execute query based on whether we need usage limit filtering
    let documents;
    let total;

    if (requiresUsageLimitFilter) {
      // For usage limit filtering, we need to fetch more and filter in JS
      // This is faster than using $expr which prevents index usage
      const overFetchLimit = validatedLimit * 3; // Fetch 3x to account for filtered items

      const [allDocs, countResult] = await Promise.all([
        Model.find(filters)
          .select(projection)
          .sort(sort)
          .limit(skip + overFetchLimit)
          .lean()
          .exec(),
        Model.countDocuments(filters),
      ]);

      // Apply usage limit filter in memory
      let filteredDocs;
      if (usageLimitFilterType === 'active') {
        // Active: usageCount < limit
        filteredDocs = allDocs.filter((doc) => doc.usageCount < doc.limit);
      } else {
        // Inactive: also include those where usageCount >= limit
        const usageLimitExceeded = allDocs.filter(
          (doc) => doc.usageCount >= doc.limit
        );
        // For inactive, $or already handles status/date, add usage exceeded ones
        filteredDocs = [...allDocs, ...usageLimitExceeded];
        // Remove duplicates
        const seen = new Set();
        filteredDocs = filteredDocs.filter((doc) => {
          const id = doc._id.toString();
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        });
      }

      // Apply pagination to filtered results
      documents = filteredDocs.slice(skip, skip + validatedLimit);
      total = filteredDocs.length;
    } else {
      // Standard query without usage limit filtering - fully optimized
      [documents, total] = await Promise.all([
        Model.find(filters)
          .select(projection)
          .sort(sort)
          .skip(skip)
          .limit(validatedLimit)
          .lean()
          .exec(),
        Model.countDocuments(filters),
      ]);
    }

    return {
      data: documents,
      pagination: {
        currentPage: validatedPage,
        totalPages: Math.ceil(total / validatedLimit),
        totalItems: total,
        itemsPerPage: validatedLimit,
        hasNext: validatedPage * validatedLimit < total,
        hasPrev: validatedPage > 1,
      },
    };
  }

  /**
   * Get coupon by code
   * @param {string} code - Coupon code
   * @returns {Promise<Object|null>} Coupon or null
   */
  async getByCode(code) {
    try {
      // Check cache first
      const cached = this._getCachedCoupon(code);
      if (cached) {
        return cached;
      }

      const Model = await this.getModelRef();
      const coupon = await Model.findOne({
        code: code.toUpperCase(),
        isDeleted: false,
      }).lean();

      if (coupon) {
        // Cache the coupon
        this._cacheCoupon(code, coupon);
      }

      return coupon;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Validate and get active coupon by code
   * @param {string} code - Coupon code
   * @param {string} [customerId] - Optional customer ID to check eligibility
   * @returns {Promise<Object>} Validated coupon
   */
  async validateCoupon(code, customerId = null) {
    try {
      const Model = await this.getModelRef();
      const coupon = await Model.findOne({
        code: code.toUpperCase(),
        isDeleted: false,
      });

      if (!coupon) {
        throw new Error('Coupon not found');
      }

      const now = new Date();

      // Check if coupon is active
      if (!coupon.status) {
        throw new Error('Coupon is inactive');
      }

      // Check if coupon is expired
      if (now > coupon.end_date) {
        throw new Error('Coupon has expired');
      }

      // Check if coupon has started
      if (now < coupon.start_date) {
        throw new Error('Coupon has not started yet');
      }

      // Check if global usage limit reached
      if (coupon.usageCount >= coupon.limit) {
        throw new Error('Coupon usage limit has been reached');
      }

      // Check customer eligibility if customerId is provided
      if (customerId) {
        // Check if customer is allowed to use this coupon (scope check)
        if (!coupon.canBeUsedByCustomer(customerId)) {
          throw new Error('This coupon is not valid for this customer');
        }

        // Check per-customer usage limit
        if (coupon.hasCustomerReachedLimit(customerId)) {
          const maxUsage = coupon.maxUsagePerUser || 1;
          throw new Error(
            `You have already used this coupon ${maxUsage} time(s). Maximum usage per customer is ${maxUsage}.`,
          );
        }
      }

      return coupon;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Increment coupon usage count (global and per-customer)
   * @param {string} couponId - Coupon ID
   * @param {Object} options - Options including session and customerId
   * @param {Object} options.session - Mongoose session for transaction
   * @param {string} options.customerId - Customer ID for per-customer tracking
   * @returns {Promise<Object>} Updated coupon
   */
  async incrementUsage(couponId, options = {}) {
    try {
      const Model = await this.getModelRef();
      const coupon = await Model.findById(couponId).session(options.session);

      if (!coupon) {
        throw new Error('Coupon not found');
      }

      if (coupon.usageCount >= coupon.limit) {
        throw new Error('Coupon usage limit has been reached');
      }

      // Check per-customer limit if customerId provided
      if (options.customerId) {
        if (coupon.hasCustomerReachedLimit(options.customerId)) {
          const maxUsage = coupon.maxUsagePerUser || 1;
          throw new Error(
            `Customer has already used this coupon ${maxUsage} time(s). Maximum usage per customer is ${maxUsage}.`,
          );
        }
        // Increment per-customer usage
        coupon.incrementCustomerUsage(options.customerId);
      }

      // Increment global usage
      coupon.usageCount += 1;
      await coupon.save({ session: options.session });

      // Invalidate cache
      this._invalidateCouponCache(coupon.code);

      return coupon;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Calculate discount for an order amount
   * @param {string} couponId - Coupon ID
   * @param {number} orderAmount - Order amount
   * @returns {Promise<number>} Discount amount
   */
  async calculateDiscount(couponId, orderAmount) {
    try {
      const Model = await this.getModelRef();
      const coupon = await Model.findById(couponId);

      if (!coupon) {
        throw new Error('Coupon not found');
      }

      return coupon.calculateDiscount(orderAmount);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Soft delete coupon
   * @param {string} id - Coupon ID
   * @returns {Promise<Object>} Soft deleted coupon
   */
  async softDeleteById(id) {
    try {
      const Model = await this.getModelRef();
      const coupon = await Model.findByIdAndUpdate(
        id,
        {
          isDeleted: true,
          deletedAt: new Date(),
          status: false, // Also deactivate the coupon
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
   * @returns {Promise<Object>} Cleanup result
   */
  async cleanupExpiredCoupons() {
    try {
      const Model = await this.getModelRef();
      const result = await Model.updateMany(
        {
          isDeleted: false,
          end_date: { $lt: new Date() },
          status: true,
        },
        {
          status: false,
        },
      );

      // Invalidate cache for all affected coupons
      const affectedCoupons = await Model.find({
        isDeleted: false,
        end_date: { $lt: new Date() },
        status: false,
      }).select('code');

      affectedCoupons.forEach((coupon) => {
        this._invalidateCouponCache(coupon.code);
      });

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
   * Get coupon analytics for tenant
   * @param {Object} dateRange - Date range for analytics
   * @returns {Promise<Object>} Analytics data
   */
  async getCouponAnalytics(dateRange = {}) {
    try {
      const { startDate, endDate } = dateRange;
      const Model = await this.getModelRef();
      const query = { isDeleted: false };

      if (startDate && endDate) {
        query.createdAt = {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        };
      }

      const [totalCoupons, activeCoupons, expiredCoupons] = await Promise.all([
        Model.countDocuments(query),
        Model.countDocuments({
          ...query,
          status: true,
          end_date: { $gte: new Date() },
        }),
        Model.countDocuments({
          ...query,
          end_date: { $lt: new Date() },
        }),
      ]);

      // Calculate total usage and average usage
      const usageStats = await Model.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            totalUsage: { $sum: '$usageCount' },
            avgUsage: { $avg: '$usageCount' },
          },
        },
      ]);

      return {
        totalCoupons: totalCoupons || 0,
        activeCoupons,
        expiredCoupons,
        totalUsage: usageStats[0]?.totalUsage || 0,
        averageUsage: usageStats[0]?.avgUsage || 0,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Bulk update the status field for multiple coupons
   * @param {Array<string>} ids - Array of document ObjectIds
   * @param {boolean} status - Status value to set
   * @param {Object} options - Optional options { session }
   * @returns {Promise<{ matchedCount: number, modifiedCount: number }>} Result summary
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
    const filter = { _id: { $in: ids }, isDeleted: false };

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
   * @param {Array<string>} ids - Array of coupon IDs
   * @param {Object} [options={}] - Options
   * @param {Boolean} [options.lean=true] - Return lean documents
   * @param {Boolean} [options.throwOnNotFound=false] - Throw error if any ID not found
   * @returns {Object} Result with found documents and metadata
   * @throws {Error} If retrieval fails
   */
  async bulkGetCoupons(ids, options = {}) {
    try {
      const { lean = true, throwOnNotFound = false } = options;

      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('IDs array is required and must not be empty');
      }

      // Validate and normalize IDs
      const validIds = ids.filter((id) => {
        try {
          this.validateObjectId(id);
          return true;
        } catch {
          return false;
        }
      });

      if (throwOnNotFound && validIds.length !== ids.length) {
        throw new Error('Some IDs are invalid');
      }

      const Model = await this.getModelRef();
      const filter = {
        _id: { $in: validIds },
        isDeleted: false,
      };

      let query = Model.find(filter);

      if (lean) {
        query = query.lean({ virtuals: true });
      }

      const documents = await query.exec();

      return {
        data: documents,
        found: documents.length,
        totalRequested: validIds.length,
      };
    } catch (error) {
      throw new Error(`Error bulk getting coupons: ${error.message}`, {
        cause: error,
      });
    }
  }

  async _dispatchCouponNotifications({
    coupon,
    notificationOptions,
    notificationContext = {},
  }) {
    if (!notificationOptions?.sendEmail) {
      return null;
    }

    if (!this.businessId) {
      console.warn(
        '[TenantCouponServices] Missing businessId; skipping notification dispatch.',
      );
      return null;
    }

    const normalizedCoupon =
      coupon && typeof coupon.toObject === 'function'
        ? coupon.toObject()
        : coupon;

    try {
      const recipients = await this._resolveCouponRecipients({
        coupon: normalizedCoupon,
        notificationOptions,
      });

      if (!recipients.length) {
        console.warn(
          '[TenantCouponServices] No eligible recipients found for coupon notification.',
        );
        return null;
      }

      const batches = this._chunkArray(
        recipients,
        notificationOptions.batchSize,
      );
      const results = [];

      for (const batch of batches) {
        const settled = await Promise.allSettled(
          batch.map((recipient) =>
            this._sendCouponEmail({
              recipient,
              coupon: normalizedCoupon,
              notificationOptions,
              notificationContext,
            }),
          ),
        );
        results.push(...settled);
      }

      return results;
    } catch (error) {
      console.error(
        '[TenantCouponServices] Failed to dispatch coupon notifications:',
        error,
      );
      return null;
    }
  }

  async _resolveCouponRecipients({ coupon, notificationOptions }) {
    if (notificationOptions?.overrideRecipients?.length) {
      return notificationOptions.overrideRecipients;
    }

    return this._fetchCustomersForScope(coupon);
  }

  async _fetchCustomersForScope(coupon) {
    try {
      const CustomerModel = await this.getModel(
        'Customer',
        CustomerSchema,
        'customers',
      );

      if (!CustomerModel) {
        return [];
      }

      const baseQuery = {
        isDeleted: false,
        email: { $exists: true, $ne: '' },
      };

      if (coupon.customerScope === 'All') {
        baseQuery.isActive = true;
      } else {
        const assignedIds =
          coupon.assignedCustomerIds?.map((id) =>
            id?.toString ? id.toString() : String(id),
          ) || [];

        if (!assignedIds.length) {
          return [];
        }

        baseQuery._id = { $in: assignedIds };
      }

      const customers = await CustomerModel.find(baseQuery, {
        customerName: 1,
        email: 1,
        phone: 1,
      }).lean();

      return (
        customers?.map((customer) => ({
          customerName: customer.customerName,
          email: customer.email,
          phone: customer.phone,
        })) || []
      );
    } catch (error) {
      console.error(
        '[TenantCouponServices] Failed to fetch customers for notification scope:',
        error,
      );
      return [];
    }
  }

  async _sendCouponEmail({
    recipient,
    coupon,
    notificationOptions,
    notificationContext,
  }) {
    if (!recipient?.email) {
      return null;
    }

    const contextOptions = this._buildNotificationContext({
      recipient,
      coupon,
      notificationOptions,
      notificationContext,
    });

    return TenantNotificationDispatcher.dispatch({
      businessId: this.businessId,
      label: notificationOptions.templateLabel,
      recipientType: notificationOptions.recipientType,
      recipient: { email: recipient.email },
      channels: notificationOptions.channels,
      contextOptions,
    });
  }

  _buildNotificationContext({
    recipient,
    coupon,
    notificationOptions,
    notificationContext,
  }) {
    const sender =
      notificationContext?.sender || notificationOptions?.sender || null;

    const baseContext = {
      ...notificationContext,
      customer: {
        name:
          recipient.customerName ||
          recipient.name ||
          recipient.fullName ||
          '',
        email: recipient.email,
        phone: recipient.phone || '',
      },
      coupon: {
        code: coupon.code,
        discount_amount: coupon.discount_amount,
        type: coupon.type,
        start_date: coupon.start_date,
        end_date: coupon.end_date,
        description: coupon.description,
      },
      metadata: {
        couponId: coupon._id?.toString?.() || coupon.id || '',
        scope: coupon.customerScope,
      },
    };

    if (sender && !baseContext.sender) {
      baseContext.sender = sender;
    }

    return baseContext;
  }

  _chunkArray(list = [], size = EMAIL_BATCH_SIZE) {
    if (!Array.isArray(list) || list.length === 0) {
      return [];
    }

    const chunkSize = size > 0 ? size : EMAIL_BATCH_SIZE;
    const chunks = [];

    for (let i = 0; i < list.length; i += chunkSize) {
      chunks.push(list.slice(i, i + chunkSize));
    }

    return chunks;
  }

  _splitNotificationOptions(payload = {}) {
    if (!payload || typeof payload !== 'object') {
      return {
        couponPayload: {},
        notificationOptions: this._normalizeNotificationOptions(),
        notificationContext: {},
      };
    }

    const {
      options: inlineOptions = {},
      notificationOptions = {},
      notificationContext = {},
      ...couponPayload
    } = payload;

    const mergedNotificationOptions = this._normalizeNotificationOptions({
      ...inlineOptions,
      ...notificationOptions,
    });

    return {
      couponPayload,
      notificationOptions: mergedNotificationOptions,
      notificationContext,
    };
  }

  _normalizeNotificationOptions(options = {}) {
    const sendEmail = Boolean(options.sendEmail || options.sendMail);
    const templateLabel =
      typeof options.templateLabel === 'string' && options.templateLabel.trim()
        ? options.templateLabel.trim()
        : DEFAULT_COUPON_TEMPLATE_LABEL;
    const recipientType =
      typeof options.recipientType === 'string' &&
        options.recipientType.trim()
        ? options.recipientType.trim()
        : 'customer';
    const batchSize =
      Number.isInteger(options.batchSize) && options.batchSize > 0
        ? options.batchSize
        : EMAIL_BATCH_SIZE;

    const channels =
      Array.isArray(options.channels) && options.channels.length
        ? Array.from(
          new Set(
            options.channels
              .filter((channel) => typeof channel === 'string')
              .map((channel) => channel.toLowerCase()),
          ),
        )
        : ['email'];

    const overrideRecipients = Array.isArray(options.recipients)
      ? options.recipients
        .filter((recipient) => recipient && recipient.email)
        .map((recipient) => ({
          customerName:
            recipient.customerName || recipient.name || recipient.fullName || '',
          email: recipient.email,
          phone: recipient.phone || '',
        }))
      : null;

    return {
      sendEmail,
      templateLabel,
      recipientType,
      batchSize,
      channels,
      overrideRecipients,
      sender: options.sender || null,
    };
  }
}

export default TenantCouponServices;
