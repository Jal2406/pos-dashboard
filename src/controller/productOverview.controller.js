import { StatusCodes } from 'http-status-codes';
import { ProductOverviewServices } from '../services/index.js';
import { ResponseService } from '../utils/index.js';

const productOverviewService = new ProductOverviewServices();

class ProductOverviewController {
  static async create(req, res) {
    try {
      const payload = { ...req.body };
      if (req.file && req.file.path) {
        payload.overviewImage = req.file.path;
      }
      const created = await productOverviewService.create(payload);
      return ResponseService.send(
        res,
        StatusCodes.CREATED,
        'Product overviews created successfully',
        created,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to create Product overviews',
      );
    }
  }

  static async list(req, res) {
    try {
      const result = await productOverviewService.list(req.query);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Product overviews fetched successfully',
        result,
      );
    } catch (error) {
      console.log(error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch Product overviews',
      );
    }
  }

  static async listPublic(req, res) {
    try {
      const result = await productOverviewService.listPublic();
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Product overviews (public) fetched successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch public Product overviews',
      );
    }
  }

  static async get(req, res) {
    try {
      const item = await productOverviewService.getById(req.params.id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Product overviews fetched successfully',
        item,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.NOT_FOUND,
        error.message || 'Product overviews not found',
      );
    }
  }

  static async update(req, res) {
    try {
      const payload = { ...req.body };
      if (req.file && req.file.path) {
        payload.overviewImage = req.file.path;
      }
      const updated = await productOverviewService.updateById(
        req.params.id,
        payload,
      );
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Product overviews updated successfully',
        updated,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to update Product overviews',
      );
    }
  }

  static async remove(req, res) {
    try {
      const removed = await productOverviewService.deleteById(req.params.id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Product overviews deleted successfully',
        removed,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to delete Product overviews',
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

      const result = await productOverviewService.bulkUpdateStatus(ids, status);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Product overviews status updated successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error?.message || 'Error updating product overviews status',
      );
    }
  }

  static async bulkUpdate(req, res) {
    return ResponseService.send(
      res,
      StatusCodes.BAD_REQUEST,
      'bulkUpdate is not supported for Product overviews',
    );
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

      const result = await productOverviewService.bulkDelete(ids);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Product overviews deleted successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error?.message || 'Error deleting product overviews',
      );
    }
  }
}

export default ProductOverviewController;
