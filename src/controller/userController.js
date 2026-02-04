import { StatusCodes } from 'http-status-codes';
import { ResponseService } from '../utils/index.js';
import { UserServices } from '../services/index.js';
import { Business } from '../models/index.js';

const userServices = new UserServices();

class UserController {
  static async getUsers(req, res) {
    try {
      // Extract query parameters
      const queryParams = {
        page: req.query.page,
        limit: req.query.limit,
        search: req.query.search,
        sortBy: req.query.sortBy,
        sortOrder: req.query.sortOrder,
        roleId: req.query.roleId || 2,
        all: req.query.all,
        isActive: req.query.isActive,
        categoryId: req.query.categoryId,
      };

      const result = await userServices.getAllUsers(queryParams);

      if (result && result.data && result.data.length > 0) {
        ResponseService.send(
          res,
          StatusCodes.OK,
          'Users fetched successfully',
          result,
        );
      } else {
        ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'No users found',
          result,
        );
      }
    } catch (error) {
      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Error fetching users',
      );
    }
  }

  static async getUser(req, res) {
    try {
      const data = await userServices.getById(req.params.id);
      if (data) {
        ResponseService.send(
          res,
          StatusCodes.OK,
          'User fetched successfully',
          data,
        );
      } else {
        ResponseService.send(res, StatusCodes.NOT_FOUND, 'User not found');
      }
    } catch (error) {
      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Error fetching admins',
      );
    }
  }

  static async createUser(req, res) {
    try {
      const newUser = await userServices.register(req.body);
      ResponseService.send(
        res,
        StatusCodes.CREATED,
        'User created successfully',
        newUser,
      );
    } catch (error) {
      ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to create user',
      );
    }
  }

  static async updateUser(req, res) {
    try {
      const { id } = req.params;
      const data = req.body;

      const updatedUser = await userServices.updateUser(id, data);

      if (!updatedUser) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'User not found',
        );
      }

      ResponseService.send(
        res,
        StatusCodes.OK,
        'User updated successfully',
        updatedUser,
      );
    } catch (error) {
      ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to update user',
      );
    }
  }

  static async bulkToggle(req, res) {
    try {
      const { userIds } = req.body;
      const result = await userServices.toggleIsActive(userIds || []);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Users activation status updated',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to update users activation status',
      );
    }
  }

  // Bulk action-wise setter: [{ userIds: [...], isActive: true|false }]
  static async bulkSetActive(req, res) {
    try {
      const result = await userServices.bulkSetIsActive(req.body);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Users activation status updated',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to update users activation status',
      );
    }
  }

  static async toggle(req, res) {
    try {
      const { id } = req.params;
      const updatedUser = await userServices.toggleIsActiveSingle(id);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'User activation status updated',
        updatedUser,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to update user activation status',
      );
    }
  }

  /**
   * Get Business Owner Subscription Report
   * Retrieves detailed subscription information for business owners (roleId: 2)
   * Supports filtering, searching, pagination, and export functionality
   */
  static async getBusinessOwnerSubscriptionReport(req, res) {
    try {
      // Extract query parameters
      const queryParams = {
        page: req.query.page,
        limit: req.query.limit,
        search: req.query.search,
        sortBy: req.query.sortBy,
        sortOrder: req.query.sortOrder,
        status: req.query.status,
        isActive: req.query.isActive,
        planId: req.query.planId,
        paymentMethod: req.query.paymentMethod,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        export: req.query.export === 'true' || req.query.all === 'true',
      };

      const result =
        await userServices.getBusinessOwnerSubscriptionReport(queryParams);

      if (result && result.data && result.data.length > 0) {
        ResponseService.send(
          res,
          StatusCodes.OK,
          'Subscription report fetched successfully',
          result,
        );
      } else {
        ResponseService.send(
          res,
          StatusCodes.OK,
          'No subscription data found',
          result,
        );
      }
    } catch (error) {
      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Error fetching subscription report',
      );
    }
  }

  /**
   * Bulk get users by IDs
   * Retrieves multiple users by their IDs with populated role and business information
   * @param {Object} req - Express request object
   * @param {Array<string>} req.body.ids - Array of user IDs to retrieve
   * @param {Boolean} req.body.includeBusinesses - Include business information (optional, default: true)
   * @param {Boolean} req.body.includeRole - Include role information (optional, default: true)
   * @param {Boolean} req.body.throwOnNotFound - Throw error if any ID not found (optional, default: false)
   * @param {Object} res - Express response object
   */
  static async bulkGetUsers(req, res) {
    try {
      // Extract and validate IDs from request body
      const { ids, includeBusinesses, includeRole, throwOnNotFound } = req.body;

      // Validate IDs array
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'User IDs array is required and must not be empty',
        );
      }

      // Limit maximum IDs to prevent abuse (configurable based on requirements)
      const MAX_IDS = 100;
      if (ids.length > MAX_IDS) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          `Maximum ${MAX_IDS} user IDs allowed per request`,
        );
      }

      // Call service method
      const result = await userServices.bulkGetUsers(ids, {
        includeBusinesses,
        includeRole,
        throwOnNotFound,
      });

      // Prepare response message
      const message =
        result.found === result.totalRequested
          ? 'All users fetched successfully'
          : result.found > 0
            ? `${result.found} of ${result.totalRequested} users fetched successfully`
            : 'No users found';

      // Send response
      ResponseService.send(
        res,
        result.found > 0 ? StatusCodes.OK : StatusCodes.NOT_FOUND,
        message,
        result,
      );
    } catch (error) {
      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Error fetching users',
      );
    }
  }
  /**
   * Bulk download selected users
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async bulkGetSelectDownload(req, res) {
    try {
      const { ids } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'User IDs array is required',
        );
      }

      const result = await userServices.bulkGetSelectDownload(ids);

      ResponseService.send(
        res,
        StatusCodes.OK,
        'Subscription report fetched successfully',
        result,
      );
    } catch (error) {
      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Error downloading selected users',
      );
    }
  }

}

export default UserController;
