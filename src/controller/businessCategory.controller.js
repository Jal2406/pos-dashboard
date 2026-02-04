import { StatusCodes } from 'http-status-codes';
import { ResponseService } from '../utils/index.js';
import { BusinessCategoryServices } from '../services/index.js';

const businessCategoryServices = new BusinessCategoryServices();

class BusinessCategoryController {
  static async create(req, res) {
    try {
      const created = await businessCategoryServices.create(req.body);
      return ResponseService.send(
        res,
        StatusCodes.CREATED,
        'Business category created successfully',
        created,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to create business category',
      );
    }
  }

  static async list(req, res) {
    try {
      const result = await businessCategoryServices.list(req.query);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Business categories fetched successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch business categories',
      );
    }
  }

  static async listPublic(req, res) {
    try {
      const result = await businessCategoryServices.listPublic(req.query);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Active business categories fetched successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch active business categories',
      );
    }
  }

  static async get(req, res) {
    try {
      const item = await businessCategoryServices.getById(req.params.id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Business category fetched successfully',
        item,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.NOT_FOUND,
        error.message || 'Business category not found',
      );
    }
  }

  static async update(req, res) {
    try {
      const updated = await businessCategoryServices.updateById(
        req.params.id,
        req.body,
      );
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Business category updated successfully',
        updated,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to update business category',
      );
    }
  }

  static async remove(req, res) {
    try {
      const removed = await businessCategoryServices.deleteById(req.params.id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Business category deleted successfully',
        removed,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to delete business category',
      );
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

      const result = await businessCategoryServices.bulkUpdateStatus(
        ids,
        status,
      );
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Business categories status updated successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error?.message || 'Error updating business categories status',
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

      const result = await businessCategoryServices.bulkDelete(ids);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Business categories deleted successfully',
        result,
      );
    } catch (error) {
      console.log(error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error?.message || 'Error deleting business categories',
      );
    }
  }

  /**
   * Bulk get business categories by IDs
   */
  static async bulkGet(req, res) {
    try {
      const { ids, lean, throwOnNotFound } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Business category IDs array is required and must not be empty',
        );
      }

      const MAX_IDS = 100;
      if (ids.length > MAX_IDS) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          `Maximum ${MAX_IDS} business category IDs allowed per request`,
        );
      }

      const result = await businessCategoryServices.bulkGetBusinessCategories(ids, {
        lean,
        throwOnNotFound,
      });

      const message =
        result.found === result.totalRequested
          ? 'All business categories fetched successfully'
          : result.found > 0
            ? `${result.found} of ${result.totalRequested} business categories fetched successfully`
            : 'No business categories found';

      ResponseService.send(
        res,
        result.found > 0 ? StatusCodes.OK : StatusCodes.NOT_FOUND,
        message,
        result,
      );
    } catch (error) {
      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Error fetching business categories',
      );
    }
  }
}

export default BusinessCategoryController;
