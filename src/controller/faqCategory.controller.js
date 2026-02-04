import { StatusCodes } from 'http-status-codes';
import { ResponseService } from '../utils/index.js';
import { FaqCategoryServices } from '../services/index.js';

const faqCategoryServices = new FaqCategoryServices();

class FaqCategoryController {
    /**
     * Create a new FAQ category
     */
    static async create(req, res) {
        try {
            const created = await faqCategoryServices.create(req.body);
            return ResponseService.send(
                res,
                StatusCodes.CREATED,
                'FAQ category created successfully',
                created,
            );
        } catch (error) {
            return ResponseService.send(
                res,
                StatusCodes.BAD_REQUEST,
                error.message || 'Failed to create FAQ category',
            );
        }
    }

    /**
     * List FAQ categories with pagination and filters
     */
    static async list(req, res) {
        try {
            const result = await faqCategoryServices.list(req.query);
            return ResponseService.send(
                res,
                StatusCodes.OK,
                'FAQ categories fetched successfully',
                result,
            );
        } catch (error) {
            return ResponseService.send(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                error.message || 'Failed to fetch FAQ categories',
            );
        }
    }

    /**
     * Get a single FAQ category by ID
     */
    static async get(req, res) {
        try {
            const item = await faqCategoryServices.getById(req.params.id);
            return ResponseService.send(
                res,
                StatusCodes.OK,
                'FAQ category fetched successfully',
                item,
            );
        } catch (error) {
            return ResponseService.send(
                res,
                StatusCodes.NOT_FOUND,
                error.message || 'FAQ category not found',
            );
        }
    }

    /**
     * Get all active FAQ categories (for dropdowns)
     */
    static async getActive(req, res) {
        try {
            const items = await faqCategoryServices.getActiveCategories();
            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Active FAQ categories fetched successfully',
                items,
            );
        } catch (error) {
            return ResponseService.send(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                error.message || 'Failed to fetch active FAQ categories',
            );
        }
    }

    /**
     * Update FAQ category by ID
     */
    static async update(req, res) {
        try {
            // Check if request body is empty
            if (!req.body || Object.keys(req.body).length === 0) {
                return ResponseService.send(
                    res,
                    StatusCodes.BAD_REQUEST,
                    'Request body is empty. Please provide data to update.',
                );
            }

            const updated = await faqCategoryServices.updateById(
                req.params.id,
                req.body,
            );
            return ResponseService.send(
                res,
                StatusCodes.OK,
                'FAQ category updated successfully',
                updated,
            );
        } catch (error) {
            return ResponseService.send(
                res,
                StatusCodes.BAD_REQUEST,
                error.message || 'Failed to update FAQ category',
            );
        }
    }

    /**
     * Delete FAQ category by ID
     */
    static async remove(req, res) {
        try {
            const removed = await faqCategoryServices.deleteById(req.params.id);
            return ResponseService.send(
                res,
                StatusCodes.OK,
                'FAQ category deleted successfully',
                removed,
            );
        } catch (error) {
            return ResponseService.send(
                res,
                StatusCodes.BAD_REQUEST,
                error.message || 'Failed to delete FAQ category',
            );
        }
    }

    /**
     * Toggle FAQ category status
     */
    static async toggleStatus(req, res) {
        try {
            const updated = await faqCategoryServices.toggleStatus(req.params.id);
            return ResponseService.send(
                res,
                StatusCodes.OK,
                'FAQ category status toggled successfully',
                updated,
            );
        } catch (error) {
            return ResponseService.send(
                res,
                StatusCodes.BAD_REQUEST,
                error.message || 'Failed to toggle FAQ category status',
            );
        }
    }

    /**
     * Bulk update status for multiple FAQ categories
     */
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

            const result = await faqCategoryServices.bulkUpdateStatus(ids, status);
            return ResponseService.send(
                res,
                StatusCodes.OK,
                'FAQ categories status updated successfully',
                result,
            );
        } catch (error) {
            return ResponseService.send(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                error?.message || 'Error updating FAQ categories status',
            );
        }
    }

    /**
     * Bulk delete FAQ categories
     */
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

            const result = await faqCategoryServices.bulkDelete(ids);
            return ResponseService.send(
                res,
                StatusCodes.OK,
                'FAQ categories deleted successfully',
                result,
            );
        } catch (error) {
            return ResponseService.send(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                error?.message || 'Error deleting FAQ categories',
            );
        }
    }

    /**
     * Get FAQ category statistics
     */
    static async getStatistics(req, res) {
        try {
            const stats = await faqCategoryServices.getStatistics();
            return ResponseService.send(
                res,
                StatusCodes.OK,
                'FAQ category statistics fetched successfully',
                stats,
            );
        } catch (error) {
            return ResponseService.send(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                error.message || 'Failed to fetch FAQ category statistics',
            );
        }
    }

    /**
     * Restore a soft-deleted FAQ category
     */
    static async restore(req, res) {
        try {
            const restored = await faqCategoryServices.restore(req.params.id);
            return ResponseService.send(
                res,
                StatusCodes.OK,
                'FAQ category restored successfully',
                restored,
            );
        } catch (error) {
            return ResponseService.send(
                res,
                StatusCodes.BAD_REQUEST,
                error.message || 'Failed to restore FAQ category',
            );
        }
    }
}

export default FaqCategoryController;
