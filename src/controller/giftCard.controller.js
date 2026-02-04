import { StatusCodes } from 'http-status-codes';
import { ResponseService } from '../utils/index.js';
import { GiftCardService } from '../services/index.js';

/**
 * GiftCard Controller
 *
 * Enterprise-grade controller for managing gift card operations with tenant-specific database support.
 * Handles HTTP requests and delegates business logic to GiftCardService.
 *
 * @class GiftCardController
 */
class GiftCardController {
  /**
   * Create a new gift card
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async create(req, res) {
    try {
      const businessId = req.businessId;
      const service = new GiftCardService(businessId);

      const giftCard = await service.createGiftCard(req.body);
      return ResponseService.send(
        res,
        StatusCodes.CREATED,
        'Gift card created successfully',
        giftCard,
      );
    } catch (error) {
      console.error('Gift card creation error:', error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to create gift card',
      );
    }
  }

  /**
   * Get gift card by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async getById(req, res) {
    try {
      const businessId = req.businessId;
      const service = new GiftCardService(businessId);

      const populate = req.query.populate
        ? req.query.populate.split(',')
        : ['assignedCustomerIds'];

      const giftCard = await service.getGiftCardById(req.params.id, {
        populate,
      });

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Gift card retrieved successfully',
        giftCard,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.NOT_FOUND,
        error.message || 'Gift card not found',
      );
    }
  }

  /**
   * Update gift card by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async update(req, res) {
    try {
      const businessId = req.businessId;
      const service = new GiftCardService(businessId);

      const updated = await service.updateGiftCard(req.params.id, req.body);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Gift card updated successfully',
        updated,
      );
    } catch (error) {
      console.error('Gift card update error:', error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to update gift card',
      );
    }
  }

  /**
   * Delete gift card by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async delete(req, res) {
    try {
      const businessId = req.businessId;
      const service = new GiftCardService(businessId);

      await service.deleteGiftCard(req.params.id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Gift card deleted successfully',
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to delete gift card',
      );
    }
  }

  /**
   * List gift cards with filters, pagination, and search
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async list(req, res) {
    try {
      const businessId = req.businessId;
      const service = new GiftCardService(businessId);

      const queryParams = {
        all: req.query.all,
        isActive: req.query.isActive,
        page: req.query.page || 1,
        limit: req.query.limit || 10,
        search: req.query.search || '',
        status: req.query.status,
        customerScope: req.query.customerScope,
        sortBy: req.query.sortBy || 'createdAt',
        sortOrder: req.query.sortOrder || 'desc',
      };

      const result = await service.list(queryParams);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Gift cards retrieved successfully',
        result,
      );
    } catch (error) {
      console.error('Gift card list error:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to retrieve gift cards',
      );
    }
  }

  /**
   * Activate gift card
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async activate(req, res) {
    try {
      const businessId = req.businessId;
      const service = new GiftCardService(businessId);

      const giftCard = await service.activateGiftCard(req.params.id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Gift card activated successfully',
        giftCard,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to activate gift card',
      );
    }
  }

  /**
   * Deactivate gift card
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async deactivate(req, res) {
    try {
      const businessId = req.businessId;
      const service = new GiftCardService(businessId);

      const giftCard = await service.deactivateGiftCard(req.params.id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Gift card deactivated successfully',
        giftCard,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to deactivate gift card',
      );
    }
  }

  /**
   * Assign customers to gift card
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async assignCustomers(req, res) {
    try {
      const businessId = req.businessId;
      const service = new GiftCardService(businessId);

      const { customerIds } = req.body;

      if (
        !customerIds ||
        !Array.isArray(customerIds) ||
        customerIds.length === 0
      ) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'At least one customer ID is required',
        );
      }

      const giftCard = await service.assignCustomers(
        req.params.id,
        customerIds,
      );
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Customers assigned successfully',
        giftCard,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to assign customers',
      );
    }
  }

  /**
   * Remove customer from gift card
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async removeCustomer(req, res) {
    try {
      const businessId = req.businessId;
      const service = new GiftCardService(businessId);

      const { customerId } = req.body;

      if (!customerId) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Customer ID is required',
        );
      }

      const giftCard = await service.removeCustomer(req.params.id, customerId);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Customer removed successfully',
        giftCard,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to remove customer',
      );
    }
  }

  /**
   * Bulk update gift card statuses
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async bulkUpdateStatus(req, res) {
    try {
      const { ids, status } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'IDs array is required and must not be empty',
        );
      }

      const allowedStatuses = ['Active', 'Inactive'];
      if (!status || !allowedStatuses.includes(status)) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Status must be either "Active" or "Inactive"',
        );
      }

      const businessId = req.businessId;
      const service = new GiftCardService(businessId);

      const result = await service.bulkUpdateStatus(ids, status);
      const message =
        result.matchedCount === 0
          ? 'No gift cards matched the provided IDs'
          : result.notFound.length > 0
            ? `Updated ${result.modifiedCount} gift card(s). Some IDs were not found`
            : 'Gift card statuses updated successfully';

      return ResponseService.send(res, StatusCodes.OK, message, result);
    } catch (error) {
      console.error('Gift card bulk status update error:', error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to bulk update gift card status',
      );
    }
  }

  /**
   * Bulk delete gift cards
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async bulkDelete(req, res) {
    try {
      const { ids } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'IDs array is required and must not be empty',
        );
      }

      const businessId = req.businessId;
      const service = new GiftCardService(businessId);

      const result = await service.bulkDelete(ids);
      const message =
        result.deletedCount === 0
          ? 'No gift cards were deleted'
          : result.notFound.length > 0
            ? `Deleted ${result.deletedCount} gift card(s). Some IDs were not found`
            : 'Gift cards deleted successfully';

      return ResponseService.send(res, StatusCodes.OK, message, result);
    } catch (error) {
      console.error('Gift card bulk delete error:', error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to bulk delete gift cards',
      );
    }
  }

  /**
   * Bulk get gift cards by IDs
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
          'Gift card IDs array is required and must not be empty',
        );
      }

      const MAX_IDS = 100;
      if (ids.length > MAX_IDS) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          `Maximum ${MAX_IDS} gift card IDs allowed per request`,
        );
      }

      const businessId = req.businessId;
      const service = new GiftCardService(businessId);

      const result = await service.bulkGetGiftCards(ids, {
        lean,
        throwOnNotFound,
      });

      const message =
        result.found === result.totalRequested
          ? 'All gift cards fetched successfully'
          : result.found > 0
            ? `${result.found} of ${result.totalRequested} gift cards fetched successfully`
            : 'No gift cards found';

      return ResponseService.send(
        res,
        result.found > 0 ? StatusCodes.OK : StatusCodes.NOT_FOUND,
        message,
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Error fetching gift cards',
      );
    }
  }

  /**
   * Get active gift cards
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async getActive(req, res) {
    try {
      const businessId = req.businessId;
      const service = new GiftCardService(businessId);

      let filters = {};
      if (req.query.filters) {
        try {
          const parsed = JSON.parse(req.query.filters);
          if (
            typeof parsed !== 'object' ||
            parsed === null ||
            Array.isArray(parsed)
          ) {
            return ResponseService.send(
              res,
              StatusCodes.BAD_REQUEST,
              'Invalid filters format: filters must be a valid JSON object',
            );
          }
          filters = parsed;
        } catch (parseError) {
          console.error('Failed to parse filters JSON:', parseError);
          return ResponseService.send(
            res,
            StatusCodes.BAD_REQUEST,
            'Invalid filters format: filters must be a valid JSON object',
          );
        }
      }

      const options = {
        page: req.query.page || 1,
        limit: req.query.limit || 10,
        search: req.query.search || '',
        filters,
      };

      const result = await service.getActiveGiftCards(options);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Active gift cards retrieved successfully',
        result,
      );
    } catch (error) {
      console.error('Get active gift cards error:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to retrieve active gift cards',
      );
    }
  }

  /**
   * Get expired gift cards
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async getExpired(req, res) {
    try {
      const businessId = req.businessId;
      const service = new GiftCardService(businessId);

      const options = {
        populate: req.query.populate
          ? req.query.populate.split(',')
          : ['assignedCustomerIds'],
      };

      const giftCards = await service.getExpiredGiftCards(options);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Expired gift cards retrieved successfully',
        giftCards,
      );
    } catch (error) {
      console.error('Get expired gift cards error:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to retrieve expired gift cards',
      );
    }
  }

  /**
   * Get gift cards expiring soon
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async getExpiringSoon(req, res) {
    try {
      const businessId = req.businessId;
      const service = new GiftCardService(businessId);

      const days = parseInt(req.query.days) || 30;
      const options = {
        populate: req.query.populate
          ? req.query.populate.split(',')
          : ['assignedCustomerIds'],
      };

      const giftCards = await service.getExpiringSoon(days, options);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Expiring gift cards retrieved successfully',
        giftCards,
      );
    } catch (error) {
      console.error('Get expiring gift cards error:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to retrieve expiring gift cards',
      );
    }
  }

  /**
   * Get gift cards by customer
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async getByCustomer(req, res) {
    try {
      const businessId = req.businessId;
      const service = new GiftCardService(businessId);

      const options = {
        populate: req.query.populate ? req.query.populate.split(',') : [],
      };

      const giftCards = await service.getGiftCardsByCustomer(
        req.params.customerId,
        options,
      );
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Gift cards retrieved successfully',
        giftCards,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to retrieve gift cards',
      );
    }
  }

  /**
   * Validate gift card usage
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async validate(req, res) {
    try {
      const businessId = req.businessId;
      const service = new GiftCardService(businessId);

      const { number, customerId, purchaseAmount } = req.body;

      if (!number) {
        console.log('Gift card number is required');
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Gift card number is required',
        );
      }

      const result = await service.validateAndCheckUsage({
        number,
        customerId,
        purchaseAmount,
      });

      if (result.valid) {
        return ResponseService.send(
          res,
          StatusCodes.OK,
          'Gift card is valid and can be used',
          result,
        );
      } else {
        console.log('Gift card validation failed', result);
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Gift card validation failed',
          result,
        );
      }
    } catch (error) {
      console.error('Gift card validation error:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to validate gift card',
      );
    }
  }

  /**
   * Get gift cards by value range
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async getByValueRange(req, res) {
    try {
      const businessId = req.businessId;
      const service = new GiftCardService(businessId);

      const minValue = parseFloat(req.query.minValue);
      const maxValue = parseFloat(req.query.maxValue);

      if (isNaN(minValue) || isNaN(maxValue)) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Both minValue and maxValue are required and must be valid numbers',
        );
      }

      const options = {
        populate: req.query.populate ? req.query.populate.split(',') : [],
      };

      const giftCards = await service.getByValueRange(
        minValue,
        maxValue,
        options,
      );
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Gift cards retrieved successfully',
        giftCards,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to retrieve gift cards',
      );
    }
  }
}

export default GiftCardController;
