import { StatusCodes } from 'http-status-codes';
import { ResponseService } from '../utils/index.js';
import { UnitServices } from '../services/index.js';

class UnitController {
  static async create(req, res) {
    try {
      const unitServices = new UnitServices(req.businessId);
      const created = await unitServices.create(req.body, req.businessId);
      return ResponseService.send(
        res,
        StatusCodes.CREATED,
        'Unit created successfully',
        created,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to create unit',
      );
    }
  }

  // static async list(req, res) {
  //   try {
  //     const unitServices = new UnitServices(req.businessId);
  //     const result = await unitServices.list(req.query, req.businessId);
  //     return ResponseService.send(
  //       res,
  //       StatusCodes.OK,
  //       'Units fetched successfully',
  //       result,
  //     );
  //   } catch (error) {
  //     return ResponseService.send(
  //       res,
  //       StatusCodes.INTERNAL_SERVER_ERROR,
  //       error.message || 'Failed to fetch units',
  //     );
  //   }
  // }

  /**
 * List customers with pagination, filtering, and search
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */

  static async list(req, res) {
    try {
      const businessId = req.businessId;
      const unitServices = new UnitServices(businessId);

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

      const result = await unitServices.list(queryParams);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Units fetched successfully',
        result,
      );
    } catch (error) {
      console.error('Unit list error:', error);

      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch Units',
      );
    }
  }

  static async get(req, res) {
    try {
      const unitServices = new UnitServices(req.businessId);
      const item = await unitServices.getById(req.params.id, req.businessId);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Unit fetched successfully',
        item,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.NOT_FOUND,
        error.message || 'Unit not found',
      );
    }
  }

  static async update(req, res) {
    try {
      const unitServices = new UnitServices(req.businessId);
      const updated = await unitServices.updateById(
        req.params.id,
        req.body,
        req.businessId,
      );
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Unit updated successfully',
        updated,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to update unit',
      );
    }
  }

  static async remove(req, res) {
    try {
      const unitServices = new UnitServices(req.businessId);
      const removed = await unitServices.deleteById(
        req.params.id,
        req.businessId,
      );
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Unit deleted successfully',
        removed,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to delete unit',
      );
    }
  }

  static async toggleStatus(req, res) {
    try {
      const unitServices = new UnitServices(req.businessId);
      const unit = await unitServices.getById(req.params.id, req.businessId);
      if (!unit) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Unit not found',
        );
      }
      const updated = await unitServices.updateById(
        req.params.id,
        { status: !unit.status },
        req.businessId,
      );
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Unit status updated successfully',
        updated,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to toggle unit status',
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

      const unitServices = new UnitServices(req.businessId);
      const result = await unitServices.bulkUpdateStatus(
        ids,
        status,
        req.businessId,
      );

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Unit statuses updated successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to bulk update unit statuses',
      );
    }
  }

  static async softDelete(req, res) {
    try {
      const unitServices = new UnitServices(req.businessId);
      const removed = await unitServices.softDeleteById(req.params.id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Unit soft deleted successfully',
        removed,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to soft delete unit'
      );
    }
  }


  static async restore(req, res) {
    try {
      const unitServices = new UnitServices(req.businessId);
      const result = await unitServices.restoreUnit(req.params.id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        result.message,
        result.data
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to restore unit'
      );
    }
  }



  static async bulkSoftDelete(req, res) {
    try {
      const businessId = req.businessId;
      const service = new UnitServices(businessId);
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
        'Unit soft deleted successfully',
        result,
      );
    } catch (error) {
      console.log('Bulk soft delete error:', error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to bulk soft delete Unit ',
      );
    }
  }

  static async bulkRestore(req, res) {
    try {
      const unitServices = new UnitServices(req.businessId);
      const { ids } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Unit IDs are required and must be a non-empty array'
        );
      }

      const { matchedCount, modifiedCount } = await unitServices.bulkRestore(ids);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        `Successfully restored ${modifiedCount} of ${matchedCount} requested units`,
        { matchedCount, modifiedCount }
      );
    } catch (error) {
      console.error('Bulk restore error:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to perform bulk restore'
      );
    }
  }

  static async getActiveUnits(req, res) {
    try {
      const unitServices = new UnitServices(req.businessId);
      const units = await unitServices.getActiveUnits(req.businessId);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Active units fetched successfully',
        units,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch active units',
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
          'Unit IDs array is required and must not be empty',
        );
      }

      const MAX_IDS = 100;
      if (ids.length > MAX_IDS) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          `Maximum ${MAX_IDS} unit IDs allowed per request`,
        );
      }

      const unitServices = new UnitServices(req.businessId);
      const result = await unitServices.bulkGetUnits(
        ids,
        { lean, throwOnNotFound },
        req.businessId,
      );

      const message =
        result.found === result.totalRequested
          ? 'All units fetched successfully'
          : result.found > 0
            ? `${result.found} of ${result.totalRequested} units fetched successfully`
            : 'No units found';

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
        error.message || 'Error fetching units',
      );
    }
  }
}

export default UnitController;
