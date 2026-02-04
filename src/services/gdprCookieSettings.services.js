import { BaseService } from '../utils/index.js';
import { GdprCookieSettings } from '../models/index.js';

class GdprCookieSettingsService extends BaseService {
  constructor() {
    super(GdprCookieSettings);
  }

  /**
   * Create or update GDPR cookie settings
   * @param {Object} data - GDPR cookie settings data
   * @returns {Object} Created/updated GDPR cookie settings
   */
  async createOrUpdateSettings(data) {
    try {
      // Validate required fields
      const requiredFields = ['enableGdprCookieNotice', 'cookieMessage'];
      this.validateRequiredFields(data, requiredFields);

      // Validate GDPR data
      this.validateGdprCookieData(data);

      // Delete all existing settings first (single record approach)
      await this.model.deleteMany({});

      // Create new settings
      const settings = await this.create(data);
      return settings;
    } catch (error) {
      throw new Error(
        `Error creating/updating GDPR cookie settings: ${error.message}`,
      );
    }
  }

  /**
   * Update GDPR cookie settings
   * @param {Object} data - Update data
   * @returns {Object} Updated GDPR cookie settings
   */
  async updateGdprCookieSettings(data) {
    try {
      // Find existing settings (since we have single database schema)
      const existingSettings = await this.model.findOne({});
      if (!existingSettings) {
        throw new Error('GDPR cookie settings not found');
      }

      // Validate GDPR data
      this.validateGdprCookieData(data);

      // Update the GDPR cookie settings
      const updatedSettings = await this.model.findByIdAndUpdate(
        existingSettings._id,
        { $set: data },
        { new: true, runValidators: true },
      );
      return updatedSettings;
    } catch (error) {
      throw new Error(`Error updating GDPR cookie settings: ${error.message}`);
    }
  }

  /**
   * Get GDPR cookie settings with pagination and search
   * @param {Object} queryParams - Query parameters
   * @returns {Object} Paginated GDPR cookie settings
   */
  async getGdprCookieSettings(queryParams = {}) {
    try {
      const searchFields = [
        'cookieMessage',
        'cookiePolicyUrl',
        'privacyPolicyUrl',
      ];
      return await this.list({
        ...queryParams,
        searchFields,
        sortBy: 'lastUpdated',
        sortOrder: 'desc',
      });
    } catch (error) {
      throw new Error(`Error getting GDPR cookie settings: ${error.message}`);
    }
  }

  /**
   * Toggle GDPR cookie notice status
   * @returns {Object} Updated settings
   */
  async toggleGdprCookieNotice() {
    try {
      const settings = await this.model.findOne({});
      if (!settings) {
        throw new Error('No GDPR cookie settings found');
      }

      // Toggle the enableGdprCookieNotice field
      const newStatus = !settings.enableGdprCookieNotice;

      const updatedSettings = await this.model.findByIdAndUpdate(
        settings._id,
        {
          $set: {
            enableGdprCookieNotice: newStatus,
          },
        },
        { new: true, runValidators: true },
      );

      return updatedSettings;
    } catch (error) {
      throw new Error(`Error toggling GDPR cookie notice: ${error.message}`);
    }
  }

  /**
   * Update cookie message
   * @param {String} message - New cookie message
   * @returns {Object} Updated settings
   */
  async updateCookieMessage(message) {
    try {
      // Validate message
      if (!message || typeof message !== 'string') {
        throw new Error('Cookie message is required and must be a string');
      }

      const trimmedMessage = message.trim();
      if (trimmedMessage.length < 10) {
        throw new Error('Cookie message must be at least 10 characters long');
      }
      if (trimmedMessage.length > 500) {
        throw new Error('Cookie message must not exceed 500 characters');
      }

      const settings = await this.model.findOne({});
      if (!settings) {
        throw new Error('No GDPR cookie settings found');
      }

      const updatedSettings = await this.model.findByIdAndUpdate(
        settings._id,
        {
          $set: {
            cookieMessage: trimmedMessage,
          },
        },
        { new: true, runValidators: true },
      );

      return updatedSettings;
    } catch (error) {
      throw new Error(`Error updating cookie message: ${error.message}`);
    }
  }

  /**
   * Validate GDPR cookie settings data
   * @param {Object} data - GDPR cookie settings data
   * @returns {Boolean} Validation result
   */
  validateGdprCookieData(data) {
    try {
      if (!data || typeof data !== 'object') {
        throw new Error('Data must be a valid object');
      }

      // Validate enableGdprCookieNotice field
      if (
        data.enableGdprCookieNotice !== undefined &&
        typeof data.enableGdprCookieNotice !== 'boolean'
      ) {
        throw new Error('enableGdprCookieNotice must be a boolean value');
      }

      // Validate cookieMessage
      if (data.cookieMessage !== undefined) {
        if (typeof data.cookieMessage !== 'string') {
          throw new Error('Cookie message must be a string');
        }

        const trimmedMessage = data.cookieMessage.trim();
        if (trimmedMessage.length < 10) {
          throw new Error('Cookie message must be at least 10 characters long');
        }

        if (trimmedMessage.length > 500) {
          throw new Error('Cookie message must not exceed 500 characters');
        }
      }

      return true;
    } catch (error) {
      throw new Error(`Validation failed: ${error.message}`);
    }
  }
}

export default GdprCookieSettingsService;
