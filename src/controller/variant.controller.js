import { StatusCodes } from 'http-status-codes';
import { ResponseService } from '../utils/index.js';
import { VariantServices } from '../services/index.js';

class VariantController {
  static async create(req, res) {
    try {
      const variantServices = new VariantServices(req.businessId);
      const payload = { ...req.body };
      if (typeof payload.values === 'string') {
        payload.values = payload.values
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean)
          .map((value) => ({ value })); // Convert to object with value property
      } else if (Array.isArray(payload.values)) {
        // Handle array of strings (backward compatibility)
        payload.values = payload.values.map((item) =>
          typeof item === 'string' ? { value: item } : item,
        );
      }
      const created = await variantServices.create(payload);
      return ResponseService.send(
        res,
        StatusCodes.CREATED,
        'Variant created successfully',
        created,
      );
    } catch (error) {
      console.log(error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to create variant',
      );
    }
  }

  static async list(req, res) {
    try {
      const variantServices = new VariantServices(req.businessId);
      const result = await variantServices.list(req.query);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Variants fetched successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch variants',
      );
    }
  }

  /**
   * Bulk get variants by IDs
   * Retrieves multiple variants by their IDs
   * @param {Object} req - Express request object
   * @param {Array<string>} req.body.ids - Array of variant IDs to retrieve
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
        console.log('ids', ids);

        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Variant IDs array is required and must not be empty',
        );
      }

      // Limit maximum IDs to prevent abuse
      const MAX_IDS = 100;
      if (ids.length > MAX_IDS) {
        console.log('MAX_IDS', MAX_IDS);

        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          `Maximum ${MAX_IDS} variant IDs allowed per request`,
        );
      }

      // Call service method
      const variantServices = new VariantServices(req.businessId);
      const result = await variantServices.bulkGetVariants(ids, {
        lean,
        throwOnNotFound,
      });

      // Prepare response message
      const message =
        result.found === result.totalRequested
          ? 'All variants fetched successfully'
          : result.found > 0
            ? `${result.found} of ${result.totalRequested} variants fetched successfully`
            : 'No variants found';

      // Send response
      ResponseService.send(
        res,
        result.found > 0 ? StatusCodes.OK : StatusCodes.NOT_FOUND,
        message,
        result,
      );
    } catch (error) {
      console.log("ERROR", error)
      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Error fetching variants',
      );
    }
  }

  static async get(req, res) {
    try {
      const variantServices = new VariantServices(req.businessId);
      const item = await variantServices.getById(req.params.id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Variant fetched successfully',
        item,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.NOT_FOUND,
        error.message || 'Variant not found',
      );
    }
  }

  static async update(req, res) {
    try {
      const variantServices = new VariantServices(req.businessId);
      const payload = { ...req.body };
      if (typeof payload.values === 'string') {
        payload.values = payload.values
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean)
          .map((value) => ({ value })); // Convert to object with value property
      } else if (Array.isArray(payload.values)) {
        // Handle array of strings (backward compatibility)
        payload.values = payload.values.map((item) =>
          typeof item === 'string' ? { value: item } : item,
        );
      }
      const updated = await variantServices.updateById(req.params.id, payload);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Variant updated successfully',
        updated,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to update variant',
      );
    }
  }

  static async remove(req, res) {
    try {
      const variantServices = new VariantServices(req.businessId);
      const removed = await variantServices.deleteById(req.params.id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Variant deleted successfully',
        removed,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to delete variant',
      );
    }
  }

  static async toggleStatus(req, res) {
    try {
      const variantServices = new VariantServices(req.businessId);
      const doc = await variantServices.getById(req.params.id);
      doc.status = !doc.status;
      await doc.save();
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Variant status updated successfully',
        doc,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to toggle variant status',
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

      const variantServices = new VariantServices(req.businessId);
      const result = await variantServices.bulkUpdateStatus(ids, status);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Variant statuses updated successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to bulk update variant statuses',
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

      const variantServices = new VariantServices(req.businessId);
      const result = await variantServices.bulkDelete(ids);

      return ResponseService.send(res, StatusCodes.OK, result.message, result);
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to bulk delete variants',
      );
    }
  }

  /**
   * Get active variants
   * Retrieves all variants with status: true, commonly used for dropdowns/selects
   * @param {Object} req - Express request object
   * @param {string} req.query.sortBy - Field to sort by (optional, default: 'variant')
   * @param {string} req.query.sortOrder - Sort order 'asc' or 'desc' (optional, default: 'asc')
   * @param {Object} res - Express response object
   */
  static async getActive(req, res) {
    try {
      const { sortBy, sortOrder } = req.query;
      const variantServices = new VariantServices(req.businessId);

      const options = {};
      if (sortBy) {
        options.sortBy = sortBy;
      }
      if (sortOrder) {
        options.sortOrder = sortOrder;
      }

      const variants = await variantServices.getActiveVariants(options);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Active variants fetched successfully',
        variants,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch active variants',
      );
    }
  }
}

export default VariantController;
