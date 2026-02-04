import mongoose from 'mongoose';
import {
  Subscription,
  Plan,
  TransactionLog,
  User,
  CouponUsage,
  NotificationTemplate,
  Business,
} from '../models/index.js';
import InvoiceService from './invoice.service.js';
import NotificationDispatcher from './notification/notificationDispatcher.service.js';
import NotificationContextBuilder from './notification/notificationContextBuilder.service.js';
import {
  BaseService,
  TransactionUtils,
  resolveRoleName,
} from '../utils/index.js';
import { calculateExpiryDate } from '../utils/calculateExpiryDate.js';
import {
  addMonths,
  addYears,
  addWeeks,
  addDays,
  differenceInMilliseconds,
  isAfter,
} from 'date-fns';

const REUSE_WINDOW_MIN = parseInt(
  process.env.SUB_PENDING_REUSE_WINDOW_MIN || '30',
  10,
);
const NOW = () => new Date();
const NEW_SUBSCRIPTION_NOTIFICATION_TYPE =
  process.env.NEW_SUBSCRIPTION_TEMPLATE || 'new_subscription';
const DEFAULT_ACTIVATION_NOTIFICATION_CHANNELS = ['in-app', 'email'];

const safeSet = (doc, path, value) => {
  if (doc.schema && doc.schema.path(path)) {
    doc.set(path, value);
  }
};

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? fallback : parsed;
};

const DEFAULT_EXPIRING_SOON_WINDOW_DAYS = parsePositiveInt(
  process.env.SUB_EXPIRING_SOON_DAYS,
  7,
);
const MAX_EXPIRING_SOON_WINDOW_DAYS = parsePositiveInt(
  process.env.SUB_EXPIRING_SOON_MAX_DAYS,
  90,
);

class SubscriptionService extends BaseService {
  constructor() {
    super(Subscription);
    this.invoiceService = new InvoiceService();
  }

  /**
   * Build planSnapshot from plan data for immutable storage in subscription
   * @param {Object} planData - Plan document (can be populated or lean)
   * @returns {Object} planSnapshot object
   */
  buildPlanSnapshot(planData) {
    if (!planData) {
      return null;
    }

    // Ensure all required fields are present
    if (
      !planData.name ||
      !planData.type ||
      planData.price === undefined ||
      !planData.duration ||
      planData.storeLimit === undefined ||
      planData.staffLimit === undefined
    ) {
      throw new Error('Plan data missing required fields for snapshot');
    }

    const snapshot = {
      name: String(planData.name),
      type: String(planData.type), // Ensure it's a string, not an object
      price: Number(planData.price) || 0,
      discount: Number(planData.discount) || 0,
      discountType: planData.discountType || 'fixed',
      duration: Number(planData.duration),
      storeLimit: Number(planData.storeLimit),
      staffLimit: Number(planData.staffLimit),
      description: planData.description || undefined,
      modules: Array.isArray(planData.modules) ? planData.modules : [],
      screens: Array.isArray(planData.screens) ? planData.screens : [],
      totalPrice: Number(planData.totalPrice) || 0,
      isTrial: Boolean(planData.isTrial) || false,
    };

    // Handle taxes - can be populated objects or just ObjectIds
    const resolvedTaxes = Array.isArray(planData.taxes)
      ? planData.taxes
      : planData.tax
        ? [planData.tax]
        : [];
    const populatedTaxes = resolvedTaxes
      .filter((tax) => typeof tax === 'object' && tax?._id)
      .map((tax) => ({
        _id: tax._id,
        name: tax.name,
        type: tax.type,
        value: tax.value,
        status: tax.status !== undefined ? tax.status : true,
      }));
    if (populatedTaxes.length > 0) {
      snapshot.taxes = populatedTaxes;
    }

    // Handle currencyId - can be populated object or just ObjectId
    // Only include currencyId if it exists (don't set to null)
    if (planData.currencyId) {
      if (typeof planData.currencyId === 'object' && planData.currencyId._id) {
        // Currency is populated
        snapshot.currencyId = {
          _id: planData.currencyId._id,
          currencySymbol: planData.currencyId.currencySymbol,
          currencyCode: planData.currencyId.currencyCode,
          currencyPosition: planData.currencyId.currencyPosition,
          thousandSeparator: planData.currencyId.thousandSeparator,
          decimalSeparator: planData.currencyId.decimalSeparator,
          numberOfDecimals: planData.currencyId.numberOfDecimals,
        };
      } else {
        // Currency is just ObjectId - store minimal info
        snapshot.currencyId = {
          _id: planData.currencyId,
        };
      }
    }
    // If currencyId is null/undefined, we don't include it in the snapshot (Mongoose will treat as undefined)

    return snapshot;
  }

  /**
   * Create a pending subscription for a given user & plan
   * @param {String} userId
   * @param {String} planId
   * @param {String} correlationId
   * @param {Object} plan - Optional pre-fetched plan object to avoid duplicate query
   * @returns Subscription document
   */
  async createPendingSubscription(userId, planId, correlationId, plan = null) {
    if (!mongoose.isValidObjectId(userId)) {
      throw new Error('Invalid userId');
    }
    if (!mongoose.isValidObjectId(planId)) {
      throw new Error('Invalid planId');
    }

    if (!correlationId) {
      throw new Error('Missing correlationId for idempotency');
    }

    try {
      const createPendingCore = async (session) => {
        const planData =
          plan ||
          (await Plan.findById(planId)
            .select(
              'price discount discountType duration type name status currencyId taxes storeLimit staffLimit description modules screens totalPrice isTrial',
            )
            .populate({
              path: 'taxes',
              select: 'name type value status',
            })
            .populate({
              path: 'currencyId',
              select:
                'currencySymbol currencyCode currencyPosition thousandSeparator decimalSeparator numberOfDecimals',
            })
            .session(session)
            .lean());

        if (!planData) {
          throw new Error('Plan not found');
        }
        if (planData.status !== true) {
          throw new Error('Plan is not active');
        }

        const reuseCutoff = new Date(Date.now() - REUSE_WINDOW_MIN * 60 * 1000);
        const [existingActive, reuse] = await Promise.all([
          Subscription.findOne({
            user: userId,
            planName: planId,
            status: true,
          })
            .session(session)
            .lean(),
          Subscription.findOne({
            user: userId,
            planName: planId,
            status: false,
            createdAt: { $gte: reuseCutoff },
          })
            .session(session)
            .sort({ createdAt: -1 })
            .lean(),
        ]);

        if (existingActive) {
          throw new Error(
            'You already have an active subscription for this plan. Please cancel your existing subscription before purchasing a new one.',
          );
        }

        if (reuse) {
          return { subscription: reuse, reused: true };
        }

        const price = Number(planData.price || 0);
        const rawDiscount = Number(planData.discount || 0);
        const discountType = planData.discountType || 'fixed';
        const planDiscount =
          discountType === 'percentage'
            ? Math.min(price, (price * rawDiscount) / 100)
            : rawDiscount;
        const baseAmount = Math.max(0, price - planDiscount);
        const totalAmount = Math.round(baseAmount * 100) / 100;
        if (totalAmount <= 0) {
          throw new Error('Invalid total amount');
        }

        // Build planSnapshot for immutable storage
        const planSnapshot = this.buildPlanSnapshot(planData);

        const [subscription] = await Subscription.create(
          [
            {
              purchaseDate: new Date(),
              planName: planId,
              currencyId: planData.currencyId?._id || planData.currencyId,
              duration: planData.duration,
              amount: planData.price,
              totalAmount,
              user: userId,
              status: false, // Explicitly set to false for pending subscription
              planSnapshot,
            },
          ],
          { session },
        );

        // Verify subscription was created with status: false
        if (subscription.status !== false) {
          console.error(
            `CRITICAL: Subscription ${subscription._id} was created with status: ${subscription.status} instead of false!`,
          );
          // Force set to false if somehow it's not false
          subscription.status = false;
          await subscription.save({ session });
        }

        try {
          await TransactionLog.create(
            [
              {
                entityId: subscription._id.toString(),
                entityType: 'subscription',
                action: 'pending_created',
                details: {
                  planId,
                  planName: planData.name,
                  userId,
                  price: planData.price,
                  discount: planDiscount,
                  discountType,
                  baseAmount,
                  totalAmount,
                },
                correlationId,
              },
            ],
            { session },
          );
        } catch (logError) {
          console.error(
            'Failed to log pending subscription creation:',
            logError,
          );
        }

        return { subscription, reused: false };
      };

      const { subscription, reused } =
        await TransactionUtils.executeTransaction(
          createPendingCore,
          TransactionUtils.getRetryConfig('subscription'),
        );

      if (reused) {
        await this._cleanupExpiredCouponUsage(subscription._id);
      }

      return subscription;
    } catch (err) {
      throw err;
    }
  }

  /**
   * Activate subscription after successful payment
   * @param {String} subscriptionId
   * @param {Date} expiryDate
   * @param {String} correlationId
   * @param {Object} payment - Payment data for invoice generation
   * @param {Object} session - Optional MongoDB session for existing transactions
   */
  async activateSubscription(
    subscriptionId,
    expiryDate,
    correlationId,
    payment = null,
    session = null,
    options = {},
  ) {
    const { skipPostActivationTasks = false } = options;
    if (!mongoose.isValidObjectId(subscriptionId)) {
      throw new Error('Invalid subscriptionId');
    }

    // Use lean() for better performance - fetch subscription with all needed data
    const subscription = await Subscription.findById(subscriptionId)
      .populate('planName')
      .populate('user')
      .populate({
        path: 'currencyId',
        select:
          'currencySymbol currencyCode currencyPosition thousandSeparator decimalSeparator numberOfDecimals',
      })
      .populate({
        path: 'payment',
        select:
          'provider status method providerOrderId providerPaymentId amount currencyId createdAt',
      })
      .lean();

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    if (subscription.status === true) {
      //Rearly this should happen(MOSTLY IF IT DOES LOGIC ERROR IN PAYMENT SERVICE)
      return subscription;
    }

    // Get user ID and plan ID for validation (extract early for use in multiple places)
    const userId =
      typeof subscription.user === 'object'
        ? subscription.user._id
        : subscription.user;
    const userIdForActivation = userId; // Store for use outside transaction
    const planId =
      typeof subscription.planName === 'object'
        ? subscription.planName._id
        : subscription.planName;

    // Parallel execution: check for planSnapshot and existing active subscription
    const [planData, existingSamePlanActive] = await Promise.all([
      // If planSnapshot is not set, fetch plan data to build snapshot
      !subscription.planSnapshot && subscription.planName
        ? Plan.findById(planId)
          .select(
            'price discount discountType duration type name status currencyId taxes storeLimit staffLimit description modules screens totalPrice isTrial',
          )
          .populate({
            path: 'taxes',
            select: 'name type value status',
          })
          .populate({
            path: 'currencyId',
            select:
              'currencySymbol currencyCode currencyPosition thousandSeparator decimalSeparator numberOfDecimals',
          })
          .lean()
        : Promise.resolve(null),
      // Check if user already has an active subscription for the same plan
      Subscription.findOne({
        user: userId,
        planName: planId,
        status: true,
        _id: { $ne: subscriptionId }, // Exclude the current subscription
      }).lean(),
    ]);

    // Build planSnapshot if plan data was fetched
    if (planData && !subscription.planSnapshot) {
      subscription.planSnapshot = this.buildPlanSnapshot(planData);
    }

    if (existingSamePlanActive) {
      throw new Error(
        'You already have an active subscription for this plan. Please cancel your existing subscription before purchasing a new one.',
      );
    }

    // Define the core activation logic
    const activateSubscriptionCore = async (session) => {
      // Deactivate all existing active subscriptions for this user (excluding current one)
      const existingActiveSubscriptions = await Subscription.find({
        user: userId,
        status: true,
        _id: { $ne: subscriptionId }, // Exclude the current subscription
      }).lean();

      if (existingActiveSubscriptions.length > 0) {
        // Deactivate all existing active subscriptions
        const deactivatedIds = existingActiveSubscriptions.map(
          (sub) => sub._id,
        );
        await Subscription.updateMany(
          {
            _id: { $in: deactivatedIds },
          },
          {
            $set: {
              status: false,
              cancelDate: new Date(),
              cancelReason: 'Deactivated due to new subscription purchase',
            },
          },
          { session },
        );

        // Log deactivation of previous subscriptions
        const deactivationLogs = deactivatedIds.map((subId) => ({
          entityId: subId.toString(),
          entityType: 'subscription',
          action: 'deactivated',
          details: {
            reason: 'New subscription purchased',
            newSubscriptionId: subscription._id.toString(),
            userId: userId?.toString(),
          },
          correlationId,
        }));

        await TransactionLog.insertMany(deactivationLogs, { session });

        console.log(
          `Deactivated ${deactivatedIds.length} existing active subscription(s) for user ${userId} before activating new subscription ${subscriptionId}`,
        );
      }

      // Update subscription status and expiry date using findByIdAndUpdate for lean objects
      const updateData = {
        status: true,
        purchaseDate: subscription.purchaseDate || NOW(),
      };
      if (expiryDate) {
        updateData.expiryDate = expiryDate;
      }
      // Include planSnapshot if it was built
      if (subscription.planSnapshot) {
        updateData.planSnapshot = subscription.planSnapshot;
      }

      const updatedSubscription = await Subscription.findByIdAndUpdate(
        subscriptionId,
        { $set: updateData },
        { new: true, session },
      );

      // Ensure user is marked active upon successful subscription activation (ATOMIC)
      let userActivationResult = null;
      if (userIdForActivation) {
        // Use findOneAndUpdate to get the result and ensure atomic operation
        // This must succeed for the transaction to commit - atomicity requirement
        userActivationResult = await User.findOneAndUpdate(
          {
            _id: userIdForActivation,
            isActive: { $ne: true },
          },
          {
            $set: {
              isActive: true,
              lastLoginAt: new Date(), // Update last login time as well
            },
          },
          {
            session,
            new: true, // Return the updated document
            runValidators: true, // Ensure validation runs
          },
        ).lean();

        // Verify user exists - if not found, this is a critical error
        if (!userActivationResult) {
          // Check if user exists at all
          const userExists = await User.findById(userIdForActivation)
            .select('_id isActive')
            .session(session)
            .lean();

          if (!userExists) {
            throw new Error(
              `User ${userIdForActivation} not found - cannot activate subscription`,
            );
          }
          // User exists but was already active - this is fine, log it
          console.log(
            `User ${userIdForActivation} was already active during subscription activation`,
          );
        } else {
          console.log(
            `User ${userIdForActivation} successfully activated during subscription activation`,
          );
        }
      }

      // Create transaction log only if not part of a parent transaction
      // If called from within a transaction (like from payment finalization),
      // the parent transaction will create the log to avoid duplicate logs
      // The session parameter indicates if we're in a transaction
      if (!session) {
        await TransactionLog.create([
          {
            entityId: subscriptionId.toString(),
            entityType: 'subscription',
            action: 'activated',
            details: {
              expiryDate,
              userActivated: !!userActivationResult,
              userId: userIdForActivation?.toString(),
            },
            correlationId,
          },
        ]);
      }

      return updatedSubscription;
    };

    // Execute with or without transaction wrapper
    const result = session
      ? await activateSubscriptionCore(session)
      : await TransactionUtils.executeTransaction(
        activateSubscriptionCore,
        TransactionUtils.getRetryConfig('subscription'),
      );

    if (skipPostActivationTasks) {
      // Fire-and-forget: run all post-activation tasks asynchronously
      // This allows the HTTP response to return immediately
      setImmediate(() => {
        // Verify and ensure user activation
        if (result && result._id) {
          this.ensureUserActivation(userIdForActivation, correlationId).catch(
            (err) => console.error('ensureUserActivation failed:', err),
          );
        }
      });
    } else {
      // Synchronous mode: wait for all tasks to complete
      // Verify and ensure user activation (outside transaction to prevent timeouts)
      if (result && result._id) {
        await this.ensureUserActivation(userIdForActivation, correlationId);
      }

      // Generate invoice for the subscription (outside transaction to prevent timeouts)
      try {
        await this.generateInvoiceForSubscription(result, payment);
      } catch (error) {
        console.error('Failed to generate invoice for subscription:', error);
        // Don't fail the subscription activation if invoice generation fails
      }

      await this.dispatchSubscriptionActivationNotification(result?._id, {
        payment,
        correlationId,
      });
    }

    return result;
  }

  /**
   * Ensure user is properly activated after subscription activation
   * This method provides a fallback mechanism to guarantee user activation
   * @param {String|Object} userId - User ID or user object
   * @param {String} correlationId - Correlation ID for logging
   */
  async ensureUserActivation(userId, correlationId) {
    if (!userId) {
      console.warn('No user ID provided for activation verification');
      return;
    }

    const userIdString =
      typeof userId === 'object' ? userId._id?.toString() : userId.toString();

    if (!userIdString) {
      console.warn('Invalid user ID provided for activation verification');
      return;
    }

    try {
      // First, check current user status
      const currentUser = await User.findById(userIdString).select(
        'isActive email name',
      );

      if (!currentUser) {
        console.error(
          `User ${userIdString} not found during activation verification`,
        );
        await this.logUserActivationFailure(
          userIdString,
          'User not found',
          correlationId,
        );
        return;
      }

      if (currentUser.isActive) {
        console.log(
          `User ${userIdString} (${currentUser.email}) is already active`,
        );
        return;
      }

      // User is not active, attempt to activate
      console.log(
        `Attempting to activate user ${userIdString} (${currentUser.email})`,
      );

      const updateResult = await User.findOneAndUpdate(
        {
          _id: userIdString,
          isActive: { $ne: true },
        },
        {
          $set: {
            isActive: true,
            lastLoginAt: new Date(),
          },
        },
        {
          new: true,
          runValidators: true,
        },
      );

      if (updateResult) {
        console.log(
          `Successfully activated user ${userIdString} (${currentUser.email}) via fallback mechanism`,
        );
        await this.logUserActivationSuccess(userIdString, correlationId);
      } else {
        // This shouldn't happen, but log it
        console.warn(
          `User ${userIdString} activation failed - user may have been activated by another process`,
        );

        // Double-check the user status
        const recheckUser =
          await User.findById(userIdString).select('isActive');
        if (recheckUser?.isActive) {
          console.log(
            `User ${userIdString} is now active (verified via recheck)`,
          );
        } else {
          console.error(
            `User ${userIdString} is still not active after activation attempt`,
          );
          await this.logUserActivationFailure(
            userIdString,
            'Activation failed - user still inactive',
            correlationId,
          );
        }
      }
    } catch (error) {
      console.error(
        `Error during user activation verification for user ${userIdString}:`,
        error,
      );
      await this.logUserActivationFailure(
        userIdString,
        error.message,
        correlationId,
      );
    }
  }

  /**
   * Log successful user activation
   * @param {String} userId - User ID
   * @param {String} correlationId - Correlation ID
   */
  async logUserActivationSuccess(userId, correlationId) {
    try {
      await TransactionLog.create({
        entityId: userId,
        entityType: 'user',
        action: 'activated',
        details: {
          activationMethod: 'subscription_fallback',
          timestamp: new Date(),
        },
        correlationId: correlationId || `user_activation_${userId}`,
      });
    } catch (logError) {
      console.error('Failed to log user activation success:', logError);
    }
  }

  /**
   * Log user activation failure
   * @param {String} userId - User ID
   * @param {String} reason - Failure reason
   * @param {String} correlationId - Correlation ID
   */
  async logUserActivationFailure(userId, reason, correlationId) {
    try {
      await TransactionLog.create({
        entityId: userId,
        entityType: 'user',
        action: 'activation_failed',
        details: {
          reason,
          activationMethod: 'subscription_fallback',
          timestamp: new Date(),
        },
        correlationId: correlationId || `user_activation_${userId}`,
      });
    } catch (logError) {
      console.error('Failed to log user activation failure:', logError);
    }
  }

  /**
   * Generate invoice for subscription
   * @param {Object} subscription - Subscription with populated data
   * @param {Object} payment - Payment data (optional)
   * @returns {Object} Generated invoice data
   */
  async generateInvoiceForSubscription(subscription, payment = null) {
    try {
      // Generate invoice using the populated subscription data
      const invoiceData = await this.invoiceService.generateAndUploadInvoice(
        subscription,
        payment,
      );

      // Log invoice generation
      await TransactionLog.create({
        entityId: subscription._id.toString(),
        entityType: 'subscription',
        action: 'invoice_generated',
        details: {
          invoiceNumber: invoiceData.invoiceNumber,
          amount: invoiceData.totalAmount,
          status: invoiceData.status,
          pdfUrl: invoiceData.pdfUrl,
        },
        correlationId: `invoice_${subscription._id}`,
      });

      return invoiceData;
    } catch (error) {
      // Log invoice generation failure but don't fail the subscription activation
      console.error('Failed to generate invoice for subscription:', error);

      await TransactionLog.create({
        entityId: subscription._id.toString(),
        entityType: 'subscription',
        action: 'invoice_generation_failed',
        details: {
          error: error.message,
        },
        correlationId: `invoice_${subscription._id}`,
      });

      // Return null to indicate invoice generation failed but subscription is still activated
      return null;
    }
  }

  /**
   * Dispatch template-based notifications after subscription activation
   * @param {String|Object} subscriptionRef - Subscription identifier
   * @param {Object} options
   * @param {Object} options.payment - Payment information for context building
   * @param {String} options.correlationId - Correlation identifier for logging
   * @param {Object} options.invoiceData - Invoice data with download link
   */
  async dispatchSubscriptionActivationNotification(
    subscriptionRef,
    { payment = null, correlationId, invoiceData = null } = {},
  ) {
    const subscriptionId =
      typeof subscriptionRef === 'object'
        ? subscriptionRef?._id?.toString?.()
        : subscriptionRef;

    if (!subscriptionId || !mongoose.isValidObjectId(subscriptionId)) {
      console.warn(
        'Subscription activation notification skipped - invalid subscription reference',
        {
          subscriptionRef,
        },
      );
      return null;
    }

    try {
      const subscription = await Subscription.findById(subscriptionId)
        .populate(
          'planName',
          'name price duration type description status isTrial currencyId',
        )
        .populate('user', 'name email phone roleId isActive')
        .lean();

      if (!subscription) {
        console.warn(
          'Subscription activation notification skipped - subscription not found',
          {
            subscriptionId,
          },
        );
        return null;
      }

      if (!subscription.user) {
        console.warn(
          'Subscription activation notification skipped - missing user on subscription',
          {
            subscriptionId,
          },
        );
        return null;
      }

      const baseUser =
        typeof subscription.user === 'object'
          ? { ...subscription.user }
          : await User.findById(subscription.user)
            .select('name email phone roleId isActive')
            .lean();

      if (!baseUser) {
        console.warn(
          'Subscription activation notification skipped - user not found',
          {
            subscriptionId,
          },
        );
        return null;
      }

      const user = {
        ...baseUser,
        role: baseUser.role || resolveRoleName(baseUser),
      };

      if (!user.role) {
        console.warn(
          'Subscription activation notification skipped - unable to resolve role for user',
          {
            subscriptionId,
            userId: user._id?.toString?.() || user.id,
          },
        );
        return null;
      }

      const context = await NotificationContextBuilder.buildContext({
        user,
        subscription,
        payment,
        plan: subscription.planName,
        additionalContext: {
          subscriptionId,
          planStartDate: subscription.purchaseDate,
          planExpiryDate: subscription.expiryDate,
          totalAmount: subscription.totalAmount,
          correlationId,
          // Include invoice data for email template
          invoiceDownloadUrl: invoiceData?.pdfUrl || '',
          invoiceNumber: invoiceData?.invoiceNumber || '',
        },
      });

      // Add business name for superadmin template (business_name placeholder)
      const adminUserId =
        typeof subscription.user === 'object'
          ? subscription.user._id
          : subscription.user;
      const business = await Business.findOne({ owner: adminUserId })
        .select('businessName')
        .lean();
      if (business?.businessName) {
        context.businessName = business.businessName;
      }

      // Resolve who should receive the notification from template's "to" array
      const template = await NotificationTemplate.findOne({
        type: NEW_SUBSCRIPTION_NOTIFICATION_TYPE,
        status: true,
      })
        .select('to')
        .lean();

      const recipients =
        Array.isArray(template?.to) && template.to.length > 0
          ? template.to
          : ['admin'];

      const allResults = [];

      // Dispatch to admin (subscription owner) if template includes admin
      if (recipients.includes('admin')) {
        const dispatchResult = await NotificationDispatcher.dispatch({
          type: NEW_SUBSCRIPTION_NOTIFICATION_TYPE,
          user,
          context,
          channels: DEFAULT_ACTIVATION_NOTIFICATION_CHANNELS,
        });
        allResults.push({ role: 'admin', userId: user._id, ...dispatchResult });

        if (!dispatchResult.success) {
          console.warn(
            'Subscription activation notification (admin) completed with partial failures',
            {
              subscriptionId,
              errors: dispatchResult.errors,
            },
          );
        }
      }

      // Dispatch to all active superadmins if template includes superadmin
      if (recipients.includes('superadmin')) {
        const superadminUsers = await User.find({
          roleId: 1,
          isActive: true,
        })
          .select('name email phone roleId')
          .lean();

        for (const sa of superadminUsers) {
          const superadminUser = {
            ...sa,
            role: 'superadmin',
          };
          const superadminContext = {
            ...context,
            superadminName: sa.name || '',
            superadminEmail: sa.email || '',
          };

          const dispatchResult = await NotificationDispatcher.dispatch({
            type: NEW_SUBSCRIPTION_NOTIFICATION_TYPE,
            user: superadminUser,
            context: superadminContext,
            channels: DEFAULT_ACTIVATION_NOTIFICATION_CHANNELS,
          });
          allResults.push({
            role: 'superadmin',
            userId: sa._id,
            ...dispatchResult,
          });

          if (!dispatchResult.success) {
            console.warn(
              `Subscription activation notification (superadmin ${sa._id}) completed with partial failures`,
              {
                subscriptionId,
                errors: dispatchResult.errors,
              },
            );
          }
        }
      }

      const anySuccess = allResults.some((r) => r.success);
      if (anySuccess) {
        console.log(
          `Subscription activation notification dispatched for ${subscriptionId} (${allResults.length} recipient(s))`,
        );
      }

      return {
        success: anySuccess,
        results: allResults,
        errors: allResults.flatMap((r) => r.errors || []),
      };
    } catch (error) {
      console.error('Failed to dispatch subscription activation notification', {
        subscriptionId,
        correlationId,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Cancel subscription
   * @param {String} subscriptionId
   * @param {String} reason
   * @param {String} correlationId
   */
  async cancelSubscription(subscriptionId, reason, correlationId) {
    if (!mongoose.isValidObjectId(subscriptionId)) {
      throw new Error('Invalid subscriptionId');
    }

    const subscription = await Subscription.findById(subscriptionId);
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    subscription.status = false;
    subscription.cancelReason = reason;
    subscription.cancelDate = new Date();
    await subscription.save();

    return subscription;
  }

  /**
   * Get subscription by ID with plan & user details
   * @param {String} subscriptionId
   */
  async findSubscriptionById(user, planId) {
    if (!mongoose.isValidObjectId(user)) {
      throw new Error('Invalid subscriptionId');
    }
    return Subscription.findOne({
      user,
      planName: planId,
      status: true,
    })
      .populate('planName user')
      .populate({
        path: 'currencyId',
        select:
          'currencySymbol currencyCode currencyPosition thousandSeparator decimalSeparator numberOfDecimals',
      })
      .populate({
        path: 'payment',
        select:
          'provider status method providerOrderId providerPaymentId amount currencyId createdAt',
      })
      .lean();
  }

  /**
   * Get subscription by ID with ownership validation
   * Only returns subscription if the requesting user is the owner
   * @param {String} subscriptionId - Subscription ID
   * @param {String} userId - User ID requesting the subscription
   * @returns {Promise<Object>} Subscription with populated fields
   * @throws {Error} If subscription not found, invalid IDs, or user is not the owner
   */
  async getSubscriptionById(subscriptionId, userId) {
    // Validate subscriptionId format
    if (!subscriptionId) {
      throw new Error('Subscription ID is required');
    }

    if (!mongoose.isValidObjectId(subscriptionId)) {
      throw new Error('Invalid subscription ID format');
    }

    // Validate userId format
    if (!userId) {
      throw new Error('User ID is required');
    }

    if (!mongoose.isValidObjectId(userId)) {
      throw new Error('Invalid user ID format');
    }

    // Fetch subscription with all populated fields
    const subscription = await Subscription.findById(subscriptionId)
      .populate(
        'planName',
        'name price duration type description status isTrial',
      )
      .populate('user', 'name email _id')
      .populate({
        path: 'currencyId',
        select:
          'currencySymbol currencyCode currencyPosition thousandSeparator decimalSeparator numberOfDecimals',
      })
      .populate({
        path: 'payment',
        select:
          'provider status method providerOrderId providerPaymentId amount currencyId createdAt',
      })
      .lean();

    // Check if subscription exists
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    // Extract user ID from subscription (handle both populated and non-populated cases)
    const subscriptionUserId =
      typeof subscription.user === 'object' && subscription.user !== null
        ? subscription.user._id?.toString()
        : subscription.user?.toString();

    // Validate ownership - user must be the owner of the subscription
    if (!subscriptionUserId || subscriptionUserId !== userId.toString()) {
      // Return generic "not found" to prevent information leakage
      throw new Error('Subscription not found');
    }

    return subscription;
  }

  async getAllActiveSubscriptions(queryParams = {}) {
    const {
      page = 1,
      limit = 10,
      search = '',
      sortBy = 'createdAt',
      sortOrder = 'desc',
      status = true, // default filter (active subs)
    } = queryParams;

    // Build filter
    const filter = {};
    if (typeof status !== 'undefined') {
      filter.status = status;
    }
    if (search) {
      filter.$or = [
        { 'planName.name': { $regex: search, $options: 'i' } }, // assuming plan has a `name` field
        { 'user.name': { $regex: search, $options: 'i' } }, // assuming user has `name`
      ];
    }

    // Sorting
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Query
    const [items, total] = await Promise.all([
      Subscription.find(filter)
        .populate('planName')
        .populate('user')
        .populate({
          path: 'currencyId',
          select:
            'currencySymbol currencyCode currencyPosition thousandSeparator decimalSeparator numberOfDecimals',
        })
        .populate({
          path: 'payment',
          select:
            'provider status method providerOrderId providerPaymentId amount currencyId createdAt',
        })
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Subscription.countDocuments(filter),
    ]);
    return {
      data: items,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
    };
  }

  static async getSubscriptionByUserId(userId) {
    if (!mongoose.isValidObjectId(userId)) {
      throw new Error('Invalid userId');
    }
    return Subscription.findOne({ user: userId, status: true })
      .populate('planName')
      .populate('user')
      .populate({
        path: 'currencyId',
        select:
          'currencySymbol currencyCode currencyPosition thousandSeparator decimalSeparator numberOfDecimals',
      })
      .populate({
        path: 'payment',
        select:
          'provider status method providerOrderId providerPaymentId amount currencyId createdAt',
      })
      .lean();
  }

  async createActiveSubscription(
    userId,
    planId,
    totalAmount,
    duration,
    amount,
    purchaseDate = new Date(),
    payment = null,
  ) {
    try {
      // Validate ids early
      if (!mongoose.isValidObjectId(userId)) {
        throw new Error('Invalid userId');
      }
      if (!mongoose.isValidObjectId(planId)) {
        throw new Error('Invalid planId');
      }

      const parseDurationInput = (input) => {
        if (typeof input === 'number') {
          return {
            value: Number.isFinite(input) ? Math.trunc(input) : NaN,
            unit: null,
          };
        }
        if (typeof input === 'string') {
          const normalized = input.trim().toLowerCase();
          const match = normalized.match(
            /^(\d+)\s*-?\s*(month|months|monthly|year|years|yearly|week|weeks|weekly|day|days|daily)?$/,
          );
          if (!match) return { value: NaN, unit: null };
          const value = parseInt(match[1], 10);
          const rawUnit = match[2] || '';
          const unitMap = {
            month: 'monthly',
            months: 'monthly',
            monthly: 'monthly',
            year: 'yearly',
            years: 'yearly',
            yearly: 'yearly',
            week: 'weekly',
            weeks: 'weekly',
            weekly: 'weekly',
            day: 'daily',
            days: 'daily',
            daily: 'daily',
          };
          const unit = unitMap[rawUnit] || null;
          return { value, unit };
        }
        return { value: NaN, unit: null };
      };

      const { subscription: newSubscription } =
        await TransactionUtils.executeTransaction(async (session) => {
          const existingSamePlan = await Subscription.findOne({
            user: userId,
            status: true,
            planName: planId,
          })
            .session(session)
            .lean();
          if (existingSamePlan) {
            throw new Error(
              'You already have an active subscription for this plan. Please cancel your existing subscription before purchasing a new one.',
            );
          }

          const planData = await Plan.findById(planId)
            .select(
              'price discount discountType duration type name status currencyId taxes storeLimit staffLimit description modules screens totalPrice isTrial',
            )
            .populate({
              path: 'taxes',
              select: 'name type value status',
            })
            .populate({
              path: 'currencyId',
              select:
                'currencySymbol currencyCode currencyPosition thousandSeparator decimalSeparator numberOfDecimals',
            })
            .session(session)
            .lean();
          if (!planData) {
            throw new Error('Plan not found');
          }
          if (planData.status !== true) {
            throw new Error('Plan is not active');
          }

          const parsed = parseDurationInput(duration);
          if (duration !== undefined && duration !== null) {
            if (parsed.unit && parsed.unit !== planData.type) {
              throw new Error(
                `Duration unit mismatch. Expected '${planData.type}'.`,
              );
            }
            if (!Number.isFinite(parsed.value) || parsed.value <= 0) {
              // ignore if unparsable but do not block; we'll use plan.duration
            } else if (parsed.value !== planData.duration) {
              throw new Error(
                `Duration value mismatch. Plan requires ${planData.duration} ${planData.type}.`,
              );
            }
          }

          const normalizedAmount = Number(amount || 0);
          if (!Number.isFinite(normalizedAmount) || normalizedAmount < 0) {
            throw new Error('Invalid amount');
          }
          const normalizedTotal = Number(totalAmount || 0);
          if (!Number.isFinite(normalizedTotal) || normalizedTotal <= 0) {
            throw new Error('Invalid total amount');
          }

          const existingActiveSubscriptions = await Subscription.find({
            user: userId,
            status: true,
          })
            .session(session)
            .lean();

          if (existingActiveSubscriptions.length > 0) {
            const deactivatedIds = existingActiveSubscriptions.map(
              (sub) => sub._id,
            );
            await Subscription.updateMany(
              {
                _id: { $in: deactivatedIds },
              },
              {
                $set: {
                  status: false,
                  cancelDate: new Date(),
                  cancelReason: 'Deactivated due to new subscription purchase',
                },
              },
              { session },
            );

            const correlationId = `deactivate_${userId}_${Date.now()}`;
            const deactivationLogs = deactivatedIds.map((subId) => ({
              entityId: subId.toString(),
              entityType: 'subscription',
              action: 'deactivated',
              details: {
                reason: 'New subscription purchased',
                userId: userId.toString(),
                newPlanId: planId.toString(),
              },
              correlationId,
            }));

            try {
              await TransactionLog.insertMany(deactivationLogs, { session });
            } catch (logError) {
              console.error(
                'Failed to log subscription deactivation:',
                logError,
              );
            }

            console.log(
              `Deactivated ${deactivatedIds.length} existing active subscription(s) for user ${userId} before creating new subscription for plan ${planId}`,
            );
          }

          // Build planSnapshot for immutable storage
          // Ensure planData has all required fields before building snapshot
          if (
            !planData.name ||
            !planData.type ||
            planData.price === undefined ||
            !planData.duration ||
            planData.storeLimit === undefined ||
            planData.staffLimit === undefined
          ) {
            throw new Error(
              'Plan data is incomplete. Missing required fields for planSnapshot.',
            );
          }

          const planSnapshot = this.buildPlanSnapshot(planData);

          // Validate planSnapshot structure before saving - ensure it's a complete object
          if (
            !planSnapshot ||
            typeof planSnapshot !== 'object' ||
            !planSnapshot.name ||
            !planSnapshot.type ||
            planSnapshot.price === undefined ||
            !planSnapshot.duration ||
            planSnapshot.storeLimit === undefined ||
            planSnapshot.staffLimit === undefined
          ) {
            console.error(
              'Invalid planSnapshot:',
              JSON.stringify(planSnapshot, null, 2),
            );
            throw new Error(
              'Failed to build valid planSnapshot. Required fields are missing.',
            );
          }

          // Ensure planSnapshot is a plain object (not a Mongoose document)
          const planSnapshotPlain = JSON.parse(JSON.stringify(planSnapshot));

          const [createdSubscription] = await Subscription.create(
            [
              {
                user: userId,
                planName: planId,
                status: true,
                totalAmount: normalizedTotal,
                duration: planData.duration,
                amount: normalizedAmount,
                purchaseDate,
                currencyId:
                  planData.currencyId?._id || planData.currencyId || null,
                planSnapshot: planSnapshotPlain,
              },
            ],
            { session },
          );

          // Ensure user is marked active upon successful subscription creation (ATOMIC)
          // This must succeed for the transaction to commit - atomicity requirement
          const userActivationResult = await User.findOneAndUpdate(
            {
              _id: userId,
              isActive: { $ne: true },
            },
            {
              $set: {
                isActive: true,
                lastLoginAt: new Date(),
              },
            },
            {
              session,
              new: true,
              runValidators: true,
            },
          ).lean();

          // Verify user exists - if not found, this is a critical error
          if (!userActivationResult) {
            const userExists = await User.findById(userId)
              .select('_id isActive')
              .session(session)
              .lean();

            if (!userExists) {
              throw new Error(
                `User ${userId} not found - cannot create active subscription`,
              );
            }
            // User exists but was already active - this is fine
            console.log(
              `User ${userId} was already active during subscription creation`,
            );
          } else {
            console.log(
              `User ${userId} successfully activated during subscription creation`,
            );
          }

          // Log subscription creation with user activation status
          const correlationId = `create_sub_${userId}_${Date.now()}`;
          await TransactionLog.create(
            [
              {
                entityId: createdSubscription._id.toString(),
                entityType: 'subscription',
                action: 'created_active',
                details: {
                  planId: planId.toString(),
                  userId: userId.toString(),
                  totalAmount: normalizedTotal,
                  userActivated: !!userActivationResult,
                },
                correlationId,
              },
            ],
            { session },
          );

          return { subscription: createdSubscription };
        }, TransactionUtils.getRetryConfig('subscription'));

      // Populate the subscription for invoice generation
      const populatedSubscription = await Subscription.findById(
        newSubscription._id,
      )
        .populate('planName')
        .populate('user')
        .populate({
          path: 'currencyId',
          select:
            'currencySymbol currencyCode currencyPosition thousandSeparator decimalSeparator numberOfDecimals',
        })
        .populate({
          path: 'payment',
          select:
            'provider status method providerOrderId providerPaymentId amount currencyId createdAt',
        })
        .lean();

      // Generate invoice for the new subscription
      await this.generateInvoiceForSubscription(populatedSubscription, payment);

      return newSubscription;
    } catch (error) {
      throw new Error(`Failed to create active subscription: ${error.message}`);
    }
  }

  buildActivePendingBasePipeline() {
    return [
      {
        $match: {
          status: { $in: [true, false] }, // active or pending
        },
      },
      {
        $sort: { createdAt: -1 }, // ensures latest pending comes first
      },
      {
        $group: {
          _id: '$user', // group by user
          subscriptions: {
            $push: '$$ROOT',
          },
        },
      },
      {
        $set: {
          activeSubscription: {
            $first: {
              $filter: {
                input: '$subscriptions',
                as: 'subscription',
                cond: { $eq: ['$$subscription.status', true] },
              },
            },
          },
          pendingSubscription: {
            $first: {
              $filter: {
                input: '$subscriptions',
                as: 'subscription',
                cond: { $eq: ['$$subscription.status', false] },
              },
            },
          },
        },
      },
      {
        $addFields: {
          subscriptions: {
            $cond: [{ $isArray: '$subscriptions' }, '$subscriptions', []],
          },
        },
      },
      {
        $addFields: {
          subscriptionId: {
            $ifNull: ['$activeSubscription._id', '$pendingSubscription._id'],
          },
        },
      },
      // Lookup plan with tax for activeSubscription
      {
        $lookup: {
          from: 'plans',
          let: { activePlanId: '$activeSubscription.planName' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$_id', '$$activePlanId'] },
              },
            },
            {
              $lookup: {
                from: 'taxes',
                localField: 'taxes',
                foreignField: '_id',
                as: 'taxes',
              },
            },
          ],
          as: 'activePlanLookup',
        },
      },
      // Lookup plan with tax for pendingSubscription
      {
        $lookup: {
          from: 'plans',
          let: { pendingPlanId: '$pendingSubscription.planName' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$_id', '$$pendingPlanId'] },
              },
            },
            {
              $lookup: {
                from: 'taxes',
                localField: 'taxes',
                foreignField: '_id',
                as: 'taxes',
              },
            },
          ],
          as: 'pendingPlanLookup',
        },
      },
      // Lookup user for activeSubscription
      {
        $lookup: {
          from: 'users',
          let: { activeUserId: '$activeSubscription.user' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$_id', '$$activeUserId'] },
              },
            },
            {
              $project: {
                _id: 1,
                name: 1,
                email: 1,
                phone: 1,
                roleId: 1,
                status: 1,
                profilePicture: 1,
              },
            },
          ],
          as: 'activeUserLookup',
        },
      },
      // Lookup user for pendingSubscription
      {
        $lookup: {
          from: 'users',
          let: { pendingUserId: '$pendingSubscription.user' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$_id', '$$pendingUserId'] },
              },
            },
            {
              $project: {
                _id: 1,
                name: 1,
                email: 1,
                phone: 1,
                roleId: 1,
                status: 1,
                profilePicture: 1,
              },
            },
          ],
          as: 'pendingUserLookup',
        },
      },
      // join currency for subscriptions (project minimal fields)
      {
        $lookup: {
          from: 'currencies',
          let: { currencyId: '$activeSubscription.currencyId' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$_id', '$$currencyId'] },
              },
            },
            {
              $project: {
                currencySymbol: 1,
                currencyCode: 1,
                currencyPosition: 1,
                thousandSeparator: 1,
                decimalSeparator: 1,
                numberOfDecimals: 1,
              },
            },
          ],
          as: 'activeCurrency',
        },
      },
      {
        $lookup: {
          from: 'currencies',
          let: { currencyId: '$pendingSubscription.currencyId' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$_id', '$$currencyId'] },
              },
            },
            {
              $project: {
                currencySymbol: 1,
                currencyCode: 1,
                currencyPosition: 1,
                thousandSeparator: 1,
                decimalSeparator: 1,
                numberOfDecimals: 1,
              },
            },
          ],
          as: 'pendingCurrency',
        },
      },
      // Lookup latest payment for activeSubscription
      {
        $lookup: {
          from: 'payments',
          let: { subId: '$activeSubscription._id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$subscription', '$$subId'] } } },
            { $sort: { createdAt: -1 } },
            {
              $project: {
                _id: 1,
                provider: 1,
                status: 1,
                method: 1,
                providerOrderId: 1,
                providerPaymentId: 1,
                amount: 1,
                currencyId: 1,
                createdAt: 1,
              },
            },
            { $limit: 1 },
          ],
          as: 'activePayment',
        },
      },
      // Lookup latest payment for pendingSubscription
      {
        $lookup: {
          from: 'payments',
          let: { subId: '$pendingSubscription._id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$subscription', '$$subId'] } } },
            { $sort: { createdAt: -1 } },
            {
              $project: {
                _id: 1,
                provider: 1,
                status: 1,
                method: 1,
                providerOrderId: 1,
                providerPaymentId: 1,
                amount: 1,
                currencyId: 1,
                createdAt: 1,
              },
            },
            { $limit: 1 },
          ],
          as: 'pendingPayment',
        },
      },
      {
        $addFields: {
          // Calculate expiryDate for activeSubscription
          activeExpiryDate: {
            $cond: [
              {
                $and: [
                  { $ifNull: ['$activeSubscription', false] },
                  { $ifNull: [{ $first: '$activePlanLookup' }, false] },
                ],
              },
              {
                $let: {
                  vars: {
                    purchaseDate: '$activeSubscription.purchaseDate',
                    duration: '$activeSubscription.duration',
                    type: { $first: '$activePlanLookup.type' },
                  },
                  in: {
                    $switch: {
                      branches: [
                        {
                          case: { $eq: ['$$type', 'yearly'] },
                          then: {
                            $dateAdd: {
                              startDate: '$$purchaseDate',
                              unit: 'year',
                              amount: '$$duration',
                            },
                          },
                        },
                        {
                          case: { $eq: ['$$type', 'monthly'] },
                          then: {
                            $dateAdd: {
                              startDate: '$$purchaseDate',
                              unit: 'month',
                              amount: '$$duration',
                            },
                          },
                        },
                        {
                          case: { $eq: ['$$type', 'weekly'] },
                          then: {
                            $dateAdd: {
                              startDate: '$$purchaseDate',
                              unit: 'week',
                              amount: '$$duration',
                            },
                          },
                        },
                        {
                          case: { $eq: ['$$type', 'daily'] },
                          then: {
                            $dateAdd: {
                              startDate: '$$purchaseDate',
                              unit: 'day',
                              amount: '$$duration',
                            },
                          },
                        },
                      ],
                      default: '$activeSubscription.expiryDate',
                    },
                  },
                },
              },
              '$activeSubscription.expiryDate',
            ],
          },
          // Calculate expiryDate for pendingSubscription
          pendingExpiryDate: {
            $cond: [
              {
                $and: [
                  { $ifNull: ['$pendingSubscription', false] },
                  { $ifNull: [{ $first: '$pendingPlanLookup' }, false] },
                ],
              },
              {
                $let: {
                  vars: {
                    purchaseDate: '$pendingSubscription.purchaseDate',
                    duration: '$pendingSubscription.duration',
                    type: { $first: '$pendingPlanLookup.type' },
                  },
                  in: {
                    $switch: {
                      branches: [
                        {
                          case: { $eq: ['$$type', 'yearly'] },
                          then: {
                            $dateAdd: {
                              startDate: '$$purchaseDate',
                              unit: 'year',
                              amount: '$$duration',
                            },
                          },
                        },
                        {
                          case: { $eq: ['$$type', 'monthly'] },
                          then: {
                            $dateAdd: {
                              startDate: '$$purchaseDate',
                              unit: 'month',
                              amount: '$$duration',
                            },
                          },
                        },
                        {
                          case: { $eq: ['$$type', 'weekly'] },
                          then: {
                            $dateAdd: {
                              startDate: '$$purchaseDate',
                              unit: 'week',
                              amount: '$$duration',
                            },
                          },
                        },
                        {
                          case: { $eq: ['$$type', 'daily'] },
                          then: {
                            $dateAdd: {
                              startDate: '$$purchaseDate',
                              unit: 'day',
                              amount: '$$duration',
                            },
                          },
                        },
                      ],
                      default: '$pendingSubscription.expiryDate',
                    },
                  },
                },
              },
              '$pendingSubscription.expiryDate',
            ],
          },
        },
      },
      {
        $addFields: {
          // Check if active subscription is expired
          isActiveExpired: {
            $cond: [
              { $ifNull: ['$activeExpiryDate', false] },
              { $lt: ['$activeExpiryDate', new Date()] },
              false,
            ],
          },
          // Check if pending subscription is expired
          isPendingExpired: {
            $cond: [
              { $ifNull: ['$pendingExpiryDate', false] },
              { $lt: ['$pendingExpiryDate', new Date()] },
              false,
            ],
          },
        },
      },
      {
        $addFields: {
          activeSubscription: {
            $cond: [
              { $ifNull: ['$activeSubscription', false] },
              {
                _id: '$activeSubscription._id',
                purchaseDate: '$activeSubscription.purchaseDate',
                planName: { $first: '$activePlanLookup' },
                duration: '$activeSubscription.duration',
                amount: '$activeSubscription.amount',
                totalAmount: '$activeSubscription.totalAmount',
                user: { $first: '$activeUserLookup' },
                // Mark as inactive if expired
                status: {
                  $cond: [
                    '$isActiveExpired',
                    false,
                    '$activeSubscription.status',
                  ],
                },
                expiryDate: '$activeExpiryDate',
                isExpired: '$isActiveExpired',
                createdAt: '$activeSubscription.createdAt',
                updatedAt: '$activeSubscription.updatedAt',
                __v: '$activeSubscription.__v',
                currency: { $first: '$activeCurrency' },
                payment: { $first: '$activePayment' },
              },
              null,
            ],
          },
          pendingSubscription: {
            $cond: [
              { $ifNull: ['$pendingSubscription', false] },
              {
                _id: '$pendingSubscription._id',
                purchaseDate: '$pendingSubscription.purchaseDate',
                planName: { $first: '$pendingPlanLookup' },
                duration: '$pendingSubscription.duration',
                amount: '$pendingSubscription.amount',
                totalAmount: '$pendingSubscription.totalAmount',
                user: { $first: '$pendingUserLookup' },
                // Mark as inactive if expired
                status: {
                  $cond: [
                    '$isPendingExpired',
                    false,
                    '$pendingSubscription.status',
                  ],
                },
                expiryDate: '$pendingExpiryDate',
                isExpired: '$isPendingExpired',
                createdAt: '$pendingSubscription.createdAt',
                updatedAt: '$pendingSubscription.updatedAt',
                __v: '$pendingSubscription.__v',
                currency: { $first: '$pendingCurrency' },
                payment: { $first: '$pendingPayment' },
              },
              null,
            ],
          },
        },
      },
      {
        $addFields: {
          sortCreatedAt: {
            $ifNull: [
              '$activeSubscription.createdAt',
              '$pendingSubscription.createdAt',
            ],
          },
          sortUpdatedAt: {
            $ifNull: [
              '$activeSubscription.updatedAt',
              '$pendingSubscription.updatedAt',
            ],
          },
        },
      },
    ];
  }

  buildActivePendingSearchStage(searchRegex) {
    if (!searchRegex) {
      return null;
    }

    const buildAmountRegexExpr = (fieldPath) => ({
      $expr: {
        $regexMatch: {
          input: {
            $toString: {
              $ifNull: [`$${fieldPath}`, ''],
            },
          },
          regex: searchRegex,
        },
      },
    });

    return {
      $match: {
        $or: [
          // Business owner / user fields
          { 'activeSubscription.user.name': searchRegex },
          { 'activeSubscription.user.email': searchRegex },
          { 'activeSubscription.user.phone': searchRegex },
          { 'activeSubscription.planName.name': searchRegex },
          { 'activeSubscription.businessOwner': searchRegex },
          { 'pendingSubscription.user.name': searchRegex },
          { 'pendingSubscription.user.email': searchRegex },
          { 'pendingSubscription.user.phone': searchRegex },
          { 'pendingSubscription.planName.name': searchRegex },
          { 'pendingSubscription.businessOwner': searchRegex },
          // Total amount search (string comparison)
          buildAmountRegexExpr('activeSubscription.totalAmount'),
          buildAmountRegexExpr('pendingSubscription.totalAmount'),
        ],
      },
    };
  }

  async getActiveAndLatestPendingSubscriptions(queryParams = {}) {
    const {
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      search = '',
      status,
    } = queryParams;

    const {
      page: parsedPage,
      limit: parsedLimit,
      skip,
    } = this.validatePagination(page, limit);
    const sortDirection = sortOrder === 'desc' ? -1 : 1;
    const sortFieldMap = {
      createdAt: 'sortCreatedAt',
      updatedAt: 'sortUpdatedAt',
    };
    const sortField = sortFieldMap[sortBy] || sortBy;
    const trimmedSearch =
      typeof search === 'string' ? search.trim() : String(search || '').trim();
    const searchRegex = trimmedSearch ? new RegExp(trimmedSearch, 'i') : null;

    const basePipeline = this.buildActivePendingBasePipeline();
    const searchStage = this.buildActivePendingSearchStage(searchRegex);
    if (searchStage) {
      basePipeline.push(searchStage);
    }

    // Apply status filter AFTER grouping and constructing subscription objects
    if (status !== null && status !== undefined && status !== '') {
      const statusLower = String(status).toLowerCase();

      if (statusLower === 'active') {
        // Filter to show only records with active, non-expired subscriptions
        basePipeline.push({
          $match: {
            activeSubscription: { $ne: null },
            'activeSubscription.isExpired': false,
          },
        });
      } else if (statusLower === 'pending') {
        // Filter to show only records with pending subscriptions (not yet paid/activated)
        basePipeline.push({
          $match: {
            pendingSubscription: { $ne: null },
            activeSubscription: null,
            'pendingSubscription.isExpired': false,
          },
        });
      } else if (statusLower === 'inactive') {
        // Filter to show only records with expired subscriptions
        basePipeline.push({
          $match: {
            $or: [
              {
                activeSubscription: { $ne: null },
                'activeSubscription.isExpired': true,
              },
              {
                pendingSubscription: { $ne: null },
                activeSubscription: null,
                'pendingSubscription.isExpired': true,
              },
            ],
          },
        });
      }
    }

    const paginationPipeline = [
      {
        $project: {
          _id: '$subscriptionId',
          userId: '$_id',
          activeSubscription: 1,
          pendingSubscription: 1,
          sortCreatedAt: 1,
          sortUpdatedAt: 1,
        },
      },
      {
        $sort: {
          [sortField]: sortDirection,
        },
      },
      { $skip: skip },
      { $limit: parsedLimit },
      {
        $project: {
          _id: 1,
          userId: 1,
          activeSubscription: 1,
          pendingSubscription: 1,
        },
      },
    ];

    const dataPipeline = [...basePipeline, ...paginationPipeline];
    const totalPipeline = [...basePipeline, { $count: 'total' }];

    // Calculate summary stats - expiring soon window (7 days)
    const now = new Date();
    const expiringSoonDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const statsPipeline = [
      {
        $facet: {
          totalSubscription: [{ $count: 'count' }],
          activeSubscription: [
            { $match: { status: true, $or: [{ expiryDate: { $gt: now } }, { expiryDate: { $exists: false } }] } },
            { $count: 'count' },
          ],
          expiredSubscription: [
            { $match: { status: true, expiryDate: { $lte: now } } },
            { $count: 'count' },
          ],
          expiringSoon: [
            { $match: { status: true, expiryDate: { $gt: now, $lte: expiringSoonDate } } },
            { $count: 'count' },
          ],
        },
      },
    ];

    const [items, totalResult, statsResult] = await Promise.all([
      Subscription.aggregate(dataPipeline),
      Subscription.aggregate(totalPipeline),
      Subscription.aggregate(statsPipeline),
    ]);

    const total = totalResult[0]?.total || 0;
    const stats = statsResult[0] || {};

    // Update expired subscriptions in database
    const expiredSubscriptionIds = [];
    items.forEach((item) => {
      if (
        item.activeSubscription?.isExpired &&
        item.activeSubscription.status === false
      ) {
        expiredSubscriptionIds.push(item.activeSubscription._id);
      }
      if (
        item.pendingSubscription?.isExpired &&
        item.pendingSubscription.status === false
      ) {
        expiredSubscriptionIds.push(item.pendingSubscription._id);
      }
    });

    // Bulk update expired subscriptions to inactive in database
    if (expiredSubscriptionIds.length > 0) {
      await Subscription.updateMany(
        { _id: { $in: expiredSubscriptionIds }, status: true },
        { $set: { status: false } },
      );
    }

    return {
      data: items,
      pagination: {
        currentPage: parsedPage,
        totalPages: Math.ceil(total / parsedLimit),
        totalItems: total,
        itemsPerPage: parsedLimit,
      },
      summary: {
        totalSubscription: stats.totalSubscription?.[0]?.count || 0,
        activeSubscription: stats.activeSubscription?.[0]?.count || 0,
        expiredSubscription: stats.expiredSubscription?.[0]?.count || 0,
        expiringSoon: stats.expiringSoon?.[0]?.count || 0,
      },
    };
  }

  /**
   * Retrieve active subscriptions that will expire within the given window
   * @param {Object} options
   * @param {number|string} options.windowInDays - Days from now to look ahead
   * @param {number} options.page - Page number for pagination
   * @param {number} options.limit - Page size
   * @param {boolean|string} options.includeTrials - Whether to include trial subscriptions
   * @param {string} options.sortBy - Field to sort by (expiryDate, purchaseDate, totalAmount, createdAt, updatedAt)
   * @param {string} options.sortOrder - asc or desc
   * @returns {Promise<Object>} Paginated list of expiring subscriptions
   */
  async getSubscriptionsExpiringSoon(options = {}) {
    const {
      windowInDays = DEFAULT_EXPIRING_SOON_WINDOW_DAYS,
      page = 1,
      limit = 25,
      includeTrials = true,
      sortBy = 'expiryDate',
      sortOrder = 'asc',
    } = options;

    const requestedWindow = Number.parseInt(windowInDays, 10);
    const normalizedWindow =
      Number.isNaN(requestedWindow) || requestedWindow <= 0
        ? DEFAULT_EXPIRING_SOON_WINDOW_DAYS
        : requestedWindow;
    const sanitizedWindow = Math.min(
      MAX_EXPIRING_SOON_WINDOW_DAYS,
      Math.max(1, normalizedWindow),
    );

    const includeTrialSubscriptions =
      typeof includeTrials === 'string'
        ? includeTrials.toLowerCase() !== 'false'
        : includeTrials !== false;

    const {
      page: parsedPage,
      limit: parsedLimit,
      skip,
    } = this.validatePagination(page, limit, 100);

    const now = NOW();
    const windowEnd = addDays(now, sanitizedWindow);

    const baseMatch = {
      status: true,
    };

    if (!includeTrialSubscriptions) {
      baseMatch.isTrial = { $ne: true };
    }

    const computedExpiryStage = {
      $addFields: {
        expiresAt: {
          $cond: [
            { $ifNull: ['$expiryDate', false] },
            '$expiryDate',
            {
              $let: {
                vars: {
                  duration: { $ifNull: ['$planSnapshot.duration', null] },
                  normalizedType: {
                    $toLower: { $ifNull: ['$planSnapshot.type', ''] },
                  },
                  purchaseDate: '$purchaseDate',
                },
                in: {
                  $cond: [
                    {
                      $and: [
                        { $gt: ['$$duration', 0] },
                        {
                          $in: [
                            '$$normalizedType',
                            ['yearly', 'monthly', 'weekly', 'daily'],
                          ],
                        },
                      ],
                    },
                    {
                      $switch: {
                        branches: [
                          {
                            case: { $eq: ['$$normalizedType', 'yearly'] },
                            then: {
                              $dateAdd: {
                                startDate: '$$purchaseDate',
                                unit: 'year',
                                amount: '$$duration',
                              },
                            },
                          },
                          {
                            case: { $eq: ['$$normalizedType', 'monthly'] },
                            then: {
                              $dateAdd: {
                                startDate: '$$purchaseDate',
                                unit: 'month',
                                amount: '$$duration',
                              },
                            },
                          },
                          {
                            case: { $eq: ['$$normalizedType', 'weekly'] },
                            then: {
                              $dateAdd: {
                                startDate: '$$purchaseDate',
                                unit: 'week',
                                amount: '$$duration',
                              },
                            },
                          },
                          {
                            case: { $eq: ['$$normalizedType', 'daily'] },
                            then: {
                              $dateAdd: {
                                startDate: '$$purchaseDate',
                                unit: 'day',
                                amount: '$$duration',
                              },
                            },
                          },
                        ],
                        default: null,
                      },
                    },
                    null,
                  ],
                },
              },
            },
          ],
        },
      },
    };

    const windowFilterStage = {
      $match: {
        expiresAt: {
          $gte: now,
          $lte: windowEnd,
        },
      },
    };

    const basePipeline = [
      { $match: baseMatch },
      computedExpiryStage,
      windowFilterStage,
    ];

    const sortFieldMap = {
      expiryDate: 'expiresAt',
      expiresAt: 'expiresAt',
      purchaseDate: 'purchaseDate',
      totalAmount: 'totalAmount',
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    };
    const resolvedSortField = sortFieldMap[sortBy] || 'expiresAt';
    const sortDirection = sortOrder === 'desc' ? -1 : 1;

    const paginationStages = [{ $skip: skip }, { $limit: parsedLimit }];

    const [items, totalResult] = await Promise.all([
      Subscription.aggregate([
        ...basePipeline,
        { $sort: { [resolvedSortField]: sortDirection, _id: 1 } },
        ...paginationStages,
      ]),
      Subscription.aggregate([...basePipeline, { $count: 'total' }]),
    ]);

    await Subscription.populate(items, [
      {
        path: 'planName',
        select:
          'name price duration type description status totalPrice isTrial storeLimit staffLimit',
      },
      { path: 'user', select: 'name email phone status isActive roleId' },
      {
        path: 'currencyId',
        select:
          'currencySymbol currencyCode currencyPosition thousandSeparator decimalSeparator numberOfDecimals',
      },
      {
        path: 'payment',
        select:
          'provider status method providerOrderId providerPaymentId amount currencyId createdAt',
      },
    ]);

    const total = totalResult[0]?.total || 0;

    const enrichedItems = items.map((item) => {
      const expiryDate = item.expiresAt || item.expiryDate || null;
      const msRemaining = expiryDate
        ? Math.max(0, differenceInMilliseconds(expiryDate, now))
        : 0;

      const days = Math.floor(msRemaining / (1000 * 60 * 60 * 24));
      const hours = Math.floor((msRemaining / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((msRemaining / (1000 * 60)) % 60);

      return {
        ...item,
        expiryDate,
        expiresIn: {
          days,
          hours,
          minutes,
        },
      };
    });

    return {
      data: enrichedItems,
      pagination: {
        currentPage: parsedPage,
        totalPages: parsedLimit ? Math.ceil(total / parsedLimit) : 0,
        totalItems: total,
        itemsPerPage: parsedLimit,
      },
      window: {
        start: now,
        end: windowEnd,
        windowInDays: sanitizedWindow,
      },
    };
  }

  /**
   * Check if user is eligible for trial subscription
   * @param {String} userId
   * @returns Object with eligibility status and details
   */
  async checkTrialEligibility(userId) {
    if (!mongoose.isValidObjectId(userId)) {
      throw new Error('Invalid userId');
    }

    try {
      // Single optimized query to get trial plan and user's subscription status
      const [trialPlan, userSubscriptions] = await Promise.all([
        Plan.findOne({ isTrial: true, status: true }).lean(),
        Subscription.find({
          user: userId,
          $or: [
            { status: true }, // Active subscriptions
            { isTrial: true }, // Any trial subscriptions (including expired)
          ],
        }).lean(),
      ]);

      // Cache the trial plan for reuse in createTrialSubscription

      if (!trialPlan) {
        return { eligible: false, reason: 'No active trial plan found' };
      }

      // Check eligibility using the fetched data
      const hasActiveSubscription = userSubscriptions.some(
        (sub) =>
          sub.planName.toString() === trialPlan._id.toString() &&
          sub.status === true,
      );

      if (hasActiveSubscription) {
        return {
          eligible: false,
          reason: 'User already has an active subscription for this plan',
        };
      }

      const hasUsedTrial = userSubscriptions.some(
        (sub) =>
          sub.planName.toString() === trialPlan._id.toString() &&
          sub.isTrial === true,
      );

      if (hasUsedTrial) {
        return {
          eligible: false,
          reason: 'User has already used the trial for this plan',
        };
      }

      return {
        eligible: true,
        plan: trialPlan, // Return full plan object for reuse
      };
    } catch (err) {
      throw err;
    }
  }

  /**
   * Create a free trial subscription
   * @param {String} userId
   * @returns Subscription document
   */
  async createTrialSubscription(userId) {
    if (!mongoose.isValidObjectId(userId)) {
      throw new Error('Invalid userId');
    }

    try {
      // First check eligibility using the optimized method
      const eligibility = await this.checkTrialEligibility(userId);
      if (!eligibility.eligible) {
        throw new Error(eligibility.reason);
      }

      // Use cached plan from eligibility check to avoid duplicate query
      const plan = eligibility.plan;

      // Fetch plan with all necessary fields and populate taxes and currency for snapshot
      const planData = await Plan.findById(plan._id)
        .select(
          'price discount discountType duration type name status currencyId taxes storeLimit staffLimit description modules screens totalPrice isTrial',
        )
        .populate({ path: 'taxes', select: 'name type value status' })
        .populate({
          path: 'currencyId',
          select:
            'currencySymbol currencyCode currencyPosition thousandSeparator decimalSeparator numberOfDecimals',
        })
        .lean();

      // Calculate trial expiry date based on plan duration and type
      const purchaseDate = new Date();
      const expiryDate = calculateExpiryDate(
        purchaseDate,
        plan.duration,
        plan.type,
      );

      // Build planSnapshot for immutable storage
      const planSnapshot = this.buildPlanSnapshot(planData);

      // Create trial subscription with atomic user activation
      const { subscription } = await TransactionUtils.executeTransaction(
        async (session) => {
          // Create trial subscription
          const [createdSubscription] = await Subscription.create(
            [
              {
                purchaseDate: purchaseDate,
                planName: plan._id,
                duration: plan.duration,
                amount: 0, // Free trial
                totalAmount: 0, // Free trial
                user: userId,
                status: true, // Active immediately
                isTrial: true,
                expiryDate: expiryDate,
                planSnapshot,
              },
            ],
            { session },
          );

          // Ensure user is marked active upon trial activation (ATOMIC)
          // This must succeed for the transaction to commit - atomicity requirement
          const userActivationResult = await User.findOneAndUpdate(
            {
              _id: userId,
              isActive: { $ne: true },
            },
            {
              $set: {
                isActive: true,
                lastLoginAt: new Date(),
              },
            },
            {
              session,
              new: true,
              runValidators: true,
            },
          ).lean();

          // Verify user exists - if not found, this is a critical error
          if (!userActivationResult) {
            const userExists = await User.findById(userId)
              .select('_id isActive')
              .session(session)
              .lean();

            if (!userExists) {
              throw new Error(
                `User ${userId} not found - cannot create trial subscription`,
              );
            }
            // User exists but was already active - this is fine
            console.log(
              `User ${userId} was already active during trial subscription creation`,
            );
          } else {
            console.log(
              `User ${userId} successfully activated during trial subscription creation`,
            );
          }

          // Log trial subscription creation with user activation status
          const correlationId = `trial_sub_${userId}_${Date.now()}`;
          await TransactionLog.create(
            [
              {
                entityId: createdSubscription._id.toString(),
                entityType: 'subscription',
                action: 'trial_created',
                details: {
                  planId: plan._id.toString(),
                  userId: userId.toString(),
                  isTrial: true,
                  userActivated: !!userActivationResult,
                },
                correlationId,
              },
            ],
            { session },
          );

          return { subscription: createdSubscription };
        },
        TransactionUtils.getRetryConfig('subscription'),
      );

      return subscription;
    } catch (err) {
      throw err;
    }
  }

  static async calculateSubscriptionDetails(purchaseDate, duration, type) {
    const purchaseDateObj = new Date(purchaseDate);
    const currentDate = new Date();
    let expiryDate = new Date(purchaseDateObj);

    const durationValue = Number(duration);

    if (!Number.isInteger(durationValue) || durationValue <= 0) {
      throw new Error('Duration must be a positive integer');
    }

    if (type === 'yearly') {
      expiryDate = addYears(expiryDate, durationValue);
    } else if (type === 'monthly') {
      expiryDate = addMonths(expiryDate, durationValue);
    } else if (type === 'daily') {
      expiryDate = addDays(expiryDate, durationValue);
    } else if (type === 'weekly') {
      expiryDate = addWeeks(expiryDate, durationValue);
    } else {
      throw new Error(`Unsupported plan type: ${type}`);
    }

    // Expiration check (strict: only expired AFTER the exact expiry timestamp)
    const isExpired = isAfter(currentDate, expiryDate);

    // Remaining time in ms
    const diffMs = isExpired
      ? 0
      : differenceInMilliseconds(expiryDate, currentDate);

    // Convert into human readable units
    const remainingDays = isExpired
      ? 0
      : Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const remainingHours = isExpired
      ? 0
      : Math.floor((diffMs / (1000 * 60 * 60)) % 24);
    const remainingMinutes = isExpired
      ? 0
      : Math.floor((diffMs / (1000 * 60)) % 60);

    return {
      expiryDate,
      isExpired,
      remaining: {
        days: remainingDays,
        hours: remainingHours,
        minutes: remainingMinutes,
      },
    };
  }

  /**
   * Clean up expired coupon usage for a subscription
   * This is called when reusing a pending subscription to ensure no stale coupon usage
   * @param {string} subscriptionId - Subscription ID
   * @private
   */
  async _cleanupExpiredCouponUsage(subscriptionId) {
    try {
      // Find any applied coupon usage for this subscription
      const appliedCouponUsage = await CouponUsage.findOne({
        subscriptionId,
        status: 'applied',
      })
        .populate('couponId', 'code')
        .lean();

      if (appliedCouponUsage) {
        // Release the coupon usage and decrement usage count
        await TransactionUtils.executeTransaction(async (session) => {
          // Update coupon usage status to released
          await CouponUsage.findByIdAndUpdate(
            appliedCouponUsage._id,
            {
              status: 'released',
              releasedAt: new Date(),
              metadata: {
                ...appliedCouponUsage.metadata,
                releasedReason: 'subscription_reuse_cleanup',
                releasedAt: new Date(),
              },
            },
            { session },
          );

          // Note: No need to decrement usage count since we only increment on successful payment

          // Log the cleanup action
          await TransactionLog.create(
            [
              {
                entityId: appliedCouponUsage._id.toString(),
                entityType: 'coupon_usage',
                action: 'coupon_released',
                details: {
                  couponCode: appliedCouponUsage.couponId.code,
                  subscriptionId,
                  reason: 'subscription_reuse_cleanup',
                  previousStatus: 'applied',
                  newStatus: 'released',
                },
                correlationId: `cleanup_${subscriptionId}`,
              },
            ],
            { session },
          );
        }, TransactionUtils.getRetryConfig('default'));

        console.log(
          `Cleaned up expired coupon usage for subscription ${subscriptionId}`,
        );
      }
    } catch (error) {
      // Log error but don't fail the subscription creation
      console.error(
        `Failed to cleanup expired coupon usage for subscription ${subscriptionId}:`,
        error,
      );
    }
  }

  async bulkGetSubscriptions(ids, options = {}) {
    try {
      // Validate input
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('Subscription IDs array is required and must not be empty');
      }

      // Extract options with defaults
      const {
        lean = true,
        throwOnNotFound = false,
      } = options;

      const populateOptions = [
        {
          path: 'planName',
          populate: { path: 'taxes' },
        },
        { path: 'user' },
        { path: 'currencyId' },
      ];

      // Use BaseService bulkGetByIds
      const result = await this.bulkGetByIds(ids, {
        populate: populateOptions,
        lean,
        throwOnNotFound,
      });

      // Wrap each document in an activeSubscription object
      const formattedDocuments = result.documents.map((doc) => {
        const isExpired = doc.expiryDate
          ? new Date(doc.expiryDate) < new Date()
          : false;

        const activeSubscription = {
          ...doc,
          currency: doc.currencyId, // Alias for frontend consistency
          isExpired,
        };

        return {
          activeSubscription,
          pendingSubscription: null,
          _id: doc._id,
          userId: doc.user?._id || doc.user,
        };
      });

      return {
        data: formattedDocuments,
        found: result.found,
        notFound: result.notFound,
        totalRequested: result.totalRequested,
      };
    } catch (error) {
      throw new Error(`Bulk get subscriptions failed: ${error.message}`);
    }
  }

}
export default SubscriptionService;
