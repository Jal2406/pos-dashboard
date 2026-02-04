/**
 * Unified Payment Service
 * Orchestrates multi-provider payment processing for subscription system
 * Provides frontend-driven checkout flow with provider abstraction
 */

import mongoose from 'mongoose';
import {
  Payment,
  Subscription,
  TransactionLog,
  Plan,
  Currency,
  User,
} from '../../models/index.js';
import { addMonths, addYears, addWeeks, addDays } from 'date-fns';
import SubscriptionService from '../subscription.service.js';
import InvoiceService from '../invoice.service.js';
import CouponFlowService from '../couponFlow.service.js';
import { paymentOrchestrator } from './index.js';
import {
  PaymentProviderError,
  PaymentValidationError,
  PaymentConfigurationError,
} from './PaymentErrors.js';
import EmailService from '../../utils/email.service.js';
import { TransactionUtils } from '../../utils/index.js';

const subscriptionService = new SubscriptionService();
const invoiceService = new InvoiceService();
const couponFlowService = new CouponFlowService();

export class UnifiedPaymentService {
  constructor() {
    this.orchestrator = paymentOrchestrator;
  }

  /**
   * Create a payment for subscription with selected provider
   * @param {string} subscriptionId - Subscription ID
   * @param {string} userId - User ID
   * @param {string} paymentProvider - Payment provider name
   * @param {string} currencyId - Currency ID
   * @returns {Promise<Object>} Payment creation response with public config
   */
  async createPayment(
    subscriptionId,
    userId,
    paymentProvider,
    currencyId = null,
  ) {
    // Validate inputs
    if (!mongoose.isValidObjectId(subscriptionId)) {
      throw new PaymentValidationError('Invalid subscriptionId');
    }
    if (!mongoose.isValidObjectId(userId)) {
      throw new PaymentValidationError('Invalid userId');
    }
    if (!paymentProvider) {
      throw new PaymentValidationError('Payment provider is required');
    }

    // Get subscription and validate ownership
    const subscription = await Subscription.findById(subscriptionId)
      .populate('planName')
      .lean();

    if (!subscription) {
      throw new PaymentValidationError('Subscription not found');
    }
    if (subscription.status === true) {
      throw new PaymentValidationError('Subscription already active');
    }
    if (String(subscription.user) !== String(userId)) {
      throw new PaymentValidationError('User does not own this subscription');
    }

    // Get currency and provider
    const currency = await this.getCurrency(currencyId);
    const provider = await this.getProvider(paymentProvider);

    // Check for existing pending payment with same currency
    const existingPayment = await Payment.findOne({
      subscription: subscriptionId,
      status: { $in: ['created', 'authorized'] },
      provider: paymentProvider,
      currencyId: currency._id, // Only return existing payments with same currency
    })
      .sort({ createdAt: -1 })
      .lean();

    if (existingPayment) {
      // Delete existing payment to create a fresh one with approvalUrl
      await Payment.findByIdAndDelete(existingPayment._id);
    }

    // Get effective total with coupon discount
    const effectiveTotal =
      await couponFlowService.getEffectiveTotal(subscriptionId);

    // Create payment order using provider
    const orderData = {
      amount: effectiveTotal.finalAmount,
      currency: currency.currencyCode,
      receipt: `sub_${String(subscriptionId).slice(-8)}_${Date.now()}`,
      notes: {
        subscriptionId: String(subscriptionId),
        userId: String(userId),
        currencyId: String(currency._id),
      },
      customer: {
        id: String(userId),
        email: subscription.user?.email || '',
      },
    };

    const orderResponse = await provider.createOrder(
      subscription,
      currency,
      orderData,
    );

    // Create payment record with coupon metadata
    const paymentDoc = await Payment.create({
      subscription: subscriptionId,
      amount: effectiveTotal.finalAmount,
      currencyId: currency._id,
      provider: paymentProvider,
      status: 'created',
      providerOrderId: orderResponse.orderId,
      rawPayload: { orderCreateResponse: orderResponse },
      metadata: {
        ...(effectiveTotal.couponApplied && {
          couponCode: effectiveTotal.couponDetails.code,
          discountAmount: effectiveTotal.discountAmount,
          discountAmountMainUnit: effectiveTotal.discountAmountMainUnit,
          originalAmount: effectiveTotal.originalAmount,
          originalAmountMainUnit: effectiveTotal.originalAmountMainUnit,
          finalAmountMainUnit: effectiveTotal.finalAmountMainUnit,
        }),
        // Always include tax information
        taxAmount: effectiveTotal.taxAmount,
        taxAmountMainUnit: effectiveTotal.taxAmountMainUnit,
        currencyInfo: {
          code: effectiveTotal.currency.code,
          symbol: effectiveTotal.currency.symbol,
          decimals: effectiveTotal.currency.decimals,
        },
      },
    });

    // Link latest payment to subscription for quick access
    try {
      await Subscription.findByIdAndUpdate(subscriptionId, {
        $set: { payment: paymentDoc._id },
      });
    } catch (linkErr) {
      console.warn(
        `Failed to link payment ${paymentDoc._id} to subscription ${subscriptionId}:`,
        linkErr?.message,
      );
    }

    // Create transaction log with coupon details
    await TransactionLog.create({
      entityId: paymentDoc._id.toString(),
      entityType: 'payment',
      action: 'order_created',
      details: {
        provider: paymentProvider,
        providerOrderId: orderResponse.orderId,
        amount: effectiveTotal.finalAmount,
        amountMainUnit:
          effectiveTotal.finalAmountMainUnit ||
          effectiveTotal.originalAmountMainUnit,
        originalAmount: effectiveTotal.originalAmount,
        originalAmountMainUnit: effectiveTotal.originalAmountMainUnit,
        couponApplied: effectiveTotal.couponApplied,
        taxAmount: effectiveTotal.taxAmount,
        taxAmountMainUnit: effectiveTotal.taxAmountMainUnit,
        ...(effectiveTotal.couponApplied && {
          couponCode: effectiveTotal.couponDetails.code,
          discountAmount: effectiveTotal.discountAmount,
          discountAmountMainUnit: effectiveTotal.discountAmountMainUnit,
        }),
        currencyConversion: {
          decimals: currency.numberOfDecimals,
          conversionFactor: Math.pow(10, currency.numberOfDecimals),
        },
      },
    });

    return this.formatPaymentResponse(
      paymentDoc,
      provider,
      orderResponse,
      currency,
    );
  }

  /**
   * Finalize payment after user interaction
   * @param {string} paymentId - Payment ID
   * @param {Object} finalizeData - Provider-specific finalization data
   * @param {string} correlationId - Correlation ID for tracking
   * @returns {Promise<Object>} Payment finalization response
   */
  async finalizePayment(paymentId, finalizeData, correlationId = null) {
    const startTime = Date.now();
    const timings = {};

    if (!paymentId) {
      throw new PaymentValidationError('paymentId is required');
    }
    if (!finalizeData || typeof finalizeData !== 'object') {
      throw new PaymentValidationError(
        'finalizeData is required and must be an object',
      );
    }

    // Check if paymentId is a valid MongoDB ObjectId or a provider payment ID
    let payment;
    const isObjectId = mongoose.isValidObjectId(paymentId);

    const paymentLookupStart = Date.now();
    if (isObjectId) {
      // Search by MongoDB ObjectId
      payment = await Payment.findById(paymentId)
        .populate({
          path: 'subscription',
          select: 'duration planName user status',
          populate: {
            path: 'planName',
            select: 'type currencyId',
            populate: {
              path: 'currencyId',
              select:
                'currencySymbol currencyCode currencyPosition thousandSeparator decimalSeparator numberOfDecimals',
            },
          },
        })
        .lean();
    } else {
      // Search by provider payment ID (for PayPal, Razorpay, etc.)

      payment = await Payment.findOne({
        $or: [{ providerOrderId: paymentId }, { providerPaymentId: paymentId }],
      })
        .populate({
          path: 'subscription',
          select: 'duration planName user status',
          populate: {
            path: 'planName',
            select: 'type currencyId',
            populate: {
              path: 'currencyId',
              select:
                'currencySymbol currencyCode currencyPosition thousandSeparator decimalSeparator numberOfDecimals',
            },
          },
        })
        .lean();
    }
    timings.paymentLookup = Date.now() - paymentLookupStart;

    if (!payment) {
      throw new PaymentValidationError('Payment not found');
    }

    if (payment.status === 'captured') {
      return payment;
    }

    // Check if payment is already being processed to prevent concurrent finalization
    if (payment.status === 'processing') {
      throw new PaymentValidationError(
        'Payment is already being processed. Please wait for completion.',
      );
    }

    // Special handling for PayPal payments in created state
    if (payment.provider === 'paypal' && payment.status === 'created') {
      // For PayPal, if we have a payerId, we can proceed with execution
      // The payerId indicates the user has completed the approval process
      if (!finalizeData.payerId) {
        // Get approval URL from raw payload if available
        const approvalUrl =
          payment.rawPayload?.orderCreateResponse?.approvalUrl;
        if (!approvalUrl) {
          throw new PaymentValidationError(
            'PayPal payment needs user approval but no approval URL found',
          );
        }
      }
    }

    // Validate finalizeData based on provider requirements
    this.validateFinalizeData(payment.provider, finalizeData);

    // Parallel execution: Get provider and verify payment simultaneously
    const verifyStart = Date.now();
    const [provider, verificationResult] = await Promise.all([
      this.getProvider(payment.provider),
      this.verifyPaymentWithProvider(payment, finalizeData),
    ]);
    timings.providerVerification = Date.now() - verifyStart;

    if (!verificationResult.success) {
      // Provide more specific error for PayPal payments in created state
      if (payment.provider === 'paypal' && payment.status === 'created') {
        // For PayPal, if we have a payerId, we should proceed with execution
        // The verification failure might be due to state check, but execution can still work
        if (finalizeData.payerId) {
          // Continue with the payment finalization process
        } else {
          const approvalUrl =
            payment.rawPayload?.orderCreateResponse?.approvalUrl;
          let errorMessage =
            "PayPal payment is still in created state. The user must complete the approval process on PayPal's website before finalizing the payment.";
          if (approvalUrl) {
            errorMessage += ` Please redirect the user to: ${approvalUrl}`;
          }
          throw new PaymentValidationError(errorMessage);
        }
      } else {
        throw new PaymentValidationError('Payment verification failed');
      }
    }

    // Calculate subscription expiry date using populated data
    const purchaseDate = payment.subscription.purchaseDate || new Date();
    const expiryDate = this.calculateEndDate(
      payment.subscription.duration,
      payment.subscription.planName.type,
      purchaseDate,
    );

    // Prepare payment update data
    const paymentUpdateData = this.preparePaymentUpdateData(
      payment,
      finalizeData,
      verificationResult,
    );

    // Execute transaction with retry logic for transient errors
    let result;
    const txStart = Date.now();
    try {
      result = await TransactionUtils.executeTransaction(async (session) => {
        // First, mark payment as processing to prevent concurrent finalization
        await Payment.findByIdAndUpdate(
          payment._id,
          { status: 'processing' },
          { session },
        );

        // Update payment status
        let savedPayment;
        try {
          savedPayment = await Payment.findByIdAndUpdate(
            payment._id,
            paymentUpdateData,
            {
              new: true,
              session,
            },
          ).lean(); // Use lean() to avoid triggering post hooks that might interfere
        } catch (updateError) {
          console.error(`Error updating payment status:`, {
            error: updateError.message,
            stack: updateError.stack,
          });
          throw updateError;
        }

        // Only activate subscription if payment was successfully captured
        let activatedSubscription = null;
        if (paymentUpdateData.status === 'captured') {
          activatedSubscription =
            await subscriptionService.activateSubscription(
              payment.subscription._id,
              expiryDate,
              correlationId,
              payment,
              session,
              { skipPostActivationTasks: true },
            );

          // Validate activatedSubscription before creating transaction logs
          if (!activatedSubscription || !activatedSubscription._id) {
            throw new Error(
              'Failed to activate subscription - subscription data is missing',
            );
          }
        } else {
          // Log that subscription was not activated due to payment status
          console.warn(
            `Subscription ${payment.subscription._id} not activated - payment status is ${paymentUpdateData.status}, not 'captured'`,
          );
        }

        // Batch create transaction logs
        const transactionLogs = [
          {
            entityId: payment._id.toString(),
            entityType: 'payment',
            action: 'payment_finalized',
            details: {
              provider: payment.provider,
              finalizeData: paymentUpdateData,
              providerOrderId: payment.providerOrderId,
              status: paymentUpdateData.status,
            },
            correlationId,
          },
        ];

        // Only add subscription activation log if subscription was actually activated
        if (activatedSubscription && activatedSubscription._id) {
          transactionLogs.push({
            entityId: activatedSubscription._id.toString(),
            entityType: 'subscription',
            action: 'activated',
            details: {
              expiryDate,
              paymentId: payment._id.toString(),
            },
            correlationId,
          });
        }

        await TransactionLog.insertMany(transactionLogs, {
          session,
          ordered: true,
        });

        // Finalize coupon usage if payment was successful
        if (paymentUpdateData.status === 'captured') {
          try {
            await couponFlowService.finalizeCouponUsage(
              payment.subscription._id,
              'captured',
              {
                paymentId: payment._id.toString(),
                providerOrderId: payment.providerOrderId,
                amount: paymentUpdateData.amount,
              },
              session, // Pass the session for atomic transaction
            );
          } catch (couponError) {
            // Log coupon finalization error but don't fail the payment
            console.error('Coupon finalization failed:', couponError);
            await TransactionLog.create(
              [
                {
                  entityId: payment._id.toString(),
                  entityType: 'payment',
                  action: 'coupon_finalization_failed',
                  details: {
                    error: couponError.message,
                    subscriptionId: payment.subscription._id,
                  },
                  correlationId,
                },
              ],
              { session },
            );
          }
        }

        // Note: Invoice generation moved outside transaction to prevent timeouts

        const transactionResult = {
          success: paymentUpdateData.status === 'captured',
          payment: savedPayment,
          subscription: activatedSubscription,
          invoice: null, // Will be generated outside transaction
          message:
            paymentUpdateData.status === 'captured'
              ? 'Payment finalized, subscription activated, and invoice generated successfully'
              : `Payment finalized with status: ${paymentUpdateData.status}. Subscription not activated.`,
        };

        // Manually update subscription payment reference after transaction commits
        // This is done outside the transaction to avoid hook interference
        if (
          savedPayment &&
          savedPayment.status === 'captured' &&
          savedPayment.subscription
        ) {
          setImmediate(async () => {
            try {
              await Subscription.findByIdAndUpdate(savedPayment.subscription, {
                $set: { payment: savedPayment._id },
              });
            } catch (err) {
              console.warn(
                'Failed to update subscription payment reference:',
                err?.message,
              );
            }
          });
        }

        return transactionResult;
      }, TransactionUtils.getRetryConfig('payment'));
    } catch (transactionError) {
      timings.transaction = Date.now() - txStart;
      timings.total = Date.now() - startTime;
      console.error(`Transaction execution failed:`, {
        error: transactionError.message,
        stack: transactionError.stack,
        code: transactionError.code,
        codeName: transactionError.codeName,
        timings,
      });
      throw transactionError;
    }
    timings.transaction = Date.now() - txStart;
    timings.total = Date.now() - startTime;

    // Log timing breakdown for performance monitoring
    console.log(`⏱️ Payment finalization timings (ms):`, timings);

    // Process heavy operations asynchronously (non-blocking) only if payment was successful
    if (result.success && result.subscription) {
      this.processPostPaymentTasks(result, correlationId).catch((error) => {
        console.error('Post-payment processing failed:', error);
      });
    }

    // Return immediately without waiting for heavy operations
    result.invoice = null; // Will be populated asynchronously

    return result;
  }

  /**
   * Process heavy post-payment tasks asynchronously
   * @param {Object} result - Payment result
   * @param {string} correlationId - Correlation ID for tracking
   */
  async processPostPaymentTasks(result, correlationId) {
    // First generate invoice, then dispatch notification with invoice link
    let invoiceData = null;

    try {
      invoiceData = await this.generateInvoiceAsync(result, correlationId);
    } catch (error) {
      console.error('Invoice generation failed:', error);
    }

    // Dispatch template-based notifications (replaces separate order confirmation email)
    // The notification template handles both in-app and email notifications
    try {
      const subscriptionId =
        typeof result.subscription === 'object'
          ? result.subscription?._id?.toString?.()
          : result.subscription;
      if (subscriptionId) {
        await subscriptionService.dispatchSubscriptionActivationNotification(
          subscriptionId,
          {
            payment: result.payment,
            correlationId,
            invoiceData, // Pass invoice data for email template
          },
        );
      }
    } catch (error) {
      console.error(
        'Subscription activation notification dispatch failed:',
        error,
      );
    }
  }

  /**
   * Generate invoice asynchronously with timeout
   * @param {Object} result - Payment result
   * @param {string} correlationId - Correlation ID
   */
  async generateInvoiceAsync(result, correlationId) {
    const timeout = 30000; // 30 seconds timeout

    return Promise.race([
      this.generateInvoiceWithRetry(result, correlationId),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('Invoice generation timeout')),
          timeout,
        ),
      ),
    ]);
  }

  /**
   * Generate invoice with retry logic
   * @param {Object} result - Payment result
   * @param {string} correlationId - Correlation ID
   */
  async generateInvoiceWithRetry(result, correlationId) {
    try {
      // Populate subscription data for invoice generation
      const populatedSubscription = await Subscription.findById(
        result.subscription._id,
      )
        .populate('planName')
        .populate('user');

      if (populatedSubscription) {
        const invoiceData = await invoiceService.generateAndUploadInvoice(
          populatedSubscription,
          result.payment,
        );

        // Log invoice generation
        if (result && result.subscription && result.subscription._id) {
          await TransactionLog.create([
            {
              entityId: result.subscription._id.toString(),
              entityType: 'subscription',
              action: 'invoice_generated',
              details: {
                invoiceNumber: invoiceData.invoiceNumber,
                pdfUrl: invoiceData.pdfUrl,
                cloudinaryId: invoiceData.cloudinaryId,
              },
              correlationId,
            },
          ]);
        }

        return invoiceData;
      }
    } catch (error) {
      // Log invoice generation error only if we have valid subscription data
      if (result && result.subscription && result.subscription._id) {
        await TransactionLog.create([
          {
            entityId: result.subscription._id.toString(),
            entityType: 'subscription',
            action: 'invoice_generation_failed',
            details: {
              error: error.message,
            },
            correlationId,
          },
        ]);
      }
      throw error;
    }
  }

  /**
   * Send confirmation emails asynchronously with timeout
   * @param {Object} payment - Payment document
   * @param {Object} subscription - Subscription document
   * @param {Object} invoiceData - Invoice data with download link
   */
  async sendConfirmationEmailsAsync(payment, subscription, invoiceData) {
    const timeout = 15000; // 15 seconds timeout

    return Promise.race([
      this.sendConfirmationEmails(payment, subscription, invoiceData),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Email sending timeout')), timeout),
      ),
    ]);
  }

  /**
   * Provider requirements map for finalize data validation
   */
  getProviderRequirements() {
    return {
      razorpay: ['providerPaymentId', 'signature'],
      paypal: ['payerId'],
      paystack: ['transactionRef'],
      flutterwave: ['transactionId'],
      square: ['paymentId'],
      braintree: ['transactionId'],
    };
  }

  /**
   * Validate finalize data based on provider requirements
   * @param {string} provider - Payment provider name
   * @param {Object} finalizeData - Finalize data to validate
   * @throws {PaymentValidationError} If validation fails
   */
  validateFinalizeData(provider, finalizeData) {
    const requirements = this.getProviderRequirements();
    const requiredFields = requirements[provider];

    if (!requiredFields) {
      throw new PaymentValidationError(
        `Unsupported payment provider: ${provider}`,
      );
    }

    const missingFields = requiredFields.filter(
      (field) =>
        !(field in finalizeData) ||
        finalizeData[field] === null ||
        finalizeData[field] === undefined ||
        finalizeData[field] === '',
    );

    if (missingFields.length > 0) {
      // Provide more specific error messages for different providers
      let errorMessage = `Missing required fields for ${provider}: ${missingFields.join(
        ', ',
      )}`;

      if (provider === 'paypal' && missingFields.includes('payerId')) {
        errorMessage +=
          ". For PayPal, the payerId is obtained from the approval URL after the user completes the payment approval process on PayPal's website.";
      } else if (
        provider === 'razorpay' &&
        missingFields.includes('providerPaymentId')
      ) {
        errorMessage +=
          '. For Razorpay, the providerPaymentId is obtained from the payment response after successful payment.';
      } else if (
        provider === 'razorpay' &&
        missingFields.includes('signature')
      ) {
        errorMessage +=
          '. For Razorpay, the signature is required for payment verification.';
      }

      throw new PaymentValidationError(errorMessage);
    }

    // Additional validation for specific providers
    if (provider === 'paypal') {
      this.validatePayPalFinalizeData(finalizeData);
    }
  }

  /**
   * Validate PayPal-specific finalize data
   * @param {Object} finalizeData - Finalize data to validate
   * @throws {PaymentValidationError} If validation fails
   */
  validatePayPalFinalizeData(finalizeData) {
    const { payerId } = finalizeData;

    if (!payerId || typeof payerId !== 'string' || payerId.trim() === '') {
      throw new PaymentValidationError(
        "PayPal payerId is required and must be a non-empty string. This is obtained from the approval URL after the user completes the payment approval process on PayPal's website.",
      );
    }

    // Validate payerId format (PayPal payerId is typically a string like "PAYER123456789")
    if (!/^[A-Z0-9]+$/.test(payerId)) {
      // PayPal payerId format may be invalid
    }
  }

  /**
   * Update payment record with finalize data
   * @param {Object} payment - Payment document
   * @param {Object} finalizeData - Finalize data
   * @param {Object} verificationResult - Verification result
   */
  updatePaymentWithFinalizeData(payment, finalizeData, verificationResult) {
    // Set status to captured
    payment.status = 'captured';

    // Store provider-specific payment ID based on provider
    const providerPaymentIdField = this.getProviderPaymentIdField(
      payment.provider,
    );
    if (providerPaymentIdField && finalizeData[providerPaymentIdField]) {
      payment.providerPaymentId = finalizeData[providerPaymentIdField];
    }

    // Update raw payload with finalize data and verification result
    payment.rawPayload = {
      ...payment.rawPayload,
      finalizeData,
      verificationResult,
    };
  }

  /**
   * Get the field name that contains the provider payment ID
   * @param {string} provider - Payment provider name
   * @returns {string} Field name for provider payment ID
   */
  getProviderPaymentIdField(provider) {
    const fieldMap = {
      razorpay: 'providerPaymentId',
      paypal: 'providerPaymentId',
      paystack: 'transactionRef',
      flutterwave: 'transactionId',
      square: 'paymentId',
      braintree: 'transactionId',
    };
    return fieldMap[provider];
  }

  /**
   * Verify payment with provider (optimized for parallel execution)
   * @param {Object} payment - Payment document
   * @param {Object} finalizeData - Finalize data
   * @returns {Promise<Object>} Verification result
   */
  async verifyPaymentWithProvider(payment, finalizeData) {
    const provider = await this.getProvider(payment.provider);
    return await provider.verifyPayment(payment, finalizeData);
  }

  /**
   * Prepare payment update data for optimized update
   * @param {Object} payment - Payment document
   * @param {Object} finalizeData - Finalize data
   * @param {Object} verificationResult - Verification result
   * @returns {Object} Update data for payment
   */
  preparePaymentUpdateData(payment, finalizeData, verificationResult) {
    // Only set status to 'captured' if verification was successful AND payment is captured
    // For Razorpay: check both success and captured fields
    // For PayPal: check success and status/captured fields
    // This prevents subscription activation for pending/failed payments
    let status = payment.status || 'pending';

    if (verificationResult && verificationResult.success === true) {
      // For Razorpay, check the captured field explicitly
      if (payment.provider === 'razorpay') {
        status =
          verificationResult.captured === true ? 'captured' : 'authorized';
      }
      // For PayPal, check if status indicates completion
      else if (payment.provider === 'paypal') {
        const paypalStatus =
          verificationResult.status || verificationResult.rawResponse?.state;
        if (
          paypalStatus === 'completed' ||
          paypalStatus === 'executed' ||
          verificationResult.captured === true
        ) {
          status = 'captured';
        } else {
          status = 'authorized';
        }
      }
      // For other providers, assume captured if success is true
      else {
        status =
          verificationResult.captured === true ||
          verificationResult.captured === undefined
            ? 'captured'
            : 'authorized';
      }
    }

    const updateData = {
      status,
      rawPayload: {
        ...payment.rawPayload,
        finalizeData,
        verificationResult,
      },
    };

    // Store provider-specific payment ID based on provider
    const providerPaymentIdField = this.getProviderPaymentIdField(
      payment.provider,
    );
    if (providerPaymentIdField && finalizeData[providerPaymentIdField]) {
      updateData.providerPaymentId = finalizeData[providerPaymentIdField];
    }

    return updateData;
  }

  /**
   * Process webhook from payment provider
   * @param {Object} payload - Webhook payload
   * @param {string} rawBody - Raw webhook body
   * @param {string} signature - Webhook signature
   * @param {string} provider - Provider name
   * @returns {Promise<Object>} Webhook processing response
   */
  async processWebhook(payload, rawBody, signature, provider) {
    if (!provider) {
      throw new PaymentValidationError(
        'Provider is required for webhook processing',
      );
    }

    const paymentProvider = await this.getProvider(provider);

    // Verify webhook signature
    if (!paymentProvider.verifyWebhookSignature(rawBody, signature)) {
      throw new PaymentValidationError('Invalid webhook signature');
    }

    // Process webhook using provider
    const result = await paymentProvider.processWebhook(
      payload,
      rawBody,
      signature,
    );

    if (result.processed && result.paymentId) {
      // Find payment by provider payment ID
      const payment = await Payment.findOne({
        $or: [
          { providerOrderId: result.paymentId },
          { providerPaymentId: result.paymentId },
        ],
        provider: provider,
      });

      if (payment && payment.status !== 'captured') {
        // Update payment status
        payment.status = result.status === 'captured' ? 'captured' : 'failed';
        payment.providerPaymentId = result.paymentId;
        payment.rawPayload = {
          ...payment.rawPayload,
          webhookPayload: payload,
        };

        // If payment was successful, activate subscription
        if (payment.status === 'captured') {
          const subscription = await Subscription.findById(
            payment.subscription,
          ).populate('planName');

          if (subscription) {
            const purchaseDate = subscription.purchaseDate || new Date();
            const expiryDate = this.calculateEndDate(
              subscription.duration,
              subscription.planName.type,
              purchaseDate,
            );

            const activatedSubscription =
              await subscriptionService.activateSubscription(
                String(payment.subscription),
                expiryDate,
                null,
              );

            // Finalize coupon usage for successful payment
            try {
              await couponFlowService.finalizeCouponUsage(
                String(payment.subscription),
                'captured',
                {
                  paymentId: payment._id.toString(),
                  providerOrderId: payment.providerOrderId,
                  amount: payment.amount,
                  webhookTriggered: true,
                },
              );
            } catch (couponError) {
              console.error(
                'Coupon finalization failed in webhook:',
                couponError,
              );
            }

            // Send confirmation emails after webhook-triggered activation
            try {
              await this.sendConfirmationEmails(payment, activatedSubscription);
            } catch (emailError) {
              // Log email error but don't fail the webhook process
              console.error(
                'Failed to send confirmation emails via webhook:',
                emailError,
              );
            }
          }
        } else if (payment.status === 'failed') {
          // Release coupon usage for failed payment
          try {
            await couponFlowService.finalizeCouponUsage(
              String(payment.subscription),
              'failed',
              {
                paymentId: payment._id.toString(),
                providerOrderId: payment.providerOrderId,
                amount: payment.amount,
                webhookTriggered: true,
              },
            );
          } catch (couponError) {
            console.error('Coupon release failed in webhook:', couponError);
          }
        }

        await payment.save();
      }
    }

    return result;
  }

  /**
   * Get payment by ID
   * @param {string} paymentId - Payment ID (MongoDB ObjectId or provider payment ID)
   * @returns {Promise<Object>} Payment details
   */
  async getPaymentById(paymentId) {
    if (!paymentId) {
      throw new PaymentValidationError('Payment ID is required');
    }

    const isObjectId = mongoose.isValidObjectId(paymentId);

    if (isObjectId) {
      // Search by MongoDB ObjectId
      return Payment.findById(paymentId).populate(
        'subscription user currencyId',
      );
    } else {
      // Search by provider payment ID (for PayPal, Razorpay, etc.)
      return Payment.findOne({
        $or: [{ providerOrderId: paymentId }, { providerPaymentId: paymentId }],
      }).populate('subscription user currencyId');
    }
  }

  /**
   * List payments by user
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} User payments
   */
  async listPaymentsByUser(userId, options = {}) {
    if (!mongoose.isValidObjectId(userId)) {
      throw new PaymentValidationError('Invalid userId');
    }

    const { limit = 50, skip = 0 } = options;

    return Payment.find()
      .populate({
        path: 'subscription',
        match: { user: userId },
        select: '_id user',
      })
      .populate(
        'currencyId',
        'currencyName currencyCode currencySymbol currencyPosition thousandSeparator decimalSeparator numberOfDecimals',
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
  }

  /**
   * Get available payment providers
   * @returns {Promise<Array>} Available providers
   */
  async getAvailableProviders() {
    const supportedProviders = this.orchestrator.getSupportedProviders();
    const availableProviders = [];

    for (const providerName of supportedProviders) {
      try {
        const provider = await this.getProvider(providerName);
        if (provider.isConfigured()) {
          availableProviders.push({
            name: providerName,
            displayName: this.getProviderDisplayName(providerName),
            publicCredentials: provider.getPublicCredentials(),
          });
        }
      } catch (error) {
        // Provider not configured, skip
      }
    }

    return availableProviders;
  }

  // Private helper methods

  async getCurrency(currencyId) {
    if (currencyId) {
      if (!mongoose.isValidObjectId(currencyId)) {
        throw new PaymentValidationError('Invalid currencyId');
      }
      const currency = await Currency.findOne({
        _id: currencyId,
        isDeleted: false,
      });
      if (!currency) {
        throw new PaymentValidationError('Currency not found');
      }
      return currency;
    }

    // Get primary currency as default
    let currency = await Currency.findOne({
      isPrimary: true,
      isDeleted: false,
    });
    if (!currency) {
      // If no primary currency exists, try to find any currency
      currency = await Currency.findOne({ isDeleted: false });
      if (!currency) {
        throw new PaymentValidationError(
          'No currencies found in database. Please create a currency first.',
        );
      }
      // Set the found currency as primary
      await Currency.findOneAndUpdate(
        { _id: currency._id, isDeleted: false },
        { isPrimary: true },
      );
      currency.isPrimary = true;
    }

    return currency;
  }

  async getProvider(providerName) {
    try {
      return await this.orchestrator.getProviderFromDB(providerName);
    } catch (error) {
      if (error instanceof PaymentConfigurationError) {
        throw error;
      }
      throw new PaymentProviderError(
        `Failed to get provider ${providerName}: ${error.message}`,
        providerName,
      );
    }
  }

  formatPaymentResponse(
    payment,
    provider,
    orderResponse = null,
    currency = null,
  ) {
    const publicCredentials = provider.getPublicCredentials();

    // Determine currency code
    let currencyCode = 'INR'; // Default fallback
    if (currency?.currencyCode) {
      currencyCode = currency.currencyCode;
    } else if (payment.currencyId?.currencyCode) {
      currencyCode = payment.currencyId.currencyCode;
    }

    const response = {
      provider: payment.provider,
      publicKey: publicCredentials.publicKey || publicCredentials.keyId,
      orderId: payment.providerOrderId,
      amount: payment.amount,
      currency: currencyCode,
      subscriptionId: String(payment.subscription),
      paymentId: String(payment._id),
      status: payment.status,
      createdAt: payment.createdAt,
    };

    // Add provider-specific fields if orderResponse exists
    if (orderResponse) {
      // Provider-specific field mappings
      const fieldMappings = {
        paypal: { approvalUrl: 'approvalUrl', clientId: 'clientId' },
        razorpay: { keyId: 'keyId', orderId: 'orderId' },
        paystack: { publicKey: 'publicKey', reference: 'reference' },
        flutterwave: { publicKey: 'publicKey', txRef: 'txRef' },
        square: { applicationId: 'applicationId', locationId: 'locationId' },
        braintree: { clientToken: 'clientToken', merchantId: 'merchantId' },
      };

      // Add mapped fields for current provider
      const mappings = fieldMappings[payment.provider] || {};
      Object.entries(mappings).forEach(([responseKey, orderResponseKey]) => {
        if (orderResponse[orderResponseKey]) {
          response[responseKey] = orderResponse[orderResponseKey];
        }
      });

      // Add common fields
      const commonFields = [
        'redirectUrl',
        'checkoutUrl',
        'paymentUrl',
        'authorizationUrl',
        'webhookUrl',
        'callbackUrl',
        'returnUrl',
        'cancelUrl',
        'merchantId',
        'apiKey',
        'environment',
        'mode',
        'sandbox',
      ];

      commonFields.forEach((field) => {
        if (orderResponse[field] && !response[field]) {
          response[field] = orderResponse[field];
        }
      });

      // Include provider data for debugging
      response.providerData = orderResponse;
    }

    return response;
  }

  calculateEndDate(duration, type, from = new Date()) {
    const durationValue = Number(duration);
    if (!Number.isInteger(durationValue) || durationValue <= 0) {
      throw new Error('Duration must be a positive integer');
    }

    let endDate = new Date(from);

    if (type === 'yearly') {
      endDate = addYears(endDate, durationValue);
    } else if (type === 'monthly') {
      endDate = addMonths(endDate, durationValue);
    } else if (type === 'daily') {
      endDate = addDays(endDate, durationValue);
    } else if (type === 'weekly') {
      endDate = addWeeks(endDate, durationValue);
    } else {
      throw new Error(`Unsupported plan type: ${type}`);
    }

    return endDate;
  }

  getProviderDisplayName(providerName) {
    const displayNames = {
      razorpay: 'Razorpay',
      paypal: 'PayPal',
    };
    return displayNames[providerName] || providerName;
  }

  /**
   * Send confirmation emails after successful payment
   * @param {Object} payment - Payment document
   * @param {Object} subscription - Activated subscription
   * @param {Object} invoiceData - Invoice data with download link
   */
  async sendConfirmationEmails(payment, subscription, invoiceData = null) {
    try {
      // Check if email service is configured
      const isEmailConfigured = await EmailService.isMailConfigured();
      if (!isEmailConfigured) {
        console.log(
          'Email service not configured, skipping confirmation emails',
        );
        return;
      }

      // Get user details from subscription (not payment)
      const user = await User.findById(subscription.user).lean();

      if (!user) {
        console.log('User not found in database, skipping confirmation emails');
        return;
      }

      if (!user.email) {
        console.log(
          'User found but no email address, skipping confirmation emails',
        );
        return;
      }

      // Get plan details
      const plan = await Plan.findById(subscription.planName).lean();
      if (!plan) {
        console.log('Plan not found, skipping confirmation emails');
        return;
      }

      // Get currency details
      const currency = await Currency.findOne({
        _id: payment.currencyId,
        isDeleted: false,
      }).lean();
      if (!currency) {
        console.log('Currency not found, skipping confirmation emails');
        return;
      }

      // Format data for email template
      const orderData = this.formatOrderDataForEmail(
        payment,
        subscription,
        plan,
        currency,
        user,
        invoiceData,
      );

      // Send order confirmation email with invoice download link
      const orderSubject = `Order Confirmation - ${plan.name} Subscription`;
      const orderHtml = EmailService.orderConfirmationTemplate(orderData);

      await EmailService.sendEmail(user.email, orderSubject, orderHtml);
      console.log('✅ Order confirmation email sent to:', user.email);
    } catch (error) {
      console.error('Error sending confirmation emails:', error);
      throw error;
    }
  }

  /**
   * Format order data for email template
   * @param {Object} payment - Payment document
   * @param {Object} subscription - Subscription document
   * @param {Object} plan - Plan document
   * @param {Object} currency - Currency document
   * @param {Object} user - User document
   * @param {Object} invoiceData - Invoice data with download link
   * @returns {Object} Formatted order data
   */
  formatOrderDataForEmail(
    payment,
    subscription,
    plan,
    currency,
    user,
    invoiceData = null,
  ) {
    return {
      customerName: user.name,
      customerEmail: user.email,
      orderId: payment.providerOrderId,
      planName: plan.name,
      planType: plan.type,
      duration: subscription.duration,
      amount: this.formatCurrencyAmount(payment.amount, currency),
      currencySymbol: currency.currencySymbol,
      currencyCode: currency.currencyCode,
      expiryDate: this.formatDate(subscription.expiryDate),
      paymentMethod: this.getPaymentMethodDisplayName(payment.provider),
      paymentId: payment.providerPaymentId || payment.providerOrderId,
      purchaseDate: this.formatDate(subscription.purchaseDate),
      invoiceDownloadUrl: invoiceData?.pdfUrl || null,
      invoiceNumber: invoiceData?.invoiceNumber || null,
    };
  }

  /**
   * Format currency amount based on currency settings
   * @param {number} amount - Amount in smallest currency unit
   * @param {Object} currency - Currency document
   * @returns {string} Formatted amount string
   */
  formatCurrencyAmount(amount, currency) {
    const {
      currencyPosition,
      thousandSeparator,
      decimalSeparator,
      numberOfDecimals,
    } = currency;

    // Convert from smallest currency unit to main unit
    const mainAmount = amount / Math.pow(10, numberOfDecimals || 2);

    // Format number with separators
    const formattedAmount = mainAmount
      .toLocaleString('en-US', {
        minimumFractionDigits: numberOfDecimals || 2,
        maximumFractionDigits: numberOfDecimals || 2,
      })
      .replace(/,/g, thousandSeparator || ',')
      .replace(/\./g, decimalSeparator || '.');

    return formattedAmount;
  }

  /**
   * Format date for display
   * @param {Date} date - Date to format
   * @returns {string} Formatted date string
   */
  formatDate(date) {
    if (!date) return 'N/A';

    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  /**
   * Get display name for payment method
   * @param {string} provider - Payment provider name
   * @returns {string} Display name for payment method
   */
  getPaymentMethodDisplayName(provider) {
    const displayNames = {
      razorpay: 'Razorpay',
      paypal: 'PayPal',
      paystack: 'Paystack',
      flutterwave: 'Flutterwave',
      square: 'Square',
      braintree: 'Braintree',
    };
    return displayNames[provider] || provider;
  }
}

export default UnifiedPaymentService;
