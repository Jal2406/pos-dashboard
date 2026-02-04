import { StatusCodes } from 'http-status-codes';
import { ResponseService } from '../utils/index.js';
import { LoyaltyPointServices } from '../services/index.js';

/**
 * Loyalty Point Controller
 *
 * Enterprise-grade controller for managing loyalty point operations with tenant-specific database support.
 * Handles HTTP requests and delegates business logic to LoyaltyPointServices.
 *
 * @class LoyaltyPointController
 */
class LoyaltyPointController {
  static _normalizeNumericFields(payload = {}) {
    const numericFields = [
      'loyaltyPoints',
      'minimumAmount',
      'maximumAmount',
      'expiryDuration',
    ];

    numericFields.forEach((field) => {
      if (payload[field] !== undefined) {
        const rawValue =
          typeof payload[field] === 'string'
            ? payload[field].trim()
            : payload[field];
        if (rawValue === '') {
          throw new Error(`${field} must be a valid number`);
        }
        const parsedValue = Number(rawValue);
        if (Number.isNaN(parsedValue)) {
          throw new Error(`${field} must be a valid number`);
        }
        payload[field] = parsedValue;
      }
    });

    return payload;
  }

  /**
   * Get cached model reference for better performance
   * @returns {Promise<Model>} Cached model reference
   */


  /**
   * Create a new loyalty point configuration
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async create(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;
      const userId = req.user?.id || req.user?._id;
      const loyaltyPointServices = new LoyaltyPointServices(businessId);

      let payload = {
        ...req.body,
        createdBy: userId,
        updatedBy: userId,
      };

      try {
        payload = LoyaltyPointController._normalizeNumericFields(payload);
      } catch (validationError) {
        console.error(
          'Loyalty point creation validation error:',
          validationError,
        );
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          validationError.message,
        );
      }

      const created = await loyaltyPointServices.create(payload);
      return ResponseService.send(
        res,
        StatusCodes.CREATED,
        'Loyalty point configuration created successfully',
        created,
      );
    } catch (error) {
      console.error('Loyalty point creation error:', error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to create loyalty point configuration',
      );
    }
  }

  /**
   * Get loyalty point by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async getById(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;
      const loyaltyPointServices = new LoyaltyPointServices(businessId);
      const { id } = req.params;

      const loyaltyPoint = await loyaltyPointServices.getById(id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Loyalty point configuration retrieved successfully',
        loyaltyPoint,
      );
    } catch (error) {
      console.error('Loyalty point retrieval error:', error);
      const statusCode =
        error.message.includes('not found') ||
          error.message.includes('Unauthorized')
          ? StatusCodes.NOT_FOUND
          : StatusCodes.BAD_REQUEST;
      return ResponseService.send(
        res,
        statusCode,
        error.message || 'Failed to retrieve loyalty point configuration',
      );
    }
  }

  /**
   * Get all loyalty points
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async getAll(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;
      const loyaltyPointServices = new LoyaltyPointServices(businessId);

      const loyaltyPoints = await loyaltyPointServices.getAll(req.query);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Loyalty points retrieved successfully',
        loyaltyPoints,
      );
    } catch (error) {
      console.error('Loyalty points retrieval error:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to retrieve loyalty points',
      );
    }
  }

  /**
   * List loyalty points with pagination, search, and filtering
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async list(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;
      const loyaltyPointServices = new LoyaltyPointServices(businessId);

      // Extract query parameters
      const queryParams = {
        all: req.query.all,
        isActive: req.query.isActive,
        page: req.query.page,
        limit: req.query.limit,
        search: req.query.search,
        sortBy: req.query.sortBy,
        sortOrder: req.query.sortOrder,
        status: req.query.status,
        includeCount: req.query.includeCount !== 'false',
        filters: req.query.filters ? JSON.parse(req.query.filters) : {},
      };

      const result = await loyaltyPointServices.list(queryParams);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Loyalty points listed successfully',
        result,
      );
    } catch (error) {
      console.error('Loyalty points listing error:', error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to list loyalty points',
      );
    }
  }

  /**
   * Bulk get loyalty points by IDs
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async bulkGet(req, res) {
    try {
      const { ids, lean, throwOnNotFound } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Loyalty Point IDs array is required and must not be empty',
        );
      }

      const MAX_IDS = 100;
      if (ids.length > MAX_IDS) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          `Maximum ${MAX_IDS} Loyalty Point IDs allowed per request`,
        );
      }

      const businessId = req.user?.businessId || req.businessId;
      const loyaltyPointServices = new LoyaltyPointServices(businessId);
      const result = await loyaltyPointServices.bulkGetLoyaltyPoints(ids, {
        lean,
        throwOnNotFound,
      });

      const message =
        result.found === result.totalRequested
          ? 'All Loyalty Points fetched successfully'
          : result.found > 0
            ? `${result.found} of ${result.totalRequested} Loyalty Points fetched successfully`
            : 'No Loyalty Points found';

      return ResponseService.send(
        res,
        result.found > 0 ? StatusCodes.OK : StatusCodes.NOT_FOUND,
        message,
        result,
      );
    } catch (error) {
      console.error('Loyalty points bulk get error:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Error fetching Loyalty Points',
      );
    }
  }

  /**
   * Update loyalty point by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async update(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;
      const userId = req.user?.id || req.user?._id;
      const loyaltyPointServices = new LoyaltyPointServices(businessId);
      const { id } = req.params;

      let payload = {
        ...req.body,
        updatedBy: userId,
      };

      // Prevent changing tenant accidentally
      delete payload.businessId;

      try {
        payload = LoyaltyPointController._normalizeNumericFields(payload);
      } catch (validationError) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          validationError.message,
        );
      }

      const updated = await loyaltyPointServices.updateById(id, payload);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Loyalty point configuration updated successfully',
        updated,
      );
    } catch (error) {
      console.error('Loyalty point update error:', error);
      const statusCode =
        error.message.includes('not found') ||
          error.message.includes('Unauthorized')
          ? StatusCodes.NOT_FOUND
          : StatusCodes.BAD_REQUEST;
      return ResponseService.send(
        res,
        statusCode,
        error.message || 'Failed to update loyalty point configuration',
      );
    }
  }

  /**
   * Delete loyalty point by ID (hard delete)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async delete(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;
      const loyaltyPointServices = new LoyaltyPointServices(businessId);
      const { id } = req.params;

      const deleted = await loyaltyPointServices.deleteById(id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Loyalty point configuration deleted successfully',
        deleted,
      );
    } catch (error) {
      console.error('Loyalty point deletion error:', error);
      const statusCode =
        error.message.includes('not found') ||
          error.message.includes('Unauthorized')
          ? StatusCodes.NOT_FOUND
          : StatusCodes.BAD_REQUEST;
      return ResponseService.send(
        res,
        statusCode,
        error.message || 'Failed to delete loyalty point configuration',
      );
    }
  }

  /**
   * Bulk update loyalty point status
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async bulkUpdateStatus(req, res) {
    try {
      const { ids, status } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'IDs array is required and must not be empty',
        );
      }

      if (typeof status !== 'boolean') {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Status must be a boolean value',
        );
      }

      const businessId = req.user?.businessId || req.businessId;
      const userId = req.user?.id || req.user?._id;
      const loyaltyPointServices = new LoyaltyPointServices(businessId);

      const result = await loyaltyPointServices.bulkUpdateStatus(
        ids,
        status,
        userId,
      );

      return ResponseService.send(
        res,
        StatusCodes.OK,
        result.message || 'Loyalty point statuses updated successfully',
        result,
      );
    } catch (error) {
      console.error('Loyalty point bulk status update error:', error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to bulk update loyalty point statuses',
      );
    }
  }

  /**
   * Bulk delete loyalty point configurations
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  // static async bulkDelete(req, res) {
  //   try {
  //     const { ids } = req.body;

  //     if (!Array.isArray(ids) || ids.length === 0) {
  //       return ResponseService.send(
  //         res,
  //         StatusCodes.BAD_REQUEST,
  //         'IDs array is required and must not be empty',
  //       );
  //     }

  //     const businessId = req.user?.businessId || req.businessId;
  //     const loyaltyPointServices = new LoyaltyPointServices(businessId);

  //     const result = await loyaltyPointServices.bulkDelete(ids);

  //     return ResponseService.send(
  //       res,
  //       StatusCodes.OK,
  //       result.message || 'Loyalty point configurations deleted successfully',
  //       result,
  //     );
  //   } catch (error) {
  //     console.error('Loyalty point bulk delete error:', error);
  //     return ResponseService.send(
  //       res,
  //       StatusCodes.BAD_REQUEST,
  //       error.message || 'Failed to bulk delete loyalty point configurations',
  //     );
  //   }
  // }

  /**
   * Soft delete loyalty point by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async softDelete(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;
      const loyaltyPointServices = new LoyaltyPointServices(businessId);
      const { id } = req.params;

      const deleted = await loyaltyPointServices.softDeleteById(id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Loyalty point configuration soft deleted successfully',
        deleted,
      );
    } catch (error) {
      console.error('Loyalty point soft deletion error:', error);
      const statusCode =
        error.message.includes('not found') ||
          error.message.includes('Unauthorized')
          ? StatusCodes.NOT_FOUND
          : StatusCodes.BAD_REQUEST;
      return ResponseService.send(
        res,
        statusCode,
        error.message || 'Failed to soft delete loyalty point configuration',
      );
    }
  }

  /**
   * Restore soft-deleted loyalty point
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async restore(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;
      const loyaltyPointServices = new LoyaltyPointServices(businessId);
      const { id } = req.params;

      const restored = await loyaltyPointServices.restoreById(id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Loyalty point configuration restored successfully',
        restored,
      );
    } catch (error) {
      console.error('Loyalty point restoration error:', error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to restore loyalty point configuration',
      );
    }
  }

  /**
      * Bulk soft delete loyalty points
      * @param {Object} req - Express request object
      * @param {Object} res - Express response object
      * @returns {Promise<void>}
      */
  static async bulkSoftDelete(req, res) {
    try {
      const businessId = req.businessId;
      const service = new LoyaltyPointServices(businessId);
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
        'Loyalty points soft deleted successfully',
        result,
      );
    } catch (error) {
      console.log('Bulk soft delete error:', error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to bulk soft delete loyalty points',
      );
    }
  }

  /**
   * Update loyalty point status (activate/deactivate)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async updateStatus(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;
      const userId = req.user?.id || req.user?._id;
      const loyaltyPointServices = new LoyaltyPointServices(businessId);
      const { id } = req.params;
      const { status } = req.body;

      if (typeof status !== 'boolean') {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Status must be a boolean value',
        );
      }

      const updated = await loyaltyPointServices.updateStatus(
        id,
        status,
        userId,
      );
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Loyalty point status updated successfully',
        updated,
      );
    } catch (error) {
      console.error('Loyalty point status update error:', error);
      const statusCode =
        error.message.includes('not found') ||
          error.message.includes('Unauthorized')
          ? StatusCodes.NOT_FOUND
          : StatusCodes.BAD_REQUEST;
      return ResponseService.send(
        res,
        statusCode,
        error.message || 'Failed to update loyalty point status',
      );
    }
  }

  /**
   * Toggle loyalty point status
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async toggleStatus(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;
      const userId = req.user?.id || req.user?._id;
      const loyaltyPointServices = new LoyaltyPointServices(businessId);
      const { id } = req.params;

      // Get current loyalty point to toggle status
      const loyaltyPoint = await loyaltyPointServices.getById(id);
      const newStatus = !loyaltyPoint.status;

      const updated = await loyaltyPointServices.updateStatus(
        id,
        newStatus,
        userId,
      );
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Loyalty point status toggled successfully',
        updated,
      );
    } catch (error) {
      console.error('Loyalty point status toggle error:', error);
      const statusCode =
        error.message.includes('not found') ||
          error.message.includes('Unauthorized')
          ? StatusCodes.NOT_FOUND
          : StatusCodes.BAD_REQUEST;
      return ResponseService.send(
        res,
        statusCode,
        error.message || 'Failed to toggle loyalty point status',
      );
    }
  }

  /**
   * Get active loyalty point configuration
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async getActive(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;
      const loyaltyPointServices = new LoyaltyPointServices(businessId);

      const activeLoyaltyPoint = await loyaltyPointServices.getActive();
      if (!activeLoyaltyPoint) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'No active loyalty point configuration found',
        );
      }

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Active loyalty point configuration retrieved successfully',
        activeLoyaltyPoint,
      );
    } catch (error) {
      console.error('Active loyalty point retrieval error:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message ||
        'Failed to retrieve active loyalty point configuration',
      );
    }
  }
}

export default LoyaltyPointController;
