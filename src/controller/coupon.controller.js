import { StatusCodes } from 'http-status-codes';
import { ResponseService } from '../utils/index.js';
import { CouponServices, CurrencyService, CouponFlowService } from '../services/index.js';

const couponServices = new CouponServices();
const couponFlowService = new CouponFlowService();
const currencyService = new CurrencyService();

class CouponController {
  static async create(req, res) {
    try {
      // Coupons are system-wide, no business association needed
      const created = await couponServices.create(req.body);

      return ResponseService.send(
        res,
        StatusCodes.CREATED,
        'Coupon created successfully',
        created,
      );
    } catch (error) {
      console.log(error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to create coupon',
      );
    }
  }

  static async list(req, res) {
    try {
      // Coupons are system-wide, no business filtering needed
      const [result, primaryCurrency] = await Promise.all([
        couponServices.list(req.query),
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
        'Coupons fetched successfully',
        {
          ...result,
          currency,
        },
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch coupons',
      );
    }
  }

  static async get(req, res) {
    try {
      const item = await couponServices.getById(req.params.id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Coupon fetched successfully',
        item,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.NOT_FOUND,
        error.message || 'Coupon not found',
      );
    }
  }

  static async update(req, res) {
    try {
      // Check if request body is empty
      if (!req.body || Object.keys(req.body).length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Request body is empty. Please provide data to update.',
        );
      }

      const updated = await couponServices.updateById(req.params.id, req.body);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Coupon updated successfully',
        updated,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to update coupon',
      );
    }
  }

  static async remove(req, res) {
    try {
      // Use soft delete instead of hard delete
      const removed = await couponServices.softDeleteById(req.params.id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Coupon deleted successfully',
        removed,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to delete coupon',
      );
    }
  }

  /**
   * Cancel applied coupon
   */
  static async cancelCoupon(req, res) {
    try {
      const { usageId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return ResponseService.send(
          res,
          StatusCodes.UNAUTHORIZED,
          'User authentication required',
        );
      }

      const result = await couponServices.cancelCoupon(usageId, userId);

      return ResponseService.send(res, StatusCodes.OK, result.message, result);
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to cancel coupon',
      );
    }
  }

  /**
   * Get user's coupon usage history
   */
  static async getUserCouponHistory(req, res) {
    try {
      const userId = req.user?.id;
      const { page, limit } = req.query;

      if (!userId) {
        return ResponseService.send(
          res,
          StatusCodes.UNAUTHORIZED,
          'User authentication required',
        );
      }

      const result = await couponServices.getUserCouponHistory(userId, {
        page,
        limit,
      });

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Coupon usage history fetched successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch coupon usage history',
      );
    }
  }

  /**
   * Get coupon analytics for system
   */
  static async getCouponAnalytics(req, res) {
    try {
      const { startDate, endDate } = req.query;

      const analytics = await couponServices.getCouponAnalytics({
        startDate,
        endDate,
      });

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Coupon analytics fetched successfully',
        analytics,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch coupon analytics',
      );
    }
  }

  /**
   * Cleanup expired coupons (auto-deactivate)
   */
  static async cleanupExpiredCoupons(req, res) {
    try {
      const result = await couponServices.cleanupExpiredCoupons();

      return ResponseService.send(res, StatusCodes.OK, result.message, result);
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to cleanup expired coupons',
      );
    }
  }

  /**
   * Toggle coupon status (enable/disable)
   */
  static async toggleStatus(req, res) {
    try {
      const coupon = await couponServices.getById(req.params.id);
      if (!coupon) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Coupon not found',
        );
      }

      // Check if coupon has expired - use end of day comparison
      const now = new Date();
      const endOfCouponDay = new Date(coupon.end_date);
      endOfCouponDay.setHours(23, 59, 59, 999);

      if (now > endOfCouponDay) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Cannot modify an expired coupon. The end date has already passed.',
        );
      }

      const updated = await couponServices.updateById(req.params.id, {
        status: !coupon.status,
      });

      return ResponseService.send(
        res,
        StatusCodes.OK,
        `Coupon ${updated.status ? 'enabled' : 'disabled'} successfully`,
        updated,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to toggle coupon status',
      );
    }
  }

  /**
   * Get coupon statistics
   */
  static async getCouponStats(req, res) {
    try {
      const [totalCoupons, activeCoupons, expiredCoupons, totalUsage] =
        await Promise.all([
          couponServices.count({ isDeleted: false }),
          couponServices.count({
            isDeleted: false,
            status: true,
            end_date: { $gte: new Date() },
          }),
          couponServices.count({
            isDeleted: false,
            end_date: { $lt: new Date() },
          }),
          couponServices.count({ isDeleted: false, status: true }),
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
        'Coupon statistics fetched successfully',
        stats,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch coupon statistics',
      );
    }
  }

  /**
   * Get cache statistics for performance monitoring
   */
  static async getCacheStats(req, res) {
    try {
      const cacheStats = couponServices.getCacheStats();

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
   * Get coupons by plan
   */
  static async getCouponsByPlan(req, res) {
    try {
      const { planId } = req.params;
      const { includeGlobal = 'true', onlyActive = 'true' } = req.query;

      if (!planId) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Plan ID is required',
        );
      }

      const coupons = await couponServices.getCouponsByPlan(planId, {
        includeGlobal: includeGlobal === 'true',
        onlyActive: onlyActive === 'true',
      });

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Coupons fetched successfully',
        coupons,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch coupons by plan',
      );
    }
  }

  // ===== COUPON FLOW METHODS =====

  /**
   * Apply coupon to a subscription
   */
  static async applyCoupon(req, res) {
    try {
      const { subscriptionId } = req.params;
      const { couponCode, userType = 'existing', metadata = {} } = req.body;
      const userId = req.user.id;

      if (!couponCode) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Coupon code is required',
        );
      }

      const result = await couponFlowService.applyCoupon(
        couponCode,
        userId,
        subscriptionId,
        { userType, metadata },
      );

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Coupon applied successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to apply coupon',
      );
    }
  }

  /**
   * Get effective total for a subscription (with coupon discount)
   */
  static async getEffectiveTotal(req, res) {
    try {
      const { subscriptionId } = req.params;

      const result = await couponFlowService.getEffectiveTotal(subscriptionId);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Effective total calculated successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to calculate effective total',
      );
    }
  }

  /**
   * Remove applied coupon from subscription
   */
  static async removeCoupon(req, res) {
    try {
      const { subscriptionId } = req.params;
      const userId = req.user.id;

      const result = await couponFlowService.removeCoupon(
        subscriptionId,
        userId,
      );

      return ResponseService.send(res, StatusCodes.OK, result.message, result);
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to remove coupon',
      );
    }
  }

  /**
   * Get coupon usage history for a subscription
   */
  static async getSubscriptionCouponHistory(req, res) {
    try {
      const { subscriptionId } = req.params;

      const result =
        await couponFlowService.getSubscriptionCouponHistory(subscriptionId);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Coupon history fetched successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch coupon history',
      );
    }
  }

  /**
   * Reconcile payment with coupon usage
   */
  static async reconcilePaymentWithCoupon(req, res) {
    try {
      const { paymentId } = req.params;

      const result =
        await couponFlowService.reconcilePaymentWithCoupon(paymentId);

      return ResponseService.send(res, StatusCodes.OK, result.message, result);
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to reconcile payment with coupon',
      );
    }
  }

  static async bulkUpdateStatus(req, res) {
    try {
      const { ids, status } = req.body || {};

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

      const result = await couponServices.bulkUpdateStatus(ids, status);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Coupons status updated successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error?.message || 'Error updating coupons status',
      );
    }
  }

  static async bulkDelete(req, res) {
    try {
      const { ids } = req.body || {};

      if (!Array.isArray(ids) || ids.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'ids must be a non-empty array',
        );
      }

      const result = await couponServices.bulkDelete(ids);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Coupons deleted successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error?.message || 'Error deleting coupons',
      );
    }
  }

  /**
   * Bulk get coupons by IDs
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
          `Maximum ${MAX_IDS} coupon IDs allowed per request`,
        );
      }

      const [result, primaryCurrency] = await Promise.all([
        couponServices.bulkGetCoupons(ids, {
          lean,
          throwOnNotFound,
        }),
        currencyService.getPrimaryCurrency(),
      ]);

      const message =
        result.found === result.totalRequested
          ? 'All coupons fetched successfully'
          : result.found > 0
            ? `${result.found} of ${result.totalRequested} coupons fetched successfully`
            : 'No coupons found';

      // Format currency info
      const currency = primaryCurrency
        ? {
          symbol: primaryCurrency.currencySymbol,
          code: primaryCurrency.currencyCode,
          position: primaryCurrency.currencyPosition,
        }
        : null;

      ResponseService.send(
        res,
        result.found > 0 ? StatusCodes.OK : StatusCodes.NOT_FOUND,
        message,
        {
          ...result,
          currency,
        },
      );
    } catch (error) {
      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Error fetching coupons',
      );
    }
  }
}

export default CouponController;
