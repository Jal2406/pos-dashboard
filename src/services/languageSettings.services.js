import { BaseService } from '../utils/index.js';
import { LanguageSettings } from '../models/index.js';

class LanguageSettingsService extends BaseService {
  constructor() {
    super(LanguageSettings);
  }

  /**
   * Create or update language settings
   * @param {Object} data - Language settings data
   * @returns {Object} Created/updated language settings
   */
  async createOrUpdateSettings(data) {
    try {
      // Validate required fields
      const requiredFields = ['selectedLanguage', 'selectedFile'];
      this.validateRequiredFields(data, requiredFields);

      // Check if settings already exist
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
        // Create new settings
        const settings = await this.create(data);
        return settings;
      }
    } catch (error) {
      throw new Error(
        `Error creating/updating language settings: ${error.message}`,
      );
    }
  }

  /**
   * Get current language settings
   * @returns {Object} Current language settings
   */
  async getCurrentSettings() {
    try {
      const settings = await this.model.findOne({});
      if (!settings) {
        throw new Error('No language settings found');
      }
      return settings;
    } catch (error) {
      throw new Error(`Error getting current settings: ${error.message}`);
    }
  }

  /**
   * Get language settings with pagination and search
   * @param {Object} queryParams - Query parameters
   * @returns {Object} Paginated language settings
   */
  async getLanguageSettings(queryParams = {}) {
    try {
      const searchFields = ['selectedLanguage', 'selectedFile'];
      return await this.list({
        ...queryParams,
        searchFields,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });
    } catch (error) {
      throw new Error(`Error getting language settings: ${error.message}`);
    }
  }

  /**
   * Get language settings statistics
   * @returns {Object} Language settings statistics
   */
  async getLanguageSettingsStats() {
    try {
      const total = await this.count();
      const exists = total > 0;

      return {
        total,
        exists,
        lastUpdated: new Date(),
      };
    } catch (error) {
      throw new Error(
        `Error getting language settings statistics: ${error.message}`,
      );
    }
  }

  /**
   * Validate language settings data
   * @param {Object} data - Language settings data
   * @returns {Boolean} Validation result
   */
  validateLanguageSettingsData(data) {
    try {
      if (!data || typeof data !== 'object') {
        throw new Error('Data must be a valid object');
      }

      // Validate selected language
      if (data.selectedLanguage) {
        const validLanguages = ['ar', 'en', 'es', 'fr', 'de'];
        if (!validLanguages.includes(data.selectedLanguage)) {
          throw new Error(
            'Selected language must be one of: ar, en, es, fr, de',
          );
        }
      }

      // Validate selected file
      if (data.selectedFile) {
        const validFiles = ['auth', 'backup', 'constant', 'currency'];
        if (!validFiles.includes(data.selectedFile)) {
          throw new Error(
            'Selected file must be one of: auth, backup, constant, currency',
          );
        }
      }

      return true;
    } catch (error) {
      throw new Error(`Validation failed: ${error.message}`);
    }
  }

  /**
   * Get available language options
   * @returns {Array} Available language options
   */
  getAvailableLanguages() {
    return [
      { value: 'ar', label: 'العربي (AR)' },
      { value: 'en', label: 'English (EN)' },
      { value: 'es', label: 'Español (ES)' },
      { value: 'fr', label: 'Français (FR)' },
      { value: 'de', label: 'Deutsch (DE)' },
    ];
  }

  /**
   * Get available file options
   * @returns {Array} Available file options
   */
  getAvailableFiles() {
    return [
      { value: 'auth', label: 'Authentication' },
      { value: 'backup', label: 'Backup' },
      { value: 'constant', label: 'Constants' },
      { value: 'currency', label: 'Currency' },
    ];
  }
}

export default LanguageSettingsService;
