import { StatusCodes } from 'http-status-codes';
import { ResponseService } from '../utils/index.js';
import {
  TenantCouponServices,
  TenantCurrencySettingService,
} from '../services/index.js';

/**
 * Tenant Coupon Controller
 *
 * Enterprise-grade controller for managing tenant-specific coupon operations.
 * Handles HTTP requests with proper error handling, validation, and response formatting.
 *
 * @class TenantCouponController
 */
class TenantCouponController {
  /**
   * Create a new tenant coupon
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async create(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;

      if (!businessId) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Business ID is required',
        );
      }

      const tenantCouponService = new TenantCouponServices(businessId);
      const created = await tenantCouponService.create(req.body);

      return ResponseService.send(
        res,
        StatusCodes.CREATED,
        'Tenant coupon created successfully',
        created,
      );
    } catch (error) {
      console.log(error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to create tenant coupon',
      );
    }
  }

  /**
   * List tenant coupons with filtering and pagination
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async list(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;

      if (!businessId) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Business ID is required',
        );
      }

      const tenantCouponService = new TenantCouponServices(businessId);
      const currencyService = new TenantCurrencySettingService(businessId);

      const [result, primaryCurrency] = await Promise.all([
        tenantCouponService.list(req.query),
        currencyService.getPrimaryCurrency(),
      ]);

      // Format currency info
      const currency = primaryCurrency
        ? {
          symbol: primaryCurrency.currencySymbol,
          code: primaryCurrency.currencyCode,
          position: primaryCurrency.currencyPosition,
        }
        : null;

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Tenant coupons fetched successfully',
        {
          ...result,
          currency,
        },
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch tenant coupons',
      );
    }
  }

  /**
   * Get all active tenant coupons (status true, within date range, under usage limit)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async getActive(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;

      if (!businessId) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Business ID is required',
        );
      }

      const tenantCouponService = new TenantCouponServices(businessId);
      const coupons = await tenantCouponService.getActiveCoupons({
        type: req.query?.type,
      });

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Active tenant coupons fetched successfully',
        coupons,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch active tenant coupons',
      );
    }
  }

  /**
   * Get tenant coupon by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async get(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;

      if (!businessId) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Business ID is required',
        );
      }

      const tenantCouponService = new TenantCouponServices(businessId);
      const item = await tenantCouponService.getById(req.params.id);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Tenant coupon fetched successfully',
        item,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.NOT_FOUND,
        error.message || 'Tenant coupon not found',
      );
    }
  }

  /**
   * Update tenant coupon by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async update(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;

      if (!businessId) {
        console.log('Business ID is required');
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Business ID is required',
        );
      }

      // Check if request body is empty
      if (!req.body || Object.keys(req.body).length === 0) {
        console.log('Request body is empty');
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Request body is empty. Please provide data to update.',
        );
      }

      const tenantCouponService = new TenantCouponServices(businessId);
      const updated = await tenantCouponService.updateById(
        req.params.id,
        req.body,
      );

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Tenant coupon updated successfully',
        updated,
      );
    } catch (error) {
      console.log(error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to update tenant coupon',
      );
    }
  }

  /**
   * Soft delete tenant coupon by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async remove(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;

      if (!businessId) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Business ID is required',
        );
      }

      const tenantCouponService = new TenantCouponServices(businessId);
      const removed = await tenantCouponService.softDeleteById(req.params.id);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Tenant coupon deleted successfully',
        removed,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to delete tenant coupon',
      );
    }
  }

  /**
   * Get tenant coupon by code
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async getByCode(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;
      const { code } = req.params;

      if (!businessId) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Business ID is required',
        );
      }

      if (!code) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Coupon code is required',
        );
      }

      const tenantCouponService = new TenantCouponServices(businessId);
      const coupon = await tenantCouponService.getByCode(code);

      if (!coupon) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Tenant coupon not found',
        );
      }

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Tenant coupon fetched successfully',
        coupon,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch tenant coupon',
      );
    }
  }

  /**
   * Validate tenant coupon by code
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async validateCoupon(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;
      const { code } = req.body;
      console.log("code", code);
      console.log("customerId", req.body.customerId);

      if (!businessId) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Business ID is required',
        );
      }


      if (!code) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Coupon code is required',
        );
      }

      const customerId = req.body.customerId;
      if (!customerId) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Customer ID is required',
        );
      }
      const tenantCouponService = new TenantCouponServices(businessId);
      const coupon = await tenantCouponService.validateCoupon(code, customerId);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Coupon is valid',
        coupon,
      );
    } catch (error) {
      console.log(error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to validate coupon',
      );
    }
  }

  /**
   * Calculate discount for an order amount
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async calculateDiscount(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;
      const { couponId } = req.params;
      const { orderAmount } = req.body;

      if (!businessId) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Business ID is required',
        );
      }

      if (!couponId) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Coupon ID is required',
        );
      }

      if (orderAmount === undefined || orderAmount === null) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Order amount is required',
        );
      }

      const orderAmountNum = Number(orderAmount);
      if (Number.isNaN(orderAmountNum) || orderAmountNum < 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Order amount must be a non-negative number',
        );
      }

      const tenantCouponService = new TenantCouponServices(businessId);
      const discount = await tenantCouponService.calculateDiscount(
        couponId,
        orderAmountNum,
      );

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Discount calculated successfully',
        { discount, orderAmount: orderAmountNum },
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to calculate discount',
      );
    }
  }

  /**
   * Toggle tenant coupon status (enable/disable)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async toggleStatus(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;

      if (!businessId) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Business ID is required',
        );
      }

      const tenantCouponService = new TenantCouponServices(businessId);
      const coupon = await tenantCouponService.getById(req.params.id);

      if (!coupon) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Tenant coupon not found',
        );
      }

      const updated = await tenantCouponService.updateById(req.params.id, {
        status: !coupon.status,
      });

      return ResponseService.send(
        res,
        StatusCodes.OK,
        `Tenant coupon ${updated.status ? 'enabled' : 'disabled'} successfully`,
        updated,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to toggle tenant coupon status',
      );
    }
  }

  /**
   * Get tenant coupon statistics
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async getCouponStats(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;

      if (!businessId) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Business ID is required',
        );
      }

      const tenantCouponService = new TenantCouponServices(businessId);
      const [totalCoupons, activeCoupons, expiredCoupons, totalUsage] =
        await Promise.all([
          tenantCouponService.count({ isDeleted: false }),
          tenantCouponService.count({
            isDeleted: false,
            status: true,
            end_date: { $gte: new Date() },
          }),
          tenantCouponService.count({
            isDeleted: false,
            end_date: { $lt: new Date() },
          }),
          tenantCouponService.count({ isDeleted: false, status: true }),
        ]);

      const stats = {
        totalCoupons,
        activeCoupons,
        expiredCoupons,
        totalUsage,
        utilizationRate:
          totalCoupons > 0 ? ((totalUsage / totalCoupons) * 100).toFixed(2) : 0,
      };

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Tenant coupon statistics fetched successfully',
        stats,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch tenant coupon statistics',
      );
    }
  }

  /**
   * Get cache statistics for performance monitoring
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async getCacheStats(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;

      if (!businessId) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Business ID is required',
        );
      }

      const tenantCouponService = new TenantCouponServices(businessId);
      const cacheStats = tenantCouponService.getCacheStats();

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Cache statistics fetched successfully',
        cacheStats,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch cache statistics',
      );
    }
  }

  /**
   * Cleanup expired tenant coupons (auto-deactivate)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async cleanupExpiredCoupons(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;

      if (!businessId) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Business ID is required',
        );
      }

      const tenantCouponService = new TenantCouponServices(businessId);
      const result = await tenantCouponService.cleanupExpiredCoupons();

      return ResponseService.send(res, StatusCodes.OK, result.message, result);
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to cleanup expired tenant coupons',
      );
    }
  }

  /**
   * Get tenant coupon analytics
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async getCouponAnalytics(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;
      const { startDate, endDate } = req.query;

      if (!businessId) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Business ID is required',
        );
      }

      const tenantCouponService = new TenantCouponServices(businessId);
      const analytics = await tenantCouponService.getCouponAnalytics({
        startDate,
        endDate,
      });

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Tenant coupon analytics fetched successfully',
        analytics,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch tenant coupon analytics',
      );
    }
  }

  /**
   * Bulk update tenant coupon status
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async bulkUpdateStatus(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;
      const { ids, status } = req.body || {};

      if (!businessId) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Business ID is required',
        );
      }

      if (!Array.isArray(ids) || ids.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'ids must be a non-empty array',
        );
      }
      if (typeof status !== 'boolean') {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'status must be a boolean',
        );
      }

      const tenantCouponService = new TenantCouponServices(businessId);
      const result = await tenantCouponService.bulkUpdateStatus(ids, status);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Tenant coupons status updated successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error?.message || 'Error updating tenant coupons status',
      );
    }
  }

  /**
   * Bulk delete tenant coupons
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async bulkDelete(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;
      const { ids } = req.body || {};

      if (!businessId) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Business ID is required',
        );
      }

      if (!Array.isArray(ids) || ids.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'ids must be a non-empty array',
        );
      }

      const tenantCouponService = new TenantCouponServices(businessId);
      const result = await tenantCouponService.bulkDelete(ids);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Tenant coupons deleted successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error?.message || 'Error deleting tenant coupons',
      );
    }
  }

  /**
   * Bulk get tenant coupons by IDs
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
          'Coupon IDs array is required and must not be empty',
        );
      }

      const MAX_IDS = 100;
      if (ids.length > MAX_IDS) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          `Maximum ${MAX_IDS} Coupon IDs allowed per request`,
        );
      }

      const businessId = req.user?.businessId || req.businessId;

      if (!businessId) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Business ID is required',
        );
      }

      const tenantCouponService = new TenantCouponServices(businessId);
      const currencyService = new TenantCurrencySettingService(businessId);

      const [result, primaryCurrency] = await Promise.all([
        tenantCouponService.bulkGetCoupons(ids, {
          lean,
          throwOnNotFound,
        }),
        currencyService.getPrimaryCurrency(),
      ]);

      const message =
        result.found === result.totalRequested
          ? 'All Coupons fetched successfully'
          : result.found > 0
            ? `${result.found} of ${result.totalRequested} Coupons fetched successfully`
            : 'No Coupons found';

      // Format currency info
      const currency = primaryCurrency
        ? {
          symbol: primaryCurrency.currencySymbol,
          code: primaryCurrency.currencyCode,
          position: primaryCurrency.currencyPosition,
        }
        : null;

      return ResponseService.send(
        res,
        result.found > 0 ? StatusCodes.OK : StatusCodes.NOT_FOUND,
        message,
        {
          ...result,
          currency,
        },
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Error fetching Coupons',
      );
    }
  }
}

export default TenantCouponController;
