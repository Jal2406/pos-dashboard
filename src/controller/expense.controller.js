import { StatusCodes } from 'http-status-codes';
import { ResponseService } from '../utils/index.js';
import ExpenseServices from '../services/expense.services.js';

class ExpenseController {
    static _getService(req) {
        if (!req.businessId) {
            throw new Error('Business ID context is required');
        }
        return new ExpenseServices(req.businessId);
    }

    static _getUserId(req) {
        const userId = req.user?.id || req.user?._id;
        if (!userId) {
            throw new Error('Authenticated user context is required');
        }
        return userId;
    }

    static async create(req, res) {
        try {
            const service = ExpenseController._getService(req);
            const userId = ExpenseController._getUserId(req);
            const created = await service.create(req.body, req.businessId, userId);
            return ResponseService.send(
                res,
                StatusCodes.CREATED,
                'Expense recorded successfully',
                created,
            );
        } catch (error) {
            console.log(error);
            return ResponseService.send(
                res,
                StatusCodes.BAD_REQUEST,
                error.message || 'Failed to record expense',
            );
        }
    }

    static async list(req, res) {
        try {
            const service = ExpenseController._getService(req);
            const result = await service.list(req.query, req.businessId);
            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Expenses fetched successfully',
                result,
            );
        } catch (error) {
            return ResponseService.send(
                res,
                StatusCodes.BAD_REQUEST,
                error.message || 'Failed to fetch expenses',
            );
        }
    }

    static async get(req, res) {
        try {
            const service = ExpenseController._getService(req);
            const expense = await service.getById(req.params.id, req.businessId);
            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Expense fetched successfully',
                expense,
            );
        } catch (error) {
            return ResponseService.send(
                res,
                StatusCodes.NOT_FOUND,
                error.message || 'Expense not found',
            );
        }
    }

    static async update(req, res) {
        try {
            const service = ExpenseController._getService(req);
            const userId = ExpenseController._getUserId(req);
            const updated = await service.updateById(
                req.params.id,
                req.body,
                req.businessId,
                userId,
            );
            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Expense updated successfully',
                updated,
            );
        } catch (error) {
            return ResponseService.send(
                res,
                StatusCodes.BAD_REQUEST,
                error.message || 'Failed to update expense',
            );
        }
    }

    static async remove(req, res) {
        try {
            const service = ExpenseController._getService(req);
            const removed = await service.deleteById(req.params.id, req.businessId);
            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Expense deleted successfully',
                removed,
            );
        } catch (error) {
            return ResponseService.send(
                res,
                StatusCodes.BAD_REQUEST,
                error.message || 'Failed to delete expense',
            );
        }
    }

    static async approve(req, res) {
        try {
            const service = ExpenseController._getService(req);
            const userId = ExpenseController._getUserId(req);
            const approved = await service.approveExpense(
                req.params.id,
                req.businessId,
                userId,
            );
            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Expense approved successfully',
                approved,
            );
        } catch (error) {
            return ResponseService.send(
                res,
                StatusCodes.BAD_REQUEST,
                error.message || 'Failed to approve expense',
            );
        }
    }

    static async reject(req, res) {
        try {
            const service = ExpenseController._getService(req);
            const userId = ExpenseController._getUserId(req);
            const { reason } = req.body;
            const rejected = await service.rejectExpense(
                req.params.id,
                reason,
                req.businessId,
                userId,
            );
            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Expense rejected successfully',
                rejected,
            );
        } catch (error) {
            console.log(error);
            return ResponseService.send(
                res,
                StatusCodes.BAD_REQUEST,
                error.message || 'Failed to reject expense',
            );
        }
    }

    static async pending(req, res) {
        try {
            const service = ExpenseController._getService(req);
            const userId = ExpenseController._getUserId(req);
            const pending = await service.pendingExpense(
                req.params.id,
                req.businessId,
                userId,
            );
            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Expense status changed to pending successfully',
                pending,
            );
        } catch (error) {
            return ResponseService.send(
                res,
                StatusCodes.BAD_REQUEST,
                error.message || 'Failed to change expense status to pending',
            );
        }
    }

    static async bulkGet(req, res) {
        try {
            const service = ExpenseController._getService(req);
            const result = await service.bulkGet(req.body, req.businessId);
            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Expenses fetched successfully',
                result,
            );
        } catch (error) {
            return ResponseService.send(
                res,
                StatusCodes.BAD_REQUEST,
                error.message || 'Failed to fetch expenses',
            );
        }
    }

    static async bulkUpdateStatus(req, res) {
        try {
            const service = ExpenseController._getService(req);
            const userId = ExpenseController._getUserId(req);
            console.log(req.body);
            const result = await service.bulkUpdateStatus(
                req.body,
                req.businessId,
                userId,
            );
            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Expenses status updated successfully',
                result,
            );
        } catch (error) {
            console.log(error);
            return ResponseService.send(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                error.message || 'Failed to update expenses status',
            );
        }
    }

    static async bulkDelete(req, res) {
        try {
            const service = ExpenseController._getService(req);
            const results = await service.bulkDelete(req.body, req.businessId);

            const successCount = results.filter((r) => r.success).length;
            const failureCount = results.length - successCount;

            return ResponseService.send(
                res,
                StatusCodes.OK,
                `Bulk deletion completed (${successCount} succeeded, ${failureCount} failed)`,
                results,
            );
        } catch (error) {
            return ResponseService.send(
                res,
                StatusCodes.BAD_REQUEST,
                error.message || 'Failed to delete expenses',
            );
        }
    }

    // In ExpenseController.js
    static async approvedExpenseReport(req, res) {
        try {
            const service = ExpenseController._getService(req);
            const report = await service.generateApprovedExpenseReport(
                req.query,  // Pass query params as filters
                req.businessId,
            );
            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Approved expense report generated successfully',
                {
                    data: report.expenses,  // This will be the array of approved expenses
                    summary: report.summary,
                    categoryBreakdown: report.categoryBreakdown,
                    filters: report.filters,
                    pagination: report.pagination,
                }
            );
        } catch (error) {
            return ResponseService.send(
                res,
                StatusCodes.BAD_REQUEST,
                error.message || 'Failed to generate expense report',
            );
        }
    }

}

export default ExpenseController;
