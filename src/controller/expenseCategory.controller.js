import { StatusCodes } from 'http-status-codes';
import { ResponseService } from '../utils/index.js';
import { ExpenseCategoryServices } from '../services/index.js';

class ExpenseCategoryController {
  /**
   * Create a new expense category
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async create(req, res) {
    try {
      const expenseCategoryServices = new ExpenseCategoryServices(
        req.businessId,
      );
      const created = await expenseCategoryServices.create(
        req.body,
        req.businessId,
      );
      return ResponseService.send(
        res,
        StatusCodes.CREATED,
        'Expense category created successfully',
        created,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to create expense category',
      );
    }
  }

  /**
   * Get list of expense categories with pagination and filtering
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async list(req, res) {
    try {
      const expenseCategoryServices = new ExpenseCategoryServices(
        req.businessId,
      );
      const result = await expenseCategoryServices.list(
        req.query,
        req.businessId,
      );
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Expense categories fetched successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch expense categories',
      );
    }
  }

  /**
   * Get expense category by ID
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async get(req, res) {
    try {
      const expenseCategoryServices = new ExpenseCategoryServices(
        req.businessId,
      );
      const item = await expenseCategoryServices.getById(
        req.params.id,
        req.businessId,
      );
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Expense category fetched successfully',
        item,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.NOT_FOUND,
        error.message || 'Expense category not found',
      );
    }
  }

  /**
   * Update expense category by ID
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async update(req, res) {
    try {
      const expenseCategoryServices = new ExpenseCategoryServices(
        req.businessId,
      );
      const updated = await expenseCategoryServices.updateById(
        req.params.id,
        req.body,
        req.businessId,
      );
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Expense category updated successfully',
        updated,
      );
    } catch (error) {
      console.log(error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to update expense category',
      );
    }
  }

  /**
   * Delete expense category by ID
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async remove(req, res) {
    try {
      const expenseCategoryServices = new ExpenseCategoryServices(
        req.businessId,
      );
      const removed = await expenseCategoryServices.deleteById(
        req.params.id,
        req.businessId,
      );
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Expense category deleted successfully',
        removed,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to delete expense category',
      );
    }
  }

  /**
   * Toggle expense category status
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async toggleStatus(req, res) {
    try {
      const expenseCategoryServices = new ExpenseCategoryServices(
        req.businessId,
      );
      const updated = await expenseCategoryServices.toggleStatus(
        req.params.id,
        req.businessId,
      );
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Expense category status updated successfully',
        updated,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to toggle expense category status',
      );
    }
  }

  /**
   * Get active expense categories (for dropdowns/selects)
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async getActiveCategories(req, res) {
    try {
      const expenseCategoryServices = new ExpenseCategoryServices(
        req.businessId,
      );
      const categories = await expenseCategoryServices.getActiveCategories(
        req.businessId,
      );
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Active expense categories fetched successfully',
        categories,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch active expense categories',
      );
    }
  }

  /**
   * Bulk get expense categories
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async bulkGet(req, res) {
    try {
      const expenseCategoryServices = new ExpenseCategoryServices(
        req.businessId,
      );
      const { ids, lean, throwOnNotFound, populate } = req.body;

      const result = await expenseCategoryServices.bulkGet(ids, {
        populate,
        lean,
        throwOnNotFound,
      });

      const message =
        result.found === result.totalRequested
          ? 'All expense categories fetched successfully'
          : result.found > 0
            ? `${result.found} of ${result.totalRequested} expense categories fetched successfully`
            : 'No expense categories found';

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
        error.message || 'Error fetching expense categories',
      );
    }
  }

  /**
   * Bulk update status of expense categories
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async bulkUpdateStatus(req, res) {
    try {
      const expenseCategoryServices = new ExpenseCategoryServices(
        req.businessId,
      );
      const { ids, status } = req.body;

      const result = await expenseCategoryServices.bulkUpdateStatus(
        ids,
        status,
      );

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Expense categories status updated successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to update expense categories status',
      );
    }
  }

  /**
   * Bulk delete expense categories (soft delete)
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async bulkDelete(req, res) {
    try {
      const expenseCategoryServices = new ExpenseCategoryServices(
        req.businessId,
      );
      const { ids } = req.body;

      const result = await expenseCategoryServices.bulkDelete(ids);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Expense categories deleted successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to delete expense categories',
      );
    }
  }

  /**
   * Get expense category statistics
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async getStatistics(req, res) {
    try {
      const expenseCategoryServices = new ExpenseCategoryServices(
        req.businessId,
      );
      const statistics = await expenseCategoryServices.getStatistics(
        req.businessId,
      );
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Expense category statistics fetched successfully',
        statistics,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch expense category statistics',
      );
    }
  }
}

export default ExpenseCategoryController;
