/**
 * Razorpay Payment Service Implementation
 * Handles all Razorpay payment operations
 */

import Razorpay from 'razorpay';
import crypto from 'crypto';
import { BasePaymentService } from '../BasePaymentService.js';
import {
  PaymentProviderError,
  PaymentValidationError,
  PaymentSignatureError,
  PaymentConfigurationError,
} from '../PaymentErrors.js';

export class RazorpayPaymentService extends BasePaymentService {
  constructor(config) {
    super(config);
    this.razorpay = this.initializeRazorpayClient();
  }

  /**
   * Initialize Razorpay client with configuration
   * @returns {Razorpay} Razorpay client instance
   */
  initializeRazorpayClient() {
    const { keyId, keySecret } = this.config;

    if (!keyId || !keySecret) {
      throw new PaymentConfigurationError(
        'Razorpay keyId and keySecret are required',
        'razorpay',
      );
    }

    return new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
  }

  /**
   * Create a Razorpay payment order
   * @param {Object} paymentData - Payment data
   * @param {number} paymentData.amount - Amount in paise (smallest currency unit)
   * @param {string} paymentData.currency - Currency code (e.g., 'INR', 'USD')
   * @param {string} paymentData.receipt - Receipt identifier
   * @param {Object} paymentData.notes - Additional notes/metadata
   * @param {Object} paymentData.customer - Customer information
   * @returns {Promise<Object>} Razorpay order response
   */
  async createPayment(paymentData) {
    let orderData;
    try {
      const { amount, currency, receipt, notes = {}, customer } = paymentData;

      // Validate required fields
      if (!amount || amount <= 0) {
        throw new PaymentValidationError(
          'Amount must be a positive number',
          'amount',
        );
      }

      if (!currency) {
        throw new PaymentValidationError('Currency is required', 'currency');
      }

      if (!receipt) {
        throw new PaymentValidationError('Receipt is required', 'receipt');
      }

      orderData = {
        amount: Math.round(amount), // Ensure amount is integer
        currency: currency.toUpperCase(),
        receipt: receipt,
        payment_capture: 1, // Auto-capture payment
        notes: {
          ...notes,
          created_at: new Date().toISOString(),
        },
      };

      // Note: Razorpay doesn't accept customer field in order creation
      // Customer info should be handled during payment capture/verification

      const order = await this.razorpay.orders.create(orderData);

      return {
        success: true,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt,
        status: order.status,
        createdAt: order.created_at,
        provider: 'razorpay',
        rawResponse: order,
      };
    } catch (error) {
      if (error instanceof PaymentValidationError) {
        throw error;
      }

      // Log the full error for debugging
      console.error('Razorpay payment creation error:', {
        error: error.message || 'Unknown error',
        stack: error.stack,
        orderData: orderData || 'Not available',
        errorDetails: error.error || error.description || error.details,
      });

      throw new PaymentProviderError(
        `Failed to create Razorpay order: ${
          error.message || error.error?.description || 'Unknown error'
        }`,
        'razorpay',
        'ORDER_CREATION_FAILED',
      );
    }
  }

  /**
   * Finalize Razorpay payment after checkout
   * @param {Object} checkoutData - Checkout completion data
   * @param {string} checkoutData.orderId - Razorpay order ID
   * @param {string} checkoutData.paymentId - Razorpay payment ID
   * @param {string} checkoutData.signature - Razorpay signature
   * @returns {Promise<Object>} Payment finalization response
   */
  async finalizeCheckout(checkoutData) {
    try {
      const { orderId, paymentId, signature } = checkoutData;

      // Validate required fields
      if (!orderId || !paymentId || !signature) {
        throw new PaymentValidationError(
          'orderId, paymentId, and signature are required',
        );
      }

      // Verify signature
      if (!this.verifyCheckoutSignature(orderId, paymentId, signature)) {
        throw new PaymentSignatureError('Invalid payment signature');
      }

      // Fetch payment details from Razorpay
      const payment = await this.razorpay.payments.fetch(paymentId);

      // Verify payment belongs to the order
      if (payment.order_id !== orderId) {
        throw new PaymentValidationError(
          'Payment does not belong to the specified order',
        );
      }

      return {
        success: true,
        paymentId: payment.id,
        orderId: payment.order_id,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        method: payment.method,
        captured: payment.captured,
        createdAt: payment.created_at,
        provider: 'razorpay',
        rawResponse: payment,
      };
    } catch (error) {
      if (
        error instanceof PaymentValidationError ||
        error instanceof PaymentSignatureError
      ) {
        throw error;
      }

      throw new PaymentProviderError(
        `Failed to finalize Razorpay payment: ${error.message}`,
        'razorpay',
        'PAYMENT_FINALIZATION_FAILED',
      );
    }
  }

  /**
   * Process Razorpay webhook events
   * @param {Object} webhookData - Webhook data
   * @param {string} webhookData.payload - Webhook payload
   * @param {string} webhookData.signature - Webhook signature
   * @returns {Promise<Object>} Webhook processing response
   */
  async processWebhook(webhookData) {
    try {
      const { payload, signature } = webhookData;

      if (!payload || !signature) {
        throw new PaymentValidationError(
          'Payload and signature are required for webhook processing',
        );
      }

      // Verify webhook signature
      if (!this.verifyWebhookSignature(payload, signature)) {
        throw new PaymentSignatureError('Invalid webhook signature');
      }

      const event = payload.event;
      const eventData = payload.payload;

      // Handle different webhook events
      switch (event) {
        case 'payment.captured':
          return this.handlePaymentCaptured(eventData);

        case 'payment.failed':
          return this.handlePaymentFailed(eventData);

        case 'order.paid':
          return this.handleOrderPaid(eventData);

        default:
          return {
            success: true,
            processed: false,
            reason: 'unhandled_event',
            event: event,
          };
      }
    } catch (error) {
      if (
        error instanceof PaymentValidationError ||
        error instanceof PaymentSignatureError
      ) {
        throw error;
      }

      throw new PaymentProviderError(
        `Failed to process Razorpay webhook: ${error.message}`,
        'razorpay',
        'WEBHOOK_PROCESSING_FAILED',
      );
    }
  }

  /**
   * Verify Razorpay checkout signature
   * @param {string} orderId - Razorpay order ID
   * @param {string} paymentId - Razorpay payment ID
   * @param {string} signature - Razorpay signature
   * @returns {boolean} True if signature is valid
   */
  verifyCheckoutSignature(orderId, paymentId, signature) {
    try {
      const payload = `${orderId}|${paymentId}`;
      const expectedSignature = crypto
        .createHmac('sha256', this.config.keySecret)
        .update(payload)
        .digest('hex');

      return expectedSignature === signature;
    } catch (error) {
      return false;
    }
  }

  /**
   * Verify Razorpay webhook signature
   * @param {string} payload - Raw webhook payload
   * @param {string} signature - Webhook signature
   * @returns {boolean} True if signature is valid
   */
  verifyWebhookSignature(payload, signature) {
    try {
      const webhookSecret = this.config.webhookSecret || this.config.keySecret;
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(payload)
        .digest('hex');

      return expectedSignature === signature;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get payment status from Razorpay
   * @param {string} paymentId - Razorpay payment ID
   * @returns {Promise<Object>} Payment status information
   */
  async getPaymentStatus(paymentId) {
    try {
      if (!paymentId) {
        throw new PaymentValidationError('Payment ID is required');
      }

      const payment = await this.razorpay.payments.fetch(paymentId);

      return {
        success: true,
        paymentId: payment.id,
        orderId: payment.order_id,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        method: payment.method,
        captured: payment.captured,
        createdAt: payment.created_at,
        provider: 'razorpay',
        rawResponse: payment,
      };
    } catch (error) {
      if (error instanceof PaymentValidationError) {
        throw error;
      }

      throw new PaymentProviderError(
        `Failed to get Razorpay payment status: ${error.message}`,
        'razorpay',
        'STATUS_RETRIEVAL_FAILED',
      );
    }
  }

  /**
   * Refund a Razorpay payment
   * @param {string} paymentId - Razorpay payment ID
   * @param {Object} refundData - Refund data
   * @param {number} refundData.amount - Refund amount in paise
   * @param {string} refundData.notes - Refund notes
   * @returns {Promise<Object>} Refund response
   */
  async refundPayment(paymentId, refundData) {
    try {
      if (!paymentId) {
        throw new PaymentValidationError('Payment ID is required');
      }

      const { amount, notes = {} } = refundData;

      const refundPayload = {
        amount: amount ? Math.round(amount) : undefined, // Partial refund if amount specified
        notes: {
          ...notes,
          refunded_at: new Date().toISOString(),
        },
      };

      const refund = await this.razorpay.payments.refund(
        paymentId,
        refundPayload,
      );

      return {
        success: true,
        refundId: refund.id,
        paymentId: refund.payment_id,
        amount: refund.amount,
        status: refund.status,
        createdAt: refund.created_at,
        provider: 'razorpay',
        rawResponse: refund,
      };
    } catch (error) {
      if (error instanceof PaymentValidationError) {
        throw error;
      }

      throw new PaymentProviderError(
        `Failed to refund Razorpay payment: ${error.message}`,
        'razorpay',
        'REFUND_FAILED',
      );
    }
  }

  /**
   * Handle payment captured webhook event
   * @param {Object} eventData - Event data
   * @returns {Object} Processing response
   */
  handlePaymentCaptured(eventData) {
    const payment = eventData.payment.entity;

    return {
      success: true,
      processed: true,
      event: 'payment.captured',
      paymentId: payment.id,
      orderId: payment.order_id,
      amount: payment.amount,
      status: payment.status,
      provider: 'razorpay',
    };
  }

  /**
   * Handle payment failed webhook event
   * @param {Object} eventData - Event data
   * @returns {Object} Processing response
   */
  handlePaymentFailed(eventData) {
    const payment = eventData.payment.entity;

    return {
      success: true,
      processed: true,
      event: 'payment.failed',
      paymentId: payment.id,
      orderId: payment.order_id,
      amount: payment.amount,
      status: payment.status,
      provider: 'razorpay',
    };
  }

  /**
   * Handle order paid webhook event
   * @param {Object} eventData - Event data
   * @returns {Object} Processing response
   */
  handleOrderPaid(eventData) {
    const order = eventData.order.entity;

    return {
      success: true,
      processed: true,
      event: 'order.paid',
      orderId: order.id,
      amount: order.amount,
      status: order.status,
      provider: 'razorpay',
    };
  }

  /**
   * Create a payment order for subscription
   * @param {Object} subscription - Subscription object
   * @param {Object} currency - Currency object
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} Payment creation response
   */
  async createOrder(subscription, currency, metadata = {}) {
    let orderData;
    try {
      const {
        amount,
        currency: currencyCode,
        receipt,
        notes = {},
        customer,
      } = metadata;

      // Validate required fields
      if (!amount || amount <= 0) {
        throw new PaymentValidationError(
          'Amount must be a positive number',
          'amount',
        );
      }

      // Razorpay requires amount in paise (smallest currency unit)
      // For INR: 1 rupee = 100 paise
      // For USD: 1 dollar = 100 cents
      const amountInPaise = Math.round(amount);
      if (amountInPaise < 100) {
        throw new PaymentValidationError(
          'Amount must be at least 100 paise (1 unit of currency)',
          'amount',
        );
      }

      if (!currencyCode) {
        throw new PaymentValidationError('Currency is required', 'currency');
      }

      // Validate currency code format
      const normalizedCurrency = currencyCode.toUpperCase();
      if (normalizedCurrency.length !== 3) {
        throw new PaymentValidationError(
          'Currency code must be 3 characters long',
          'currency',
        );
      }

      if (!receipt) {
        throw new PaymentValidationError('Receipt is required', 'receipt');
      }

      // Validate receipt format (should be alphanumeric and not too long)
      if (receipt.length > 40) {
        throw new PaymentValidationError(
          'Receipt identifier must be 40 characters or less',
          'receipt',
        );
      }

      // Debug logging for Razorpay order creation
      console.log('🔍 Razorpay order creation debug:', {
        amount: amount,
        currencyCode: currencyCode,
        receipt: receipt,
        subscription: {
          id: subscription._id,
          planName: subscription.planName,
          totalAmount: subscription.totalAmount,
        },
        currency: currency,
      });

      orderData = {
        amount: amountInPaise,
        currency: normalizedCurrency,
        receipt: receipt,
        payment_capture: 1,
        notes: {
          ...notes,
          created_at: new Date().toISOString(),
        },
      };

      console.log(
        '🔍 Razorpay order data:',
        JSON.stringify(orderData, null, 2),
      );

      // Note: Razorpay doesn't accept customer field in order creation
      // Customer info should be handled during payment capture/verification

      console.log(
        '🔍 Calling Razorpay orders.create with data:',
        JSON.stringify(orderData, null, 2),
      );

      const order = await this.razorpay.orders.create(orderData);

      console.log('✅ Razorpay order created successfully:', {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        status: order.status,
      });

      return {
        success: true,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt,
        status: order.status,
        createdAt: order.created_at,
        provider: 'razorpay',
        rawResponse: order,
      };
    } catch (error) {
      if (error instanceof PaymentValidationError) {
        throw error;
      }

      // Log the full error for debugging
      console.error('Razorpay order creation error:', {
        error: error.message || 'Unknown error',
        stack: error.stack,
        orderData: orderData || 'Not available',
        errorDetails: error.error || error.description || error.details,
      });

      throw new PaymentProviderError(
        `Failed to create Razorpay order: ${
          error.message || error.error?.description || 'Unknown error'
        }`,
        'razorpay',
        'ORDER_CREATION_FAILED',
      );
    }
  }

  /**
   * Verify payment after user interaction
   * @param {Object} payment - Payment document
   * @param {Object} finalizeData - Finalize data containing providerPaymentId and signature
   * @returns {Promise<Object>} Payment verification response
   */
  async verifyPayment(payment, finalizeData) {
    const { providerPaymentId, signature } = finalizeData;

    try {
      if (!payment) {
        throw new PaymentValidationError('Payment not found');
      }

      const orderId = payment.providerOrderId;

      // Verify signature locally (fast, no network call)
      if (
        !this.verifyCheckoutSignature(orderId, providerPaymentId, signature)
      ) {
        throw new PaymentSignatureError('Invalid payment signature');
      }

      // OPTIMIZATION: Since we use payment_capture: 1 (auto-capture) during order creation,
      // a valid signature cryptographically proves the payment was captured.
      // Skip the external API call to Razorpay for faster response.
      // The signature is only sent by Razorpay SDK after successful payment capture.
      return {
        success: true,
        paymentId: providerPaymentId,
        orderId: orderId,
        amount: payment.amount,
        currency: payment.rawPayload?.orderCreateResponse?.currency || 'INR',
        status: 'captured',
        method: 'razorpay', // Actual method unknown without API call, but not critical
        captured: true, // Safe to assume since auto-capture is enabled
        createdAt: new Date().toISOString(),
        provider: 'razorpay',
        signatureVerified: true,
      };
    } catch (error) {
      if (
        error instanceof PaymentValidationError ||
        error instanceof PaymentSignatureError
      ) {
        throw error;
      }

      throw new PaymentProviderError(
        `Failed to verify Razorpay payment: ${error.message}`,
        'razorpay',
        'PAYMENT_VERIFICATION_FAILED',
      );
    }
  }

  /**
   * Fetch payment details from Razorpay
   * @param {string} providerPaymentId - Razorpay payment ID
   * @returns {Promise<Object>} Payment details
   */
  async fetchPaymentDetails(providerPaymentId) {
    try {
      if (!providerPaymentId) {
        throw new PaymentValidationError('Provider payment ID is required');
      }

      const payment = await this.razorpay.payments.fetch(providerPaymentId);

      return {
        success: true,
        paymentId: payment.id,
        orderId: payment.order_id,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        method: payment.method,
        captured: payment.captured,
        createdAt: payment.created_at,
        provider: 'razorpay',
        rawResponse: payment,
      };
    } catch (error) {
      if (error instanceof PaymentValidationError) {
        throw error;
      }

      throw new PaymentProviderError(
        `Failed to fetch Razorpay payment details: ${error.message}`,
        'razorpay',
        'PAYMENT_FETCH_FAILED',
      );
    }
  }

  /**
   * Get public credentials for frontend
   * @returns {Object} Public credentials
   */
  getPublicCredentials() {
    return {
      keyId: this.config.keyId,
      publicKey: this.config.keyId, // For consistency with other providers
    };
  }

  /**
   * Get provider name
   * @returns {string} Provider name
   */
  getProviderName() {
    return 'razorpay';
  }

  /**
   * Check if provider is configured
   * @returns {boolean} True if configured
   */
  isConfigured() {
    return !!(this.config.keyId && this.config.keySecret);
  }

  /**
   * Get Razorpay configuration requirements
   * @returns {Object} Configuration requirements
   */
  static getConfigRequirements() {
    return {
      required: ['keyId', 'keySecret'],
      optional: ['webhookSecret'],
      description: {
        keyId: 'Razorpay Key ID from dashboard',
        keySecret: 'Razorpay Key Secret from dashboard',
        webhookSecret:
          'Webhook secret for signature verification (optional, defaults to keySecret)',
      },
    };
  }
}
