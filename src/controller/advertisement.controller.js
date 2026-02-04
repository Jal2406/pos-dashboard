import { StatusCodes } from 'http-status-codes';
import { AdvertisementService } from '../services/index.js';
import { ResponseService } from '../utils/index.js';

const advertisementService = new AdvertisementService();

class AdvertisementController {
  /**
   * Create a new advertisement
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async createAdvertisement(req, res) {
    try {
      const advertisementData = {
        adName: req.body.adName,
        selectType: req.body.selectType,
        urlType: req.body.urlType,
        placement: req.body.placement,
        position: req.body.position,
        redirectUrl: req.body.redirectUrl,
        startDate: req.body.startDate,
        endDate: req.body.endDate,
        status:
          req.body.status !== undefined
            ? req.body.status === 'true' || req.body.status === true
            : true,
        mediaUrl: req.body.mediaUrl, // For URL type or Local (from upload route)
        mediaContent: req.body.mediaContent, // For direct mediaContent structure
      };

      // Validate that media is provided when urlType is "Local"
      if (advertisementData.urlType === 'Local') {
        const hasMediaUrl = !!advertisementData.mediaUrl;
        const hasMediaContentFileDetails =
          !!advertisementData.mediaContent?.fileDetails?.url;
        const hasMediaContentUrl = !!advertisementData.mediaContent?.url;

        if (!hasMediaUrl && !hasMediaContentFileDetails && !hasMediaContentUrl) {
          return ResponseService.send(
            res,
            StatusCodes.BAD_REQUEST,
            'Media URL is required when urlType is "Local". Please provide mediaUrl (URL from upload route) or mediaContent with fileDetails or url.',
          );
        }
      }

      console.log('Request body:', req.body);

      const advertisement =
        await advertisementService.createAdvertisement(advertisementData);

      return ResponseService.send(
        res,
        StatusCodes.CREATED,
        'Advertisement created successfully',
        advertisement,
      );
    } catch (error) {
      console.log(error);
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  /**
   * Bulk create advertisements - ultra-fast for multiple ads
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async bulkCreateAdvertisements(req, res) {
    try {
      const { advertisements } = req.body;

      if (!Array.isArray(advertisements) || advertisements.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Advertisements array is required and must not be empty',
        );
      }

      const result =
        await advertisementService.bulkCreateAdvertisements(advertisements);

      return ResponseService.send(
        res,
        StatusCodes.CREATED,
        result.message,
        result,
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  /**
   * Get all advertisements with filtering and pagination
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getAdvertisements(req, res) {
    try {
      const {
        page,
        limit,
        search,
        placement,
        position,
        status,
        selectType,
        urlType,
        sortBy,
        sortOrder,
      } = req.query;

      const queryParams = {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 10,
        search: search || '',
        placement: placement || '',
        position: position || '',
        status: status || '',
        selectType: selectType || '',
        urlType: urlType || '',
        sortBy: sortBy || 'createdAt',
        sortOrder: sortOrder || 'desc',
      };

      const result = await advertisementService.getAdvertisements(queryParams);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Advertisements retrieved successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  /**
   * Get advertisement by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getAdvertisementById(req, res) {
    try {
      const { id } = req.params;
      const advertisement = await advertisementService.getById(id);

      if (!advertisement) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Advertisement not found',
        );
      }

      // Clean the advertisement data to only include required fields
      const cleanedAdvertisement =
        advertisementService.cleanAdvertisementData(advertisement);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Advertisement retrieved successfully',
        cleanedAdvertisement,
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  /**
   * Update advertisement
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async updateAdvertisement(req, res) {
    try {
      const { id } = req.params;
      const updateData = {
        adName: req.body.adName,
        selectType: req.body.selectType,
        urlType: req.body.urlType,
        placement: req.body.placement,
        position: req.body.position,
        redirectUrl: req.body.redirectUrl,
        startDate: req.body.startDate,
        endDate: req.body.endDate,
        status:
          req.body.status !== undefined
            ? req.body.status === 'true' || req.body.status === true
            : undefined,
        mediaUrl: req.body.mediaUrl, // For URL type or Local (from upload route)
        mediaContent: req.body.mediaContent, // For direct mediaContent structure
      };

      // Remove undefined values
      Object.keys(updateData).forEach((key) => {
        if (updateData[key] === undefined) {
          delete updateData[key];
        }
      });

      const updatedAdvertisement =
        await advertisementService.updateAdvertisement(id, updateData);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Advertisement updated successfully',
        updatedAdvertisement,
      );
    } catch (error) {
      console.log(error);
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  /**
   * Delete advertisement
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async deleteAdvertisement(req, res) {
    try {
      const { id } = req.params;
      const result = await advertisementService.deleteAdvertisement(id);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Advertisement deleted successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  /**
   * Get all active advertisements
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getActiveAdvertisements(req, res) {
    try {
      const advertisements =
        await advertisementService.getAllActiveAdvertisements();

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Active advertisements retrieved successfully',
        advertisements,
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  /**
   * Get advertisement statistics
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getAdvertisementStats(req, res) {
    try {
      const stats = await advertisementService.getAdvertisementStats();

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Advertisement statistics retrieved successfully',
        stats,
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  /**
   * Toggle advertisement status
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async toggleAdvertisementStatus(req, res) {
    try {
      const { id } = req.params;
      const updatedAdvertisement =
        await advertisementService.toggleAdvertisementStatus(id);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Advertisement status toggled successfully',
        updatedAdvertisement,
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  /**
   * Increment click count
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async incrementClickCount(req, res) {
    try {
      const { id } = req.params;
      const updatedAdvertisement =
        await advertisementService.incrementClickCount(id);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Click count incremented successfully',
        updatedAdvertisement,
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  /**
   * Increment view count
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async incrementViewCount(req, res) {
    try {
      const { id } = req.params;
      const updatedAdvertisement =
        await advertisementService.incrementViewCount(id);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'View count incremented successfully',
        updatedAdvertisement,
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  /**
   * Clean up expired advertisements
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async cleanupExpiredAdvertisements(req, res) {
    try {
      const result = await advertisementService.cleanupExpiredAdvertisements();

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Expired advertisements cleaned up successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  /**
   * Get advertisements by placement and position
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getAdvertisementsByPlacement(req, res) {
    try {
      const { placement, position } = req.params;
      const { limit = 5 } = req.query;

      const advertisements = await advertisementService.getActiveAdvertisements(
        placement,
        position,
      );

      // Limit results if specified
      const limitedAdvertisements = limit
        ? advertisements.slice(0, parseInt(limit))
        : advertisements;

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Advertisements retrieved successfully',
        limitedAdvertisements,
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  static async bulkUpdateStatus(req, res) {
    try {
      const { ids, status } = req.body || {};

      if (!Array.isArray(ids) || ids.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'ids must be a non-empty array',
        );
      }
      if (typeof status !== 'boolean') {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'status must be a boolean',
        );
      }

      const result = await advertisementService.bulkUpdateStatus(ids, status);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Advertisements status updated successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error?.message || 'Error updating advertisements status',
      );
    }
  }

  static async bulkDelete(req, res) {
    try {
      const { ids } = req.body || {};

      if (!Array.isArray(ids) || ids.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'ids must be a non-empty array',
        );
      }

      const result = await advertisementService.bulkDelete(ids);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Advertisements deleted successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error?.message || 'Error deleting advertisements',
      );
    }
  }
}

export default AdvertisementController;
