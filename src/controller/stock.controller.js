import { StatusCodes } from 'http-status-codes';
import { StockServices } from '../services/index.js';
import { ResponseService } from '../utils/index.js';

class StockController {
  /**
   * Get all stocks with filtering
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getStocks(req, res) {
    try {
      const businessId = req.businessId;
      const filters = req.query;

      // Get stocks
      const stockServices = new StockServices(businessId);
      const stocks = await stockServices.getStocks(filters);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Stocks retrieved successfully',
        stocks,
      );
    } catch (error) {
      console.error('Error getting stocks:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to get stocks',
      );
    }
  }

  /**
   * Get low stock items
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getLowStock(req, res) {
    try {
      const businessId = req.businessId;
      const { storeId, threshold } = req.query;

      // Get low stock items
      const stockServices = new StockServices(businessId);
      const lowStock = await stockServices.getLowStock(
        storeId,
        threshold ? parseInt(threshold) : 10,
      );

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Low stock items retrieved successfully',
        lowStock,
      );
    } catch (error) {
      console.error('Error getting low stock:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to get low stock items',
      );
    }
  }

  /**
   * Get out of stock items
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getOutOfStock(req, res) {
    try {
      const businessId = req.businessId;
      const { storeId } = req.query;

      // Get out of stock items
      const stockServices = new StockServices(businessId);
      const outOfStock = await stockServices.getOutOfStock(storeId);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Out of stock items retrieved successfully',
        outOfStock,
      );
    } catch (error) {
      console.error('Error getting out of stock:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to get out of stock items',
      );
    }
  }

  /**
   * Get stock statistics
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getStockStats(req, res) {
    try {
      const businessId = req.businessId;
      const filters = req.query;

      // Get stock statistics
      const stockServices = new StockServices(businessId);
      const stats = await stockServices.getStockStats(filters);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Stock statistics retrieved successfully',
        stats,
      );
    } catch (error) {
      console.error('Error getting stock statistics:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to get stock statistics',
      );
    }
  }

  /**
   * Update stock quantity
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async updateStockQuantity(req, res) {
    try {
      const businessId = req.businessId;
      const { storeId, productId, quantity, operation } = req.body;

      // Validate required fields
      if (!storeId || !productId || quantity === undefined) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Store ID, Product ID, and quantity are required',
        );
      }

      // Update stock quantity
      const stockServices = new StockServices(businessId);
      const updatedProduct = await stockServices.updateStockQuantity(
        storeId,
        productId,
        quantity,
        operation,
      );

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Stock quantity updated successfully',
        updatedProduct,
      );
    } catch (error) {
      console.error('Error updating stock quantity:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to update stock quantity',
      );
    }
  }

  // ========================================
  // STOCK TRANSFER METHODS
  // ========================================

  /**
   * Create a new stock transfer request
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async createTransfer(req, res) {
    try {
      const businessId = req.businessId;
      const currentUser = req.user;

      // Normalize field names (handle both subcategoryId and subCategoryId)
      const transferData = {
        ...req.body,
        requestedBy: currentUser._id,
      };

      // Normalize subCategoryId if subcategoryId is provided
      if (req.body.subcategoryId && !req.body.subCategoryId) {
        transferData.subCategoryId = req.body.subcategoryId;
      }

      // Validate required fields
      if (
        !transferData.fromStoreId ||
        !transferData.toStoreId ||
        !transferData.productId ||
        !transferData.categoryId ||
        !transferData.subCategoryId ||
        !transferData.quantity ||
        !transferData.reason
      ) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Missing required fields: fromStoreId, toStoreId, productId, categoryId, subCategoryId, quantity, and reason are required',
        );
      }

      const stockServices = new StockServices(businessId);
      const transfer = await stockServices.createTransfer(transferData);

      return ResponseService.send(
        res,
        StatusCodes.CREATED,
        'Stock transfer request created successfully',
        transfer,
      );
    } catch (error) {
      console.error('Error creating stock transfer:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to create stock transfer',
      );
    }
  }

  /**
   * Get stock transfer by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getTransfer(req, res) {
    try {
      const businessId = req.businessId;
      const { id } = req.params;

      const stockServices = new StockServices(businessId);
      const transfer = await stockServices.getTransfer(id);

      if (!transfer) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Transfer not found',
        );
      }

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Transfer retrieved successfully',
        transfer,
      );
    } catch (error) {
      console.error('Error getting transfer:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to get transfer',
      );
    }
  }

  /**
   * Update a stock transfer request
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async updateTransfer(req, res) {
    try {
      const businessId = req.businessId;
      const { id } = req.params;
      const updateData = req.body;
      console.log("updateData", updateData);

      const stockServices = new StockServices(businessId);
      const transfer = await stockServices.updateTransfer(id, updateData);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Transfer updated successfully',
        transfer,
      );
    } catch (error) {
      console.error('Error updating transfer:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to update transfer',
      );
    }
  }

  /**
   * Delete a stock transfer (only pending transfers can be deleted)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async deleteTransfer(req, res) {
    try {
      const businessId = req.businessId;
      const { id } = req.params;

      const stockServices = new StockServices(businessId);
      const transfer = await stockServices.deleteTransfer(id);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Stock transfer deleted successfully',
        transfer,
      );
    } catch (error) {
      console.error('Error deleting stock transfer:', error);

      // Return 400 for validation errors (non-pending status)
      if (error.message.includes('Cannot delete transfer')) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          error.message,
        );
      }

      // Return 404 for not found
      if (error.message === 'Transfer not found') {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          error.message,
        );
      }

      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to delete stock transfer',
      );
    }
  }

  /**
   * Bulk delete multiple stock transfers
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async bulkDeleteTransfers(req, res) {
    try {
      const businessId = req.businessId;
      const { ids } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Transfer IDs array is required and must not be empty',
        );
      }

      const MAX_IDS = 100;
      if (ids.length > MAX_IDS) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          `Maximum ${MAX_IDS} transfer IDs allowed per request`,
        );
      }

      const stockServices = new StockServices(businessId);
      const results = await stockServices.bulkDeleteTransfers(ids);

      const successCount = results.filter((r) => r.success).length;
      const failureCount = results.length - successCount;

      console.log("results", results);
      console.log("successCount", successCount);
      console.log("failureCount", failureCount);


      return ResponseService.send(
        res,
        StatusCodes.OK,
        `Bulk deletion completed (${successCount} succeeded, ${failureCount} failed)`,
        results,
      );
    } catch (error) {
      console.error('Error bulk deleting transfers:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to bulk delete transfers',
      );
    }
  }

  /**
    * Get all transfers with optional filters
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getTransfers(req, res) {
    try {
      const businessId = req.businessId;
      const filters = req.query;

      const stockServices = new StockServices(businessId);
      const transfers = await stockServices.getTransfers(filters);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Transfers retrieved successfully',
        transfers,
      );
    } catch (error) {
      console.error('Error getting transfers:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to get transfers',
      );
    }
  }

  /**
   * Get pending transfers
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getPendingTransfers(req, res) {
    try {
      const businessId = req.businessId;
      const { storeId } = req.query;

      const stockServices = new StockServices(businessId);
      const transfers = await stockServices.getPendingTransfers(storeId);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Pending transfers retrieved successfully',
        transfers,
      );
    } catch (error) {
      console.error('Error getting pending transfers:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to get pending transfers',
      );
    }
  }

  /**
   * Get transfers requiring action
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getTransfersRequiringAction(req, res) {
    try {
      const businessId = req.businessId;
      const { storeId } = req.query;

      const stockServices = new StockServices(businessId);
      const transfers = await stockServices.getTransfersRequiringAction(
        storeId,
      );

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Transfers requiring action retrieved successfully',
        transfers,
      );
    } catch (error) {
      console.error('Error getting transfers requiring action:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to get transfers requiring action',
      );
    }
  }

  /**
   * Get transfer statistics
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getTransferStats(req, res) {
    try {
      const businessId = req.businessId;
      const filters = req.query;

      const stockServices = new StockServices(businessId);
      const stats = await stockServices.getTransferStats(filters);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Transfer statistics retrieved successfully',
        stats,
      );
    } catch (error) {
      console.error('Error getting transfer statistics:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to get transfer statistics',
      );
    }
  }

  /**
   * Get transfers by date range
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getTransfersByDateRange(req, res) {
    try {
      const businessId = req.businessId;
      const { startDate, endDate, ...filters } = req.query;

      if (!startDate || !endDate) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Start date and end date are required',
        );
      }

      const stockServices = new StockServices(businessId);
      const transfers = await stockServices.getTransfersByDateRange(
        new Date(startDate),
        new Date(endDate),
        filters,
      );

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Transfers retrieved successfully',
        transfers,
      );
    } catch (error) {
      console.error('Error getting transfers by date range:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to get transfers by date range',
      );
    }
  }

  /**
   * Change transfer status to pending
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async pendingTransfer(req, res) {
    try {
      const businessId = req.businessId;
      const { id } = req.params;

      const stockServices = new StockServices(businessId);
      const transfer = await stockServices.pendingTransfer(id);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Transfer status updated to pending successfully',
        transfer,
      );
    } catch (error) {
      console.error('Error changing transfer status to pending:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to change transfer status to pending',
      );
    }
  }

  /**
   * Approve a stock transfer
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async approveTransfer(req, res) {
    try {
      const businessId = req.businessId;
      const { id } = req.params;
      const currentUser = req.user;

      const stockServices = new StockServices(businessId);
      const transfer = await stockServices.approveTransfer(id, currentUser._id);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Transfer approved successfully',
        transfer,
      );
    } catch (error) {
      console.error('Error approving transfer:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to approve transfer',
      );
    }
  }

  /**
   * Complete a stock transfer
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async completeTransfer(req, res) {
    try {
      const businessId = req.businessId;
      const { id } = req.params;
      const currentUser = req.user;

      const stockServices = new StockServices(businessId);
      const transfer = await stockServices.completeTransfer(
        id,
        currentUser._id,
      );

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Transfer completed successfully',
        transfer,
      );
    } catch (error) {
      console.error('Error completing transfer:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to complete transfer',
      );
    }
  }

  /**
   * Cancel a stock transfer
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async cancelTransfer(req, res) {
    try {
      const businessId = req.businessId;
      const { id } = req.params;
      const currentUser = req.user;
      const { reason } = req.body;

      const stockServices = new StockServices(businessId);
      const transfer = await stockServices.cancelTransfer(
        id,
        currentUser._id,
        reason,
      );

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Transfer cancelled successfully',
        transfer,
      );
    } catch (error) {
      console.error('Error cancelling transfer:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to cancel transfer',
      );
    }
  }

  /**
   * Bulk approve multiple transfers
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async bulkApproveTransfers(req, res) {
    try {
      const businessId = req.businessId;
      const currentUser = req.user;
      const { transferIds } = req.body;

      if (!transferIds || !Array.isArray(transferIds) || transferIds.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Transfer IDs array is required',
        );
      }

      const stockServices = new StockServices(businessId);
      const results = await stockServices.bulkApproveTransfers(
        transferIds,
        currentUser._id,
      );

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Bulk approval completed',
        results,
      );
    } catch (error) {
      console.error('Error bulk approving transfers:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to bulk approve transfers',
      );
    }
  }

  /**
   * Bulk get stock transfers by IDs
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async bulkGetTransfers(req, res) {
    try {
      const { ids, status, storeId } = req.body;

      if (!ids?.length) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Transfer IDs array is required',
        );
      }

      if (ids.length > 100) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Maximum 100 transfer IDs allowed per request',
        );
      }

      const stockServices = new StockServices(req.businessId);
      const result = await stockServices.bulkGetTransfers(ids, {
        status,
        storeId,
      });

      return ResponseService.send(
        res,
        result.found ? StatusCodes.OK : StatusCodes.NOT_FOUND,
        result.found === result.totalRequested
          ? 'All stock transfers fetched successfully'
          : `${result.found} of ${result.totalRequested} stock transfers fetched`,
        result,
      );
    } catch (error) {
      console.error('Error bulk fetching transfers:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to bulk fetch transfers',
      );
    }
  }

  /**
   * Bulk update transfer statuses with transition safeguards
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async bulkUpdateTransferStatus(req, res) {
    try {
      const businessId = req.businessId;
      const currentUser = req.user;
      const { updates, ids, status, reason, receivedBy } = req.body;
      console.log(req.body);

      let normalizedUpdates = Array.isArray(updates) ? [...updates] : [];

      if (normalizedUpdates.length === 0 && Array.isArray(ids) && ids.length) {
        if (!status) {
          return ResponseService.send(
            res,
            StatusCodes.BAD_REQUEST,
            'Status is required when sending ids array',
          );
        }

        normalizedUpdates = ids.map((transferId) => ({
          transferId,
          status,
          ...(reason ? { reason } : {}),
          ...(receivedBy ? { receivedBy } : {}),
        }));
      }

      if (!normalizedUpdates.length) {
        console.log('Updates array is required', normalizedUpdates);
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Updates array is required',
        );
      }

      if (normalizedUpdates.length > 100) {

        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Maximum 100 updates allowed per request',
        );
      }

      const invalidEntry = normalizedUpdates.find(
        (entry) => !entry?.transferId || !entry?.status,
      );
      if (invalidEntry) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Each update must include transferId and status',
        );
      }

      const stockServices = new StockServices(businessId);
      const results = await stockServices.bulkUpdateTransferStatus(
        normalizedUpdates,
        currentUser._id,
      );

      const successCount = results.filter((item) => item.success).length;
      const failureCount = results.length - successCount;

      return ResponseService.send(
        res,
        StatusCodes.OK,
        `Bulk status update completed (${successCount} succeeded, ${failureCount} failed)`,
        results,
      );
    } catch (error) {
      console.error('Error bulk updating transfer status:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to bulk update transfer status',
      );
    }
  }
}

export default StockController;
