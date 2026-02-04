import { StatusCodes } from 'http-status-codes';
import { ResponseService } from '../utils/index.js';
import {
  PurchaseOrderServices,
  SupplierServices,
  ProductServices,
  TenantTaxService,
} from '../services/index.js';

class PurchaseOrderController {

  static async create(req, res) {
    try {
      // Validate user is authenticated
      if (!req.user || !req.user._id) {
        return ResponseService.send(
          res,
          StatusCodes.UNAUTHORIZED,
          'User authentication required to create purchase order',
        );
      }

      const service = new PurchaseOrderServices(req.businessId);
      const created = await service.create(req.body, req.user._id);

      return ResponseService.send(
        res,
        StatusCodes.CREATED,
        'Purchase order created successfully',
        created,
      );
    } catch (error) {
      console.log(error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to create purchase order',
      );
    }
  }

  static async getInitialData(req, res) {
    try {
      const { businessId } = req;
      const supplierService = new SupplierServices(businessId);
      const productService = new ProductServices(businessId);
      const taxService = new TenantTaxService(businessId);

      const [suppliers, productsData, taxes] = await Promise.all([
        supplierService.getAll({ status: true, isDeleted: false }),
        productService.list({ all: true, status: true }),
        taxService.getActiveTaxes(),
      ]);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Initial data fetched successfully',
        {
          suppliers,
          products: productsData.products,
          taxes,
        },
      );
    } catch (error) {
      console.error('Initial data fetch error:', error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to fetch initial data',
      );
    }
  }

  static async list(req, res) {
    try {
      const businessId = req.businessId;
      const service = new PurchaseOrderServices(businessId);

      const queryParams = {
        all: req.query.all,
        status: req.query.status, // draft | cancel | approve | billed
        page: parseInt(req.query.page || 1, 10),
        limit: parseInt(req.query.limit || 10, 10),
        search: req.query.search || '',
      };

      const result = await service.list(queryParams);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Purchase orders fetched successfully',
        result,
      );
    } catch (error) {
      console.error('Purchase order list error:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch purchase orders',
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
          'Purchase Order IDs array is required and must not be empty',
        );
      }

      const MAX_IDS = 100;
      if (ids.length > MAX_IDS) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          `Maximum ${MAX_IDS} purchase order IDs allowed per request`,
        );
      }

      const service = new PurchaseOrderServices(req.businessId);
      const result = await service.bulkGetPurchaseOrders(ids, {
        lean,
        throwOnNotFound,
      });

      const message =
        result.found === result.totalRequested
          ? 'All purchase orders fetched successfully'
          : result.found > 0
            ? `${result.found} of ${result.totalRequested} purchase orders fetched successfully`
            : 'No purchase orders found';

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
        error.message || 'Error fetching purchase orders',
      );
    }
  }

  static async bulkDelete(req, res) {
    try {
      const service = new PurchaseOrderServices(req.businessId);

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
        error.message || 'Failed to bulk delete purchase orders',
      );
    }
  }



  static async get(req, res) {
    try {
      const service = new PurchaseOrderServices(req.businessId);
      const item = await service.getByIdWithDetails(req.params.id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Purchase order fetched successfully',
        item,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.NOT_FOUND,
        error.message || 'Purchase order not found',
      );
    }
  }

  static async update(req, res) {
    try {
      // Define allowed update fields (whitelist)
      const allowedFields = [
        'supplier',
        'orderDetails',
        'shippingDetails',
        'items',
        'orderDiscountTax',
        'paymentTerms',
        'dueDate',
        'shippingMethod',
        'trackingNumber',
        'notes',
        'internalNotes',
        'supplierNotes',
        'attachments',
      ];

      // Filter request body to only allowed fields
      const updateData = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      }

      const service = new PurchaseOrderServices(req.businessId);
      const updated = await service.updateById(
        req.params.id,
        updateData,
        req.user?.id,
      );

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Purchase order updated successfully',
        updated,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to update purchase order',
      );
    }
  }

  static async changeStatus(req, res) {
    try {
      const { status, amountPaid, paymentAmount, note, ...otherOptions } =
        req.body;
      if (!status) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'status is required',
        );
      }

      const service = new PurchaseOrderServices(req.businessId);
      const updated = await service.changeStatus(req.params.id, status, {
        ...otherOptions,
        amountPaid,
        paymentAmount,
        note,
        actorUserId: req.user?.id || otherOptions.actorUserId,
      });

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Purchase order status changed successfully',
        updated,
      );
    } catch (error) {
      console.log("Purchase order status change error:", error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to change purchase order status',
      );
    }
  }

  static async remove(req, res) {
    try {
      const service = new PurchaseOrderServices(req.businessId);
      const removed = await service.deletePurchaseOrder(req.params.id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Purchase order deleted successfully',
        removed,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to delete purchase order',
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
      const service = new PurchaseOrderServices(businessId);
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
        error.message || 'Failed to bulk update purchase orders',
      );
    }
  }


  static async getPurchaseReportData(req, res) {
    try {
      const service = PurchaseOrderServices._getService(req);
      const report = await service.getPurchaseReportData(
        req.query,  // Pass query params as filters
        req.businessId,
      );
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Purchase report generated successfully',
        {
          data: report.data,  // The array of purchase report records
          summary: report.summary,
          filters: report.filters,
          pagination: report.pagination,
        }
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to generate purchase report',
      );
    }
  }



  static async generateInvoice(req, res) {
    try {
      const service = new PurchaseOrderServices(req.businessId);
      const updated = await service.generateInvoice(req.params.id, req.user?.id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Invoice generated successfully',
        updated,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to generate invoice',
      );
    }
  }

  static async sendEmail(req, res) {
    try {
      const service = new PurchaseOrderServices(req.businessId);
      const result = await service.sendEmail(req.params.id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        result.message,
        result,
      );
    } catch (error) {
      const status = error.message.includes('not found')
        ? StatusCodes.NOT_FOUND
        : StatusCodes.BAD_REQUEST;
      return ResponseService.send(
        res,
        status,
        error.message || 'Failed to send email',
      );
    }
  }
}

export default PurchaseOrderController;
