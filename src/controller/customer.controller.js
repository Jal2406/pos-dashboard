import { StatusCodes } from 'http-status-codes';
import { ResponseService } from '../utils/index.js';
import { CustomerService } from '../services/index.js';

/**
 * Customer Controller
 *
 * Enterprise-grade controller for managing customer operations with tenant-specific database support.
 * Handles HTTP requests and delegates business logic to CustomerService.
 *
 * @class CustomerController
 */
class CustomerController {
  /**
   * Create a new customer
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async create(req, res) {
    try {
      const businessId = req.businessId;
      const userId = req.user?.id || req.user?._id;
      const service = new CustomerService(businessId);

      const payload = {
        ...req.body,
        createdBy: userId,
      };

      const created = await service.createCustomer(payload);
      return ResponseService.send(
        res,
        StatusCodes.CREATED,
        'Customer created successfully',
        created,
      );
    } catch (error) {
      console.log('Customer creation error:', error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to create customer',
      );
    }
  }

  /**
   * Get customer by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async getById(req, res) {
    try {
      const businessId = req.businessId;
      const service = new CustomerService(businessId);

      const populate = req.query.populate
        ? req.query.populate.split(',')
        : ['createdBy', 'updatedBy'];

      const customer = await service.getCustomerById(req.params.id, {
        populate,
      });

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Customer retrieved successfully',
        customer,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.NOT_FOUND,
        error.message || 'Customer not found',
      );
    }
  }

  /**
   * Update customer by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async update(req, res) {
    try {
      const businessId = req.businessId;
      const userId = req.user?.id || req.user?._id;
      const service = new CustomerService(businessId);

      const payload = {
        ...req.body,
        updatedBy: userId,
      };

      const updated = await service.updateCustomer(req.params.id, payload);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Customer updated successfully',
        updated,
      );
    } catch (error) {
      console.log('Customer update error:', error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to update customer',
      );
    }
  }

  /**
   * Delete customer by ID (hard delete)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async remove(req, res) {
    try {
      const businessId = req.businessId;
      const service = new CustomerService(businessId);

      const deleted = await service.deleteCustomer(req.params.id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Customer deleted successfully',
        deleted,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to delete customer',
      );
    }
  }

  /**
   * Soft delete customer by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async softDelete(req, res) {
    try {
      const businessId = req.businessId;
      const service = new CustomerService(businessId);

      const deleted = await service.softDeleteCustomer(req.params.id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Customer soft deleted successfully',
        deleted,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to soft delete customer',
      );
    }
  }

  /**
   * Restore soft-deleted customer
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async restore(req, res) {
    try {
      const businessId = req.businessId;
      const service = new CustomerService(businessId);

      const restored = await service.restoreCustomer(req.params.id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Customer restored successfully',
        restored,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to restore customer',
      );
    }
  }

  /**
   * List customers with pagination, filtering, and search
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async list(req, res) {
    try {
      const businessId = req.businessId;
      const service = new CustomerService(businessId);

      // Extract all query parameters
      const {
        page,
        limit,
        search,
        sortBy,
        sortOrder,
        gender,
        city,
        state,
        all,
        isActive,
      } = req.query;

      const fetchAll = all === 'true' || all === true;
      const isActiveFilter =
        typeof isActive === 'boolean'
          ? isActive
          : typeof isActive === 'string'
            ? isActive.toLowerCase() === 'true'
            : undefined;

      // Prepare query params object
      const queryParams = {
        page: page ? parseInt(page) : undefined,
        limit: limit ? parseInt(limit) : undefined,
        search,
        sortBy,
        sortOrder,
        gender,
        city,
        state,
        all: fetchAll,
        isActive: isActiveFilter,
      };

      // Remove undefined values
      Object.keys(queryParams).forEach(
        (key) => queryParams[key] === undefined && delete queryParams[key],
      );

      const result = await service.listCustomers(queryParams);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Customers fetched successfully',
        result,
      );
    } catch (error) {
      console.log('Customer list error:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch customers',
      );
    }
  }

  /**
   * Get all active customers
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async getActive(req, res) {
    try {
      const businessId = req.businessId;
      const service = new CustomerService(businessId);

      const populate = req.query.populate
        ? req.query.populate.split(',')
        : null;

      const customers = await service.getActiveCustomers({
        populate,
        sort: req.query.sort ? JSON.parse(req.query.sort) : undefined,
      });

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Active customers fetched successfully',
        customers,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch active customers',
      );
    }
  }

  /**
   * Get customers by status
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async getByStatus(req, res) {
    try {
      const businessId = req.businessId;
      const service = new CustomerService(businessId);
      const { isActive } = req.params;

      const isActiveBoolean = isActive === 'true' || isActive === 'active';

      const populate = req.query.populate
        ? req.query.populate.split(',')
        : null;

      const customers = await service.getCustomersByStatus(isActiveBoolean, {
        populate,
        sort: req.query.sort ? JSON.parse(req.query.sort) : undefined,
      });

      return ResponseService.send(
        res,
        StatusCodes.OK,
        `Customers with status '${isActive}' fetched successfully`,
        customers,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to fetch customers by status',
      );
    }
  }

  /**
   * Get customers by gender
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async getByGender(req, res) {
    try {
      const businessId = req.businessId;
      const service = new CustomerService(businessId);
      const { gender } = req.params;

      const populate = req.query.populate
        ? req.query.populate.split(',')
        : null;

      const customers = await service.getCustomersByGender(gender, {
        populate,
        sort: req.query.sort ? JSON.parse(req.query.sort) : undefined,
      });

      return ResponseService.send(
        res,
        StatusCodes.OK,
        `Customers with gender '${gender}' fetched successfully`,
        customers,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to fetch customers by gender',
      );
    }
  }

  /**
   * Get customers by location
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async getByLocation(req, res) {
    try {
      const businessId = req.businessId;
      const service = new CustomerService(businessId);
      const { city, state } = req.query;

      if (!city || !state) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'City and state query parameters are required',
        );
      }

      const populate = req.query.populate
        ? req.query.populate.split(',')
        : null;

      const customers = await service.getCustomersByLocation(city, state, {
        populate,
        sort: req.query.sort ? JSON.parse(req.query.sort) : undefined,
      });

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Customers by location fetched successfully',
        customers,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch customers by location',
      );
    }
  }

  /**
   * Search customers
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async search(req, res) {
    try {
      const businessId = req.businessId;
      const service = new CustomerService(businessId);
      const { q } = req.query;

      if (!q) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Search query parameter (q) is required',
        );
      }

      const populate = req.query.populate
        ? req.query.populate.split(',')
        : null;

      const customers = await service.searchCustomers(q, {
        limit: req.query.limit ? parseInt(req.query.limit) : undefined,
        populate,
      });

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Customer search completed successfully',
        customers,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to search customers',
      );
    }
  }

  /**
   * Find customer by email
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async findByEmail(req, res) {
    try {
      const businessId = req.businessId;
      const service = new CustomerService(businessId);
      const { email } = req.query;

      if (!email) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Email query parameter is required',
        );
      }

      const customer = await service.findByEmail(email, {
        includeDeleted: req.query.includeDeleted === 'true',
      });

      if (!customer) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Customer not found',
          null,
        );
      }

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Customer found successfully',
        customer,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to find customer by email',
      );
    }
  }

  /**
   * Find customer by phone
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async findByPhone(req, res) {
    try {
      const businessId = req.businessId;
      const service = new CustomerService(businessId);
      const { phone } = req.query;

      if (!phone) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Phone query parameter is required',
        );
      }

      const customer = await service.findByPhone(phone, {
        includeDeleted: req.query.includeDeleted === 'true',
      });

      if (!customer) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Customer not found',
          null,
        );
      }

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Customer found successfully',
        customer,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to find customer by phone',
      );
    }
  }

  /**
   * Bulk update customer status
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async bulkUpdateStatus(req, res) {
    try {
      const businessId = req.businessId;
      const userId = req.user?.id || req.user?._id;
      const service = new CustomerService(businessId);
      const { ids, isActive } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        console.log('ids must be a non-empty array', ids);
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'ids must be a non-empty array',
        );
      }

      if (typeof isActive !== 'boolean') {
        
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'isActive must be a boolean',
        );
      }

      const result = await service.bulkUpdateStatus(ids, isActive, userId);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Customer statuses updated successfully',
        result,
      );
    } catch (error) {
      console.log('Bulk update status error:', error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to bulk update customer status',
      );
    }
  }

  /**
   * Bulk soft delete customers
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async bulkSoftDelete(req, res) {
    try {
      const businessId = req.businessId;
      const service = new CustomerService(businessId);
      const { ids } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'ids must be a non-empty array',
        );
      }

      const result = await service.bulkSoftDelete(ids);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Customers soft deleted successfully',
        result,
      );
    } catch (error) {
      console.log('Bulk soft delete error:', error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to bulk soft delete customers',
      );
    }
  }

  /**
   * Get customer count
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async getCount(req, res) {
    try {
      const businessId = req.businessId;
      const service = new CustomerService(businessId);
      const { isActive } = req.query;

      const isActiveBoolean =
        isActive !== undefined
          ? isActive === 'true' || isActive === 'active'
          : null;

      const count = await service.getCustomerCount(isActiveBoolean);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Customer count retrieved successfully',
        { count },
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to get customer count',
      );
    }
  }

  /**
   * Get customer statistics
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async getStatistics(req, res) {
    try {
      const businessId = req.businessId;
      const service = new CustomerService(businessId);

      const stats = await service.getCustomerStatistics();
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Customer statistics retrieved successfully',
        stats,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to get customer statistics',
      );
    }
  }

  /**
   * Toggle customer status
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async toggleStatus(req, res) {
    try {
      const businessId = req.businessId;
      const userId = req.user?.id || req.user?._id;
      const service = new CustomerService(businessId);

      const customer = await service.getCustomerById(req.params.id);
      const newIsActive = !customer.isActive;

      const updated = await service.updateCustomer(req.params.id, {
        isActive: newIsActive,
        updatedBy: userId,
      });

      return ResponseService.send(
        res,
        StatusCodes.OK,
        `Customer ${newIsActive ? 'activated' : 'deactivated'} successfully`,
        updated,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to toggle customer status',
      );
    }
  }

  /**
   * Bulk get customers by IDs
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async bulkGet(req, res) {
    try {
      const businessId = req.businessId;
      const service = new CustomerService(businessId);
      const { ids, lean, throwOnNotFound, populate } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Customer IDs array is required and must not be empty',
        );
      }

      const MAX_IDS = 100;
      if (ids.length > MAX_IDS) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          `Maximum ${MAX_IDS} customer IDs allowed per request`,
        );
      }

      const result = await service.bulkGetCustomers(ids, {
        populate,
        lean,
        throwOnNotFound,
      });

      const message =
        result.found === result.totalRequested
          ? 'All customers fetched successfully'
          : result.found > 0
            ? `${result.found} of ${result.totalRequested} customers fetched successfully`
            : 'No customers found';

      return ResponseService.send(res, StatusCodes.OK, message, result);
    } catch (error) {
      console.log('Bulk get customers error:', error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to bulk get customers',
      );
    }
  }
}

export default CustomerController;
