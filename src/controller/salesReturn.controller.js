import { StatusCodes } from 'http-status-codes';
import { ResponseService } from '../utils/index.js';
import { SalesReturnServices } from '../services/index.js';

class SalesReturnController {
  /**
   * Create a draft sales return
   */
  static async createDraft(req, res) {
    try {
      const service = new SalesReturnServices(req.businessId);
      const created = await service.createDraft(req.body, req.user?.id);
      return ResponseService.send(
        res,
        StatusCodes.CREATED,
        'Sales return draft created successfully',
        created,
      );
    } catch (error) {
      console.log(error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to create sales return draft',
      );
    }
  }

  /**
   * Get sales return by ID
   */
  static async getById(req, res) {
    try {
      const { id } = req.params;
      if (!id) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Sales return ID is required',
        );
      }

      const service = new SalesReturnServices(req.businessId);
      const result = await service.getById(id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Sales return fetched successfully',
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
        error.message || 'Failed to fetch sales return',
      );
    }
  }

  /**
   * List sales returns with filters
   */
  static async list(req, res) {
    try {
      const service = new SalesReturnServices(req.businessId);

      const queryParams = {
        page: parseInt(req.query.page || '1', 10),
        limit: parseInt(req.query.limit || '10', 10),
        search:
          typeof req.query.search === 'string' && req.query.search.trim()
            ? req.query.search.trim()
            : '',
        status: req.query.status,
        salesId: req.query.salesId,
        customerId: req.query.customerId,
        all: req.query.all,
      };

      const result = await service.list(queryParams);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Sales returns fetched successfully',
        result,
      );
    } catch (error) {
      console.error('Sales return list error:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch sales returns',
      );
    }
  }

  /**
   * Update sales return
   */
  static async update(req, res) {
    try {
      const { id } = req.params;
      const service = new SalesReturnServices(req.businessId);
      const result = await service.updateById(id, req.body, req.user?.id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Sales return updated successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to update sales return',
      );
    }
  }

  /**
   * Delete sales return
   */
  static async remove(req, res) {
    try {
      const service = new SalesReturnServices(req.businessId);
      const removed = await service.deleteById(req.params.id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Sales return deleted successfully',
        removed,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to delete sales return',
      );
    }
  }

  /**
   * Change sales return status
   * Only allows: pending -> complete
   * When status changes to "complete", stock is incremented and refunds are processed
   */
  static async changeStatus(req, res) {
    try {
      const { status, note, refund } = req.body || {};
      if (!status) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'status is required',
        );
      }

      if (!['pending', 'complete'].includes(status)) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'status must be either "pending" or "complete"',
        );
      }

      const id = req.params.id;
      const service = new SalesReturnServices(req.businessId);

      const result = await service.changeStatus(id, status, {
        note,
        refund,
        actorUserId: req.user?.id,
      });

      return ResponseService.send(
        res,
        StatusCodes.OK,
        `Sales return status changed to ${status} successfully`,
        result,
      );
    } catch (error) {
      console.log(error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to change sales return status',
      );
    }
  }

  /**
   * Complete sales return
   * This will increment stock, update sale tracking, and process refunds
   */
  static async complete(req, res) {
    try {
      const { id } = req.params;
      const { note, refund } = req.body || {};
      const service = new SalesReturnServices(req.businessId);
      const result = await service.completeReturn(id, {
        actorUserId: req.user?.id,
        note,
        refund,
      });

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Sales return completed successfully. Stock updated and refunds processed.',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to complete sales return',
      );
    }
  }

  /**
   * Record refund for completed sales return
   */
  static async recordRefund(req, res) {
    try {
      const { id } = req.params;
      const { amount, method, reference, notes, date } = req.body || {};

      const service = new SalesReturnServices(req.businessId);
      const result = await service.recordRefund(
        id,
        {
          amount,
          method,
          reference,
          notes,
          date,
        },
        req.user?.id,
      );

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Refund recorded successfully',
        result,
      );
    } catch (error) {
      console.log(error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to record refund',
      );
    }
  }
}

export default SalesReturnController;
