import { StatusCodes } from 'http-status-codes';
import { ResponseService } from '../utils/index.js';
import { ProductCategoryServices } from '../services/index.js';

// Build tenant-aware service per request
const getProductCategoryService = (req) =>
  new ProductCategoryServices(req.businessId);

class ProductCategoryController {
  static async create(req, res) {
    try {
      const categoryData = {
        ...req.body,
        business: req.businessId,
      };

      const productCategoryServices = getProductCategoryService(req);
      const created = await productCategoryServices.create(
        categoryData,
        req.user._id,
      );
      return ResponseService.send(
        res,
        StatusCodes.CREATED,
        'Product category created successfully',
        created,
      );
    } catch (error) {
      console.log(error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to create product category',
      );
    }
  }

  static async list(req, res) {
    try {
      const productCategoryServices = getProductCategoryService(req);
      const result = await productCategoryServices.list(
        req.query,
        req.businessId,
      );
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Product categories fetched successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch product categories',
      );
    }
  }

  static async getById(req, res) {
    try {
      const productCategoryServices = getProductCategoryService(req);
      const item = await productCategoryServices.getById(
        req.params.id,
        req.businessId,
      );
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Product category fetched successfully',
        item,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.NOT_FOUND,
        error.message || 'Product category not found',
      );
    }
  }

  static async getActiveCategories(req, res) {
    try {
      const productCategoryServices = getProductCategoryService(req);
      const categories = await productCategoryServices.getActiveCategories(
        req.businessId,
      );
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Active product categories fetched successfully',
        categories,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch active product categories',
      );
    }
  }

  static async bulkGet(req, res) {
    try {
      const { ids, lean, throwOnNotFound, populate } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Category IDs array is required and must not be empty',
        );
      }

      const MAX_IDS = 100;
      if (ids.length > MAX_IDS) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          `Maximum ${MAX_IDS} category IDs allowed per request`,
        );
      }

      const productCategoryServices = getProductCategoryService(req);
      const result = await productCategoryServices.bulkGetCategories(ids, {
        lean,
        throwOnNotFound,
        populate,
      });

      const message =
        result.found === result.totalRequested
          ? 'All product categories fetched successfully'
          : result.found > 0
            ? `${result.found} of ${result.totalRequested} product categories fetched successfully`
            : 'No product categories found';

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
        error.message || 'Error fetching product categories',
      );
    }
  }

  static async update(req, res) {
    try {
      const productCategoryServices = getProductCategoryService(req);
      const updated = await productCategoryServices.updateById(
        req.params.id,
        req.body,
        req.user._id,
        req.businessId,
      );
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Product category updated successfully',
        updated,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to update product category',
      );
    }
  }

  static async remove(req, res) {
    try {
      const productCategoryServices = getProductCategoryService(req);
      const removed = await productCategoryServices.deleteById(
        req.params.id,
        req.businessId,
      );
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Product category deleted successfully',
        removed,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to delete product category',
      );
    }
  }

  static async toggleStatus(req, res) {
    try {
      const productCategoryServices = getProductCategoryService(req);
      const updated = await productCategoryServices.toggleStatus(
        req.params.id,
        req.businessId,
      );
      const statusText = updated.isActive ? 'activated' : 'deactivated';
      return ResponseService.send(
        res,
        StatusCodes.OK,
        `Product category ${statusText} successfully`,
        updated,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to toggle product category status',
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

      const productCategoryServices = getProductCategoryService(req);
      const result = await productCategoryServices.bulkUpdateStatus(
        ids,
        status,
        req.businessId,
      );

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Product category statuses updated successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to bulk update product category statuses',
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

      const productCategoryServices = getProductCategoryService(req);
      const result = await productCategoryServices.bulkDelete(
        ids,
        req.businessId,
      );

      return ResponseService.send(res, StatusCodes.OK, result.message, result);
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to bulk delete product categories',
      );
    }
  }
}

export default ProductCategoryController;
