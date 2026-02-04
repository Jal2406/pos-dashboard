import { BaseService } from '../utils/index.js';
import { TransactionUtils } from '../utils/index.js';
import {
  Coupon,
  CouponUsage,
  TransactionLog,
  Subscription,
  Payment,
  Currency,
} from '../models/index.js';

/**
 * Enhanced Coupon Flow Service
 * Implements the complete coupon lifecycle with proper audit trails and payment integration
 */
class CouponFlowService extends BaseService {
  constructor() {
    super(Coupon);
  }

  /**
   * Convert amount from main currency unit to smallest currency unit
   * @param {number} amount - Amount in main currency unit (e.g., 100.50 for $100.50)
   * @param {Object} currency - Currency object with numberOfDecimals
   * @returns {number} Amount in smallest currency unit (e.g., 10050 for $100.50)
   */
  _toSmallestUnit(amount, currency) {
    if (!amount || amount < 0) {
      return 0;
    }

    const decimals = currency?.numberOfDecimals || 2;
    return Math.round(amount * Math.pow(10, decimals));
  }

  /**
   * Convert amount from smallest currency unit to main currency unit
   * @param {number} amount - Amount in smallest currency unit (e.g., 10050 for $100.50)
   * @param {Object} currency - Currency object with numberOfDecimals
   * @returns {number} Amount in main currency unit (e.g., 100.50 for $100.50)
   */
  _toMainUnit(amount, currency) {
    if (!amount || amount < 0) {
      return 0;
    }

    const decimals = currency?.numberOfDecimals || 2;
    return amount / Math.pow(10, decimals);
  }

  /**
   * Apply coupon to a subscription (Step 1: Coupon Validation)
   * @param {string} couponCode - Coupon code to apply
   * @param {string} userId - User ID
   * @param {string} subscriptionId - Subscription ID
   * @param {Object} options - Additional options
   * @returns {Object} Applied coupon result
   */
  async applyCoupon(couponCode, userId, subscriptionId, options = {}) {
    try {
      const { userType = 'existing', metadata = {} } = options;

      // Get subscription details
      const subscription = await Subscription.findById(subscriptionId)
        .populate('planName')
        .populate('user');

      if (!subscription) {
        throw new Error('Subscription not found');
      }

      if (subscription.user._id.toString() !== userId) {
        throw new Error('Unauthorized to apply coupon to this subscription');
      }

      // Find and validate coupon first
      const coupon = await Coupon.findOne({
        code: couponCode.toUpperCase(),
        isDeleted: false,
        status: true,
        start_date: { $lte: new Date() },
        end_date: { $gte: new Date() },
        $expr: { $lt: ['$usageCount', '$limit'] },
      });

      if (!coupon) {
        throw new Error('Invalid or expired coupon code');
      }

      // Check if coupon is already applied to this subscription
      const existingUsage = await CouponUsage.findOne({
        subscriptionId,
        status: { $in: ['applied', 'consumed'] },
      });

      if (existingUsage) {
        // If it's the same coupon, return the existing usage
        if (existingUsage.couponId.toString() === coupon._id.toString()) {
          return {
            success: true,
            couponUsage: {
              id: existingUsage._id,
              couponCode: coupon.code,
              discountAmount: existingUsage.discountAmount,
              finalAmount: existingUsage.finalAmount,
              status: existingUsage.status,
            },
            subscription: {
              id: subscription._id,
              originalAmount: existingUsage.orderAmount,
              discountedAmount: existingUsage.finalAmount,
              savings: existingUsage.discountAmount,
            },
            message: 'Coupon already applied to this subscription',
          };
        } else {
          throw new Error(
            'A different coupon is already applied to this subscription',
          );
        }
      }

      // Validate coupon eligibility
      await this._validateCouponEligibility(
        coupon,
        userId,
        subscription,
        userType,
      );

      // Calculate base amount from plan (plan price after plan discount, before tax)
      const planPrice = Number(subscription.planName?.price || 0);
      const planDiscount = Number(subscription.planName?.discount || 0);
      const discountType = subscription.planName?.discountType || 'fixed';
      const planDiscountAmount =
        discountType === 'percentage'
          ? Math.min(planPrice, (planPrice * planDiscount) / 100)
          : planDiscount;
      const baseAmount = Math.max(0, planPrice - planDiscountAmount);

      // Calculate discount on base amount (before tax)
      const discountAmount = coupon.calculateDiscount(baseAmount);
      const finalAmount = baseAmount - discountAmount;

      // Create CouponUsage record with status 'applied'
      const couponUsage = await TransactionUtils.executeTransaction(
        async (session) => {
          const usage = await CouponUsage.create(
            [
              {
                couponId: coupon._id,
                userId,
                planId: subscription.planName._id,
                subscriptionId,
                orderId: `sub_${subscriptionId}_${Date.now()}`,
                orderAmount: baseAmount,
                discountAmount,
                finalAmount,
                status: 'applied',
                metadata: {
                  ...metadata,
                  appliedAt: new Date(),
                  couponCode: coupon.code,
                },
              },
            ],
            { session },
          );

          // Note: Usage count will be incremented only when payment is successfully captured
          // This prevents counting coupons that are applied but not finalized

          // Log transaction
          await TransactionLog.create(
            [
              {
                entityId: usage[0]._id.toString(),
                entityType: 'coupon_usage',
                action: 'coupon_applied',
                details: {
                  couponCode: coupon.code,
                  subscriptionId,
                  planId: subscription.planName._id,
                  orderAmount: baseAmount,
                  discountAmount,
                  finalAmount,
                  userId,
                },
                correlationId: `coupon_${coupon.code}_${subscriptionId}`,
              },
            ],
            { session },
          );

          return usage[0];
        },
        TransactionUtils.getRetryConfig('default'),
      );

      return {
        success: true,
        couponUsage: {
          id: couponUsage._id,
          couponCode: coupon.code,
          discountAmount,
          finalAmount,
          status: 'applied',
        },
        subscription: {
          id: subscription._id,
          originalAmount: baseAmount,
          discountedAmount: finalAmount,
          savings: discountAmount,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get effective total for payment creation (Step 2: Order Creation Hook)
   * @param {string} subscriptionId - Subscription ID
   * @returns {Object} Effective total with coupon details in smallest currency units
   */
  async getEffectiveTotal(subscriptionId) {
    try {
      // Get subscription with currency and plan information (including tax)
      const subscription = await Subscription.findById(subscriptionId)
        .populate('currencyId')
        .populate({
          path: 'planName',
          populate: {
            path: 'taxes',
            select: 'name type value',
          },
        });

      if (!subscription) {
        throw new Error('Subscription not found');
      }

      // Get currency information from subscription
      const currency = subscription.currencyId;

      if (!currency) {
        throw new Error('Currency information not found');
      }

      // Find active coupon usage for this subscription
      const couponUsage = await CouponUsage.findOne({
        subscriptionId,
        status: 'applied',
      }).populate('couponId', 'code type discount_amount');

      // Calculate base amount from plan (plan price after plan discount, before tax)
      const planPrice = Number(subscription.planName?.price || 0);
      const planDiscount = Number(subscription.planName?.discount || 0);
      const discountType = subscription.planName?.discountType || 'fixed';
      const planDiscountAmount =
        discountType === 'percentage'
          ? Math.min(planPrice, (planPrice * planDiscount) / 100)
          : planDiscount;
      const baseAmount = Math.max(0, planPrice - planDiscountAmount);

      let discountAmount = 0;
      let finalAmountBeforeTax = baseAmount;
      let couponApplied = false;
      let couponDetails = null;

      if (couponUsage) {
        // Apply coupon discount to base amount
        discountAmount = couponUsage.discountAmount;
        finalAmountBeforeTax = Math.max(0, baseAmount - discountAmount);
        couponApplied = true;
        couponDetails = {
          code: couponUsage.couponId.code,
          type: couponUsage.couponId.type,
          discountAmount: discountAmount,
        };
      }

      // Calculate tax on the final amount after coupon discount
      let taxAmount = 0;
      const taxesArray = Array.isArray(subscription.planName?.taxes)
        ? subscription.planName.taxes
        : subscription.planName?.tax
          ? [subscription.planName.tax]
          : [];
      if (taxesArray.length > 0) {
        taxAmount = taxesArray.reduce((sum, taxDoc) => {
          if (!taxDoc) {
            return sum;
          }
          const type = (taxDoc.type || '').toLowerCase();
          const value = Number(taxDoc.value) || 0;
          if (type === 'percentage') {
            return sum + (finalAmountBeforeTax * value) / 100;
          }
          return sum + value;
        }, 0);
      }

      // Final amount = amount after coupon + tax
      const finalAmountWithTax = finalAmountBeforeTax + taxAmount;

      // Convert amounts to smallest currency units
      const originalAmountInSmallestUnit = this._toSmallestUnit(
        baseAmount,
        currency,
      );
      const discountAmountInSmallestUnit = this._toSmallestUnit(
        discountAmount,
        currency,
      );
      const taxAmountInSmallestUnit = this._toSmallestUnit(taxAmount, currency);
      const finalAmountInSmallestUnit = this._toSmallestUnit(
        finalAmountWithTax,
        currency,
      );

      return {
        originalAmount: originalAmountInSmallestUnit,
        originalAmountMainUnit: baseAmount,
        discountAmount: discountAmountInSmallestUnit,
        discountAmountMainUnit: discountAmount,
        amountAfterCoupon: this._toSmallestUnit(finalAmountBeforeTax, currency),
        amountAfterCouponMainUnit: finalAmountBeforeTax,
        taxAmount: taxAmountInSmallestUnit,
        taxAmountMainUnit: taxAmount,
        finalAmount: finalAmountInSmallestUnit,
        finalAmountMainUnit: finalAmountWithTax,
        couponApplied,
        couponDetails: couponApplied
          ? {
            ...couponDetails,
            discountAmountInSmallestUnit: discountAmountInSmallestUnit,
          }
          : null,
        currency: {
          code: currency.currencyCode,
          symbol: currency.currencySymbol,
          decimals: currency.numberOfDecimals,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Finalize coupon usage based on payment status (Step 3: Finalization)
   * @param {string} subscriptionId - Subscription ID
   * @param {string} paymentStatus - Payment status ('captured', 'failed', 'cancelled')
   * @param {Object} paymentDetails - Payment details
   * @param {Object} session - Database session (optional)
   * @returns {Object} Finalization result
   */
  async finalizeCouponUsage(
    subscriptionId,
    paymentStatus,
    paymentDetails = {},
    session = null,
  ) {
    try {
      const couponUsage = await CouponUsage.findOne({
        subscriptionId,
        status: 'applied',
      }).populate('couponId', 'code');

      if (!couponUsage) {
        // No coupon applied, nothing to finalize
        return {
          success: true,
          message: 'No coupon usage to finalize',
          couponFinalized: false,
        };
      }

      let newStatus;
      let action;
      let message;

      switch (paymentStatus) {
        case 'captured':
          newStatus = 'consumed';
          action = 'coupon_consumed';
          message = 'Coupon successfully consumed';
          break;
        case 'failed':
        case 'cancelled':
          newStatus = 'released';
          action = 'coupon_released';
          message = 'Coupon released due to payment failure';
          break;
        default:
          throw new Error(`Invalid payment status: ${paymentStatus}`);
      }

      // Update coupon usage status
      const executeTransaction = session
        ? async (callback) => await callback(session)
        : async (callback) =>
          await TransactionUtils.executeTransaction(
            callback,
            TransactionUtils.getRetryConfig('default'),
          );

      await executeTransaction(async (txnSession) => {
        // Update coupon usage
        await CouponUsage.findByIdAndUpdate(
          couponUsage._id,
          {
            status: newStatus,
            ...(newStatus === 'consumed' && { consumedAt: new Date() }),
            ...(newStatus === 'released' && { releasedAt: new Date() }),
          },
          { session: txnSession },
        );

        // Update coupon usage count based on payment status
        if (newStatus === 'consumed') {
          // Increment usage count only when payment is successfully captured
          await Coupon.updateOne(
            { _id: couponUsage.couponId._id, isDeleted: false },
            { $inc: { usageCount: 1 } },
            { session: txnSession },
          );
        }
        // Note: No need to decrement for 'released' status since we never incremented it initially

        // Log transaction
        await TransactionLog.create(
          [
            {
              entityId: couponUsage._id.toString(),
              entityType: 'coupon_usage',
              action,
              details: {
                couponCode: couponUsage.couponId.code,
                subscriptionId,
                paymentStatus,
                paymentDetails,
                previousStatus: 'applied',
                newStatus,
              },
              correlationId: `coupon_${couponUsage.couponId.code}_${subscriptionId}`,
            },
          ],
          { session: txnSession },
        );
      });

      return {
        success: true,
        message,
        couponFinalized: true,
        couponUsage: {
          id: couponUsage._id,
          code: couponUsage.couponId.code,
          status: newStatus,
          discountAmount: couponUsage.discountAmount,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Remove applied coupon from subscription
   * @param {string} subscriptionId - Subscription ID
   * @param {string} userId - User ID
   * @returns {Object} Removal result
   */
  async removeCoupon(subscriptionId, userId) {
    try {
      const couponUsage = await CouponUsage.findOne({
        subscriptionId,
        userId,
        status: 'applied',
      }).populate('couponId', 'code');

      if (!couponUsage) {
        throw new Error('No applied coupon found for this subscription');
      }

      await TransactionUtils.executeTransaction(async (session) => {
        // Cancel the coupon usage
        await CouponUsage.findByIdAndUpdate(
          couponUsage._id,
          {
            status: 'cancelled',
            cancelledAt: new Date(),
          },
          { session },
        );

        // Note: No need to decrement usage count since we only increment on successful payment

        // Log transaction
        await TransactionLog.create(
          [
            {
              entityId: couponUsage._id.toString(),
              entityType: 'coupon_usage',
              action: 'coupon_cancelled',
              details: {
                couponCode: couponUsage.couponId.code,
                subscriptionId,
                userId,
                reason: 'user_removed',
              },
              correlationId: `coupon_${couponUsage.couponId.code}_${subscriptionId}`,
            },
          ],
          { session },
        );
      }, TransactionUtils.getRetryConfig('default'));

      return {
        success: true,
        message: 'Coupon removed successfully',
        couponCode: couponUsage.couponId.code,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get coupon usage history for a subscription
   * @param {string} subscriptionId - Subscription ID
   * @returns {Object} Coupon usage history
   */
  async getSubscriptionCouponHistory(subscriptionId) {
    try {
      const couponUsages = await CouponUsage.find({
        subscriptionId,
      })
        .populate('couponId', 'code type discount_amount description')
        .sort({ createdAt: -1 });

      return {
        subscriptionId,
        couponUsages: couponUsages.map((usage) => ({
          id: usage._id,
          couponCode: usage.couponId.code,
          couponType: usage.couponId.type,
          discountAmount: usage.discountAmount,
          finalAmount: usage.finalAmount,
          status: usage.status,
          appliedAt: usage.appliedAt,
          consumedAt: usage.consumedAt,
          releasedAt: usage.releasedAt,
          cancelledAt: usage.cancelledAt,
        })),
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Validate coupon eligibility
   * @private
   */
  async _validateCouponEligibility(coupon, userId, subscription, userType) {
    // Check if coupon is active
    if (!coupon.isActive) {
      throw new Error('Coupon is not active');
    }

    // Check if coupon has reached its limit
    if (coupon.isLimitReached) {
      throw new Error('Coupon usage limit reached');
    }

    // Check user type eligibility
    if (!coupon.canBeUsedByUser(userId, userType)) {
      if (coupon.applicableFor === 'new_users' && userType !== 'new') {
        throw new Error('Coupon is only applicable for new users');
      }
      if (
        coupon.applicableFor === 'existing_users' &&
        userType !== 'existing'
      ) {
        throw new Error('Coupon is only applicable for existing users');
      }
      throw new Error('Coupon is not applicable for this user type');
    }

    // Calculate base amount for minimum order check
    const planPrice = Number(subscription.planName?.price || 0);
    const planDiscount = Number(subscription.planName?.discount || 0);
    const discountType = subscription.planName?.discountType || 'fixed';
    const planDiscountAmount =
      discountType === 'percentage'
        ? Math.min(planPrice, (planPrice * planDiscount) / 100)
        : planDiscount;
    const baseAmount = Math.max(0, planPrice - planDiscountAmount);

    // Check plan applicability
    if (coupon.plans && coupon.plans.length > 0) {
      const isPlanApplicable = coupon.plans.some(
        (plan) => plan.toString() === subscription.planName._id.toString(),
      );
      if (!isPlanApplicable) {
        throw new Error('Coupon is not applicable to this plan');
      }
    }

    // Check user usage limit
    const userUsageCount = await CouponUsage.countDocuments({
      couponId: coupon._id,
      userId,
      status: { $in: ['applied', 'consumed', 'refunded'] },
    });

    if (userUsageCount >= coupon.maxUsagePerUser) {
      throw new Error(
        'You have already used this coupon maximum allowed times',
      );
    }
  }

  /**
   * Reconcile payment with coupon usage
   * @param {string} paymentId - Payment ID
   * @returns {Object} Reconciliation result
   */
  async reconcilePaymentWithCoupon(paymentId) {
    try {
      const payment =
        await Payment.findById(paymentId).populate('subscription');

      if (!payment) {
        throw new Error('Payment not found');
      }

      const couponUsage = await CouponUsage.findOne({
        subscriptionId: payment.subscription._id,
        status: { $in: ['applied', 'consumed'] },
      }).populate('couponId', 'code');

      if (!couponUsage) {
        return {
          success: true,
          message: 'No coupon usage found for this payment',
          reconciliation: {
            paymentAmount: payment.amount,
            subscriptionAmount: payment.subscription.totalAmount,
            couponApplied: false,
          },
        };
      }

      // Get the effective total to calculate expected amount with tax
      const effectiveTotal = await this.getEffectiveTotal(
        payment.subscription._id,
      );
      const currency = payment.subscription.currencyId;
      const actualAmount = payment.amount;

      const reconciliation = {
        paymentAmount: actualAmount,
        paymentAmountMainUnit: this._toMainUnit(actualAmount, currency),
        subscriptionBaseAmount: payment.subscription.totalAmount,
        couponApplied: true,
        couponCode: couponUsage.couponId.code,
        expectedAmount: effectiveTotal.finalAmount,
        expectedAmountMainUnit: effectiveTotal.finalAmountMainUnit,
        discountAmount: effectiveTotal.discountAmountMainUnit,
        taxAmount: effectiveTotal.taxAmountMainUnit,
        amountMatches: actualAmount === effectiveTotal.finalAmount,
        discrepancy: actualAmount - effectiveTotal.finalAmount,
        discrepancyMainUnit: this._toMainUnit(
          actualAmount - effectiveTotal.finalAmount,
          currency,
        ),
      };

      // Log reconciliation
      await TransactionLog.create({
        entityId: paymentId,
        entityType: 'payment',
        action: 'coupon_reconciliation',
        details: reconciliation,
        correlationId: `reconcile_${paymentId}`,
      });

      return {
        success: true,
        message: 'Payment reconciled with coupon usage',
        reconciliation,
      };
    } catch (error) {
      throw error;
    }
  }
}

export default CouponFlowService;
