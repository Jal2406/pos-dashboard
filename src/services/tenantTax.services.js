import { BaseService } from '../utils/index.js';
import { tenantTaxSchema } from '../models/index.js';

class TenantTaxService extends BaseService {
  constructor(businessId, options = {}) {
    if (!businessId) {
      throw new Error('TenantTaxService initialized without businessId');
    }
    super({
      modelName: 'TenantTax',
      schema: tenantTaxSchema,
      collection: 'taxes',
      businessId,
    });

    // Cache the model reference to avoid repeated resolution
    this._modelRef = null;
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
   * Bulk update the status field for multiple taxes
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
    const filter = { _id: { $in: ids } };

    const result = await Model.updateMany(filter, update, {
      session: options.session || undefined,
      // runValidators ensures schema validations on update
      runValidators: true,
    });

    // result.acknowledged true in newer drivers; matchedCount/modifiedCount present
    return {
      matchedCount: result.matchedCount || 0,
      modifiedCount: result.modifiedCount || 0,
    };
  }

  /**
   * Bulk delete taxes by ids
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
    const result = await Model.deleteMany(
      { _id: { $in: ids } },
      { session: options.session || undefined },
    );

    return { deletedCount: result.deletedCount || 0 };
  }

  async list(queryParams = {}) {
    const {
      isActive,
      status,
      type,
      valueType,
      search = '',
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      all,
      ...rest
    } = queryParams;

    const filters = { ...rest };

    if (isActive !== undefined) {
      filters.status = isActive === 'true' || isActive === true;
    }

    if (type) {
      filters.taxType = type;
    }

    if (valueType) {
      filters.valueType = valueType;
    }

    const shouldFetchAll = all === true || all === 'true';

    if (shouldFetchAll) {
      const Model = await this.getModelRef();
      const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

      const searchFields = ['taxName', 'description'];
      if (search && searchFields.length > 0) {
        filters.$or = searchFields.map((field) => ({
          [field]: { $regex: search, $options: 'i' },
        }));
      }

      const data = await Model.find(filters).sort(sort).lean();

      return {
        data,
        totalItems: data.length,
      };
    }

    return await super.list({
      page,
      limit,
      search,
      searchFields: ['taxName', 'description'],
      sortBy,
      sortOrder,
      filters,
    });
  }

  /**
   * Get only active taxes - optimized direct DB query without pagination
   * @param {Object} queryParams - Query parameters for filtering
   * @returns {Promise<Array>} Array of active taxes
   */
  async getActiveTaxes(queryParams = {}) {
    const { taxType, valueType, ...rest } = queryParams;

    // Use cached model reference for better performance
    const Model = await this.getCachedModel();

    // Build optimized filter object - status first for index usage
    const filter = {
      status: true, // Only active taxes - this will use the index
      ...rest,
    };

    if (taxType) {
      filter.taxType = taxType;
    }

    if (valueType) {
      filter.valueType = valueType;
    }

    // Optimized query with proper index usage
    const taxes = await Model.find(filter)
      .sort({ createdAt: -1 }) // Uses compound index { status: 1, createdAt: -1 }
      .lean() // Use lean() for better performance
      .select(
        'taxName taxType valueType value status description createdAt updatedAt',
      ); // Only select needed fields

    return taxes;
  }

  /**
   * Soft Delete brands by IDs
   * @param {Array<string>} ids - Brand IDs
   * @param {Object} options - Options for the query
   * @param {boolean} options.lean - Whether to return lean documents (default: true)
   * @param {boolean} options.throwOnNotFound - Whether to throw error if some IDs not found (default: false)
   * @returns {Promise<Object>} Result with brands, found count, and not found IDs
   */
  async softDeleteByBrand(id, options = {}) {
    try {
      this.validateObjectId(id);

      // Check if customer exists
      const brand = await this.getBrandById(id);
      if (!brand) {
        throw new Error(`Brand with id ${id} not found`);
      }

      // Perform soft delete using base service
      const deletedBrand = await this.softDeleteById(id);
      return deletedBrand;
    } catch (error) {
      throw new Error(`Failed to soft delete brand: ${error.message}`);
    }
  }

  /**
* Restore soft-deleted Tax
* @param {String} id - Tax ID
* @param {Object} options - Optional options { session }
* @returns {Promise<Object>} Restored Tax document
*/
  async restoreTax(id, options = {}) {
    try {
      this.validateObjectId(id);

      const Model = await this.getCachedModel();
      const tax = await Model.findById(id);

      if (!tax) {
        throw new Error(`Tax with id ${id} not found`);
      }

      if (!tax.isDeleted) {
        throw new Error(`Tax with id ${id} is not deleted`);
      }

      // Restore using base service
      const restoredBrand = await this.restoreById(id);
      return restoredBrand;
    } catch (error) {
      throw new Error(`Failed to restore tax: ${error.message}`);
    }
  }

  /**
 * Bulk soft delete brands
 * @param {Array<String>} ids - Array of brand IDs
 * @param {Object} options - Optional options { session }
 * @returns {Promise<Object>} Result summary with deletedCount
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

      // Use getModelRef() instead of getCachedModel()
      const Model = await this.getModelRef();
      const update = {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
          status: false // Optionally set status to false when soft deleting
        }
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
      console.error('Bulk soft delete error:', error);
      throw new Error(`Failed to bulk soft delete tax: ${error.message}`);
    }
  }

}

export default TenantTaxService;
