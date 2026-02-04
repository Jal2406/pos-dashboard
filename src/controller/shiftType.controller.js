import { StatusCodes } from 'http-status-codes';
import { ResponseService } from '../utils/index.js';
import { ShiftTypeService } from '../services/index.js';

// Note: instantiate per request using req.businessId so each call is tenant-scoped

class ShiftController {
  /**
   * Create a new shift type with access control
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async createShiftType(req, res) {
    try {
      const shiftTypeData = req.body;
      const currentUser = req.user;
      const shiftService = new ShiftTypeService(req.businessId);

      const newShiftType = await shiftService.create(
        shiftTypeData,
        currentUser,
      );

      // Enhanced response with additional context
      const responseData = {
        shiftType: newShiftType,
        summary: {
          title: newShiftType.title,
          scope: newShiftType.scope,
          status: newShiftType.status,
          storeName: newShiftType.store?.name || 'Business-wide',
        },
        actions: {
          viewShiftType: `/shift/${newShiftType._id}`,
          updateShiftType: `/shift/${newShiftType._id}`,
          deleteShiftType: `/shift/${newShiftType._id}`,
        },
      };

      ResponseService.send(
        res,
        StatusCodes.CREATED,
        `Shift type "${newShiftType.name}" created successfully`,
        responseData,
      );
    } catch (error) {
      console.log(error);

      if (error.message.includes('Unauthorized')) {
        return ResponseService.send(
          res,
          StatusCodes.FORBIDDEN,
          'Access denied',
          error.message,
        );
      }
      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Error creating shift type',
        error.message,
      );
    }
  }

  /**
   * Get all shift types with pagination and filtering (with business context)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getAllShiftTypes(req, res) {
    try {
      const queryParams = {
        page: req.query.page,
        limit: req.query.limit,
        search: req.query.search,
        sortBy: req.query.sortBy,
        sortOrder: req.query.sortOrder,
        isActive: req.query.isActive,
        storeId: req.query.storeId,
      };

      const currentUser = req.user;
      const shiftService = new ShiftTypeService(req.businessId);
      const shiftTypes = await shiftService.listWithBusinessContext(
        queryParams,
        currentUser,
      );

      if (!shiftTypes || shiftTypes.data.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'No shift types found',
          {
            data: [],
            pagination: { currentPage: 1, totalPages: 0, totalCount: 0 },
          },
        );
      }

      ResponseService.send(
        res,
        StatusCodes.OK,
        'Shift types retrieved successfully',
        shiftTypes,
      );
    } catch (error) {
      if (error.message.includes('Unauthorized')) {
        return ResponseService.send(
          res,
          StatusCodes.FORBIDDEN,
          'Access denied',
          error.message,
        );
      }
      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Error retrieving shift types',
        error.message,
      );
    }
  }

  /**
   * Get shift type by ID with business context
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getShiftTypeById(req, res) {
    try {
      const shiftTypeId = req.params.id;
      const currentUser = req.user;
      const shiftService = new ShiftTypeService(req.businessId);
      const shiftType = await shiftService.getByIdWithBusinessContext(
        shiftTypeId,
        currentUser,
      );

      if (!shiftType) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Shift type not found',
          null,
        );
      }

      // Enhanced response with additional context
      const responseData = {
        shiftType: shiftType,
        summary: {
          title: shiftType.title,
          scope: shiftType.scope,
          status: shiftType.status,
          storeName: shiftType.store?.name || 'Business-wide',
        },
        actions: {
          updateShiftType: `/shift/${shiftType._id}`,
          deleteShiftType: `/shift/${shiftType._id}`,
          toggleStatus: `/shift/${shiftType._id}/toggle`,
        },
        metadata: {
          createdDate: shiftType.createdDateFormatted,
          lastUpdated: shiftType.updatedAt,
        },
      };

      ResponseService.send(
        res,
        StatusCodes.OK,
        `Shift type "${shiftType.name}" retrieved successfully`,
        responseData,
      );
    } catch (error) {
      if (error.message.includes('not found')) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Shift type not found',
          null,
        );
      }
      if (error.message.includes('Unauthorized')) {
        return ResponseService.send(
          res,
          StatusCodes.FORBIDDEN,
          'Access denied',
          error.message,
        );
      }
      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Error retrieving shift type',
        error.message,
      );
    }
  }

  /**
   * Update shift type by ID with access control
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async updateShiftType(req, res) {
    try {
      const shiftTypeId = req.params.id;
      const shiftTypeData = req.body;
      const currentUser = req.user;
      const shiftService = new ShiftTypeService(req.businessId);
      const updatedShiftType = await shiftService.updateById(
        shiftTypeId,
        shiftTypeData,
        currentUser,
      );

      if (!updatedShiftType) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Shift type not found',
          null,
        );
      }

      ResponseService.send(
        res,
        StatusCodes.OK,
        'Shift type updated successfully',
        updatedShiftType,
      );
    } catch (error) {
      console.log(error);

      if (error.message.includes('not found')) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Shift type not found',
          null,
        );
      }
      if (error.message.includes('Unauthorized')) {
        return ResponseService.send(
          res,
          StatusCodes.FORBIDDEN,
          'Access denied',
          error.message,
        );
      }
      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Error updating shift type',
        error.message,
      );
    }
  }

  /**
   * Delete shift type by ID with access control
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async deleteShiftType(req, res) {
    try {
      const shiftTypeId = req.params.id;
      const currentUser = req.user;
      const shiftService = new ShiftTypeService(req.businessId);
      const deletedShiftType = await shiftService.deleteById(
        shiftTypeId,
        currentUser,
      );

      if (!deletedShiftType) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Shift type not found',
          null,
        );
      }

      ResponseService.send(
        res,
        StatusCodes.OK,
        'Shift type deleted successfully',
        deletedShiftType,
      );
    } catch (error) {
      if (error.message.includes('not found')) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Shift type not found',
          null,
        );
      }
      if (error.message.includes('Unauthorized')) {
        return ResponseService.send(
          res,
          StatusCodes.FORBIDDEN,
          'Access denied',
          error.message,
        );
      }
      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Error deleting shift type',
        error.message,
      );
    }
  }

  /**
   * Bulk get shift types by IDs
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async bulkGet(req, res) {
    try {
      const currentUser = req.user;
      const { ids, lean, throwOnNotFound } = req.body;

      if (!currentUser) {
        return ResponseService.send(
          res,
          StatusCodes.UNAUTHORIZED,
          'User not authenticated',
        );
      }

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Shift type IDs array is required and must not be empty',
        );
      }

      const MAX_IDS = 100;
      if (ids.length > MAX_IDS) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          `Maximum ${MAX_IDS} shift type IDs allowed per request`,
        );
      }

      const shiftService = new ShiftTypeService(req.businessId);
      const result = await shiftService.bulkGetShiftTypes(ids, {
        lean,
        throwOnNotFound,
      });

      const message =
        result.found === result.totalRequested
          ? 'All shift types fetched successfully'
          : result.found > 0
            ? `${result.found} of ${result.totalRequested} shift types fetched successfully`
            : 'No shift types found';

      return ResponseService.send(
        res,
        result.found > 0 ? StatusCodes.OK : StatusCodes.NOT_FOUND,
        message,
        result,
      );
    } catch (error) {
      if (error.message.includes('Unauthorized')) {
        return ResponseService.send(
          res,
          StatusCodes.FORBIDDEN,
          'Access denied',
          error.message,
        );
      }
      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Error fetching shift types',
        error.message,
      );
    }
  }

  /**
   * Bulk update shift type statuses
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async bulkUpdateStatus(req, res) {
    try {
      const currentUser = req.user;
      const { ids, status } = req.body;

      if (!currentUser) {
        return ResponseService.send(
          res,
          StatusCodes.UNAUTHORIZED,
          'User not authenticated',
        );
      }

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Shift type IDs array is required and must not be empty',
        );
      }

      if (typeof status !== 'boolean') {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Status must be a boolean value (true or false)',
        );
      }

      const shiftService = new ShiftTypeService(req.businessId);
      const result = await shiftService.bulkUpdateStatus(ids, status, currentUser);

      ResponseService.send(
        res,
        StatusCodes.OK,
        result.message,
        result,
      );
    } catch (error) {
      if (error.message.includes('Unauthorized')) {
        return ResponseService.send(
          res,
          StatusCodes.FORBIDDEN,
          'Access denied',
          error.message,
        );
      }
      ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        'Error updating shift type statuses',
        error.message,
      );
    }
  }

  /**
   * Bulk delete shift types
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async bulkDelete(req, res) {
    try {
      const currentUser = req.user;
      const { ids } = req.body;

      if (!currentUser) {
        return ResponseService.send(
          res,
          StatusCodes.UNAUTHORIZED,
          'User not authenticated',
        );
      }

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Shift type IDs array is required and must not be empty',
        );
      }

      const shiftService = new ShiftTypeService(req.businessId);
      const result = await shiftService.bulkDelete(ids, currentUser);

      ResponseService.send(
        res,
        StatusCodes.OK,
        result.message,
        result,
      );
    } catch (error) {
      if (error.message.includes('Unauthorized')) {
        return ResponseService.send(
          res,
          StatusCodes.FORBIDDEN,
          'Access denied',
          error.message,
        );
      }
      if (error.message.includes('not found')) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Shift types not found',
          error.message,
        );
      }
      ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        'Error deleting shift types',
        error.message,
      );
    }
  }

  /**
   * Toggle shift type active status
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async toggleShiftTypeStatus(req, res) {
    try {
      const shiftTypeId = req.params.id;
      const currentUser = req.user;
      const shiftService = new ShiftTypeService(req.businessId);
      const { message, data } = await shiftService.toggleStatus(
        shiftTypeId,
        currentUser,
      );

      ResponseService.send(res, StatusCodes.OK, message, data);
    } catch (error) {
      if (error.message.includes('not found')) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Shift type not found',
          null,
        );
      }
      if (error.message.includes('Unauthorized')) {
        return ResponseService.send(
          res,
          StatusCodes.FORBIDDEN,
          'Access denied',
          error.message,
        );
      }
      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Error toggling shift type status',
        error.message,
      );
    }
  }

  /**
   * Get active shift types for business or store
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getActiveShiftTypes(req, res) {
    try {
      const { storeId } = req.query;
      const currentUser = req.user;
      const shiftService = new ShiftTypeService(req.businessId);

      // Get business ID for the user
      const businessId = await shiftService.getBusinessIdForUser(currentUser);
      const activeShiftTypes = await shiftService.getActiveShiftTypes(
        businessId,
        storeId,
      );

      ResponseService.send(
        res,
        StatusCodes.OK,
        'Active shift types retrieved successfully',
        {
          data: activeShiftTypes,
          scope: storeId ? 'store' : 'business',
          storeId: storeId || null,
        },
      );
    } catch (error) {
      if (error.message.includes('Unauthorized')) {
        return ResponseService.send(
          res,
          StatusCodes.FORBIDDEN,
          'Access denied',
          error.message,
        );
      }
      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Error retrieving active shift types',
        error.message,
      );
    }
  }

  /**
   * Get shift types by store ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getShiftTypesByStore(req, res) {
    try {
      const storeId = req.params.storeId;
      const queryParams = {
        page: req.query.page,
        limit: req.query.limit,
        isActive: req.query.isActive,
        storeId,
      };

      const currentUser = req.user;
      const shiftService = new ShiftTypeService(req.businessId);
      const shiftTypes = await shiftService.listWithBusinessContext(
        queryParams,
        currentUser,
      );

      ResponseService.send(
        res,
        StatusCodes.OK,
        'Store shift types retrieved successfully',
        shiftTypes,
      );
    } catch (error) {
      if (error.message.includes('Unauthorized')) {
        return ResponseService.send(
          res,
          StatusCodes.FORBIDDEN,
          'Access denied',
          error.message,
        );
      }
      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Error retrieving store shift types',
        error.message,
      );
    }
  }

  /**
   * Get shift types applicable on a specific day
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getShiftTypesForDay(req, res) {
    try {
      const { dayName } = req.params;
      const { storeId } = req.query;
      const currentUser = req.user;
      const shiftService = new ShiftTypeService(req.businessId);

      // Validate day name
      const validDays = [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
      ];
      if (!validDays.includes(dayName)) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          `Invalid day name. Must be one of: ${validDays.join(', ')}`,
          null,
        );
      }

      const businessId = await shiftService.getBusinessIdForUser(currentUser);
      const shiftTypes = await shiftService.getShiftTypesApplicableOnDay(
        dayName,
        businessId,
        storeId,
      );

      ResponseService.send(
        res,
        StatusCodes.OK,
        `Found ${shiftTypes.length} shift types applicable on ${dayName}`,
        {
          dayName,
          shiftTypes,
          count: shiftTypes.length,
          storeId: storeId || 'business-wide',
        },
      );
    } catch (error) {
      console.log(error);

      if (error.message.includes('Unauthorized')) {
        return ResponseService.send(
          res,
          StatusCodes.FORBIDDEN,
          error.message,
          null,
        );
      }

      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Error retrieving shift types for day',
        null,
      );
    }
  }

  /**
   * Get shift types with week off information
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getShiftTypesWithWeekOffInfo(req, res) {
    try {
      const { storeId } = req.query;
      const currentUser = req.user;
      const shiftService = new ShiftTypeService(req.businessId);

      const businessId = await shiftService.getBusinessIdForUser(currentUser);
      const shiftTypes = await shiftService.getShiftTypesWithWeekOffInfo(
        businessId,
        storeId,
      );

      ResponseService.send(
        res,
        StatusCodes.OK,
        `Retrieved ${shiftTypes.length} shift types with week off information`,
        {
          shiftTypes,
          count: shiftTypes.length,
          storeId: storeId || 'business-wide',
        },
      );
    } catch (error) {
      console.log(error);

      if (error.message.includes('Unauthorized')) {
        return ResponseService.send(
          res,
          StatusCodes.FORBIDDEN,
          error.message,
          null,
        );
      }

      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Error retrieving shift types with week off info',
        null,
      );
    }
  }

  /**
   * Add week off day to shift type
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async addWeekOffDay(req, res) {
    try {
      const { id } = req.params;
      const { dayName } = req.body;
      const currentUser = req.user;
      const shiftService = new ShiftTypeService(req.businessId);

      // Validate day name
      const validDays = [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
      ];
      if (!validDays.includes(dayName)) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          `Invalid day name. Must be one of: ${validDays.join(', ')}`,
          null,
        );
      }

      const updatedShiftType = await shiftService.addWeekOffDay(
        id,
        dayName,
        currentUser,
      );

      ResponseService.send(
        res,
        StatusCodes.OK,
        `Week off day "${dayName}" added successfully to shift type "${updatedShiftType.title}"`,
        {
          shiftType: updatedShiftType,
          addedDay: dayName,
          weekOffDays: updatedShiftType.weekOff,
        },
      );
    } catch (error) {
      console.log(error);

      if (error.message.includes('Unauthorized')) {
        return ResponseService.send(
          res,
          StatusCodes.FORBIDDEN,
          error.message,
          null,
        );
      }

      if (error.message.includes('not found')) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          error.message,
          null,
        );
      }

      if (error.message.includes('already a week off day')) {
        return ResponseService.send(
          res,
          StatusCodes.CONFLICT,
          error.message,
          null,
        );
      }

      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Error adding week off day',
        null,
      );
    }
  }

  /**
   * Remove week off day from shift type
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async removeWeekOffDay(req, res) {
    try {
      const { id } = req.params;
      const { dayName } = req.body;
      const currentUser = req.user;
      const shiftService = new ShiftTypeService(req.businessId);

      // Validate day name
      const validDays = [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
      ];
      if (!validDays.includes(dayName)) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          `Invalid day name. Must be one of: ${validDays.join(', ')}`,
          null,
        );
      }

      const updatedShiftType = await shiftService.removeWeekOffDay(
        id,
        dayName,
        currentUser,
      );

      ResponseService.send(
        res,
        StatusCodes.OK,
        `Week off day "${dayName}" removed successfully from shift type "${updatedShiftType.title}"`,
        {
          shiftType: updatedShiftType,
          removedDay: dayName,
          weekOffDays: updatedShiftType.weekOff,
        },
      );
    } catch (error) {
      console.log(error);

      if (error.message.includes('Unauthorized')) {
        return ResponseService.send(
          res,
          StatusCodes.FORBIDDEN,
          error.message,
          null,
        );
      }

      if (error.message.includes('not found')) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          error.message,
          null,
        );
      }

      if (error.message.includes('not a week off day')) {
        return ResponseService.send(
          res,
          StatusCodes.CONFLICT,
          error.message,
          null,
        );
      }

      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Error removing week off day',
        null,
      );
    }
  }
}

export default ShiftController;
