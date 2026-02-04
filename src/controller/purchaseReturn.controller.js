import { StatusCodes } from 'http-status-codes';
import { ResponseService } from '../utils/index.js';
import { PurchaseReturnServices } from '../services/index.js';

class PurchaseReturnController {
  static async createDraft(req, res) {
    try {
      const service = new PurchaseReturnServices(req.businessId);
      const created = await service.createDraft(req.body, req.user?.id);
      return ResponseService.send(
        res,
        StatusCodes.CREATED,
        'Purchase return draft created successfully',
        created,
      );
    } catch (error) {
      console.log(error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to create purchase return draft',
      );
    }
  }

  /**
   * Bulk get purchase returns by IDs
   */
  static async bulkGet(req, res) {
    try {
      const { ids, lean, throwOnNotFound, populate } = req.body || {};

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Purchase return IDs array is required and must not be empty',
        );
      }

      const MAX_IDS = 100;
      if (ids.length > MAX_IDS) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          `Maximum ${MAX_IDS} purchase return IDs allowed per request`,
        );
      }

      const service = new PurchaseReturnServices(req.businessId);
      const result = await service.bulkGetPurchaseReturns(ids, {
        lean,
        throwOnNotFound,
        populate,
      });

      const message =
        result.found === result.totalRequested
          ? 'All purchase returns fetched successfully'
          : result.found > 0
            ? `${result.found} of ${result.totalRequested} purchase returns fetched successfully`
            : 'No purchase returns found';

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
        error.message || 'Error fetching purchase returns',
      );
    }
  }

  static async bulkDelete(req, res) {
    try {
      const service = new PurchaseReturnServices(req.businessId);

      const result = await service.bulkDelete(req.body, req.businessId);

      const successCount = result.deleted;
      const failureCount = result.failed;

      return ResponseService.send(
        res,
        StatusCodes.OK,
        `Bulk deletion completed (${successCount} succeeded, ${failureCount} failed)`,
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to bulk delete purchase returns',
      );
    }
  }


  static async bulkUpdateStatus(req, res) {
    const { businessId, user } = req;

    if (!businessId || !user?._id) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        'Business ID and user ID are required',
      );
    }

    try {
      const service = new PurchaseReturnServices(businessId);
      const result = await service.bulkUpdateStatus(req.body, businessId, user._id);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        `Bulk status update completed (${result.updated} succeeded, ${result.failed} failed)`,
        result,
      );
    } catch (error) {
      console.error('BulkUpdateStatus Error:', error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to bulk update purchase returns',
      );
    }
  }


  static async getById(req, res) {
    try {
      const { id } = req.params;
      if (!id) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Purchase return ID is required',
        );
      }

      const service = new PurchaseReturnServices(req.businessId);
      const result = await service.getById(id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Purchase return fetched successfully',
        result,
      );
    } catch (error) {
      console.log(error);
      const statusCode =
        error.message?.includes('not found') ||
          error.message?.includes('Invalid')
          ? StatusCodes.NOT_FOUND
          : StatusCodes.INTERNAL_SERVER_ERROR;
      return ResponseService.send(
        res,
        statusCode,
        error.message || 'Failed to fetch purchase return',
      );
    }
  }

  static async list(req, res) {
    try {
      const service = new PurchaseReturnServices(req.businessId);

      const queryParams = {
        page: parseInt(req.query.page || '1', 10),
        limit: parseInt(req.query.limit || '10', 10),
        search:
          typeof req.query.search === 'string' && req.query.search.trim()
            ? req.query.search.trim()
            : '',
        status: req.query.status,
        all: req.query.all,
      };

      const result = await service.list(queryParams);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Purchase returns fetched successfully',
        result
      );
    } catch (error) {
      console.error('Purchase return list error:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch purchase returns'
      );
    }
  }


  static async changeStatus(req, res) {
    try {
      const { status, note, credit } = req.body || {};
      if (!status) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'status is required',
        );
      }

      const id = req.params.id;
      const service = new PurchaseReturnServices(req.businessId);

      const result = await service.changeStatus(id, status, {
        note,
        credit,
        actorUserId: req.user?.id
      });

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Purchase return status changed successfully',
        result,
      );
    } catch (error) {
      console.log(error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to change purchase return status',
      );
    }
  }

  static async update(req, res) {
    try {
      const { id } = req.params;
      const service = new PurchaseReturnServices(req.businessId);
      const result = await service.updateById(id, req.body);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Purchase return updated successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to update purchase return',
      );
    }
  }

  static async remove(req, res) {
    try {
      const service = new PurchaseReturnServices(req.businessId);
      const removed = await service.deletePurchaseReturn(req.params.id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Purchase return deleted successfully',
        removed,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to delete purchase return',
      );
    }
  }

  static async downloadInvoice(req, res) {
    try {
      const { id } = req.params;
      const service = new PurchaseReturnServices(req.businessId);

      const invoice = await service.buildInvoiceDTO(id);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Purchase return invoice generated successfully',
        invoice,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to generate invoice',
      );
    }
  }

}

export default PurchaseReturnController;
