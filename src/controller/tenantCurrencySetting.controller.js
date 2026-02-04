import { TenantCurrencySettingService } from '../services/index.js';
import { ResponseService } from '../utils/index.js';
import { StatusCodes } from 'http-status-codes';

class TenantCurrencySettingController {
    static async createCurrency(req, res) {
        try {
            const tenantCurrencyService = new TenantCurrencySettingService(
                req.businessId,
            );
            const currencyData = req.body;

            // Validate required fields
            const requiredFields = [
                'currencyName',
                'currencyCode',
                'currencySymbol',
                'currencyPosition',
                'thousandSeparator',
                'decimalSeparator',
                'numberOfDecimals',
            ];

            for (const field of requiredFields) {
                if (
                    !currencyData[field] ||
                    (typeof currencyData[field] === 'string' &&
                        currencyData[field].trim() === '')
                ) {
                    return ResponseService.send(
                        res,
                        StatusCodes.BAD_REQUEST,
                        `${field} is required`,
                        null,
                    );
                }
            }

            // Check if currency code already exists
            const isCodeAvailable = await tenantCurrencyService.validateCurrencyCode(
                currencyData.currencyCode,
            );
            if (!isCodeAvailable) {
                return ResponseService.send(
                    res,
                    StatusCodes.CONFLICT,
                    'Currency code already exists',
                    null,
                );
            }

            // If setting as primary, check if another primary exists
            if (currencyData.isPrimary) {
                const existingPrimary = await tenantCurrencyService.getPrimaryCurrency();
                if (existingPrimary) {
                    return ResponseService.send(
                        res,
                        StatusCodes.CONFLICT,
                        `${existingPrimary.currencyName} currency is already selected as primary. Only one currency can be primary at a time.`,
                        null,
                    );
                }
            }

            const newCurrency = await tenantCurrencyService.create(currencyData);

            if (!newCurrency) {
                return ResponseService.send(
                    res,
                    StatusCodes.BAD_REQUEST,
                    'Failed to create currency',
                    null,
                );
            }

            ResponseService.send(
                res,
                StatusCodes.CREATED,
                'Currency created successfully',
                newCurrency,
            );
        } catch (error) {
            ResponseService.send(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                `Error creating currency: ${error.message}`,
                null,
            );
        }
    }

    static async getAllCurrencies(req, res) {
        try {
            const tenantCurrencyService = new TenantCurrencySettingService(
                req.businessId,
            );
            const queryParams = {
                page: req.query.page,
                limit: req.query.limit,
                search: req.query.search,
                sortBy: req.query.sortBy,
                sortOrder: req.query.sortOrder,
                isPrimary: req.query.isPrimary,
            };

            const currencies = await tenantCurrencyService.getAllCurrencies(
                queryParams,
            );

            if (!currencies || (currencies.data && currencies.data.length === 0)) {
                return ResponseService.send(
                    res,
                    StatusCodes.NOT_FOUND,
                    'No currencies found',
                    { data: [], pagination: currencies.pagination || {} },
                );
            }

            ResponseService.send(
                res,
                StatusCodes.OK,
                'Currencies retrieved successfully',
                currencies,
            );
        } catch (error) {
            ResponseService.send(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                `Error retrieving currencies: ${error.message}`,
                null,
            );
        }
    }

    static async getPrimaryCurrency(req, res) {
        try {
            const tenantCurrencyService = new TenantCurrencySettingService(
                req.businessId,
            );
            const primaryCurrency = await tenantCurrencyService.getPrimaryCurrency();

            if (!primaryCurrency) {
                return ResponseService.send(
                    res,
                    StatusCodes.NOT_FOUND,
                    'No primary currency found',
                    null,
                );
            }

            ResponseService.send(
                res,
                StatusCodes.OK,
                'Primary currency retrieved successfully',
                primaryCurrency,
            );
        } catch (error) {
            ResponseService.send(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                `Error retrieving primary currency: ${error.message}`,
                null,
            );
        }
    }

    static async updateCurrency(req, res) {
        try {
            const tenantCurrencyService = new TenantCurrencySettingService(
                req.businessId,
            );
            const currencyId = req.params.id;
            const currencyData = req.body;

            // Check if currency code is being changed and if it already exists
            if (currencyData.currencyCode) {
                const isCodeAvailable = await tenantCurrencyService.validateCurrencyCode(
                    currencyData.currencyCode,
                    currencyId,
                );
                if (!isCodeAvailable) {
                    return ResponseService.send(
                        res,
                        StatusCodes.CONFLICT,
                        'Currency code already exists',
                        null,
                    );
                }
            }

            // If setting as primary, check if another primary exists
            if (currencyData.isPrimary) {
                const existingPrimary = await tenantCurrencyService.getPrimaryCurrency();
                if (existingPrimary && existingPrimary._id.toString() !== currencyId) {
                    return ResponseService.send(
                        res,
                        StatusCodes.CONFLICT,
                        `${existingPrimary.currencyName} currency is already selected as primary. Only one currency can be primary at a time.`,
                        null,
                    );
                }
            }

            const updatedCurrency = await tenantCurrencyService.updateById(
                currencyId,
                currencyData,
            );

            if (!updatedCurrency) {
                return ResponseService.send(
                    res,
                    StatusCodes.NOT_FOUND,
                    'Currency not found',
                    null,
                );
            }

            ResponseService.send(
                res,
                StatusCodes.OK,
                'Currency updated successfully',
                updatedCurrency,
            );
        } catch (error) {
            ResponseService.send(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                `Error updating currency: ${error.message}`,
                null,
            );
        }
    }

    static async deleteCurrency(req, res) {
        try {
            const tenantCurrencyService = new TenantCurrencySettingService(
                req.businessId,
            );
            const currencyId = req.params.id;

            // Check if currency is primary before deletion
            const currency = await tenantCurrencyService.getById(currencyId);
            if (currency && currency.isPrimary) {
                return ResponseService.send(
                    res,
                    StatusCodes.BAD_REQUEST,
                    'Cannot delete primary currency. Please set another currency as primary first.',
                    null,
                );
            }

            const deletedCurrency = await tenantCurrencyService.deleteById(currencyId);

            if (!deletedCurrency) {
                return ResponseService.send(
                    res,
                    StatusCodes.NOT_FOUND,
                    'Currency not found',
                    null,
                );
            }

            ResponseService.send(
                res,
                StatusCodes.OK,
                'Currency deleted successfully',
                deletedCurrency,
            );
        } catch (error) {
            console.log(error);
            ResponseService.send(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                `Error deleting currency: ${error.message}`,
                null,
            );
        }
    }

    static async setAsPrimary(req, res) {
        try {
            const tenantCurrencyService = new TenantCurrencySettingService(
                req.businessId,
            );
            const currencyId = req.params.id;

            // Check if currency exists and is active
            const currency = await tenantCurrencyService.getById(currencyId);
            if (!currency) {
                return ResponseService.send(
                    res,
                    StatusCodes.NOT_FOUND,
                    'Currency not found',
                    null,
                );
            }

            const result = await tenantCurrencyService.setAsPrimary(currencyId);

            ResponseService.send(
                res,
                StatusCodes.OK,
                'Currency set as primary successfully',
                result,
            );
        } catch (error) {
            ResponseService.send(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                `Error setting currency as primary: ${error.message}`,
                null,
            );
        }
    }
}

export default TenantCurrencySettingController;
