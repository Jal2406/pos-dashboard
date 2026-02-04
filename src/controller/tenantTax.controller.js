import { TenantTaxService } from '../services/index.js';
import { ResponseService } from '../utils/index.js';
import { StatusCodes } from 'http-status-codes';

class TenantTaxController {
  static async create(req, res) {
    try {
      const businessId = req.businessId;
      const service = new TenantTaxService(businessId);
      const payload = req.body;
      const created = await service.create(payload);
      return ResponseService.send(
        res,
        StatusCodes.CREATED,
        'Tax created successfully',
        created,
      );
    } catch (error) {
      console.log('error', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error?.message || 'Error creating tax',
      );
    }
  }

  static async getById(req, res) {
    try {
      const businessId = req.businessId;
      const service = new TenantTaxService(businessId);
      const doc = await service.getById(req.params.id);
      if (!doc) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Tax not found',
          null,
        );
      }
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Tax retrieved successfully',
        doc,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error?.message || 'Error retrieving tax',
      );
    }
  }

  static async update(req, res) {
    try {
      const businessId = req.businessId;
      const service = new TenantTaxService(businessId);
      const updated = await service.updateById(req.params.id, req.body);
      if (!updated) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Tax not found',
          null,
        );
      }
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Tax updated successfully',
        updated,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error?.message || 'Error updating tax',
      );
    }
  }


  static async softDelete(req, res) {
    try {
      const tenantTaxServices = new TenantTaxService(req.businessId);
      const removed = await tenantTaxServices.softDeleteById(req.params.id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Tax Soft deleted successfully',
        removed,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to Soft delete tax',
      );
    }
  }

  static async restore(req, res) {
    try {
      const businessId = req.businessId;
      const service = new TenantTaxService(businessId);

      const restored = await service.restoreBrand(req.params.id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Tenant tax restored successfully',
        restored,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to restore tenant tax',
      );
    }
  }

  static async bulkSoftDelete(req, res) {
    try {
      const businessId = req.businessId;
      const service = new TenantTaxService(businessId);
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
        'Tax soft deleted successfully',
        result,
      );
    } catch (error) {
      console.log('Bulk soft delete error:', error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to bulk soft delete Tax ',
      );
    }
  }

  static async list(req, res) {
    try {
      const businessId = req.businessId;
      const service = new TenantTaxService(businessId);
      const results = await service.list(req.query);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Taxes retrieved successfully',
        results,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error?.message || 'Error retrieving taxes',
      );
    }
  }

  static async bulkUpdateStatus(req, res) {
    try {
      const businessId = req.businessId;
      const service = new TenantTaxService(businessId);
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

      const result = await service.bulkUpdateStatus(ids, status);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Taxes status updated successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error?.message || 'Error updating taxes status',
      );
    }
  }

  static async bulkGet(req, res) {
    try {
      const businessId = req.businessId;
      const service = new TenantTaxService(businessId);
      const { ids } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'ids must be a non-empty array',
        );
      }

      const result = await service.bulkGetByIds(ids);

      // Map documents to data to match common response structure
      const response = {
        data: result.documents,
        found: result.found,
        notFound: result.notFound,
        totalRequested: result.totalRequested,
      };

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Taxes retrieved successfully',
        response,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error?.message || 'Error retrieving taxes',
      );
    }
  }

  static async getActiveTaxes(req, res) {
    try {
      const businessId = req.businessId;
      const service = new TenantTaxService(businessId);
      const results = await service.getActiveTaxes(req.query);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Active taxes retrieved successfully',
        results,
      );
    } catch (error) {
      console.log('error', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error?.message || 'Error retrieving active taxes',
      );
    }
  }
}

export default TenantTaxController;
