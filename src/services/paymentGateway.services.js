import { PaymentGateway } from '../models/index.js';
import { BaseService, EncryptionUtils } from '../utils/index.js';
import {
  getRequiredFieldsForProvider,
  getSensitiveFieldsForProvider,
} from '../config/paymentProviders.js';
class PaymentGatewayService extends BaseService {
  constructor() {
    super(PaymentGateway);

    // In-memory cache for decrypted credentials to avoid repeated decryption
    // For production, consider using Redis for distributed caching
    this.credentialsCache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Normalize Mongoose document to plain object
   * @param {Object} gateway - Mongoose document or plain object
   * @returns {Object} Normalized plain object
   */
  normalizeGateway(gateway) {
    if (!gateway) return gateway;

    // Convert Mongoose document to plain object
    const gatewayData = gateway.toObject ? gateway.toObject() : gateway;

    // Convert Map fields to plain objects
    const normalized = { ...gatewayData };

    if (normalized.credentials instanceof Map) {
      normalized.credentials = Object.fromEntries(normalized.credentials);
    }

    if (normalized.publicCredentials instanceof Map) {
      normalized.publicCredentials = Object.fromEntries(
        normalized.publicCredentials,
      );
    }

    return normalized;
  }

  /**
   * Mask sensitive credentials for display
   * @param {Object} credentials - Credentials object
   * @param {string} provider - Payment provider name
   * @returns {Object} Masked credentials object
   */
  maskCredentials(credentials, provider) {
    if (!credentials) return credentials;

    const sensitiveFields = getSensitiveFieldsForProvider(provider);
    const maskedCredentials = {};

    Object.keys(credentials).forEach((key) => {
      const lowerKey = key.toLowerCase();
      const isSensitive =
        sensitiveFields.some((field) =>
          lowerKey.includes(field.toLowerCase()),
        ) ||
        ['secret', 'key', 'password'].some((field) => lowerKey.includes(field));

      if (isSensitive && credentials[key]) {
        const value = credentials[key];
        // Show only last 4 characters for security
        maskedCredentials[key] =
          '*'.repeat(Math.max(0, value.length - 4)) + value.slice(-4);
      } else {
        maskedCredentials[key] = credentials[key];
      }
    });

    return maskedCredentials;
  }

  /**
   * Get cached decrypted credentials or decrypt and cache them
   * @param {Object} credentials - Encrypted credentials
   * @param {string} gatewayId - Gateway ID for cache key
   * @returns {Object} Decrypted credentials
   */
  getCachedDecryptedCredentials(credentials, gatewayId) {
    if (!credentials) return credentials;

    const cacheKey = `${gatewayId}_credentials`;
    const cached = this.credentialsCache.get(cacheKey);

    // Check if cache exists and is not expired
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.data;
    }

    // Decrypt and cache
    const decrypted = EncryptionUtils.decryptCredentials(credentials);
    this.credentialsCache.set(cacheKey, {
      data: decrypted,
      timestamp: Date.now(),
    });

    // Clean up expired cache entries periodically
    if (this.credentialsCache.size > 100) {
      this.cleanExpiredCache();
    }

    return decrypted;
  }

  /**
   * Clean expired cache entries
   */
  cleanExpiredCache() {
    const now = Date.now();
    for (const [key, value] of this.credentialsCache.entries()) {
      if (now - value.timestamp >= this.cacheExpiry) {
        this.credentialsCache.delete(key);
      }
    }
  }

  /**
   * Process credentials by extracting public and encrypting sensitive data
   * @param {Object} credentials - Raw credentials object
   * @returns {Object} Processed credentials with public and encrypted fields
   */
  processCredentials(credentials) {
    return {
      credentials: EncryptionUtils.encryptCredentials(credentials),
      publicCredentials: EncryptionUtils.getPublicCredentials(credentials),
    };
  }

  /**
   * Format gateway response based on mode
   * @param {Object} gatewayData - Normalized gateway data
   * @param {string} mode - Response mode: 'full', 'masked', 'public'
   * @returns {Object} Formatted response
   */
  formatGatewayResponse(gatewayData, mode = 'masked') {
    if (!gatewayData) return gatewayData;

    const response = { ...gatewayData };
    const gatewayId = response._id || response.id;

    // Handle credentials based on mode
    if (response.credentials) {
      switch (mode) {
        case 'full':
          response.credentials = this.getCachedDecryptedCredentials(
            response.credentials,
            gatewayId,
          );
          break;
        case 'masked':
          response.credentials = this.maskCredentials(
            response.credentials,
            response.provider,
          );
          break;
        case 'public':
          response.credentials = response.publicCredentials || {};
          break;
      }
    }

    return response;
  }

  async create(data) {
    try {
      // Check if a payment gateway with same provider already exists
      const existingGateway = await PaymentGateway.findOne({
        provider: data.provider,
      });

      if (existingGateway) {
        throw new Error(
          `Payment gateway for provider ${data.provider} already exists. Use update instead.`,
        );
      }

      // Validate and process credentials
      this.validateProviderCredentials(data.provider, data.credentials);
      const processedCredentials = this.processCredentials(data.credentials);

      const paymentGatewayData = {
        ...data,
        ...processedCredentials,
      };

      const paymentGateway = new PaymentGateway(paymentGatewayData);
      const savedGateway = await paymentGateway.save();

      return this.formatGatewayResponse(
        this.normalizeGateway(savedGateway),
        'masked',
      );
    } catch (error) {
      console.log(error);
      throw new Error(error.message);
    }
  }

  async getById(id) {
    const paymentGateway = await PaymentGateway.findById(id);
    if (!paymentGateway) {
      throw new Error(`Payment gateway with id ${id} not found`);
    }

    return this.formatGatewayResponse(
      this.normalizeGateway(paymentGateway),
      'full',
    );
  }

  async getAll(queryParams = {}) {
    const {
      page = 1,
      limit = 10,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      provider,
      enabled,
      mode = 'masked', // Default to masked for performance
    } = queryParams;

    // Build match filter for aggregation
    const matchFilter = {};

    if (provider) {
      matchFilter.provider = provider;
    }

    if (enabled !== undefined) {
      matchFilter.enabled = enabled === 'true';
    }

    if (search) {
      matchFilter.$or = [
        { provider: { $regex: search, $options: 'i' } },
        { 'credentials.name': { $regex: search, $options: 'i' } },
      ];
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const skip = (page - 1) * limit;
    const limitInt = Number.parseInt(limit);

    // Single aggregation pipeline with $facet for data and count
    const pipeline = [
      // Match stage for filtering
      { $match: matchFilter },

      // Facet stage to get both data and count in one query
      {
        $facet: {
          data: [
            { $sort: sort },
            { $skip: skip },
            { $limit: limitInt },
            // Project to ensure we get lean objects
            { $project: { __v: 0 } },
          ],
          totalCount: [{ $count: 'count' }],
        },
      },
    ];

    const [result] = await PaymentGateway.aggregate(pipeline);
    const paymentGateways = result.data || [];
    const total = result.totalCount[0]?.count || 0;

    // Format response with proper mode handling
    const formattedData = paymentGateways.map((gateway) => {
      const normalizedGateway = this.normalizeGateway(gateway);
      return this.formatGatewayResponse(normalizedGateway, mode);
    });

    return {
      data: formattedData,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limitInt),
        totalItems: total,
        itemsPerPage: limitInt,
      },
    };
  }

  async update(id, data) {
    const paymentGateway = await PaymentGateway.findById(id);
    if (!paymentGateway) {
      throw new Error(`Payment gateway with id ${id} not found`);
    }

    // Process credentials if provided
    if (data.credentials) {
      this.validateProviderCredentials(
        paymentGateway.provider,
        data.credentials,
      );
      const processedCredentials = this.processCredentials(data.credentials);
      Object.assign(data, processedCredentials);
    }

    // Update the payment gateway
    Object.keys(data).forEach((key) => {
      if (key !== '_id' && key !== 'createdAt' && key !== 'updatedAt') {
        paymentGateway[key] = data[key];
      }
    });

    const updatedGateway = await paymentGateway.save();
    return this.formatGatewayResponse(
      this.normalizeGateway(updatedGateway),
      'masked',
    );
  }

  async updateCredentials(id, credentials) {
    // Reuse the update method with only credentials
    return this.update(id, { credentials });
  }

  async delete(id) {
    const paymentGateway = await PaymentGateway.findByIdAndDelete(id);
    if (!paymentGateway) {
      throw new Error(`Payment gateway with id ${id} not found`);
    }
    return this.formatGatewayResponse(
      this.normalizeGateway(paymentGateway),
      'masked',
    );
  }

  async toggleGatewayStatus(id) {
    const paymentGateway = await PaymentGateway.findById(id);
    if (!paymentGateway) {
      throw new Error(`Payment gateway with id ${id} not found`);
    }

    // Toggle the enabled status
    paymentGateway.enabled = !paymentGateway.enabled;

    const updatedGateway = await paymentGateway.save();
    return this.formatGatewayResponse(
      this.normalizeGateway(updatedGateway),
      'masked',
    );
  }

  async getActiveGateways() {
    const filter = { enabled: true };

    const activeGateways = await PaymentGateway.find(filter).select(
      'provider enabled publicCredentials',
    );

    return activeGateways.map((gateway) =>
      this.formatGatewayResponse(this.normalizeGateway(gateway), 'public'),
    );
  }

  async getGatewayConfig(provider) {
    const filter = { provider, enabled: true };

    const paymentGateway = await PaymentGateway.findOne(filter);
    if (!paymentGateway) {
      throw new Error(`No active ${provider} gateway found`);
    }

    return this.formatGatewayResponse(
      this.normalizeGateway(paymentGateway),
      'full',
    );
  }

  validateProviderCredentials(provider, credentials) {
    const requiredFields = getRequiredFieldsForProvider(provider);
    const missingFields = [];

    requiredFields.forEach((field) => {
      if (!credentials[field] || credentials[field].trim() === '') {
        missingFields.push(field);
      }
    });

    if (missingFields.length > 0) {
      throw new Error(
        `Missing required fields for ${provider}: ${missingFields.join(', ')}`,
      );
    }

    return true;
  }

  /**
   * Get public credentials for payment operations (non-sensitive data only)
   * @param {string} provider - The payment provider
   * @returns {Object} - Public credentials object
   */
  async getPublicCredentialsForPayment(provider) {
    const filter = { provider, enabled: true };
    const paymentGateway = await PaymentGateway.findOne(filter).select(
      'provider enabled publicCredentials',
    );

    if (!paymentGateway) {
      throw new Error(`No active ${provider} gateway found`);
    }

    return this.formatGatewayResponse(
      this.normalizeGateway(paymentGateway),
      'public',
    );
  }
}

export default PaymentGatewayService;
