import { BaseService } from '../utils/index.js';
import { BusinessCategory } from '../models/index.js';

class BusinessCategoryServices extends BaseService {
  constructor() {
    super(BusinessCategory);
  }

  async list(queryParams = {}) {
    const { all, isActive, ...otherParams } = queryParams;
    const { filters: incomingFilters = {}, ...restParams } = otherParams;

    // Define search fields for BusinessCategory
    const searchFields = ['categoryName', 'description'];

    // Build filters object - exclude soft deleted by default
    const filters = {
      ...incomingFilters,
      isDeleted: false,
    };

    // Add isActive filter if provided
    if (isActive !== undefined && isActive !== null && isActive !== '') {
      filters.isActive =
        typeof isActive === 'string'
          ? isActive.toLowerCase() === 'true'
          : Boolean(isActive);
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

      // Get all business categories without pagination
      const Model = await this.getModelRef();
      const categories = await Model.find(filter)
        .sort(sort)
        .exec();

      return {
        data: categories,
        total: categories.length,
      };
    }

    return await super.list({
      ...restParams,
      searchFields,
      filters,
    });
  }

  async listPublic(queryParams = {}) {
    // Define search fields for BusinessCategory
    const searchFields = ['categoryName', 'description'];

    // Build filters object - only active categories for public access
    const filters = { isActive: true, isDeleted: false };

    // Use BaseService list method with BusinessCategory specific configuration
    return await super.list({
      ...queryParams,
      searchFields,
      filters,
    });
  }

  async getById(id) {
    this.validateObjectId(id);

    const Model = await this.getModelRef();
    const document = await Model.findOne({ _id: id, isDeleted: false });

    if (!document) {
      throw new Error(`Business category with id ${id} not found`);
    }

    return document;
  }

  async updateById(id, data) {
    this.validateObjectId(id);

    if (!data || typeof data !== 'object') {
      throw new Error('Update data must be a valid object');
    }

    const Model = await this.getModelRef();
    const updatedDocument = await Model.findOneAndUpdate(
      { _id: id, isDeleted: false },
      data,
      {
        new: true,
        runValidators: true,
      },
    );

    if (!updatedDocument) {
      throw new Error(`Business category with id ${id} not found`);
    }

    return updatedDocument;
  }

  async deleteById(id, options = {}) {
    this.validateObjectId(id);

    const Model = await this.getModelRef();
    const update = {
      $set: {
        isDeleted: true,
        isActive: false,
        deletedAt: new Date(),
      },
    };

    const deletedDocument = await Model.findOneAndUpdate(
      { _id: id, isDeleted: false },
      update,
      {
        new: true,
        session: options.session || undefined,
      },
    );

    if (!deletedDocument) {
      throw new Error(`Business category with id ${id} not found`);
    }

    return deletedDocument;
  }

  /**
   * Bulk update the status field for multiple business categories
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
    const update = { $set: { isActive: status } };
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
   * Bulk delete business categories by ids
   * @param {Array<string>} ids - Array of document ObjectIds
   * @param {Object} options - Optional options { session }
   * @returns {Promise<{ deletedCount: number }>} Result summary
   */
  async bulkDelete(ids = [], options = {}) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('ids must be a non-empty array');
      }
      for (const id of ids) {
        this.validateObjectId(id);
      }

      const Model = await this.getModelRef();
      const update = {
        $set: {
          isDeleted: true,
          isActive: false,
          deletedAt: new Date(),
        },
      };
      const filter = { _id: { $in: ids }, isDeleted: false };
      const result = await Model.updateMany(filter, update, {
        session: options.session || undefined,
      });

      return {
        matchedCount: result.matchedCount || 0,
        deletedCount: result.modifiedCount || 0,
      };
    } catch (error) {
      console.log(error);
      throw new Error('Error deleting business categories');
    }
  }

  /**
   * Bulk get business categories by IDs
   * @param {Array<string>} ids - Array of business category IDs to retrieve
   * @param {Object} options - Optional configuration
   * @param {Boolean} options.lean - Return plain JavaScript objects (default: true)
   * @param {Boolean} options.throwOnNotFound - Throw error if any ID not found (default: false)
   * @returns {Promise<Object>} Object containing:
   *   - businessCategories: Array of found business categories
   *   - found: Number of business categories found
   *   - notFound: Array of IDs that were not found
   *   - totalRequested: Total number of IDs requested
   */
  async bulkGetBusinessCategories(ids, options = {}) {
    try {
      // Validate input
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('Business category IDs array is required and must not be empty');
      }

      // Extract options with defaults
      const {
        lean = true,
        throwOnNotFound = false,
      } = options;

      // Use BaseService bulkGetByIds
      const result = await this.bulkGetByIds(ids, {
        populate: null,
        lean,
        throwOnNotFound,
      });

      // Return with renamed 'documents' to 'businessCategories' for clarity
      return {
        data: result.documents,
        found: result.found,
        notFound: result.notFound,
        totalRequested: result.totalRequested,
      };
    } catch (error) {
      throw new Error(`Bulk get business categories failed: ${error.message}`);
    }
  }
}

export default BusinessCategoryServices;
