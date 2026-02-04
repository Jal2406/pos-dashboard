import { StatusCodes } from 'http-status-codes';
import { ResponseService } from '../utils/index.js';
import { ShiftService } from '../services/index.js';

// Note: instantiate per request using req.businessId so each call is tenant-scoped

class ShiftController {
  /**
   * Create a new shift assignment with access control
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async createShiftAssignment(req, res) {
    try {
      const shiftData = req.body;
      const currentUser = req.user;
      const shiftService = new ShiftService(req.businessId);

      const newShift = await shiftService.createShiftAssignment(
        shiftData,
        currentUser,
      );

      // Enhanced response with additional context
      const responseData = {
        shift: newShift,
        summary: {
          employeeName: newShift.employee?.fullName || 'Unknown Employee',
          assignmentDate: newShift.formattedDate,
          shiftType: newShift.shiftType?.title || 'Unknown Shift Type',
          status: newShift.statusDisplay,
          storeName: newShift.store?.name || 'Unknown Store',
        },
        actions: {
          viewShift: `/shifts/${newShift.shiftId}`,
          updateShift: `/shifts/${newShift.shiftId}`,
          cancelShift: `/shifts/${newShift.shiftId}/cancel`,
          clockIn: `/attendance/shift/${newShift.shiftId}/clock-in`,
        },
      };

      ResponseService.send(
        res,
        StatusCodes.CREATED,
        `Shift assignment created successfully for ${newShift.employee?.fullName}`,
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
        'Error creating shift assignment',
        error.message,
      );
    }
  }

  /**
   * Get all shift assignments with pagination and filtering (with business context)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getAllShiftAssignments(req, res) {
    try {
      const queryParams = {
        page: req.query.page,
        limit: req.query.limit,
        search: req.query.search,
        sortBy: req.query.sortBy,
        sortOrder: req.query.sortOrder,
        status: req.query.status,
        storeId: req.query.storeId,
        employeeId: req.query.employeeId,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
      };

      const currentUser = req.user;
      const shiftService = new ShiftService(req.businessId);
      const shifts = await shiftService.listShiftAssignmentsWithBusinessContext(
        queryParams,
        currentUser,
      );

      if (!shifts || shifts.data.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'No shift assignments found',
          {
            data: [],
            pagination: { currentPage: 1, totalPages: 0, totalCount: 0 },
          },
        );
      }

      ResponseService.send(
        res,
        StatusCodes.OK,
        'Shift assignments retrieved successfully',
        shifts,
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
        'Error retrieving shift assignments',
        error.message,
      );
    }
  }

  /**
   * Get shift assignment by ID with business context
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getShiftAssignmentById(req, res) {
    try {
      const shiftId = req.params.id;
      const currentUser = req.user;
      const shiftService = new ShiftService(req.businessId);
      const shift =
        await shiftService.getShiftAssignmentByIdWithBusinessContext(
          shiftId,
          currentUser,
        );

      if (!shift) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Shift assignment not found',
          null,
        );
      }

      // Enhanced response with additional context
      const responseData = {
        shift: shift,
        summary: {
          employeeName: shift.employee?.fullName || 'Unknown Employee',
          assignmentDate: shift.formattedDate,
          shiftType: shift.shiftType?.title || 'Unknown Shift Type',
          status: shift.statusDisplay,
          storeName: shift.store?.name || 'Unknown Store',
          totalHours: shift.totalHours,
          overtimeHours: shift.overtimeHours,
        },
        actions: {
          updateShift: `/shifts/${shift.shiftId}`,
          cancelShift: `/shifts/${shift.shiftId}/cancel`,
          clockIn: `/attendance/shift/${shift.shiftId}/clock-in`,
          clockOut: `/attendance/shift/${shift.shiftId}/clock-out`,
          addBreak: `/attendance/shift/${shift.shiftId}/break`,
        },
        metadata: {
          createdDate: shift.createdAt,
          lastUpdated: shift.updatedAt,
          assignedBy:
            shift.assignedBy?.firstName + ' ' + shift.assignedBy?.lastName,
        },
      };

      ResponseService.send(
        res,
        StatusCodes.OK,
        `Shift assignment retrieved successfully`,
        responseData,
      );
    } catch (error) {
      if (error.message.includes('not found')) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Shift assignment not found',
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
        'Error retrieving shift assignment',
        error.message,
      );
    }
  }

  /**
   * Update shift assignment by ID with access control
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async updateShiftAssignment(req, res) {
    try {
      const shiftId = req.params.id;
      const shiftData = req.body;
      const currentUser = req.user;
      const shiftService = new ShiftService(req.businessId);
      const updatedShift = await shiftService.updateShiftAssignmentById(
        shiftId,
        shiftData,
        currentUser,
      );

      if (!updatedShift) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Shift assignment not found',
          null,
        );
      }

      ResponseService.send(
        res,
        StatusCodes.OK,
        'Shift assignment updated successfully',
        updatedShift,
      );
    } catch (error) {
      if (error.message.includes('not found')) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Shift assignment not found',
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
        'Error updating shift assignment',
        error.message,
      );
    }
  }

  /**
   * Delete shift assignment by ID with access control
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async deleteShiftAssignment(req, res) {
    try {
      const shiftId = req.params.id;
      const currentUser = req.user;
      const shiftService = new ShiftService(req.businessId);
      const deletedShift = await shiftService.deleteShiftAssignmentById(
        shiftId,
        currentUser,
      );

      if (!deletedShift) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Shift assignment not found',
          null,
        );
      }

      ResponseService.send(
        res,
        StatusCodes.OK,
        'Shift assignment deleted successfully',
        deletedShift,
      );
    } catch (error) {
      if (error.message.includes('not found')) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Shift assignment not found',
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
        'Error deleting shift assignment',
        error.message,
      );
    }
  }

  /**
   * Cancel a shift assignment
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async cancelShift(req, res) {
    try {
      const shiftId = req.params.id;
      const { reason = '' } = req.body;
      const currentUser = req.user;
      const shiftService = new ShiftService(req.businessId);
      const updatedShift = await shiftService.cancelShift(
        shiftId,
        reason,
        currentUser,
      );

      ResponseService.send(
        res,
        StatusCodes.OK,
        'Shift cancelled successfully',
        {
          shift: updatedShift,
          status: updatedShift.statusDisplay,
          notes: updatedShift.notes,
        },
      );
    } catch (error) {
      if (error.message.includes('not found')) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Shift assignment not found',
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
        'Error cancelling shift',
        error.message,
      );
    }
  }

  /**
   * Get shifts by employee and date range
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getShiftsByEmployee(req, res) {
    try {
      const { employeeId } = req.params;
      const { startDate, endDate } = req.query;
      const currentUser = req.user;
      const shiftService = new ShiftService(req.businessId);

      const shifts = await shiftService.getShiftsByEmployeeAndDateRange(
        employeeId,
        startDate,
        endDate,
        currentUser,
      );

      ResponseService.send(
        res,
        StatusCodes.OK,
        'Employee shifts retrieved successfully',
        {
          data: shifts,
          employeeId,
        },
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
        'Error retrieving employee shifts',
        error.message,
      );
    }
  }

  /**
   * Get shifts by store and date
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getShiftsByStoreAndDate(req, res) {
    try {
      const { storeId } = req.params;
      const { date } = req.query;
      const currentUser = req.user;
      const shiftService = new ShiftService(req.businessId);

      const shifts = await shiftService.getShiftsByStoreAndDate(
        storeId,
        date,
        currentUser,
      );

      ResponseService.send(
        res,
        StatusCodes.OK,
        'Store shifts retrieved successfully',
        {
          data: shifts,
          storeId,
          date,
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
        'Error retrieving store shifts',
        error.message,
      );
    }
  }

  /**
   * Get scheduled shifts (for attendance tracking)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getScheduledShifts(req, res) {
    try {
      const { storeId } = req.query;
      const currentUser = req.user;
      const shiftService = new ShiftService(req.businessId);

      const scheduledShifts = await shiftService.getScheduledShifts(
        storeId,
        currentUser,
      );

      ResponseService.send(
        res,
        StatusCodes.OK,
        'Scheduled shifts retrieved successfully',
        {
          data: scheduledShifts,
          storeId: storeId || 'all',
          count: scheduledShifts.length,
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
        'Error retrieving scheduled shifts',
        error.message,
      );
    }
  }

  // ===== CUSTOM WEEK OFF ENDPOINTS =====

  /**
   * Get shifts applicable on a specific day considering custom week off
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getShiftsForDay(req, res) {
    try {
      const { dayName } = req.params;
      const { storeId } = req.query;
      const currentUser = req.user;
      const shiftService = new ShiftService(req.businessId);

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
          'Invalid day name',
          `Day name must be one of: ${validDays.join(', ')}`,
        );
      }

      const shifts = await shiftService.getShiftsApplicableOnDay(
        dayName,
        req.businessId,
        storeId,
      );

      ResponseService.send(
        res,
        StatusCodes.OK,
        `Found ${shifts.length} shifts applicable on ${dayName}`,
        {
          dayName,
          shifts,
          count: shifts.length,
          storeId: storeId || 'business-wide',
        },
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
        'Error retrieving shifts for day',
        error.message,
      );
    }
  }

  /**
   * Get shifts with custom week off information
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getShiftsWithCustomWeekOffInfo(req, res) {
    try {
      const { storeId } = req.query;
      const currentUser = req.user;
      const shiftService = new ShiftService(req.businessId);

      const shifts = await shiftService.getShiftsWithCustomWeekOffInfo(
        req.businessId,
        storeId,
      );

      ResponseService.send(
        res,
        StatusCodes.OK,
        `Retrieved ${shifts.length} shifts with custom week off information`,
        {
          shifts,
          count: shifts.length,
          storeId: storeId || 'business-wide',
        },
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
        'Error retrieving shifts with custom week off info',
        error.message,
      );
    }
  }

  /**
   * Add custom week off day to shift
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async addCustomWeekOffDay(req, res) {
    try {
      const { id } = req.params;
      const { dayName } = req.body;
      const currentUser = req.user;
      const shiftService = new ShiftService(req.businessId);

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
          'Invalid day name',
          `Day name must be one of: ${validDays.join(', ')}`,
        );
      }

      const updatedShift = await shiftService.addCustomWeekOffDay(
        id,
        dayName,
        currentUser,
      );

      ResponseService.send(
        res,
        StatusCodes.OK,
        `Custom week off day "${dayName}" added successfully to shift`,
        {
          shift: updatedShift,
          addedDay: dayName,
          customWeekOffDays: updatedShift.customWeekOff,
        },
      );
    } catch (error) {
      console.log(error);

      if (error.message.includes('not found')) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Shift not found',
          error.message,
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

      if (error.message.includes('already')) {
        return ResponseService.send(
          res,
          StatusCodes.CONFLICT,
          'Day already exists',
          error.message,
        );
      }

      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Error adding custom week off day',
        error.message,
      );
    }
  }

  /**
   * Remove custom week off day from shift
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async removeCustomWeekOffDay(req, res) {
    try {
      const { id } = req.params;
      const { dayName } = req.body;
      const currentUser = req.user;
      const shiftService = new ShiftService(req.businessId);

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
          'Invalid day name',
          `Day name must be one of: ${validDays.join(', ')}`,
        );
      }

      const updatedShift = await shiftService.removeCustomWeekOffDay(
        id,
        dayName,
        currentUser,
      );

      ResponseService.send(
        res,
        StatusCodes.OK,
        `Custom week off day "${dayName}" removed successfully from shift`,
        {
          shift: updatedShift,
          removedDay: dayName,
          customWeekOffDays: updatedShift.customWeekOff,
        },
      );
    } catch (error) {
      console.log(error);

      if (error.message.includes('not found')) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Shift not found',
          error.message,
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

      if (error.message.includes('not a custom week off day')) {
        return ResponseService.send(
          res,
          StatusCodes.CONFLICT,
          'Day not found in custom week off',
          error.message,
        );
      }

      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Error removing custom week off day',
        error.message,
      );
    }
  }

  /**
   * Clear custom week off from shift (revert to shift type week off)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async clearCustomWeekOff(req, res) {
    try {
      const { id } = req.params;
      const currentUser = req.user;
      const shiftService = new ShiftService(req.businessId);

      const updatedShift = await shiftService.clearCustomWeekOff(
        id,
        currentUser,
      );

      ResponseService.send(
        res,
        StatusCodes.OK,
        'Custom week off cleared successfully, reverted to shift type week off',
        {
          shift: updatedShift,
          customWeekOffDays: updatedShift.customWeekOff,
        },
      );
    } catch (error) {
      console.log(error);

      if (error.message.includes('not found')) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Shift not found',
          error.message,
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
        'Error clearing custom week off',
        error.message,
      );
    }
  }
}

export default ShiftController;
