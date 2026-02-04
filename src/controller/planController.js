import { StatusCodes } from 'http-status-codes';
import { ResponseService } from '../utils/index.js';
import { PlanService, CurrencyService } from '../services/index.js';
const planService = new PlanService();
const currencyService = new CurrencyService();

class PlanController {
  static async getPlan(req, res) {
    try {
      const queryParams = {
        ...req.query,
      };

      // Determine context based on the request URL
      const context = req.originalUrl?.includes('/super-admin')
        ? 'superadmin'
        : 'public';
      const plans = await planService.getAllPlansWithContext(
        queryParams,
        context,
      );
      if (!plans || plans.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'No plans found',
          [],
        );
      }
      ResponseService.send(
        res,
        StatusCodes.OK,
        'Plans retrieved successfully',
        plans,
      );
    } catch (error) {
      console.log(error);
      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Error retrieving plans',
        error.message,
      );
    }
  }

  static async createPlan(req, res) {
    try {
      const planData = req.body;
      const newPlan = await planService.create(planData);
      ResponseService.send(
        res,
        StatusCodes.CREATED,
        'Plan created successfully',
        newPlan,
      );
    } catch (error) {
      console.log(error);
      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Error creating plan',
        error.message,
      );
    }
  }

  static async getPlanById(req, res) {
    try {
      const planId = req.params.id;
      const plan = await planService.getById(planId);
      if (!plan) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Plan not found',
          null,
        );
      }
      ResponseService.send(
        res,
        StatusCodes.OK,
        'Plan retrieved successfully',
        plan,
      );
    } catch (error) {
      if (error.message.includes('not found')) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Plan not found',
          null,
        );
      }
      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Error retrieving plan',
        error.message,
      );
    }
  }

  static async deletePlan(req, res) {
    try {
      const planId = req.params.id;
      const deletedPlan = await planService.deleteById(planId);
      if (!deletedPlan) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Plan not found',
          null,
        );
      }
      ResponseService.send(
        res,
        StatusCodes.OK,
        'Plan deleted successfully',
        deletedPlan,
      );
    } catch (error) {
      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Error deleting plan',
        error.message,
      );
    }
  }
  static async updatePlan(req, res) {
    try {
      const planId = req.params.id;
      const planData = req.body;
      const updatedPlan = await planService.updateById(planId, planData);
      if (!updatedPlan) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Plan not found',
          null,
        );
      }
      ResponseService.send(
        res,
        StatusCodes.OK,
        'Plan updated successfully',
        updatedPlan,
      );
    } catch (error) {
      console.log(error);
      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Error updating plan',
        error.message,
      );
    }
  }

  static async updateTrialPlan(req, res) {
    try {
      const planData = req.body;
      const updatedPlan = await planService.updateTrialPlan(planData);
      ResponseService.send(
        res,
        StatusCodes.OK,
        'Trial plan updated successfully',
        updatedPlan,
      );
    } catch (error) {
      console.log(error);
      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Error updating trial plan',
        error.message,
      );
    }
  }

  static async getTrialDays(req, res) {
    try {
      const trialDays = await planService.trialdays();
      ResponseService.send(
        res,
        StatusCodes.OK,
        'Trial days retrieved successfully',
        trialDays,
      );
    } catch (error) {
      console.log(error);
      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Error retrieving trial days',
        error.message,
      );
    }
  }

  static async getTrialPlan(req, res) {
    try {
      const trialPlan = await planService.getTrialPlan();
      ResponseService.send(
        res,
        StatusCodes.OK,
        'Trial plan retrieved successfully',
        trialPlan,
      );
    } catch (error) {
      console.log(error);
      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Error retrieving trial plan',
        error.message,
      );
    }
  }

  static async getActiveCurrenciesForPlans(req, res) {
    try {
      const currencies = await currencyService.getActiveCurrencies();

      if (!currencies || currencies.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'No active currencies found',
          [],
        );
      }

      ResponseService.send(
        res,
        StatusCodes.OK,
        'Active currencies retrieved successfully',
        currencies,
      );
    } catch (error) {
      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        `Error retrieving active currencies: ${error.message}`,
        null,
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

      const result = await planService.bulkUpdateStatus(ids, status);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Plans status updated successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error?.message || 'Error updating plans status',
      );
    }
  }

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

      const result = await planService.bulkDelete(ids);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Plans deleted successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error?.message || 'Error deleting plans',
      );
    }
  }

  /**
   * Bulk get plans by IDs
   */
  static async bulkGet(req, res) {
    try {
      const { ids, lean, throwOnNotFound } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Plan IDs array is required and must not be empty',
        );
      }

      const MAX_IDS = 100;
      if (ids.length > MAX_IDS) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          `Maximum ${MAX_IDS} plan IDs allowed per request`,
        );
      }

      const result = await planService.bulkGetPlans(ids, {
        lean,
        throwOnNotFound,
      });

      const message =
        result.found === result.totalRequested
          ? 'All plans fetched successfully'
          : result.found > 0
            ? `${result.found} of ${result.totalRequested} plans fetched successfully`
            : 'No plans found';

      ResponseService.send(
        res,
        result.found > 0 ? StatusCodes.OK : StatusCodes.NOT_FOUND,
        message,
        result,
      );
    } catch (error) {
      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Error fetching plans',
      );
    }
  }
}

export default PlanController;
