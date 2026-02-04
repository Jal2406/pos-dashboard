import { StatusCodes } from 'http-status-codes';
import { ResponseService } from '../utils/index.js';
import TenantMiscSettingServices from '../services/tenantMiscSetting.services.js';

/**
 * TenantMiscSettingController
 * Handles HTTP requests for tenant-specific miscellaneous settings (timezone, date/time formats)
 */
class TenantMiscSettingController {
  /**
   * Resolve business ID from request
   * @param {Object} req - Express request object
   * @returns {String|null} Business ID
   */
  static resolveBusinessId(req) {
    return req.businessId || req.user?.businessId || null;
  }

  /**
   * Get service instance with business context
   * @param {Object} req - Express request object
   * @returns {TenantMiscSettingServices} Service instance
   */
  static getService(req) {
    const businessId = this.resolveBusinessId(req);
    if (!businessId) {
      throw new Error('Business context is required for tenant misc settings');
    }
    return new TenantMiscSettingServices(businessId);
  }

  /**
   * Get current misc settings
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async get(req, res) {
    try {
      const service = TenantMiscSettingController.getService(req);
      const setting = await service.getCurrentSettings();
      if (!setting) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'No tenant misc settings configured',
          null,
        );
      }
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Tenant misc settings fetched successfully',
        setting,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to fetch tenant misc settings',
      );
    }
  }

  /**
   * Create or update misc settings
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async createOrUpdate(req, res) {
    try {
      const service = TenantMiscSettingController.getService(req);
      const userId = req.user?._id || req.user?.id || null;
      const result = await service.createOrUpdate(req.body, { userId });
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Tenant misc settings saved successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to save tenant misc settings',
      );
    }
  }

  /**
   * Update specific settings fields
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async update(req, res) {
    try {
      if (!req.body || Object.keys(req.body).length === 0) {
        console.log('Request body is missing or empty. Please provide settings to update.');
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Request body is missing or empty. Please provide settings to update.',
        );
      }

      const service = TenantMiscSettingController.getService(req);
      const userId = req.user?._id || req.user?.id || null;

      // Extract only the allowed fields from request body
      const updates = {};
      const allowedFields = ['timeZone', 'UTC', 'dateFormat', 'timeFormat', 'dataTableRow'];

      allowedFields.forEach((field) => {
        if (field in req.body) {
          updates[field] = req.body[field];
        }
      });

      if (Object.keys(updates).length === 0) {
        console.log(`No valid fields to update. Allowed fields: ${allowedFields.join(', ')}`);
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          `No valid fields to update. Allowed fields: ${allowedFields.join(', ')}`,
        );
      }

      const result = await service.updateSettings(updates, { userId });
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Tenant misc settings updated successfully',
        result,
      );
    } catch (error) {
      console.log(`Failed to update tenant misc settings: ${error.message}`);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to update tenant misc settings',
      );
    }
  }

  /**
   * Reset settings to default values
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async resetToDefaults(req, res) {
    try {
      const service = TenantMiscSettingController.getService(req);
      const userId = req.user?._id || req.user?.id || null;
      const result = await service.resetToDefaults({ userId });
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Tenant misc settings reset to defaults successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to reset tenant misc settings',
      );
    }
  }

  /**
   * Delete misc settings
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async delete(req, res) {
    try {
      const service = TenantMiscSettingController.getService(req);
      await service.delete();
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Tenant misc settings deleted successfully',
        null,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to delete tenant misc settings',
      );
    }
  }

  /**
   * Get settings status
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getStatus(req, res) {
    try {
      const service = TenantMiscSettingController.getService(req);
      const status = await service.getSettingsStatus();
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Tenant misc settings status fetched successfully',
        status,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to fetch tenant misc settings status',
      );
    }
  }

  /**
   * Get available format options
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getFormatOptions(req, res) {
    try {
      const service = TenantMiscSettingController.getService(req);
      const options = {
        dateFormats: service.getAvailableDateFormats(),
        timeFormats: service.getAvailableTimeFormats(),
      };
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Format options retrieved successfully',
        options,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to fetch format options',
      );
    }
  }

  /**
   * Toggle dark mode setting
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async toggleDarkMode(req, res) {
    try {
      const service = TenantMiscSettingController.getService(req);
      const userId = req.user?._id || req.user?.id || null;
      const result = await service.toggleDarkMode({ userId });
      return ResponseService.send(
        res,
        StatusCodes.OK,
        `Dark mode ${result.darkMode ? 'enabled' : 'disabled'} successfully`,
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to toggle dark mode',
      );
    }
  }
}

export default TenantMiscSettingController;
