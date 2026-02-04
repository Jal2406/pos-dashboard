import mongoose from 'mongoose';
import { BaseService, deleteImage } from '../utils/index.js';
import { subCategorySchema as SubCategorySchema } from '../models/SubCategory.js';
import { ProductCategorySchema } from '../models/ProductCategory.js';

class SubCategoryServices extends BaseService {
  constructor(businessId) {
    if (!businessId) {
      throw new Error('SubCategoryServices initialized without businessId');
    }
    super({
      modelName: 'SubCategory',
      schema: SubCategorySchema,
      collection: 'subcategories',
      businessId,
    });
  }

  async list(queryParams = {}, businessId = null) {
    const {
      all,
      isActive,
      status,
      categoryId,
      search = '',
      sortBy = 'createdAt',
      sortOrder = 'desc',
      ...paginationParams
    } = queryParams;

    // Define search fields for SubCategory
    const searchFields = ['subcategory', 'categorycode', 'description'];

    // Build filters - support both 'status' and 'isActive' for consistency with product-category
    const statusFlag = isActive !== undefined ? isActive : status;
    const filters = this._buildFilters(statusFlag);

    if (categoryId) {
      filters.category = categoryId;
    }

    // If 'all' flag is set, fetch all records without pagination
    if (this._shouldFetchAll(all)) {
      return this._listAllSubcategories({
        filters,
        search,
        sortBy,
        sortOrder,
        searchFields,
      });
    }

    // Use BaseService list method with SubCategory specific configuration
    const result = await super.list({
      ...paginationParams,
      search,
      sortBy,
      sortOrder,
      searchFields,
      filters,
      populate: {
        path: 'category',
        select: 'categoryName categorycode',
      },
    });

    return result;
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
      filters.status = normalizedStatus;
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

  async _listAllSubcategories({
    filters,
    search,
    sortBy,
    sortOrder,
    searchFields,
  }) {
    const filterWithSearch = this._applySearchFilter(
      filters,
      search,
      searchFields,
    );
    const sort = this._composeSort(sortBy, sortOrder);

    const SubCategoryModel = await this.getModel(
      'SubCategory',
      SubCategorySchema,
    );

    const subcategories = await SubCategoryModel.find(filterWithSearch)
      .populate({
        path: 'category',
        select: 'categoryName categorycode',
      })
      .sort(sort)
      .lean();

    return {
      data: subcategories,
      total: subcategories.length,
    };
  }

  _applySearchFilter(filters, searchTerm, searchFields) {
    const term =
      typeof searchTerm === 'string' ? searchTerm.trim() : searchTerm || '';

    if (!term) {
      return filters;
    }

    return {
      ...filters,
      $or: searchFields.map((field) => ({
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

  async getByCategory(categoryId, businessId = null) {
    try {
      this.validateObjectId(categoryId);

      // Verify category existence in this tenant
      const ProductCategoryModel = await this.getModel(
        'ProductCategory',
        ProductCategorySchema,
      );
      const category = await ProductCategoryModel.findOne({
        _id: categoryId,
        isDeleted: { $ne: true },
      }).select('_id');

      if (!category) {
        throw new Error('Category not found');
      }

      const SubCategoryModel = await this.getModel(
        'SubCategory',
        SubCategorySchema,
      );
      const subcategories = await SubCategoryModel.find({
        category: categoryId,
        status: true,
        isDeleted: { $ne: true },
      })
        .populate({
          path: 'category',
          select: 'categoryName categorycode',
        })
        .select(
          '_id subcategory categorycode description subCategoryImage status category createdAt updatedAt',
        )
        .lean();

      return subcategories;
    } catch (error) {
      throw new Error(
        `Error retrieving subcategories by category: ${error.message}`,
      );
    }
  }

  async getActiveSubcategories(businessId = null) {
    try {
      const query = { status: true, isDeleted: { $ne: true } };
      const SubCategoryModel = await this.getModel(
        'SubCategory',
        SubCategorySchema,
      );
      const docs = await SubCategoryModel.find(query)
        .populate({
          path: 'category',
          select: 'categoryName categorycode',
        })
        .select(
          '_id subcategory categorycode description subCategoryImage status category createdAt updatedAt',
        )
        .sort({ subcategory: 1 })
        .lean();

      return docs;
    } catch (error) {
      throw new Error(
        `Error retrieving active subcategories: ${error.message}`,
      );
    }
  }

  async toggleStatus(id, businessId = null) {
    try {
      const subcategory = await this.getById(id);
      const updatedSubcategory = await this.updateById(id, {
        status: !subcategory.status,
      });
      return updatedSubcategory;
    } catch (error) {
      throw new Error(`Error toggling subcategory status: ${error.message}`);
    }
  }

  async create(data, businessId = null) {
    try {
      // Early validation - check required fields first
      if (!data.category || !data.subcategory || !data.categorycode) {
        throw new Error(
          'Category, subcategory name, and category code are required',
        );
      }

      // Ensure categorycode is uppercase early to avoid multiple transformations
      data.categorycode = data.categorycode.toUpperCase();

      // Use Promise.all to run validation queries in parallel
      const SubCategoryModel = await this.getModel(
        'SubCategory',
        SubCategorySchema,
      );
      const ProductCategoryModel = await this.getModel(
        'ProductCategory',
        ProductCategorySchema,
      );
      const [categoryExists, existingSubcategory, existingCode] =
        await Promise.all([
          // Validate that the category exists in this tenant
          ProductCategoryModel.findOne({
            _id: data.category,
            isDeleted: { $ne: true },
          })
            .select('_id')
            .lean(),

          // Check if subcategory name already exists under the same category
          SubCategoryModel.findOne({
            category: data.category,
            subcategory: data.subcategory,
          })
            .collation({ locale: 'en', strength: 2 })
            .select('_id')
            .lean(),

          // Check if category code already exists
          SubCategoryModel.findOne({
            categorycode: data.categorycode,
          })
            .select('_id')
            .lean(),
        ]);

      // Validation checks with early returns
      if (!categoryExists) {
        throw new Error('Referenced category does not exist');
      }

      if (existingSubcategory) {
        throw new Error('Subcategory name already exists under this category');
      }

      if (existingCode) {
        throw new Error('Category code already exists');
      }

      // Create and return populated document efficiently
      const created = await SubCategoryModel.create({ ...data });
      const populated = await created.populate({
        path: 'category',
        select: 'categoryName categorycode',
      });

      return populated;
    } catch (error) {
      // Self-healing: Handle stale index from previous schema versions
      if (
        error.code === 11000 &&
        error.message.includes('business_1_categoryName_1')
      ) {
        try {
          console.warn(
            'Detected stale index business_1_categoryName_1. Dropping it...',
          );
          await SubCategoryModel.collection.dropIndex(
            'business_1_categoryName_1',
          );
          // Retry creation one time
          const createdRetry = await SubCategoryModel.create({ ...data });
          const populatedRetry = await createdRetry.populate({
            path: 'category',
            select: 'categoryName categorycode',
          });
          return populatedRetry;
        } catch (retryError) {
          throw new Error(
            `Failed to recover from stale index error: ${retryError.message}`,
          );
        }
      }

      // Handle specific MongoDB errors
      if (error.code === 11000) {
        if (error.keyPattern?.categorycode) {
          throw new Error('Category code already exists');
        }
        if (error.keyPattern?.category && error.keyPattern?.subcategory) {
          throw new Error(
            'Subcategory name already exists under this category',
          );
        }
      }
      console.log(error);
      throw new Error(`Error creating subcategory: ${error.message}`);
    }
  }

  async updateById(id, data, businessId = null) {
    try {
      // Verify existence first
      await this.getById(id);

      // Handle image replacement: if a new image is provided, delete the old one after successful update
      let previousImagePath = null;
      if (data.subCategoryImage) {
        const current = await this.getById(id);
        previousImagePath = current?.subCategoryImage || null;
      }

      // If category is being updated, validate it exists
      if (data.category) {
        const ProductCategoryModel = await this.getModel(
          'ProductCategory',
          ProductCategorySchema,
        );
        const categoryExists = await ProductCategoryModel.findOne({
          _id: data.category,
          isDeleted: { $ne: true },
        }).select('_id');
        if (!categoryExists) {
          throw new Error('Referenced category does not exist');
        }
      }

      // If subcategory name is being updated, check for duplicates under the same category
      if (data.subcategory) {
        const currentSubcategory = await this.getById(id);
        const SubCategoryModel = await this.getModel(
          'SubCategory',
          SubCategorySchema,
        );
        const existingSubcategory = await SubCategoryModel.findOne({
          category: data.category || currentSubcategory.category,
          subcategory: { $regex: new RegExp(`^${data.subcategory}$`, 'i') },
          _id: { $ne: id },
        });

        if (existingSubcategory) {
          throw new Error(
            'Subcategory name already exists under this category',
          );
        }
      }

      // If category code is being updated, check for duplicates
      if (data.categorycode) {
        const SubCategoryModel = await this.getModel(
          'SubCategory',
          SubCategorySchema,
        );
        const existingCode = await SubCategoryModel.findOne({
          categorycode: data.categorycode.toUpperCase(),
          _id: { $ne: id },
        });

        if (existingCode) {
          throw new Error('Category code already exists');
        }

        // Ensure categorycode is uppercase
        data.categorycode = data.categorycode.toUpperCase();
      }

      const SubCategoryModel = await this.getModel(
        'SubCategory',
        SubCategorySchema,
      );
      const updatedDocument = await SubCategoryModel.findOneAndUpdate(
        { _id: id, isDeleted: { $ne: true } },
        data,
        {
          new: true,
          runValidators: true,
        },
      );

      if (!updatedDocument) {
        throw new Error(`Subcategory with id ${id} not found`);
      }

      const populated = await updatedDocument.populate({
        path: 'category',
        select: 'categoryName categorycode',
      });

      // Delete old image from Cloudinary if a new image was uploaded
      if (previousImagePath) {
        try {
          await deleteImage(previousImagePath, 'subCategoryImages');
        } catch (cleanupErr) {
          // swallow delete errors to not block response
        }
      }

      return populated;
    } catch (error) {
      throw new Error(`Error updating subcategory: ${error.message}`);
    }
  }

  async deleteById(id, businessId = null) {
    try {
      // Delete subcategory (soft delete)
      const existing = await this.getById(id); // Checks isDeleted
      const SubCategoryModel = await this.getModel(
        'SubCategory',
        SubCategorySchema,
      );
      const deletedDocument = await SubCategoryModel.findOneAndUpdate(
        { _id: id, isDeleted: { $ne: true } },
        { isDeleted: true, deletedAt: new Date() },
        { new: true },
      );
      if (!deletedDocument) {
        throw new Error(`Subcategory with id ${id} not found`);
      }
      // Do NOT delete image on soft delete
      return deletedDocument;
    } catch (error) {
      throw new Error(`Error deleting subcategory: ${error.message}`);
    }
  }

  async getById(id, businessId = null) {
    try {
      const SubCategoryModel = await this.getModel(
        'SubCategory',
        SubCategorySchema,
      );
      const document = await SubCategoryModel.findOne({
        _id: id,
        isDeleted: { $ne: true },
      })
        .populate({
          path: 'category',
          select: 'categoryName categorycode',
        })
        .select(
          '_id subcategory categorycode description subCategoryImage status category createdAt updatedAt',
        )
        .lean();

      if (!document) {
        throw new Error(`Subcategory with id ${id} not found`);
      }

      return document;
    } catch (error) {
      throw new Error(`Error retrieving subcategory: ${error.message}`);
    }
  }

  async getSubcategoriesByCategoryWithCount(categoryId, businessId = null) {
    try {
      this.validateObjectId(categoryId);

      // Verify validation of category existence
      const ProductCategoryModel = await this.getModel(
        'ProductCategory',
        ProductCategorySchema,
      );
      const category = await ProductCategoryModel.findOne({
        _id: categoryId,
        isDeleted: { $ne: true },
      }).select('_id');
      if (!category) {
        throw new Error('Category not found');
      }

      const SubCategoryModel = await this.getModel(
        'SubCategory',
        SubCategorySchema,
      );
      const subcategories = await SubCategoryModel.aggregate([
        {
          $match: {
            category: new mongoose.Types.ObjectId(categoryId),
            isDeleted: { $ne: true },
          },
        },
        {
          $lookup: {
            from: 'productcategories',
            localField: 'category',
            foreignField: '_id',
            as: 'categoryInfo',
          },
        },
        {
          $addFields: {
            categoryName: { $arrayElemAt: ['$categoryInfo.categoryName', 0] },
            categoryCode: { $arrayElemAt: ['$categoryInfo.categorycode', 0] },
          },
        },
        {
          $project: {
            _id: 1,
            subcategory: 1,
            categorycode: 1,
            description: 1,
            subCategoryImage: 1,
            status: 1,
            categoryName: 1,
            categoryCode: 1,
            createdAt: 1,
            updatedAt: 1,
          },
        },
      ]);

      return subcategories;
    } catch (error) {
      throw new Error(
        `Error retrieving subcategories with category info: ${error.message}`,
      );
    }
  }

  async bulkUpdateStatus(ids, status, businessId = null) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('IDs array is required and must not be empty');
      }

      // Validate all IDs
      ids.forEach((id) => this.validateObjectId(id));

      const SubCategoryModel = await this.getModel(
        'SubCategory',
        SubCategorySchema,
      );
      const result = await SubCategoryModel.updateMany(
        { _id: { $in: ids }, isDeleted: { $ne: true } },
        { status },
      );

      return {
        modifiedCount: result.modifiedCount,
        totalRequested: ids.length,
      };
    } catch (error) {
      throw new Error(
        `Error bulk updating subcategory status: ${error.message}`,
      );
    }
  }

  async bulkDelete(ids, businessId = null) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('No subcategory IDs provided for bulk delete');
      }

      // Validate all IDs
      ids.forEach((id) => this.validateObjectId(id));

      const SubCategoryModel = await this.getModel(
        'SubCategory',
        SubCategorySchema,
      );

      // Get subcategories to delete (soft delete)
      const subcategoriesToDelete = await SubCategoryModel.find({
        _id: { $in: ids },
        isDeleted: { $ne: true },
      })
        .select('_id')
        .lean();

      if (subcategoriesToDelete.length === 0) {
        throw new Error('No subcategories found to delete');
      }

      // Soft delete the subcategories
      const result = await SubCategoryModel.updateMany(
        { _id: { $in: ids }, isDeleted: { $ne: true } },
        { isDeleted: true, deletedAt: new Date() },
      );

      // Do NOT delete images on soft delete

      return {
        deletedCount: result.modifiedCount,
        totalRequested: ids.length,
        message: `${result.modifiedCount} subcategories deleted successfully`,
      };
    } catch (error) {
      throw new Error(`Bulk delete failed: ${error.message}`);
    }
  }

  async getSubcategoriesForInventory(categoryId = null, businessId = null) {
    try {
      const query = { status: true, isDeleted: { $ne: true } };

      if (categoryId) {
        this.validateObjectId(categoryId);
        query.category = categoryId;
      }

      const SubCategoryModel = await this.getModel(
        'SubCategory',
        SubCategorySchema,
      );
      const subcategories = await SubCategoryModel.find(query)
        .populate({
          path: 'category',
          select: 'categoryName categorycode',
        })
        .select('_id subcategory categorycode category subCategoryImage')
        .sort({ subcategory: 1 })
        .lean();

      return subcategories;
    } catch (error) {
      throw new Error(
        `Error retrieving subcategories for inventory: ${error.message}`,
      );
    }
  }

  /**
   * Bulk get subcategories by IDs
   */
  async bulkGetSubcategories(ids, options = {}) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error(
          'Subcategory IDs array is required and must not be empty',
        );
      }

      const normalizedIds = ids.map((id) => {
        const normalized =
          typeof id === 'string' ? id.trim() : id?.toString?.();

        if (!normalized) {
          throw new Error('Invalid subcategory ID format');
        }

        this.validateObjectId(normalized);
        return normalized;
      });

      const { lean = true, throwOnNotFound = false } = options;

      const SubCategoryModel = await this.getModel(
        'SubCategory',
        SubCategorySchema,
      );

      const documents = await SubCategoryModel.find({
        _id: { $in: normalizedIds },
        isDeleted: { $ne: true },
      })
        .populate({
          path: 'category',
          select: 'categoryName categorycode',
        })
        .lean(lean);

      const foundIds = new Set(documents.map((doc) => doc._id.toString()));
      const notFoundIds = normalizedIds.filter((id) => !foundIds.has(id));

      if (throwOnNotFound && notFoundIds.length > 0) {
        throw new Error(`Subcategories not found: ${notFoundIds.join(', ')}`);
      }

      return {
        data: documents,
        found: documents.length,
        notFound: notFoundIds,
        totalRequested: normalizedIds.length,
      };
    } catch (error) {
      throw new Error(`Bulk get subcategories failed: ${error.message}`);
    }
  }

  // Helper method to get available categories for a business
  async getAvailableCategoriesForBusiness(businessId) {
    try {
      // businessId passed for signature compatibility but used in getModel context by BaseService if initialized
      // But BaseService.getModel uses this.businessId.
      // If the caller passed businessId to this method but instance was created without it (unlikely),
      // we might want to ensure we use the right model.
      // However, BaseService expects businessId at construction.

      const ProductCategoryModel = await this.getModel(
        'ProductCategory',
        ProductCategorySchema,
      );
      const categories = await ProductCategoryModel.find({
        isActive: true,
        isDeleted: { $ne: true },
      })
        .select('_id categoryName categorycode')
        .sort({ categoryName: 1 })
        .lean();

      return categories;
    } catch (error) {
      throw new Error(
        `Error retrieving available categories for business: ${error.message}`,
      );
    }
  }
}

export default SubCategoryServices;
