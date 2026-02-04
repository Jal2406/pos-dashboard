import { BaseService, deleteImage } from '../utils/index.js';
import { GeneralSettings } from '../models/index.js';

class GeneralSettingsService extends BaseService {
  constructor() {
    super(GeneralSettings);
  }

  /**
   * Generate Google Maps iframe from coordinates
   * @param {Number} latitude - Latitude coordinate
   * @param {Number} longitude - Longitude coordinate
   * @returns {String} Google Maps iframe HTML string
   */
  generateIframe(latitude, longitude) {
    if (!latitude || !longitude || (latitude === 0 && longitude === 0)) {
      return '';
    }

    const mapUrl = `https://www.google.com/maps?q=${latitude},${longitude}&hl=es;z=14&output=embed`;
    return mapUrl;
  }

  /**
   * Create or update general settings
   * @param {Object} data - General settings data
   * @returns {Object} Created/updated general settings
   */
  async createOrUpdateSettings(data) {
    try {
      // Validate required fields
      const requiredFields = [
        'appName',
        'contactNumber',
        'inquiryEmail',
        'siteDescription',
      ];
      this.validateRequiredFields(data, requiredFields);

      // Generate iframe if coordinates are provided
      if (data.businessAddress?.latitude && data.businessAddress?.longitude) {
        data.businessAddress.mapUrl = this.generateIframe(
          data.businessAddress.latitude,
          data.businessAddress.longitude
        );
      }

      // Find existing settings
      const existingSettings = await this.model.findOne({});

      if (existingSettings) {
        // Update existing settings
        const updatedSettings = await this.model.findByIdAndUpdate(
          existingSettings._id,
          { $set: data },
          { new: true, runValidators: true },
        );
        return updatedSettings;
      } else {
        // Create new settings if none exist
        const settings = await this.create(data);
        return settings;
      }
    } catch (error) {
      throw new Error(
        `Error creating/updating general settings: ${error.message}`,
      );
    }
  }

  /**
   * Get current general settings
   * @returns {Object} Current general settings
   */
  async getCurrentSettings() {
    try {
      const settings = await this.model.findOne({});
      if (!settings) {
        throw new Error('No general settings found');
      }
      return settings;
    } catch (error) {
      throw new Error(`Error getting current settings: ${error.message}`);
    }
  }

  /**
   * Update general settings
   * @param {Object} data - Update data (includes logo URLs from upload endpoint)
   * @returns {Object} Updated general settings
   */
  async updateGeneralSettings(data) {
    try {
      // Generate iframe if coordinates are provided
      if (data.businessAddress?.latitude && data.businessAddress?.longitude) {
        data.businessAddress.mapUrl = this.generateIframe(
          data.businessAddress.latitude,
          data.businessAddress.longitude
        );
      }

      // Find existing settings (single document pattern)
      const existingSettings = await this.model.findOne({});

      let updatedSettings;
      if (existingSettings) {
        // Update existing settings
        updatedSettings = await this.model.findByIdAndUpdate(
          existingSettings._id,
          { $set: data },
          { new: true, runValidators: true },
        );
      } else {
        // Create new settings if none exist
        updatedSettings = await this.create(data);
      }

      return updatedSettings;
    } catch (error) {
      throw new Error(`Error updating general settings: ${error.message}`);
    }
  }





  /**
   * Validate general settings data
   * @param {Object} data - General settings data
   * @returns {Boolean} Validation result
   */
  validateGeneralSettingsData(data) {
    try {
      if (!data || typeof data !== 'object') {
        throw new Error('Data must be a valid object');
      }

      // Validate app name
      if (data.appName) {
        if (data.appName.length < 2 || data.appName.length > 50) {
          throw new Error('App name must be between 2 and 50 characters');
        }
      }

      // Validate contact number
      if (data.contactNumber) {
        const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
        if (!phoneRegex.test(data.contactNumber.replace(/[\s\-\(\)]/g, ''))) {
          throw new Error('Invalid contact number format');
        }
      }

      // Validate email
      if (data.inquiryEmail) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(data.inquiryEmail)) {
          throw new Error('Invalid email format');
        }
      }

      // Validate site description
      if (data.siteDescription && data.siteDescription.length > 500) {
        throw new Error('Site description must be less than 500 characters');
      }

      return true;
    } catch (error) {
      throw new Error(`Validation failed: ${error.message}`);
    }
  }

  /**
   * Delete specific logo
   * @param {String} logoType - Type of logo ('darkLogo' or 'lightLogo')
   * @returns {Object} Deletion result
   */
  async deleteLogo(logoType) {
    try {
      const settings = await this.model.findOne({});
      if (!settings) {
        throw new Error('No general settings found');
      }

      // Delete from Cloudinary if logo exists
      if (
        settings.logos &&
        settings.logos[logoType] &&
        settings.logos[logoType].publicId
      ) {
        await deleteImage(
          settings.logos[logoType].publicId,
          'generalSettings/logos',
        );
      }

      // Clear the specific logo from database
      const updateData = {
        [`logos.${logoType}.url`]: '',
        [`logos.${logoType}.publicId`]: '',
      };

      const updatedSettings = await this.model.findByIdAndUpdate(
        settings._id,
        { $set: updateData },
        { new: true, runValidators: true },
      );

      return {
        result: 'success',
        message: `${logoType} deleted successfully`,
        settings: updatedSettings,
      };
    } catch (error) {
      throw new Error(`Error deleting ${logoType}: ${error.message}`);
    }
  }
}

export default GeneralSettingsService;
