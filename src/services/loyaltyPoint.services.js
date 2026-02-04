import { BaseService } from '../utils/index.js';
import { LoyaltyPointSchema } from '../models/index.js';

/**
 * Loyalty Point Service
 *
 * Enterprise-grade service for managing loyalty point operations with tenant-specific database support.
 * Extends BaseService to provide comprehensive CRUD operations and additional business logic.
 *
 * @class LoyaltyPointServices
 * @extends BaseService
 */
class LoyaltyPointServices extends BaseService {
  /**
   * Initialize Loyalty Point Service with tenant-specific database support
   * @param {String} businessId - Business/tenant ID for multi-tenant isolation
   */
  constructor(businessId) {
    if (!businessId) {
      throw new Error('LoyaltyPointServices initialized without businessId');
    }
    super({
      modelName: 'LoyaltyPoint',
      schema: LoyaltyPointSchema,
      collection: 'loyaltyPoints',
      businessId,
    });
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
   * Validate loyalty point data before creation/update 
   * @param {Object} data - Loyalty point data
   * @returns {Object} Validated data
   * @throws {Error} If validation fails
   */
  validateLoyaltyPointData(data) {
    // Validate loyaltyPoints
    if (data.loyaltyPoints !== undefined) {
      if (typeof data.loyaltyPoints !== 'number' || data.loyaltyPoints < 0) {
        throw new Error('Loyalty points must be a non-negative number');
      }
    }

    // Validate minimumAmount
    if (data.minimumAmount !== undefined) {
      if (typeof data.minimumAmount !== 'number' || data.minimumAmount < 0) {
        throw new Error(
          'Minimum amount purchase must be a non-negative number',
        );
      }
    }

    // Validate maximumAmount
    if (data.maximumAmount !== undefined) {
      if (typeof data.maximumAmount !== 'number' || data.maximumAmount < 0) {
        throw new Error(
          'Maximum amount purchase must be a non-negative number',
        );
      }
    }

    // Validate expiryDuration
    if (data.expiryDuration !== undefined) {
      if (typeof data.expiryDuration !== 'number' || data.expiryDuration < 0) {
        throw new Error('Expiry duration must be a non-negative number');
      }
    }

    // Validate status if provided
    if (data.status !== undefined) {
      if (typeof data.status !== 'boolean') {
        throw new Error('Status must be a boolean value');
      }
    }

    if (
      data.minimumAmount !== undefined &&
      data.maximumAmount !== undefined &&
      data.minimumAmount > data.maximumAmount
    ) {
      throw new Error(
        'Minimum amount purchase cannot be greater than maximum amount purchase',
      );
    }

    return data;
  }

  /**
   * Create a new loyalty point configuration
   * @param {Object} data - Loyalty point data
   * @param {Number} data.loyaltyPoints - Points to award
   * @param {Number} data.minimumAmount - Minimum purchase amount required
   * @param {Number} data.expiryDuration - Duration in days before points expire
   * @param {String} [data.createdBy] - User ID who created the record
   * @param {Boolean} [data.status=true] - Active status
   * @param {Object} [options] - Additional options
   * @returns {Object} Created loyalty point
   * @throws {Error} If creation fails
   */
  async create(data, options = {}) {
    try {
      // Validate data
      const validatedData = this.validateLoyaltyPointData({
        ...data,
        businessId: this.businessId,
      });

      // Ensure required fields are present
      if (!validatedData.loyaltyPoints && validatedData.loyaltyPoints !== 0) {
        throw new Error('Loyalty points is required');
      }
      if (!validatedData.minimumAmount && validatedData.minimumAmount !== 0) {
        throw new Error('Minimum amount purchase is required');
      }
      if (!validatedData.maximumAmount && validatedData.maximumAmount !== 0) {
        throw new Error('Maximum amount purchase is required');
      }
      if (!validatedData.expiryDuration && validatedData.expiryDuration !== 0) {
        throw new Error('Expiry duration is required');
      }
      if (validatedData.minimumAmount > validatedData.maximumAmount) {
        throw new Error(
          'Minimum amount purchase cannot be greater than maximum amount purchase',
        );
      }

      const overlappingRange = await this._findOverlappingRange(
        validatedData.minimumAmount,
        validatedData.maximumAmount,
      );
      if (overlappingRange) {
        throw new Error(
          'Another loyalty point configuration already exists for the provided purchase amount range',
        );
      }

      // Create using base service
      const created = await super.create(validatedData, options);

      // Return minimal payload to reduce serialization overhead
      return {
        _id: created._id,
        loyaltyPoints: created.loyaltyPoints,
        minimumAmount: created.minimumAmount,
        maximumAmount: created.maximumAmount,
        expiryDuration: created.expiryDuration,
        status: created.status,
        createdBy: created.createdBy,
        updatedBy: created.updatedBy,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      };
    } catch (error) {
      throw new Error(`Error creating loyalty point: ${error.message}`, {
        cause: error,
      });
    }
  }

  /**
   * Get a loyalty point by ID
   * @param {String} id - Loyalty point ID
   * @returns {Object} Loyalty point document
   * @throws {Error} If not found or retrieval fails
   */
  async getById(id) {
    try {
      this.validateObjectId(id);
      const Model = await this.getModel();
      const loyaltyPoint = await Model.findById(id);

      if (!loyaltyPoint) {
        throw new Error(`Loyalty point with id ${id} not found`);
      }

      // Verify business ID matches (security check)
      if (
        loyaltyPoint.businessId &&
        loyaltyPoint.businessId.toString() !== this.businessId.toString()
      ) {
        throw new Error('Unauthorized access to loyalty point');
      }

      return loyaltyPoint;
    } catch (error) {
      throw new Error(`Error getting loyalty point: ${error.message}`, {
        cause: error,
      });
    }
  }

  /**
   * Get all loyalty points with optional query filters
   * @param {Object} [query={}] - MongoDB query filters
   * @returns {Array} Array of loyalty point documents
   * @throws {Error} If retrieval fails
   */
  async getAll(query = {}) {
    try {
      // Always scope to current businessId
      // Handle both documents with businessId and legacy documents without businessId
      const filters = {
        ...query,
        $or: [
          { businessId: this.businessId },
          { businessId: { $exists: false } }, // Legacy documents without businessId
        ],
        isDeleted: { $ne: true },
      };

      const Model = await this.getModel();
      const loyaltyPoints = await Model.find(filters).sort({ createdAt: -1 });
      return loyaltyPoints;
    } catch (error) {
      throw new Error(`Error retrieving loyalty points: ${error.message}`, {
        cause: error,
      });
    }
  }

  /**
   * Update a loyalty point by ID
   * @param {String} id - Loyalty point ID
   * @param {Object} data - Update data
   * @param {Number} [data.loyaltyPoints] - Points to award
   * @param {Number} [data.minimumAmount] - Minimum purchase amount
   * @param {Number} [data.expiryDuration] - Expiry duration in days
   * @param {String} [data.updatedBy] - User ID who updated the record
   * @param {Boolean} [data.status] - Active status
   * @returns {Object} Updated loyalty point
   * @throws {Error} If update fails
   */
  async updateById(id, data) {
    try {
      this.validateObjectId(id);

      // Verify document exists and belongs to business
      const existing = await this.getById(id);

      // Do not allow tenant switch on update
      const { businessId, ...rest } = data || {};

      // Validate update data
      const validatedData = this.validateLoyaltyPointData({ ...rest });
      const effectiveMinimum =
        validatedData.minimumAmount !== undefined
          ? validatedData.minimumAmount
          : existing.minimumAmount;
      const effectiveMaximum =
        validatedData.maximumAmount !== undefined
          ? validatedData.maximumAmount
          : existing.maximumAmount;

      if (
        effectiveMinimum !== undefined &&
        effectiveMaximum !== undefined &&
        effectiveMinimum > effectiveMaximum
      ) {
        throw new Error(
          'Minimum amount purchase cannot be greater than maximum amount purchase',
        );
      }

      const overlappingRange = await this._findOverlappingRange(
        effectiveMinimum,
        effectiveMaximum,
        id,
      );
      if (overlappingRange) {
        throw new Error(
          'Another loyalty point configuration already exists for the provided purchase amount range',
        );
      }

      // Update using base service
      const updated = await super.updateById(id, validatedData);

      // Return minimal payload
      return {
        _id: updated._id,
        loyaltyPoints: updated.loyaltyPoints,
        minimumAmount: updated.minimumAmount,
        maximumAmount: updated.maximumAmount,
        expiryDuration: updated.expiryDuration,
        status: updated.status,
        createdBy: updated.createdBy,
        updatedBy: updated.updatedBy,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      };
    } catch (error) {
      throw new Error(`Error updating loyalty point: ${error.message}`, {
        cause: error,
      });
    }
  }

  /**
   * Delete a loyalty point by ID (hard delete)
   * @param {String} id - Loyalty point ID
   * @returns {Object} Deletion result
   * @throws {Error} If deletion fails
   */
  async deleteById(id) {
    try {
      this.validateObjectId(id);

      // Verify document exists and belongs to business
      await this.getById(id);

      // Delete using base service
      return await super.deleteById(id);
    } catch (error) {
      throw new Error(`Error deleting loyalty point: ${error.message}`, {
        cause: error,
      });
    }
  }

  /**
   * Bulk update loyalty point statuses for the current business
   * @param {Array<string>} ids - Array of loyalty point IDs
   * @param {boolean} status - New status value
   * @param {string} [updatedBy] - User performing the update
   * @returns {Promise<Object>} Summary of the bulk operation
   */
  async bulkUpdateStatus(ids = [], status, updatedBy = null) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('IDs array is required and must not be empty');
      }

      if (typeof status !== 'boolean') {
        throw new Error('Status must be a boolean value');
      }

      ids.forEach((id) => this.validateObjectId(id));

      const Model = await this.getModel();
      const filter = this._buildBulkScopeFilter(ids, {
        includeLegacy: true,
        excludeSoftDeleted: true,
      });

      const updateData = { status };
      if (updatedBy) {
        updateData.updatedBy = updatedBy;
      }

      const result = await Model.updateMany(filter, { $set: updateData });
      const modifiedCount = result.modifiedCount ?? result.nModified ?? 0;

      return {
        modifiedCount,
        totalRequested: ids.length,
        message: `${modifiedCount} loyalty point configuration(s) status updated to ${status ? 'active' : 'inactive'
          }`,
      };
    } catch (error) {
      throw new Error(
        `Error bulk updating loyalty point status: ${error.message}`,
        {
          cause: error,
        },
      );
    }
  }

  /**
   * Bulk delete loyalty point configurations for the current business
   * @param {Array<string>} ids - Array of loyalty point IDs
   * @returns {Promise<Object>} Summary of the bulk delete operation
   */
  async bulkDelete(ids = []) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('No loyalty point IDs provided for bulk delete');
      }

      ids.forEach((id) => this.validateObjectId(id));

      const Model = await this.getModel();
      const filter = this._buildBulkScopeFilter(ids, { includeLegacy: true });

      const result = await Model.deleteMany(filter);
      const deletedCount = result.deletedCount ?? result.n ?? 0;

      return {
        deletedCount,
        totalRequested: ids.length,
        message: `${deletedCount} loyalty point configuration(s) deleted successfully`,
      };
    } catch (error) {
      throw new Error(`Error bulk deleting loyalty points: ${error.message}`, {
        cause: error,
      });
    }
  }

  /**
   * Soft delete a loyalty point by ID (sets isDeleted flag)
   * @param {String} id - Loyalty point ID
   * @returns {Object} Updated loyalty point
   * @throws {Error} If soft delete fails
   */
  async softDeleteById(id) {
    try {
      this.validateObjectId(id);

      // Verify document exists and belongs to business
      await this.getById(id);

      // Soft delete using base service
      return await super.softDeleteById(id);
    } catch (error) {
      throw new Error(`Error soft deleting loyalty point: ${error.message}`, {
        cause: error,
      });
    }
  }

  /**
   * Restore a soft-deleted loyalty point
   * @param {String} id - Loyalty point ID
   * @returns {Object} Restored loyalty point
   * @throws {Error} If restoration fails
   */
  async restoreById(id) {
    try {
      this.validateObjectId(id);

      // Restore using base service
      return await super.restoreById(id);
    } catch (error) {
      throw new Error(`Error restoring loyalty point: ${error.message}`, {
        cause: error,
      });
    }
  }

  /**
 * Bulk soft delete loyalty points
 * @param {Array<String>} ids - Array of loyalty point IDs
 * @param {Object} options - Optional options { session }
 * @returns {Promise<Object>} Result summary
 */
  async bulkSoftDelete(ids = [], options = {}) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('ids must be a non-empty array');
      }

      // Validate all IDs
      for (const id of ids) {
        this.validateObjectId(id);
      }

      const Model = await this.getCachedModel();
      const update = {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
        },
      };
      const filter = {
        _id: { $in: ids },
        isDeleted: false,
      };

      const result = await Model.updateMany(filter, update, {
        session: options.session || undefined,
      });

      return {
        matchedCount: result.matchedCount || 0,
        modifiedCount: result.modifiedCount || 0,
      };
    } catch (error) {
      throw new Error(`Failed to bulk soft delete loyalty points: ${error.message}`);
    }
  }

  /**
   * Check if all items should be fetched
   * @param {*} all - The all parameter value
   * @returns {boolean} Whether to fetch all items
   */
  _shouldFetchAll(all) {
    if (typeof all === 'string') {
      return all.toLowerCase() === 'true';
    }
    return Boolean(all);
  }

  /**
   * Build status filters based on isActive parameter
   * @param {*} statusFlag - Status flag (isActive or status)
   * @returns {Object} Filter object
   */
  _buildStatusFilter(statusFlag) {
    const filters = {};
    if (statusFlag !== undefined) {
      if (typeof statusFlag === 'string') {
        filters.status = statusFlag.toLowerCase() === 'true';
      } else {
        filters.status = Boolean(statusFlag);
      }
    }
    return filters;
  }

  /**
   * Build numeric search conditions for loyalty point fields
   * Searches in loyaltyPoints, minimumAmount, maximumAmount, and expiryDuration
   * @param {String} searchTerm - Search term (should be numeric)
   * @returns {Array} Array of search condition objects
   */
  _buildNumericSearchConditions(searchTerm) {
    const searchConditions = [];
    const searchNum = Number(searchTerm);

    // Only process if search term is a valid number
    if (isNaN(searchNum)) {
      return searchConditions;
    }

    // Exact matches for numeric fields
    searchConditions.push(
      { loyaltyPoints: searchNum },
      { minimumAmount: searchNum },
      { maximumAmount: searchNum },
      { expiryDuration: searchNum },
    );

    // Partial matches: search for values that start with the search number
    // Using $expr with $toString for string-based matching on numeric fields
    const searchStr = searchNum.toString();
    if (searchStr.length > 0) {
      searchConditions.push(
        {
          $expr: {
            $regexMatch: {
              input: { $toString: '$loyaltyPoints' },
              regex: `^${searchStr}`,
              options: 'i',
            },
          },
        },
        {
          $expr: {
            $regexMatch: {
              input: { $toString: '$minimumAmount' },
              regex: `^${searchStr}`,
              options: 'i',
            },
          },
        },
        {
          $expr: {
            $regexMatch: {
              input: { $toString: '$maximumAmount' },
              regex: `^${searchStr}`,
              options: 'i',
            },
          },
        },
        {
          $expr: {
            $regexMatch: {
              input: { $toString: '$expiryDuration' },
              regex: `^${searchStr}`,
              options: 'i',
            },
          },
        },
      );
    }

    return searchConditions;
  }

  /**
   * List loyalty points with advanced filtering, search, and pagination
   * @param {Object} [queryParams={}] - Query parameters
   * @param {Boolean} [queryParams.all] - Fetch all records without pagination
   * @param {Boolean} [queryParams.isActive] - Filter by active status (alias for status)
   * @param {Number} [queryParams.page=1] - Page number
   * @param {Number} [queryParams.limit=50] - Items per page (max 100)
   * @param {String} [queryParams.search] - Search term
   * @param {String} [queryParams.sortBy=createdAt] - Field to sort by
   * @param {String} [queryParams.sortOrder=desc] - Sort order ('asc' or 'desc')
   * @param {Object} [queryParams.filters] - Additional filters
   * @param {Boolean} [queryParams.status] - Filter by status
   * @param {Boolean} [queryParams.includeCount=true] - Include total count
   * @returns {Object} Paginated results with data and pagination info
   * @throws {Error} If listing fails
   */
  async list(queryParams = {}) {
    try {
      const {
        all,
        isActive,
        status,
        search,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        page = 1,
        limit = 50,
        includeCount = true,
        filters: additionalFilters = {},
      } = queryParams;

      // Build base filters with businessId scoping
      // Handle both documents with businessId and legacy documents without businessId
      const baseFilters = {
        ...additionalFilters,
        $or: [
          { businessId: this.businessId },
          { businessId: { $exists: false } }, // Legacy documents without businessId
        ],
        isDeleted: { $ne: true },
      };

      // Add status filter - isActive takes precedence over status
      const statusFlag = isActive !== undefined ? isActive : status;
      const statusFilter = this._buildStatusFilter(statusFlag);
      Object.assign(baseFilters, statusFilter);

      // Build search conditions for numeric fields if search term provided
      let finalFilters = { ...baseFilters };
      if (search) {
        const searchConditions = this._buildNumericSearchConditions(search);
        if (searchConditions.length > 0) {
          // Combine search conditions with existing filters using $and
          const existingOrFilter = finalFilters.$or;
          finalFilters = {
            ...finalFilters,
            $and: [
              { $or: existingOrFilter }, // BusinessId filter
              { $or: searchConditions }, // Search conditions
            ],
          };
          delete finalFilters.$or; // Remove the old $or since we're using $and now
        } else {
          finalFilters._id = { $in: [] };
        }
      }

      const Model = await this.getModel();

      // Use projection to reduce payload size
      const projection = {
        loyaltyPoints: 1,
        minimumAmount: 1,
        maximumAmount: 1,
        expiryDuration: 1,
        status: 1,
        createdBy: 1,
        updatedBy: 1,
        createdAt: 1,
        updatedAt: 1,
      };

      // Build sort
      const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

      // Handle non-paginated mode (all=true)
      if (this._shouldFetchAll(all)) {
        const items = await Model.find(finalFilters, projection)
          .sort(sort)
          .lean({ virtuals: true });

        return {
          data: items,
          total: items.length,
        };
      }

      // Validate and calculate pagination using base service method
      const { page: validatedPage, limit: validatedLimit, skip } =
        this.validatePagination(page, limit);

      // Build query with projection and lean for performance
      let query = Model.find(finalFilters, projection)
        .sort(sort)
        .skip(skip)
        .limit(validatedLimit)
        .lean({ virtuals: true });

      // Handle includeCount parameter
      if (includeCount === false || includeCount === 'false') {
        const items = await query.exec();
        return {
          data: items,
          pagination: {
            currentPage: validatedPage,
            totalPages: null,
            totalItems: null,
            itemsPerPage: validatedLimit,
            hasNext: items.length === validatedLimit,
            hasPrev: validatedPage > 1,
          },
        };
      }

      // Execute query and count in parallel for better performance
      const [items, total] = await Promise.all([
        query.exec(),
        Model.countDocuments(finalFilters),
      ]);

      return {
        data: items,
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
      throw new Error(`Error listing loyalty points: ${error.message}`, {
        cause: error,
      });
    }
  }

  /**
   * Bulk get loyalty points by IDs
   * @param {Array<string>} ids - Array of loyalty point IDs
   * @param {Object} [options={}] - Options
   * @param {Boolean} [options.lean=true] - Return lean documents
   * @param {Boolean} [options.throwOnNotFound=false] - Throw error if any ID not found
   * @returns {Object} Result with found documents and metadata
   * @throws {Error} If retrieval fails
   */
  async bulkGetLoyaltyPoints(ids, options = {}) {
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

      const Model = await this.getModel();
      const filter = this._buildBulkScopeFilter(validIds, {
        includeLegacy: true,
        excludeSoftDeleted: true,
      });

      let query = Model.find(filter);

      if (lean) {
        query = query.lean({ virtuals: true });
      }

      const documents = await query.exec();


      // Find which IDs were not found
      const foundIds = documents.map((doc) => doc._id);
      const notFoundIds = validIds.filter((id) => !foundIds.includes(id));

      if (throwOnNotFound && notFoundIds.length > 0) {
        throw new Error(
          `Loyalty points not found for IDs: ${notFoundIds.join(', ')}`,
        );
      }

      return {
        data: documents,
        found: documents.length,
        notFound: notFoundIds,
        totalRequested: ids.length,
      };
    } catch (error) {
      throw new Error(`Error bulk getting loyalty points: ${error.message}`, {
        cause: error,
      });
    }
  }

  /**
   * Update loyalty point status (activate/deactivate)
   * @param {String} id - Loyalty point ID
   * @param {Boolean} status - New status value
   * @param {String} [updatedBy] - User ID who updated the record
   * @returns {Object} Updated loyalty point
   * @throws {Error} If update fails
   */
  async updateStatus(id, status, updatedBy = null) {
    try {
      const updateData = { status };
      if (updatedBy) {
        updateData.updatedBy = updatedBy;
      }
      return await this.updateById(id, updateData);
    } catch (error) {
      throw new Error(`Error updating loyalty point status: ${error.message}`, {
        cause: error,
      });
    }
  }

  /**
   * Get active loyalty point configuration for the business
   * @returns {Object|null} Active loyalty point or null
   * @throws {Error} If retrieval fails
   */
  async getActive() {
    try {
      const Model = await this.getModel();
      const loyaltyPoint = await Model.findOne({
        businessId: this.businessId,
        status: true,
        isDeleted: { $ne: true },
      }).sort({ createdAt: -1 });

      return loyaltyPoint;
    } catch (error) {
      throw new Error(
        `Error retrieving active loyalty point: ${error.message}`,
        {
          cause: error,
        },
      );
    }
  }

  /**
   * Build scoped filter for bulk operations, ensuring tenant isolation
   * @param {Array<string>} ids - Target IDs
   * @param {Object} options - Additional filtering options
   * @param {boolean} [options.includeLegacy=false] - Include documents without businessId (legacy)
   * @param {boolean} [options.excludeSoftDeleted=false] - Exclude soft deleted documents
   * @returns {Object} MongoDB filter
   */
  _buildBulkScopeFilter(
    ids,
    { includeLegacy = false, excludeSoftDeleted = false } = {},
  ) {
    const filter = {
      _id: { $in: ids },
    };

    if (excludeSoftDeleted) {
      filter.isDeleted = { $ne: true };
    }

    if (this.businessId) {
      filter.$or = includeLegacy
        ? [{ businessId: this.businessId }, { businessId: { $exists: false } }]
        : [{ businessId: this.businessId }];
    }

    return filter;
  }

  async _findOverlappingRange(minimumAmount, maximumAmount, excludeId = null) {
    if (minimumAmount === undefined || maximumAmount === undefined) {
      return null;
    }

    const Model = await this.getModel();
    const filter = {
      minimumAmount: { $lte: maximumAmount },
      maximumAmount: { $gte: minimumAmount },
      isDeleted: { $ne: true },
    };

    if (excludeId) {
      filter._id = { $ne: excludeId };
    }

    if (this.businessId) {
      filter.$or = [
        { businessId: this.businessId },
        { businessId: { $exists: false } },
      ];
    }

    return Model.findOne(filter).lean();
  }
}

export default LoyaltyPointServices;
