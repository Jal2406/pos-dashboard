import mongoose from 'mongoose';
import { BaseService } from '../utils/index.js';
import { VariantSchema } from '../models/index.js';

const VARIANT_SEARCH_FIELDS = Object.freeze(['variant', 'values.value']);

class VariantServices extends BaseService {
  constructor(businessId) {
    if (!businessId) {
      throw new Error('VariantServices initialized without businessId');
    }
    super({
      modelName: 'Variant',
      schema: VariantSchema,
      collection: 'variants',
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
      return this._listAllVariants({ filters, sort, populate });
    }

    return this._listPaginatedVariants({
      filters,
      sort,
      page,
      limit,
      populate,
    });
  }

  _composeFilters({ isActive, search }) {
    const filters = {};
    const normalizedStatus = this._normalizeStatusFlag(isActive);

    if (typeof normalizedStatus === 'boolean') {
      filters.status = normalizedStatus;
    }

    return this._attachSearchClause(filters, search);
  }

  _normalizeStatusFlag(flag) {
    if (flag === undefined || flag === null || flag === '') {
      return undefined;
    }

    if (typeof flag === 'string') {
      const normalized = flag.trim().toLowerCase();
      if (normalized === 'true') {
        return true;
      }
      if (normalized === 'false') {
        return false;
      }
    }

    return Boolean(flag);
  }

  _attachSearchClause(filters, searchTerm) {
    const term =
      typeof searchTerm === 'string' ? searchTerm.trim() : searchTerm || '';

    if (!term) {
      return { ...filters };
    }

    return {
      ...filters,
      $or: VARIANT_SEARCH_FIELDS.map((field) => ({
        [field]: { $regex: term, $options: 'i' },
      })),
    };
  }

  _composeSort(sortBy, sortOrder) {
    const sortField = sortBy || 'createdAt';
    const isAscending =
      typeof sortOrder === 'string'
        ? sortOrder.toLowerCase() === 'asc'
        : sortOrder === 1;

    return {
      [sortField]: isAscending ? 1 : -1,
    };
  }

  async _listAllVariants({ filters, sort, populate }) {
    const Model = await this.getModel();

    let query = Model.find(filters).sort(sort);

    if (populate) {
      query = query.populate(populate);
    }

    const variants = await query.lean().exec();
    const formattedVariants = variants.map((variant) =>
      this._formatVariantDocument(variant),
    );

    return {
      data: formattedVariants,
      total: formattedVariants.length,
    };
  }

  async _listPaginatedVariants({ filters, sort, page, limit, populate }) {
    const {
      page: validatedPage,
      limit: validatedLimit,
      skip,
    } = this.validatePagination(page, limit);

    const Model = await this.getModel();
    let query = Model.find(filters).sort(sort).skip(skip).limit(validatedLimit);

    if (populate) {
      query = query.populate(populate);
    }

    const [documents, total] = await Promise.all([
      query.lean().exec(),
      Model.countDocuments(filters),
    ]);
    const formattedDocuments = documents.map((document) =>
      this._formatVariantDocument(document),
    );

    return {
      data: formattedDocuments,
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
   * Bulk get variants by IDs
   * @param {Array<string>} ids - Array of variant IDs to retrieve
   * @param {Object} options - Optional configuration
   * @param {Boolean} options.lean - Return plain JavaScript objects (default: true)
   * @param {Boolean} options.throwOnNotFound - Throw error if any ID not found (default: false)
   * @returns {Promise<Object>} Object containing:
   *   - variants: Array of found variants
   *   - found: Number of variants found
   *   - notFound: Array of IDs that were not found
   *   - totalRequested: Total number of IDs requested
   */
  async bulkGetVariants(ids, options = {}) {
    try {
      // Validate input
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('Variant IDs array is required and must not be empty');
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

      // Return with renamed 'documents' to 'variants' for clarity
      return {
        data: result.documents,
        found: result.found,
        notFound: result.notFound,
        totalRequested: result.totalRequested,
      };
    } catch (error) {
      throw new Error(`Bulk get variants failed: ${error.message}`);
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
        message: `${result.modifiedCount} variants status updated to ${
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
        throw new Error('No variant IDs provided for bulk delete');
      }

      const preparedIds = this._prepareObjectIds(ids);

      const Model = await this.getModelRef();
      const result = await Model.deleteMany({ _id: { $in: preparedIds } });

      return {
        deletedCount: result.deletedCount,
        totalRequested: ids.length,
        message: `${result.deletedCount} variants deleted successfully`,
      };
    } catch (error) {
      throw new Error(`Bulk delete failed: ${error.message}`);
    }
  }

  _formatVariantDocument(document) {
    if (!document || typeof document !== 'object') {
      return document;
    }

    const { _id, values = [], ...rest } = document;
    const formattedValues = Array.isArray(values)
      ? values.map((value) => {
          if (!value || typeof value !== 'object') {
            return value;
          }

          const { _id: valueId, ...valueRest } = value;
          return {
            ...valueRest,
            id: valueId?.toString?.() ?? valueId,
          };
        })
      : values;

    return {
      ...rest,
      id: _id?.toString?.() ?? _id,
      values: formattedValues,
    };
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
   * Get active variants for a business
   * Retrieves all variants with status: true, commonly used for dropdowns/selects
   * @param {Object} options - Optional configuration
   * @param {string} options.sortBy - Field to sort by (default: 'variant')
   * @param {string} options.sortOrder - Sort order 'asc' or 'desc' (default: 'asc')
   * @param {string|Array} options.populate - Fields to populate (optional)
   * @returns {Promise<Array>} Array of active variant documents
   */
  async getActiveVariants(options = {}) {
    try {
      const {
        sortBy = 'variant',
        sortOrder = 'asc',
        populate = null,
      } = options;

      const Model = await this.getModel();
      const filters = { status: true };

      // Build sort object
      const sort = this._composeSort(sortBy, sortOrder);

      let query = Model.find(filters).sort(sort);

      if (populate) {
        query = query.populate(populate);
      }

      const variants = await query.lean().exec();
      

      return variants;
    } catch (error) {
      throw new Error(`Error retrieving active variants: ${error.message}`);
    }
  }
}

export default VariantServices;
