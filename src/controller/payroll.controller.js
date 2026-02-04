import { StatusCodes } from 'http-status-codes';
import PayrollService from '../services/payroll.services.js';
import { ResponseService } from '../utils/index.js';

class PayrollController {
    /**
     * Generate payroll for a single employee
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     * @param {Function} next - Next middleware function
     */
    static async generatePayrollForEmployee(req, res, next) {
        try {
            const { employeeId } = req.params;
            const { month, year } = req.body;
            const currentUser = req.user;
            const businessId = req.businessId;

            if (!month || !year) {
                return ResponseService.send(
                    res,
                    StatusCodes.BAD_REQUEST,
                    'Month and year are required',
                );
            }

            const payrollService = new PayrollService(businessId);
            const payroll = await payrollService.generatePayrollForEmployee(
                employeeId,
                parseInt(month),
                parseInt(year),
                currentUser,
            );

            ResponseService.send(
                res,
                StatusCodes.CREATED,
                'Payroll generated successfully',
                payroll,
            );
        } catch (error) {
            console.log(error);

            if (
                error.message.includes('Invalid') ||
                error.message.includes('not found') ||
                error.message.includes('already exists') ||
                error.message.includes('does not have') ||
                error.message.includes('must be between')
            ) {
                return ResponseService.send(
                    res,
                    StatusCodes.BAD_REQUEST,
                    error.message,
                );
            }
            next(error);
        }
    }

    /**
     * Generate payroll for multiple employees
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     * @param {Function} next - Next middleware function
     */
    static async generateBulkPayroll(req, res, next) {
        try {
            const { employeeIds, month, year } = req.body;
            const currentUser = req.user;
            const businessId = req.businessId;

            if (!employeeIds || !Array.isArray(employeeIds) || employeeIds.length === 0) {
                return ResponseService.send(
                    res,
                    StatusCodes.BAD_REQUEST,
                    'Employee IDs array is required',
                );
            }

            if (!month || !year) {
                return ResponseService.send(
                    res,
                    StatusCodes.BAD_REQUEST,
                    'Month and year are required',
                );
            }

            const payrollService = new PayrollService(businessId);
            const results = await payrollService.generateBulkPayroll(
                employeeIds,
                parseInt(month),
                parseInt(year),
                currentUser,
            );

            ResponseService.send(
                res,
                StatusCodes.CREATED,
                `Bulk payroll generation completed. Success: ${results.successful.length}, Failed: ${results.failed.length}`,
                results,
            );
        } catch (error) {
            if (error.message.includes('Invalid') || error.message.includes('required')) {
                return ResponseService.send(
                    res,
                    StatusCodes.BAD_REQUEST,
                    error.message,
                );
            }
            next(error);
        }
    }

    /**
     * Generate payroll for all employees in a store
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     * @param {Function} next - Next middleware function
     */
    static async generatePayrollForStore(req, res, next) {
        try {
            const { storeId } = req.params;
            const { month, year } = req.body;
            const currentUser = req.user;
            const businessId = req.businessId;

            if (!month || !year) {
                return ResponseService.send(
                    res,
                    StatusCodes.BAD_REQUEST,
                    'Month and year are required',
                );
            }

            const payrollService = new PayrollService(businessId);
            const results = await payrollService.generatePayrollForStore(
                storeId === 'unassigned' ? null : storeId,
                parseInt(month),
                parseInt(year),
                currentUser,
            );

            ResponseService.send(
                res,
                StatusCodes.CREATED,
                `Store payroll generation completed. Success: ${results.successful.length}, Failed: ${results.failed.length}`,
                results,
            );
        } catch (error) {
            if (
                error.message.includes('Invalid') ||
                error.message.includes('not found') ||
                error.message.includes('No active employees')
            ) {
                return ResponseService.send(
                    res,
                    StatusCodes.BAD_REQUEST,
                    error.message,
                );
            }
            next(error);
        }
    }

    /**
     * Get payroll by ID
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     * @param {Function} next - Next middleware function
     */
    static async getPayrollById(req, res, next) {
        try {
            const { id } = req.params;
            const businessId = req.businessId;

            const payrollService = new PayrollService(businessId);
            const payroll = await payrollService.getPayrollById(id);

            ResponseService.send(
                res,
                StatusCodes.OK,
                'Payroll retrieved successfully',
                payroll,
            );
        } catch (error) {
            if (
                error.message.includes('Invalid') ||
                error.message.includes('not found')
            ) {
                return ResponseService.send(res, StatusCodes.NOT_FOUND, error.message);
            }
            next(error);
        }
    }

    /**
     * Get all payrolls with filtering and pagination
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     * @param {Function} next - Next middleware function
     */
    static async getPayrolls(req, res, next) {
        try {
            const queryParams = req.query;
            const businessId = req.businessId;

            const options = {
                page: queryParams.page || 1,
                limit: queryParams.limit || 10,
                month: queryParams.month,
                year: queryParams.year,
                employeeId: queryParams.employeeId,
                storeId: queryParams.storeId,
            };

            const payrollService = new PayrollService(businessId);
            const result = await payrollService.getPayrolls({}, options, req.user);

            ResponseService.send(
                res,
                StatusCodes.OK,
                'Payrolls retrieved successfully',
                result,
            );
        } catch (error) {
            if (error.message.includes('Invalid')) {
                return ResponseService.send(
                    res,
                    StatusCodes.BAD_REQUEST,
                    error.message,
                );
            }
            next(error);
        }
    }

    /**
     * Update payroll deduction
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     * @param {Function} next - Next middleware function
     */
    static async updatePayrollDeduction(req, res, next) {
        try {
            const { id } = req.params;
            const { deduction } = req.body;
            const currentUser = req.user;
            const businessId = req.businessId;

            if (deduction === undefined || deduction === null) {
                return ResponseService.send(
                    res,
                    StatusCodes.BAD_REQUEST,
                    'Deduction amount is required',
                );
            }

            const payrollService = new PayrollService(businessId);
            const payroll = await payrollService.updatePayrollDeduction(
                id,
                deduction,
                currentUser,
            );

            ResponseService.send(
                res,
                StatusCodes.OK,
                'Payroll deduction updated successfully',
                payroll,
            );
        } catch (error) {
            if (
                error.message.includes('Invalid') ||
                error.message.includes('not found') ||
                error.message.includes('cannot be negative')
            ) {
                return ResponseService.send(
                    res,
                    StatusCodes.BAD_REQUEST,
                    error.message,
                );
            }
            next(error);
        }
    }

    /**
     * Delete payroll record
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     * @param {Function} next - Next middleware function
     */
    static async deletePayroll(req, res, next) {
        try {
            const { id } = req.params;
            const currentUser = req.user;
            const businessId = req.businessId;

            const payrollService = new PayrollService(businessId);
            await payrollService.deletePayroll(id, currentUser);

            ResponseService.send(
                res,
                StatusCodes.OK,
                'Payroll deleted successfully',
            );
        } catch (error) {
            if (
                error.message.includes('Invalid') ||
                error.message.includes('not found')
            ) {
                return ResponseService.send(res, StatusCodes.NOT_FOUND, error.message);
            }
            next(error);
        }
    }

    /**
     * Get payroll summary for a month
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     * @param {Function} next - Next middleware function
     */
    static async getPayrollSummary(req, res, next) {
        try {
            const { month, year } = req.params;
            const { storeId } = req.query;
            const businessId = req.businessId;

            if (!month || !year) {
                return ResponseService.send(
                    res,
                    StatusCodes.BAD_REQUEST,
                    'Month and year are required',
                );
            }

            const payrollService = new PayrollService(businessId);
            const summary = await payrollService.getPayrollSummary(
                parseInt(month),
                parseInt(year),
                storeId,
            );

            ResponseService.send(
                res,
                StatusCodes.OK,
                'Payroll summary retrieved successfully',
                summary,
            );
        } catch (error) {
            if (error.message.includes('Invalid')) {
                return ResponseService.send(
                    res,
                    StatusCodes.BAD_REQUEST,
                    error.message,
                );
            }
            next(error);
        }
    }
}

export default PayrollController;
