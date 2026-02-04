import { BaseService } from '../utils/index.js';
import { LoyaltyRedemptionRuleSchema } from '../models/index.js';

/**
 * Loyalty Redemption Rule Service
 * @class LoyaltyRedemptionRuleServices
 * @extends BaseService
 */
class LoyaltyRedemptionRuleServices extends BaseService {
  /**
   * Initialize Loyalty Redemption Rule Service with tenant-specific database support
   * @param {String} businessId - Business/tenant ID for multi-tenant isolation
   */
  constructor(businessId) {
    if (!businessId) {
      throw new Error('LoyaltyRedemptionRuleServices initialized without businessId');
    }
    super({
      modelName: 'LoyaltyRedemptionRule',
      schema: LoyaltyRedemptionRuleSchema,
      collection: 'loyaltyRedemptionRules',
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
   * Validate redemption rule data before creation/update
   * @param {Object} data - Redemption rule data
   * @returns {Object} Validated data
   * @throws {Error} If validation fails
   */
  validateRedemptionRuleData(data) {
    // Validate ruleName
    if (data.ruleName !== undefined) {
      if (!data.ruleName || typeof data.ruleName !== 'string') {
        throw new Error('Rule name is required and must be a string');
      }
      if (data.ruleName.length > 100) {
        throw new Error('Rule name cannot exceed 100 characters');
      }
    }

    // Validate pointFrom (must be positive integer >= 1)
    if (data.pointFrom !== undefined) {
      if (typeof data.pointFrom !== 'number' || !Number.isInteger(data.pointFrom) || data.pointFrom < 1) {
        throw new Error('Point from must be a positive integer (minimum 1)');
      }
    }

    // Validate pointTo (must be positive integer >= 1)
    if (data.pointTo !== undefined) {
      if (typeof data.pointTo !== 'number' || !Number.isInteger(data.pointTo) || data.pointTo < 1) {
        throw new Error('Point to must be a positive integer (minimum 1)');
      }
    }

    // Validate pointFrom <= pointTo (when both are provided)
    if (data.pointFrom !== undefined && data.pointTo !== undefined) {
      if (data.pointFrom > data.pointTo) {
        throw new Error(
          `Point from (${data.pointFrom}) must be less than or equal to point to (${data.pointTo})`,
        );
      }
    }

    // Validate amount
    if (data.amount !== undefined) {
      if (typeof data.amount !== 'number' || data.amount < 0) {
        throw new Error('Discount amount must be a non-negative number');
      }
    }

    // Validate status
    if (data.status !== undefined) {
      if (typeof data.status !== 'boolean') {
        throw new Error('Status must be a boolean value');
      }
    }

    return data;
  }

  /**
   * Check if a new redemption rule overlaps with existing rules in the database
   * Checks against ALL non-deleted rules (both active and inactive) to prevent any overlap
   * @param {Object} data - New rule data
   * @param {String} [excludeId] - ID to exclude (for updates)
   * @returns {Promise<Object|null>} Overlapping rule or null
   */
  async _findOverlappingRedemptionRule(data, excludeId = null) {
    const Model = await this.getModel();

    // Build filter to find potential overlapping rules
    // Check against ALL non-deleted rules (both active and inactive)
    const filter = {
      isDeleted: { $ne: true },
    };

    if (excludeId) {
      filter._id = { $ne: excludeId };
    }

    // Check for overlapping point ranges: (newFrom <= existingTo) && (newTo >= existingFrom)
    // Two ranges [A, B] and [C, D] overlap if A <= D AND B >= C
    filter.$and = [
      { pointFrom: { $lte: data.pointTo } },
      { pointTo: { $gte: data.pointFrom } },
    ];

    const overlappingRule = await Model.findOne(filter).lean();

    if (overlappingRule) {
      const statusText = overlappingRule.status ? 'active' : 'inactive';
      return {
        type: 'range_overlap',
        rule: overlappingRule,
        message: `Point range overlap detected. New rule "${data.ruleName}" (${data.pointFrom}-${data.pointTo}) overlaps with existing ${statusText} rule "${overlappingRule.ruleName}" (${overlappingRule.pointFrom}-${overlappingRule.pointTo})`,
      };
    }

    return null;
  }

  /**
   * Create a new loyalty redemption rule
   * @param {Object} data - Redemption rule data
   * @param {String} data.ruleName - Rule name for identification
   * @param {Number} data.pointFrom - Minimum points for this rule
   * @param {Number} data.pointTo - Maximum points for this rule
   * @param {Number} data.amount - Discount amount
   * @param {Boolean} [data.status=true] - Active status
   * @param {String} [data.createdBy] - User ID who created the record
   * @param {Object} [options] - Additional options
   * @returns {Object} Created redemption rule
   * @throws {Error} If creation fails
   */
  async create(data, options = {}) {
    try {
      // Validate data
      const validatedData = this.validateRedemptionRuleData({
        ...data,
        businessId: this.businessId,
      });

      // Ensure required fields are present
      if (!validatedData.ruleName) {
        throw new Error('Rule name is required');
      }

      if (validatedData.pointFrom === undefined || validatedData.pointFrom === null) {
        throw new Error('Point from is required');
      }

      if (validatedData.pointTo === undefined || validatedData.pointTo === null) {
        throw new Error('Point to is required');
      }

      if (validatedData.amount === undefined || validatedData.amount === null) {
        throw new Error('Discount amount is required');
      }

      // Check for overlapping rules in database
      const overlappingRule = await this._findOverlappingRedemptionRule(validatedData);
      if (overlappingRule) {
        throw new Error(overlappingRule.message);
      }

      // Create using base service
      const created = await super.create(validatedData, options);

      // Convert to plain object if it's a Mongoose document
      const createdDoc = created.toObject ? created.toObject() : created;

      // Return minimal payload with cleaned data
      return {
        _id: createdDoc._id,
        ruleName: createdDoc.ruleName,
        pointFrom: createdDoc.pointFrom,
        pointTo: createdDoc.pointTo,
        amount: createdDoc.amount,
        status: createdDoc.status,
        createdBy: createdDoc.createdBy,
        updatedBy: createdDoc.updatedBy,
        createdAt: createdDoc.createdAt,
        updatedAt: createdDoc.updatedAt,
      };
    } catch (error) {
      throw new Error(
        `Error creating loyalty redemption rule: ${error.message}`,
        {
          cause: error,
        },
      );
    }
  }

  /**
   * Get a redemption rule by ID
   * @param {String} id - Redemption rule ID
   * @returns {Object} Redemption rule document
   * @throws {Error} If not found or retrieval fails
   */
  async getById(id) {
    try {
      this.validateObjectId(id);
      const Model = await this.getModel();
      const rule = await Model.findById(id);

      if (!rule) {
        throw new Error(`Loyalty redemption rule with id ${id} not found`);
      }

      // Verify business ID matches (security check)
      if (
        rule.businessId &&
        rule.businessId.toString() !== this.businessId.toString()
      ) {
        throw new Error('Unauthorized access to loyalty redemption rule');
      }

      return rule;
    } catch (error) {
      throw new Error(
        `Error getting loyalty redemption rule: ${error.message}`,
        {
          cause: error,
        },
      );
    }
  }

  /**
   * Get all redemption rules with optional query filters
   * @param {Object} [query={}] - MongoDB query filters
   * @returns {Array} Array of redemption rule documents
   * @throws {Error} If retrieval fails
   */
  async getAll(query = {}) {
    try {
      // Note: Tenant isolation is handled at the database level, NOT document level
      const filters = {
        ...query,
      };

      const Model = await this.getModel();
      const rules = await Model.find(filters).sort({
        pointFrom: 1,
        createdAt: -1,
      });
      return rules;
    } catch (error) {
      throw new Error(
        `Error retrieving loyalty redemption rules: ${error.message}`,
        {
          cause: error,
        },
      );
    }
  }

  /**
   * Update a redemption rule by ID
   * @param {String} id - Redemption rule ID
   * @param {Object} data - Update data
   * @param {String} [data.ruleName] - Rule name
   * @param {Number} [data.pointFrom] - Minimum points
   * @param {Number} [data.pointTo] - Maximum points
   * @param {Number} [data.amount] - Discount amount
   * @param {Boolean} [data.status] - Active status
   * @param {String} [data.updatedBy] - User ID who updated the record
   * @returns {Object} Updated redemption rule
   * @throws {Error} If update fails
   */
  async updateById(id, data) {
    try {
      this.validateObjectId(id);

      // Verify document exists and belongs to business
      const existing = await this.getById(id);

      // Do not allow tenant switch on update
      const { businessId, ...rest } = data || {};

      // Determine effective values for validation
      const effectivePointFrom = rest.pointFrom !== undefined
        ? rest.pointFrom
        : existing.pointFrom;

      const effectivePointTo = rest.pointTo !== undefined
        ? rest.pointTo
        : existing.pointTo;

      // Validate pointFrom <= pointTo
      if (effectivePointFrom > effectivePointTo) {
        throw new Error(
          `Point from (${effectivePointFrom}) must be less than or equal to point to (${effectivePointTo})`,
        );
      }

      // Validate update data
      const validatedData = this.validateRedemptionRuleData({ ...rest });

      // Check for overlapping rules in database (exclude current document)
      const dataForOverlapCheck = {
        ruleName: validatedData.ruleName || existing.ruleName,
        pointFrom: effectivePointFrom,
        pointTo: effectivePointTo,
      };

      const overlappingRule = await this._findOverlappingRedemptionRule(dataForOverlapCheck, id);
      if (overlappingRule) {
        throw new Error(overlappingRule.message);
      }

      // Update using base service
      const updated = await super.updateById(id, validatedData);

      // Convert to plain object if it's a Mongoose document
      const updatedDoc = updated.toObject ? updated.toObject() : updated;

      // Return minimal payload with cleaned data
      return {
        _id: updatedDoc._id,
        ruleName: updatedDoc.ruleName,
        pointFrom: updatedDoc.pointFrom,
        pointTo: updatedDoc.pointTo,
        amount: updatedDoc.amount,
        status: updatedDoc.status,
        createdBy: updatedDoc.createdBy,
        updatedBy: updatedDoc.updatedBy,
        createdAt: updatedDoc.createdAt,
        updatedAt: updatedDoc.updatedAt,
      };
    } catch (error) {
      throw new Error(
        `Error updating loyalty redemption rule: ${error.message}`,
        {
          cause: error,
        },
      );
    }
  }

  /**
   * Delete a redemption rule by ID (hard delete)
   * @param {String} id - Redemption rule ID
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
      throw new Error(
        `Error deleting loyalty redemption rule: ${error.message}`,
        {
          cause: error,
        },
      );
    }
  }

  /**
   * Bulk update loyalty redemption rule statuses for the current business
   * @param {Array<string>} ids - Array of redemption rule IDs
   * @param {boolean} status - Desired status value
   * @param {string} [updatedBy] - User performing the update
   * @returns {Promise<Object>} Summary of the bulk update operation
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
        message: `${modifiedCount} loyalty redemption rule(s) status updated to ${status ? 'active' : 'inactive'}`,
      };
    } catch (error) {
      throw new Error(
        `Error bulk updating loyalty redemption rule status: ${error.message}`,
        {
          cause: error,
        },
      );
    }
  }

  /**
   * Bulk delete loyalty redemption rules for the current business
   * @param {Array<string>} ids - Array of redemption rule IDs
   * @returns {Promise<Object>} Summary of the bulk delete operation
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
   * Soft delete a redemption rule by ID (sets isDeleted flag)
   * @param {String} id - Redemption rule ID
   * @returns {Object} Updated redemption rule
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
      throw new Error(
        `Error soft deleting loyalty redemption rule: ${error.message}`,
        {
          cause: error,
        },
      );
    }
  }

  /**
   * Restore a soft-deleted redemption rule
   * @param {String} id - Redemption rule ID
   * @returns {Object} Restored redemption rule
   * @throws {Error} If restoration fails
   */
  async restoreById(id) {
    try {
      this.validateObjectId(id);

      // Restore using base service
      return await super.restoreById(id);
    } catch (error) {
      throw new Error(
        `Error restoring loyalty redemption rule: ${error.message}`,
        {
          cause: error,
        },
      );
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
   * Build search conditions for redemption rule fields
   * Searches in ruleName, pointFrom, pointTo, and amount
   * @param {String} searchTerm - Search term
   * @returns {Array} Array of search condition objects
   */
  _buildSearchConditions(searchTerm) {
    const searchConditions = [];

    // Text search on ruleName
    searchConditions.push({
      ruleName: { $regex: searchTerm, $options: 'i' },
    });

    // Numeric search if the term is a number
    const searchNum = Number(searchTerm);
    if (!isNaN(searchNum)) {
      searchConditions.push(
        { pointFrom: searchNum },
        { pointTo: searchNum },
        { amount: searchNum },
      );

      // Partial matches using string conversion
      const searchStr = searchNum.toString();
      if (searchStr.length > 0) {
        searchConditions.push(
          {
            $expr: {
              $regexMatch: {
                input: { $toString: '$pointFrom' },
                regex: `^${searchStr}`,
                options: 'i',
              },
            },
          },
          {
            $expr: {
              $regexMatch: {
                input: { $toString: '$pointTo' },
                regex: `^${searchStr}`,
                options: 'i',
              },
            },
          },
          {
            $expr: {
              $regexMatch: {
                input: { $toString: '$amount' },
                regex: `^${searchStr}`,
                options: 'i',
              },
            },
          },
        );
      }
    }

    return searchConditions;
  }

  /**
   * List redemption rules with advanced filtering, search, and pagination
   * @param {Object} [queryParams={}] - Query parameters
   * @param {Boolean} [queryParams.all] - Fetch all records without pagination
   * @param {Boolean} [queryParams.isActive] - Filter by active status (alias for status)
   * @param {Number} [queryParams.page=1] - Page number
   * @param {Number} [queryParams.limit=50] - Items per page (max 100)
   * @param {String} [queryParams.search] - Search term
   * @param {String} [queryParams.sortBy=pointFrom] - Field to sort by
   * @param {String} [queryParams.sortOrder=asc] - Sort order ('asc' or 'desc')
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
        sortBy = 'pointFrom',
        sortOrder = 'asc',
        page = 1,
        limit = 50,
        includeCount = true,
        filters: additionalFilters = {},
      } = queryParams;

      // Build base filters
      const baseFilters = {
        ...additionalFilters,
        isDeleted: { $ne: true },
      };

      // Add status filter - isActive takes precedence over status
      const statusFlag = isActive !== undefined ? isActive : status;
      const statusFilter = this._buildStatusFilter(statusFlag);
      Object.assign(baseFilters, statusFilter);

      // Build search conditions if search term provided
      let finalFilters = { ...baseFilters };
      if (search) {
        const searchConditions = this._buildSearchConditions(search);
        if (searchConditions.length > 0) {
          finalFilters.$or = searchConditions;
        }
      }

      const Model = await this.getModel();

      // Use projection to reduce payload size
      const projection = {
        ruleName: 1,
        pointFrom: 1,
        pointTo: 1,
        amount: 1,
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
      throw new Error(
        `Error listing loyalty redemption rules: ${error.message}`,
        {
          cause: error,
        },
      );
    }
  }

  /**
   * Bulk get redemption rules by IDs
   * @param {Array<string>} ids - Array of redemption rule IDs
   * @param {Object} [options={}] - Options
   * @param {Boolean} [options.lean=true] - Return lean documents
   * @param {Boolean} [options.throwOnNotFound=false] - Throw error if any ID not found
   * @returns {Object} Result with found documents and metadata
   * @throws {Error} If retrieval fails
   */
  async bulkGetRedemptionRules(ids, options = {}) {
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
        excludeSoftDeleted: true,
      });

      let query = Model.find(filter);

      if (lean) {
        query = query.lean({ virtuals: true });
      }

      const documents = await query.exec();

      // Find which IDs were not found
      const foundIds = documents.map((doc) => doc.id);
      const notFoundIds = validIds.filter((id) => !foundIds.includes(id));

      if (throwOnNotFound && notFoundIds.length > 0) {
        throw new Error(
          `Redemption rules not found for IDs: ${notFoundIds.join(', ')}`,
        );
      }

      return {
        data: documents,
        found: documents.length,
        notFound: notFoundIds,
        totalRequested: validIds.length,
      };
    } catch (error) {
      throw new Error(
        `Error bulk getting redemption rules: ${error.message}`,
        {
          cause: error,
        },
      );
    }
  }

  /**
   * Update redemption rule status (activate/deactivate)
   * @param {String} id - Redemption rule ID
   * @param {Boolean} status - New status value
   * @param {String} [updatedBy] - User ID who updated the record
   * @returns {Object} Updated redemption rule
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
      throw new Error(
        `Error updating loyalty redemption rule status: ${error.message}`,
        {
          cause: error,
        },
      );
    }
  }

  /**
   * Get active redemption rules for the business
   * @param {Object} [options={}] - Additional query options
   * @returns {Array} Array of active redemption rules
   * @throws {Error} If retrieval fails
   */
  async getActiveRules(options = {}) {
    try {
      const Model = await this.getModel();
      // Note: Tenant isolation is handled at the database level, NOT document level
      const rules = await Model.find({
        status: true,
        isDeleted: { $ne: true },
        ...options,
      })
        .sort({ pointFrom: 1 })
        .lean({ virtuals: true });

      return rules;
    } catch (error) {
      throw new Error(
        `Error retrieving active loyalty redemption rules: ${error.message}`,
        {
          cause: error,
        },
      );
    }
  }

  /**
   * Find rule that matches a specific point value
   * @param {Number} points - Point value to find rule for (must be positive)
   * @param {Object} [options={}] - Additional query options
   * @returns {Object|null} Matching rule or null
   * @throws {Error} If retrieval fails
   */
  async findRuleByPoints(points, options = {}) {
    try {
      if (typeof points !== 'number' || !Number.isInteger(points) || points < 1) {
        throw new Error('Points must be a positive integer (minimum 1)');
      }

      const Model = await this.getModel();
      const rule = await Model.findOne({
        pointFrom: { $lte: points },
        pointTo: { $gte: points },
        status: true,
        isDeleted: { $ne: true },
        ...options,
      }).lean({ virtuals: true });

      return rule;
    } catch (error) {
      throw new Error(
        `Error finding redemption rule by points: ${error.message}`,
        {
          cause: error,
        },
      );
    }
  }

  /**
   * Build scoped filter for bulk operations to ensure tenant isolation
   * @param {Array<string>} ids - Target document IDs
   * @param {Object} options - Additional filter options
   * @param {boolean} [options.excludeSoftDeleted=false] - Exclude soft deleted documents
   * @returns {Object} MongoDB filter object
   */
  _buildBulkScopeFilter(ids, { excludeSoftDeleted = false } = {}) {
    const filter = {
      _id: { $in: ids },
    };

    if (excludeSoftDeleted) {
      filter.isDeleted = { $ne: true };
    }

    // Note: LoyaltyRedemptionRule is a tenant-specific model stored in tenant's database.
    // Tenant isolation is handled at the database level, NOT at the document level.
    // Therefore, we do NOT add a businessId filter here.

    return filter;
  }
}

export default LoyaltyRedemptionRuleServices;
