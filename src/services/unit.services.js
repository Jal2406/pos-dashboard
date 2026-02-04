import { BaseService } from '../utils/index.js';
import { UnitSchema } from '../models/index.js';

class UnitServices extends BaseService {
  constructor(businessId) {
    if (!businessId) {
      throw new Error('UnitServices initialized without businessId');
    }
    super({
      modelName: 'Unit',
      schema: UnitSchema,
      collection: 'units',
      businessId,
    });
  }

  async create(data, businessId) {
    try {
      if (!businessId) {
        throw new Error('Business ID is required');
      }
      const Model = await this.getModel('Unit', UnitSchema);
      const payload = { ...data };
      const created = await Model.create(payload);
      return typeof created.toObject === 'function'
        ? created.toObject()
        : created;
    } catch (error) {
      if (error.name === 'ValidationError') {
        const validationErrors = Object.values(error.errors).map(
          (e) => e.message,
        );
        throw new Error(`Error creating unit: ${validationErrors.join(', ')}`);
      }
      if (error.code === 11000) {
        const field = Object.keys(error.keyPattern || {})[0] || 'field';
        throw new Error(`Error creating unit: ${field} already exists`);
      }
      console.log(error);
      throw new Error(`Error creating unit: ${error.message}`);
    }
  }

  async getById(id, businessId) {
    try {
      if (!businessId) {
        throw new Error('Business ID is required');
      }
      this.validateObjectId(id);
      const Model = await this.getModel('Unit', UnitSchema);
      const filter = { _id: id };
      const doc = await Model.findOne(filter).lean();
      return doc;
    } catch (error) {
      throw new Error(`Error retrieving unit: ${error.message}`);
    }
  }

  async updateById(id, data, businessId) {
    try {
      if (!businessId) {
        throw new Error('Business ID is required');
      }
      this.validateObjectId(id);
      const Model = await this.getModel('Unit', UnitSchema);
      const filter = { _id: id };
      const updated = await Model.findOneAndUpdate(filter, data, {
        new: true,
        runValidators: true,
      }).lean();
      return updated;
    } catch (error) {
      if (error.name === 'ValidationError') {
        const validationErrors = Object.values(error.errors).map(
          (e) => e.message,
        );
        throw new Error(`Error updating unit: ${validationErrors.join(', ')}`);
      }
      if (error.code === 11000) {
        const field = Object.keys(error.keyPattern || {})[0] || 'field';
        throw new Error(`Error updating unit: ${field} already exists`);
      }
      throw new Error(`Error updating unit: ${error.message}`);
    }
  }

  async deleteById(id, businessId) {
    try {
      if (!businessId) {
        throw new Error('Business ID is required');
      }
      this.validateObjectId(id);
      const Model = await this.getModel('Unit', UnitSchema);
      const filter = { _id: id };
      const deleted = await Model.findOneAndDelete(filter);
      if (!deleted) {
        throw new Error(`Unit with id ${id} not found`);
      }
      return deleted;
    } catch (error) {
      throw new Error(`Error deleting unit: ${error.message}`);
    }
  }


  static async softDelete(req, res) {
    try {
      const unitServices = new UnitServices(req.businessId);
      const removed = await unitServices.softDeleteById(req.params.id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Unit Soft deleted successfully',
        removed,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to Soft delete Unit',
      );
    }
  }


  /**
     * Restore soft-deleted brand
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Promise<void>}
     */
  static async restore(req, res) {
    try {
      const businessId = req.businessId;
      const service = new UnitServices(businessId);

      const restored = await service.restoreUnit(req.params.id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Unit restored successfully',
        restored,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to restore unit',
      );
    }
  }



  /**
       * Bulk soft delete brand
       * @param {Object} req - Express request object
       * @param {Object} res - Express response object
       * @returns {Promise<void>}
       */
  // In UnitServices class
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
      throw new Error(`Failed to bulk soft delete unit: ${error.message}`);
    }
  }

  async list(queryParams = {}) {
    try {
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

      // Validate pagination parameters
      const validatedPage = Math.max(1, parseInt(page));
      const validatedLimit = shouldFetchAll
        ? 10000
        : Math.min(Math.max(1, parseInt(limit)), 100); // Max 100 items per page
      const skip = shouldFetchAll ? 0 : (validatedPage - 1) * validatedLimit;

      // Build filter
      const filter = {};

      // Support both 'status' and 'isActive' for consistency
      const statusFlag = isActive !== undefined ? isActive : status;
      if (statusFlag !== undefined) {
        filter.status =
          statusFlag === 'true' || statusFlag === true ? true : false;
      }

      if (search) {
        // Use regex search for flexibility
        filter.$or = [
          { unit: { $regex: search, $options: 'i' } },
          { shortName: { $regex: search, $options: 'i' } },
        ];
      }

      // Build sort object
      const sort = {};
      const allowedSortFields = [
        'unit',
        'shortName',
        'status',
        'createdAt',
        'updatedAt',
      ];
      const sortField = allowedSortFields.includes(sortBy)
        ? sortBy
        : 'createdAt';
      const sortDirection = sortOrder === 'desc' ? -1 : 1;
      sort[sortField] = sortDirection;

      const Model = await this.getModel('Unit', UnitSchema);

      // Build query
      let query = Model.find(filter).sort(sort);

      // Apply pagination only if not fetching all
      if (!shouldFetchAll) {
        query = query.skip(skip).limit(validatedLimit);
      }

      // Execute queries in parallel for better performance
      const [rawItems, total] = await Promise.all([
        query.lean(),
        Model.countDocuments(filter),
      ]);


      // If fetching all, return without pagination info
      if (shouldFetchAll) {
        return {
          data: rawItems,
          total: rawItems.length,
        };
      }

      return {
        data: rawItems,
        pagination: {
          currentPage: validatedPage,
          totalPages: Math.ceil(total / validatedLimit),
          totalItems: total,
          itemsPerPage: validatedLimit,
        },
      };
    } catch (error) {
      throw new Error(`Error listing units: ${error.message}`);
    }
  }


  async bulkUpdateStatus(ids, status, businessId) {
    try {
      if (!businessId) {
        throw new Error('Business ID is required for bulk update');
      }
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('IDs array is required and must not be empty');
      }

      // Validate all IDs
      ids.forEach((id) => this.validateObjectId(id));

      const Model = await this.getModel('Unit', UnitSchema);
      const result = await Model.updateMany({ _id: { $in: ids } }, { status });

      return {
        modifiedCount: result.modifiedCount,
        totalRequested: ids.length,
        message: `${result.modifiedCount} units status updated to ${status ? 'active' : 'inactive'
          }`,
      };
    } catch (error) {
      throw new Error(`Bulk status update failed: ${error.message}`);
    }
  }

  async bulkDelete(ids, businessId) {
    try {
      if (!businessId) {
        throw new Error('Business ID is required for bulk delete');
      }
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('No unit IDs provided for bulk delete');
      }

      // Validate all IDs
      ids.forEach((id) => this.validateObjectId(id));

      const Model = await this.getModel('Unit', UnitSchema);
      const result = await Model.deleteMany({
        _id: { $in: ids },
      });

      return {
        deletedCount: result.deletedCount,
        totalRequested: ids.length,
        message: `${result.deletedCount} units deleted successfully`,
      };
    } catch (error) {
      throw new Error(`Bulk delete failed: ${error.message}`);
    }
  }

  /**
   * Get active units for a business (commonly used for dropdowns/selects)
   * @param {string} businessId - Business ID
   * @returns {Promise<Array>} Active units
   */
  async getActiveUnits() {
    try {
      const Model = await this.getModel('Unit', UnitSchema);
      const units = await Model.find({ status: true })
        .select('unit shortName')
        .sort({ unit: 1 })
        .lean();
      return units;
    } catch (error) {
      throw new Error(`Error retrieving active units: ${error.message}`);
    }
  }

  /**
   * Bulk get units by IDs
   * @param {Array<string>} ids - Unit IDs
   * @param {Object} options - Options for the query
   * @param {boolean} options.lean - Whether to return lean documents (default: true)
   * @param {boolean} options.throwOnNotFound - Whether to throw error if some IDs not found (default: false)
   * @param {string} businessId - Business ID
   * @returns {Promise<Object>} Result with units, found count, and not found IDs
   */
  async bulkGetUnits(ids, options = {}, businessId) {
    try {
      if (!businessId) {
        throw new Error('Business ID is required');
      }

      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('Unit IDs array is required and must not be empty');
      }

      const normalizedIds = ids.map((id) => {
        const normalized =
          typeof id === 'string' ? id.trim() : id?.toString?.();

        if (!normalized) {
          throw new Error('Invalid unit ID format');
        }

        this.validateObjectId(normalized);
        return normalized;
      });

      const { lean = true, throwOnNotFound = false } = options;

      const Model = await this.getModel('Unit', UnitSchema);

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
        throw new Error(`Units not found: ${notFoundIds.join(', ')}`);
      }

      return {
        data: documents,
        found: documents.length,
        notFound: notFoundIds,
        totalRequested: normalizedIds.length,
      };
    } catch (error) {
      throw new Error(`Bulk get units failed: ${error.message}`);
    }
  }
}

export default UnitServices;
