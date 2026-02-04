import { BaseService } from '../utils/index.js';
import { TenantMiscSettingSchema } from '../models/index.js';

const ALLOWED_FIELDS = [
  'timeZone',
  'UTC',
  'dateFormat',
  'timeFormat',
  'dataTableRow',
];
const CACHE_TTL_MS = 30 * 1000; // 30 seconds

// Available date formats
const DATE_FORMATS = [
  'DD-MM-YYYY',
  'MM-DD-YYYY',
  'YYYY-MM-DD',
  'DD/MM/YYYY',
  'MM/DD/YYYY',
  'YYYY/MM/DD',
  'DD.MM.YYYY',
  'MM.DD.YYYY',
  'YYYY.MM.DD',
];

// Available time formats
const TIME_FORMATS = ['12', '24'];

/**
 * TenantMiscSettingServices
 * Service for managing tenant-specific miscellaneous settings (timezone, date/time formats)
 */
class TenantMiscSettingServices extends BaseService {
  constructor(businessId) {
    if (!businessId) {
      throw new Error('TenantMiscSettingServices initialized without businessId');
    }
    super({
      modelName: 'TenantMiscSetting',
      schema: TenantMiscSettingSchema,
      collection: 'tenantmiscsettings',
      businessId,
    });

    this.businessId = businessId;
    this._settingCache = null;
    this._cacheExpiresAt = 0;
  }

  /**
   * Assert that business context is present
   * @private
   */
  _assertBusiness() {
    if (!this.businessId) {
      throw new Error('Tenant misc settings require a business context');
    }
  }

  /**
   * Invalidate the settings cache
   * @private
   */
  _invalidateCache() {
    this._settingCache = null;
    this._cacheExpiresAt = 0;
  }

  /**
   * Get settings from cache or database
   * @param {Boolean} forceRefresh - Force a database fetch
   * @returns {Promise<Object>} Settings document
   * @private
   */
  async _getSettingFromCache(forceRefresh = false) {
    this._assertBusiness();
    const now = Date.now();
    if (!forceRefresh && this._settingCache && now < this._cacheExpiresAt) {
      return this._settingCache;
    }

    const Model = await this.getModel();
    let setting = await Model.findOne();

    // Auto-create default settings if none exist
    if (!setting) {
      setting = await Model.create({
        timeZone: 'UTC',
        UTC: '+00:00',
        dateFormat: 'DD-MM-YYYY',
        timeFormat: '24',
        dataTableRow: 10,
        darkMode: false,
      });
    }

    this._settingCache = setting;
    this._cacheExpiresAt = now + CACHE_TTL_MS;
    return setting;
  }

  /**
   * Get current misc settings
   * @param {Object} options - Options object
   * @param {Boolean} options.forceRefresh - Force a database fetch
   * @returns {Promise<Object>} Settings document
   */
  async getCurrentSettings(options = {}) {
    const { forceRefresh = false } = options;
    return this._getSettingFromCache(forceRefresh);
  }

  /**
   * Create or update misc settings
   * @param {Object} data - Settings data
   * @param {Object} userContext - User context with userId
   * @returns {Promise<Object>} Updated settings document
   */
  async createOrUpdate(data = {}, userContext = {}) {
    this._assertBusiness();
    const Model = await this.getModel();
    const payload = this._sanitizePayload(data, userContext);
    let setting;

    const existing = await Model.findOne();
    if (existing) {
      payload.updatedBy = userContext?.userId || existing.updatedBy;
      setting = await Model.findByIdAndUpdate(existing._id, payload, {
        new: true,
        runValidators: true,
      });
    } else {
      payload.createdBy = userContext?.userId || null;
      setting = await Model.create(payload);
    }

    this._invalidateCache();
    return setting;
  }

  /**
   * Update specific settings fields
   * @param {Object} updates - Fields to update
   * @param {Object} userContext - User context with userId
   * @returns {Promise<Object>} Updated settings document
   */
  async updateSettings(updates = {}, userContext = {}) {
    this._assertBusiness();
    this.validateSettingsData(updates);

    const Model = await this.getModel();
    const payload = this._sanitizePayload(updates, userContext);

    let setting = await Model.findOne();
    if (setting) {
      payload.updatedBy = userContext?.userId || setting.updatedBy;
      setting = await Model.findByIdAndUpdate(setting._id, payload, {
        new: true,
        runValidators: true,
      });
    } else {
      // Create with defaults and apply updates
      payload.createdBy = userContext?.userId || null;
      setting = await Model.create({
        timeZone: 'UTC',
        UTC: '+00:00',
        dateFormat: 'DD-MM-YYYY',
        timeFormat: '24',
        ...payload,
        dataTableRow: payload.dataTableRow ?? 10,
      });
    }

    this._invalidateCache();
    return setting;
  }

  /**
   * Reset settings to default values
   * @param {Object} userContext - User context with userId
   * @returns {Promise<Object>} Reset settings document
   */
  async resetToDefaults(userContext = {}) {
    this._assertBusiness();
    const Model = await this.getModel();

    const defaultSettings = {
      timeZone: 'UTC',
      UTC: '+00:00',
      dateFormat: 'DD-MM-YYYY',
      timeFormat: '24',
      dataTableRow: 10,
      updatedBy: userContext?.userId || null,
    };

    let setting = await Model.findOne();
    if (setting) {
      setting = await Model.findByIdAndUpdate(setting._id, defaultSettings, {
        new: true,
        runValidators: true,
      });
    } else {
      defaultSettings.createdBy = userContext?.userId || null;
      setting = await Model.create(defaultSettings);
    }

    this._invalidateCache();
    return setting;
  }

  /**
   * Delete all misc settings
   * @returns {Promise<Object>} Delete result
   */
  async delete() {
    this._assertBusiness();
    const Model = await this.getModel();
    const result = await Model.deleteMany({});
    this._invalidateCache();
    return result;
  }

  /**
   * Toggle dark mode
   * @param {Object} userContext - User context with userId
   * @returns {Promise<Object>} Updated settings document
   */
  async toggleDarkMode(userContext = {}) {
    this._assertBusiness();
    const Model = await this.getModel();

    let setting = await Model.findOne();
    if (!setting) {
      // Create with defaults and darkMode enabled
      setting = await Model.create({
        timeZone: 'UTC',
        UTC: '+00:00',
        dateFormat: 'DD-MM-YYYY',
        timeFormat: '24',
        darkMode: true,
        dataTableRow: 10,
        createdBy: userContext?.userId || null,
      });
    } else {
      // Toggle the current darkMode value
      setting = await Model.findByIdAndUpdate(
        setting._id,
        {
          darkMode: !setting.darkMode,
          updatedBy: userContext?.userId || null,
        },
        { new: true, runValidators: true },
      );
    }

    this._invalidateCache();
    return setting;
  }

  /**
   * Get settings status
   * @returns {Promise<Object>} Status object
   */
  async getSettingsStatus() {
    const setting = await this.getCurrentSettings();

    if (!setting) {
      return {
        configured: false,
        message: 'No tenant misc settings configured',
      };
    }

    const isComplete = Boolean(
      setting.timeZone &&
      setting.dateFormat &&
      setting.timeFormat &&
      Number.isInteger(setting.dataTableRow),
    );

    return {
      configured: isComplete,
      settings: {
        timeZone: setting.timeZone,
        UTC: setting.UTC,
        dateFormat: setting.dateFormat,
        timeFormat: setting.timeFormat,
        dataTableRow: setting.dataTableRow,
      },
      message: isComplete
        ? 'Tenant misc settings configured'
        : 'Tenant misc settings incomplete',
    };
  }

  /**
   * Validate settings data
   * @param {Object} data - Data to validate
   * @throws {Error} If validation fails
   */
  validateSettingsData(data) {
    if (data.dateFormat && !DATE_FORMATS.includes(data.dateFormat)) {
      throw new Error(
        `Invalid date format. Allowed formats: ${DATE_FORMATS.join(', ')}`,
      );
    }

    if (data.timeFormat && !TIME_FORMATS.includes(data.timeFormat)) {
      throw new Error(
        `Invalid time format. Allowed formats: ${TIME_FORMATS.join(', ')}`,
      );
    }

    if (data.UTC && !/^[+-]\d{2}:\d{2}$/.test(data.UTC)) {
      throw new Error(
        'Invalid UTC offset format. Use format like +05:30 or -08:00',
      );
    }

    if (
      Object.prototype.hasOwnProperty.call(data, 'dataTableRow') &&
      !(
        typeof data.dataTableRow === 'number' &&
        Number.isInteger(data.dataTableRow) &&
        data.dataTableRow >= 1
      )
    ) {
      throw new Error('dataTableRow must be an integer greater than or equal to 1');
    }
  }

  /**
   * Get available date formats
   * @returns {Array<String>} Available date formats
   */
  getAvailableDateFormats() {
    return DATE_FORMATS;
  }

  /**
   * Get available time formats
   * @returns {Array<String>} Available time formats
   */
  getAvailableTimeFormats() {
    return TIME_FORMATS;
  }

  /**
   * Sanitize payload for database operations
   * @param {Object} data - Input data
   * @param {Object} userContext - User context
   * @returns {Object} Sanitized payload
   * @private
   */
  _sanitizePayload(data, userContext) {
    const payload = {};

    for (const field of ALLOWED_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(data, field)) {
        payload[field] = data[field];
      }
    }

    // Trim string values
    if (payload.timeZone) {
      payload.timeZone = String(payload.timeZone).trim();
    }
    if (payload.UTC) {
      payload.UTC = String(payload.UTC).trim();
    }
    if (payload.dateFormat) {
      payload.dateFormat = String(payload.dateFormat).trim();
    }
    if (payload.timeFormat) {
      payload.timeFormat = String(payload.timeFormat).trim();
    }

    payload.updatedBy = userContext?.userId || null;
    return payload;
  }
}

export default TenantMiscSettingServices;
