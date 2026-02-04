import { StatusCodes } from 'http-status-codes';
import { DashboardService } from '../services/index.js';
import { ResponseService } from '../utils/index.js';
import { subMonths, startOfMonth, format } from 'date-fns';

const dashboardService = new DashboardService();
class DashboardController {
  /**
   * Validate and normalize date range parameters
   * @param {String|undefined} startDate - Start date string from query parameter
   * @param {String|undefined} endDate - End date string from query parameter
   * @returns {Object} { isValid: boolean, startDate: string, endDate: string, error?: string }
   */
  _validateAndNormalizeDateRange(startDate, endDate) {
    const now = new Date();
    now.setHours(23, 59, 59, 999); // End of today

    // If no dates provided, default to last month to today
    if (!startDate && !endDate) {
      const lastMonth = startOfMonth(subMonths(new Date(), 1));
      return {
        isValid: true,
        startDate: format(lastMonth, 'yyyy-MM-dd'),
        endDate: format(now, 'yyyy-MM-dd'),
      };
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

    // Validate startDate
    if (startDate && !dateRegex.test(startDate)) {
      return {
        isValid: false,
        startDate: null,
        endDate: null,
        error:
          'Invalid start date format. Please use YYYY-MM-DD format (e.g., 2025-05-10)',
      };
    }

    // Validate endDate
    if (endDate && !dateRegex.test(endDate)) {
      return {
        isValid: false,
        startDate: null,
        endDate: null,
        error:
          'Invalid end date format. Please use YYYY-MM-DD format (e.g., 2025-05-10)',
      };
    }

    // Parse and validate startDate
    const parsedStartDate = startDate ? new Date(startDate) : startOfMonth(subMonths(new Date(), 1));
    if (isNaN(parsedStartDate.getTime())) {
      return {
        isValid: false,
        startDate: null,
        endDate: null,
        error: 'Invalid start date. Please provide a valid date in YYYY-MM-DD format',
      };
    }

    // Parse and validate endDate
    const parsedEndDate = endDate ? new Date(endDate) : now;
    if (isNaN(parsedEndDate.getTime())) {
      return {
        isValid: false,
        startDate: null,
        endDate: null,
        error: 'Invalid end date. Please provide a valid date in YYYY-MM-DD format',
      };
    }

    // Validate that startDate is not in the future
    if (parsedStartDate > now) {
      return {
        isValid: false,
        startDate: null,
        endDate: null,
        error: 'Start date cannot be in the future',
      };
    }

    // Validate that endDate is not in the future
    if (parsedEndDate > now) {
      return {
        isValid: false,
        startDate: null,
        endDate: null,
        error: 'End date cannot be in the future',
      };
    }

    // Validate that startDate is before or equal to endDate
    if (parsedStartDate > parsedEndDate) {
      return {
        isValid: false,
        startDate: null,
        endDate: null,
        error: 'Start date must be before or equal to end date',
      };
    }

    return {
      isValid: true,
      startDate: format(parsedStartDate, 'yyyy-MM-dd'),
      endDate: format(parsedEndDate, 'yyyy-MM-dd'),
    };
  }


  /**
   * Get complete dashboard data based on user role
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Object} Dashboard data
   */
  getDashboardData = async (req, res) => {
    try {
      // Get user role from the request (added by passport middleware)
      const userRole = req.user.roleId.name;

      // Validate and normalize date range if provided
      const { startDate, endDate } = req.query;
      const validation = this._validateAndNormalizeDateRange(startDate, endDate);

      if (!validation.isValid) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          validation.error,
        );
      }

      // Get dashboard data based on role with optional date filtering
      const dashboardData = await dashboardService.getDashboardData(
        userRole,
        validation.startDate,
        validation.endDate,
      );
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Dashboard data retrieved successfully',
        dashboardData,
      );
    } catch (error) {
      console.error('Error retrieving dashboard data:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Failed to retrieve dashboard data',
        500,
      );
    }
  };


  /**
   * Get user statistics
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Object} User statistics
   */
  async getUserStats(req, res) {
    try {
      const userStats = await dashboardService.getUserCounts();
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'User statistics retrieved successfully',
        userStats,
      );
    } catch (error) {
      console.error('Error retrieving user statistics:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Failed to retrieve user statistics',
        500,
      );
    }
  }

  /**
   * Get plan statistics
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Object} Plan statistics
   */
  async getPlanStats(req, res) {
    try {
      const planStats = await dashboardService.getPlanCounts();
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Plan statistics retrieved successfully',
        planStats,
      );
    } catch (error) {
      console.error('Error retrieving plan statistics:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Failed to retrieve plan statistics',
        500,
      );
    }
  }

  /**
   * Get subscription statistics
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Object} Subscription statistics
   */
  async getSubscriptionStats(req, res) {
    try {
      const subscriptionStats = await dashboardService.getSubscriptionCounts();
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Subscription statistics retrieved successfully',
        subscriptionStats,
      );
    } catch (error) {
      console.error('Error retrieving subscription statistics:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Failed to retrieve subscription statistics',
        500,
      );
    }
  }

  /**
   * Get monthly revenue data
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Object} Monthly revenue data
   */
  async getMonthlyRevenue(req, res) {
    try {
      const monthlyRevenue = await dashboardService.getMonthlyRevenue();
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Monthly revenue data retrieved successfully',
        monthlyRevenue,
      );
    } catch (error) {
      console.error('Error retrieving monthly revenue data:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Failed to retrieve monthly revenue data',
        500,
      );
    }
  }

  /**
   * Get plan-wise subscription data
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Array} Plan-wise subscription data
   */
  async getPlanWiseSubscriptions(req, res) {
    try {
      const planWiseSubscriptions =
        await dashboardService.getPlanWiseSubscriptions();
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Plan-wise subscription data retrieved successfully',
        planWiseSubscriptions,
      );
    } catch (error) {
      console.error('Error retrieving plan-wise subscription data:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Failed to retrieve plan-wise subscription data',
        500,
      );
    }
  }

  /**
   * Get plan-wise subscription data filtered by date
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Array} Plan-wise subscription data from startDate to today
   */
  getPlanWiseSubscriptionsByDate = async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const validation = this._validateAndNormalizeDateRange(startDate, endDate);

      if (!validation.isValid) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          validation.error,
        );
      }

      const planWiseSubscriptions =
        await dashboardService.getPlanWiseSubscriptionsByDate(
          validation.startDate,
          validation.endDate,
        );
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Plan-wise subscription data retrieved successfully',
        planWiseSubscriptions,
      );
    } catch (error) {
      console.error(
        'Error retrieving plan-wise subscription data by date:',
        error,
      );
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Failed to retrieve plan-wise subscription data',
        500,
      );
    }
  };

  /**
   * Get revenue overview data filtered by date
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Object} Revenue overview data from startDate to today
   */
  getRevenueOverviewByDate = async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const validation = this._validateAndNormalizeDateRange(startDate, endDate);

      if (!validation.isValid) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          validation.error,
        );
      }

      const revenueOverview = await dashboardService.getRevenueOverviewByDate(
        validation.startDate,
        validation.endDate,
      );
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Revenue overview data retrieved successfully',
        revenueOverview,
      );
    } catch (error) {
      console.error('Error retrieving revenue overview data:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Failed to retrieve revenue overview data',
        500,
      );
    }
  };

  /**
   * Get subscription trends data
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Array} Subscription trends data
   */
  async getSubscriptionTrends(req, res) {
    try {
      const subscriptionTrends = await dashboardService.getSubscriptionTrends();
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Subscription trends data retrieved successfully',
        subscriptionTrends,
      );
    } catch (error) {
      console.error('Error retrieving subscription trends data:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Failed to retrieve subscription trends data',
        500,
      );
    }
  }

  /**
   * Get recent activity data
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Array} Recent activity data
   */
  async getRecentActivity(req, res) {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit) : 10;
      const recentActivity = await dashboardService.getRecentActivity(limit);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Recent activity data retrieved successfully',
        recentActivity,
      );
    } catch (error) {
      console.error('Error retrieving recent activity data:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Failed to retrieve recent activity data',
        500,
      );
    }
  }

  /**
   * Get monthly subscription data
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Object} Monthly subscription data
   */
  async getMonthlySubscriptionData(req, res) {
    try {
      const monthlySubscriptionData =
        await dashboardService.getMonthlySubscriptionData();
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Monthly subscription data retrieved successfully',
        monthlySubscriptionData,
      );
    } catch (error) {
      console.error('Error retrieving monthly subscription data:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Failed to retrieve monthly subscription data',
        500,
      );
    }
  }

  /**
   * Get total overall revenue (all-time revenue)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Number} Total overall revenue
   */
  async getOverallRevenueData(req, res) {
    try {
      const totalRevenue = await dashboardService.getOverallRevenueAgg();
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Total overall revenue retrieved successfully',
        { totalRevenue },
      );
    } catch (error) {
      console.error('Error retrieving overall revenue data:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Failed to retrieve overall revenue data',
        500,
      );
    }
  }

  /**
   * Get weekly data
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Object} Weekly data
   */
  async getWeeklyData(req, res) {
    try {
      const weeklyData = await dashboardService.getWeeklyData();
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Weekly data retrieved successfully',
        weeklyData,
      );
    } catch (error) {
      console.error('Error retrieving weekly data:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Failed to retrieve weekly data',
        500,
      );
    }
  }
}

export default new DashboardController();
