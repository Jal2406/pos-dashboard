import { StatusCodes } from 'http-status-codes';
import { ResponseService } from '../utils/index.js';
import { SubCategoryServices } from '../services/index.js';

class SubCategoryController {
  static async create(req, res) {
    try {
      const payload = { ...req.body };

      // Simplified image handling - only use subCategoryImage field

      if (req.file?.path) {
        payload.subCategoryImage = req.file.path;
      } else if (req.files?.length > 0) {
        const imageFile = req.files.find(
          (file) => file.fieldname === 'subCategoryImage',
        );
        if (imageFile?.path) {
          payload.subCategoryImage = imageFile.path;
        }
      }
      // If no file but image URL is provided in body, keep the URL
      // This allows for both file uploads and direct image URLs

      const subCategoryServices = new SubCategoryServices(req.businessId);
      const created = await subCategoryServices.create(payload, req.businessId);
      return ResponseService.send(
        res,
        StatusCodes.CREATED,
        'Subcategory created successfully',
        created,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to create subcategory',
      );
    }
  }

  static async list(req, res) {
    try {
      const subCategoryServices = new SubCategoryServices(req.businessId);
      const result = await subCategoryServices.list(req.query, req.businessId);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Subcategories fetched successfully',
        result,
      );
    } catch (error) {
      console.log(error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch subcategories',
      );
    }
  }

  static async getById(req, res) {
    try {
      const subCategoryServices = new SubCategoryServices(req.businessId);
      const item = await subCategoryServices.getById(
        req.params.id,
        req.businessId,
      );
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Subcategory fetched successfully',
        item,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.NOT_FOUND,
        error.message || 'Subcategory not found',
      );
    }
  }

  static async getByCategory(req, res) {
    try {
      const { categoryId } = req.params;
      const subCategoryServices = new SubCategoryServices(req.businessId);
      const subcategories = await subCategoryServices.getByCategory(
        categoryId,
        req.businessId,
      );
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Subcategories by category fetched successfully',
        subcategories,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to fetch subcategories by category',
      );
    }
  }

  static async getActiveSubcategories(req, res) {
    try {
      const subCategoryServices = new SubCategoryServices(req.businessId);
      const subcategories = await subCategoryServices.getActiveSubcategories(
        req.businessId,
      );
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Active subcategories fetched successfully',
        subcategories,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch active subcategories',
      );
    }
  }

  static async update(req, res) {
    try {
      const payload = { ...req.body };

      // Simplified image handling - only use subCategoryImage field

      if (req.files && req.files.length > 0) {
        const imageFile = req.files.find(
          (file) => file.fieldname === 'subCategoryImage',
        );
        if (imageFile) {
          payload.subCategoryImage = imageFile.path;
        }
      } else if (req.file && req.file.path) {
        // Fallback for single file upload
        payload.subCategoryImage = req.file.path;
      }

      const subCategoryServices = new SubCategoryServices(req.businessId);
      const updated = await subCategoryServices.updateById(
        req.params.id,
        payload,
        req.businessId,
      );
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Subcategory updated successfully',
        updated,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to update subcategory',
      );
    }
  }

  static async remove(req, res) {
    try {
      const subCategoryServices = new SubCategoryServices(req.businessId);
      const removed = await subCategoryServices.deleteById(
        req.params.id,
        req.businessId,
      );
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Subcategory deleted successfully',
        removed,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to delete subcategory',
      );
    }
  }

  static async toggleStatus(req, res) {
    try {
      const subCategoryServices = new SubCategoryServices(req.businessId);
      const updated = await subCategoryServices.toggleStatus(
        req.params.id,
        req.businessId,
      );
      const statusText = updated.status ? 'activated' : 'deactivated';
      return ResponseService.send(
        res,
        StatusCodes.OK,
        `Subcategory ${statusText} successfully`,
        updated,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to toggle subcategory status',
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

      const subCategoryServices = new SubCategoryServices(req.businessId);
      const result = await subCategoryServices.bulkUpdateStatus(
        ids,
        status,
        req.businessId,
      );
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Subcategory statuses updated successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to bulk update subcategory statuses',
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

      const subCategoryServices = new SubCategoryServices(req.businessId);
      const result = await subCategoryServices.bulkDelete(ids, req.businessId);

      return ResponseService.send(res, StatusCodes.OK, result.message, result);
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to bulk delete subcategories',
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
          'Subcategory IDs array is required and must not be empty',
        );
      }

      const MAX_IDS = 100;
      if (ids.length > MAX_IDS) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          `Maximum ${MAX_IDS} subcategory IDs allowed per request`,
        );
      }

      const subCategoryServices = new SubCategoryServices(req.businessId);
      const result = await subCategoryServices.bulkGetSubcategories(ids, {
        lean,
        throwOnNotFound,
      });

      const message =
        result.found === result.totalRequested
          ? 'All subcategories fetched successfully'
          : result.found > 0
            ? `${result.found} of ${result.totalRequested} subcategories fetched successfully`
            : 'No subcategories found';

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
        error.message || 'Error fetching subcategories',
      );
    }
  }

  static async getSubcategoriesForInventory(req, res) {
    try {
      const { categoryId } = req.query;
      const subCategoryServices = new SubCategoryServices(req.businessId);
      const subcategories =
        await subCategoryServices.getSubcategoriesForInventory(
          categoryId,
          req.businessId,
        );
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Subcategories for inventory fetched successfully',
        subcategories,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch subcategories for inventory',
      );
    }
  }

  static async getSubcategoriesByCategoryWithCount(req, res) {
    try {
      const { categoryId } = req.params;
      const subCategoryServices = new SubCategoryServices(req.businessId);
      const subcategories =
        await subCategoryServices.getSubcategoriesByCategoryWithCount(
          categoryId,
          req.businessId,
        );
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Subcategories with category info fetched successfully',
        subcategories,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to fetch subcategories with category info',
      );
    }
  }

  static async getAvailableCategories(req, res) {
    try {
      const subCategoryServices = new SubCategoryServices(req.businessId);
      const categories =
        await subCategoryServices.getAvailableCategoriesForBusiness(
          req.businessId,
        );
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Available categories for business fetched successfully',
        categories,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch available categories',
      );
    }
  }
}

export default SubCategoryController;
