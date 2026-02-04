import { Plan, Subscription } from '../models/index.js';
import { BaseService } from '../utils/index.js';

class PlanService extends BaseService {
  constructor() {
    super(Plan);
  }

  // Transform plan data for response - combine duration and type
  transformPlanForResponse(plan) {
    if (!plan) {
      return plan;
    }

    // Handle both Mongoose documents and plain objects
    const planData = plan.toObject ? plan.toObject() : plan;

    // Format price with currency separators for display
    let formattedPrice = null;
    if (
      planData.price !== null &&
      planData.price !== undefined &&
      !planData.isTrial
    ) {
      const currency = planData.currencyId;
      if (currency) {
        const thousandSeparator = currency.thousandSeparator || ',';
        const decimalSeparator = currency.decimalSeparator || '.';
        const numberOfDecimals = currency.numberOfDecimals || 2;

        // Format the price with separators
        formattedPrice = this.formatPrice(planData.price, {
          thousandSeparator,
          decimalSeparator,
          numberOfDecimals,
        });
      }
    }

    // Destructure to exclude currencyId from the response
    const { currencyId, ...planDataWithoutCurrencyId } = planData;

    return {
      ...planDataWithoutCurrencyId,
      // Combine duration and type into a single duration string
      duration: `${plan.duration} ${plan.type}`,
      type: plan.type,
      // Add formatted price for display (keep original price for calculations)
      formattedPrice,
      // Only include currency symbol for display
      currency: currencyId
        ? {
          symbol: currencyId.currencySymbol,
          code: currencyId.currencyCode,
          position: currencyId.currencyPosition,
        }
        : null,
    };
  }

  // Helper method to format price with separators
  formatPrice(price, options) {
    const { thousandSeparator, decimalSeparator, numberOfDecimals } = options;

    // Convert to number if it's a string
    const numPrice =
      typeof price === 'string' ? Number.parseFloat(price) : price;

    // Round to specified decimal places
    const roundedPrice =
      Math.round(numPrice * Math.pow(10, numberOfDecimals)) /
      Math.pow(10, numberOfDecimals);

    // Split into integer and decimal parts
    const [integerPart, decimalPart] = roundedPrice
      .toFixed(numberOfDecimals)
      .split('.');

    // Add thousand separators to integer part
    const formattedInteger = integerPart.replaceAll(
      /\B(?=(\d{3})+(?!\d))/g,
      thousandSeparator,
    );

    // Combine integer and decimal parts
    return numberOfDecimals > 0
      ? `${formattedInteger}${decimalSeparator}${decimalPart}`
      : formattedInteger;
  }

  async getById(id) {
    try {
      const plan = await Plan.findOne({ _id: id, isDeleted: false })
        .populate('taxes')
        .populate({
          path: 'currencyId',
          select:
            'currencySymbol currencyCode currencyPosition thousandSeparator decimalSeparator numberOfDecimals',
        });

      if (!plan) {
        throw new Error(`Plan with id ${id} not found`);
      }

      // Filter out trial plans for non-trial context
      if (plan.isTrial) {
        throw new Error(`Plan with id ${id} not found`);
      }

      return this.transformPlanForResponse(plan);
    } catch (error) {
      throw new Error(`Error retrieving plan: ${error.message}`);
    }
  }

  async getAllPlansWithContext(queryParams = {}, context = 'public') {
    const {
      status,
      isActive,
      includeDeleted,
      search = '',
      all,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = queryParams;

    const isSuperAdmin = context === 'superadmin';
    const isPublic = context === 'public';

    // 1. Build Filters
    const filters = {};

    // Handle soft delete filter
    if (includeDeleted !== true && includeDeleted !== 'true') {
      filters.isDeleted = false;
    }

    // Context-specific constraints
    if (isPublic) {
      filters.isTrial = false;
      filters.status = true;
    } else {
      // Non-public contexts (Superadmin or Authenticated Users)

      // Hide trial plans for non-superadmins
      if (!isSuperAdmin) {
        filters.isTrial = false;
      }

      // Apply status filter if provided (supports 'isActive' alias)
      const effectiveStatus = status !== undefined ? status : isActive;
      if (effectiveStatus !== undefined) {
        filters.status = String(effectiveStatus) === 'true';
      }
    }

    // Hide free plans for everyone except Superadmin
    if (!isSuperAdmin) {
      filters.price = { $gt: 0 };
    }

    // 2. Check if non-paginated mode is requested
    if (all === 'true' || all === true) {
      // Non-paginated mode: return all data with filters and search
      const populate = [
        'taxes',
        {
          path: 'currencyId',
          select:
            'currencySymbol currencyCode currencyPosition thousandSeparator decimalSeparator numberOfDecimals',
        },
      ];

      const searchFields = ['name', 'description'];
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

      // Get all plans without pagination
      const Model = await this.getModelRef();
      const rawPlans = await Model.find(filter)
        .sort(sort)
        .populate(populate)
        .exec();
      console.log(rawPlans);
      // 3. Transform Plans & Add Metadata
      const mostPopularPlanId =
        rawPlans.length > 0 ? await this.getMostPopularPlanId() : null;
      console.log(mostPopularPlanId);
      const preparedPlans = rawPlans.reduce((acc, plan) => {
        // Skip invalid plans (non-trial plans must have a currency)
        if (plan.isTrial === false && !plan.currencyId) {
          return acc;
        }
        console.log(preparedPlans);

        const transformed = this.transformPlanForResponse(plan);
        const planId = String(plan._id || plan.id || '');

        acc.push({
          ...transformed,
          isMostPopular: planId === mostPopularPlanId,
        });
        return acc;
      }, []);

      return {
        data: preparedPlans,
        total: preparedPlans.length,
      };
    }

    // 3. Paginated mode: Fetch Data
    const populate = [
      'taxes',
      {
        path: 'currencyId',
        select:
          'currencySymbol currencyCode currencyPosition thousandSeparator decimalSeparator numberOfDecimals',
      },
    ];

    const listResult = await super.list({
      page,
      limit,
      sortBy,
      sortOrder,
      search: String(search || '').trim(),
      searchFields: ['name', 'description'],
      filters,
      populate,
    });

    // 4. Process Response
    let rawPlans = [];
    let pagination = null;

    if (Array.isArray(listResult)) {
      rawPlans = listResult;
    } else if (listResult?.data) {
      rawPlans = listResult.data;
      pagination = listResult.pagination || null;
    } else {
      return listResult;
    }

    // 5. Transform Plans & Add Metadata
    const mostPopularPlanId =
      rawPlans.length > 0 ? await this.getMostPopularPlanId() : null;

    const preparedPlans = rawPlans.reduce((acc, plan) => {
      // Skip invalid plans (non-trial plans must have a currency)
      if (plan.isTrial === false && !plan.currencyId) {
        return acc;
      }

      const transformed = this.transformPlanForResponse(plan);
      const planId = String(plan._id || plan.id || '');

      acc.push({
        ...transformed,
        isMostPopular: planId === mostPopularPlanId,
      });
      return acc;
    }, []);

    if (pagination) {
      return {
        data: preparedPlans,
        pagination,
      };
    }
    return preparedPlans;
  }

  async getMostPopularPlanId() {
    const result = await Subscription.aggregate([
      {
        $match: {
          planName: { $ne: null },
          status: true,
        },
      },
      {
        $group: {
          _id: '$planName',
          subscriptionCount: { $sum: 1 },
        },
      },
      {
        $sort: { subscriptionCount: -1 },
      },
      {
        $limit: 1,
      },
    ]);

    if (!Array.isArray(result) || result.length === 0) {
      return null;
    }
    return String(result[0]._id);
  }

  normalizeDiscountFields(data) {
    if (data.discount !== undefined) {
      data.discount = Number(data.discount);
      if (Number.isNaN(data.discount) || data.discount < 0) {
        throw new RangeError('Discount must be a non-negative number');
      }
    }

    if (data.discountType !== undefined) {
      const normalizedType = String(data.discountType).toLowerCase();
      const allowedTypes = new Set(['percentage', 'fixed']);
      if (!allowedTypes.has(normalizedType)) {
        throw new TypeError(
          "discountType must be either 'percentage' or 'fixed'",
        );
      }
      data.discountType = normalizedType;
    }

    if (data.discountType === 'percentage' && data.discount !== undefined) {
      if (data.discount > 100) {
        throw new RangeError('Percentage discount cannot exceed 100');
      }
    }
  }

  normalizeDuration(data) {
    if (data.duration === undefined) {
      return;
    }
    data.duration = Number(data.duration);
    if (!Number.isInteger(data.duration) || data.duration <= 0) {
      throw new RangeError('Duration must be a positive integer');
    }
  }

  enforceTrialConstraints(data) {
    if (data.isTrial === true) {
      data.discount = 0;
      data.discountType = 'fixed';
    }
  }

  extractProvidedTotalPrice(data) {
    if (data.totalPrice === undefined) {
      return undefined;
    }

    const provided = Number(data.totalPrice);
    if (Number.isNaN(provided)) {
      throw new TypeError('totalPrice must be a valid number');
    }
    delete data.totalPrice;
    return provided;
  }

  assertTotalPriceMatch(provided, expected) {
    if (provided === undefined) {
      return;
    }
    const difference = Math.abs(provided - expected);
    if (difference > 0.01) {
      throw new RangeError(
        'Provided totalPrice does not match calculated total price',
      );
    }
  }

  async preparePlanPayload(rawData, options = {}) {
    const { existingPlan = null } = options;
    const data = { ...rawData };

    // Remove any non-model fields
    if (data.durationType) {
      delete data.durationType;
    }

    this.normalizeDiscountFields(data);
    this.normalizeDuration(data);
    this.enforceTrialConstraints(data);

    // Remove currencyId from data - it will be set automatically by the model middleware
    if (data.currencyId) {
      delete data.currencyId;
    }

    const providedTotalPrice = this.extractProvidedTotalPrice(data);

    const baseDoc = existingPlan
      ? new Plan(existingPlan.toObject())
      : new Plan();
    baseDoc.set(data);

    const expectedTotalPrice = await baseDoc.calculateTotalPrice();

    this.assertTotalPriceMatch(providedTotalPrice, expectedTotalPrice);

    return {
      ...data,
      totalPrice: expectedTotalPrice,
    };
  }

  async create(data) {
    try {
      const preparedData = await this.preparePlanPayload(data);

      // Create plan with population in single query
      const populatedPlan = await Plan.create(preparedData);
      await populatedPlan.populate([
        'taxes',
        {
          path: 'currencyId',
          select:
            'currencySymbol currencyCode currencyPosition thousandSeparator decimalSeparator numberOfDecimals',
        },
      ]);
      return this.transformPlanForResponse(populatedPlan);
    } catch (error) {
      throw new Error(`Error creating plan: ${error.message}`);
    }
  }

  async updateById(id, data) {
    try {
      const existingPlan = await Plan.findOne({
        _id: id,
        isDeleted: false,
      });

      if (!existingPlan) {
        throw new Error(`Plan with id ${id} not found`);
      }

      const preparedData = await this.preparePlanPayload(data, {
        existingPlan,
      });

      // Update plan with population in single query
      const populatedPlan = await Plan.findOneAndUpdate(
        { _id: id, isDeleted: false },
        preparedData,
        {
          new: true,
          runValidators: true,
        },
      )
        .populate('taxes')
        .populate({
          path: 'currencyId',
          select:
            'currencySymbol currencyCode currencyPosition thousandSeparator decimalSeparator numberOfDecimals',
        });

      if (!populatedPlan) {
        throw new Error(`Plan with id ${id} not found`);
      }

      return this.transformPlanForResponse(populatedPlan);
    } catch (error) {
      throw new Error(`Error updating plan: ${error.message}`);
    }
  }

  async trialdays() {
    try {
      const plan = await Plan.findOne({ isTrial: true, isDeleted: false });
      if (!plan) {
        throw new Error('Trial plan not found');
      }
      return plan.duration;
    } catch (error) {
      console.log(error);
      throw new Error(`Error getting trial days: ${error.message}`);
    }
  }

  async updateTrialPlan(data) {
    try {
      const allowedFields = new Set(['duration', 'description']);
      const updateData = Object.fromEntries(
        Object.entries(data).filter(([key]) => allowedFields.has(key)),
      );

      // Ensure duration is a number
      if (updateData.duration !== undefined) {
        updateData.duration = Number(updateData.duration);
        if (
          !Number.isInteger(updateData.duration) ||
          updateData.duration <= 0
        ) {
          throw new RangeError('Duration must be a positive integer');
        }
      }

      // Enforce trial integrity
      updateData.isTrial = true;
      updateData.price = 0;
      updateData.currencyId = null;

      // Update trial plan
      const plan = await Plan.findOneAndUpdate(
        { isTrial: true, isDeleted: false },
        { $set: updateData },
        { new: true, lean: true },
      );

      if (!plan) {
        throw new Error('Trial plan not found');
      }

      return this.transformPlanForResponse(plan);
    } catch (error) {
      console.log(error);
      throw new Error(`Error updating trial plan: ${error.message}`);
    }
  }

  async getTrialPlan() {
    try {
      // Use aggregation for better performance
      const result = await Plan.aggregate([
        { $match: { isTrial: true, isDeleted: false } },
        { $project: { description: 1, duration: 1 } },
        { $limit: 1 },
      ]);

      if (!result.length) {
        throw new Error('Trial plan not found');
      }

      return result[0];
    } catch (error) {
      throw new Error(`Error getting trial plan: ${error.message}`);
    }
  }

  /**
   * Bulk update the status field for multiple plans
   * @param {Array<string>} ids - Array of document ObjectIds
   * @param {boolean} status - Status value to set
   * @param {Object} options - Optional options { session }
   * @returns {Promise<{ matchedCount: number, modifiedCount: number }>} Result summary
   */
  async bulkUpdateStatus(ids, status, options = {}) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new TypeError('ids must be a non-empty array');
    }
    if (typeof status !== 'boolean') {
      throw new TypeError('status must be a boolean');
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

    return {
      matchedCount: result.matchedCount || 0,
      modifiedCount: result.modifiedCount || 0,
    };
  }

  /**
   * Bulk delete plans by ids
   * @param {Array<string>} ids - Array of document ObjectIds
   * @param {Object} options - Optional options { session }
   * @returns {Promise<{ deletedCount: number }>} Result summary
   */
  async bulkDelete(ids, options = {}) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new TypeError('ids must be a non-empty array');
    }
    for (const id of ids) {
      this.validateObjectId(id);
    }

    const Model = await this.getModelRef();
    const result = await Model.updateMany(
      { _id: { $in: ids }, isDeleted: false },
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
        },
      },
      { session: options.session || undefined },
    );

    return { deletedCount: result.modifiedCount || 0 };
  }

  /**
   * Bulk get plans by IDs
   * @param {Array<string>} ids - Array of plan IDs to retrieve
   * @param {Object} options - Optional configuration
   * @param {Boolean} options.lean - Return plain JavaScript objects (default: true)
   * @param {Boolean} options.throwOnNotFound - Throw error if any ID not found (default: false)
   * @returns {Promise<Object>} Object containing:
   *   - plans: Array of found plans with transformed data
   *   - found: Number of plans found
   *   - notFound: Array of IDs that were not found
   *   - totalRequested: Total number of IDs requested
   */
  async bulkGetPlans(ids, options = {}) {
    try {
      // Validate input
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('Plan IDs array is required and must not be empty');
      }

      // Extract options with defaults
      const { lean = true, throwOnNotFound = false } = options;

      // Use BaseService bulkGetByIds with plan-specific populate
      const result = await this.bulkGetByIds(ids, {
        populate: [
          'taxes',
          {
            path: 'currencyId',
            select:
              'currencySymbol currencyCode currencyPosition thousandSeparator decimalSeparator numberOfDecimals',
          },
        ],
        lean,
        throwOnNotFound,
      });

      // Transform plans for response
      const transformedPlans = result.documents.map((plan) =>
        this.transformPlanForResponse(plan),
      );

      // Return with renamed 'documents' to 'plans' for clarity
      return {
        plans: transformedPlans,
        found: result.found,
        notFound: result.notFound,
        totalRequested: result.totalRequested,
      };
    } catch (error) {
      throw new Error(`Bulk get plans failed: ${error.message}`);
    }
  }

  async deleteById(id) {
    return super.softDeleteById(id);
  }
}

export default PlanService;
