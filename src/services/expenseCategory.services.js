import { BaseService } from '../utils/index.js';
import { ExpenseCategorySchema } from '../models/index.js';

class ExpenseCategoryServices extends BaseService {
  constructor(businessId = null) {
    if (!businessId) {
      throw new Error('ProductServices initialized without businessId');
    }
    // Resolve ExpenseCategory model per-tenant using its schema; fall back to global when no businessId
    super({
      modelName: 'ExpenseCategory',
      schema: ExpenseCategorySchema,
      collection: 'expensecategories',
      businessId,
    });
  }

  /**
   * Create a new expense category
   * @param {Object} data - Category data
   * @param {string} businessId - Business ID
   * @returns {Promise<Object>} Created category
   */
  async create(data, businessId) {
    try {
      if (!businessId) {
        throw new Error('Business ID is required');
      }

      // Validate required fields
      this.validateRequiredFields(data, ['name']);

      const Model = await this.getModel();
      const payload = { ...data, business: businessId };

      const created = await Model.create(payload);
      return created.toObject ? created.toObject() : created;
    } catch (error) {
      if (error.name === 'ValidationError') {
        const validationErrors = Object.values(error.errors).map(
          (e) => e.message,
        );
        throw new Error(`Validation failed: ${validationErrors.join(', ')}`);
      }
      if (error.code === 11000) {
        const field = Object.keys(error.keyPattern || {})[0] || 'field';
        throw new Error(`${field} already exists`);
      }
      throw new Error(`Error creating expense category: ${error.message}`);
    }
  }

  /**
   * Get expense category by ID
   * @param {string} id - Category ID
   * @param {string} businessId - Business ID
   * @returns {Promise<Object>} Category data
   */
  async getById(id, businessId) {
    try {
      if (!businessId) {
        throw new Error('Business ID is required');
      }

      this.validateObjectId(id);
      const Model = await this.getModel();
      const filter = { _id: id, isDeleted: false };

      const doc = await Model.findOne(filter).lean();
      if (!doc) {
        throw new Error(`Expense category with id ${id} not found`);
      }

      return doc;
    } catch (error) {
      throw new Error(`Error retrieving expense category: ${error.message}`);
    }
  }

  /**
   * Update expense category by ID
   * @param {string} id - Category ID
   * @param {Object} data - Update data
   * @param {string} businessId - Business ID
   * @returns {Promise<Object>} Updated category
   */
  async updateById(id, data, businessId) {
    try {
      if (!businessId) {
        throw new Error('Business ID is required');
      }

      this.validateObjectId(id);
      const Model = await this.getModel();
      const filter = { _id: id, isDeleted: false };

      const updated = await Model.findOneAndUpdate(filter, data, {
        new: true,
        runValidators: true,
      }).lean();

      if (!updated) {
        throw new Error(`Expense category with id ${id} not found`);
      }

      return updated;
    } catch (error) {
      if (error.name === 'ValidationError') {
        const validationErrors = Object.values(error.errors).map(
          (e) => e.message,
        );
        throw new Error(`Validation failed: ${validationErrors.join(', ')}`);
      }
      if (error.code === 11000) {
        const field = Object.keys(error.keyPattern || {})[0] || 'field';
        throw new Error(`${field} already exists`);
      }
      throw new Error(`Error updating expense category: ${error.message}`);
    }
  }

  /**
   * Delete expense category by ID
   * @param {string} id - Category ID
   * @param {string} businessId - Business ID
   * @returns {Promise<Object>} Deleted category
   */
  async deleteById(id, businessId) {
    try {
      if (!businessId) {
        throw new Error('Business ID is required');
      }

      this.validateObjectId(id);
      const Model = await this.getModel();
      // Soft delete implementation
      const deleted = await this.softDeleteById(id);
      if (!deleted) {
        throw new Error(`Expense category with id ${id} not found`);
      }

      return deleted;
    } catch (error) {
      throw new Error(`Error deleting expense category: ${error.message}`);
    }
  }

  /**
   * List expense categories with advanced filtering, search, and pagination
   * Optimized for <100ms response time
   * @param {Object} queryParams - Query parameters
   * @param {string} businessId - Business ID
   * @returns {Promise<Object>} Paginated results
   */
  async list(queryParams = {}, businessId) {
    try {
      if (!businessId) {
        throw new Error('Business ID is required');
      }

      const {
        isActive,
        all,
        search = '',
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = queryParams;

      const filter = { isDeleted: false };
      if (isActive !== undefined) {
        filter.status = isActive === 'true';
      }

      // Handle 'all' case for no pagination
      if (all) {
        const Model = await this.getModel();

        // Build search filter manually for 'all' case
        if (search) {
          filter.$or = [
            { name: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
          ];
        }

        const sort = {};
        const allowedSortFields = ['name', 'status', 'createdAt', 'updatedAt'];
        const sortField = allowedSortFields.includes(sortBy)
          ? sortBy
          : 'createdAt';
        const sortDirection = sortOrder === 'desc' ? -1 : 1;
        sort[sortField] = sortDirection;

        const items = await Model.find(filter).sort(sort).lean();
        const total = items.length;

        return {
          data: items,
          total: total,
        };
      }

      // Use BaseService.list for paginated results
      const allowedSortFields = ['name', 'status', 'createdAt', 'updatedAt'];
      const sanitizedSortBy = allowedSortFields.includes(sortBy)
        ? sortBy
        : 'createdAt';

      const result = await super.list({
        ...queryParams,
        sortBy: sanitizedSortBy,
        filters: filter,
        searchFields: ['name', 'description'],
      });

      return result;
    } catch (error) {
      throw new Error(`Error listing expense categories: ${error.message}`);
    }
  }

  /**
   * Get all active expense categories (for dropdowns/selects)
   * Optimized for <50ms response time
   * @param {string} businessId - Business ID
   * @returns {Promise<Array>} Active categories
   */
  async getActiveCategories(businessId) {
    try {
      if (!businessId) {
        throw new Error('Business ID is required');
      }

      const Model = await this.getModel();
      return await Model.find({ status: true, isDeleted: false })
        .select('name description')
        .sort({ name: 1 })
        .lean(); // Use lean() for better performance
    } catch (error) {
      throw new Error(
        `Error retrieving active expense categories: ${error.message}`,
      );
    }
  }

  /**
   * Toggle category status
   * @param {string} id - Category ID
   * @param {string} businessId - Business ID
   * @returns {Promise<Object>} Updated category
   */
  async toggleStatus(id, businessId) {
    try {
      if (!businessId) {
        throw new Error('Business ID is required');
      }

      this.validateObjectId(id);
      const Model = await this.getModel();
      const filter = { _id: id };

      const category = await Model.findOne(filter);
      if (!category) {
        throw new Error(`Expense category with id ${id} not found`);
      }

      category.status = !category.status;
      await category.save();

      return category.toObject ? category.toObject() : category;
    } catch (error) {
      throw new Error(
        `Error toggling expense category status: ${error.message}`,
      );
    }
  }

  /**
   * Get category statistics
   * @param {string} businessId - Business ID
   * @returns {Promise<Object>} Category statistics
   */
  async getStatistics(businessId) {
    try {
      if (!businessId) {
        throw new Error('Business ID is required');
      }

      const Model = await this.getModel();

      const [total, active, inactive] = await Promise.all([
        Model.countDocuments({ isDeleted: false }),
        Model.countDocuments({ status: true, isDeleted: false }),
        Model.countDocuments({ status: false, isDeleted: false }),
      ]);

      return {
        total,
        active,
        inactive,
      };
    } catch (error) {
      throw new Error(`Error retrieving category statistics: ${error.message}`);
    }
  }

  /**
   * Bulk get expense categories by IDs
   * @param {Array<string>} ids - Category IDs
   * @param {Object} options - Options
   * @returns {Promise<Object>} Result
   */
  async bulkGet(ids, options = {}) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('Category IDs array is required and must not be empty');
      }

      const normalizedIds = ids.map((id) => {
        this.validateObjectId(id);
        return id;
      });

      const { populate = null, lean = true, throwOnNotFound = false } = options;

      const result = await this.bulkGetByIds(normalizedIds, {
        populate,
        lean,
        throwOnNotFound,
      });

      return {
        data: result.documents,
        found: result.found,
        notFound: result.notFound,
        totalRequested: result.totalRequested,
      };
    } catch (error) {
      throw new Error(`Bulk get expense categories failed: ${error.message}`);
    }
  }

  /**
   * Bulk update status of expense categories
   * @param {Array<string>} ids - Category IDs
   * @param {Boolean} status - New status
   * @returns {Promise<Object>} Result
   */
  async bulkUpdateStatus(ids, status) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('Category IDs array is required');
      }

      const normalizedIds = ids.map((id) => {
        this.validateObjectId(id);
        return id;
      });

      const Model = await this.getModel();
      const result = await Model.updateMany(
        { _id: { $in: normalizedIds }, isDeleted: false },
        { $set: { status: status } },
      );

      return {
        matched: result.matchedCount,
        modified: result.modifiedCount,
      };
    } catch (error) {
      throw new Error(
        `Error bulk updating expense category status: ${error.message}`,
      );
    }
  }

  /**
   * Bulk delete expense categories (soft delete)
   * @param {Array<string>} ids - Category IDs
   * @returns {Promise<Object>} Result
   */
  async bulkDelete(ids) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('Category IDs array is required');
      }

      const normalizedIds = ids.map((id) => {
        this.validateObjectId(id);
        return id;
      });

      const Model = await this.getModel();
      const result = await Model.updateMany(
        { _id: { $in: normalizedIds }, isDeleted: false },
        {
          $set: {
            isDeleted: true,
            deletedAt: new Date(),
          },
        },
      );

      return {
        matched: result.matchedCount,
        modified: result.modifiedCount,
      };
    } catch (error) {
      throw new Error(`Error bulk deleting expense categories: ${error.message}`);
    }
  }
}

export default ExpenseCategoryServices;
