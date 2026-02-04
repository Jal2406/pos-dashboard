import { BaseService } from '../utils/index.js';
import { GoogleLoginSetting } from '../models/index.js';

class GoogleLoginSettingServices extends BaseService {
  constructor() {
    super(GoogleLoginSetting);
  }

  // Get the single Google login setting (initialize defaults if none exist)
  async getGoogleLoginSetting() {
    let setting = await GoogleLoginSetting.findOne();
    if (!setting) {
      setting = await GoogleLoginSetting.initializeDefaults();
    }
    return setting;
  }

  // Update Google login setting (single instance)
  async update(data) {
    const existing = await GoogleLoginSetting.findOne();
    if (!existing) {
      // Initialize defaults first if no setting exists
      await GoogleLoginSetting.initializeDefaults();
    }

    // Update existing setting
    return await GoogleLoginSetting.findOneAndUpdate({}, data, {
      new: true,
      runValidators: true,
    });
  }

  // Toggle Google login enabled/disabled status
  async toggle() {
    let setting = await GoogleLoginSetting.findOne();
    if (!setting) {
      // Initialize defaults first if no setting exists
      setting = await GoogleLoginSetting.initializeDefaults();
    }

    setting.isEnabled = !setting.isEnabled;
    await setting.save();
    return setting;
  }

  // Verify Google login setting (basic validation)
  async verify() {
    let setting = await GoogleLoginSetting.findOne();
    if (!setting) {
      // Initialize defaults first if no setting exists
      setting = await GoogleLoginSetting.initializeDefaults();
    }

    // Basic validation - check if all required fields are present
    const isValid = !!(
      setting.clientId &&
      setting.clientSecret &&
      setting.redirectUri
    );

    if (!isValid) {
      throw new Error(
        'Google login settings are incomplete. Please provide all required fields.',
      );
    }

    // Update verification status
    setting.isVerified = true;
    setting.lastVerifiedAt = new Date();
    await setting.save();

    return setting;
  }

  // Get Google login status for debugging/admin purposes
  async getGoogleLoginStatus() {
    try {
      let setting = await GoogleLoginSetting.findOne({}).lean();
      if (!setting) {
        // Initialize defaults if no setting exists
        setting = await GoogleLoginSetting.initializeDefaults();
      }

      const isComplete = !!(
        setting.clientId &&
        setting.clientSecret &&
        setting.redirectUri
      );

      return {
        configured: isComplete,
        enabled: setting.isEnabled || false,
        verified: setting.isVerified || false,
        lastVerified: setting.lastVerifiedAt || null,
        message: isComplete
          ? setting.isEnabled
            ? setting.isVerified
              ? 'Google login is configured, enabled, and verified'
              : 'Google login is configured and enabled but not verified'
            : 'Google login is configured but disabled'
          : 'Google login settings incomplete',
      };
    } catch (error) {
      console.error('Error getting Google login status:', error);
      return {
        configured: false,
        enabled: false,
        verified: false,
        message: 'Error checking Google login status',
      };
    }
  }
}

export default GoogleLoginSettingServices;
