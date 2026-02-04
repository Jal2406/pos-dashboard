import { BaseService } from '../utils/index.js';
import { SupplierSchema } from '../models/Supplier.js';
import mongoose from 'mongoose';

class SupplierServices extends BaseService {
  constructor(businessId) {
    if (!businessId) {
      throw new Error('SupplierServices initialized without businessId');
    }
    super({
      modelName: 'Supplier',
      schema: SupplierSchema,
      collection: 'suppliers',
      businessId,
    });
  }

  async create(data, userId) {
    try {
      const supplierData = {
        ...data,
      };

      if (userId) {
        supplierData.createdBy = userId;
        supplierData.updatedBy = userId;
      }

      console.log("supplierData", supplierData);

      // Generate supplier code if not provided
      if (!supplierData.supplierCode) {
        supplierData.supplierCode = await this.generateSupplierCode();
      }

      return await super.create(supplierData);
    } catch (error) {
      console.log(error);
      throw new Error(`Error creating supplier: ${error.message}`);
    }
  }

  async updateById(id, data, userId) {
    try {
      // Add audit fields
      const updateData = {
        ...data,
        updatedBy: userId,
      };

      return await super.updateById(id, updateData);
    } catch (error) {
      throw new Error(`Error updating supplier: ${error.message}`);
    }
  }

  async list(queryParams = {}) {
    const {
      page = 1,
      limit = 10,
      search = '',
      sortBy = 'createdAt',
      sortOrder = 'desc',
      status,
      city,
      state,
    } = queryParams;

    const filters = { isDeleted: false };

    if (status !== undefined) {
      filters.status = status;
    }

    // Add location filters
    if (city) {
      filters['address.city'] = new RegExp(city, 'i');
    }
    if (state) {
      filters['address.state'] = new RegExp(state, 'i');
    }

    return await super.list({
      page,
      limit,
      search,
      searchFields: [
        'name',
        'supplierCode',
        'email',
        'address.city',
        'address.state',
      ],
      sortBy,
      sortOrder,
      filters,
    });
  }

  async search(searchTerm, queryParams = {}) {
    try {
      const { page = 1, limit = 10 } = queryParams;

      const filters = { isDeleted: false };

      const Model = await this.getModelRef();

      // Use text search if available, otherwise fallback to regex search
      let query;
      if (searchTerm) {
        query = {
          ...filters,
          $text: { $search: searchTerm },
        };
      } else {
        query = filters;
      }

      const {
        page: validatedPage,
        limit: validatedLimit,
        skip,
      } = this.validatePagination(page, limit);

      const [suppliers, total] = await Promise.all([
        Model.find(query)
          .sort(searchTerm ? { score: { $meta: 'textScore' } } : { name: 1 })
          .skip(skip)
          .limit(validatedLimit)
          .exec(),
        Model.countDocuments(query),
      ]);

      return {
        data: suppliers,
        pagination: {
          currentPage: validatedPage,
          totalPages: Math.ceil(total / validatedLimit),
          totalItems: total,
          itemsPerPage: validatedLimit,
          hasNext: validatedPage * validatedLimit < total,
          hasPrev: validatedPage > 1,
        },
      };
    } catch (error) {
      throw new Error(`Error searching suppliers: ${error.message}`);
    }
  }

  async getByLocation(city, state, queryParams = {}) {
    try {
      const { page = 1, limit = 10 } = queryParams;

      const filters = {
        isDeleted: false,
        'address.city': new RegExp(city, 'i'),
        'address.state': new RegExp(state, 'i'),
      };

      const {
        page: validatedPage,
        limit: validatedLimit,
        skip,
      } = this.validatePagination(page, limit);

      const Model = await this.getModelRef();
      const [suppliers, total] = await Promise.all([
        Model.find(filters)
          .sort({ name: 1 })
          .skip(skip)
          .limit(validatedLimit)
          .exec(),
        Model.countDocuments(filters),
      ]);

      return {
        data: suppliers,
        pagination: {
          currentPage: validatedPage,
          totalPages: Math.ceil(total / validatedLimit),
          totalItems: total,
          itemsPerPage: validatedLimit,
          hasNext: validatedPage * validatedLimit < total,
          hasPrev: validatedPage > 1,
        },
      };
    } catch (error) {
      throw new Error(`Error fetching suppliers by location: ${error.message}`);
    }
  }

  async getByStatus(status, queryParams = {}) {
    try {
      const { page = 1, limit = 10 } = queryParams;

      const filters = { status, isDeleted: false };

      const {
        page: validatedPage,
        limit: validatedLimit,
        skip,
      } = this.validatePagination(page, limit);

      const Model = await this.getModelRef();
      const [suppliers, total] = await Promise.all([
        Model.find(filters)
          .sort({ name: 1 })
          .skip(skip)
          .limit(validatedLimit)
          .exec(),
        Model.countDocuments(filters),
      ]);

      return {
        data: suppliers,
        pagination: {
          currentPage: validatedPage,
          totalPages: Math.ceil(total / validatedLimit),
          totalItems: total,
          itemsPerPage: validatedLimit,
          hasNext: validatedPage * validatedLimit < total,
          hasPrev: validatedPage > 1,
        },
      };
    } catch (error) {
      throw new Error(`Error fetching suppliers by status: ${error.message}`);
    }
  }

  async getActiveSuppliers(queryParams = {}) {
    try {
      const { page = 1, limit = 10 } = queryParams;

      const filters = {
        status: true,
        isDeleted: false,
      };

      const {
        page: validatedPage,
        limit: validatedLimit,
        skip,
      } = this.validatePagination(page, limit);

      const Model = await this.getModelRef();
      const [suppliers, total] = await Promise.all([
        Model.find(filters)
          .sort({ name: 1 })
          .skip(skip)
          .limit(validatedLimit)
          .exec(),
        Model.countDocuments(filters),
      ]);

      return {
        data: suppliers,
        pagination: {
          currentPage: validatedPage,
          totalPages: Math.ceil(total / validatedLimit),
          totalItems: total,
          itemsPerPage: validatedLimit,
          hasNext: validatedPage * validatedLimit < total,
          hasPrev: validatedPage > 1,
        },
      };
    } catch (error) {
      throw new Error(`Error fetching active suppliers: ${error.message}`);
    }
  }

  async bulkDelete(ids) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('No supplier IDs provided for bulk delete');
      }

      ids.forEach((id) => {
        if (!mongoose.isValidObjectId(id)) {
          throw new Error(`Invalid supplier ID: ${id}`);
        }
      });

      const Model = await this.getModelRef();
      const result = await Model.updateMany(
        { _id: { $in: ids } },
        { isDeleted: true, deletedAt: new Date() },
      );

      return {
        deletedCount: result.modifiedCount,
        message: `${result.modifiedCount} suppliers deleted successfully`,
      };
    } catch (error) {
      throw new Error(`Bulk delete failed: ${error.message}`);
    }
  }

  async bulkUpdateStatus(ids, status, userId) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('No supplier IDs provided for bulk update');
      }

      if (typeof status !== 'boolean') {
        throw new Error('Invalid status. Must be a boolean value (true/false)');
      }

      ids.forEach((id) => {
        if (!mongoose.isValidObjectId(id)) {
          throw new Error(`Invalid supplier ID: ${id}`);
        }
      });

      const Model = await this.getModelRef();
      const result = await Model.updateMany(
        { _id: { $in: ids } },
        { status, updatedBy: userId },
      );

      return {
        updatedCount: result.modifiedCount,
        message: `${result.modifiedCount} suppliers status updated to ${status ? 'active' : 'inactive'
          }`,
      };
    } catch (error) {
      throw new Error(`Bulk status update failed: ${error.message}`);
    }
  }

  async getSupplierStats() {
    try {
      const Model = await this.getModelRef();

      const [
        totalSuppliers,
        activeSuppliers,
        inactiveSuppliers,
        suppliersByCity,
        suppliersByState,
      ] = await Promise.all([
        Model.countDocuments({ isDeleted: false }),
        Model.countDocuments({
          status: true,
          isDeleted: false,
        }),
        Model.countDocuments({
          status: false,
          isDeleted: false,
        }),
        Model.aggregate([
          { $match: { isDeleted: false } },
          { $group: { _id: '$address.city', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ]),
        Model.aggregate([
          { $match: { isDeleted: false } },
          { $group: { _id: '$address.state', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ]),
      ]);

      return {
        total: totalSuppliers,
        byStatus: {
          active: activeSuppliers,
          inactive: inactiveSuppliers,
        },
        topCities: suppliersByCity,
        topStates: suppliersByState,
      };
    } catch (error) {
      throw new Error(`Error fetching supplier statistics: ${error.message}`);
    }
  }

  async generateSupplierCode() {
    try {
      const Model = await this.getModelRef();

      // Find the highest existing supplier code
      const lastSupplier = await Model.findOne(
        { supplierCode: { $exists: true } },
        { supplierCode: 1 },
        { sort: { supplierCode: -1 } },
      );

      let nextNumber = 1;
      if (lastSupplier && lastSupplier.supplierCode) {
        // Extract number from existing code (assuming format like SUP001, SUP002, etc.)
        const match = lastSupplier.supplierCode.match(/(\d+)$/);
        if (match) {
          nextNumber = parseInt(match[1]) + 1;
        }
      }

      // Generate code with format SUP001, SUP002, etc.
      const code = `SUP${nextNumber.toString().padStart(3, '0')}`;

      // Check if code already exists (race condition protection)
      const existing = await Model.findOne({ supplierCode: code });
      if (existing) {
        // If exists, try again with incremented number
        return this.generateSupplierCode();
      }

      return code;
    } catch (error) {
      throw new Error(`Error generating supplier code: ${error.message}`);
    }
  }

  async validateSupplierCode(code) {
    try {
      if (!code || typeof code !== 'string') {
        return false;
      }

      const Model = await this.getModelRef();
      const existing = await Model.findOne({
        supplierCode: code.toUpperCase(),
        isDeleted: false,
      });

      return !existing; // Return true if code is available
    } catch (error) {
      throw new Error(`Error validating supplier code: ${error.message}`);
    }
  }
}

export default SupplierServices;
