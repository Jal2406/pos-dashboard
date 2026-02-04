import { StatusCodes } from 'http-status-codes';
import { LanguageSettingsServices } from '../services/index.js';
import { ResponseService } from '../utils/index.js';

const languageSettingsService = new LanguageSettingsServices();

class LanguageSettingsController {
  /**
   * Create or update language settings
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async createOrUpdateSettings(req, res) {
    try {
      const settingsData = {
        selectedLanguage: req.body.selectedLanguage,
        selectedFile: req.body.selectedFile,
      };

      // Validate data
      languageSettingsService.validateLanguageSettingsData(settingsData);

      const settings =
        await languageSettingsService.createOrUpdateSettings(settingsData);

      return ResponseService.send(
        res,
        StatusCodes.CREATED,
        'Language settings created/updated successfully',
        settings,
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  /**
   * Get all language settings with pagination and search
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getLanguageSettings(req, res) {
    try {
      const { page, limit, search, sortBy, sortOrder } = req.query;

      const queryParams = {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 10,
        search: search || '',
        sortBy: sortBy || 'createdAt',
        sortOrder: sortOrder || 'desc',
      };

      const result =
        await languageSettingsService.getLanguageSettings(queryParams);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Language settings retrieved successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  /**
   * Get the current language settings
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getCurrentSettings(req, res) {
    try {
      const settings = await languageSettingsService.getCurrentSettings();

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Current language settings retrieved successfully',
        settings,
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.NOT_FOUND, error.message);
    }
  }

  /**
   * Update language settings
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async updateLanguageSettings(req, res) {
    try {
      const { id } = req.params;

      const updateData = {
        selectedLanguage: req.body.selectedLanguage,
        selectedFile: req.body.selectedFile,
      };

      // Validate update data
      languageSettingsService.validateLanguageSettingsData(updateData);

      const updatedSettings = await languageSettingsService.updateById(
        id,
        updateData,
      );

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Language settings updated successfully',
        updatedSettings,
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  /**
   * Get language settings statistics
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getLanguageSettingsStats(req, res) {
    try {
      const stats = await languageSettingsService.getLanguageSettingsStats();

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Language settings statistics retrieved successfully',
        stats,
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  /**
   * Get available language options
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getAvailableLanguages(req, res) {
    try {
      const languages = languageSettingsService.getAvailableLanguages();

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Available languages retrieved successfully',
        languages,
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  /**
   * Get available file options
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getAvailableFiles(req, res) {
    try {
      const files = languageSettingsService.getAvailableFiles();

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Available files retrieved successfully',
        files,
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  /**
   * Delete language settings
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async deleteLanguageSettings(req, res) {
    try {
      const { id } = req.params;

      const deletedSettings = await languageSettingsService.deleteById(id);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Language settings deleted successfully',
        deletedSettings,
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }
}

export default LanguageSettingsController;
