import { BaseService } from '../utils/index.js';
import { LeaveTypeSchema } from '../models/index.js';

class LeaveTypeServices extends BaseService {
  constructor(businessId) {
    if (!businessId) {
      throw new Error('LeaveTypeServices initialized without businessId');
    }
    super({
      modelName: 'LeaveType',
      schema: LeaveTypeSchema,
      collection: 'leaveTypes',
      businessId,
    });
  }

  /**
   * Validate leave type data before creation/update
   * @param {Object} data - Leave type data
   * @returns {Object} Validated data
   */
  validateLeaveTypeData(data) {
    // Validate paidCount for Paid leave types
    if (data.type === 'Paid') {
      if (data.paidCount === undefined || data.paidCount === null) {
        throw new Error('Paid count is required for Paid leave types');
      }
      if (typeof data.paidCount !== 'number' || data.paidCount < 0) {
        throw new Error('Paid count must be a non-negative number');
      }
    } else if (data.type === 'Unpaid') {
      // Remove paidCount for Unpaid leave types
      delete data.paidCount;
    }

    return data;
  }

  /**
   * Override create method to add custom validation
   * @param {Object} data - Leave type data
   * @param {Object} options - Additional options
   * @returns {Object} Created leave type
   */
  async create(data, options = {}) {
    // Inject businessId from service context
    const validatedData = this.validateLeaveTypeData({
      ...data,
      businessId: this.businessId,
    });
    const created = await super.create(validatedData, options);
    // Return minimal payload to reduce serialization overhead
    return {
      _id: created._id,
      name: created.name,
      description: created.description,
      type: created.type,
      paidCount: created.paidCount,
      status: created.status,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
  }

  /**
   * Override updateById method to add custom validation
   * @param {String} id - Leave type ID
   * @param {Object} data - Update data
   * @returns {Object} Updated leave type
   */
  async updateById(id, data) {
    // Do not allow tenant switch on update
    const { businessId, ...rest } = data || {};
    const validatedData = this.validateLeaveTypeData({ ...rest });
    return await super.updateById(id, validatedData);
  }

  /**
   * Scope list to current businessId automatically
   * Supports isActive query parameter (maps to status) and all parameter for fetching all data
   * Supports search across name, description, type, and paidCount fields
   */
  async list(queryParams = {}) {
    try {
      const {
        all,
        isActive,
        page,
        limit,
        sortBy = 'name',
        sortOrder = 'asc',
        search,
        filters = {},
        ...restParams
      } = queryParams;

      const shouldFetchAll = all === true || all === 'true';

      // Build filter object with businessId scoping
      const baseFilters = {
        ...filters,
        businessId: this.businessId,
      };

      // Map isActive to status filter
      if (isActive !== undefined) {
        baseFilters.status = isActive === 'true' || isActive === true;
      }

      // Add search functionality
      if (search) {
        const searchConditions = [];

        // Text field searches (name, description, type) - use regex
        const textFields = ['name', 'description', 'type'];
        textFields.forEach((field) => {
          searchConditions.push({
            [field]: { $regex: search, $options: 'i' },
          });
        });

        // Numeric field search (paidCount) - handle both exact match and regex
        const numericValue = Number(search);
        if (!isNaN(numericValue)) {
          searchConditions.push({
            paidCount: numericValue,
          });
        }

        // If we have search conditions, add them to filters
        if (searchConditions.length > 0) {
          baseFilters.$or = searchConditions;
        }
      }

      // Prepare parameters for base service list method
      // Let base service handle limit validation, except for 'all' case
      const listParams = {
        page: page || 1,
        limit: shouldFetchAll ? 10000 : limit || 50,
        sortBy,
        sortOrder,
        filters: baseFilters,
        ...restParams,
      };

      // Call base service list method
      const result = await super.list(listParams);

      // If fetching all, return without pagination info
      if (shouldFetchAll) {
        return {
          data: result.data,
          total: result.data.length,
        };
      }

      // Return with pagination (base service already provides this)
      return result;
    } catch (error) {
      throw new Error(`Error listing leave types: ${error.message}`, {
        cause: error,
      });
    }
  }

  /**
   * Toggle the status (Active/Inactive) of a leave type
   * Ensures business isolation.
   * @param {String} id - Leave Type _id
   * @param {String} businessId - Business _id
   * @returns {Promise<Object>}
   */
  async toggleStatus(id, businessId) {
    this.validateObjectId(id);
    const Model = await this.getModel();
    const tenantId = businessId || this.businessId;
    const doc = await Model.findOne({ _id: id, businessId: tenantId });
    if (!doc) {
      const error = new Error('Leave Type not found');
      error.statusCode = 404;
      throw error;
    }

    doc.status = !doc.status;
    await doc.save();
    return {
      message: `Leave Type has been ${doc.status ? 'activated' : 'deactivated'}`,
      data: doc,
    };
  }
}

export default LeaveTypeServices;
