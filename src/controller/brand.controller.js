import { StatusCodes } from 'http-status-codes';
import { ResponseService } from '../utils/index.js';
import { BrandServices } from '../services/index.js';

class BrandController {
  static async create(req, res) {
    try {
      const brandServices = new BrandServices(req.businessId);
      const payload = { ...req.body };
      if (req.file && req.file.path) {
        payload.brandImage = req.file.path;
      }
      const created = await brandServices.create(payload);
      return ResponseService.send(
        res,
        StatusCodes.CREATED,
        'Brand created successfully',
        created,
      );
    } catch (error) {
      console.log(error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to create brand',
      );
    }
  }

  /**
  * List customers with pagination, filtering, and search
  * @param {Object} req - Express request object
  * @param {Object} res - Express response object
  * @returns {Promise<void>}
  */

  static async list(req, res) {
    try {
      const businessId = req.businessId;
      const brandServices = new BrandServices(businessId);

      const {
        page,
        limit,
        search,
        sortBy,
        sortOrder,
        all,
        isActive,
      } = req.query;

      const fetchAll = all === 'true' || all === true;

      const isActiveFilter =
        typeof isActive === 'boolean'
          ? isActive
          : typeof isActive === 'string'
            ? isActive.toLowerCase() === 'true'
            : undefined;

      const queryParams = {
        page: page ? parseInt(page) : undefined,
        limit: limit ? parseInt(limit) : undefined,
        search,
        sortBy,
        sortOrder,
        all: fetchAll,
        isActive: isActiveFilter,
      };

      // Remove undefined values
      Object.keys(queryParams).forEach(
        (key) => queryParams[key] === undefined && delete queryParams[key],
      );

      const result = await brandServices.list(queryParams);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Brands fetched successfully',
        result,
      );
    } catch (error) {
      console.error('Brand list error:', error);

      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch brands',
      );
    }
  }

  static async get(req, res) {
    try {
      const brandServices = new BrandServices(req.businessId);
      const item = await brandServices.getById(req.params.id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Brand fetched successfully',
        item,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.NOT_FOUND,
        error.message || 'Brand not found',
      );
    }
  }

  static async update(req, res) {
    try {
      const brandServices = new BrandServices(req.businessId);
      const payload = { ...req.body };
      if (req.file && req.file.path) {
        payload.brandImage = req.file.path;
      }
      const updated = await brandServices.updateById(req.params.id, payload);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Brand updated successfully',
        updated,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to update brand',
      );
    }
  }

  static async softDelete(req, res) {
    try {
      const brandServices = new BrandServices(req.businessId);
      const removed = await brandServices.softDeleteById(req.params.id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Brand Soft deleted successfully',
        removed,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to Soft delete brand',
      );
    }
  }

  /**
    * Restore soft-deleted brand
    * @param {Object} req - Express request object
    * @param {Object} res - Express response object
    * @returns {Promise<void>}
    */
  static async restore(req, res) {
    try {
      const businessId = req.businessId;
      const service = new BrandServices(businessId);

      const restored = await service.restoreBrand(req.params.id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Brand restored successfully',
        restored,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to restore brand',
      );
    }
  }


  /**
     * Bulk soft delete brand
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Promise<void>}
     */
  static async bulkSoftDelete(req, res) {
    try {
      const businessId = req.businessId;
      const service = new BrandServices(businessId);
      const { ids } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'ids must be a non-empty array',
        );
      }

      const result = await service.bulkSoftDelete(ids);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Brands soft deleted successfully',
        result,
      );
    } catch (error) {
      console.log('Bulk soft delete error:', error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to bulk soft delete brands ',
      );
    }
  }

  static async toggleStatus(req, res) {
    try {
      const brandServices = new BrandServices(req.businessId);
      const brand = await brandServices.getById(req.params.id);
      brand.status = !brand.status;
      await brand.save();
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Brand status updated successfully',
        brand,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to toggle brand status',
      );
    }
  }

  static async bulkUpdateStatus(req, res) {
    try {
      const { ids, status } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'IDs array is required and must not be empty',
        );
      }

      if (typeof status !== 'boolean') {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Status must be a boolean value',
        );
      }

      const brandServices = new BrandServices(req.businessId);
      const result = await brandServices.bulkUpdateStatus(ids, status);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Brand statuses updated successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to bulk update brand statuses',
      );
    }
  }

  static async bulkDelete(req, res) {
    try {
      const { ids } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'IDs array is required and must not be empty',
        );
      }

      const brandServices = new BrandServices(req.businessId);
      const result = await brandServices.bulkDelete(ids);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        result.message,
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to bulk delete brands',
      );
    }
  }

  static async getActiveBrands(req, res) {
    try {
      const brandServices = new BrandServices(req.businessId);
      const brands = await brandServices.getActiveBrands();
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Active brands fetched successfully',
        brands,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to fetch active brands',
      );
    }
  }

  static async bulkGet(req, res) {
    try {
      const { ids, lean, throwOnNotFound } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Brand IDs array is required and must not be empty',
        );
      }

      const MAX_IDS = 100;
      if (ids.length > MAX_IDS) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          `Maximum ${MAX_IDS} brand IDs allowed per request`,
        );
      }

      const brandServices = new BrandServices(req.businessId);
      const result = await brandServices.bulkGetBrands(ids, {
        lean,
        throwOnNotFound,
      });

      const message =
        result.found === result.totalRequested
          ? 'All brands fetched successfully'
          : result.found > 0
            ? `${result.found} of ${result.totalRequested} brands fetched successfully`
            : 'No brands found';

      return ResponseService.send(
        res,
        result.found > 0 ? StatusCodes.OK : StatusCodes.NOT_FOUND,
        message,
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Error fetching brands',
      );
    }
  }
}

export default BrandController;
