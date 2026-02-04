import { StatusCodes } from 'http-status-codes';
import { GdprCookieSettingsService } from '../services/index.js';
import { ResponseService } from '../utils/index.js';

const gdprCookieSettingsService = new GdprCookieSettingsService();

class GdprCookieSettingsController {
  /**
   * Create or update GDPR cookie settings
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async createOrUpdateSettings(req, res) {
    try {
      const settingsData = {
        enableGdprCookieNotice: req.body.enableGdprCookieNotice,
        cookieMessage: req.body.cookieMessage,
      };

      // Validate data
      gdprCookieSettingsService.validateGdprCookieData(settingsData);

      const settings =
        await gdprCookieSettingsService.createOrUpdateSettings(settingsData);

      return ResponseService.send(
        res,
        StatusCodes.CREATED,
        'GDPR cookie settings created/updated successfully',
        settings,
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  /**
   * Get all GDPR cookie settings with pagination and search
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getGdprCookieSettings(req, res) {
    try {
      const { page, limit, search, sortBy, sortOrder } = req.query;

      const queryParams = {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 10,
        search: search || '',
        sortBy: sortBy || 'lastUpdated',
        sortOrder: sortOrder || 'desc',
      };

      const result =
        await gdprCookieSettingsService.getGdprCookieSettings(queryParams);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'GDPR cookie settings retrieved successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  /**
   * Update GDPR cookie settings
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async updateGdprCookieSettings(req, res) {
    try {
      const updateData = {
        enableGdprCookieNotice: req.body.enableGdprCookieNotice,
        cookieMessage: req.body.cookieMessage,
      };

      // Remove undefined values
      Object.keys(updateData).forEach((key) => {
        if (updateData[key] === undefined) {
          delete updateData[key];
        }
      });

      // Validate update data
      gdprCookieSettingsService.validateGdprCookieData(updateData);

      const updatedSettings =
        await gdprCookieSettingsService.updateGdprCookieSettings(updateData);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'GDPR cookie settings updated successfully',
        updatedSettings,
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  /**
   * Toggle GDPR cookie notice status
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async toggleGdprCookieNotice(req, res) {
    try {
      const result = await gdprCookieSettingsService.toggleGdprCookieNotice();

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'GDPR cookie notice status toggled successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  /**
   * Update cookie message
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async updateCookieMessage(req, res) {
    try {
      const { message } = req.body;

      if (!message) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Cookie message is required',
        );
      }

      const result =
        await gdprCookieSettingsService.updateCookieMessage(message);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Cookie message updated successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }
}

export default GdprCookieSettingsController;
