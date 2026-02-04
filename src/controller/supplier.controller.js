import { StatusCodes } from 'http-status-codes';
import { ResponseService } from '../utils/index.js';
import { SupplierServices } from '../services/index.js';

class SupplierController {
  static async create(req, res) {
    try {
      const supplierServices = new SupplierServices(req.businessId);
      const payload = { ...req.body };

      // Handle image upload
      if (req.file && req.file.path) {
        payload.supplierImage = req.file.path;
      }

      const userId = req.user ? (req.user.id || req.user._id || req.user.userId) : undefined;

      const created = await supplierServices.create(payload, userId);
      return ResponseService.send(
        res,
        StatusCodes.CREATED,
        'Supplier created successfully',
        created,
      );
    } catch (error) {
      console.log(error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to create supplier',
      );
    }
  }

  static async list(req, res) {
    try {
      const supplierServices = new SupplierServices(req.businessId);
      const result = await supplierServices.list(req.query);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Suppliers fetched successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch suppliers',
      );
    }
  }

  static async get(req, res) {
    try {
      const supplierServices = new SupplierServices(req.businessId);
      const item = await supplierServices.getByIdAndPopulate(req.params.id, [
        'businessId',
        'createdBy',
        'updatedBy',
      ]);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Supplier fetched successfully',
        item,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.NOT_FOUND,
        error.message || 'Supplier not found',
      );
    }
  }

  static async update(req, res) {
    try {
      const supplierServices = new SupplierServices(req.businessId);
      const payload = { ...req.body };

      // Handle image upload
      if (req.file && req.file.path) {
        payload.supplierImage = req.file.path;
      }

      const updated = await supplierServices.updateById(
        req.params.id,
        payload,
        req.user.id,
      );
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Supplier updated successfully',
        updated,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to update supplier',
      );
    }
  }

  static async remove(req, res) {
    try {
      const supplierServices = new SupplierServices(req.businessId);
      const removed = await supplierServices.deleteById(req.params.id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Supplier deleted successfully',
        removed,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to delete supplier',
      );
    }
  }

  static async toggleStatus(req, res) {
    try {
      const supplierServices = new SupplierServices(req.businessId);
      const supplier = await supplierServices.getById(req.params.id);

      // Toggle between true (active) and false (inactive)
      const newStatus = !supplier.status;
      const updated = await supplierServices.updateById(
        req.params.id,
        {
          status: newStatus,
        },
        req.user.id,
      );

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Supplier status updated successfully',
        updated,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to toggle supplier status',
      );
    }
  }

  static async updateStatus(req, res) {
    try {
      const { status } = req.body;
      const supplierServices = new SupplierServices(req.businessId);
      const updated = await supplierServices.updateById(
        req.params.id,
        {
          status,
        },
        req.user.id,
      );

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Supplier status updated successfully',
        updated,
      );
    } catch (error) {
      console.log(error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to update supplier status',
      );
    }
  }

  static async search(req, res) {
    try {
      const { q } = req.query;
      if (!q) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Search query is required',
        );
      }

      const supplierServices = new SupplierServices(req.businessId);
      const result = await supplierServices.search(q, req.query);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Search results fetched successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to search suppliers',
      );
    }
  }

  static async getByLocation(req, res) {
    try {
      const { city, state } = req.query;
      if (!city || !state) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'City and state are required',
        );
      }

      const supplierServices = new SupplierServices(req.businessId);
      const result = await supplierServices.getByLocation(
        city,
        state,
        req.query,
      );
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Suppliers by location fetched successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch suppliers by location',
      );
    }
  }

  static async getByStatus(req, res) {
    try {
      const { status } = req.params;
      const supplierServices = new SupplierServices(req.businessId);
      const result = await supplierServices.getByStatus(status, req.query);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        `Suppliers with status '${status}' fetched successfully`,
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch suppliers by status',
      );
    }
  }

  static async bulkDelete(req, res) {
    try {
      const supplierServices = new SupplierServices(req.businessId);
      const { ids } = req.body; // expects array of supplier IDs
      const result = await supplierServices.bulkDelete(ids);

      return ResponseService.send(res, StatusCodes.OK, result.message, result);
    } catch (error) {
      console.log(error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to bulk delete suppliers',
      );
    }
  }

  static async bulkUpdateStatus(req, res) {
    try {
      const { ids, status } = req.body;
      if (!ids || !Array.isArray(ids) || typeof status !== 'boolean') {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'IDs array and boolean status are required',
        );
      }

      const supplierServices = new SupplierServices(req.businessId);
      const result = await supplierServices.bulkUpdateStatus(
        ids,
        status,
        req.user.id,
      );

      return ResponseService.send(res, StatusCodes.OK, result.message, result);
    } catch (error) {
      console.log(error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to bulk update supplier status',
      );
    }
  }

  static async getActiveSuppliers(req, res) {
    try {
      const supplierServices = new SupplierServices(req.businessId);
      const result = await supplierServices.getActiveSuppliers(req.query);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Active suppliers fetched successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch active suppliers',
      );
    }
  }

  static async getSupplierStats(req, res) {
    try {
      const supplierServices = new SupplierServices(req.businessId);
      const stats = await supplierServices.getSupplierStats();
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Supplier statistics fetched successfully',
        stats,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch supplier statistics',
      );
    }
  }
}

export default SupplierController;
