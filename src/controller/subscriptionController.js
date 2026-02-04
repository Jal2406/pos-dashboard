// controllers/subscription.controller.js
import { SubscriptionService } from '../services/index.js';
import ResponseService from '../utils/response.services.js';
import { StatusCodes } from 'http-status-codes';

const subscriptionService = new SubscriptionService();

class SubscriptionController {
  static async createPendingSubscription(req, res, next) {
    try {
      // Prevent superadmin from creating subscriptions
      const userRole = req.user.roleId?.name || req.user.role;
      if (userRole === 'superadmin') {
        return ResponseService.send(
          res,
          StatusCodes.FORBIDDEN,
          'Superadmin users cannot create subscriptions',
        );
      }

      const userId = req.user._id; // from auth middleware
      const { planId } = req.body;
      const correlationId = req.headers['x-correlation-id'] || null;
      const alreadyExists = await subscriptionService.findSubscriptionById(
        userId,
        planId,
      );
      if (alreadyExists && alreadyExists !== null) {
        return ResponseService.send(res, 400, 'Plan is already active!');
      }

      const subscription = await subscriptionService.createPendingSubscription(
        userId,
        planId,
        correlationId,
      );

      ResponseService.send(
        res,
        201,
        'Pending subscription created successfully',
        subscription,
      );
    } catch (err) {
      // Handle validation errors and business logic errors
      if (
        err.message?.includes('already have an active subscription') ||
        err.message?.includes('Invalid') ||
        err.message?.includes('not found') ||
        err.message?.includes('not active') ||
        err.message?.includes('Missing correlationId')
      ) {
        return ResponseService.send(res, StatusCodes.BAD_REQUEST, err.message);
      }
      next(err);
    }
  }

  static async getAllActiveSubscription(req, res, next) {
    try {
      const queryParams = req.query; // capture ?page=1&limit=10&search=... etc.
      const subscriptions =
        await subscriptionService.getAllActiveSubscriptions(queryParams);

      ResponseService.send(
        res,
        StatusCodes.OK,
        'Active subscriptions retrieved successfully',
        subscriptions,
      );
    } catch (error) {
      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Failed to retrieve active subscriptions',
      );
      next(error);
    }
  }

  static async getActiveAndLatestPendingSubscriptions(req, res, next) {
    try {
      const queryParams = req.query;

      const subscriptions =
        await subscriptionService.getActiveAndLatestPendingSubscriptions(
          queryParams,
        );

      ResponseService.send(
        res,
        StatusCodes.OK,
        'Active and latest pending subscriptions retrieved successfully',
        subscriptions,
      );
    } catch (error) {
      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Failed to retrieve active and latest pending subscriptions',
      );
      next(error);
    }
  }

  static async createActiveSubscription(req, res, next) {
    try {
      const { userId, planName, duration, totalAmount, amount, purchaseDate } =
        req.body;
      const subscription = await subscriptionService.createActiveSubscription(
        userId,
        planName,
        totalAmount,
        duration,
        amount,
        purchaseDate,
      );
      ResponseService.send(
        res,
        StatusCodes.CREATED,
        'Active subscription created successfully',
        subscription,
      );
    } catch (err) {
      // Handle validation errors and business logic errors
      console.log(err);
      if (
        err.message?.includes('already have an active subscription') ||
        err.message?.includes('Invalid') ||
        err.message?.includes('not found') ||
        err.message?.includes('not active')
      ) {
        return ResponseService.send(res, StatusCodes.BAD_REQUEST, err.message);
      }
      next(err);
    }
  }

  static async createTrialSubscription(req, res, next) {
    try {
      // Prevent superadmin from creating subscriptions
      const userRole = req.user.roleId?.name || req.user.role;
      if (userRole === 'superadmin') {
        return ResponseService.send(
          res,
          StatusCodes.FORBIDDEN,
          'Superadmin users cannot create subscriptions',
        );
      }

      const userId = req.user._id; // from auth middleware

      // Validate required fields
      if (!userId) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'User ID is required',
        );
      }
      // Check eligibility first
      const eligibility =
        await subscriptionService.checkTrialEligibility(userId);
      if (!eligibility.eligible) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          eligibility.reason,
        );
      }

      const subscription =
        await subscriptionService.createTrialSubscription(userId);

      ResponseService.send(
        res,
        StatusCodes.CREATED,
        'Free 7-day trial subscription created successfully',
        subscription,
      );
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get subscription by ID
   * Only returns subscription if the requesting user is the owner
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  static async getById(req, res, next) {
    try {
      // Extract subscription ID from route parameters
      const { id: subscriptionId } = req.params;

      // Extract user ID from authenticated user (from auth middleware)
      const userId = req.user?._id || req.user?.id;

      // Validate user is authenticated
      if (!userId) {
        return ResponseService.send(
          res,
          StatusCodes.UNAUTHORIZED,
          'Authentication required',
        );
      }

      // Validate subscription ID is provided
      if (!subscriptionId) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Subscription ID is required',
        );
      }

      // Get subscription with ownership validation
      const subscription = await subscriptionService.getSubscriptionById(
        subscriptionId,
        userId,
      );

      // Return success response with subscription data
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Subscription retrieved successfully',
        subscription,
      );
    } catch (err) {
      // Handle specific error cases
      if (
        err.message?.includes('not found') ||
        err.message?.includes('Invalid') ||
        err.message?.includes('required')
      ) {
        // Return 404 for not found errors (including ownership violations)
        // Using generic message to prevent information leakage
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Subscription not found',
        );
      }

      // Log unexpected errors for debugging
      console.error('Error in getById subscription controller:', {
        error: err.message,
        stack: err.stack,
        subscriptionId: req.params?.id,
        userId: req.user?._id || req.user?.id,
      });

      // Pass to error handler middleware
      next(err);
    }
  }

  static async bulkGetSubscriptions(req, res) {
    try {
      const { ids, lean, throwOnNotFound } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Subscription IDs array is required and must not be empty',
        );
      }

      const MAX_IDS = 100;
      if (ids.length > MAX_IDS) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          `Maximum ${MAX_IDS} subscription IDs allowed per request`,
        );
      }

      const result = await subscriptionService.bulkGetSubscriptions(ids, {
        lean,
        throwOnNotFound,
      });

      const message =
        result.found === result.totalRequested
          ? 'All subscriptions fetched successfully'
          : result.found > 0
            ? `${result.found} of ${result.totalRequested} subscriptions fetched successfully`
            : 'No subscriptions found';

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
        error.message || 'Error fetching subscriptions',
      );
    }
  }
}

export default SubscriptionController;
