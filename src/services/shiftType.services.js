import {
  ShiftTypeSchema,
  Business,
  User,
  StoreSchema,
} from '../models/index.js';
import { BaseService } from '../utils/index.js';
import { applyStoreScope, validateStoreAccess } from '../utils/serviceGuard.js';

class ShiftTypeService extends BaseService {
  constructor(businessId) {
    if (!businessId) {
      throw new Error('ShiftTypeService initialized without businessId');
    }
    super({
      modelName: 'ShiftType',
      schema: ShiftTypeSchema,
      collection: 'shifttypes',
      businessId,
    });
    
    // RBAC: Shift types can be store-scoped (storeId is nullable, null = business-wide)
    // Store scoping applied when storeId is present
    this.rbacConfig.storeScoped = true;
    this.rbacConfig.storeIdField = 'storeId';
  }

  /**
   * Get all shift types with filtering and pagination
   * @param {Object} queryParams - Query parameters for filtering and pagination
   * @returns {Object} Paginated shift types data
   */
  async list(queryParams = {}) {
    const {
      page = 1,
      limit = 10,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      status,
      isActive,
      storeId,
      businessId,
    } = queryParams;

    // Build filter object
    const filters = this._buildFilters({ businessId, status, isActive, storeId });

    // Build sort object
    const sort = this._buildSort(sortBy, sortOrder);

    try {
      const ShiftModel = await this.getModelRef();

      // Use parallel execution for count and data fetching
      const [totalCount, shiftType] = await Promise.all([
        ShiftModel.countDocuments(filters),
        this._fetchShiftTypesWithQuery(filters, sort, page, limit, search),
      ]);

      // Calculate pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const totalPages = Math.ceil(totalCount / parseInt(limit));

      // Transform data for response
      const transformedShiftType = await Promise.all(
        shiftType.map((shiftType) =>
          this.transformShiftTypeForResponse(shiftType),
        ),
      );

      return {
        data: transformedShiftType,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: totalCount,
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1,
          limit: parseInt(limit),
        },
      };
    } catch (error) {
      throw new Error(`Error retrieving shift type: ${error.message}`);
    }
  }

  /**
   * Build filters for database queries
   * @param {Object} params - Filter parameters
   * @returns {Object} Filter object
   */
  _buildFilters({ businessId, status, isActive, storeId }) {
    const filters = {};

    if (businessId) {
      filters.businessId = businessId;
    }

    // Add status filter (prefer isActive param, fallback to legacy status)
    if (isActive !== undefined) {
      const activeBool =
        typeof isActive === 'string'
          ? isActive.toLowerCase() === 'true'
          : Boolean(isActive);
      filters.status = activeBool;
    } else if (status !== undefined) {
      filters.status = status === true || status === 'true';
    }

    if (storeId) {
      filters.storeId = storeId;
    }

    return filters;
  }

  /**
   * Build sort object
   * @param {String} sortBy - Sort field
   * @param {String} sortOrder - Sort order
   * @returns {Object} Sort object
   */
  _buildSort(sortBy, sortOrder) {
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Add secondary sort for consistent pagination
    if (sortBy !== '_id') {
      sort._id = -1;
    }

    return sort;
  }

  /**
   * Fetch shift types with query and population
   * @param {Object} filters - Database filters
   * @param {Object} sort - Sort configuration
   * @param {Number} page - Page number
   * @param {Number} limit - Items per page
   * @param {String} search - Search term
   * @returns {Array} Shift types with populated data
   */
  async _fetchShiftTypesWithQuery(filters, sort, page, limit, search) {
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const ShiftModel = await this.getModelRef();

    // RBAC: Apply store scoping if entity is store-scoped
    if (this.rbacConfig.enabled && this.rbacConfig.storeScoped) {
        applyStoreScope(filters, this.rbacConfig.storeIdField);
    }

    let query = ShiftModel.find(filters)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    // Apply search filter if provided
    if (search) {
      return this._searchShiftTypeWithAggregation(
        filters,
        sort,
        skip,
        parseInt(limit),
        search,
      );
    }

    const shiftTypes = await query.exec();

    // Handle cross-database population for both User (global) and Store (tenant)
    return await Promise.all(
      shiftTypes.map(async (shiftType) => {
        // Populate createdBy (User is in global database)
        if (shiftType.createdBy) {
          try {
            const user = await User.findById(shiftType.createdBy)
              .select('firstName lastName email')
              .lean();
            shiftType.createdBy = user;
          } catch (error) {
            console.warn('Failed to populate createdBy user:', error.message);
            shiftType.createdBy = null;
          }
        }

        // Populate storeId (Store is in tenant database)
        if (shiftType.storeId) {
          try {
            const StoreModel = await this.getModel(
              'Store',
              StoreSchema,
              'stores',
            );
            const store = await StoreModel.findById(shiftType.storeId)
              .select('name description')
              .lean();
            shiftType.storeId = store;
          } catch (error) {
            console.warn('Failed to populate store:', error.message);
            shiftType.storeId = null;
          }
        }

        return shiftType;
      }),
    );
  }

  /**
   * Search shift types using aggregation pipeline
   * @param {Object} filters - Database filters
   * @param {Object} sort - Sort configuration
   * @param {Number} skip - Skip count
   * @param {Number} limit - Limit count
   * @param {String} search - Search term
   * @returns {Array} Filtered shift types
   */
  async _searchShiftTypeWithAggregation(filters, sort, skip, limit, search) {
    const searchRegex = new RegExp(search, 'i');

    const ShiftModel = await this.getModelRef();

    // RBAC: Apply store scoping if entity is store-scoped (filters already modified by caller)
    // Store scoping is applied in _fetchShiftTypesWithQuery before calling this method

    const pipeline = [
      { $match: filters },
      { $match: { $or: [{ title: searchRegex }, { shiftType: searchRegex }] } },
      { $sort: sort },
      { $skip: skip },
      { $limit: limit },
    ];

    return ShiftModel.aggregate(pipeline).exec();
  }

  /**
   * Get shift type by ID with populated data
   * @param {String} id - Shift type ID
   * @returns {Object} Shift type data
   */
  async getById(id) {
    try {
      const ShiftModel = await this.getModelRef();
      const shiftType = await ShiftModel.findById(id).lean().exec();

      if (!shiftType) {
        throw new Error(`Shift type with id ${id} not found`);
      }

      // Handle cross-database population for createdBy (User is in global database)
      if (shiftType.createdBy) {
        try {
          const user = await User.findById(shiftType.createdBy)
            .select('firstName lastName email')
            .lean();
          shiftType.createdBy = user;
        } catch (error) {
          console.warn('Failed to populate createdBy user:', error.message);
          shiftType.createdBy = null;
        }
      }

      // Handle cross-database population for storeId (Store is in tenant database)
      if (shiftType.storeId) {
        try {
          const StoreModel = await this.getModel(
            'Store',
            StoreSchema,
            'stores',
          );
          const store = await StoreModel.findById(shiftType.storeId)
            .select('name description')
            .lean();
          shiftType.storeId = store;
        } catch (error) {
          console.warn('Failed to populate store:', error.message);
          shiftType.storeId = null;
        }
      }

      return await this.transformShiftTypeForResponse(shiftType);
    } catch (error) {
      throw new Error(`Error retrieving shift type: ${error.message}`);
    }
  }

  /**
   * Create a new shift type with access control
   * @param {Object} data - Shift type data
   * @param {Object} currentUser - Current user making the request
   * @returns {Object} Created shift type
   */
  async create(data, currentUser) {
    try {
      // Validate access and get business ID
      const businessId = await this.validateShiftTypeCreationAccess(
        data,
        currentUser,
      );

      // Normalize weekoff to weekOff (handle case-insensitive field name)
      if (data.weekoff !== undefined && data.weekOff === undefined) {
        data.weekOff = data.weekoff;
        delete data.weekoff;
      }

      // Validate shift type data
      this.validateShiftTypeData(data);

      // Check for duplicate title in scope
      await this.checkForDuplicateShiftTypeTitle(
        data.title,
        businessId,
        data.storeId,
      );

      // Calculate duration if not provided
      // Compute status normalization
      if (data.status !== true && data.status !== false) {
        data.status = true;
      }

      // Ensure weekOff is properly set (default to empty array if not provided)
      if (data.weekOff === undefined) {
        data.weekOff = [];
      }

      // Add access control fields
      const shiftTypeData = {
        ...data,
        createdBy: currentUser._id,
        businessId,
      };

      const shiftType = await super.create(shiftTypeData);

      // Populate the created shift type
      const ShiftModel = await this.getModelRef();
      const populatedShiftType = await ShiftModel.findById(shiftType._id)
        .lean()
        .exec();

      // Handle cross-database population for createdBy (User is in global database)
      if (populatedShiftType.createdBy) {
        try {
          const user = await User.findById(populatedShiftType.createdBy)
            .select('firstName lastName email')
            .lean();
          populatedShiftType.createdBy = user;
        } catch (error) {
          console.warn('Failed to populate createdBy user:', error.message);
          populatedShiftType.createdBy = null;
        }
      }

      // Handle cross-database population for storeId (Store is in tenant database)
      if (populatedShiftType.storeId) {
        try {
          const StoreModel = await this.getModel(
            'Store',
            StoreSchema,
            'stores',
          );
          const store = await StoreModel.findById(populatedShiftType.storeId)
            .select('name description')
            .lean();
          populatedShiftType.storeId = store;
        } catch (error) {
          console.warn('Failed to populate store:', error.message);
          populatedShiftType.storeId = null;
        }
      }

      return await this.transformShiftTypeForResponse(populatedShiftType);
    } catch (error) {
      console.log(error);
      throw new Error(`Error creating shift type: ${error.message}`);
    }
  }

  /**
   * Update shift type by ID with access control
   * @param {String} id - Shift type ID
   * @param {Object} data - Update data
   * @param {Object} currentUser - Current user making the request
   * @returns {Object} Updated shift type
   */
  async updateById(id, data, currentUser) {
    try {
      // Get existing shift type and validate access
      const existingShiftType = await this.getById(id);
      if (!existingShiftType) {
        throw new Error(`Shift type with id ${id} not found`);
      }

      // Normalize weekoff to weekOff (handle case-insensitive field name)
      if (data.weekoff !== undefined && data.weekOff === undefined) {
        data.weekOff = data.weekoff;
        delete data.weekoff;
      }

      // Validate access control
      await this.validateShiftTypeUpdateAccess(
        existingShiftType,
        data,
        currentUser,
      );

      // Validate shift type data if provided
      if (
        data.startTime ||
        data.endTime ||
        data.title ||
        data.shiftType ||
        data.weekOff !== undefined
      ) {
        this.validateShiftTypeData(data);
      }

      // Check for duplicate shift type name if name is being updated
      if (data.title && data.title !== existingShiftType.title) {
        await this.checkForDuplicateShiftTypeTitle(
          data.title,
          existingShiftType.businessId,
          data.storeId || existingShiftType.storeId,
          id,
        );
      }

      // Calculate duration if start/end time is updated
      // Normalize status if provided
      if (data.status && data.status !== true && data.status !== false) {
        data.status = true;
      }

      const updatedShiftType = await super.updateById(id, data);
      if (!updatedShiftType) {
        throw new Error(`Shift type with id ${id} not found`);
      }

      // Populate the updated shift type
      const ShiftModel = await this.getModelRef();
      const populatedShiftType = await ShiftModel.findById(updatedShiftType._id)
        .lean()
        .exec();

      // Handle cross-database population for createdBy (User is in global database)
      if (populatedShiftType.createdBy) {
        try {
          const user = await User.findById(populatedShiftType.createdBy)
            .select('firstName lastName email')
            .lean();
          populatedShiftType.createdBy = user;
        } catch (error) {
          console.warn('Failed to populate createdBy user:', error.message);
          populatedShiftType.createdBy = null;
        }
      }

      // Handle cross-database population for storeId (Store is in tenant database)
      if (populatedShiftType.storeId) {
        try {
          const StoreModel = await this.getModel(
            'Store',
            StoreSchema,
            'stores',
          );
          const store = await StoreModel.findById(populatedShiftType.storeId)
            .select('name description')
            .lean();
          populatedShiftType.storeId = store;
        } catch (error) {
          console.warn('Failed to populate store:', error.message);
          populatedShiftType.storeId = null;
        }
      }

      return await this.transformShiftTypeForResponse(populatedShiftType);
    } catch (error) {
      throw new Error(`Error updating shift type: ${error.message}`);
    }
  }

  /**
   * Delete shift type by ID with access control
   * @param {String} id - Shift type ID
   * @param {Object} currentUser - Current user making the request
   * @returns {Object} Deleted shift type
   */
  async deleteById(id, currentUser) {
    try {
      // Get existing shift type and validate access
      const existingShiftType = await this.getById(id);
      if (!existingShiftType) {
        throw new Error(`Shift type with id ${id} not found`);
      }

      // Validate access control
      await this.validateShiftTypeDeleteAccess(existingShiftType, currentUser);

      const deletedShiftType = await super.deleteById(id);
      return deletedShiftType;
    } catch (error) {
      throw new Error(`Error deleting shift type: ${error.message}`);
    }
  }

  /**
   * Bulk get shift types by IDs
   * @param {Array<string>} ids - Shift type IDs to retrieve
   * @param {Object} options - Optional configuration
   * @param {Boolean} options.lean - Return lean documents (default: true)
   * @param {Boolean} options.throwOnNotFound - Throw if any ID missing (default: false)
   * @returns {Promise<Object>} Bulk get result with data, found, notFound counts
   */
  async bulkGetShiftTypes(ids, options = {}) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('Shift type IDs array is required and must not be empty');
      }

      const validIds = ids.map((id) => {
        const normalized = typeof id === 'string' ? id.trim() : id?.toString?.();
        if (!normalized) {
          throw new Error('Invalid shift type ID format');
        }
        this.validateObjectId(normalized);
        return normalized;
      });

      const { lean = true, throwOnNotFound = false } = options;

      const ShiftModel = await this.getModelRef();

      // Build filter with tenant isolation
      const filter = {
        _id: { $in: validIds },
      };

      // Enforce tenant isolation if businessId is set
      if (this.businessId) {
        filter.businessId = this.businessId;
      }

      let query = ShiftModel.find(filter);

      if (lean) {
        query = query.lean();
      }

      const shiftTypes = await query.exec();

      // Handle cross-database population
      const populatedShiftTypes = await Promise.all(
        shiftTypes.map(async (shiftType) => {
          // Populate createdBy (User is in global database)
          if (shiftType.createdBy) {
            try {
              const user = await User.findById(shiftType.createdBy)
                .select('firstName lastName email')
                .lean();
              shiftType.createdBy = user;
            } catch (error) {
              console.warn('Failed to populate createdBy user:', error.message);
              shiftType.createdBy = null;
            }
          }

          // Populate storeId (Store is in tenant database)
          if (shiftType.storeId) {
            try {
              const StoreModel = await this.getModel(
                'Store',
                StoreSchema,
                'stores',
              );
              const store = await StoreModel.findById(shiftType.storeId)
                .select('name description')
                .lean();
              shiftType.storeId = store;
            } catch (error) {
              console.warn('Failed to populate store:', error.message);
              shiftType.storeId = null;
            }
          }

          return shiftType;
        }),
      );

      // Transform shift types for response
      const transformedShiftTypes = await Promise.all(
        populatedShiftTypes.map((shiftType) =>
          this.transformShiftTypeForResponse(shiftType),
        ),
      );

      const foundIds = shiftTypes.map((st) => st._id.toString());
      const notFoundIds = validIds.filter((id) => !foundIds.includes(id));

      if (throwOnNotFound && notFoundIds.length > 0) {
        throw new Error(
          `Shift types not found for IDs: ${notFoundIds.join(', ')}`,
        );
      }

      return {
        data: transformedShiftTypes,
        found: transformedShiftTypes.length,
        notFound: notFoundIds,
        totalRequested: validIds.length,
      };
    } catch (error) {
      throw new Error(`Error bulk getting shift types: ${error.message}`);
    }
  }

  /**
   * Bulk update shift type statuses
   * @param {Array<string>} ids - Shift type IDs to update
   * @param {Boolean} status - New status value
   * @param {Object} currentUser - Current user making the request
   * @returns {Promise<Object>} Bulk update result
   */
  async bulkUpdateStatus(ids, status, currentUser) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('Shift type IDs array is required and must not be empty');
      }

      if (typeof status !== 'boolean') {
        throw new Error('Status must be a boolean value');
      }

      const validIds = ids.map((id) => {
        const normalized = typeof id === 'string' ? id.trim() : id?.toString?.();
        if (!normalized) {
          throw new Error('Invalid shift type ID format');
        }
        this.validateObjectId(normalized);
        return normalized;
      });

      const ShiftModel = await this.getModelRef();

      // Build filter with tenant isolation
      const filter = {
        _id: { $in: validIds },
      };

      // Enforce tenant isolation if businessId is set
      if (this.businessId) {
        filter.businessId = this.businessId;
      }

      // Validate access for all shift types before updating
      const existingShiftTypes = await ShiftModel.find(filter).lean();
      const foundIds = existingShiftTypes.map((st) => st._id.toString());
      const notFoundIds = validIds.filter((id) => !foundIds.includes(id));

      // Check access control for each shift type
      for (const shiftType of existingShiftTypes) {
        await this.validateShiftTypeUpdateAccess(shiftType, {}, currentUser);
      }

      const result = await ShiftModel.updateMany(
        filter,
        { $set: { status: status, updatedAt: new Date() } },
      );

      return {
        matched: result.matchedCount,
        modified: result.modifiedCount,
        notFound: notFoundIds,
        status: status,
        message: `${result.modifiedCount} shift type(s) ${status ? 'activated' : 'deactivated'} successfully`,
      };
    } catch (error) {
      throw new Error(`Error bulk updating shift type status: ${error.message}`);
    }
  }

  /**
   * Bulk delete shift types
   * @param {Array<string>} ids - Shift type IDs to delete
   * @param {Object} currentUser - Current user making the request
   * @returns {Promise<Object>} Bulk delete result
   */
  async bulkDelete(ids, currentUser) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('Shift type IDs array is required and must not be empty');
      }

      const validIds = ids.map((id) => {
        const normalized = typeof id === 'string' ? id.trim() : id?.toString?.();
        if (!normalized) {
          throw new Error('Invalid shift type ID format');
        }
        this.validateObjectId(normalized);
        return normalized;
      });

      const ShiftModel = await this.getModelRef();

      // Build filter with tenant isolation
      const filter = {
        _id: { $in: validIds },
      };

      // Enforce tenant isolation if businessId is set
      if (this.businessId) {
        filter.businessId = this.businessId;
      }

      // Get existing shift types to validate access
      const existingShiftTypes = await ShiftModel.find(filter).lean();
      const foundIds = existingShiftTypes.map((st) => st._id.toString());
      const notFoundIds = validIds.filter((id) => !foundIds.includes(id));

      // Check access control for each shift type
      for (const shiftType of existingShiftTypes) {
        await this.validateShiftTypeDeleteAccess(shiftType, currentUser);
      }

      // Perform bulk delete
      const result = await ShiftModel.deleteMany({
        _id: { $in: foundIds },
      });

      return {
        deleted: result.deletedCount,
        notFound: notFoundIds,
        totalRequested: validIds.length,
        message: `${result.deletedCount} shift type(s) deleted successfully`,
      };
    } catch (error) {
      throw new Error(`Error bulk deleting shift types: ${error.message}`);
    }
  }

  /**
   * Toggle shift type active status
   * @param {String} id - Shift type ID
   * @param {Object} currentUser - Current user making the request
   * @returns {{message: string, data: Object}} Toggle result
   */
  async toggleStatus(id, currentUser) {
    try {
      this.validateObjectId(id);

      const ShiftModel = await this.getModelRef();
      const existingShiftType = await ShiftModel.findById(id);

      if (!existingShiftType) {
        throw new Error(`Shift type with id ${id} not found`);
      }

      // Enforce tenant isolation when businessId is locked on the service
      if (
        this.businessId &&
        existingShiftType.businessId &&
        existingShiftType.businessId.toString() !== this.businessId.toString()
      ) {
        throw new Error('Shift type not found in this business');
      }

      // Validate access control
      await this.validateShiftTypeUpdateAccess(
        existingShiftType,
        {},
        currentUser,
      );

      existingShiftType.toggleStatus();
      await existingShiftType.save();

      const transformed =
        await this.transformShiftTypeForResponse(existingShiftType);

      return {
        message: `Shift type "${transformed.title}" has been ${
          transformed.status ? 'activated' : 'deactivated'
        } successfully`,
        data: transformed,
      };
    } catch (error) {
      throw new Error(`Error toggling shift type status: ${error.message}`);
    }
  }

  /**
   * Get shift types applicable on a specific day
   * @param {String} dayName - Day name (e.g., 'Monday', 'Tuesday')
   * @param {String} businessId - Business ID
   * @param {String} storeId - Store ID (optional)
   * @returns {Array} Applicable shift types
   */
  async getShiftTypesApplicableOnDay(dayName, businessId, storeId = null) {
    try {
      const filters = { businessId, status: true };

      if (storeId) {
        filters.storeId = storeId;
      } else {
        filters.storeId = null; // Business-wide shift types
      }

      const ShiftModel = await this.getModelRef();
      const shiftTypes = await ShiftModel.findApplicableOnDay(dayName, filters)
        .sort({ startTime: 1 })
        .lean()
        .exec();

      // Handle cross-database population
      const populatedShiftTypes = await Promise.all(
        shiftTypes.map(async (shiftType) => {
          // Populate createdBy (User is in global database)
          if (shiftType.createdBy) {
            try {
              const user = await User.findById(shiftType.createdBy)
                .select('firstName lastName email')
                .lean();
              shiftType.createdBy = user;
            } catch (error) {
              console.warn('Failed to populate createdBy user:', error.message);
              shiftType.createdBy = null;
            }
          }

          // Populate storeId (Store is in tenant database)
          if (shiftType.storeId) {
            try {
              const StoreModel = await this.getModel(
                'Store',
                StoreSchema,
                'stores',
              );
              const store = await StoreModel.findById(shiftType.storeId)
                .select('name description')
                .lean();
              shiftType.storeId = store;
            } catch (error) {
              console.warn('Failed to populate store:', error.message);
              shiftType.storeId = null;
            }
          }

          return shiftType;
        }),
      );

      return await Promise.all(
        populatedShiftTypes.map((shiftType) =>
          this.transformShiftTypeForResponse(shiftType),
        ),
      );
    } catch (error) {
      throw new Error(
        `Error retrieving shift types for ${dayName}: ${error.message}`,
      );
    }
  }

  /**
   * Get shift types with week off information
   * @param {String} businessId - Business ID
   * @param {String} storeId - Store ID (optional)
   * @returns {Array} Shift types with week off data
   */
  async getShiftTypesWithWeekOffInfo(businessId, storeId = null) {
    try {
      const filters = { businessId, status: true };

      if (storeId) {
        filters.storeId = storeId;
      } else {
        filters.storeId = null; // Business-wide shift types
      }

      const ShiftModel = await this.getModelRef();
      const shiftTypes = await ShiftModel.findWithWeekOffInfo(filters)
        .sort({ startTime: 1 })
        .lean()
        .exec();

      return await Promise.all(
        shiftTypes.map((shiftType) =>
          this.transformShiftTypeForResponse(shiftType),
        ),
      );
    } catch (error) {
      throw new Error(
        `Error retrieving shift types with week off info: ${error.message}`,
      );
    }
  }

  /**
   * Add week off day to shift type
   * @param {String} id - Shift type ID
   * @param {String} dayName - Day name to add
   * @param {Object} currentUser - Current user
   * @returns {Object} Updated shift type
   */
  async addWeekOffDay(id, dayName, currentUser) {
    try {
      const existingShiftType = await this.getById(id);
      if (!existingShiftType) {
        throw new Error(`Shift type with id ${id} not found`);
      }

      // Validate access control
      await this.validateShiftTypeUpdateAccess(
        existingShiftType,
        {},
        currentUser,
      );

      const ShiftModel = await this.getModelRef();
      const shiftType = await ShiftModel.findById(id);

      if (!shiftType) {
        throw new Error(`Shift type with id ${id} not found`);
      }

      const added = shiftType.addWeekOffDay(dayName);
      if (!added) {
        throw new Error(`Day ${dayName} is already a week off day`);
      }

      await shiftType.save();
      return await this.getById(id);
    } catch (error) {
      throw new Error(`Error adding week off day: ${error.message}`);
    }
  }

  /**
   * Remove week off day from shift type
   * @param {String} id - Shift type ID
   * @param {String} dayName - Day name to remove
   * @param {Object} currentUser - Current user
   * @returns {Object} Updated shift type
   */
  async removeWeekOffDay(id, dayName, currentUser) {
    try {
      const existingShiftType = await this.getById(id);
      if (!existingShiftType) {
        throw new Error(`Shift type with id ${id} not found`);
      }

      // Validate access control
      await this.validateShiftTypeUpdateAccess(
        existingShiftType,
        {},
        currentUser,
      );

      const ShiftModel = await this.getModelRef();
      const shiftType = await ShiftModel.findById(id);

      if (!shiftType) {
        throw new Error(`Shift type with id ${id} not found`);
      }

      const removed = shiftType.removeWeekOffDay(dayName);
      if (!removed) {
        throw new Error(`Day ${dayName} is not a week off day`);
      }

      await shiftType.save();
      return await this.getById(id);
    } catch (error) {
      throw new Error(`Error removing week off day: ${error.message}`);
    }
  }

  /**
   * Get active shift types for business or store
   * @param {String} businessId - Business ID
   * @param {String} storeId - Store ID (optional)
   * @returns {Array} Active shift types
   */
  async getActiveShiftTypes(businessId, storeId = null) {
    try {
      const filters = { businessId, status: true };

      if (storeId) {
        filters.storeId = storeId;
      } else {
        filters.storeId = null; // Business-wide shift types
      }

      const ShiftModel = await this.getModelRef();
      const shiftTypes = await ShiftModel.find(filters)
        .sort({ startTime: 1 })
        .lean()
        .exec();

      // Handle cross-database population for both User (global) and Store (tenant)
      const populatedShiftType = await Promise.all(
        shiftTypes.map(async (shiftType) => {
          // Populate createdBy (User is in global database)
          if (shiftType.createdBy) {
            try {
              const user = await User.findById(shiftType.createdBy)
                .select('firstName lastName email')
                .lean();
              shiftType.createdBy = user;
            } catch (error) {
              console.warn('Failed to populate createdBy user:', error.message);
              shiftType.createdBy = null;
            }
          }

          // Populate storeId (Store is in tenant database)
          if (shiftType.storeId) {
            try {
              const StoreModel = await this.getModel(
                'Store',
                StoreSchema,
                'stores',
              );
              const store = await StoreModel.findById(shiftType.storeId)
                .select('name description')
                .lean();
              shiftType.storeId = store;
            } catch (error) {
              console.warn('Failed to populate store:', error.message);
              shiftType.storeId = null;
            }
          }

          return shiftType;
        }),
      );

      return await Promise.all(
        populatedShiftType.map((shiftType) =>
          this.transformShiftTypeForResponse(shiftType),
        ),
      );
    } catch (error) {
      throw new Error(`Error retrieving active shift types: ${error.message}`);
    }
  }

  /**
   * Validate shift type data
   * @param {Object} data - Shift type data
   */
  validateShiftTypeData(data) {
    if (data.startTime && data.endTime) {
      // Validate time range for both same-day and overnight shifts
      const isValidTime = this._isValidTimeRange(data.startTime, data.endTime);
      if (!isValidTime) {
        throw new Error('Invalid time range for shift type');
      }
    }

    if (!data.title) {
      throw new Error('Title is required');
    }

    // Validate weekOff data if provided
    if (data.weekOff !== undefined) {
      this._validateWeekOffData(data.weekOff);
    }
  }

  /**
   * Validate weekOff data
   * @param {Array} weekOff - Week off days array
   */
  _validateWeekOffData(weekOff) {
    if (!Array.isArray(weekOff)) {
      throw new Error('Week off must be an array');
    }

    const validDays = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ];

    // Check for valid day names
    for (const day of weekOff) {
      if (!validDays.includes(day)) {
        throw new Error(
          `Invalid day name: ${day}. Must be one of: ${validDays.join(', ')}`,
        );
      }
    }

    // Check for duplicates
    const uniqueDays = new Set(weekOff);
    if (uniqueDays.size !== weekOff.length) {
      throw new Error('Week off days must be unique');
    }
  }

  /**
   * Validate time range for shift
   * @param {String} startTime - Start time (HH:MM)
   * @param {String} endTime - End time (HH:MM)
   * @returns {Boolean} Whether the time range is valid
   */
  _isValidTimeRange(startTime, endTime) {
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);

    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    let durationMinutes;
    if (endMinutes < startMinutes) {
      // Crosses midnight (overnight shift)
      durationMinutes = 24 * 60 - startMinutes + endMinutes;
    } else {
      // Same day shift
      durationMinutes = endMinutes - startMinutes;
    }

    // Valid shift duration: 1-24 hours (60-1440 minutes)
    return durationMinutes >= 60 && durationMinutes <= 1440;
  }

  /**
   * Calculate duration between start and end time
   * @param {String} startTime - Start time (HH:MM)
   * @param {String} endTime - End time (HH:MM)
   * @returns {Number} Duration in hours
   */
  calculateDuration(startTime, endTime) {
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);

    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    const durationMinutes = endMinutes - startMinutes;
    return Math.round((durationMinutes / 60) * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Check for duplicate shift type name
   * @param {String} name - Shift type name
   * @param {String} businessId - Business ID
   * @param {String} storeId - Store ID
   * @param {String} excludeId - Shift type ID to exclude from check
   */
  async checkForDuplicateShiftTypeTitle(
    title,
    businessId,
    storeId,
    excludeId = null,
  ) {
    const filters = {
      title: { $regex: new RegExp(`^${title}$`, 'i') }, // Case-insensitive exact match
      businessId,
    };

    if (storeId) {
      filters.storeId = storeId;
    } else {
      filters.storeId = null; // Business-wide shift types
    }

    if (excludeId) {
      filters._id = { $ne: excludeId };
    }

    const ShiftModel = await this.getModelRef();
    const existingShiftType = await ShiftModel.findOne(filters);

    if (existingShiftType) {
      const scope = storeId ? 'store' : 'business';
      throw new Error(
        `Shift type with title "${title}" already exists in this ${scope}`,
      );
    }
  }

  /**
   * Transform shift type data for response
   * @param {Object} shiftType - Shift type document
   * @returns {Object} Transformed shift type data
   */
  async transformShiftTypeForResponse(shiftType) {
    if (!shiftType) return shiftType;

    const shiftTypeObj = shiftType.toObject ? shiftType.toObject() : shiftType;

    return {
      // Strict response fields
      shiftTypeId: shiftTypeObj._id,
      title: shiftTypeObj.title,
      shiftType: shiftTypeObj.shiftType,
      startTime: shiftTypeObj.startTime,
      endTime: shiftTypeObj.endTime,
      breakDuration: shiftTypeObj.breakDuration || 0,
      status: shiftTypeObj.status,

      // Week off information
      weekOff: shiftTypeObj.weekOff || [],
      weekOffCount: shiftTypeObj.weekOff ? shiftTypeObj.weekOff.length : 0,
      workingDaysCount:
        7 - (shiftTypeObj.weekOff ? shiftTypeObj.weekOff.length : 0),
      isFullWeekOff: shiftTypeObj.weekOff
        ? shiftTypeObj.weekOff.length === 7
        : false,
      isRegularShift: shiftTypeObj.weekOff
        ? shiftTypeObj.weekOff.length === 0
        : true,
      workingDays: this._getWorkingDays(shiftTypeObj.weekOff),

      // Business and store information
      businessId: shiftTypeObj.businessId,
      storeId: shiftTypeObj.storeId,
      store: shiftTypeObj.storeId
        ? {
            _id: shiftTypeObj.storeId._id,
            name: shiftTypeObj.storeId.name,
            description: shiftTypeObj.storeId.description,
          }
        : null,
      scope: shiftTypeObj.storeId ? 'store' : 'business',

      // Creator information
      createdBy: shiftTypeObj.createdBy,
      createdAt: shiftTypeObj.createdAt,
      updatedAt: shiftTypeObj.updatedAt,
      createdDateFormatted: this._formatDate(shiftTypeObj.createdAt),

      // Original data for backward compatibility
      _id: shiftTypeObj._id,
      __v: shiftTypeObj.__v,
    };
  }

  /**
   * Get working days (days that are not week off)
   * @param {Array} weekOffDays - Array of week off day names
   * @returns {Array} Array of working day names
   */
  _getWorkingDays(weekOffDays) {
    const allDays = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ];
    const weekOff = weekOffDays || [];
    return allDays.filter((day) => !weekOff.includes(day));
  }

  /**
   * Format date for display
   * @param {Date|String} date - Date to format
   * @returns {String} Formatted date string
   */
  _formatDate(date) {
    return new Date(date).toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  }

  // ===== ACCESS CONTROL METHODS =====

  /**
   * Validate shift type creation access
   * @param {Object} data - Shift type data
   * @param {Object} currentUser - Current user
   * @returns {String} Business ID
   */
  async validateShiftTypeCreationAccess(data, currentUser) {
    const userRole = currentUser.roleId?.name;

    // Superadmin can create shift types for anyone
    if (userRole === 'superadmin') {
      return data.businessId || this.businessId;
    }

    // Admin (business owner) can create shift types for their business
    if (userRole === 'admin') {
      const businessId =
        data.businessId ||
        this.businessId ||
        (await this.getBusinessIdForUser(currentUser));
      const isOwner = await this.isBusinessOwner(currentUser, businessId);

      if (!isOwner) {
        throw new Error(
          'Unauthorized: Only business owners can create shift types for their business',
        );
      }

      // Admin can create business-wide shift types (storeId = null) or for any store in their business
      if (data.storeId) {
        await this.validateStoreBelongsToBusiness(data.storeId, businessId);
      }

      return businessId;
    }

    // Manager can create shift types for their assigned stores only
    if (userRole === 'manager') {
      const businessId = await this.getBusinessIdForUser(currentUser);

      if (!data.storeId) {
        throw new Error('Managers can only create store-specific shift types');
      }

      await this.validateManagerCanManageStore(data.storeId, currentUser);
      return businessId;
    }

    throw new Error('Unauthorized: Invalid user role for shift type creation');
  }

  /**
   * Validate shift type update access
   * @param {Object} existingShiftType - Existing shift type
   * @param {Object} data - Update data
   * @param {Object} currentUser - Current user
   */
  async validateShiftTypeUpdateAccess(existingShiftType, data, currentUser) {
    const userRole = currentUser.roleId?.name;

    // Superadmin can update any shift type
    if (userRole === 'superadmin') {
      return;
    }

    // Admin (business owner) can update any shift type in their business
    if (userRole === 'admin') {
      const isOwner = await this.isBusinessOwner(
        currentUser,
        existingShiftType.businessId,
      );
      if (!isOwner) {
        throw new Error(
          'Unauthorized: You can only update shift types in your business',
        );
      }
      return;
    }

    // Manager can update shift types for their assigned stores only
    if (userRole === 'manager') {
      if (!existingShiftType.storeId) {
        throw new Error(
          'Unauthorized: Managers cannot update business-wide shift types',
        );
      }

      await this.validateManagerCanManageStore(
        existingShiftType.storeId,
        currentUser,
      );
      return;
    }

    throw new Error('Unauthorized: Invalid user role for shift type update');
  }

  /**
   * Validate shift type delete access
   * @param {Object} existingShiftType - Existing shift type
   * @param {Object} currentUser - Current user
   */
  async validateShiftTypeDeleteAccess(existingShiftType, currentUser) {
    const userRole = currentUser.roleId?.name;

    // Superadmin can delete any shift type
    if (userRole === 'superadmin') {
      return;
    }

    // Admin (business owner) can delete any shift type in their business
    if (userRole === 'admin') {
      const isOwner = await this.isBusinessOwner(
        currentUser,
        existingShiftType.businessId,
      );
      if (!isOwner) {
        throw new Error(
          'Unauthorized: You can only delete shift types in your business',
        );
      }
      return;
    }

    // Manager can delete shift types for their assigned stores only
    if (userRole === 'manager') {
      if (!existingShiftType.storeId) {
        throw new Error(
          'Unauthorized: Managers cannot delete business-wide shift types',
        );
      }

      await this.validateManagerCanManageStore(
        existingShiftType.storeId,
        currentUser,
      );
      return;
    }

    throw new Error('Unauthorized: Invalid user role for shift type deletion');
  }

  /**
   * Check if user is business owner
   * @param {Object} currentUser - Current user
   * @param {String} businessId - Business ID
   * @returns {Boolean} Is business owner
   */
  async isBusinessOwner(currentUser, businessId) {
    const business = await Business.findById(businessId)
      .select('owner')
      .lean()
      .exec();

    if (!business) {
      return false;
    }

    return business.owner.toString() === currentUser._id.toString();
  }

  /**
   * Get business ID for user
   * @param {Object} currentUser - Current user
   * @returns {String} Business ID
   */
  async getBusinessIdForUser(currentUser) {
    const userRole = currentUser.roleId?.name;

    if (userRole === 'admin') {
      // Admin users own the business directly
      const business = await Business.findOne({ owner: currentUser._id })
        .select('_id')
        .lean()
        .exec();
      if (!business) {
        throw new Error('Business not found for admin user');
      }
      return business._id;
    }

    if (userRole === 'manager') {
      // Manager users: Find their store, then find the business that owns that store
      const StoreModel = await this.getModel('Store', StoreSchema, 'stores');
      const store = await StoreModel.findOne({ manager: currentUser._id })
        .select('owner')
        .lean()
        .exec();

      if (!store) {
        throw new Error('Store not found for manager user');
      }

      // Find the business owned by the store owner
      const business = await Business.findOne({ owner: store.owner })
        .select('_id')
        .lean()
        .exec();

      if (!business) {
        throw new Error('Business not found for store owner');
      }

      return business._id;
    }

    throw new Error('Unable to determine business for user role: ' + userRole);
  }

  /**
   * Validate that store belongs to business
   * @param {String} storeId - Store ID
   * @param {String} businessId - Business ID
   */
  async validateStoreBelongsToBusiness(storeId, businessId) {
    const StoreModel = await this.getModel('Store', StoreSchema, 'stores');
    const store = await StoreModel.findById(storeId).select('owner').lean();

    if (!store) {
      throw new Error('Store not found');
    }

    const business = await Business.findById(businessId).select('owner').lean();
    if (!business) {
      throw new Error('Business not found');
    }

    if (business.owner.toString() !== store.owner.toString()) {
      throw new Error('Store does not belong to your business');
    }
  }

  /**
   * Validate that manager can manage store
   * @param {String} storeId - Store ID
   * @param {Object} currentUser - Current user
   */
  async validateManagerCanManageStore(storeId, currentUser) {
    const StoreModel = await this.getModel('Store', StoreSchema, 'stores');
    const store = await StoreModel.findById(storeId).select('manager').lean();

    if (!store) {
      throw new Error('Store not found');
    }

    if (store.manager.toString() !== currentUser._id.toString()) {
      throw new Error(
        'Unauthorized: You can only manage shift types for stores you manage',
      );
    }
  }

  /**
   * Get shift types with business context filtering
   * @param {Object} queryParams - Query parameters
   * @param {Object} currentUser - Current user
   * @returns {Object} Filtered shift types
   */
  async listWithBusinessContext(queryParams = {}, currentUser) {
    const userRole = currentUser.roleId?.name;
    let businessId;

    // Determine business context based on user role
    if (userRole === 'admin') {
      businessId = await this.getBusinessIdForUser(currentUser);
    } else if (userRole === 'manager') {
      businessId = await this.getBusinessIdForUser(currentUser);
    } else if (userRole === 'superadmin') {
      // Superadmin can see all shift types
      return await this.list(queryParams);
    } else {
      throw new Error('Unauthorized: Invalid user role');
    }

    // Add business filter to query params
    const filteredParams = {
      ...queryParams,
      businessId,
    };

    return await this.list(filteredParams);
  }

  /**
   * Get shift type by ID with business context
   * @param {String} id - Shift type ID
   * @param {Object} currentUser - Current user
   * @returns {Object} Shift type data
   */
  async getByIdWithBusinessContext(id, currentUser) {
    const shiftType = await this.getById(id);

    if (!shiftType) {
      return null;
    }

    const userRole = currentUser.roleId?.name;

    // Superadmin can access any shift type
    if (userRole === 'superadmin') {
      return shiftType;
    }

    // Check business context for other roles
    const businessId = await this.getBusinessIdForUser(currentUser);

    if (
      shiftType.businessId &&
      shiftType.businessId.toString() !== businessId.toString()
    ) {
      throw new Error(
        'Unauthorized: You can only access shift types in your business',
      );
    }

    return shiftType;
  }
}

export default ShiftTypeService;
