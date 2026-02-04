import { StatusCodes } from 'http-status-codes';
import { ResponseService } from '../utils/index.js';
import { SalesService } from '../services/index.js';

/**
 * Sales Controller
 *
 * Enterprise-grade controller for managing sales operations with tenant-specific database support.
 * Handles HTTP requests and delegates business logic to SalesService.
 *
 * @class SalesController
 */
class SalesController {
    /**
     * Create a new sale
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Promise<void>}
     */
    static async create(req, res) {
        try {
            const businessId = req.businessId;
            const userId = req.user?.id || req.user?._id;
            const service = new SalesService(businessId);

            const payload = {
                ...req.body,
                createdBy: userId,
            };
            console.log('payload', payload);

            const created = await service.createSale(payload);
            return ResponseService.send(
                res,
                StatusCodes.CREATED,
                'Sale created successfully',
                created,
            );
        } catch (error) {
            console.log('Sale creation error:', error);
            return ResponseService.send(
                res,
                StatusCodes.BAD_REQUEST,
                error.message || 'Failed to create sale',
            );
        }
    }

    /**
     * Get sale by ID
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Promise<void>}
     */
    static async getById(req, res) {
        try {
            const businessId = req.businessId;
            const service = new SalesService(businessId);

            const populate = req.query.populate
                ? req.query.populate.split(',')
                : ['store', 'customer', 'products.product', 'createdBy', 'updatedBy'];

            const sale = await service.getSaleById(req.params.id, {
                populate,
            });

            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Sale retrieved successfully',
                sale,
            );
        } catch (error) {
            return ResponseService.send(
                res,
                StatusCodes.NOT_FOUND,
                error.message || 'Sale not found',
            );
        }
    }

    /**
     * Get sale by invoice number
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Promise<void>}
     */
    static async getByInvoiceNumber(req, res) {
        try {
            const businessId = req.businessId;
            const service = new SalesService(businessId);

            const populate = req.query.populate
                ? req.query.populate.split(',')
                : ['store', 'customer', 'products.product', 'createdBy', 'updatedBy'];

            const sale = await service.getSaleByInvoiceNumber(
                req.params.invoiceNumber,
                { populate },
            );

            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Sale retrieved successfully',
                sale,
            );
        } catch (error) {
            return ResponseService.send(
                res,
                StatusCodes.NOT_FOUND,
                error.message || 'Sale not found',
            );
        }
    }

    /**
     * Update sale by ID
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Promise<void>}
     */
    static async update(req, res) {
        try {
            const businessId = req.businessId;
            const userId = req.user?.id || req.user?._id;
            const service = new SalesService(businessId);
            console.log("Actual body: ", req.body);

            const payload = {
                ...req.body,
                updatedBy: userId,
            };

            const updated = await service.updateSale(req.params.id, payload);
            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Sale updated successfully',
                updated,
            );
        } catch (error) {
            console.log('Sale update error:', error);
            return ResponseService.send(
                res,
                StatusCodes.BAD_REQUEST,
                error.message || 'Failed to update sale',
            );
        }
    }

    /**
     * Delete sale by ID (hard delete)
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Promise<void>}
     */
    static async remove(req, res) {
        try {
            const businessId = req.businessId;
            const service = new SalesService(businessId);

            const deleted = await service.deleteSale(req.params.id);
            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Sale deleted successfully',
                deleted,
            );
        } catch (error) {
            return ResponseService.send(
                res,
                StatusCodes.BAD_REQUEST,
                error.message || 'Failed to delete sale',
            );
        }
    }

    /**
     * Approve payment and complete sale (for draft sales)
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Promise<void>}
     */
    static async approvePayment(req, res) {
        try {
            const businessId = req.businessId;
            const userId = req.user?.id || req.user?._id;
            const service = new SalesService(businessId);

            const approved = await service.approveSalePayment(
                req.params.id,
                req.body,
                userId,
            );

            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Payment approved and sale completed successfully',
                approved,
            );
        } catch (error) {
            console.log('Payment approval error:', error);
            return ResponseService.send(
                res,
                StatusCodes.BAD_REQUEST,
                error.message || 'Failed to approve payment',
            );
        }
    }

    /**
     * Soft delete sale by ID
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Promise<void>}
     */
    static async softDelete(req, res) {
        try {
            const businessId = req.businessId;
            const service = new SalesService(businessId);

            const deleted = await service.softDeleteSale(req.params.id);
            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Sale soft deleted successfully',
                deleted,
            );
        } catch (error) {
            return ResponseService.send(
                res,
                StatusCodes.BAD_REQUEST,
                error.message || 'Failed to soft delete sale',
            );
        }
    }

    /**
     * Restore soft-deleted sale
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Promise<void>}
     */
    static async restore(req, res) {
        try {
            const businessId = req.businessId;
            const service = new SalesService(businessId);

            const restored = await service.restoreSale(req.params.id);
            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Sale restored successfully',
                restored,
            );
        } catch (error) {
            return ResponseService.send(
                res,
                StatusCodes.BAD_REQUEST,
                error.message || 'Failed to restore sale',
            );
        }
    }

    /**
     * List sales with pagination, filtering, and search
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Promise<void>}
     */
    static async list(req, res) {
        try {
            const businessId = req.businessId;
            const service = new SalesService(businessId);

            const result = await service.listSales(req.query);
            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Sales fetched successfully',
                result,
            );
        } catch (error) {
            console.log('Sales list error:', error);
            return ResponseService.send(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                error.message || 'Failed to fetch sales',
            );
        }
    }

    /**
     * Get sales by store
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Promise<void>}
     */
    static async getByStore(req, res) {
        try {
            const businessId = req.businessId;
            const service = new SalesService(businessId);

            const populate = req.query.populate
                ? req.query.populate.split(',')
                : null;

            const sales = await service.getSalesByStore(req.params.storeId, {
                populate,
                sort: req.query.sort ? JSON.parse(req.query.sort) : undefined,
                limit: req.query.limit,
            });

            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Sales by store fetched successfully',
                sales,
            );
        } catch (error) {
            return ResponseService.send(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                error.message || 'Failed to fetch sales by store',
            );
        }
    }

    /**
     * Get sales by customer
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Promise<void>}
     */
    static async getByCustomer(req, res) {
        try {
            const businessId = req.businessId;
            const service = new SalesService(businessId);

            const populate = req.query.populate
                ? req.query.populate.split(',')
                : null;

            const sales = await service.getSalesByCustomer(req.params.customerId, {
                populate,
                sort: req.query.sort ? JSON.parse(req.query.sort) : undefined,
                limit: req.query.limit,
            });

            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Sales by customer fetched successfully',
                sales,
            );
        } catch (error) {
            return ResponseService.send(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                error.message || 'Failed to fetch sales by customer',
            );
        }
    }

    /**
     * Get sales by date range
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Promise<void>}
     */
    static async getByDateRange(req, res) {
        try {
            const businessId = req.businessId;
            const service = new SalesService(businessId);
            const { startDate, endDate } = req.query;

            if (!startDate || !endDate) {
                return ResponseService.send(
                    res,
                    StatusCodes.BAD_REQUEST,
                    'Start date and end date query parameters are required',
                );
            }

            const populate = req.query.populate
                ? req.query.populate.split(',')
                : null;

            const sales = await service.getSalesByDateRange(startDate, endDate, {
                populate,
                sort: req.query.sort ? JSON.parse(req.query.sort) : undefined,
            });

            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Sales by date range fetched successfully',
                sales,
            );
        } catch (error) {
            return ResponseService.send(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                error.message || 'Failed to fetch sales by date range',
            );
        }
    }

    /**
     * Get sales by payment status
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Promise<void>}
     */
    static async getByPaymentStatus(req, res) {
        try {
            const businessId = req.businessId;
            const service = new SalesService(businessId);
            const { status } = req.params;

            const populate = req.query.populate
                ? req.query.populate.split(',')
                : null;

            const sales = await service.getSalesByPaymentStatus(status, {
                populate,
                sort: req.query.sort ? JSON.parse(req.query.sort) : undefined,
            });

            return ResponseService.send(
                res,
                StatusCodes.OK,
                `Sales with payment status '${status}' fetched successfully`,
                sales,
            );
        } catch (error) {
            return ResponseService.send(
                res,
                StatusCodes.BAD_REQUEST,
                error.message || 'Failed to fetch sales by payment status',
            );
        }
    }

    /**
     * Get sales by fulfillment status
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Promise<void>}
     */
    static async getByFulfillmentStatus(req, res) {
        try {
            const businessId = req.businessId;
            const service = new SalesService(businessId);
            const { status } = req.params;

            const populate = req.query.populate
                ? req.query.populate.split(',')
                : null;

            const sales = await service.getSalesByFulfillmentStatus(status, {
                populate,
                sort: req.query.sort ? JSON.parse(req.query.sort) : undefined,
            });

            return ResponseService.send(
                res,
                StatusCodes.OK,
                `Sales with fulfillment status '${status}' fetched successfully`,
                sales,
            );
        } catch (error) {
            return ResponseService.send(
                res,
                StatusCodes.BAD_REQUEST,
                error.message || 'Failed to fetch sales by fulfillment status',
            );
        }
    }

    /**
     * Update payment status
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Promise<void>}
     */
    static async updatePaymentStatus(req, res) {
        try {
            const businessId = req.businessId;
            const userId = req.user?.id || req.user?._id;
            const service = new SalesService(businessId);

            const updated = await service.updatePaymentStatus(
                req.params.id,
                req.body,
                userId,
            );

            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Payment status updated successfully',
                updated,
            );
        } catch (error) {
            console.log('Payment status update error:', error);
            return ResponseService.send(
                res,
                StatusCodes.BAD_REQUEST,
                error.message || 'Failed to update payment status',
            );
        }
    }

    /**
     * Add payment detail
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Promise<void>}
     */
    static async addPaymentDetail(req, res) {
        try {
            const businessId = req.businessId;
            const userId = req.user?.id || req.user?._id;
            const service = new SalesService(businessId);

            const updated = await service.addPaymentDetail(
                req.params.id,
                req.body,
                userId,
            );

            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Payment detail added successfully',
                updated,
            );
        } catch (error) {
            console.log('Add payment detail error:', error);
            return ResponseService.send(
                res,
                StatusCodes.BAD_REQUEST,
                error.message || 'Failed to add payment detail',
            );
        }
    }

    /**
     * Update fulfillment status
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Promise<void>}
     */
    static async updateFulfillmentStatus(req, res) {
        try {
            const businessId = req.businessId;
            const userId = req.user?.id || req.user?._id;
            const service = new SalesService(businessId);

            const { status } = req.body;
            if (!status) {
                return ResponseService.send(
                    res,
                    StatusCodes.BAD_REQUEST,
                    'Fulfillment status is required',
                );
            }

            const updated = await service.updateFulfillmentStatus(
                req.params.id,
                status,
                userId,
            );

            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Fulfillment status updated successfully',
                updated,
            );
        } catch (error) {
            console.log('Fulfillment status update error:', error);
            return ResponseService.send(
                res,
                StatusCodes.BAD_REQUEST,
                error.message || 'Failed to update fulfillment status',
            );
        }
    }

    /**
     * Get sales statistics
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Promise<void>}
     */
    static async getStatistics(req, res) {
        try {
            const businessId = req.businessId;
            const service = new SalesService(businessId);

            // Build filters from query params
            const filters = {};
            if (req.query.storeId) {
                filters.store = req.query.storeId;
            }
            if (req.query.startDate || req.query.endDate) {
                filters.saleDate = {};
                if (req.query.startDate) {
                    filters.saleDate.$gte = new Date(req.query.startDate);
                }
                if (req.query.endDate) {
                    filters.saleDate.$lte = new Date(req.query.endDate);
                }
            }

            const stats = await service.getSalesStatistics(filters);
            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Sales statistics retrieved successfully',
                stats,
            );
        } catch (error) {
            return ResponseService.send(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                error.message || 'Failed to get sales statistics',
            );
        }
    }

    /**
     * Get revenue by period
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Promise<void>}
     */
    static async getRevenue(req, res) {
        try {
            const businessId = req.businessId;
            const service = new SalesService(businessId);
            const { startDate, endDate, groupBy = 'day' } = req.query;

            if (!startDate || !endDate) {
                return ResponseService.send(
                    res,
                    StatusCodes.BAD_REQUEST,
                    'Start date and end date query parameters are required',
                );
            }

            const revenue = await service.getRevenueByPeriod(
                startDate,
                endDate,
                groupBy,
            );

            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Revenue data retrieved successfully',
                revenue,
            );
        } catch (error) {
            return ResponseService.send(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                error.message || 'Failed to get revenue data',
            );
        }
    }

    /**
     * Bulk update sale status
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Promise<void>}
     */
    static async bulkUpdateStatus(req, res) {
        try {
            const businessId = req.businessId;
            const userId = req.user?.id || req.user?._id;
            const service = new SalesService(businessId);
            const { ids, status } = req.body;

            if (!Array.isArray(ids) || ids.length === 0) {
                return ResponseService.send(
                    res,
                    StatusCodes.BAD_REQUEST,
                    'ids must be a non-empty array',
                );
            }

            if (!status) {
                return ResponseService.send(
                    res,
                    StatusCodes.BAD_REQUEST,
                    'status is required',
                );
            }

            const result = await service.bulkUpdateStatus(ids, status, userId);
            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Sale statuses updated successfully',
                result,
            );
        } catch (error) {
            console.log('Bulk update status error:', error);
            return ResponseService.send(
                res,
                StatusCodes.BAD_REQUEST,
                error.message || 'Failed to bulk update sale status',
            );
        }
    }

    /**
     * Bulk get sales by IDs
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Promise<void>}
     */
    static async bulkGet(req, res) {
        try {
            const businessId = req.businessId;
            const service = new SalesService(businessId);
            const { ids, populate, lean, throwOnNotFound } = req.body;

            if (!Array.isArray(ids) || ids.length === 0) {
                return ResponseService.send(
                    res,
                    StatusCodes.BAD_REQUEST,
                    'ids must be a non-empty array',
                );
            }

            const populateFields =
                typeof populate === 'string'
                    ? populate.split(',').map((p) => p.trim())
                    : populate ?? ['store', 'customer', 'products.product', 'createdBy', 'updatedBy'];

            const result = await service.bulkGetSales(ids, {
                populate: populateFields,
                lean,
                throwOnNotFound,
            });

            const message =
                result.found === result.totalRequested
                    ? 'All sales fetched successfully'
                    : result.found > 0
                      ? `${result.found} of ${result.totalRequested} sales fetched successfully`
                      : 'No sales found';

            return ResponseService.send(
                res,
                result.found > 0 ? StatusCodes.OK : StatusCodes.NOT_FOUND,
                message,
                result,
            );
        } catch (error) {
            console.log('Bulk get sales error:', error);
            return ResponseService.send(
                res,
                StatusCodes.BAD_REQUEST,
                error.message || 'Failed to bulk get sales',
            );
        }
    }

    /**
     * Bulk soft delete sales
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Promise<void>}
     */
    static async bulkSoftDelete(req, res) {
        try {
            const businessId = req.businessId;
            const service = new SalesService(businessId);
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
                'Sales soft deleted successfully',
                result,
            );
        } catch (error) {
            console.log('Bulk soft delete error:', error);
            return ResponseService.send(
                res,
                StatusCodes.BAD_REQUEST,
                error.message || 'Failed to bulk soft delete sales',
            );
        }
    }

    /**
     * Get sale count
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Promise<void>}
     */
    static async getCount(req, res) {
        try {
            const businessId = req.businessId;
            const service = new SalesService(businessId);

            // Build filters from query params
            const filters = {};
            if (req.query.paymentStatus) {
                filters.paymentStatus = req.query.paymentStatus;
            }
            if (req.query.saleStatus) {
                filters.saleStatus = req.query.saleStatus;
            }
            if (req.query.storeId) {
                filters.store = req.query.storeId;
            }

            const count = await service.getSaleCount(filters);
            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Sale count retrieved successfully',
                { count },
            );
        } catch (error) {
            return ResponseService.send(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                error.message || 'Failed to get sale count',
            );
        }
    }

    /**
     * Preview billing summary with coupon applied (without creating sale)
     * Useful for frontend to show real-time calculations before sale creation
     * 
     * Accepts either:
     * 1. Full sale payload in req.body (for preview before creating sale)
     * 2. saleId in req.body.saleId or req.params.saleId (for preview of existing sale)
     * 
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Promise<void>}
     */
    static async previewBilling(req, res) {
        try {
            const businessId = req.businessId;
            const service = new SalesService(businessId);

            // Check if saleId is provided (either in body or params)
            // Note: req.body may be undefined for GET requests
            const saleId = req.body?.saleId || req.params.saleId;

            if (saleId) {
                // Preview by saleId - fetch existing sale and generate preview
                const preview = await service.previewBillingSummaryBySaleId(saleId);
                return ResponseService.send(
                    res,
                    StatusCodes.OK,
                    'Billing summary preview generated successfully from sale',
                    preview,
                );
            } else {
                // Preview from full payload - for new sales before creation
                const payload = {
                    ...req.body,
                };

                const preview = await service.previewBillingSummary(payload);
                return ResponseService.send(
                    res,
                    StatusCodes.OK,
                    'Billing summary preview generated successfully',
                    preview,
                );
            }
        } catch (error) {
            console.log('Billing preview error:', error);
            return ResponseService.send(
                res,
                StatusCodes.BAD_REQUEST,
                error.message || 'Failed to preview billing summary',
            );
        }
    }

    /**
     * Validate loyalty point redemption before sale creation
     * Checks customer eligibility, available points, and finds applicable redemption rule
     * If pointsToRedeem is not provided, automatically finds best rule using maximum points
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Promise<void>}
     */
    static async validateLoyaltyRedemption(req, res) {
        try {
            const businessId = req.businessId;
            const service = new SalesService(businessId);

            const { customerId, pointsToRedeem, includeAvailableRules, autoFindMax } = req.body;

            if (!customerId) {
                return ResponseService.send(
                    res,
                    StatusCodes.BAD_REQUEST,
                    'Customer ID is required',
                );
            }

            // If pointsToRedeem is not provided or autoFindMax is true, auto-find best rule
            const shouldAutoFind = autoFindMax === true || !pointsToRedeem || pointsToRedeem <= 0;

            if (!shouldAutoFind && (!pointsToRedeem || pointsToRedeem <= 0)) {
                return ResponseService.send(
                    res,
                    StatusCodes.BAD_REQUEST,
                    'Points to redeem must be a positive number',
                );
            }

            const validation = await service.validateLoyaltyRedemption(
                customerId,
                pointsToRedeem || 0,
                {
                    includeAvailableRules: includeAvailableRules === true,
                    autoFindMax: shouldAutoFind,
                },
            );

            // Return 200 even if validation fails, but include errors in response
            const statusCode = validation.valid
                ? StatusCodes.OK
                : StatusCodes.BAD_REQUEST;

            const message = validation.valid
                ? validation.autoSelected
                    ? 'Best redemption rule found automatically using maximum points'
                    : 'Loyalty redemption validation successful'
                : 'Loyalty redemption validation failed';

            return ResponseService.send(res, statusCode, message, validation);
        } catch (error) {
            console.log('Loyalty redemption validation error:', error);
            return ResponseService.send(
                res,
                StatusCodes.BAD_REQUEST,
                error.message || 'Failed to validate loyalty redemption',
            );
        }
    }

    /**
     * Get the best redemption rule for a customer (uses maximum available points)
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Promise<void>}
     */
    static async getBestRedemptionRule(req, res) {
        try {
            const businessId = req.businessId;
            const service = new SalesService(businessId);

            const { customerId } = req.body;
            console.log("customerId", customerId);
            console.log("body", req.body);

            if (!customerId) {
                return ResponseService.send(
                    res,
                    StatusCodes.BAD_REQUEST,
                    'Customer ID is required',
                );
            }

            const bestRule = await service.getBestRedemptionRuleForCustomer(customerId);

            if (!bestRule) {
                console.log("No applicable redemption rule found for this customer");
                return ResponseService.send(
                    res,
                    StatusCodes.NOT_FOUND,
                    'No applicable redemption rule found for this customer',
                    {
                        availablePoints: 0,
                        pointsToRedeem: 0,
                        rule: null,
                        discountAmount: 0,
                    },
                );
            }

            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Best redemption rule found successfully',
                bestRule,
            );
        } catch (error) {
            console.log('Get best redemption rule error:', error);
            return ResponseService.send(
                res,
                StatusCodes.BAD_REQUEST,
                error.message || 'Failed to get best redemption rule',
            );
        }
    }
    /**
     * Get sales report data
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Promise<void>}
     */
    static async getReportData(req, res) {
        try {
            const businessId = req.businessId;
            const service = new SalesService(businessId);

            const data = await service.getSalesReportData(req.query);
            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Sales report data retrieved successfully',
                data,
            );
        } catch (error) {
            console.error('Sales report error:', error);
            return ResponseService.send(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                error.message || 'Failed to get sales report data',
            );
        }
    }
}

export default SalesController;
