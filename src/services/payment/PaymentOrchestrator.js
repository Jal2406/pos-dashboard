/**
 * Payment Orchestrator (Factory)
 * Manages payment provider instances and provides a unified interface
 * Uses database configuration from PaymentGatewayService
 */

import { RazorpayPaymentService } from './providers/RazorpayPaymentService.js';
import { PaypalPaymentService } from './providers/PaypalPaymentService.js';
import {
  PaymentProviderError,
  PaymentConfigurationError,
} from './PaymentErrors.js';
import PaymentGatewayService from '../paymentGateway.services.js';

/**
 * Payment provider registry
 * Maps provider names to their service classes
 */
const PAYMENT_PROVIDERS = {
  razorpay: RazorpayPaymentService,
  paypal: PaypalPaymentService,
  // Add more providers as they are implemented
};

export class PaymentOrchestrator {
  constructor() {
    this.providers = new Map();
    this.configCache = new Map();
    this.gatewayService = new PaymentGatewayService();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes cache
  }

  /**
   * Get a payment provider instance
   * @param {string} providerName - Name of the payment provider
   * @param {Object} config - Provider configuration
   * @returns {BasePaymentService} Payment service instance
   * @throws {PaymentProviderError} If provider is not supported
   * @throws {PaymentConfigurationError} If configuration is invalid
   */
  getProvider(providerName, config) {
    if (!providerName || typeof providerName !== 'string') {
      throw new PaymentProviderError('Provider name is required');
    }

    const normalizedProvider = providerName.toLowerCase();

    if (!PAYMENT_PROVIDERS[normalizedProvider]) {
      throw new PaymentProviderError(
        `Unsupported payment provider: ${providerName}. Supported providers: ${Object.keys(
          PAYMENT_PROVIDERS,
        ).join(', ')}`,
      );
    }

    // Check if we already have a cached instance for this provider and config
    const cacheKey = this.getCacheKey(normalizedProvider, config);
    if (this.providers.has(cacheKey)) {
      return this.providers.get(cacheKey);
    }

    try {
      // Create new provider instance
      const ProviderClass = PAYMENT_PROVIDERS[normalizedProvider];
      const providerInstance = new ProviderClass(config);

      // Cache the instance
      this.providers.set(cacheKey, providerInstance);

      return providerInstance;
    } catch (error) {
      if (error instanceof PaymentConfigurationError) {
        throw error;
      }

      throw new PaymentProviderError(
        `Failed to initialize ${providerName} provider: ${error.message}`,
        normalizedProvider,
      );
    }
  }

  /**
   * Get provider instance from database configuration
   * @param {string} providerName - Name of the payment provider
   * @param {string} tenantId - Optional tenant ID for multi-tenant support
   * @returns {BasePaymentService} Payment service instance
   */
  async getProviderFromDB(providerName, tenantId = null) {
    const config = await this.getConfigFromDB(providerName, tenantId);
    return this.getProvider(providerName, config);
  }

  /**
   * Get provider instance from environment configuration (legacy support)
   * @param {string} providerName - Name of the payment provider
   * @returns {BasePaymentService} Payment service instance
   * @deprecated Use getProviderFromDB instead
   */
  getProviderFromEnv(providerName) {
    const config = this.getConfigFromEnv(providerName);
    return this.getProvider(providerName, config);
  }

  /**
   * Get configuration for a provider from database
   * @param {string} providerName - Name of the payment provider
   * @param {string} tenantId - Optional tenant ID for multi-tenant support
   * @returns {Promise<Object>} Provider configuration
   */
  async getConfigFromDB(providerName, tenantId = null) {
    const normalizedProvider = providerName.toLowerCase();
    const cacheKey = `${normalizedProvider}:${tenantId || 'default'}`;

    // Check cache first
    if (this.configCache.has(cacheKey)) {
      const cached = this.configCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheExpiry) {
        return cached.config;
      }
      // Remove expired cache
      this.configCache.delete(cacheKey);
    }

    try {
      // Get gateway configuration from database
      const gatewayConfig =
        await this.gatewayService.getGatewayConfig(normalizedProvider);

      if (!gatewayConfig || !gatewayConfig.enabled) {
        throw new PaymentConfigurationError(
          `Payment gateway ${normalizedProvider} is not enabled or not found`,
          normalizedProvider,
        );
      }

      // Extract and decrypt credentials
      const credentials = gatewayConfig.credentials || {};

      // Map database credentials to provider-specific format
      const config = this.mapCredentialsToProvider(
        normalizedProvider,
        credentials,
      );

      // Cache the configuration
      this.configCache.set(cacheKey, {
        config,
        timestamp: Date.now(),
      });

      return config;
    } catch (error) {
      if (error instanceof PaymentConfigurationError) {
        throw error;
      }

      throw new PaymentProviderError(
        `Failed to get configuration for ${providerName}: ${error.message}`,
        normalizedProvider,
      );
    }
  }

  /**
   * Map database credentials to provider-specific configuration format
   * @param {string} provider - Provider name
   * @param {Object} credentials - Database credentials
   * @returns {Object} Provider-specific configuration
   */
  mapCredentialsToProvider(provider, credentials) {
    switch (provider) {
      case 'razorpay':
        return {
          keyId: credentials.key_id || credentials.keyId,
          keySecret: credentials.key_secret || credentials.keySecret,
          webhookSecret:
            credentials.webhook_secret || credentials.webhookSecret,
        };

      case 'paypal':
        const paypalConfig = {
          clientId: credentials.clientId || credentials.client_id,
          clientSecret: credentials.clientSecret || credentials.client_secret,
          webhookId: credentials.webhookId || credentials.webhook_id,
          mode: credentials.mode || 'sandbox', // Add mode support
        };

        return paypalConfig;

      case 'cinet':
        return {
          siteId: credentials.siteId || credentials.site_id,
          apiKey: credentials.apiKey || credentials.api_key,
          secretKey: credentials.secretKey || credentials.secret_key,
        };

      case 'sadad':
        return {
          siteId: credentials.siteId || credentials.site_id,
          secretKey: credentials.secretKey || credentials.secret_key,
          domain: credentials.domain,
        };

      case 'airtelmoney':
        return {
          siteId: credentials.siteId || credentials.site_id,
          secretKey: credentials.secretKey || credentials.secret_key,
        };

      case 'phonepe':
        return {
          appId: credentials.appId || credentials.app_id,
          merchantId: credentials.merchantId || credentials.merchant_id,
          saltId: credentials.saltId || credentials.salt_id,
          saltKey: credentials.saltKey || credentials.salt_key,
        };

      case 'midtrans':
        return {
          siteId: credentials.siteId || credentials.site_id,
        };

      case 'paystack':
        return {
          secretKey: credentials.secretKey || credentials.secret_key,
          appKey: credentials.appKey || credentials.app_key,
        };

      case 'flutterwave':
        return {
          secretKey: credentials.secretKey || credentials.secret_key,
          appKey: credentials.appKey || credentials.app_key,
        };

      default:
        // Return credentials as-is for unknown providers
        return credentials;
    }
  }

  /**
   * Get configuration for a provider from environment variables (legacy support)
   * @param {string} providerName - Name of the payment provider
   * @returns {Object} Provider configuration
   * @deprecated Use getConfigFromDB instead
   */
  getConfigFromEnv(providerName) {
    const normalizedProvider = providerName.toLowerCase();

    switch (normalizedProvider) {
      case 'razorpay':
        return {
          keyId: process.env.RAZORPAY_KEY_ID,
          keySecret: process.env.RAZORPAY_KEY_SECRET,
          webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
        };

      case 'paypal':
        return {
          clientId: process.env.PAYPAL_CLIENT_ID,
          clientSecret: process.env.PAYPAL_CLIENT_SECRET,
          webhookId: process.env.PAYPAL_WEBHOOK_ID,
        };

      default:
        throw new PaymentProviderError(
          `No environment configuration found for provider: ${providerName}`,
        );
    }
  }

  /**
   * Get all supported providers
   * @returns {string[]} Array of supported provider names
   */
  getSupportedProviders() {
    return Object.keys(PAYMENT_PROVIDERS);
  }

  /**
   * Get configuration requirements for a provider
   * @param {string} providerName - Name of the payment provider
   * @returns {Object} Configuration requirements
   */
  getProviderConfigRequirements(providerName) {
    const normalizedProvider = providerName.toLowerCase();

    if (!PAYMENT_PROVIDERS[normalizedProvider]) {
      throw new PaymentProviderError(
        `Unsupported payment provider: ${providerName}`,
      );
    }

    const ProviderClass = PAYMENT_PROVIDERS[normalizedProvider];
    return ProviderClass.getConfigRequirements();
  }

  /**
   * Check if a provider is supported
   * @param {string} providerName - Name of the payment provider
   * @returns {boolean} True if provider is supported
   */
  isProviderSupported(providerName) {
    return (
      providerName &&
      PAYMENT_PROVIDERS[providerName.toLowerCase()] !== undefined
    );
  }

  /**
   * Clear cached provider instances
   * Useful for testing or when configuration changes
   */
  clearCache() {
    this.providers.clear();
    this.configCache.clear();
  }

  /**
   * Clear configuration cache for a specific provider
   * @param {string} providerName - Provider name
   * @param {string} tenantId - Optional tenant ID
   */
  clearProviderCache(providerName, tenantId = null) {
    const normalizedProvider = providerName.toLowerCase();
    const cacheKey = `${normalizedProvider}:${tenantId || 'default'}`;
    this.configCache.delete(cacheKey);

    // Also clear provider instances that might be using this config
    for (const [key, provider] of this.providers.entries()) {
      if (key.includes(normalizedProvider)) {
        this.providers.delete(key);
      }
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    return {
      providerInstances: this.providers.size,
      configEntries: this.configCache.size,
      cacheExpiry: this.cacheExpiry,
      configKeys: Array.from(this.configCache.keys()),
    };
  }

  /**
   * Get cache key for provider and config combination
   * @param {string} providerName - Provider name
   * @param {Object} config - Provider configuration
   * @returns {string} Cache key
   * @private
   */
  getCacheKey(providerName, config) {
    // Create a simple hash of the config for caching
    const configString = JSON.stringify(config, Object.keys(config).sort());
    return `${providerName}:${Buffer.from(configString).toString('base64')}`;
  }

  /**
   * Register a new payment provider
   * @param {string} name - Provider name
   * @param {Class} ProviderClass - Provider service class
   */
  static registerProvider(name, ProviderClass) {
    if (!name || typeof name !== 'string') {
      throw new Error('Provider name must be a non-empty string');
    }

    if (!ProviderClass || typeof ProviderClass !== 'function') {
      throw new Error('Provider class must be a constructor function');
    }

    // Check if the class extends BasePaymentService
    if (
      !ProviderClass.prototype ||
      typeof ProviderClass.prototype.createPayment !== 'function'
    ) {
      throw new Error('Provider class must extend BasePaymentService');
    }

    PAYMENT_PROVIDERS[name.toLowerCase()] = ProviderClass;
  }

  /**
   * Unregister a payment provider
   * @param {string} name - Provider name
   */
  static unregisterProvider(name) {
    if (name && PAYMENT_PROVIDERS[name.toLowerCase()]) {
      delete PAYMENT_PROVIDERS[name.toLowerCase()];
    }
  }
}

// Create a singleton instance
const paymentOrchestrator = new PaymentOrchestrator();

export default paymentOrchestrator;
