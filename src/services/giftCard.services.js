import { BaseService } from '../utils/index.js';
import { giftCardSchema } from '../models/GiftCard.js';
import { CustomerSchema } from '../models/Customer.js';
import mongoose from 'mongoose';
import TenantNotificationDispatcher from './tenantNotification/notificationDispatcher.service.js';

const DEFAULT_GIFTCARD_TEMPLATE_LABEL = 'giftcard_assigned';
const EMAIL_BATCH_SIZE = 50;

/**
 * @class GiftCardService
 * @extends BaseService
 */
class GiftCardService extends BaseService {
  /**
   * Initialize GiftCard Service with tenant-specific database support
   * @param {String} businessId - Business/tenant ID for multi-tenant isolation
   * @param {Object} options - Optional configuration
   */
  constructor(businessId, options = {}) {
    if (!businessId) {
      throw new Error('GiftCardService initialized without businessId');
    }
    super({
      modelName: 'GiftCard',
      schema: giftCardSchema,
      collection: 'giftcards',
      businessId,
    });

    // Cache the model reference to avoid repeated resolution
    this._modelRef = null;
  }

  /**
   * Get cached model reference for better performance
   * @returns {Promise<Model>} Cached model reference
   */
  async getCachedModel() {
    if (!this._modelRef) {
      this._modelRef = await this.getModelRef();
    }
    return this._modelRef;
  }

  /**
   * Create a new gift card
   * @param {Object} payload - Gift card data
   * @param {String} payload.name - Gift card name
   * @param {String} payload.number - Gift card number (auto-generated or manual)
   * @param {String} payload.numberGenerationType - 'Auto' or 'Manual'
   * @param {Number} payload.value - Gift card value
   * @param {Number} payload.thresholdAmount - Optional threshold amount
   * @param {Date|String} payload.validity - Validity date (must be future date)
   * @param {String} payload.customerScope - 'Specific' or 'All'
   * @param {Array<String>} payload.assignedCustomerIds - Customer IDs if scope is 'Specific'
   * @param {String} payload.terms - Terms & conditions (HTML)
   * @param {String} payload.image - Gift card image URL
   * @param {String} payload.status - 'Active' or 'Inactive'
   * @param {Object} options - Optional options { session }
   * @returns {Promise<Object>} Created gift card document
   */
  async createGiftCard(payload, options = {}) {
    try {
      const { notificationContext = {}, ...createOptions } = options || {};
      const {
        giftCardPayload,
        notificationOptions,
        notificationContext: inlineNotificationContext,
      } =
        this._splitNotificationOptions(payload);
      const mergedNotificationContext = {
        ...(notificationContext || {}),
        ...(inlineNotificationContext || {}),
      };

      // Validate required fields
      const requiredFields = [
        'name',
        'number',
        'value',
        'validity',
        'customerScope',
      ];
      this.validateRequiredFields(giftCardPayload, requiredFields);

      // Validate ObjectIds if provided
      if (
        giftCardPayload.assignedCustomerIds &&
        Array.isArray(giftCardPayload.assignedCustomerIds)
      ) {
        giftCardPayload.assignedCustomerIds.forEach((id) => {
          if (!mongoose.isValidObjectId(id)) {
            throw new Error(`Invalid customer ID: ${id}`);
          }
        });
      }

      // Validate validity is a future date
      const validityDate = new Date(giftCardPayload.validity);
      if (validityDate <= new Date()) {
        throw new Error('Validity date must be a future date');
      }

      // Validate customer scope and assigned customers
      if (giftCardPayload.customerScope === 'Specific') {
        if (
          !giftCardPayload.assignedCustomerIds ||
          giftCardPayload.assignedCustomerIds.length === 0
        ) {
          throw new Error(
            'At least one customer ID is required when customer scope is "Specific"',
          );
        }
      } else if (giftCardPayload.customerScope === 'All') {
        // Clear assignedCustomerIds if scope is All
        giftCardPayload.assignedCustomerIds = [];
      }

      // Validate threshold amount
      if (
        giftCardPayload.thresholdAmount !== null &&
        giftCardPayload.thresholdAmount !== undefined
      ) {
        if (giftCardPayload.thresholdAmount < 0) {
          throw new Error('Threshold amount cannot be negative');
        }
      }

      // Check for duplicate gift card number
      const Model = await this.getCachedModel();
      const existingGiftCard = await Model.findOne({
        number: giftCardPayload.number,
      });
      if (existingGiftCard) {
        throw new Error('Gift card with this number already exists');
      }

      // Create gift card using base service
      const giftCard = await this.create(giftCardPayload, createOptions);

      if (notificationOptions.sendEmail) {
        console.log('Sending gift card notifications...');
        await this._dispatchGiftCardNotifications({
          giftCard,
          notificationOptions,
          notificationContext: mergedNotificationContext,
        });
      }

      return giftCard;
    } catch (error) {
      // Re-throw with more context if needed
      if (
        error.message.includes('already exists') ||
        error.message.includes('required') ||
        error.message.includes('Invalid') ||
        error.message.includes('must be')
      ) {
        throw error;
      }
      throw new Error(`Failed to create gift card: ${error.message}`);
    }
  }

  /**
   * Update gift card by ID
   * @param {String} id - Gift card ID
   * @param {Object} payload - Update data
   * @param {Object} options - Optional options { session }
   * @returns {Promise<Object>} Updated gift card document
   */
  async updateGiftCard(id, payload, options = {}) {
    try {
      const { notificationContext = {}, ...updateOptions } = options || {};
      const {
        giftCardPayload,
        notificationOptions,
        notificationContext: inlineNotificationContext,
      } = this._splitNotificationOptions(payload);

      const mergedNotificationContext = {
        ...(notificationContext || {}),
        ...(inlineNotificationContext || {}),
      };

      this.validateObjectId(id);

      if (!giftCardPayload || typeof giftCardPayload !== 'object') {
        throw new Error('Update data must be a valid object');
      }

      // Check if gift card exists
      const existingGiftCard = await this.getGiftCardById(id);
      if (!existingGiftCard) {
        throw new Error(`Gift card with id ${id} not found`);
      }

      // Validate validity if being updated
      if (giftCardPayload.validity) {
        const validityDate = new Date(giftCardPayload.validity);
        if (validityDate <= new Date()) {
          throw new Error('Validity date must be a future date');
        }
      }

      // Validate customer scope changes
      if (giftCardPayload.customerScope !== undefined) {
        if (giftCardPayload.customerScope === 'Specific') {
          if (
            !giftCardPayload.assignedCustomerIds ||
            giftCardPayload.assignedCustomerIds.length === 0
          ) {
            // If not provided in payload, check existing
            if (
              !existingGiftCard.assignedCustomerIds ||
              existingGiftCard.assignedCustomerIds.length === 0
            ) {
              throw new Error(
                'At least one customer ID is required when customer scope is "Specific"',
              );
            }
          }
        } else if (giftCardPayload.customerScope === 'All') {
          giftCardPayload.assignedCustomerIds = [];
        }
      }

      // Validate threshold amount if being updated
      if (
        giftCardPayload.thresholdAmount !== null &&
        giftCardPayload.thresholdAmount !== undefined
      ) {
        if (giftCardPayload.thresholdAmount < 0) {
          throw new Error('Threshold amount cannot be negative');
        }
      }

      // Check for duplicate number if being updated
      if (giftCardPayload.number && giftCardPayload.number !== existingGiftCard.number) {
        const Model = await this.getCachedModel();
        const duplicateGiftCard = await Model.findOne({
          number: giftCardPayload.number,
        });
        if (duplicateGiftCard) {
          throw new Error('Gift card with this number already exists');
        }
      }

      // Update gift card using base service
      const updated = await this.updateById(id, giftCardPayload, updateOptions);

      if (notificationOptions.sendEmail) {
        console.log('Sending gift card notifications (update)...');
        await this._dispatchGiftCardNotifications({
          giftCard: updated,
          notificationOptions,
          notificationContext: mergedNotificationContext,
        });
      }

      return updated;
    } catch (error) {
      if (
        error.message.includes('not found') ||
        error.message.includes('required') ||
        error.message.includes('Invalid') ||
        error.message.includes('must be') ||
        error.message.includes('already exists')
      ) {
        throw error;
      }
      throw new Error(`Failed to update gift card: ${error.message}`);
    }
  }

  /**
   * Get gift card by ID
   * @param {String} id - Gift card ID
   * @param {Object} options - Optional options { populate }
   * @returns {Promise<Object>} Gift card document
   */
  async getGiftCardById(id, options = {}) {
    try {
      this.validateObjectId(id);

      const Model = await this.getCachedModel();
      // Exclude deleted records unless explicitly requested
      const includeDeleted = options.includeDeleted === true;
      let query = includeDeleted
        ? Model.findById(id)
        : Model.findOne({ _id: id, isDeleted: { $ne: true } });

      // Populate if specified
      if (options.populate) {
        const populateFields = Array.isArray(options.populate)
          ? options.populate
          : [options.populate];
        populateFields.forEach((field) => {
          query = query.populate(field);
        });
      }

      const giftCard = await query.exec();

      if (!giftCard) {
        throw new Error(`Gift card with id ${id} not found`);
      }

      return giftCard;
    } catch (error) {
      throw new Error(`Failed to retrieve gift card: ${error.message}`);
    }
  }

  /**
   * Get gift card by number
   * @param {String} number - Gift card number
   * @param {Object} options - Optional options { populate, includeDeleted }
   * @returns {Promise<Object>} Gift card document
   */
  async getGiftCardByNumber(number, options = {}) {
    try {
      if (!number || typeof number !== 'string') {
        throw new Error('Gift card number is required');
      }

      const Model = await this.getCachedModel();
      // Exclude deleted records unless explicitly requested
      const includeDeleted = options.includeDeleted === true;
      const queryFilter = {
        number: number.toUpperCase().trim(),
        ...(includeDeleted ? {} : { isDeleted: { $ne: true } }),
      };
      let query = Model.findOne(queryFilter);

      // Populate if specified
      if (options.populate) {
        const populateFields = Array.isArray(options.populate)
          ? options.populate
          : [options.populate];
        populateFields.forEach((field) => {
          query = query.populate(field);
        });
      }

      const giftCard = await query.exec();
      return giftCard;
    } catch (error) {
      throw new Error(`Failed to retrieve gift card: ${error.message}`);
    }
  }

  /**
   * Activate gift card
   * @param {String} id - Gift card ID
   * @returns {Promise<Object>} Updated gift card document
   */
  async activateGiftCard(id) {
    try {
      this.validateObjectId(id);

      const giftCard = await this.getGiftCardById(id);
      giftCard.status = 'Active';
      await giftCard.save();

      return giftCard;
    } catch (error) {
      throw new Error(`Failed to activate gift card: ${error.message}`);
    }
  }

  /**
   * Deactivate gift card
   * @param {String} id - Gift card ID
   * @returns {Promise<Object>} Updated gift card document
   */
  async deactivateGiftCard(id) {
    try {
      this.validateObjectId(id);

      const giftCard = await this.getGiftCardById(id);
      giftCard.status = 'Inactive';
      await giftCard.save();

      return giftCard;
    } catch (error) {
      throw new Error(`Failed to deactivate gift card: ${error.message}`);
    }
  }

  /**
   * Assign customers to gift card
   * @param {String} id - Gift card ID
   * @param {Array<String>} customerIds - Array of customer ObjectIds
   * @returns {Promise<Object>} Updated gift card document
   */
  async assignCustomers(id, customerIds, options = {}) {
    try {
      this.validateObjectId(id);

      if (!Array.isArray(customerIds) || customerIds.length === 0) {
        throw new Error('At least one customer ID is required');
      }

      const { notificationContext = {}, ...rawNotificationOptions } = options || {};
      const notificationOptions =
        this._normalizeNotificationOptions(rawNotificationOptions);

      // Validate all customer IDs
      customerIds.forEach((customerId) => {
        if (!mongoose.isValidObjectId(customerId)) {
          throw new Error(`Invalid customer ID: ${customerId}`);
        }
      });

      const giftCard = await this.getGiftCardById(id);

      // Check if scope is Specific
      if (giftCard.customerScope !== 'Specific') {
        throw new Error(
          'Cannot assign customers: Gift card scope must be "Specific"',
        );
      }

      // Add customers using instance method
      for (const customerId of customerIds) {
        await giftCard.addCustomer(customerId);
      }

      // Reload to get updated document
      const updatedGiftCard = await this.getGiftCardById(id);

      if (notificationOptions.sendEmail) {
        await this._dispatchGiftCardNotifications({
          giftCard: updatedGiftCard,
          notificationOptions,
          notificationContext,
        });
      }

      return updatedGiftCard;
    } catch (error) {
      if (
        error.message.includes('not found') ||
        error.message.includes('Invalid') ||
        error.message.includes('required') ||
        error.message.includes('Cannot assign')
      ) {
        throw error;
      }
      throw new Error(`Failed to assign customers: ${error.message}`);
    }
  }

  async _dispatchGiftCardNotifications({
    giftCard,
    notificationOptions,
    notificationContext = {},
  }) {
    if (!notificationOptions?.sendEmail) {
      return null;
    }

    if (!this.businessId) {
      console.warn(
        '[GiftCardService] Missing businessId; skipping notification dispatch.',
      );
      return null;
    }

    const normalizedGiftCard =
      giftCard && typeof giftCard.toObject === 'function'
        ? giftCard.toObject()
        : giftCard;

    try {
      const recipients = await this._resolveGiftCardRecipients({
        giftCard: normalizedGiftCard,
        notificationOptions,
      });

      if (!recipients.length) {
        console.warn(
          '[GiftCardService] No eligible recipients found for gift card notification.',
        );
        return null;
      }

      const batches = this._chunkArray(
        recipients,
        notificationOptions.batchSize,
      );
      const results = [];

      for (const batch of batches) {
        const settled = await Promise.allSettled(
          batch.map((recipient) =>
            this._sendGiftCardEmail({
              recipient,
              giftCard: normalizedGiftCard,
              notificationOptions,
              notificationContext,
            }),
          ),
        );
        results.push(...settled);
      }

      return results;
    } catch (error) {
      console.error(
        '[GiftCardService] Failed to dispatch gift card notifications:',
        error,
      );
      return null;
    }
  }

  async _resolveGiftCardRecipients({ giftCard, notificationOptions }) {
    if (notificationOptions?.overrideRecipients?.length) {
      return notificationOptions.overrideRecipients;
    }

    return this._fetchCustomersForScope(giftCard);
  }

  async _fetchCustomersForScope(giftCard) {
    try {
      const CustomerModel = await this.getModel(
        'Customer',
        CustomerSchema,
        'customers',
      );

      if (!CustomerModel) {
        return [];
      }

      const baseQuery = {
        isDeleted: false,
        email: { $exists: true, $ne: '' },
      };

      if (giftCard.customerScope === 'All') {
        baseQuery.isActive = true;
      } else {
        const assignedIds =
          giftCard.assignedCustomerIds?.map((id) =>
            id?.toString ? id.toString() : String(id),
          ) || [];

        if (!assignedIds.length) {
          return [];
        }

        baseQuery._id = { $in: assignedIds };
      }

      const customers = await CustomerModel.find(baseQuery, {
        customerName: 1,
        email: 1,
        phone: 1,
      }).lean();

      return (
        customers?.map((customer) => ({
          customerName: customer.customerName,
          email: customer.email,
          phone: customer.phone,
        })) || []
      );
    } catch (error) {
      console.error(
        '[GiftCardService] Failed to fetch customers for notification scope:',
        error,
      );
      return [];
    }
  }

  async _sendGiftCardEmail({
    recipient,
    giftCard,
    notificationOptions,
    notificationContext,
  }) {
    if (!recipient?.email) {
      return null;
    }

    const contextOptions = this._buildNotificationContext({
      recipient,
      giftCard,
      notificationOptions,
      notificationContext,
    });

    return TenantNotificationDispatcher.dispatch({
      businessId: this.businessId,
      label: notificationOptions.templateLabel,
      recipientType: notificationOptions.recipientType,
      recipient: { email: recipient.email },
      channels: notificationOptions.channels,
      contextOptions,
    });
  }

  _buildNotificationContext({
    recipient,
    giftCard,
    notificationOptions,
    notificationContext,
  }) {
    const sender =
      notificationContext?.sender || notificationOptions?.sender || null;

    const baseContext = {
      ...notificationContext,
      customer: {
        name:
          recipient.customerName ||
          recipient.name ||
          recipient.fullName ||
          '',
        email: recipient.email,
        phone: recipient.phone || '',
      },
      giftCard: {
        code: giftCard.number,
        value: giftCard.value,
        expiryDate: giftCard.validity,
        image: giftCard.giftCardImage || giftCard.image,
        personalMessage:
          notificationOptions?.personalMessage ||
          notificationContext?.personalMessage ||
          giftCard?.terms ||
          '',
      },
      metadata: {
        giftCardId: giftCard._id?.toString?.() || giftCard.id || '',
        scope: giftCard.customerScope,
      },
    };

    if (sender && !baseContext.sender) {
      baseContext.sender = sender;
    }

    return baseContext;
  }

  _chunkArray(list = [], size = EMAIL_BATCH_SIZE) {
    if (!Array.isArray(list) || list.length === 0) {
      return [];
    }

    const chunkSize = size > 0 ? size : EMAIL_BATCH_SIZE;
    const chunks = [];

    for (let i = 0; i < list.length; i += chunkSize) {
      chunks.push(list.slice(i, i + chunkSize));
    }

    return chunks;
  }

  _splitNotificationOptions(payload = {}) {
    if (!payload || typeof payload !== 'object') {
      return {
        giftCardPayload: {},
        notificationOptions: this._normalizeNotificationOptions(),
        notificationContext: {},
      };
    }

    const {
      options: inlineOptions = {},
      notificationOptions = {},
      notificationContext = {},
      ...giftCardPayload
    } = payload;

    const mergedNotificationOptions = this._normalizeNotificationOptions({
      ...inlineOptions,
      ...notificationOptions,
    });

    return {
      giftCardPayload,
      notificationOptions: mergedNotificationOptions,
      notificationContext,
    };
  }

  _normalizeNotificationOptions(options = {}) {
    const sendEmail = Boolean(options.sendEmail);
    const templateLabel =
      typeof options.templateLabel === 'string' && options.templateLabel.trim()
        ? options.templateLabel.trim()
        : DEFAULT_GIFTCARD_TEMPLATE_LABEL;
    const recipientType =
      typeof options.recipientType === 'string' &&
        options.recipientType.trim()
        ? options.recipientType.trim()
        : 'customer';
    const batchSize =
      Number.isInteger(options.batchSize) && options.batchSize > 0
        ? options.batchSize
        : EMAIL_BATCH_SIZE;

    const channels =
      Array.isArray(options.channels) && options.channels.length
        ? Array.from(
          new Set(
            options.channels
              .filter((channel) => typeof channel === 'string')
              .map((channel) => channel.toLowerCase()),
          ),
        )
        : ['email'];

    const overrideRecipients = Array.isArray(options.recipients)
      ? options.recipients
        .filter((recipient) => recipient && recipient.email)
        .map((recipient) => ({
          customerName:
            recipient.customerName || recipient.name || recipient.fullName || '',
          email: recipient.email,
          phone: recipient.phone || '',
        }))
      : null;

    return {
      sendEmail,
      templateLabel,
      recipientType,
      batchSize,
      channels,
      overrideRecipients,
      sender: options.sender || null,
      personalMessage: options.personalMessage,
    };
  }
  /**
   * Remove customer from gift card
   * @param {String} id - Gift card ID
   * @param {String} customerId - Customer ObjectId
   * @returns {Promise<Object>} Updated gift card document
   */
  async removeCustomer(id, customerId) {
    try {
      this.validateObjectId(id);
      this.validateObjectId(customerId);

      const giftCard = await this.getGiftCardById(id);

      // Check if scope is Specific
      if (giftCard.customerScope !== 'Specific') {
        throw new Error(
          'Cannot remove customer: Gift card scope must be "Specific"',
        );
      }

      // Remove customer using instance method
      await giftCard.removeCustomer(customerId);

      // Reload to get updated document
      return await this.getGiftCardById(id);
    } catch (error) {
      if (
        error.message.includes('not found') ||
        error.message.includes('Invalid') ||
        error.message.includes('Cannot remove')
      ) {
        throw error;
      }
      throw new Error(`Failed to remove customer: ${error.message}`);
    }
  }

  /**
   * Get active gift cards with filters and pagination
   * @param {Object} options - Query options
   * @param {Number} options.page - Page number
   * @param {Number} options.limit - Items per page
   * @param {String} options.search - Search term
   * @param {Object} options.filters - Additional filters
   * @returns {Promise<Object>} Paginated results
   */
  async getActiveGiftCards(options = {}) {
    try {
      const Model = await this.getCachedModel();
      const activeGiftCards = await Model.findActive();

      // Apply additional filters if provided
      let filtered = activeGiftCards;
      if (options.filters) {
        // Convert to array for filtering
        const cardsArray = Array.isArray(activeGiftCards)
          ? activeGiftCards
          : [activeGiftCards];
        filtered = cardsArray.filter((card) => {
          return Object.keys(options.filters).every((key) => {
            return card[key] === options.filters[key];
          });
        });
      }

      // Apply search if provided
      if (options.search) {
        const searchLower = options.search.toLowerCase();
        filtered = filtered.filter(
          (card) =>
            card.name.toLowerCase().includes(searchLower) ||
            card.number.toLowerCase().includes(searchLower),
        );
      }

      // Apply pagination
      const page = options.page || 1;
      const limit = options.limit || 10;
      const skip = (page - 1) * limit;
      const paginated = filtered.slice(skip, skip + limit);

      return {
        data: paginated,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(filtered.length / limit),
          totalItems: filtered.length,
          itemsPerPage: limit,
          hasNext: skip + limit < filtered.length,
          hasPrev: page > 1,
        },
      };
    } catch (error) {
      throw new Error(`Failed to retrieve active gift cards: ${error.message}`);
    }
  }

  /**
   * Get gift cards by customer
   * @param {String} customerId - Customer ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of gift card documents
   */
  async getGiftCardsByCustomer(customerId, options = {}) {
    try {
      this.validateObjectId(customerId);

      const Model = await this.getCachedModel();
      const giftCards = await Model.findByCustomer(customerId);

      // Apply populate if specified
      if (options.populate) {
        const populateFields = Array.isArray(options.populate)
          ? options.populate
          : [options.populate];
        return await Model.findByCustomer(customerId).populate(populateFields);
      }

      return giftCards;
    } catch (error) {
      throw new Error(
        `Failed to retrieve gift cards by customer: ${error.message}`,
      );
    }
  }

  /**
   * Get expired gift cards
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of expired gift card documents
   */
  async getExpiredGiftCards(options = {}) {
    try {
      const Model = await this.getCachedModel();
      const expiredGiftCards = await Model.findExpired();

      // Apply populate if specified
      if (options.populate) {
        const populateFields = Array.isArray(options.populate)
          ? options.populate
          : [options.populate];
        return await Promise.all(
          expiredGiftCards.map((card) =>
            Model.findById(card._id).populate(populateFields),
          ),
        );
      }

      return expiredGiftCards;
    } catch (error) {
      throw new Error(
        `Failed to retrieve expired gift cards: ${error.message}`,
      );
    }
  }

  /**
   * Get gift cards expiring soon
   * @param {Number} days - Number of days (default: 30)
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of gift card documents
   */
  async getExpiringSoon(days = 30, options = {}) {
    try {
      if (typeof days !== 'number' || days < 1) {
        throw new Error('Days must be a positive number');
      }

      const Model = await this.getCachedModel();
      const expiringGiftCards = await Model.findExpiringSoon(days);

      // Apply populate if specified
      if (options.populate) {
        const populateFields = Array.isArray(options.populate)
          ? options.populate
          : [options.populate];
        return await Promise.all(
          expiringGiftCards.map((card) =>
            Model.findById(card._id).populate(populateFields),
          ),
        );
      }

      return expiringGiftCards;
    } catch (error) {
      throw new Error(
        `Failed to retrieve expiring gift cards: ${error.message}`,
      );
    }
  }

  /**
   * Get gift cards by value range
   * @param {Number} minValue - Minimum value
   * @param {Number} maxValue - Maximum value
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of gift card documents
   */
  async getByValueRange(minValue, maxValue, options = {}) {
    try {
      if (typeof minValue !== 'number' || minValue < 0) {
        throw new Error('Minimum value must be a non-negative number');
      }
      if (typeof maxValue !== 'number' || maxValue < 0) {
        throw new Error('Maximum value must be a non-negative number');
      }
      if (minValue > maxValue) {
        throw new Error('Minimum value cannot be greater than maximum value');
      }

      const Model = await this.getCachedModel();
      const giftCards = await Model.findByValueRange(minValue, maxValue);

      // Apply populate if specified
      if (options.populate) {
        const populateFields = Array.isArray(options.populate)
          ? options.populate
          : [options.populate];
        return await Promise.all(
          giftCards.map((card) =>
            Model.findById(card._id).populate(populateFields),
          ),
        );
      }

      return giftCards;
    } catch (error) {
      throw new Error(
        `Failed to retrieve gift cards by value range: ${error.message}`,
      );
    }
  }

  /**
   * Validate and check if gift card can be used
   * @param {Object} params - Validation parameters
   * @param {String} params.number - Gift card number
   * @param {String} params.customerId - Customer ID
   * @param {Number} params.purchaseAmount - Purchase amount
   * @returns {Promise<Object>} Validation result
   */
  async validateAndCheckUsage({ number, customerId, purchaseAmount }) {
    const reasons = [];
    let giftCard = null;

    try {
      // Fetch gift card by number (ensure it's a full document, not lean, so arrays are populated)
      giftCard = await this.getGiftCardByNumber(number);

      if (!giftCard) {
        return {
          valid: false,
          reasons: ['Gift card number not found'],
          giftCard: null,
        };
      }

      // Ensure usedByCustomerIds is an array (handle cases where it might be undefined or null)
      if (!Array.isArray(giftCard.usedByCustomerIds)) {
        giftCard.usedByCustomerIds = [];
      }

      // Check if gift card is valid (not expired and active)
      if (!giftCard.isValid) {
        if (giftCard.isExpired) {
          reasons.push('Gift card is expired');
        }
        if (giftCard.status !== 'Active') {
          reasons.push('Gift card is inactive');
        }
      }

      // Check if customer can use this gift card
      if (customerId) {
        const customerIdStr = customerId.toString();
        
        if (giftCard.customerScope === 'All') {
          // For 'All' scope: Each customer can use the gift card once
          // Check if this specific customer has already used it
          const hasUsed = giftCard.usedByCustomerIds && giftCard.usedByCustomerIds.some(
            (id) => id && id.toString() === customerIdStr,
          );
          if (hasUsed) {
            reasons.push('Customer has already used this gift card');
          }
        } else if (giftCard.customerScope === 'Specific') {
          // For 'Specific' scope: Check if customer is assigned AND hasn't used it yet
          const isAssigned = giftCard.assignedCustomerIds.some(
            (id) => id.toString() === customerIdStr,
          );
          if (!isAssigned) {
            reasons.push('Customer is not assigned to this gift card');
          } else {
            // Check if customer has already used this gift card
            const hasUsed = giftCard.usedByCustomerIds && giftCard.usedByCustomerIds.some(
              (id) => id && id.toString() === customerIdStr,
            );
            if (hasUsed) {
              reasons.push('Customer has already used this gift card');
            }
            
            // Safety net: Check if usageCount exceeds number of assigned customers
            // This prevents edge cases where usageCount might be manipulated
            if (giftCard.usageCount >= giftCard.assignedCustomerIds.length) {
              reasons.push('Gift card usage limit reached');
            }
          }
        }
      } else {
        // If no customerId provided and scope is 'Specific', cannot validate
        if (giftCard.customerScope === 'Specific') {
          reasons.push('Customer ID is required to use this gift card');
        }
        // For 'All' scope without customerId, we can't validate per-customer usage
        // But we should still allow it if the gift card is valid (for walk-in customers)
      }

      // Check if purchase amount meets threshold
      if (purchaseAmount !== undefined && purchaseAmount !== null) {
        if (!giftCard.meetsThreshold(purchaseAmount)) {
          reasons.push(
            `Purchase amount does not meet the required threshold for this gift card (minimum: ${giftCard.thresholdAmount})`,
          );
        }
      }

      // If no reasons, gift card is valid
      if (reasons.length === 0) {
        return {
          valid: true,
          reasons: [],
          giftCard,
        };
      }

      return {
        valid: false,
        reasons,
        giftCard,
      };
    } catch (error) {
      return {
        valid: false,
        reasons: [error.message || 'Failed to validate gift card'],
        giftCard: null,
      };
    }
  }

  /**
   * Record gift card usage after successful sale
   * @param {String} giftCardId - Gift card ID
   * @param {String} customerId - Customer ID who used the gift card
   * @param {String} saleId - Sale ID for reference
   * @param {Number} amountUsed - Amount used from gift card
   * @param {Object} options - Options including session
   * @returns {Promise<Object>} Updated gift card
   */
  async recordUsage(giftCardId, customerId, saleId, amountUsed, options = {}) {
    try {
      const Model = await this.getModelRef();
      const giftCard = await Model.findById(giftCardId).session(options.session);

      if (!giftCard) {
        throw new Error('Gift card not found');
      }

      // For 'All' scope: Check if this specific customer has already used it
      if (giftCard.customerScope === 'All' && customerId) {
        if (giftCard.hasBeenUsedByCustomer(customerId)) {
          throw new Error('Customer has already used this gift card');
        }
      }

      // For 'Specific' scope: Check if customer has already used it AND usageCount safety net
      if (giftCard.customerScope === 'Specific') {
        if (customerId && giftCard.hasBeenUsedByCustomer(customerId)) {
          throw new Error('Customer has already used this gift card');
        }
        // Safety net: Check if usageCount exceeds number of assigned customers
        if (giftCard.usageCount >= giftCard.assignedCustomerIds.length) {
          throw new Error('Gift card usage limit reached');
        }
      }

      // Record the usage
      giftCard.recordUsage(customerId, saleId, amountUsed);
      
      await giftCard.save({ session: options.session });

      return giftCard;
    } catch (error) {
      throw new Error(`Failed to record gift card usage: ${error.message}`);
    }
  }

  /**
   * List gift cards with advanced filtering, search, and pagination
   * @param {Object} queryParams - Query parameters
   * @param {boolean} queryParams.all - If true, fetch all records without pagination
   * @param {boolean|string} queryParams.isActive - Filter by active status
   * @returns {Promise<Object>} Paginated results
   */
  async list(queryParams = {}) {
    try {
      const { all, isActive, status, customerScope, ...otherParams } =
        queryParams;

      // Build filters - always exclude deleted records
      const filters = {
        isDeleted: { $ne: true },
      };
      if (isActive !== undefined) {
        filters.status =
          isActive === 'true' || isActive === true ? 'Active' : 'Inactive';
      } else if (status) {
        filters.status = status;
      }
      if (customerScope) {
        filters.customerScope = customerScope;
      }

      const shouldFetchAll = all === true || all === 'true';
      const listParams = {
        ...otherParams,
        searchFields: ['name', 'number'],
        filters,
        populate: null,
        ...(shouldFetchAll && { limit: 10000, page: 1 }),
      };

      const result = await super.list(listParams);

      if (!result.data?.length) {
        return shouldFetchAll ? { data: [], total: 0 } : result;
      }

      // Collect all customer IDs that need population
      const customerIdsToFetch = new Set();
      for (const gc of result.data) {
        if (gc.customerScope === 'Specific' && gc.assignedCustomerIds?.length) {
          gc.assignedCustomerIds.forEach((id) =>
            customerIdsToFetch.add(typeof id === 'object' ? id.toString() : id),
          );
        }
      }

      // Fetch all customers in one query
      let customersMap = new Map();
      if (customerIdsToFetch.size > 0) {
        try {
          const CustomerModel = await this.getModel(
            'Customer',
            CustomerSchema,
            'customers',
          );
          const customers = await CustomerModel.find(
            { _id: { $in: [...customerIdsToFetch] } },
            { customerCode: 1, customerName: 1, email: 1, phone: 1 },
          ).lean();
          customers.forEach((c) => customersMap.set(c._id.toString(), c));
        } catch (err) {
          console.warn('Failed to populate customers:', err.message);
        }
      }

      // Transform gift cards - populate customers while keeping original structure
      const data = result.data.map((gc) => {
        const plain =
          typeof gc.toObject === 'function' ? gc.toObject() : { ...gc };

        // Remove virtuals only, keep _id
        const { __v, id, isExpired, isValid, daysUntilExpiration, formattedValidity, statusDisplay, ...rest } = plain;

        // Map assigned customers with populated fields
        let assignedCustomerIds = rest.assignedCustomerIds || [];
        if (
          rest.customerScope === 'Specific' &&
          rest.assignedCustomerIds?.length
        ) {
          assignedCustomerIds = rest.assignedCustomerIds
            .map((id) => {
              const idStr = typeof id === 'object' ? id.toString() : id;
              const customer = customersMap.get(idStr);
              if (!customer) return null;
              return {
                _id: customer._id,
                customerCode: customer.customerCode,
                customerName: customer.customerName,
                email: customer.email,
                phone: customer.phone,
              };
            })
            .filter(Boolean);
        }

        return {
          ...rest,
          assignedCustomerIds,
        };
      });

      // Return consistent response structure
      if (shouldFetchAll) {
        return {
          data,
          total: data.length,
        };
      }

      return {
        ...result,
        data,
      };
    } catch (error) {
      if (error.message.includes('connection')) {
        throw new Error(`Database connection failed: ${error.message}`);
      }
      throw new Error(`Failed to list gift cards: ${error.message}`);
    }
  }

  /**
   * Bulk get gift cards by IDs
   * @param {Array<string>} ids - Gift card IDs
   * @param {Object} options - Options for the query
   * @param {boolean} options.lean - Whether to return lean documents (default: true)
   * @param {boolean} options.throwOnNotFound - Whether to throw error if some IDs not found (default: false)
   * @returns {Promise<Object>} Result with gift cards, found count, and not found IDs
   */
  async bulkGetGiftCards(ids, options = {}) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error(
          'Gift card IDs array is required and must not be empty',
        );
      }

      const normalizedIds = ids.map((id) => {
        const normalized =
          typeof id === 'string' ? id.trim() : id?.toString?.();

        if (!normalized) {
          throw new Error('Invalid gift card ID format');
        }

        this.validateObjectId(normalized);
        return normalized;
      });

      const { lean = true, throwOnNotFound = false } = options;

      const Model = await this.getCachedModel();

      let query = Model.find({
        _id: { $in: normalizedIds },
      }).populate('assignedCustomerIds');

      if (lean) {
        query = query.lean();
      }

      const documents = await query;

      const foundIds = new Set(documents.map((doc) => doc._id.toString()));
      const notFoundIds = normalizedIds.filter((id) => !foundIds.has(id));

      if (throwOnNotFound && notFoundIds.length > 0) {
        throw new Error(`Gift cards not found: ${notFoundIds.join(', ')}`);
      }

      return {
        data: documents,
        found: documents.length,
        notFound: notFoundIds,
        totalRequested: normalizedIds.length,
      };
    } catch (error) {
      throw new Error(`Bulk get gift cards failed: ${error.message}`);
    }
  }

  /**
   * Bulk update gift card statuses
   * @param {Array<string>} ids - Gift card IDs
   * @param {String} status - New status ('Active' or 'Inactive')
   * @returns {Promise<Object>} Bulk update result
   */
  async bulkUpdateStatus(ids = [], status) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('IDs array is required and must not be empty');
      }

      ids.forEach((id) => this.validateObjectId(id));

      const allowedStatuses = ['Active', 'Inactive'];
      if (!status || !allowedStatuses.includes(status)) {
        throw new Error('Status must be either "Active" or "Inactive"');
      }

      const Model = await this.getCachedModel();
      const existing = await Model.find({ _id: { $in: ids } })
        .select('_id')
        .lean();

      const existingIds = new Set(existing.map((doc) => doc._id.toString()));
      const normalizedIds = ids.map((id) => id.toString());
      const notFound = normalizedIds.filter((id) => !existingIds.has(id));

      if (existing.length === 0) {
        return {
          matchedCount: 0,
          modifiedCount: 0,
          totalRequested: ids.length,
          notFound,
          status,
          message: 'No gift cards matched the provided IDs',
        };
      }

      const updateResult = await Model.updateMany(
        { _id: { $in: ids } },
        { $set: { status } },
      );

      const modifiedCount = updateResult?.modifiedCount ?? 0;
      const matchedCount = updateResult?.matchedCount ?? existing.length;

      return {
        matchedCount,
        modifiedCount,
        totalRequested: ids.length,
        notFound,
        status,
        message:
          modifiedCount > 0
            ? `${modifiedCount} gift card(s) updated to ${status}`
            : 'No gift cards were updated',
      };
    } catch (error) {
      throw new Error(
        `Failed to bulk update gift card statuses: ${error.message}`,
      );
    }
  }

  /**
   * Bulk delete gift cards (soft delete)
   * @param {Array<string>} ids - Gift card IDs
   * @returns {Promise<Object>} Bulk delete result
   */
  async bulkDelete(ids = []) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('IDs array is required and must not be empty');
      }

      ids.forEach((id) => this.validateObjectId(id));

      const Model = await this.getCachedModel();
      const existing = await Model.find({
        _id: { $in: ids },
        isDeleted: { $ne: true },
      })
        .select('_id')
        .lean();

      const existingIds = new Set(existing.map((doc) => doc._id.toString()));
      const normalizedIds = ids.map((id) => id.toString());
      const notFound = normalizedIds.filter((id) => !existingIds.has(id));

      if (existing.length === 0) {
        return {
          deletedCount: 0,
          totalRequested: ids.length,
          notFound,
          message: 'No gift cards matched the provided IDs',
        };
      }

      // Soft delete - set isDeleted flag
      const deleteResult = await Model.updateMany(
        { _id: { $in: ids }, isDeleted: { $ne: true } },
        { $set: { isDeleted: true, deletedAt: new Date() } },
      );
      const deletedCount = deleteResult?.modifiedCount ?? 0;

      return {
        deletedCount,
        totalRequested: ids.length,
        notFound,
        message:
          deletedCount > 0
            ? `${deletedCount} gift card(s) deleted successfully`
            : 'No gift cards were deleted',
      };
    } catch (error) {
      throw new Error(`Failed to bulk delete gift cards: ${error.message}`);
    }
  }

  /**
   * Delete gift card by ID (soft delete)
   * @param {String} id - Gift card ID
   * @returns {Promise<Object>} Deletion result
   */
  async deleteGiftCard(id) {
    try {
      this.validateObjectId(id);

      // Check if gift card exists and is not already deleted
      const giftCard = await this.getGiftCardById(id);

      if (giftCard.isDeleted) {
        throw new Error('Gift card is already deleted');
      }

      // Soft delete
      const Model = await this.getCachedModel();
      const deleted = await Model.findByIdAndUpdate(
        id,
        { isDeleted: true, deletedAt: new Date() },
        { new: true },
      );

      return deleted;
    } catch (error) {
      if (
        error.message.includes('not found') ||
        error.message.includes('already deleted')
      ) {
        throw error;
      }
      throw new Error(`Failed to delete gift card: ${error.message}`);
    }
  }

  /**
   * Restore a soft-deleted gift card
   * @param {String} id - Gift card ID
   * @returns {Promise<Object>} Restored gift card
   */
  async restoreGiftCard(id) {
    try {
      this.validateObjectId(id);

      const Model = await this.getCachedModel();
      const giftCard = await Model.findById(id);

      if (!giftCard) {
        throw new Error('Gift card not found');
      }

      if (!giftCard.isDeleted) {
        throw new Error('Gift card is not deleted');
      }

      const restored = await Model.findByIdAndUpdate(
        id,
        { isDeleted: false, deletedAt: null },
        { new: true },
      );

      return restored;
    } catch (error) {
      if (
        error.message.includes('not found') ||
        error.message.includes('not deleted')
      ) {
        throw error;
      }
      throw new Error(`Failed to restore gift card: ${error.message}`);
    }
  }
}

export default GiftCardService;
