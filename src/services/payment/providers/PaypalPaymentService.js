/**
 * PayPal Payment Service Implementation
 * Handles all PayPal payment operations using PayPal v2 REST API
 *
 * Note: This implementation uses PayPal v2 API with axios for HTTP requests
 */

import axios from 'axios';
import { BasePaymentService } from '../BasePaymentService.js';
import {
  PaymentProviderError,
  PaymentValidationError,
  PaymentSignatureError,
  PaymentConfigurationError,
} from '../PaymentErrors.js';

export class PaypalPaymentService extends BasePaymentService {
  constructor(config) {
    super(config);
    this.client = this.initializePaypalClient();
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  /**
   * Initialize PayPal client with configuration
   * @returns {Object} PayPal axios client instance or null if not configured
   */
  initializePaypalClient() {
    const { clientId, clientSecret, mode = 'sandbox' } = this.config;

    console.log('PayPal Config:', {
      mode,
      clientId: clientId ? `${clientId.slice(0, 10)}...` : 'MISSING',
      clientSecret: clientSecret ? 'SET' : 'MISSING',
    });

    if (!clientId || !clientSecret) {
      return null;
    }

    return this.createPaypalClient({ clientId, clientSecret, mode });
  }

  /**
   * Create PayPal axios client instance
   * @param {string} clientId - PayPal client ID
   * @param {string} clientSecret - PayPal client secret
   * @param {string} mode - 'sandbox' or 'live'
   * @returns {Object} Axios instance configured for PayPal API
   */
  createPaypalClient({ clientId, clientSecret, mode = 'sandbox' }) {
    const baseURL =
      mode === 'live'
        ? 'https://api-m.paypal.com'
        : 'https://api-m.sandbox.paypal.com';

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    return axios.create({
      baseURL,
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Get OAuth access token for PayPal v2 API
   * @returns {Promise<string>} Access token
   */
  async getAccessToken() {
    // Return cached token if still valid (with 5 minute buffer)
    if (
      this.accessToken &&
      this.tokenExpiry &&
      Date.now() < this.tokenExpiry - 300000
    ) {
      return this.accessToken;
    }

    if (!this.client) {
      throw new PaymentConfigurationError(
        'PayPal is not properly configured. Please provide client credentials.',
        'paypal',
      );
    }

    try {
      const response = await this.client.post(
        '/v1/oauth2/token',
        'grant_type=client_credentials',
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      if (!response.data || !response.data.access_token) {
        throw new PaymentConfigurationError(
          'Failed to obtain PayPal access token',
          'paypal',
        );
      }

      this.accessToken = response.data.access_token;
      // Set expiry (PayPal tokens typically last 9 hours, but we'll refresh after 8 hours)
      this.tokenExpiry =
        Date.now() + (response.data.expires_in * 1000 || 8 * 60 * 60 * 1000);

      return this.accessToken;
    } catch (error) {
      throw new PaymentProviderError(
        `Failed to get PayPal access token: ${error.message}`,
        'paypal',
        'OAUTH_FAILED',
      );
    }
  }

  /**
   * Make authenticated request to PayPal API
   * @param {string} method - HTTP method
   * @param {string} url - API endpoint
   * @param {Object} data - Request data
   * @returns {Promise<Object>} API response
   */
  async makeAuthenticatedRequest(method, url, data = null) {
    const token = await this.getAccessToken();

    const config = {
      method,
      url,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    };

    if (data) {
      config.data = data;
    }

    try {
      const response = await this.client.request(config);
      return response.data;
    } catch (error) {
      if (error.response) {
        const errorMessage =
          error.response.data?.message ||
          error.response.data?.error_description ||
          error.message;
        throw new PaymentProviderError(
          `PayPal API error: ${errorMessage}`,
          'paypal',
          'API_ERROR',
        );
      }
      throw error;
    }
  }

  /**
   * Create a PayPal payment
   * @param {Object} subscription - Subscription object
   * @param {Object} currency - Currency object
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} Payment creation response
   */
  async createOrder(subscription, currency, metadata = {}) {
    if (!this.client) {
      throw new PaymentConfigurationError(
        'PayPal is not properly configured. Please provide client credentials.',
        'paypal',
      );
    }

    try {
      const {
        amount,
        currency: currencyCode,
        receipt,
        notes = {},
        customer,
        returnUrl,
        cancelUrl,
      } = metadata;

      // Validate required fields
      if (!amount || amount <= 0) {
        throw new PaymentValidationError(
          'Amount must be a positive number',
          'amount',
        );
      }

      // PayPal requires minimum amount of $0.01 (1 cent)
      const amountInDollars = amount / 100;
      if (amountInDollars < 0.01) {
        throw new PaymentValidationError(
          'Amount must be at least $0.01 (1 cent)',
          'amount',
        );
      }

      if (!currencyCode) {
        throw new PaymentValidationError('Currency is required', 'currency');
      }

      // PayPal supports specific currencies - validate currency code
      const supportedCurrencies = [
        'USD',
        'EUR',
        'GBP',
        'CAD',
        'AUD',
        'JPY',
        'CHF',
        'HKD',
        'SGD',
        'SEK',
        'DKK',
        'PLN',
        'NOK',
        'CZK',
        'HUF',
        'ILS',
        'MXN',
        'BRL',
        'MYR',
        'PHP',
        'TWD',
        'THB',
        'TRY',
        'RUB',
        'INR',
      ];

      if (!supportedCurrencies.includes(currencyCode.toUpperCase())) {
        console.warn(
          `Currency ${currencyCode} may not be supported by PayPal. Supported currencies: ${supportedCurrencies.join(
            ', ',
          )}`,
        );
      }

      if (!receipt) {
        throw new PaymentValidationError('Receipt is required', 'receipt');
      }

      // Ensure we have proper redirect URLs
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const finalReturnUrl = returnUrl || `${baseUrl}/payment-success`;
      const finalCancelUrl = cancelUrl || `${baseUrl}/payment-failed`;

      // PayPal v2 API order configuration
      const orderConfig = {
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: receipt,
            description: `Payment for subscription: ${
              subscription.planName?.name ||
              subscription.planName?.planName ||
              'Plan'
            }`,
            invoice_id: receipt,
            custom_id: receipt,
            amount: {
              currency_code: currencyCode.toUpperCase(),
              value: (amount / 100).toFixed(2), // Convert from cents to dollars
              breakdown: {
                item_total: {
                  currency_code: currencyCode.toUpperCase(),
                  value: (amount / 100).toFixed(2),
                },
              },
            },
            items: [
              {
                name: `Subscription - ${
                  subscription.planName?.name ||
                  subscription.planName?.planName ||
                  'Plan'
                }`,
                sku: receipt,
                unit_amount: {
                  currency_code: currencyCode.toUpperCase(),
                  value: (amount / 100).toFixed(2),
                },
                quantity: '1',
              },
            ],
          },
        ],
        application_context: {
          brand_name: 'POS-SUBSCRIPTION',
          landing_page: 'NO_PREFERENCE',
          user_action: 'PAY_NOW',
          return_url: finalReturnUrl,
          cancel_url: finalCancelUrl,
        },
      };

      // Add note to payer if provided
      if (notes.description) {
        orderConfig.purchase_units[0].soft_descriptor = notes.description;
      }

      // Validate order configuration
      if (
        !orderConfig.application_context.return_url ||
        !orderConfig.application_context.cancel_url
      ) {
        throw new PaymentValidationError(
          'Return URL and Cancel URL are required for PayPal payments',
        );
      }

      if (
        !orderConfig.purchase_units ||
        orderConfig.purchase_units.length === 0
      ) {
        throw new PaymentValidationError(
          'At least one purchase unit is required',
        );
      }

      const purchaseUnit = orderConfig.purchase_units[0];
      if (
        !purchaseUnit.amount ||
        !purchaseUnit.amount.value ||
        !purchaseUnit.amount.currency_code
      ) {
        throw new PaymentValidationError(
          'Purchase unit amount and currency are required',
        );
      }

      // Create order using PayPal v2 API
      const order = await this.makeAuthenticatedRequest(
        'POST',
        '/v2/checkout/orders',
        orderConfig,
      );

      // Validate order response
      if (!order) {
        throw new PaymentProviderError(
          'PayPal returned null order object',
          'paypal',
          'INVALID_ORDER_RESPONSE',
        );
      }

      if (!order.links || !Array.isArray(order.links)) {
        console.error('PayPal order missing or invalid links array:', {
          orderId: order.id,
          status: order.status,
          links: order.links,
        });
        throw new PaymentProviderError(
          'PayPal order response missing links array',
          'paypal',
          'MISSING_ORDER_LINKS',
        );
      }

      // Find approval URL - in v2 API, it's the link with rel='approve'
      const approvalLink = order.links?.find((link) => link.rel === 'approve');

      // Validate that approval URL exists
      if (!approvalLink || !approvalLink.href) {
        console.error('PayPal order missing approval URL:', {
          orderId: order.id,
          status: order.status,
          links: order.links,
          availableLinkRels: order.links?.map((link) => link.rel),
        });

        throw new PaymentProviderError(
          'PayPal order created but approval URL is missing. This is required for user approval. Available links: ' +
            (order.links?.map((link) => link.rel).join(', ') || 'none'),
          'paypal',
          'MISSING_APPROVAL_URL',
        );
      }

      // Validate order status - should be 'CREATED' for approval flow
      if (order.status !== 'CREATED') {
        console.error('PayPal order in unexpected status:', {
          orderId: order.id,
          expectedStatus: 'CREATED',
          actualStatus: order.status,
        });

        throw new PaymentProviderError(
          `PayPal order is in unexpected status: ${order.status}. Expected 'CREATED' status for approval flow.`,
          'paypal',
          'INVALID_ORDER_STATUS',
        );
      }

      // Map v2 status to v1-compatible status for backward compatibility
      const statusMap = {
        CREATED: 'created',
        SAVED: 'created',
        APPROVED: 'approved',
        VOIDED: 'cancelled',
        COMPLETED: 'completed',
      };

      return {
        success: true,
        orderId: order.id,
        amount: Math.round(amount),
        currency: currencyCode.toUpperCase(),
        status: statusMap[order.status] || order.status.toLowerCase(),
        approvalUrl: approvalLink.href,
        createdAt: new Date().toISOString(),
        provider: 'paypal',
        rawResponse: order,
      };
    } catch (error) {
      if (
        error instanceof PaymentValidationError ||
        error instanceof PaymentConfigurationError ||
        error instanceof PaymentProviderError
      ) {
        throw error;
      }

      throw new PaymentProviderError(
        `Failed to create PayPal order: ${error.message}`,
        'paypal',
        'PAYMENT_CREATION_FAILED',
      );
    }
  }

  /**
   * Execute PayPal payment after user approval (capture order)
   * @param {Object} payment - Payment document containing providerOrderId
   * @param {Object} finalizeData - Finalize data (payerId not needed in v2, but kept for compatibility)
   * @returns {Promise<Object>} Payment execution response
   */
  async verifyPayment(payment, finalizeData) {
    // Use the providerOrderId from the payment record
    const orderId = payment.providerOrderId;

    if (!this.client) {
      throw new PaymentConfigurationError(
        'PayPal is not properly configured. Please provide client credentials.',
        'paypal',
      );
    }

    try {
      if (!orderId) {
        throw new PaymentValidationError(
          'Provider Order ID is required for PayPal payment capture',
        );
      }

      // Get order details first to check status
      const orderDetails = await this.getPaymentDetailsOnce(orderId);

      // Map v2 status to v1-compatible status
      const statusMap = {
        CREATED: 'created',
        SAVED: 'created',
        APPROVED: 'approved',
        VOIDED: 'cancelled',
        COMPLETED: 'completed',
      };

      const mappedStatus =
        statusMap[orderDetails.status] || orderDetails.status.toLowerCase();

      // If order is already completed, return the existing order details
      if (['approved', 'completed', 'executed'].includes(mappedStatus)) {
        const purchaseUnit = orderDetails.purchase_units?.[0];
        const amount = purchaseUnit?.amount;
        const amountInCents = Math.round(parseFloat(amount?.value || 0) * 100);

        return {
          success: true,
          paymentId: orderDetails.id,
          amount: amountInCents,
          currency: amount?.currency_code || 'USD',
          status: mappedStatus,
          method: 'paypal',
          captured: mappedStatus === 'completed' || mappedStatus === 'approved',
          createdAt: new Date().toISOString(),
          provider: 'paypal',
          rawResponse: orderDetails,
        };
      }

      // Only proceed with capture if order is in 'APPROVED' state
      // In v2 API, orders go from CREATED -> APPROVED (after user approval) -> COMPLETED (after capture)
      if (
        orderDetails.status !== 'APPROVED' &&
        orderDetails.status !== 'CREATED'
      ) {
        throw new PaymentValidationError(
          `Order is in status '${orderDetails.status}' and cannot be captured. Expected 'APPROVED' or 'CREATED' status.`,
        );
      }

      // Capture the order using PayPal v2 API
      // No payer_id needed in v2 - the order is already approved
      const captureResult = await this.makeAuthenticatedRequest(
        'POST',
        `/v2/checkout/orders/${orderId}/capture`,
        {},
      );

      // Extract payment information from capture result
      const purchaseUnit = captureResult.purchase_units?.[0];
      const capture = purchaseUnit?.payments?.captures?.[0];
      const amount = purchaseUnit?.amount || capture?.amount;
      const amountInCents = Math.round(parseFloat(amount?.value || 0) * 100);

      // Map v2 status
      const captureStatus = captureResult.status || capture?.status;
      const mappedCaptureStatus =
        statusMap[captureStatus] || captureStatus?.toLowerCase();

      return {
        success: true,
        paymentId: captureResult.id || orderId,
        amount: amountInCents,
        currency: amount?.currency_code || 'USD',
        status: mappedCaptureStatus,
        method: 'paypal',
        captured: captureStatus === 'COMPLETED' || captureStatus === 'APPROVED',
        createdAt: new Date().toISOString(),
        provider: 'paypal',
        rawResponse: captureResult,
      };
    } catch (error) {
      if (
        error instanceof PaymentValidationError ||
        error instanceof PaymentConfigurationError ||
        error instanceof PaymentProviderError
      ) {
        throw error;
      }

      // Handle specific PayPal v2 API errors
      if (error.response?.data) {
        const errorDetails = error.response.data;
        const errorName = errorDetails.name;
        const errorMessage = errorDetails.message || error.message;

        if (errorName === 'INSTRUMENT_DECLINED') {
          throw new PaymentValidationError(
            'Payment was declined by the user. Please try again with a different payment method.',
          );
        }

        if (errorName === 'PAYER_CANNOT_PAY') {
          throw new PaymentValidationError(
            'The payer cannot pay for this transaction. Please try again or use a different payment method.',
          );
        }

        if (errorName === 'ORDER_NOT_APPROVED') {
          throw new PaymentValidationError(
            'Order has not been approved by the user. Please ensure the user completes the approval process.',
          );
        }
      }

      throw new PaymentProviderError(
        `Failed to capture PayPal order: ${error.message}`,
        'paypal',
        'PAYMENT_EXECUTION_FAILED',
      );
    }
  }

  /**
   * Check PayPal order state with retry mechanism (v2 API)
   * @param {string} orderId - PayPal order ID
   * @param {number} maxRetries - Maximum number of retries
   * @param {number} retryDelay - Delay between retries in milliseconds
   * @returns {Promise<Object>} Order details
   */
  async checkPaymentStateWithRetry(orderId, maxRetries = 3, retryDelay = 2000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const orderDetails = await this.getPaymentDetailsOnce(orderId);

        // In v2 API, check for APPROVED or COMPLETED status
        if (
          orderDetails.status === 'APPROVED' ||
          orderDetails.status === 'COMPLETED'
        ) {
          return orderDetails;
        }

        // If not approved/completed and this is not the last attempt, wait and retry
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
          continue;
        }

        // Last attempt failed, throw error with detailed state information
        throw this.createPaymentStateError(orderDetails);
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }
  }

  /**
   * Get PayPal order details once (v2 API)
   * @param {string} orderId - PayPal order ID
   * @returns {Promise<Object>} Order details
   */
  async getPaymentDetailsOnce(orderId) {
    if (!this.client) {
      throw new PaymentConfigurationError(
        'PayPal is not properly configured. Please provide client credentials.',
        'paypal',
      );
    }

    try {
      if (!orderId) {
        throw new PaymentValidationError('Order ID is required');
      }

      const orderDetails = await this.makeAuthenticatedRequest(
        'GET',
        `/v2/checkout/orders/${orderId}`,
      );

      return orderDetails;
    } catch (error) {
      if (
        error instanceof PaymentValidationError ||
        error instanceof PaymentConfigurationError
      ) {
        throw error;
      }

      throw new PaymentProviderError(
        `Failed to retrieve PayPal order: ${error.message}`,
        'paypal',
        'PAYMENT_RETRIEVAL_FAILED',
      );
    }
  }

  /**
   * Create appropriate error based on payment state (v2 API)
   * @param {Object} orderDetails - PayPal order details
   * @returns {PaymentValidationError} Appropriate error
   */
  createPaymentStateError(orderDetails) {
    // Find the approval URL from the order links (v2 uses rel='approve')
    const approvalLink = orderDetails.links?.find(
      (link) => link.rel === 'approve',
    );
    const approvalUrl = approvalLink?.href;

    // Map v2 status to v1-compatible status for error messages
    const status = orderDetails.status;
    const statusMap = {
      CREATED: 'created',
      SAVED: 'created',
      APPROVED: 'approved',
      VOIDED: 'cancelled',
      COMPLETED: 'completed',
    };
    const mappedStatus = statusMap[status] || status?.toLowerCase();

    // Provide more specific error messages based on order status
    let errorMessage = '';
    switch (status) {
      case 'CREATED':
      case 'SAVED':
        errorMessage = `Order is still in ${status} status. The user must complete the approval process on PayPal's website.`;
        if (approvalUrl) {
          errorMessage += ` Please redirect the user to: ${approvalUrl}`;
        } else {
          errorMessage += ` Please use the approval URL from the order creation response.`;
        }
        break;
      case 'APPROVED':
        errorMessage =
          'Order is approved but not yet captured. Please capture the order to complete the payment.';
        break;
      case 'VOIDED':
        errorMessage =
          'Order was cancelled by the user. Please create a new order.';
        break;
      case 'COMPLETED':
        errorMessage = 'Order is already completed.';
        break;
      default:
        errorMessage = `Order is in unexpected status: ${status}. Please ensure the user has approved the order through PayPal by visiting the approval URL.`;
    }

    return new PaymentValidationError(errorMessage);
  }

  /**
   * Fetch payment details from PayPal (v2 API)
   * @param {string} orderId - PayPal order ID
   * @returns {Promise<Object>} Payment details
   */
  async fetchPaymentDetails(orderId) {
    if (!this.client) {
      throw new PaymentConfigurationError(
        'PayPal is not properly configured. Please provide client credentials.',
        'paypal',
      );
    }

    try {
      if (!orderId) {
        throw new PaymentValidationError('Order ID is required');
      }

      const orderDetails = await this.getPaymentDetailsOnce(orderId);

      // Map v2 status to v1-compatible status
      const statusMap = {
        CREATED: 'created',
        SAVED: 'created',
        APPROVED: 'approved',
        VOIDED: 'cancelled',
        COMPLETED: 'completed',
      };

      const purchaseUnit = orderDetails.purchase_units?.[0];
      const amount = purchaseUnit?.amount;
      const amountInCents = Math.round(parseFloat(amount?.value || 0) * 100);
      const mappedStatus =
        statusMap[orderDetails.status] || orderDetails.status?.toLowerCase();

      return {
        success: true,
        paymentId: orderDetails.id,
        amount: amountInCents,
        currency: amount?.currency_code || 'USD',
        status: mappedStatus,
        method: 'paypal',
        captured:
          orderDetails.status === 'COMPLETED' ||
          orderDetails.status === 'APPROVED',
        createdAt: new Date().toISOString(),
        provider: 'paypal',
        rawResponse: orderDetails,
      };
    } catch (error) {
      if (
        error instanceof PaymentValidationError ||
        error instanceof PaymentConfigurationError
      ) {
        throw error;
      }

      throw new PaymentProviderError(
        `Failed to fetch PayPal order details: ${error.message}`,
        'paypal',
        'PAYMENT_FETCH_FAILED',
      );
    }
  }

  /**
   * Process PayPal webhook events
   * @param {Object} payload - Webhook payload
   * @param {string} rawBody - Raw webhook body
   * @param {string} signature - Webhook signature
   * @returns {Promise<Object>} Webhook processing response
   */
  async processWebhook(payload, rawBody, signature) {
    if (!this.client) {
      throw new PaymentConfigurationError(
        'PayPal is not properly configured. Please provide client credentials.',
        'paypal',
      );
    }

    try {
      // Verify webhook signature
      if (!this.verifyWebhookSignature(rawBody, signature)) {
        throw new PaymentSignatureError('Invalid PayPal webhook signature');
      }

      const eventType = payload.event_type;

      switch (eventType) {
        case 'PAYMENT.SALE.COMPLETED':
          return this.handlePaymentCompleted(payload);
        case 'PAYMENT.SALE.DENIED':
          return this.handlePaymentDenied(payload);
        case 'PAYMENT.SALE.REFUNDED':
          return this.handlePaymentRefunded(payload);
        default:
          return {
            success: true,
            processed: false,
            reason: 'unhandled_event',
            event: eventType,
          };
      }
    } catch (error) {
      if (
        error instanceof PaymentConfigurationError ||
        error instanceof PaymentSignatureError
      ) {
        throw error;
      }

      throw new PaymentProviderError(
        `Failed to process PayPal webhook: ${error.message}`,
        'paypal',
        'WEBHOOK_PROCESSING_FAILED',
      );
    }
  }

  /**
   * Verify PayPal webhook signature
   * @param {string} rawBody - Raw webhook body
   * @param {string} signature - Webhook signature
   * @returns {boolean} True if signature is valid
   */
  verifyWebhookSignature(rawBody, signature) {
    if (!this.config.webhookId) {
      return true; // Allow processing if webhook ID is not configured
    }

    try {
      // PayPal webhook signature verification
      // This is a simplified version - in production, you should use PayPal's webhook verification
      const expectedSignature = this.config.webhookId;
      return signature === expectedSignature;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get PayPal payment status
   * @param {string} paymentId - PayPal payment ID
   * @returns {Promise<Object>} Payment status information
   */
  async getPaymentStatus(paymentId) {
    return this.fetchPaymentDetails(paymentId);
  }

  /**
   * Refund a PayPal payment (v2 API)
   * @param {string} orderId - PayPal order ID (or capture ID if directly provided)
   * @param {Object} refundData - Refund data
   * @returns {Promise<Object>} Refund response
   */
  async refundPayment(orderId, refundData) {
    if (!this.client) {
      throw new PaymentConfigurationError(
        'PayPal is not properly configured. Please provide client credentials.',
        'paypal',
      );
    }

    try {
      if (!orderId) {
        throw new PaymentValidationError('Order ID or Capture ID is required');
      }

      const {
        amount,
        reason = 'REQUESTED_BY_CUSTOMER',
        notes = {},
      } = refundData;

      // In v2 API, we need to get the capture ID from the order
      // First, try to get order details to find the capture
      let captureId = orderId; // Assume it might be a capture ID directly

      try {
        const orderDetails = await this.getPaymentDetailsOnce(orderId);
        const purchaseUnit = orderDetails.purchase_units?.[0];
        const capture = purchaseUnit?.payments?.captures?.[0];

        if (capture?.id) {
          captureId = capture.id;
        } else {
          throw new PaymentValidationError(
            'No capture found for this order. The order must be completed before it can be refunded.',
          );
        }
      } catch (error) {
        // If order lookup fails, assume orderId is actually a capture ID
        if (error instanceof PaymentValidationError) {
          throw error;
        }
        // Continue with orderId as captureId
      }

      // Prepare refund request for v2 API
      const refundConfig = {
        amount: amount
          ? {
              value: (amount / 100).toFixed(2), // Convert from cents to dollars
              currency_code: refundData.currency || 'USD',
            }
          : undefined,
        note_to_payer: notes.description || 'Refund for subscription payment',
        invoice_id: notes.invoice_number,
      };

      // Make refund request using v2 API
      const refund = await this.makeAuthenticatedRequest(
        'POST',
        `/v2/payments/captures/${captureId}/refund`,
        refundConfig,
      );

      // Map v2 refund status
      const statusMap = {
        COMPLETED: 'completed',
        PENDING: 'pending',
        FAILED: 'failed',
      };
      const mappedStatus =
        statusMap[refund.status] || refund.status?.toLowerCase();

      const refundAmount =
        refund.amount || refund.seller_payable_breakdown?.total_refunded_amount;
      const amountInCents = Math.round(
        parseFloat(refundAmount?.value || 0) * 100,
      );

      return {
        success: true,
        refundId: refund.id,
        paymentId: orderId,
        amount: amountInCents,
        status: mappedStatus,
        createdAt: new Date().toISOString(),
        provider: 'paypal',
        rawResponse: refund,
      };
    } catch (error) {
      if (
        error instanceof PaymentValidationError ||
        error instanceof PaymentConfigurationError ||
        error instanceof PaymentProviderError
      ) {
        throw error;
      }

      throw new PaymentProviderError(
        `Failed to refund PayPal payment: ${error.message}`,
        'paypal',
        'REFUND_FAILED',
      );
    }
  }

  /**
   * Handle payment completed webhook event
   * @param {Object} eventData - Event data
   * @returns {Object} Processing response
   */
  handlePaymentCompleted(eventData) {
    const resource = eventData.resource;

    return {
      success: true,
      processed: true,
      event: 'PAYMENT.SALE.COMPLETED',
      paymentId: resource.id,
      amount: Math.round(parseFloat(resource.amount.total) * 100), // Convert to cents
      status: resource.state,
      provider: 'paypal',
    };
  }

  /**
   * Handle payment denied webhook event
   * @param {Object} eventData - Event data
   * @returns {Object} Processing response
   */
  handlePaymentDenied(eventData) {
    const resource = eventData.resource;

    return {
      success: true,
      processed: true,
      event: 'PAYMENT.SALE.DENIED',
      paymentId: resource.id,
      amount: Math.round(parseFloat(resource.amount.total) * 100), // Convert to cents
      status: resource.state,
      provider: 'paypal',
    };
  }

  /**
   * Handle payment refunded webhook event
   * @param {Object} eventData - Event data
   * @returns {Object} Processing response
   */
  handlePaymentRefunded(eventData) {
    const resource = eventData.resource;

    return {
      success: true,
      processed: true,
      event: 'PAYMENT.SALE.REFUNDED',
      paymentId: resource.id,
      amount: Math.round(parseFloat(resource.amount.total) * 100), // Convert to cents
      status: resource.state,
      provider: 'paypal',
    };
  }

  /**
   * Get public credentials for frontend
   * @returns {Object} Public credentials
   */
  getPublicCredentials() {
    return {
      clientId: this.config.clientId,
      publicKey: this.config.clientId, // For consistency with other providers
    };
  }

  /**
   * Get provider name
   * @returns {string} Provider name
   */
  getProviderName() {
    return 'paypal';
  }

  /**
   * Check if provider is configured
   * @returns {boolean} True if configured
   */
  isConfigured() {
    return !!(this.config.clientId && this.config.clientSecret);
  }

  /**
   * Get PayPal configuration requirements
   * @returns {Object} Configuration requirements
   */
  static getConfigRequirements() {
    return {
      required: ['clientId', 'clientSecret'],
      optional: ['webhookId', 'mode'],
      description: {
        clientId: 'PayPal Client ID from developer dashboard',
        clientSecret: 'PayPal Client Secret from developer dashboard',
        webhookId: 'PayPal webhook ID for signature verification',
        mode: 'PayPal mode: sandbox or live (default: sandbox)',
      },
    };
  }
}
