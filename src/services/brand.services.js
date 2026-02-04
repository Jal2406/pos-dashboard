import { BaseService, deleteImage } from '../utils/index.js';
import { BrandSchema } from '../models/index.js';

class BrandServices extends BaseService {
  constructor(businessId) {
    if (!businessId) {
    throw new Error('ProductServices initialized without businessId');
  }
    super({
      modelName: 'Brand',
      schema: BrandSchema,
      collection: 'brands',
      businessId,
    });
  }

  async create(payload) {
    const Model = await this.getModelRef();

    // Check for existing deleted brand with the same name
    // Explicitly querying isDeleted: true to bypass the pre-find hook
    const existingDeletedBrand = await Model.findOne({
      brand: payload.brand,
      isDeleted: true
    });

    if (existingDeletedBrand) {
      // Restore and update the existing soft-deleted brand
      const updatedBrand = await Model.findByIdAndUpdate(
        existingDeletedBrand._id,
        {
          ...payload,
          isDeleted: false,
          status: true // Ensure it's set to active upon restoration
        },
        { new: true, runValidators: true }
      );

      return updatedBrand;
    }

    return super.create(payload);
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



  async list(queryParams = {}) {
    const {
      all,
      isActive,
      page = 1,
      limit = 10,
      search = '',
      sortBy = 'createdAt',
      sortOrder = 'desc',
      status,
    } = queryParams;

    const shouldFetchAll = all === true || all === 'true';

    const filters = {};
    // Support both 'status' and 'isActive' for consistency
    const statusFlag = isActive !== undefined ? isActive : status;
    if (statusFlag !== undefined) {
      filters.status =
        statusFlag === 'true' || statusFlag === true ? true : false;
    }
    if (search) {
      filters.$or = [{ brand: { $regex: search, $options: 'i' } }];
    }

    const listParams = {
      page,
      limit: shouldFetchAll ? 10000 : limit,
      search: '',
      searchFields: [],
      sortBy,
      sortOrder,
      filters,
    };

    const result = await super.list(listParams);


    // If fetching all, return without pagination info
    if (shouldFetchAll) {
      return {
        data: result.data,
        total: result.data.length,
      };
    }

    return result;
  }

  async bulkUpdateStatus(ids, status) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('IDs array is required and must not be empty');
      }

      // Validate all IDs
      ids.forEach((id) => this.validateObjectId(id));

      const Model = await this.getModelRef();
      const result = await Model.updateMany({ _id: { $in: ids } }, { status });

      return {
        modifiedCount: result.modifiedCount,
        totalRequested: ids.length,
        message: `${result.modifiedCount} brands status updated to ${status ? 'active' : 'inactive'
          }`,
      };
    } catch (error) {
      throw new Error(`Bulk status update failed: ${error.message}`);
    }
  }

  async bulkDelete(ids) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('No brand IDs provided for bulk delete');
      }

      // Validate all IDs
      ids.forEach((id) => this.validateObjectId(id));

      const Model = await this.getModelRef();

      // Get brands to delete for image cleanup
      const brandsToDelete = await Model.find({ _id: { $in: ids } })
        .select('_id brandImage')
        .lean();

      if (brandsToDelete.length === 0) {
        throw new Error('No brands found to delete');
      }

      const result = await Model.deleteMany({ _id: { $in: ids } });

      // Clean up images asynchronously
      brandsToDelete.forEach((brand) => {
        if (brand.brandImage) {
          deleteImage(brand.brandImage, 'brandImages').catch(() => {
            // Silently ignore image deletion errors
          });
        }
      });

      return {
        deletedCount: result.deletedCount,
        totalRequested: ids.length,
        message: `${result.deletedCount} brands deleted successfully`,
      };
    } catch (error) {
      throw new Error(`Bulk delete failed: ${error.message}`);
    }
  }

  async getActiveBrands() {
    try {
      const Model = await this.getModelRef();
      const brands = await Model.find({ status: true }).lean();
      return brands;
    } catch (error) {
      throw new Error(`Failed to get active brands: ${error.message}`);
    }
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
* Restore soft-deleted Brand
* @param {String} id - Brand ID
* @param {Object} options - Optional options { session }
* @returns {Promise<Object>} Restored Brand document
*/
  async restoreBrand(id, options = {}) {
    try {
      this.validateObjectId(id);

      const Model = await this.getCachedModel();
      const brand = await Model.findById(id);

      if (!brand) {
        throw new Error(`Brand with id ${id} not found`);
      }

      if (!brand.isDeleted) {
        throw new Error(`Brand with id ${id} is not deleted`);
      }

      // Restore using base service
      const restoredBrand = await this.restoreById(id);
      return restoredBrand;
    } catch (error) {
      throw new Error(`Failed to restore brand: ${error.message}`);
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
      throw new Error(`Failed to bulk soft delete brands: ${error.message}`);
    }
  }

  async bulkGetBrands(ids, options = {}) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('Brand IDs array is required and must not be empty');
      }

      const normalizedIds = ids.map((id) => {
        const normalized =
          typeof id === 'string' ? id.trim() : id?.toString?.();

        if (!normalized) {
          throw new Error('Invalid brand ID format');
        }

        this.validateObjectId(normalized);
        return normalized;
      });

      const { lean = true, throwOnNotFound = false } = options;

      const Model = await this.getModelRef();

      let query = Model.find({
        _id: { $in: normalizedIds },
      });

      if (lean) {
        query = query.lean();
      }

      const documents = await query;

      const foundIds = new Set(documents.map((doc) => doc._id.toString()));
      const notFoundIds = normalizedIds.filter((id) => !foundIds.has(id));

      if (throwOnNotFound && notFoundIds.length > 0) {
        throw new Error(`Brands not found: ${notFoundIds.join(', ')}`);
      }

      return {
        data: documents,
        found: documents.length,
        notFound: notFoundIds,
        totalRequested: normalizedIds.length,
      };
    } catch (error) {
      throw new Error(`Bulk get brands failed: ${error.message}`);
    }
  }
}

export default BrandServices;
