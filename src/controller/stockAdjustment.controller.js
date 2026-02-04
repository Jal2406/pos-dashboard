import { StatusCodes } from 'http-status-codes';
import { StockAdjustmentServices } from '../services/index.js';
import { ResponseService } from '../utils/index.js';

/**
 * StockAdjustmentController
 * Handles HTTP requests for stock adjustment operations
 */
class StockAdjustmentController {
    // ========================================
    // CRUD OPERATIONS
    // ========================================

    /**
     * Create a new stock adjustment
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async createAdjustment(req, res) {
        try {
            const businessId = req.businessId;
            const currentUser = req.user;
            const adjustmentData = {
                ...req.body,
                createdBy: currentUser._id,
            };

            // Validate required fields
            const requiredFields = [
                'storeId',
                'productId',
                'categoryId',
                'SKU',
                'adjustmentType',
                'actualStock',
                'previousStock',
                'reason',
            ];

            const missingFields = requiredFields.filter((field) => !adjustmentData[field]);

            if (missingFields.length > 0) {
                return ResponseService.send(
                    res,
                    StatusCodes.BAD_REQUEST,
                    `Missing required fields: ${missingFields.join(', ')}`,
                );
            }

            const service = new StockAdjustmentServices(businessId);
            const adjustment = await service.createAdjustment(adjustmentData);

            // Return only essential fields, removing redundancy
            const response = {
                _id: adjustment._id,
                storeId: adjustment.storeId,
                productId: adjustment.productId,
                categoryId: adjustment.categoryId,
                subCategoryId: adjustment.subCategoryId,
                SKU: adjustment.SKU,
                adjustmentType: adjustment.adjustmentType,
                actualStock: adjustment.actualStock,
                previousStock: adjustment.previousStock,
                difference: adjustment.difference,
                reason: adjustment.reason,
                status: adjustment.status,
                createdAt: adjustment.createdAt,
                updatedAt: adjustment.updatedAt,
            };

            return ResponseService.send(
                res,
                StatusCodes.CREATED,
                'Stock adjustment created successfully',
                response,
            );
        } catch (error) {
            console.error('Error creating stock adjustment:', error);
            return ResponseService.send(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                error.message || 'Failed to create stock adjustment',
            );
        }
    }

    /**
     * Get adjustment by ID
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async getAdjustment(req, res) {
        try {
            const businessId = req.businessId;
            const { id } = req.params;

            const service = new StockAdjustmentServices(businessId);
            const adjustment = await service.getAdjustment(id);

            if (!adjustment) {
                return ResponseService.send(
                    res,
                    StatusCodes.NOT_FOUND,
                    'Adjustment not found',
                );
            }

            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Adjustment retrieved successfully',
                adjustment,
            );
        } catch (error) {
            console.error('Error getting adjustment:', error);
            return ResponseService.send(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                error.message || 'Failed to get adjustment',
            );
        }
    }

    /**
     * Get all adjustments with optional filters and pagination
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async getAdjustments(req, res) {
        try {
            const businessId = req.businessId;
            const { page = 1, limit = 10, ...filters } = req.query;

            const service = new StockAdjustmentServices(businessId);
            const result = await service.getAdjustments(
                filters,
                parseInt(page),
                parseInt(limit),
            );

            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Adjustments retrieved successfully',
                result,
            );
        } catch (error) {
            console.error('Error getting adjustments:', error);
            return ResponseService.send(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                error.message || 'Failed to get adjustments',
            );
        }
    }

    /**
     * Update an adjustment
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async updateAdjustment(req, res) {
        try {
            const businessId = req.businessId;
            const { id } = req.params;
            const updateData = req.body;
            console.log(updateData);

            const service = new StockAdjustmentServices(businessId);
            const adjustment = await service.updateAdjustment(id, updateData);

            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Adjustment updated successfully',
                adjustment,
            );
        } catch (error) {
            console.error('Error updating adjustment:', error);
            return ResponseService.send(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                error.message || 'Failed to update adjustment',
            );
        }
    }

    /**
     * Delete an adjustment (soft delete)
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async deleteAdjustment(req, res) {
        try {
            const businessId = req.businessId;
            const currentUser = req.user;
            const { id } = req.params;

            const service = new StockAdjustmentServices(businessId);
            const adjustment = await service.deleteAdjustment(id, currentUser._id);

            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Adjustment deleted successfully',
                adjustment,
            );
        } catch (error) {
            console.error('Error deleting adjustment:', error);
            return ResponseService.send(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                error.message || 'Failed to delete adjustment',
            );
        }
    }

    // ========================================
    // APPROVAL WORKFLOW
    // ========================================

    /**
     * Get pending adjustments
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async getPendingAdjustments(req, res) {
        try {
            const businessId = req.businessId;
            const { storeId } = req.query;

            const service = new StockAdjustmentServices(businessId);
            const adjustments = await service.getPendingAdjustments(storeId);

            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Pending adjustments retrieved successfully',
                adjustments,
            );
        } catch (error) {
            console.error('Error getting pending adjustments:', error);
            return ResponseService.send(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                error.message || 'Failed to get pending adjustments',
            );
        }
    }

    /**
     * Change adjustment status to pending
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async pendingAdjustment(req, res) {
        try {
            const businessId = req.businessId;
            const { id } = req.params;

            const service = new StockAdjustmentServices(businessId);
            const adjustment = await service.pendingAdjustment(id);

            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Adjustment status updated to pending successfully',
                adjustment,
            );
        } catch (error) {
            console.error('Error changing adjustment status to pending:', error);
            return ResponseService.send(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                error.message || 'Failed to change adjustment status to pending',
            );
        }
    }

    /**
     * Approve an adjustment
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async approveAdjustment(req, res) {
        try {
            const businessId = req.businessId;
            const currentUser = req.user;
            const { id } = req.params;

            const service = new StockAdjustmentServices(businessId);
            const adjustment = await service.approveAdjustment(id, currentUser._id);

            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Adjustment approved successfully',
                adjustment,
            );
        } catch (error) {
            console.error('Error approving adjustment:', error);
            return ResponseService.send(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                error.message || 'Failed to approve adjustment',
            );
        }
    }

    /**
     * Cancel an adjustment
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async cancelAdjustment(req, res) {
        try {
            const businessId = req.businessId;
            const currentUser = req.user;
            const { id } = req.params;
            const { reason } = req.body;

            if (!reason) {
                console.error('Cancellation reason is required');
                return ResponseService.send(
                    res,
                    StatusCodes.BAD_REQUEST,
                    'Cancellation reason is required',
                );
            }

            const service = new StockAdjustmentServices(businessId);
            const adjustment = await service.cancelAdjustment(
                id,
                currentUser._id,
                reason,
            );

            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Adjustment cancelled successfully',
                adjustment,
            );
        } catch (error) {
            console.error('Error cancelling adjustment:', error);
            return ResponseService.send(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                error.message || 'Failed to cancel adjustment',
            );
        }
    }

    /**
     * Complete an adjustment (apply to stock)
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async completeAdjustment(req, res) {
        try {
            const businessId = req.businessId;
            const currentUser = req.user;
            const { id } = req.params;

            const service = new StockAdjustmentServices(businessId);
            const adjustment = await service.completeAdjustment(id, currentUser._id);

            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Adjustment completed successfully',
                adjustment,
            );
        } catch (error) {
            console.error('Error completing adjustment:', error);
            return ResponseService.send(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                error.message || 'Failed to complete adjustment',
            );
        }
    }

    /**
     * Bulk update adjustment statuses with transition safeguards
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async bulkUpdateAdjustmentStatus(req, res) {
        try {
            const businessId = req.businessId;
            const currentUser = req.user;
            const { updates, ids, status, reason } = req.body;

            let normalizedUpdates = Array.isArray(updates) ? [...updates] : [];

            if (normalizedUpdates.length === 0 && Array.isArray(ids) && ids.length) {
                if (!status) {
                    return ResponseService.send(
                        res,
                        StatusCodes.BAD_REQUEST,
                        'Status is required when sending ids array',
                    );
                }

                normalizedUpdates = ids.map((adjustmentId) => ({
                    adjustmentId,
                    status,
                    ...(reason ? { reason } : {}),
                }));
            }

            if (!normalizedUpdates.length) {
                return ResponseService.send(
                    res,
                    StatusCodes.BAD_REQUEST,
                    'Updates array or ids+status is required',
                );
            }

            if (normalizedUpdates.length > 100) {
                return ResponseService.send(
                    res,
                    StatusCodes.BAD_REQUEST,
                    'Maximum 100 updates allowed per request',
                );
            }

            const service = new StockAdjustmentServices(businessId);
            const results = await service.bulkUpdateAdjustmentStatus(
                normalizedUpdates,
                currentUser._id,
            );

            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Bulk status update completed',
                results,
            );
        } catch (error) {
            console.error('Error bulk updating adjustment statuses:', error);
            return ResponseService.send(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                error.message || 'Failed to bulk update adjustment statuses',
            );
        }
    }

    /**
     * Bulk delete adjustments
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async bulkDeleteAdjustments(req, res) {
        try {
            const businessId = req.businessId;
            const currentUser = req.user;
            const { ids } = req.body;

            if (!ids || !Array.isArray(ids) || ids.length === 0) {
                return ResponseService.send(
                    res,
                    StatusCodes.BAD_REQUEST,
                    'Adjustment IDs array is required',
                );
            }

            if (ids.length > 100) {
                return ResponseService.send(
                    res,
                    StatusCodes.BAD_REQUEST,
                    'Maximum 100 adjustment IDs allowed per request',
                );
            }

            const service = new StockAdjustmentServices(businessId);
            const results = await service.bulkDeleteAdjustments(ids, currentUser._id);

            const successCount = results.filter((r) => r.success).length;
            const failureCount = results.length - successCount;

            return ResponseService.send(
                res,
                StatusCodes.OK,
                `Bulk deletion completed (${successCount} succeeded, ${failureCount} failed)`,
                results,
            );
        } catch (error) {
            console.error('Error bulk deleting adjustments:', error);
            return ResponseService.send(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                error.message || 'Failed to bulk delete adjustments',
            );
        }
    }

    // ========================================
    // STATISTICS & REPORTING
    // ========================================

    /**
     * Get adjustment statistics for a store
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async getAdjustmentStats(req, res) {
        try {
            const businessId = req.businessId;
            const { storeId, startDate, endDate } = req.query;

            if (!storeId) {
                return ResponseService.send(
                    res,
                    StatusCodes.BAD_REQUEST,
                    'Store ID is required',
                );
            }

            const service = new StockAdjustmentServices(businessId);
            const stats = await service.getAdjustmentStats(storeId, startDate, endDate);

            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Adjustment statistics retrieved successfully',
                stats,
            );
        } catch (error) {
            console.error('Error getting adjustment statistics:', error);
            return ResponseService.send(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                error.message || 'Failed to get adjustment statistics',
            );
        }
    }

    /**
     * Get product adjustment summary
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async getProductAdjustmentSummary(req, res) {
        try {
            const businessId = req.businessId;
            const { productId, storeId, SKU } = req.query;

            if (!productId || !storeId || !SKU) {
                return ResponseService.send(
                    res,
                    StatusCodes.BAD_REQUEST,
                    'Product ID, Store ID, and SKU are required',
                );
            }

            const service = new StockAdjustmentServices(businessId);
            const summary = await service.getProductAdjustmentSummary(
                productId,
                storeId,
                SKU,
            );

            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Product adjustment summary retrieved successfully',
                summary,
            );
        } catch (error) {
            console.error('Error getting product adjustment summary:', error);
            return ResponseService.send(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                error.message || 'Failed to get product adjustment summary',
            );
        }
    }

    /**
     * Get adjustments by store
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async getAdjustmentsByStore(req, res) {
        try {
            const businessId = req.businessId;
            const { storeId, ...options } = req.query;

            if (!storeId) {
                return ResponseService.send(
                    res,
                    StatusCodes.BAD_REQUEST,
                    'Store ID is required',
                );
            }

            const service = new StockAdjustmentServices(businessId);
            const adjustments = await service.getAdjustmentsByStore(storeId, options);

            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Store adjustments retrieved successfully',
                adjustments,
            );
        } catch (error) {
            console.error('Error getting store adjustments:', error);
            return ResponseService.send(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                error.message || 'Failed to get store adjustments',
            );
        }
    }

    /**
     * Get product adjustment history
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async getProductAdjustmentHistory(req, res) {
        try {
            const businessId = req.businessId;
            const { productId, storeId, limit = 50 } = req.query;

            if (!productId) {
                return ResponseService.send(
                    res,
                    StatusCodes.BAD_REQUEST,
                    'Product ID is required',
                );
            }

            const service = new StockAdjustmentServices(businessId);
            const history = await service.getProductAdjustmentHistory(
                productId,
                storeId,
                parseInt(limit),
            );

            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Product adjustment history retrieved successfully',
                history,
            );
        } catch (error) {
            console.error('Error getting product adjustment history:', error);
            return ResponseService.send(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                error.message || 'Failed to get product adjustment history',
            );
        }
    }

    /**
     * Get adjustments by date range
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async getAdjustmentsByDateRange(req, res) {
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

            const service = new StockAdjustmentServices(businessId);
            const adjustments = await service.getAdjustmentsByDateRange(
                startDate,
                endDate,
                filters,
            );

            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Adjustments retrieved successfully',
                adjustments,
            );
        } catch (error) {
            console.error('Error getting adjustments by date range:', error);
            return ResponseService.send(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                error.message || 'Failed to get adjustments by date range',
            );
        }
    }

    /**
     * Get recent adjustments
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async getRecentAdjustments(req, res) {
        try {
            const businessId = req.businessId;
            const { limit = 10, storeId } = req.query;

            const service = new StockAdjustmentServices(businessId);
            const adjustments = await service.getRecentAdjustments(
                parseInt(limit),
                storeId,
            );

            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Recent adjustments retrieved successfully',
                adjustments,
            );
        } catch (error) {
            console.error('Error getting recent adjustments:', error);
            return ResponseService.send(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                error.message || 'Failed to get recent adjustments',
            );
        }
    }

    /**
     * Bulk get stock adjustments by IDs
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async bulkGetAdjustments(req, res) {
        try {
            const { ids, status, storeId } = req.body;

            if (!ids?.length) {
                return ResponseService.send(res, StatusCodes.BAD_REQUEST, 'Adjustment IDs array is required');
            }

            if (ids.length > 100) {
                return ResponseService.send(res, StatusCodes.BAD_REQUEST, 'Maximum 100 adjustment IDs allowed per request');
            }

            const service = new StockAdjustmentServices(req.businessId);
            const result = await service.bulkGetAdjustments(ids, { status, storeId });

            return ResponseService.send(
                res,
                result.found ? StatusCodes.OK : StatusCodes.NOT_FOUND,
                result.found === result.totalRequested
                    ? 'All stock adjustments fetched successfully'
                    : `${result.found} of ${result.totalRequested} stock adjustments fetched`,
                result,
            );
        } catch (error) {
            return ResponseService.send(res, StatusCodes.INTERNAL_SERVER_ERROR, error.message);
        }
    }
}

export default StockAdjustmentController;
