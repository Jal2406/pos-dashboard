import mongoose from 'mongoose';
import { BaseService } from '../utils/index.js';
import { WarrantySchema } from '../models/Warranty.js';

const WARRANTY_SEARCH_FIELDS = Object.freeze(['warranty', 'description']);

class WarrantyServices extends BaseService {
  constructor(businessId) {
    if (!businessId) {
      throw new Error('WarrantyServices initialized without businessId');
    }
    super({
      modelName: 'Warranty',
      schema: WarrantySchema,
      collection: 'warranties',
      businessId,
    });
  }

  async list(queryParams = {}) {
    const { all, isActive, ...otherParams } = queryParams;
    const {
      search = '',
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 10,
      populate = null,
    } = otherParams;

    const filters = this._composeFilters({ isActive, search });
    const sort = this._composeSort(sortBy, sortOrder);

    if (all === 'true' || all === true) {
      return this._listAllWarranties({ filters, sort, populate });
    }

    return this._listPaginatedWarranties({
      filters,
      sort,
      page,
      limit,
      populate,
    });
  }

  _composeFilters({ isActive, search }) {
    const filters = {};

    if (isActive !== undefined && isActive !== null && isActive !== '') {
      filters.status =
        isActive === 'true' || isActive === true || isActive === 'True';
    }

    if (search && typeof search === 'string' && search.trim()) {
      const term = search.trim();
      filters.$or = WARRANTY_SEARCH_FIELDS.map((field) => ({
        [field]: { $regex: term, $options: 'i' },
      }));
    }

    return filters;
  }

  _composeSort(sortBy, sortOrder) {
    return {
      [sortBy || 'createdAt']:
        sortOrder?.toLowerCase() === 'asc' || sortOrder === 1 ? 1 : -1,
    };
  }

  async _listAllWarranties({ filters, sort, populate }) {
    const Model = await this.getModel();
    let query = Model.find(filters).sort(sort);
    if (populate) query = query.populate(populate);
    const warranties = await query.lean().exec();
    return { data: warranties, total: warranties.length };
  }

  async _listPaginatedWarranties({ filters, sort, page, limit, populate }) {
    const {
      page: validatedPage,
      limit: validatedLimit,
      skip,
    } = this.validatePagination(page, limit);
    const Model = await this.getModel();
    let query = Model.find(filters).sort(sort).skip(skip).limit(validatedLimit);
    if (populate) query = query.populate(populate);
    const [documents, total] = await Promise.all([
      query.lean().exec(),
      Model.countDocuments(filters),
    ]);
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

  async toggleStatus(id) {
    try {
      this.validateObjectId(id);
      const Model = await this.getModel(
        'Warranty',
        WarrantySchema,
        'warranties',
      );
      const existing = await Model.findById(id).select('status');
      if (!existing) {
        throw new Error(`Warranty with id ${id} not found`);
      }
      const updated = await Model.findByIdAndUpdate(
        id,
        { status: !existing.status },
        { new: true },
      );
      return updated;
    } catch (error) {
      throw new Error(`Error toggling warranty status: ${error.message}`);
    }
  }

  /**
   * Bulk get warranties by IDs
   * @param {Array<string>} ids - Array of warranty IDs to retrieve
   * @param {Object} options - Optional configuration
   * @param {Boolean} options.lean - Return plain JavaScript objects (default: true)
   * @param {Boolean} options.throwOnNotFound - Throw error if any ID not found (default: false)
   * @returns {Promise<Object>} Object containing:
   *   - warranties: Array of found warranties
   *   - found: Number of warranties found
   *   - notFound: Array of IDs that were not found
   *   - totalRequested: Total number of IDs requested
   */
  async bulkGetWarranties(ids, options = {}) {
    try {
      // Validate input
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('Warranty IDs array is required and must not be empty');
      }

      // Extract options with defaults
      const { lean = true, throwOnNotFound = false } = options;

      const preparedIds = this._prepareObjectIds(ids);

      // Use BaseService bulkGetByIds
      const result = await this.bulkGetByIds(preparedIds, {
        populate: null,
        lean,
        throwOnNotFound,
      });

      // Return with renamed 'documents' to 'warranties' for clarity
      return {
        data: result.documents,
        found: result.found,
        notFound: result.notFound,
        totalRequested: result.totalRequested,
      };
    } catch (error) {
      throw new Error(`Bulk get warranties failed: ${error.message}`);
    }
  }

  async bulkUpdateStatus(ids, status) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('IDs array is required and must not be empty');
      }

      const preparedIds = this._prepareObjectIds(ids);

      const Model = await this.getModelRef();
      const result = await Model.updateMany(
        { _id: { $in: preparedIds } },
        { status },
      );

      return {
        modifiedCount: result.modifiedCount,
        totalRequested: ids.length,
        message: `${result.modifiedCount} warranties status updated to ${
          status ? 'active' : 'inactive'
        }`,
      };
    } catch (error) {
      throw new Error(`Bulk status update failed: ${error.message}`);
    }
  }

  async bulkDelete(ids) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('No warranty IDs provided for bulk delete');
      }

      const preparedIds = this._prepareObjectIds(ids);

      const Model = await this.getModelRef();
      const result = await Model.deleteMany({ _id: { $in: preparedIds } });

      return {
        deletedCount: result.deletedCount,
        totalRequested: ids.length,
        message: `${result.deletedCount} warranties deleted successfully`,
      };
    } catch (error) {
      throw new Error(`Bulk delete failed: ${error.message}`);
    }
  }

  _prepareObjectIds(ids) {
    return ids.map((id) => {
      const normalized = typeof id === 'string' ? id.trim() : id?.toString?.();

      if (!normalized) {
        throw new Error('Invalid ID format');
      }

      this.validateObjectId(normalized);
      return mongoose.Types.ObjectId.createFromHexString(normalized);
    });
  }

  /**
   * Get active warranties for a business
   * Retrieves all warranties with status: true, commonly used for dropdowns/selects
   * @param {Object} options - Optional configuration
   * @param {string} options.sortBy - Field to sort by (default: 'warranty')
   * @param {string} options.sortOrder - Sort order 'asc' or 'desc' (default: 'asc')
   * @param {string|Array} options.populate - Fields to populate (optional)
   * @returns {Promise<Array>} Array of active warranty documents
   */
  async getActiveWarranties(options = {}) {
    const { sortBy = 'warranty', sortOrder = 'asc', populate = null } = options;
    const Model = await this.getModel();
    let query = Model.find({ status: true }).sort(
      this._composeSort(sortBy, sortOrder),
    );
    if (populate) query = query.populate(populate);
    return query.lean().exec();
  }
}

export default WarrantyServices;
