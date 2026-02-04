import { StatusCodes } from 'http-status-codes';
import { SeoSettingsService } from '../services/index.js';
import { ResponseService } from '../utils/index.js';

const seoSettingsService = new SeoSettingsService();

class SeoSettingsController {
  /**
   * Create or update SEO settings
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async createOrUpdateSettings(req, res) {
    try {
      // Get file from either req.file or req.files[0]
      const uploadedFile = req.file || (req.files && req.files[0]);

      // Convert metaKeywords from comma-separated string to array
      let metaKeywords = [];
      if (req.body.metaKeywords) {
        if (Array.isArray(req.body.metaKeywords)) {
          metaKeywords = req.body.metaKeywords;
        } else if (typeof req.body.metaKeywords === 'string') {
          metaKeywords = req.body.metaKeywords
            .split(',')
            .map((k) => k.trim())
            .filter((k) => k.length > 0);
        }
      }

      const settingsData = {
        seoSlug: req.body.seoSlug,
        metaTitle: req.body.metaTitle,
        metaDescription: req.body.metaDescription,
        metaKeywords: metaKeywords,
        canonicalUrl: req.body.canonicalUrl,
        googleSiteVerification: req.body.googleSiteVerification,
        seoImage: {
          url:
            uploadedFile?.secure_url ||
            uploadedFile?.path ||
            req.body.seoImageUrl ||
            '',
          publicId:
            uploadedFile?.public_id ||
            uploadedFile?.filename ||
            req.body.seoImagePublicId ||
            '',
        },
      };

      // Validate data
      seoSettingsService.validateSeoSettingsData(settingsData);

      const settings =
        await seoSettingsService.createOrUpdateSettings(settingsData);

      return ResponseService.send(
        res,
        StatusCodes.CREATED,
        'SEO settings created/updated successfully',
        settings,
      );
    } catch (error) {
      console.log(error);
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  /**
   * Get all SEO settings with pagination and search
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getSeoSettings(req, res) {
    try {
      const { page, limit, search, sortBy, sortOrder } = req.query;

      const queryParams = {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 10,
        search: search || '',
        sortBy: sortBy || 'createdAt',
        sortOrder: sortOrder || 'desc',
      };

      const result = await seoSettingsService.getSeoSettings(queryParams);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'SEO settings retrieved successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  /**
   * Update SEO settings
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async updateSeoSettings(req, res) {
    try {
      // Convert metaKeywords from comma-separated string to array
      let metaKeywords = [];
      if (req.body.metaKeywords) {
        if (Array.isArray(req.body.metaKeywords)) {
          metaKeywords = req.body.metaKeywords;
        } else if (typeof req.body.metaKeywords === 'string') {
          metaKeywords = req.body.metaKeywords
            .split(',')
            .map((k) => k.trim())
            .filter((k) => k.length > 0);
        }
      }

      const updateData = {
        seoSlug: req.body.seoSlug,
        metaTitle: req.body.metaTitle,
        metaDescription: req.body.metaDescription,
        metaKeywords: metaKeywords,
        canonicalUrl: req.body.canonicalUrl,
        googleSiteVerification: req.body.googleSiteVerification,
      };

      // Handle SEO image updates
      const uploadedFile = req.file || (req.files && req.files[0]);
      if (uploadedFile?.secure_url) {
        updateData['seoImage.url'] = uploadedFile.secure_url;
        updateData['seoImage.publicId'] = uploadedFile.public_id;
      } else if (req.body.seoImageUrl) {
        updateData['seoImage.url'] = req.body.seoImageUrl;
        updateData['seoImage.publicId'] = req.body.seoImagePublicId;
      }

      // Validate update data
      seoSettingsService.validateSeoSettingsData(updateData);

      const updatedSettings = await seoSettingsService.updateSeoSettings(
        updateData,
        req.files,
      );

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'SEO settings updated successfully',
        updatedSettings,
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  /**
   * Delete SEO image
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async deleteSeoImage(req, res) {
    try {
      const result = await seoSettingsService.deleteSeoImage();

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'SEO image deleted successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }
}

export default SeoSettingsController;
