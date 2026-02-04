import { StatusCodes } from 'http-status-codes';
import { ResponseService } from '../utils/index.js';
import { WarrantyServices } from '../services/index.js';

class WarrantyController {
  static async create(req, res) {
    try {
      const warrantyServices = new WarrantyServices(req.businessId);
      const created = await warrantyServices.create(req.body);
      return ResponseService.send(
        res,
        StatusCodes.CREATED,
        'Warranty created successfully',
        created,
      );
    } catch (error) {
      console.log(error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to create Warranty',
      );
    }
  }

  static async list(req, res) {
    try {
      const warrantyServices = new WarrantyServices(req.businessId);
      const result = await warrantyServices.list(req.query);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Warranties fetched successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch Warranties',
      );
    }
  }

  static async get(req, res) {
    try {
      const warrantyServices = new WarrantyServices(req.businessId);
      const item = await warrantyServices.getById(req.params.id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Warranty fetched successfully',
        item,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.NOT_FOUND,
        error.message || 'Warranty not found',
      );
    }
  }

  static async update(req, res) {
    try {
      const warrantyServices = new WarrantyServices(req.businessId);
      if (!req.body || Object.keys(req.body).length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Request body is empty. Please provide data to update.',
        );
      }
      const updated = await warrantyServices.updateById(
        req.params.id,
        req.body,
      );
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Warranty updated successfully',
        updated,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to update Warranty',
      );
    }
  }

  static async remove(req, res) {
    try {
      const warrantyServices = new WarrantyServices(req.businessId);
      const removed = await warrantyServices.deleteById(req.params.id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Warranty deleted successfully',
        removed,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to delete Warranty',
      );
    }
  }

  static async toggleStatus(req, res) {
    try {
      const warrantyServices = new WarrantyServices(req.businessId);
      const warranty = await warrantyServices.toggleStatus(req.params.id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Warranty status updated successfully',
        warranty,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to toggle Warranty status',
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

      const warrantyServices = new WarrantyServices(req.businessId);
      const result = await warrantyServices.bulkUpdateStatus(ids, status);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Warranty statuses updated successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to bulk update Warranty statuses',
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

      const warrantyServices = new WarrantyServices(req.businessId);
      const result = await warrantyServices.bulkDelete(ids);

      return ResponseService.send(res, StatusCodes.OK, result.message, result);
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to bulk delete Warranties',
      );
    }
  }

  /**
   * Bulk get warranties by IDs
   * Retrieves multiple warranties by their IDs
   * @param {Object} req - Express request object
   * @param {Array<string>} req.body.ids - Array of warranty IDs to retrieve
   * @param {Boolean} req.body.lean - Return plain JavaScript objects (optional, default: true)
   * @param {Boolean} req.body.throwOnNotFound - Throw error if any ID not found (optional, default: false)
   * @param {Object} res - Express response object
   */
  static async bulkGet(req, res) {
    try {
      // Extract and validate IDs from request body
      const { ids, lean, throwOnNotFound } = req.body;

      // Validate IDs array
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Warranty IDs array is required and must not be empty',
        );
      }

      // Limit maximum IDs to prevent abuse
      const MAX_IDS = 100;
      if (ids.length > MAX_IDS) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          `Maximum ${MAX_IDS} warranty IDs allowed per request`,
        );
      }

      // Call service method
      const warrantyServices = new WarrantyServices(req.businessId);
      const result = await warrantyServices.bulkGetWarranties(ids, {
        lean,
        throwOnNotFound,
      });

      // Prepare response message
      const message =
        result.found === result.totalRequested
          ? 'All warranties fetched successfully'
          : result.found > 0
            ? `${result.found} of ${result.totalRequested} warranties fetched successfully`
            : 'No warranties found';

      // Send response
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
        error.message || 'Error fetching warranties',
      );
    }
  }

  /**
   * Get active warranties
   * Retrieves all warranties with status: true, commonly used for dropdowns/selects
   * @param {Object} req - Express request object
   * @param {string} req.query.sortBy - Field to sort by (optional, default: 'warranty')
   * @param {string} req.query.sortOrder - Sort order 'asc' or 'desc' (optional, default: 'asc')
   * @param {Object} res - Express response object
   */
  static async getActive(req, res) {
    try {
      const { sortBy, sortOrder } = req.query;
      const warrantyServices = new WarrantyServices(req.businessId);

      const options = {};
      if (sortBy) {
        options.sortBy = sortBy;
      }
      if (sortOrder) {
        options.sortOrder = sortOrder;
      }

      const warranties = await warrantyServices.getActiveWarranties(options);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Active warranties fetched successfully',
        warranties,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch active warranties',
      );
    }
  }
}

export default WarrantyController;
