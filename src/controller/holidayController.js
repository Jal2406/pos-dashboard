import { StatusCodes } from 'http-status-codes';
import { HolidayService } from '../services/index.js';
import { ResponseService } from '../utils/index.js';

class HolidayController {
  /**
   * Create a new holiday
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async createHoliday(req, res) {
    try {
      const businessId = req.businessId;
      const currentUser = req.user;
      const holidayData = req.body;

      // Validate required fields
      if (!holidayData.name || !holidayData.startDate || !holidayData.endDate) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Holiday name, start date, and end date are required',
          null,
        );
      }

      // Create holiday
      const holidayService = new HolidayService(businessId);
      const holiday = await holidayService.createHoliday(
        holidayData,
        currentUser,
        businessId,
      );

      return ResponseService.send(
        res,
        StatusCodes.CREATED,
        'Holiday created successfully',
        holiday,
      );
    } catch (error) {
      console.error('Error creating holiday:', error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to create holiday',
      );
    }
  }

  /**
   * Get holiday by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getHolidayById(req, res) {
    try {
      const businessId = req.businessId;
      const { id } = req.params;
      const currentUser = req.user;

      // Get holiday
      const holidayService = new HolidayService(businessId);
      const holiday = await holidayService.getHolidayById(
        id,
        currentUser,
        businessId,
      );

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Holiday retrieved successfully',
        holiday,
      );
    } catch (error) {
      console.error('Error getting holiday:', error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to get holiday',
        error.statusCode || 500,
      );
    }
  }

  /**
   * Update holiday
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async updateHoliday(req, res) {
    try {
      const businessId = req.businessId;
      const { id } = req.params;
      const currentUser = req.user;
      const updateData = req.body;

      // Update holiday
      const holidayService = new HolidayService(businessId);
      const holiday = await holidayService.updateHoliday(
        id,
        updateData,
        currentUser,
        businessId,
      );

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Holiday updated successfully',
        holiday,
      );
    } catch (error) {
      console.error('Error updating holiday:', error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to update holiday',
      );
    }
  }

  /**
   * Delete holiday
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async deleteHoliday(req, res) {
    try {
      const businessId = req.businessId;
      const { id } = req.params;
      const currentUser = req.user;

      // Delete holiday
      const holidayService = new HolidayService(businessId);
      const success = await holidayService.deleteHoliday(
        id,
        currentUser,
        businessId,
      );

      if (success) {
        return ResponseService.send(
          res,
          StatusCodes.OK,
          'Holiday deleted successfully',
          null,
        );
      } else {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Failed to delete holiday',
          null,
        );
      }
    } catch (error) {
      console.error('Error deleting holiday:', error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to delete holiday',
      );
    }
  }

  /**
   * Toggle holiday status
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async toggleHolidayStatus(req, res) {
    try {
      const businessId = req.businessId;
      const { id } = req.params;
      const currentUser = req.user;

      // Toggle holiday status
      const holidayService = new HolidayService(businessId);
      const holiday = await holidayService.toggleHolidayStatus(
        id,
        currentUser,
        businessId,
      );

      const statusText = holiday.status ? 'activated' : 'deactivated';
      return ResponseService.send(
        res,
        StatusCodes.OK,
        `Holiday ${statusText} successfully`,
        holiday,
      );
    } catch (error) {
      console.error('Error toggling holiday status:', error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to toggle holiday status',
      );
    }
  }

  /**
   * Get holidays with filtering and pagination
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getHolidays(req, res) {
    try {
      const businessId = req.businessId;
      const currentUser = req.user;
      const filters = req.query;
      const queryParams = {
        page: req.query.page || 1,
        limit: req.query.limit || 10,
        search: req.query.search,
        sortBy: req.query.sortBy || 'startDate',
        sortOrder: req.query.sortOrder || 'asc',
      };

      // Get holidays
      const holidayService = new HolidayService(businessId);
      const result = await holidayService.getHolidays(
        filters,
        queryParams,
        currentUser,
        businessId,
      );

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Holidays retrieved successfully',
        result,
      );
    } catch (error) {
      console.error('Error getting holidays:', error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to get holidays',
      );
    }
  }

  /**
   * Get active holidays
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getActiveHolidays(req, res) {
    try {
      const businessId = req.businessId;
      const currentUser = req.user;

      // Get active holidays
      const holidayService = new HolidayService(businessId);
      const holidays = await holidayService.getActiveHolidays(
        currentUser,
        businessId,
      );

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Active holidays retrieved successfully',
        holidays,
      );
    } catch (error) {
      console.error('Error getting active holidays:', error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to get active holidays',
      );
    }
  }

  /**
   * Get holidays by date range
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getHolidaysByDateRange(req, res) {
    try {
      const businessId = req.businessId;
      const currentUser = req.user;
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Start date and end date are required',
        );
      }

      // Get holidays by date range
      const holidayService = new HolidayService(businessId);
      const holidays = await holidayService.getHolidaysByDateRange(
        startDate,
        endDate,
        currentUser,
        businessId,
      );

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Holidays retrieved successfully',
        holidays,
      );
    } catch (error) {
      console.error('Error getting holidays by date range:', error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to get holidays by date range',
      );
    }
  }

  /**
   * Get recurring holidays
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getRecurringHolidays(req, res) {
    try {
      const businessId = req.businessId;
      const currentUser = req.user;

      // Get recurring holidays
      const holidayService = new HolidayService(businessId);
      const holidays = await holidayService.getRecurringHolidays(
        currentUser,
        businessId,
      );

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Recurring holidays retrieved successfully',
        holidays,
      );
    } catch (error) {
      console.error('Error getting recurring holidays:', error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to get recurring holidays',
      );
    }
  }

  /**
   * Get holidays by year
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getHolidaysByYear(req, res) {
    try {
      const businessId = req.businessId;
      const { year } = req.params;
      const currentUser = req.user;

      const yearNum = parseInt(year);
      if (isNaN(yearNum)) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Invalid year format',
          null,
        );
      }

      // Get holidays by year
      const holidayService = new HolidayService(businessId);
      const holidays = await holidayService.getHolidaysByYear(
        yearNum,
        currentUser,
        businessId,
      );

      return ResponseService.send(
        res,
        StatusCodes.OK,
        `Holidays for ${year} retrieved successfully`,
        holidays,
      );
    } catch (error) {
      console.error('Error getting holidays by year:', error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to get holidays by year',
      );
    }
  }

  /**
   * Get holiday statistics
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getHolidayStatistics(req, res) {
    try {
      const businessId = req.businessId;
      const currentUser = req.user;

      // Get holiday statistics
      const holidayService = new HolidayService(businessId);
      const statistics = await holidayService.getHolidayStatistics(
        currentUser,
        businessId,
      );

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Holiday statistics retrieved successfully',
        statistics,
      );
    } catch (error) {
      console.error('Error getting holiday statistics:', error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to get holiday statistics',
      );
    }
  }

  /**
   * Bulk create holidays
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async bulkCreateHolidays(req, res) {
    try {
      const businessId = req.businessId;
      const currentUser = req.user;
      const { holidays } = req.body;

      if (!holidays || !Array.isArray(holidays) || holidays.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Holidays array is required',
          null,
        );
      }

      const results = {
        successful: [],
        failed: [],
      };

      // Process each holiday
      const holidayService = new HolidayService(businessId);
      for (const holidayData of holidays) {
        try {
          const holiday = await holidayService.createHoliday(
            holidayData,
            currentUser,
            businessId,
          );
          results.successful.push(holiday);
        } catch (error) {
          results.failed.push({
            data: holidayData,
            error: error.message,
          });
        }
      }

      return ResponseService.send(
        res,
        StatusCodes.OK,
        `Bulk creation completed. ${results.successful.length} successful, ${results.failed.length} failed`,
        results,
      );
    } catch (error) {
      console.error('Error in bulk creating holidays:', error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to bulk create holidays',
      );
    }
  }

  /**
   * Bulk update holidays
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async bulkUpdateHolidays(req, res) {
    try {
      const businessId = req.businessId;
      const currentUser = req.user;
      const { updates } = req.body;

      if (!updates || !Array.isArray(updates) || updates.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Updates array is required',
          null,
        );
      }

      const results = {
        successful: [],
        failed: [],
      };

      // Process each update
      const holidayService = new HolidayService(businessId);
      for (const update of updates) {
        try {
          const { id, ...updateData } = update;
          if (!id) {
            throw new Error('Holiday ID is required for update');
          }

          const holiday = await holidayService.updateHoliday(
            id,
            updateData,
            currentUser,
            businessId,
          );
          results.successful.push(holiday);
        } catch (error) {
          results.failed.push({
            data: update,
            error: error.message,
          });
        }
      }

      return ResponseService.send(
        res,
        StatusCodes.OK,
        `Bulk update completed. ${results.successful.length} successful, ${results.failed.length} failed`,
        results,
      );
    } catch (error) {
      console.error('Error in bulk updating holidays:', error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to bulk update holidays',
      );
    }
  }

  /**
   * Bulk delete holidays
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async bulkDeleteHolidays(req, res) {
    try {
      const businessId = req.businessId;
      const currentUser = req.user;
      const { ids } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Holiday IDs array is required',
          null,
        );
      }

      const results = {
        successful: [],
        failed: [],
      };

      // Process each deletion
      const holidayService = new HolidayService(businessId);
      for (const id of ids) {
        try {
          const success = await holidayService.deleteHoliday(
            id,
            currentUser,
            businessId,
          );
          if (success) {
            results.successful.push({ id });
          } else {
            results.failed.push({
              id,
              error: 'Failed to delete holiday',
            });
          }
        } catch (error) {
          results.failed.push({
            id,
            error: error.message,
          });
        }
      }

      return ResponseService.send(
        res,
        StatusCodes.OK,
        `Bulk deletion completed. ${results.successful.length} successful, ${results.failed.length} failed`,
        results,
      );
    } catch (error) {
      console.error('Error in bulk deleting holidays:', error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to bulk delete holidays',
      );
    }
  }
}

export default HolidayController;
