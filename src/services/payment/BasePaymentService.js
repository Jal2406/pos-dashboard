/**
 * Base Payment Service Abstract Class
 * Defines the contract that all payment providers must implement
 */

import { PaymentConfigurationError } from './PaymentErrors.js';

export class BasePaymentService {
  constructor(config) {
    if (this.constructor === BasePaymentService) {
      throw new Error(
        'BasePaymentService is an abstract class and cannot be instantiated directly',
      );
    }

    this.config = this.validateConfig(config);
    this.provider = this.constructor.name
      .replace('PaymentService', '')
      .toLowerCase();
  }

  /**
   * Validate provider configuration
   * @param {Object} config - Provider configuration
   * @returns {Object} Validated configuration
   * @throws {PaymentConfigurationError} If configuration is invalid
   */
  validateConfig(config) {
    if (!config || typeof config !== 'object') {
      throw new PaymentConfigurationError(
        'Payment configuration is required',
        this.provider,
      );
    }
    return config;
  }

  /**
   * Create a payment order/transaction
   * @param {Object} paymentData - Payment data including amount, currency, etc.
   * @returns {Promise<Object>} Payment creation response
   * @throws {Error} If payment creation fails
   */
  async createPayment(paymentData) {
    throw new Error('createPayment method must be implemented by subclass');
  }

  /**
   * Finalize/complete a payment after user interaction
   * @param {Object} checkoutData - Checkout completion data
   * @returns {Promise<Object>} Payment finalization response
   * @throws {Error} If payment finalization fails
   */
  async finalizeCheckout(checkoutData) {
    throw new Error('finalizeCheckout method must be implemented by subclass');
  }

  /**
   * Process webhook events from payment provider
   * @param {Object} webhookData - Webhook payload and signature
   * @returns {Promise<Object>} Webhook processing response
   * @throws {Error} If webhook processing fails
   */
  async processWebhook(webhookData) {
    throw new Error('processWebhook method must be implemented by subclass');
  }

  /**
   * Verify webhook signature
   * @param {string} payload - Raw webhook payload
   * @param {string} signature - Webhook signature
   * @returns {boolean} True if signature is valid
   */
  verifyWebhookSignature(payload, signature) {
    throw new Error(
      'verifyWebhookSignature method must be implemented by subclass',
    );
  }

  /**
   * Get payment status from provider
   * @param {string} paymentId - Payment ID
   * @returns {Promise<Object>} Payment status information
   * @throws {Error} If status retrieval fails
   */
  async getPaymentStatus(paymentId) {
    throw new Error('getPaymentStatus method must be implemented by subclass');
  }

  /**
   * Refund a payment
   * @param {string} paymentId - Payment ID to refund
   * @param {Object} refundData - Refund data including amount, reason, etc.
   * @returns {Promise<Object>} Refund response
   * @throws {Error} If refund fails
   */
  async refundPayment(paymentId, refundData) {
    throw new Error('refundPayment method must be implemented by subclass');
  }

  /**
   * Get provider-specific configuration requirements
   * @returns {Object} Configuration requirements
   */
  static getConfigRequirements() {
    throw new Error(
      'getConfigRequirements method must be implemented by subclass',
    );
  }

  /**
   * Get provider name
   * @returns {string} Provider name
   */
  getProviderName() {
    return this.provider;
  }

  /**
   * Check if provider is properly configured
   * @returns {boolean} True if properly configured
   */
  isConfigured() {
    return this.config && Object.keys(this.config).length > 0;
  }
}
