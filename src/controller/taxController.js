import { TaxService, CurrencyService } from '../services/index.js';
import { ResponseService } from '../utils/index.js';
import { StatusCodes } from 'http-status-codes';
const taxService = new TaxService();
const currencyService = new CurrencyService();

class taxController {
  static async createTax(req, res) {
    try {
      const taxData = req.body;
      const newTax = await taxService.create(taxData);

      if (!newTax) {
        ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Failed to create tax',
          null, 
        );
      }
      ResponseService.send(
        res,
        StatusCodes.CREATED,
        'Tax created successfully',
        newTax,
      );
    } catch (error) {
      console.log(error);

      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Error creating tax',
      );
    }
  }

  static async getTaxById(req, res) {
    try {
      const taxId = req.params.id;
      const tax = await taxService.getById(taxId);
      if (!tax) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Tax not found',
          null,
        );
      }
      ResponseService.send(
        res,
        StatusCodes.OK,
        'Tax retrieved successfully',
        tax,
      );
    } catch (error) {
      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Error retrieving tax',
      );
    }
  }

  static async deleteTax(req, res) {
    try {
      const taxId = req.params.id;
      const deletedTax = await taxService.deleteById(taxId);
      if (!deletedTax) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Tax not found',
          null,
        );
      }
      ResponseService.send(
        res,
        StatusCodes.OK,
        'Tax deleted successfully',
        deletedTax,
      );
    } catch (error) {
      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Error deleting tax',
      );
    }
  }

  static async updateTax(req, res) {
    try {
      const taxId = req.params.id;
      const taxData = req.body;
      const updatedTax = await taxService.updateById(taxId, taxData);
      if (!updatedTax) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Tax not found',
          null,
        );
      }
      ResponseService.send(
        res,
        StatusCodes.OK,
        'Tax updated successfully',
        updatedTax,
      );
    } catch (error) {
      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Error updating tax',
      );
    }
  }

  static async getTaxes(req, res) {
    try {
      const queryParams = {
        ...req.query,
      };

      const [result, primaryCurrency] = await Promise.all([
        taxService.getAllTaxes(queryParams),
        currencyService.getPrimaryCurrency(),
      ]);

      let taxes = [];
      let pagination = null;

      if (result.data) {
        taxes = result.data;
        pagination = result.pagination;
      } else {
        taxes = result;
      }

      // Format currency info
      const currency = primaryCurrency
        ? {
          symbol: primaryCurrency.currencySymbol,
          code: primaryCurrency.currencyCode,
          position: primaryCurrency.currencyPosition,
        }
        : null;

      if (!taxes || taxes.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'No taxes found',
          {
            data: [],
            currency,
          },
        );
      }

      const responseData = {
        data: taxes,
        pagination,
        currency,
      };

      // If it was not paginated (no pagination object), we might want to return different structure
      // but following the user's request for "data" field
      if (!pagination && Array.isArray(taxes)) {
        responseData.data = taxes;
        delete responseData.pagination;
      }

      ResponseService.send(
        res,
        StatusCodes.OK,
        'Taxes retrieved successfully',
        responseData,
      );
    } catch (error) {
      console.error(error);
      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Error retrieving taxes',
      );
    }
  }

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

      const result = await taxService.bulkUpdateStatus(ids, status);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Taxes status updated successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error?.message || 'Error updating taxes status',
      );
    }
  }

  static async bulkDelete(req, res) {
    try {
      const { ids } = req.body || {};
      console.log('req.body', req.body);
      console.log('ids', ids);

      if (!Array.isArray(ids) || ids.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'ids must be a non-empty array',
        );
      }

      const result = await taxService.bulkDelete(ids);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Taxes deleted successfully',
        result,
      );
    } catch (error) {
      console.log(error);

      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error?.message || 'Error deleting taxes',
      );
    }
  }

  /**
   * Bulk get taxes by IDs
   */
  static async bulkGet(req, res) {
    try {
      const { ids, lean, throwOnNotFound } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Tax IDs array is required and must not be empty',
        );
      }

      const MAX_IDS = 100;
      if (ids.length > MAX_IDS) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          `Maximum ${MAX_IDS} tax IDs allowed per request`,
        );
      }

      const [result, primaryCurrency] = await Promise.all([
        taxService.bulkGetTaxes(ids, {
          lean,
          throwOnNotFound,
        }),
        currencyService.getPrimaryCurrency(),
      ]);

      const message =
        result.found === result.totalRequested
          ? 'All taxes fetched successfully'
          : result.found > 0
            ? `${result.found} of ${result.totalRequested} taxes fetched successfully`
            : 'No taxes found';

      // Format currency info
      const currency = primaryCurrency
        ? {
          symbol: primaryCurrency.currencySymbol,
          code: primaryCurrency.currencyCode,
          position: primaryCurrency.currencyPosition,
        }
        : null;

      ResponseService.send(
        res,
        result.found > 0 ? StatusCodes.OK : StatusCodes.NOT_FOUND,
        message,
        { ...result, currency },
      );
    } catch (error) {
      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Error fetching taxes',
      );
    }
  }
}

export default taxController;
