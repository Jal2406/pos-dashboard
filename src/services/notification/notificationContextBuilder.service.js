/**
 * Notification Context Builder Service
 * Builds comprehensive context objects for notification templates
 * Maps all fixed variable fields to template placeholders
 * Handles tenant-specific data (stores, products, etc.) from tenant databases
 */
import { GeneralSettings, Subscription, Business } from '../../models/index.js';
import { format } from 'date-fns';

class NotificationContextBuilder {
  /**
   * Build comprehensive context with all available variables
   * @param {Object} options - Context building options
   * @param {Object} options.user - User object (for user-related variables)
   * @param {Object} options.subscription - Subscription object (for subscription-related variables)
   * @param {Object} options.order - Order object (for order-related variables)
   * @param {Object} options.payment - Payment object (for payment-related variables)
   * @param {Object} options.product - Product object (for product-related variables)
   * @param {Object} options.store - Store object (for store-related variables)
   * @param {Object} options.plan - Plan object (for plan-related variables)
   * @param {String} options.businessId - Business ID for tenant-specific queries (optional, will be extracted if not provided)
   * @param {Object} options.additionalContext - Additional context to merge
   * @returns {Promise<Object>} Comprehensive context object
   */
  static async buildContext(options = {}) {
    const {
      user,
      subscription,
      order,
      payment,
      product,
      store,
      plan,
      businessId: providedBusinessId,
      additionalContext = {},
    } = options;

    // Extract or determine businessId for tenant-specific queries
    const businessId = await this._extractBusinessId({
      user,
      subscription,
      order,
      store,
      providedBusinessId,
      additionalContext,
    });

    // Get general settings (company/app info)
    const generalSettings = await this._getGeneralSettings();

    // Build base context with company/app information
    const context = {
      // Company/App Information
      companyName: generalSettings?.appName || '',
      companyEmail: generalSettings?.inquiryEmail || '',
      siteURL: generalSettings?.siteURL || process.env.SITE_URL || '',
      appName: generalSettings?.appName || '',
      supportEmail: generalSettings?.inquiryEmail || '',
      currentDate: format(new Date(), 'yyyy-MM-dd'),
    };

    // Add user-related variables
    if (user) {
      context.userName = user.name || '';
      context.userEmail = user.email || '';
      context.userPhone = user.phone || '';
      context.userID = user._id?.toString() || '';
      context.userRole = user.role || user.roleId || '';

      // Always provide adminName as an alias for userName for subscription-related templates
      // This ensures {admin_name} placeholders work regardless of role detection
      context.adminName = user.name || '';
      context.adminEmail = user.email || '';
      context.adminPhone = user.phone || '';
      context.adminID = user._id?.toString() || '';
    }

    // Determine user role (support both numeric roleId and string role)
    const userRole = user?.role || this._resolveRoleFromId(user?.roleId);

    // Add manager-related variables (if user is manager)
    if (user && userRole === 'manager') {
      context.managerName = user.name || '';
      context.managerEmail = user.email || '';
      context.managerPhone = user.phone || '';
      context.managerID = user._id?.toString() || '';
    }

    // Add super admin-related variables (if user is superadmin)
    if (user && userRole === 'superadmin') {
      context.superAdminName = user.name || '';
      context.superAdminEmail = user.email || '';
      context.superAdminPhone = user.phone || '';
      context.superAdminID = user._id?.toString() || '';
    }

    // Add subscription-related variables
    if (subscription) {
      context.planName =
        subscription.planSnapshot?.name ||
        subscription.planName?.name ||
        plan?.name ||
        '';
      context.planStartDate = subscription.purchaseDate
        ? format(new Date(subscription.purchaseDate), 'yyyy-MM-dd')
        : '';
      context.planExpiryDate = subscription.expiryDate
        ? format(new Date(subscription.expiryDate), 'yyyy-MM-dd')
        : '';

      // Additional subscription context
      if (additionalContext.daysRemaining !== undefined) {
        context.daysRemaining = additionalContext.daysRemaining;
      }
      if (additionalContext.expiryDate) {
        context.expiryDate = additionalContext.expiryDate;
      }
    }

    // Add plan-related variables (if plan is provided separately)
    if (plan) {
      context.planName = plan.name || context.planName || '';
    }

    // Add payment-related variables
    if (payment) {
      context.paymentStatus = payment.status || '';
      context.amountPaid = payment.amount || payment.totalAmount || '';
      context.paymentMethod = payment.method || payment.paymentMethod || '';
      context.paymentDate =
        payment.date || payment.createdAt
          ? format(new Date(payment.date || payment.createdAt), 'yyyy-MM-dd')
          : '';
      context.transactionID =
        payment.transactionId || payment._id?.toString() || '';
    }


    // Merge any additional context provided
    Object.assign(context, additionalContext);

    return context;
  }

  /**
   * Resolve role name from numeric roleId
   * @private
   */
  static _resolveRoleFromId(roleId) {
    if (!roleId) return null;

    const ROLE_ID_TO_NAME = {
      1: 'superadmin',
      2: 'admin',
      3: 'manager',
      4: 'cashier',
    };

    if (typeof roleId === 'number') {
      return ROLE_ID_TO_NAME[roleId] || null;
    }

    if (typeof roleId === 'object' && roleId._id) {
      return ROLE_ID_TO_NAME[roleId._id] || null;
    }

    return null;
  }

  /**
   * Get general settings (cached for performance)
   * @private
   */
  static async _getGeneralSettings() {
    try {
      // Cache could be added here for better performance
      const settings = await GeneralSettings.findOne({}).lean();
      return settings;
    } catch (error) {
      console.error('Error fetching general settings:', error);
      return null;
    }
  }

  /**
   * Extract businessId from various sources
   * @private
   */
  static async _extractBusinessId({
    user,
    subscription,
    order,
    store,
    providedBusinessId,
    additionalContext,
  }) {
    // If businessId is explicitly provided, use it
    if (providedBusinessId) {
      return providedBusinessId;
    }

    // Check additional context
    if (additionalContext.businessId) {
      return additionalContext.businessId;
    }

    // Try to extract from order (if it has businessId or storeId)
    if (order?.businessId) {
      return order.businessId;
    }
    if (order?.storeId) {
      // If we have storeId, we can try to get businessId from store
      // Note: This requires checking tenant databases, which is complex
      // For now, we'll rely on businessId being passed explicitly or from user
    }

    // Try to extract from store object
    if (store?.businessId) {
      return store.businessId;
    }

    // Try to extract from user (find business that owns the user)
    if (user?._id) {
      try {
        const businessIdFromUser = await this._getBusinessIdFromUser(user);
        if (businessIdFromUser) return businessIdFromUser;
      } catch (error) {
        console.warn('Could not get businessId from user:', error.message);
      }
    }

    // Try to extract from subscription (subscription belongs to a user who has a business)
    if (subscription?.user) {
      const userId =
        typeof subscription.user === 'object'
          ? subscription.user._id
          : subscription.user;
      if (userId) {
        try {
          const businessIdFromSubscription = await this._getBusinessIdFromUser({
            _id: userId,
          });
          if (businessIdFromSubscription) return businessIdFromSubscription;
        } catch (error) {
          console.warn(
            'Could not get businessId from subscription user:',
            error.message,
          );
        }
      }
    }

    return null;
  }

  /**
   * Get businessId from user
   * @private
   */
  static async _getBusinessIdFromUser(user) {
    if (!user?._id) return null;

    try {
      // For admin users, find business where they are the owner
      const business = await Business.findOne({ owner: user._id })
        .select('_id')
        .lean();

      if (business) {
        return business._id.toString();
      }
    } catch (error) {
      console.warn('Error getting businessId from user:', error.message);
    }

    return null;
  }

  /**
   * Get businessId from store ID (requires tenant database access)
   * Note: This is complex as stores are in tenant-specific databases
   * In practice, businessId should be passed explicitly or extracted from user
   * @private
   */
  static async _getBusinessIdFromStore(storeId) {
    // This is intentionally not implemented as it would require
    // checking all tenant databases, which is inefficient
    // businessId should be provided explicitly or extracted from user/subscription
    return null;
  }

  /**
   * Get store from tenant database
   * @private
   */
  static async _getStoreFromTenant(businessId, { order, additionalContext }) {
    if (!businessId) return null;

    // Try to get storeId from order or additional context
    const storeId = order?.storeId || additionalContext.storeId;
    if (!storeId) return null;

    try {
      

      const store = await StoreModel.findById(storeId)
        .select('name description')
        .lean();

      return store;
    } catch (error) {
      console.warn('Error fetching store from tenant database:', error.message);
      return null;
    }
  }

  /**
   * Build context for subscription-related notifications
   * @param {Object} subscription - Subscription object
   * @param {Object} user - User object
   * @param {Object} additionalContext - Additional context
   * @returns {Promise<Object>} Context object
   */
  static async buildSubscriptionContext(
    subscription,
    user,
    additionalContext = {},
  ) {
    // Populate subscription if needed
    let populatedSubscription = subscription;
    if (subscription && !subscription.planName && subscription.planName) {
      populatedSubscription = await Subscription.findById(subscription._id)
        .populate('planName', 'name price duration type')
        .lean();
    }

    return this.buildContext({
      user,
      subscription: populatedSubscription || subscription,
      additionalContext,
    });
  }

  /**
   * Build context for order-related notifications
   * @param {Object} order - Order object
   * @param {Object} user - User object
   * @param {Object} store - Store object (optional)
   * @param {Object} additionalContext - Additional context
   * @returns {Promise<Object>} Context object
   */
  static async buildOrderContext(
    order,
    user,
    store = null,
    additionalContext = {},
  ) {
    return this.buildContext({
      user,
      order,
      store,
      additionalContext: {
        ...additionalContext,
        orderNumber: order.orderNumber || order._id?.toString(),
        itemCount: order.items?.length || 0,
      },
    });
  }

  /**
   * Build context for payment-related notifications
   * @param {Object} payment - Payment object
   * @param {Object} user - User object
   * @param {Object} order - Order object (optional)
   * @param {Object} additionalContext - Additional context
   * @returns {Promise<Object>} Context object
   */
  static async buildPaymentContext(
    payment,
    user,
    order = null,
    additionalContext = {},
  ) {
    return this.buildContext({
      user,
      payment,
      order,
      additionalContext,
    });
  }

  /**
   * Build context for low stock alert notifications
   * @param {Object} product - Product object
   * @param {Object} user - User object
   * @param {Object} store - Store object (optional)
   * @param {Object} additionalContext - Additional context
   * @returns {Promise<Object>} Context object
   */
  static async buildLowStockContext(
    product,
    user,
    store = null,
    additionalContext = {},
  ) {
    return this.buildContext({
      user,
      product,
      store,
      additionalContext: {
        ...additionalContext,
        productName: product.name || '',
        currentStock:
          product.stock || product.currentStock || product.quantity || 0,
        minimumStock:
          product.minStock || product.minimumStock || product.reorderLevel || 0,
        minStock:
          product.minStock || product.minimumStock || product.reorderLevel || 0,
      },
    });
  }
}

export default NotificationContextBuilder;
