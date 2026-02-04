import { StatusCodes } from 'http-status-codes';
import { ResponseService } from '../utils/index.js';
import { LoyaltyRedemptionRuleServices } from '../services/index.js';

/**
 * Loyalty Redemption Rule Controller
 *
 * Enterprise-grade controller for managing loyalty redemption rule operations with tenant-specific database support.
 * Handles HTTP requests and delegates business logic to LoyaltyRedemptionRuleServices.
 *
 * @class LoyaltyRedemptionRuleController
 */
class LoyaltyRedemptionRuleController {
  /**
   * Create a new loyalty redemption rule
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async create(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;
      const userId = req.user?.id || req.user?._id;
      const loyaltyRedemptionRuleServices = new LoyaltyRedemptionRuleServices(
        businessId,
      );

      const payload = {
        ...req.body,
        createdBy: userId,
        updatedBy: userId,
      };

      const created = await loyaltyRedemptionRuleServices.create(payload);
      return ResponseService.send(
        res,
        StatusCodes.CREATED,
        'Loyalty redemption rule created successfully',
        created,
      );
    } catch (error) {
      console.error('Loyalty redemption rule creation error:', error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to create loyalty redemption rule',
      );
    }
  }

  /**
   * Get loyalty redemption rule by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async getById(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;
      const loyaltyRedemptionRuleServices = new LoyaltyRedemptionRuleServices(
        businessId,
      );
      const { id } = req.params;

      const rule = await loyaltyRedemptionRuleServices.getById(id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Loyalty redemption rule retrieved successfully',
        rule,
      );
    } catch (error) {
      console.error('Loyalty redemption rule retrieval error:', error);
      const statusCode =
        error.message.includes('not found') ||
          error.message.includes('Unauthorized')
          ? StatusCodes.NOT_FOUND
          : StatusCodes.BAD_REQUEST;
      return ResponseService.send(
        res,
        statusCode,
        error.message || 'Failed to retrieve loyalty redemption rule',
      );
    }
  }

  /**
   * Get all loyalty redemption rules
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async getAll(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;
      const loyaltyRedemptionRuleServices = new LoyaltyRedemptionRuleServices(
        businessId,
      );

      const rules = await loyaltyRedemptionRuleServices.getAll(req.query);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Loyalty redemption rules retrieved successfully',
        rules,
      );
    } catch (error) {
      console.error('Loyalty redemption rules retrieval error:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to retrieve loyalty redemption rules',
      );
    }
  }

  /**
   * List loyalty redemption rules with pagination, search, and filtering
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async list(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;
      const loyaltyRedemptionRuleServices = new LoyaltyRedemptionRuleServices(
        businessId,
      );

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

      const result = await loyaltyRedemptionRuleServices.list(queryParams);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Loyalty redemption rules listed successfully',
        result,
      );
    } catch (error) {
      console.error('Loyalty redemption rules listing error:', error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to list loyalty redemption rules',
      );
    }
  }

  /**
   * Bulk get loyalty redemption rules by IDs
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async bulkGet(req, res) {
    try {
      const { ids, lean, throwOnNotFound } = req.body;
      console.log('ids', ids);

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Redemption Rule IDs array is required and must not be empty',
        );
      }

      const MAX_IDS = 100;
      if (ids.length > MAX_IDS) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          `Maximum ${MAX_IDS} Redemption Rule IDs allowed per request`,
        );
      }

      const businessId = req.user?.businessId || req.businessId;
      const loyaltyRedemptionRuleServices = new LoyaltyRedemptionRuleServices(
        businessId,
      );
      const result = await loyaltyRedemptionRuleServices.bulkGetRedemptionRules(
        ids,
        {
          lean,
          throwOnNotFound,
        },
      );

      const message =
        result.found === result.totalRequested
          ? 'All Redemption Rules fetched successfully'
          : result.found > 0
            ? `${result.found} of ${result.totalRequested} Redemption Rules fetched successfully`
            : 'No Redemption Rules found';

      return ResponseService.send(
        res,
        result.found > 0 ? StatusCodes.OK : StatusCodes.NOT_FOUND,
        message,
        result,
      );
    } catch (error) {
      console.error('Redemption rules bulk get error:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Error fetching Redemption Rules',
      );
    }
  }

  /**
   * Update loyalty redemption rule by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async update(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;
      const userId = req.user?.id || req.user?._id;
      const loyaltyRedemptionRuleServices = new LoyaltyRedemptionRuleServices(
        businessId,
      );
      const { id } = req.params;

      const payload = {
        ...req.body,
        updatedBy: userId,
      };

      // Prevent changing tenant accidentally
      delete payload.businessId;

      const updated = await loyaltyRedemptionRuleServices.updateById(
        id,
        payload,
      );
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Loyalty redemption rule updated successfully',
        updated,
      );
    } catch (error) {
      console.error('Loyalty redemption rule update error:', error);
      const statusCode =
        error.message.includes('not found') ||
          error.message.includes('Unauthorized')
          ? StatusCodes.NOT_FOUND
          : StatusCodes.BAD_REQUEST;
      return ResponseService.send(
        res,
        statusCode,
        error.message || 'Failed to update loyalty redemption rule',
      );
    }
  }

  /**
   * Delete loyalty redemption rule by ID (hard delete)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async delete(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;
      const loyaltyRedemptionRuleServices = new LoyaltyRedemptionRuleServices(
        businessId,
      );
      const { id } = req.params;

      const deleted = await loyaltyRedemptionRuleServices.deleteById(id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Loyalty redemption rule deleted successfully',
        deleted,
      );
    } catch (error) {
      console.error('Loyalty redemption rule deletion error:', error);
      const statusCode =
        error.message.includes('not found') ||
          error.message.includes('Unauthorized')
          ? StatusCodes.NOT_FOUND
          : StatusCodes.BAD_REQUEST;
      return ResponseService.send(
        res,
        statusCode,
        error.message || 'Failed to delete loyalty redemption rule',
      );
    }
  }

  /**
   * Bulk update loyalty redemption rule status
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
      const loyaltyRedemptionRuleServices = new LoyaltyRedemptionRuleServices(
        businessId,
      );

      const result = await loyaltyRedemptionRuleServices.bulkUpdateStatus(
        ids,
        status,
        userId,
      );

      return ResponseService.send(
        res,
        StatusCodes.OK,
        result.message ||
        'Loyalty redemption rule statuses updated successfully',
        result,
      );
    } catch (error) {
      console.error(
        'Loyalty redemption rule bulk status update error:',
        error,
      );
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message ||
        'Failed to bulk update loyalty redemption rule statuses',
      );
    }
  }

  /**
   * Bulk soft delete loyalty redemption rules
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async bulkSoftDelete(req, res) {
    try {
      const businessId = req.businessId;
      const service = new LoyaltyRedemptionRuleServices(businessId);
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
        'Loyalty redemption rules soft deleted successfully',
        result,
      );
    } catch (error) {
      console.log('Bulk soft delete error:', error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to bulk soft delete loyalty Redemption rules',
      );
    }
  }

  /**
   * Soft delete loyalty redemption rule by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async softDelete(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;
      const loyaltyRedemptionRuleServices = new LoyaltyRedemptionRuleServices(
        businessId,
      );
      const { id } = req.params;

      const deleted = await loyaltyRedemptionRuleServices.softDeleteById(id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Loyalty redemption rule soft deleted successfully',
        deleted,
      );
    } catch (error) {
      console.error('Loyalty redemption rule soft deletion error:', error);
      const statusCode =
        error.message.includes('not found') ||
          error.message.includes('Unauthorized')
          ? StatusCodes.NOT_FOUND
          : StatusCodes.BAD_REQUEST;
      return ResponseService.send(
        res,
        statusCode,
        error.message || 'Failed to soft delete loyalty redemption rule',
      );
    }
  }

  /**
   * Restore soft-deleted loyalty redemption rule
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async restore(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;
      const loyaltyRedemptionRuleServices = new LoyaltyRedemptionRuleServices(
        businessId,
      );
      const { id } = req.params;

      const restored = await loyaltyRedemptionRuleServices.restoreById(id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Loyalty redemption rule restored successfully',
        restored,
      );
    } catch (error) {
      console.error('Loyalty redemption rule restoration error:', error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to restore loyalty redemption rule',
      );
    }
  }

  /**
   * Update loyalty redemption rule status (activate/deactivate)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async updateStatus(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;
      const userId = req.user?.id || req.user?._id;
      const loyaltyRedemptionRuleServices = new LoyaltyRedemptionRuleServices(
        businessId,
      );
      const { id } = req.params;
      const { status } = req.body;

      if (typeof status !== 'boolean') {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Status must be a boolean value',
        );
      }

      const updated = await loyaltyRedemptionRuleServices.updateStatus(
        id,
        status,
        userId,
      );
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Loyalty redemption rule status updated successfully',
        updated,
      );
    } catch (error) {
      console.error('Loyalty redemption rule status update error:', error);
      const statusCode =
        error.message.includes('not found') ||
          error.message.includes('Unauthorized')
          ? StatusCodes.NOT_FOUND
          : StatusCodes.BAD_REQUEST;
      return ResponseService.send(
        res,
        statusCode,
        error.message || 'Failed to update loyalty redemption rule status',
      );
    }
  }

  /**
   * Toggle loyalty redemption rule status
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async toggleStatus(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;
      const userId = req.user?.id || req.user?._id;
      const loyaltyRedemptionRuleServices = new LoyaltyRedemptionRuleServices(
        businessId,
      );
      const { id } = req.params;

      // Get current rule to toggle status
      const rule = await loyaltyRedemptionRuleServices.getById(id);
      const newStatus = !rule.status;

      const updated = await loyaltyRedemptionRuleServices.updateStatus(
        id,
        newStatus,
        userId,
      );
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Loyalty redemption rule status toggled successfully',
        updated,
      );
    } catch (error) {
      console.error('Loyalty redemption rule status toggle error:', error);
      const statusCode =
        error.message.includes('not found') ||
          error.message.includes('Unauthorized')
          ? StatusCodes.NOT_FOUND
          : StatusCodes.BAD_REQUEST;
      return ResponseService.send(
        res,
        statusCode,
        error.message || 'Failed to toggle loyalty redemption rule status',
      );
    }
  }

  /**
   * Get active loyalty redemption rules
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async getActive(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;
      const loyaltyRedemptionRuleServices = new LoyaltyRedemptionRuleServices(
        businessId,
      );

      const activeRules = await loyaltyRedemptionRuleServices.getActiveRules(
        req.query,
      );
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Active loyalty redemption rules retrieved successfully',
        activeRules,
      );
    } catch (error) {
      console.error('Active loyalty redemption rules retrieval error:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message ||
        'Failed to retrieve active loyalty redemption rules',
      );
    }
  }

  /**
   * Find rule by point value
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async findByPoints(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;
      const loyaltyRedemptionRuleServices = new LoyaltyRedemptionRuleServices(
        businessId,
      );
      const { points } = req.params;

      const pointsNum = Number(points);
      if (Number.isNaN(pointsNum) || !Number.isInteger(pointsNum) || pointsNum < 1) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Points must be a positive integer (minimum 1)',
        );
      }

      const rule = await loyaltyRedemptionRuleServices.findRuleByPoints(
        pointsNum,
        req.query,
      );

      if (!rule) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          `No redemption rule found for ${pointsNum} points`,
        );
      }

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Redemption rule found successfully',
        rule,
      );
    } catch (error) {
      console.error('Find rule by points error:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to find redemption rule by points',
      );
    }
  }
}

export default LoyaltyRedemptionRuleController;
