import { BaseService } from '../utils/index.js';
import { ProductCategorySchema } from '../models/index.js';

const PRODUCT_CATEGORY_SEARCH_FIELDS = Object.freeze([
  'categoryName',
  'description',
  'slug',
]);

class ProductCategoryServices extends BaseService {
  constructor(businessId = null) {
    if (!businessId) {
      throw new Error('ProductCategoryServices initialized without businessId');
    }
    // Use tenant-aware model resolution
    super({
      modelName: 'ProductCategory',
      schema: ProductCategorySchema,
      collectionName: 'productCategories',
      businessId,
    });
  }

  async list(queryParams = {}) {
    const {
      all,
      isActive,
      status,
      search = '',
      sortBy = 'createdAt',
      sortOrder = 'desc',
      populate = null,
      ...paginationParams
    } = queryParams;

    const statusFlag = isActive !== undefined ? isActive : status;
    const filters = this._buildFilters(statusFlag);

    if (this._shouldFetchAll(all)) {
      return this._listAllCategories({
        filters,
        search,
        sortBy,
        sortOrder,
        populate,
      });
    }

    const result = await super.list({
      ...paginationParams,
      search,
      sortBy,
      sortOrder,
      populate,
      searchFields: PRODUCT_CATEGORY_SEARCH_FIELDS,
      filters,
    });


    return result;
  }

  async getActiveCategories(businessId) {
    try {
      const Model = await this.getModel(
        'ProductCategory',
        ProductCategorySchema,
      );
      const categories = await Model.find({
        isActive: true,
        isDeleted: { $ne: true },
      })
        .sort({ categoryName: 1 })
        .lean();

      // Transform documents to remove _id and keep only id
      return categories;
    } catch (error) {
      throw new Error(`Error retrieving active categories: ${error.message}`);
    }
  }

  async create(data, userId) {
    try {
      // Check if category name already exists for this business
      const Model = await this.getModel(
        'ProductCategory',
        ProductCategorySchema,
      );
      const existingCategory = await Model.findOne({
        categoryName: { $regex: new RegExp(`^${data.categoryName}$`, 'i') },
      });

      if (existingCategory) {
        throw new Error('Category name already exists for this business');
      }

      // Add user information
      const categoryData = {
        ...data,
        createdBy: userId,
        updatedBy: userId,
      };

      const document = await Model.create(categoryData);
      return document;
    } catch (error) {
      throw new Error(`Error creating product category: ${error.message}`);
    }
  }

  async updateById(id, data, userId, businessId) {
    try {
      const Model = await this.getModel(
        'ProductCategory',
        ProductCategorySchema,
      );

      const existingCategory = await Model.findOne({
        _id: id,
        isDeleted: { $ne: true },
      });
      if (!existingCategory) {
        throw new Error(`Product category with id ${id} not found`);
      }

      // If category name is being updated, check for duplicates within the same business
      if (data.categoryName) {
        const duplicateCategory = await Model.findOne({
          categoryName: { $regex: new RegExp(`^${data.categoryName}$`, 'i') },
          _id: { $ne: id },
        });

        if (duplicateCategory) {
          throw new Error('Category name already exists for this business');
        }
      }

      // Add user information
      const updateData = {
        ...data,
        updatedBy: userId,
      };

      const updatedDocument = await Model.findByIdAndUpdate(id, updateData, {
        new: true,
      });

      if (!updatedDocument) {
        throw new Error(`Product category with id ${id} not found`);
      }

      return updatedDocument;
    } catch (error) {
      throw new Error(`Error updating product category: ${error.message}`);
    }
  }

  async deleteById(id, businessId) {
    try {
      const Model = await this.getModel(
        'ProductCategory',
        ProductCategorySchema,
      );

      const deletedDocument = await Model.findOneAndUpdate(
        { _id: id, isDeleted: { $ne: true } },
        { isDeleted: true, deletedAt: new Date() },
        { new: true },
      );
      if (!deletedDocument) {
        throw new Error(`Product category with id ${id} not found`);
      }

      return deletedDocument;
    } catch (error) {
      console.log(error);
      throw new Error(`Error deleting product category: ${error.message}`);
    }
  }

  async toggleStatus(id, businessId) {
    try {
      const Model = await this.getModel(
        'ProductCategory',
        ProductCategorySchema,
      );

      const updatedCategory = await Model.findOneAndUpdate(
        { _id: id, isDeleted: { $ne: true } },
        { $bit: { isActive: { xor: 1 } } },
        { new: true },
      );

      if (!updatedCategory) {
        throw new Error(`Product category with id ${id} not found`);
      }
      return updatedCategory;
    } catch (error) {
      throw new Error(`Error toggling category status: ${error.message}`);
    }
  }

  async bulkUpdateStatus(ids, status, businessId) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('No category IDs provided for bulk update');
      }

      if (typeof status !== 'boolean') {
        throw new Error('Invalid status. Must be a boolean value (true/false)');
      }

      // Validate all IDs
      ids.forEach((id) => this.validateObjectId(id));

      const Model = await this.getModel(
        'ProductCategory',
        ProductCategorySchema,
      );

      const query = { _id: { $in: ids }, isDeleted: { $ne: true } };

      const result = await Model.updateMany(query, { isActive: status });

      return {
        modifiedCount: result.modifiedCount,
        totalRequested: ids.length,
        message: `${result.modifiedCount} categories status updated to ${status ? 'active' : 'inactive'
          }`,
      };
    } catch (error) {
      throw new Error(`Bulk status update failed: ${error.message}`);
    }
  }

  async bulkDelete(ids, businessId) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('No category IDs provided for bulk delete');
      }

      // Validate all IDs
      ids.forEach((id) => this.validateObjectId(id));

      const Model = await this.getModel(
        'ProductCategory',
        ProductCategorySchema,
      );

      const query = { _id: { $in: ids }, isDeleted: { $ne: true } };

      const categoriesToDelete = await Model.find(query).select('_id');

      if (categoriesToDelete.length === 0) {
        throw new Error('No categories found to delete');
      }

      const result = await Model.updateMany(query, {
        isDeleted: true,
        deletedAt: new Date(),
      });

      return {
        deletedCount: result.modifiedCount,
        totalRequested: ids.length,
        message: `${result.modifiedCount} categories deleted successfully`,
      };
    } catch (error) {
      throw new Error(`Bulk delete failed: ${error.message}`);
    }
  }

  async getById(id, businessId = null) {
    try {
      const Model = await this.getModel(
        'ProductCategory',
        ProductCategorySchema,
      );
      const document = await Model.findOne({
        _id: id,
        isDeleted: { $ne: true },
      });
      if (!document) {
        throw new Error(`Product category with id ${id} not found`);
      }
      return document;
    } catch (error) {
      throw new Error(`Error retrieving product category: ${error.message}`);
    }
  }

  /**
   * Bulk get product categories by IDs
   */
  async bulkGetCategories(ids, options = {}) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('Category IDs array is required and must not be empty');
      }

      const normalizedIds = ids.map((id) => {
        const normalized =
          typeof id === 'string' ? id.trim() : id?.toString?.();

        if (!normalized) {
          throw new Error('Invalid category ID format');
        }

        this.validateObjectId(normalized);
        return normalized;
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
      throw new Error(`Bulk get product categories failed: ${error.message}`);
    }
  }

  _shouldFetchAll(allFlag) {
    return allFlag === true || allFlag === 'true';
  }

  _buildFilters(statusFlag) {
    const filters = {
      isDeleted: { $ne: true },
    };

    const normalizedStatus = this._normalizeStatusFlag(statusFlag);
    if (typeof normalizedStatus === 'boolean') {
      filters.isActive = normalizedStatus;
    }

    return filters;
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

  _listAllCategories({ filters, search, sortBy, sortOrder, populate }) {
    const filterWithSearch = this._applySearchFilter(filters, search);
    const sort = this._composeSort(sortBy, sortOrder);
    return this._fetchAllCategories(filterWithSearch, sort, populate);
  }

  async _fetchAllCategories(filter, sort, populate) {
    const Model = await this.getModel('ProductCategory', ProductCategorySchema);

    let query = Model.find(filter).sort(sort);

    if (populate) {
      query = query.populate(populate);
    }

    const categories = await query.lean().exec();
    return {
      data: categories,
      total: categories.length,
    };
  }

  _applySearchFilter(filters, searchTerm) {
    const term =
      typeof searchTerm === 'string' ? searchTerm.trim() : searchTerm || '';

    if (!term) {
      return filters;
    }

    return {
      ...filters,
      $or: PRODUCT_CATEGORY_SEARCH_FIELDS.map((field) => ({
        [field]: { $regex: term, $options: 'i' },
      })),
    };
  }

  _composeSort(sortBy, sortOrder) {
    const sortField = sortBy || 'createdAt';
    const normalizedOrder =
      typeof sortOrder === 'string'
        ? sortOrder.toLowerCase() === 'asc'
        : sortOrder === 1 || sortOrder === true;

    return {
      [sortField]: normalizedOrder ? 1 : -1,
    };
  }
}

export default ProductCategoryServices;
