import { User, Plan, Subscription, Payment } from '../models/index.js';
import {
  startOfMonth,
  endOfMonth,
  subMonths,
  startOfWeek,
  endOfWeek,
  format,
} from 'date-fns';

class DashboardService {
  /**
   * Get counts of users by status with percentage change
   * @returns {Promise<Object>} User counts with percentage change
   */
  async getUserCounts() {
    const now = new Date();
    const currentMonthStart = startOfMonth(now);
    const previousMonthStart = startOfMonth(subMonths(now, 1));
    const previousMonthEnd = endOfMonth(subMonths(now, 1));

    const [
      totalUsers,
      activeUsers,
      inactiveUsers,
      totalUsersCurrentMonth,
      totalUsersPreviousMonth,
    ] = await Promise.all([
      User.countDocuments({ roleId: { $ne: 1 } }),
      User.countDocuments({ isActive: true, roleId: { $ne: 1 } }),
      User.countDocuments({ isActive: false, roleId: { $ne: 1 } }),
      // Users created in current month
      User.countDocuments({
        roleId: { $ne: 1 },
        createdAt: { $gte: currentMonthStart, $lte: now },
      }),
      // Users created in previous month
      User.countDocuments({
        roleId: { $ne: 1 },
        createdAt: { $gte: previousMonthStart, $lte: previousMonthEnd },
      }),
    ]);

    // Calculate percentage change for total users (current month vs previous month)
    let totalUsersPercentageChange = 0;
    if (totalUsersPreviousMonth > 0) {
      totalUsersPercentageChange =
        ((totalUsersCurrentMonth - totalUsersPreviousMonth) /
          totalUsersPreviousMonth) *
        100;
    } else if (totalUsersCurrentMonth > 0) {
      totalUsersPercentageChange = 100;
    }

    return {
      totalUsers: {
        value: totalUsers,
        percentageChange: Number.parseFloat(
          totalUsersPercentageChange.toFixed(2),
        ),
      },
      activeUsers,
      inactiveUsers,
    };
  }

  /**
   * Get counts of plans by status
   * @returns {Promise<Object>} Plan counts
   */
  async getPlanCounts() {
    const [totalPlans, activePlans, inactivePlans] = await Promise.all([
      Plan.countDocuments(),
      Plan.countDocuments({ status: true }),
      Plan.countDocuments({ status: false }),
    ]);

    return { totalPlans, activePlans, inactivePlans };
  }

  /**
   * Get counts of subscriptions by status with percentage change
   * @returns {Promise<Object>} Subscription counts with percentage change
   */
  async getSubscriptionCounts() {
    const now = new Date();
    const currentMonthStart = startOfMonth(now);
    const previousMonthStart = startOfMonth(subMonths(now, 1));
    const previousMonthEnd = endOfMonth(subMonths(now, 1));
    const nextMonth = new Date();
    nextMonth.setMonth(now.getMonth() + 1);
    const previousMonthNextMonth = new Date(
      previousMonthStart.getFullYear(),
      previousMonthStart.getMonth() + 1,
      0,
    );

    const [
      totalSubscriptions,
      activeSubscriptions,
      inactiveSubscriptions,
      expiringSoon,
      // Total subscriptions created in current month
      totalSubscriptionsCurrentMonth,
      // Total subscriptions created in previous month
      totalSubscriptionsPreviousMonth,
      // Active subscriptions created in current month
      activeSubscriptionsCurrentMonth,
      // Active subscriptions created in previous month
      activeSubscriptionsPreviousMonth,
      // Expiring soon in current month
      expiringSoonCurrentMonth,
      // Expiring soon in previous month
      expiringSoonPreviousMonth,
    ] = await Promise.all([
      Subscription.countDocuments(),
      Subscription.countDocuments({ status: true }),
      Subscription.countDocuments({ status: false }),
      Subscription.countDocuments({
        status: true,
        createdAt: {
          $lte: nextMonth,
          $gte: now,
        },
      }),
      Subscription.countDocuments({
        createdAt: { $gte: currentMonthStart, $lte: now },
      }),
      Subscription.countDocuments({
        createdAt: { $gte: previousMonthStart, $lte: previousMonthEnd },
      }),
      Subscription.countDocuments({
        status: true,
        createdAt: { $gte: currentMonthStart, $lte: now },
      }),
      Subscription.countDocuments({
        status: true,
        createdAt: { $gte: previousMonthStart, $lte: previousMonthEnd },
      }),
      Subscription.countDocuments({
        status: true,
        createdAt: {
          $lte: nextMonth,
          $gte: currentMonthStart,
        },
      }),
      Subscription.countDocuments({
        status: true,
        createdAt: {
          $lte: previousMonthNextMonth,
          $gte: previousMonthStart,
        },
      }),
    ]);

    // Calculate percentage changes (current month vs previous month)
    let totalSubscriptionsPercentageChange = 0;
    if (totalSubscriptionsPreviousMonth > 0) {
      totalSubscriptionsPercentageChange =
        ((totalSubscriptionsCurrentMonth - totalSubscriptionsPreviousMonth) /
          totalSubscriptionsPreviousMonth) *
        100;
    } else if (totalSubscriptionsCurrentMonth > 0) {
      totalSubscriptionsPercentageChange = 100;
    }

    let activeSubscriptionsPercentageChange = 0;
    if (activeSubscriptionsPreviousMonth > 0) {
      activeSubscriptionsPercentageChange =
        ((activeSubscriptionsCurrentMonth - activeSubscriptionsPreviousMonth) /
          activeSubscriptionsPreviousMonth) *
        100;
    } else if (activeSubscriptionsCurrentMonth > 0) {
      activeSubscriptionsPercentageChange = 100;
    }

    let expiringSoonPercentageChange = 0;
    if (expiringSoonPreviousMonth > 0) {
      expiringSoonPercentageChange =
        ((expiringSoonCurrentMonth - expiringSoonPreviousMonth) /
          expiringSoonPreviousMonth) *
        100;
    } else if (expiringSoonCurrentMonth > 0) {
      expiringSoonPercentageChange = 100;
    }

    return {
      totalSubscriptions: {
        value: totalSubscriptions,
        percentageChange: Number.parseFloat(
          totalSubscriptionsPercentageChange.toFixed(2),
        ),
      },
      activeSubscriptions: {
        value: activeSubscriptions,
        percentageChange: Number.parseFloat(
          activeSubscriptionsPercentageChange.toFixed(2),
        ),
      },
      inactiveSubscriptions,
      expiringSoon: {
        value: expiringSoon,
        percentageChange: Number.parseFloat(
          expiringSoonPercentageChange.toFixed(2),
        ),
      },
    };
  }

  /**
   * Get monthly revenue data
   * @returns {Promise<Object>} Monthly revenue data
   */
  async getMonthlyRevenue() {
    const now = new Date();
    const currentMonth = startOfMonth(now);
    const previousMonth = startOfMonth(subMonths(now, 1));

    const [currentMonthRevenue, previousMonthRevenue] = await Promise.all([
      Payment.aggregate([
        {
          $match: {
            createdAt: { $gte: currentMonth, $lte: now },
            status: 'captured',
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: { $divide: ['$amount', 100] } },
          },
        },
      ]),
      Payment.aggregate([
        {
          $match: {
            createdAt: { $gte: previousMonth, $lt: currentMonth },
            status: 'captured',
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: { $divide: ['$amount', 100] } },
          },
        },
      ]),
    ]);

    const current =
      currentMonthRevenue.length > 0 ? currentMonthRevenue[0].total : 0;
    const previous =
      previousMonthRevenue.length > 0 ? previousMonthRevenue[0].total : 0;

    let percentageChange = 0;
    if (previous > 0) {
      percentageChange = ((current - previous) / previous) * 100;
    } else if (current > 0) {
      percentageChange = 100;
    }

    return {
      currentMonth: current,
      previousMonth: previous,
      currentMonthlyRevenue: {
        value: current,
        percentageChange: Number.parseFloat(percentageChange.toFixed(2)),
      },
    };
  }

  /**
   * Get plan-wise subscription data
   * @returns {Promise<Array>} Plan-wise subscription data
   */
  async getPlanWiseSubscriptions() {
    return Subscription.aggregate([
      {
        $lookup: {
          from: 'plans',
          localField: 'planName',
          foreignField: '_id',
          as: 'planDetails',
        },
      },
      {
        $unwind: '$planDetails',
      },
      {
        $group: {
          _id: '$planDetails._id',
          planName: { $first: '$planDetails.name' },
          count: { $sum: 1 },
          activeCount: {
            $sum: {
              $cond: [{ $eq: ['$status', true] }, 1, 0],
            },
          },
          inactiveCount: {
            $sum: {
              $cond: [{ $eq: ['$status', false] }, 1, 0],
            },
          },
          revenue: { $sum: { $divide: ['$totalAmount', 100] } },
        },
      },
      {
        $project: {
          _id: 0,
          planId: '$_id',
          planName: 1,
          totalSubscriptions: '$count',
          activeSubscriptions: '$activeCount',
          inactiveSubscriptions: '$inactiveCount',
          revenue: 1,
        },
      },
      {
        $sort: { totalSubscriptions: -1 },
      },
    ]);
  }

  /**
   * Get plan-wise subscription data filtered by date range
   * @param {Date|String} startDate - Start date for filtering
   * @param {Date|String} endDate - End date for filtering
   * @returns {Promise<Array>} Plan-wise subscription data from startDate to endDate
   */
  async getPlanWiseSubscriptionsByDate(startDate, endDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0); // Start of the selected date

    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999); // End of the selected date

    return Subscription.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
        },
      },
      {
        $lookup: {
          from: 'plans',
          localField: 'planName',
          foreignField: '_id',
          as: 'planDetails',
        },
      },
      {
        $unwind: '$planDetails',
      },
      {
        $group: {
          _id: '$planDetails._id',
          planName: { $first: '$planDetails.name' },
          count: { $sum: 1 },
          activeCount: {
            $sum: {
              $cond: [{ $eq: ['$status', true] }, 1, 0],
            },
          },
          inactiveCount: {
            $sum: {
              $cond: [{ $eq: ['$status', false] }, 1, 0],
            },
          },
          revenue: { $sum: { $divide: ['$totalAmount', 100] } },
        },
      },
      {
        $project: {
          _id: 0,
          planId: '$_id',
          planName: 1,
          totalSubscriptions: '$count',
          activeSubscriptions: '$activeCount',
          inactiveSubscriptions: '$inactiveCount',
          revenue: 1,
        },
      },
      {
        $sort: { totalSubscriptions: -1 },
      },
    ]);
  }

  /**
   * Get revenue overview data filtered by date range
   * @param {Date|String} startDate - Start date for filtering
   * @param {Date|String} endDate - End date for filtering
   * @returns {Promise<Object>} Revenue overview data from startDate to endDate
   */
  async getRevenueOverviewByDate(startDate, endDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0); // Start of the selected date

    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999); // End of the selected date

    const [totalRevenue, revenueData] = await Promise.all([
      // Total revenue from startDate to endDate
      Payment.aggregate([
        {
          $match: {
            createdAt: { $gte: start, $lte: end },
            status: 'captured',
          },
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: { $divide: ['$amount', 100] } },
          },
        },
        {
          $project: {
            _id: 0,
            totalRevenue: 1,
          },
        },
      ]),
      // Revenue grouped by month from startDate to endDate
      Payment.aggregate([
        {
          $match: {
            createdAt: { $gte: start, $lte: end },
            status: 'captured',
          },
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
            },
            revenue: { $sum: { $divide: ['$amount', 100] } },
          },
        },
        {
          $sort: { '_id.year': 1, '_id.month': 1 },
        },
        {
          $project: {
            _id: 0,
            year: '$_id.year',
            month: '$_id.month',
            revenue: 1,
          },
        },
      ]),
    ]);

    // Generate all months between startDate and endDate
    const allMonths = [];
    const current = new Date(start);

    while (current <= end) {
      allMonths.push({
        year: current.getFullYear(),
        month: current.getMonth() + 1, // MongoDB months are 1-indexed
      });

      // Move to next month
      current.setMonth(current.getMonth() + 1);
    }

    // Create a map of existing revenue data for quick lookup
    const revenueMap = new Map();
    revenueData.forEach((item) => {
      const key = `${item.year}-${item.month}`;
      revenueMap.set(key, item.revenue);
    });

    // Build complete revenue array with all months, filling in 0 for missing months
    const revenueByMonth = allMonths.map(({ year, month }) => {
      const key = `${year}-${month}`;
      return {
        year,
        month,
        revenue: revenueMap.get(key) || 0,
      };
    });

    return {
      totalRevenue: totalRevenue.length > 0 ? totalRevenue[0].totalRevenue : 0,
      revenueByMonth,
      startDate: start,
      endDate: end,
    };
  }

  /**
   * Get subscription trends data for the last 6 months
   * @returns {Promise<Array>} Subscription trends data
   */
  async getSubscriptionTrends() {
    const now = new Date();
    const months = [];

    // Generate last 6 months
    for (let i = 5; i >= 0; i--) {
      const month = subMonths(now, i);
      const startDate = startOfMonth(month);
      const endDate = endOfMonth(month);

      months.push({
        month: format(month, 'MMM'),
        startDate,
        endDate,
      });
    }

    const results = await Promise.all(
      months.map(async ({ month, startDate, endDate }) => {
        const [newSubscriptions, renewals] = await Promise.all([
          Subscription.countDocuments({
            createdAt: { $gte: startDate, $lte: endDate },
            purchaseDate: { $gte: startDate, $lte: endDate },
          }),
          Subscription.countDocuments({
            createdAt: { $lt: startDate },
            purchaseDate: { $gte: startDate, $lte: endDate },
          }),
        ]);

        return {
          month,
          newSubscriptions,
          renewals,
        };
      }),
    );

    return results;
  }

  /**
   * Get recent activity data
   * @param {Number} limit - Number of activities to return
   * @returns {Promise<Array>} Recent activity data
   */
  async getRecentActivity(limit = 10) {
    // Get recent subscriptions with user and plan details
    const recentSubscriptions = await Subscription.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('user', 'name email')
      .populate('planName', 'name price duration')
      .lean();

    return recentSubscriptions.map((sub) => ({
      type: 'subscription',
      user: sub.user?.name || 'Unknown User',
      email: sub.user?.email || 'No email',
      plan: sub.planName?.name || 'Unknown Plan',
      amount: sub.totalAmount, // Amount is already in main currency unit
      date: sub.createdAt,
      status: sub.status ? 'Active' : 'Inactive',
    }));
  }

  /**
   * Get renewals and new subscriptions for the current month
   * @returns {Promise<Object>} Renewals and new subscriptions data
   */
  async getMonthlySubscriptionData() {
    const now = new Date();
    const startOfCurrentMonth = startOfMonth(now);
    const endOfCurrentMonth = endOfMonth(now);

    const [renewalsThisMonth, newSubscriptionsThisMonth] = await Promise.all([
      Subscription.countDocuments({
        createdAt: { $lt: startOfCurrentMonth },
        purchaseDate: { $gte: startOfCurrentMonth, $lte: endOfCurrentMonth },
      }),
      Subscription.countDocuments({
        createdAt: { $gte: startOfCurrentMonth, $lte: endOfCurrentMonth },
        purchaseDate: { $gte: startOfCurrentMonth, $lte: endOfCurrentMonth },
      }),
    ]);

    return { renewalsThisMonth, newSubscriptionsThisMonth };
  }

  /**
   * Get total overall revenue (all-time revenue)
   * @returns {Promise<Number>} Total overall revenue
   */
  async getOverallRevenueAgg() {
    const result = await Payment.aggregate([
      {
        $match: {
          status: 'captured',
        },
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: { $divide: ['$amount', 100] } },
        },
      },
      {
        $project: {
          _id: 0,
          totalRevenue: 1,
        },
      },
    ]);

    return result.length > 0 ? result[0].totalRevenue : 0;
  }

  /**
   * Get new users and subscriptions for the current week
   * @returns {Promise<Object>} Weekly data
   */
  async getWeeklyData() {
    const now = new Date();
    const startOfCurrentWeek = startOfWeek(now, { weekStartsOn: 1 }); // Monday
    const endOfCurrentWeek = endOfWeek(now, { weekStartsOn: 1 });

    const [newUsersThisWeek, newSubscriptionsThisWeek] = await Promise.all([
      User.countDocuments({
        createdAt: { $gte: startOfCurrentWeek, $lte: endOfCurrentWeek },
        roleId: { $ne: 1 }, // Exclude superadmin
      }),
      Subscription.countDocuments({
        createdAt: { $gte: startOfCurrentWeek, $lte: endOfCurrentWeek },
      }),
    ]);

    return { newUsersThisWeek, newSubscriptionsThisWeek };
  }

  /**
 * Get all dashboard data in a single call
 * @param {String} role - User role (superadmin or admin)
 * @param {String} startDate - Optional start date for filtering (YYYY-MM-DD format)
 * @param {String} endDate - Optional end date for filtering (YYYY-MM-DD format)
 * @returns {Promise<Object>} Complete dashboard data
 */
  async getDashboardData(role = 'superadmin', startDate = null, endDate = null) {
    // Different data for different roles
    if (role === 'superadmin') {
      const [
        userCounts,
        planCounts,
        subscriptionCounts,
        revenueOverview,
        planWiseSubscriptions,
        subscriptionTrends,
        recentActivity,
        monthlySubscriptionData,
        totalRevenue,
        weeklyData,
      ] = await Promise.all([
        this.getUserCounts(),
        this.getPlanCounts(),
        this.getSubscriptionCounts(),
        // Use date-aware method if startDate is provided
        startDate && endDate
          ? this.getRevenueOverviewByDate(startDate, endDate)
          : this.getMonthlyRevenue(),
        // Use date-aware method if startDate is provided
        startDate && endDate
          ? this.getPlanWiseSubscriptionsByDate(startDate, endDate)
          : this.getPlanWiseSubscriptions(),
        this.getSubscriptionTrends(),
        this.getRecentActivity(),
        this.getMonthlySubscriptionData(),
        this.getOverallRevenueAgg(),
        this.getWeeklyData(),
      ]);

      return {
        totalUsers: userCounts.totalUsers,
        activeUsers: userCounts.activeUsers,
        inactiveUsers: userCounts.inactiveUsers,
        ...planCounts,
        totalSubscriptions: subscriptionCounts.totalSubscriptions,
        activeSubscriptions: subscriptionCounts.activeSubscriptions,
        inactiveSubscriptions: subscriptionCounts.inactiveSubscriptions,
        expiringSoon: subscriptionCounts.expiringSoon,
        // Return revenue data with proper structure
        ...(startDate && endDate
          ? {
            revenueOverview: {
              totalRevenue: revenueOverview.totalRevenue,
              revenueByMonth: revenueOverview.revenueByMonth,
              startDate: revenueOverview.startDate,
              endDate: revenueOverview.endDate,
            },
          }
          : { monthlyRevenue: revenueOverview }),
        planWiseSubscriptions,
        subscriptionTrends,
        recentActivity,
        ...monthlySubscriptionData,
        totalRevenue,
        ...weeklyData,
      };
    } else if (role === 'admin') {
      // For admin, we'll provide a limited set of data
      // This can be customized based on what admin should see
      const [subscriptionData, storeData, recentActivity] = await Promise.all([
        this.getAdminSubscriptionData(),
        this.getAdminStoreData(),
        this.getRecentActivity(10),
      ]);

      return {
        subscriptionData,
        storeData,
        recentActivity,
      };
    }

    // Default case or unsupported role
    throw new Error('Unsupported role for dashboard data');
  }

  /**
   * Get admin-specific subscription data
   * @returns {Promise<Object>} Admin subscription data
   */
  async getAdminSubscriptionData() {
    // This would be implemented based on what data admins should see
    // For now, returning a placeholder
    return {
      activeSubscriptions: 0,
      // Add more admin-specific subscription metrics
    };
  }

  /**
   * Get admin-specific store data
   * @returns {Promise<Object>} Admin store data
   */
  async getAdminStoreData() {
    // This would be implemented based on what store data admins should see
    // For now, returning a placeholder
    return {
      // Admin-specific store metrics
      storeCount: 0,
    };
  }
}

export default DashboardService;
