import { StatusCodes } from 'http-status-codes';
import { ResponseService } from '../utils/index.js';
import { AttendanceService } from '../services/index.js';

// Note: instantiate per request using req.businessId so each call is tenant-scoped

class AttendanceController {
  /**
   * Create a new attendance record
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async createAttendanceRecord(req, res) {
    try {
      const attendanceData = req.body;
      const currentUser = req.user;
      const attendanceService = new AttendanceService(req.businessId);

      const newAttendance = await attendanceService.createAttendanceRecord(
        attendanceData,
        currentUser,
      );

      // Enhanced response with additional context
      const responseData = {
        attendance: newAttendance,
        summary: {
          employeeName: newAttendance.employee?.fullName || 'Unknown Employee',
          attendanceDate: newAttendance.formattedDate,
          status: newAttendance.statusDisplay,
          storeName: newAttendance.store?.name || 'Unknown Store',
        },
        actions: {
          viewAttendance: `/attendance/${newAttendance.attendanceId}`,
          updateAttendance: `/attendance/${newAttendance.attendanceId}`,
          clockIn: `/attendance/${newAttendance.attendanceId}/clock-in`,
          clockOut: `/attendance/${newAttendance.attendanceId}/clock-out`,
        },
      };

      ResponseService.send(
        res,
        StatusCodes.CREATED,
        `Attendance record created successfully for ${newAttendance.employee?.fullName}`,
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
        'Error creating attendance record',
        error.message,
      );
    }
  }

  /**
   * Clock in for a shift
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async clockIn(req, res) {
    try {
      const shiftId = req.params.shiftId;
      const { clockInTime } = req.body;
      const currentUser = req.user;
      const attendanceService = new AttendanceService(req.businessId);

      // Check if this is an admin route (allow admin override)
      const allowAdminOverride = req.route?.path?.includes('/admin/') || false;

      const updatedAttendance = await attendanceService.clockIn(
        shiftId,
        currentUser,
        clockInTime ? new Date(clockInTime) : new Date(),
        allowAdminOverride,
      );

      ResponseService.send(res, StatusCodes.OK, 'Successfully clocked in', {
        attendance: updatedAttendance,
        clockInTime: updatedAttendance.clockInTime,
        clockInStatus: updatedAttendance.clockInStatusDisplay,
        status: updatedAttendance.statusDisplay,
      });
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
        'Error clocking in',
        error.message,
      );
    }
  }

  /**
   * Clock out from a shift
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async clockOut(req, res) {
    try {
      const shiftId = req.params.shiftId;
      const { clockOutTime } = req.body;
      const currentUser = req.user;
      const attendanceService = new AttendanceService(req.businessId);

      // Check if this is an admin route (allow admin override)
      const allowAdminOverride = req.route?.path?.includes('/admin/') || false;

      const updatedAttendance = await attendanceService.clockOut(
        shiftId,
        currentUser,
        clockOutTime ? new Date(clockOutTime) : new Date(),
        allowAdminOverride,
      );

      ResponseService.send(res, StatusCodes.OK, 'Successfully clocked out', {
        attendance: updatedAttendance,
        clockOutTime: updatedAttendance.clockOutTime,
        clockOutStatus: updatedAttendance.clockOutStatusDisplay,
        totalHours: updatedAttendance.totalHours,
        overtimeHours: updatedAttendance.overtimeHours,
        status: updatedAttendance.statusDisplay,
      });
    } catch (error) {
      if (error.message.includes('not found')) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Attendance record not found',
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
        'Error clocking out',
        error.message,
      );
    }
  }

  /**
   * Add a break to attendance
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async addBreak(req, res) {
    try {
      const shiftId = req.params.shiftId;
      const { breakType = 'lunch', duration = 30, notes = '' } = req.body;
      const currentUser = req.user;
      const attendanceService = new AttendanceService(req.businessId);

      const updatedAttendance = await attendanceService.addBreak(
        shiftId,
        breakType,
        duration,
        notes,
        currentUser,
      );

      ResponseService.send(res, StatusCodes.OK, 'Break added successfully', {
        attendance: updatedAttendance,
        break: updatedAttendance.breaks[updatedAttendance.breaks.length - 1],
        totalBreakTime: updatedAttendance.totalBreakTime,
      });
    } catch (error) {
      if (error.message.includes('not found')) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Attendance record not found',
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
        'Error adding break',
        error.message,
      );
    }
  }

  /**
   * Mark attendance as no-show
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async markAsNoShow(req, res) {
    try {
      const shiftId = req.params.shiftId;
      const currentUser = req.user;
      const attendanceService = new AttendanceService(req.businessId);

      // Check if this is an admin route (allow admin override)
      const allowAdminOverride = req.route?.path?.includes('/admin/') || false;

      const updatedAttendance = await attendanceService.markAsNoShow(
        shiftId,
        currentUser,
        allowAdminOverride,
      );

      ResponseService.send(
        res,
        StatusCodes.OK,
        'Attendance marked as no-show successfully',
        {
          attendance: updatedAttendance,
          status: updatedAttendance.statusDisplay,
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
        'Error marking as no-show',
        error.message,
      );
    }
  }

  /**
   * Mark attendance as leave
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async markAsLeave(req, res) {
    try {
      const shiftId = req.params.shiftId;
      const { notes = '' } = req.body;
      const currentUser = req.user;
      const attendanceService = new AttendanceService(req.businessId);

      // Check if this is an admin route (allow admin override)
      const allowAdminOverride = req.route?.path?.includes('/admin/') || false;

      const updatedAttendance = await attendanceService.markAsLeave(
        shiftId,
        notes,
        currentUser,
        allowAdminOverride,
      );

      ResponseService.send(
        res,
        StatusCodes.OK,
        'Attendance marked as leave successfully',
        {
          attendance: updatedAttendance,
          status: updatedAttendance.statusDisplay,
          notes: updatedAttendance.notes,
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
        'Error marking as leave',
        error.message,
      );
    }
  }

  /**
   * Correct attendance record
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async correctAttendance(req, res) {
    try {
      const attendanceId = req.params.id;
      const correctionData = req.body;
      const currentUser = req.user;
      const attendanceService = new AttendanceService(req.businessId);

      const updatedAttendance = await attendanceService.correctAttendance(
        attendanceId,
        correctionData,
        currentUser,
      );

      ResponseService.send(
        res,
        StatusCodes.OK,
        'Attendance corrected successfully',
        {
          attendance: updatedAttendance,
          isCorrected: updatedAttendance.isCorrected,
          correction: updatedAttendance.correction,
        },
      );
    } catch (error) {
      if (error.message.includes('not found')) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Attendance record not found',
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
        'Error correcting attendance',
        error.message,
      );
    }
  }

  /**
   * Get all attendance records with pagination and filtering
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getAllAttendanceRecords(req, res) {
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
      const attendanceService = new AttendanceService(req.businessId);
      const attendances =
        await attendanceService.listAttendanceRecords(queryParams, currentUser);

      if (!attendances || attendances.data.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'No attendance records found',
          {
            data: [],
            pagination: { currentPage: 1, totalPages: 0, totalCount: 0 },
          },
        );
      }

      ResponseService.send(
        res,
        StatusCodes.OK,
        'Attendance records retrieved successfully',
        attendances,
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
        'Error retrieving attendance records',
        error.message,
      );
    }
  }

  /**
   * Get attendance record by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getAttendanceById(req, res) {
    try {
      const attendanceId = req.params.id;
      const currentUser = req.user;
      const attendanceService = new AttendanceService(req.businessId);
      const attendance =
        await attendanceService.getAttendanceById(attendanceId);

      if (!attendance) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Attendance record not found',
          null,
        );
      }

      // Enhanced response with additional context
      const responseData = {
        attendance: attendance,
        summary: {
          employeeName: attendance.employee?.fullName || 'Unknown Employee',
          attendanceDate: attendance.formattedDate,
          status: attendance.statusDisplay,
          storeName: attendance.store?.name || 'Unknown Store',
          totalHours: attendance.totalHours,
          overtimeHours: attendance.overtimeHours,
        },
        actions: {
          updateAttendance: `/attendance/${attendance.attendanceId}`,
          correctAttendance: `/attendance/${attendance.attendanceId}/correct`,
          clockIn: `/attendance/${attendance.attendanceId}/clock-in`,
          clockOut: `/attendance/${attendance.attendanceId}/clock-out`,
          addBreak: `/attendance/${attendance.attendanceId}/break`,
        },
        metadata: {
          createdDate: attendance.createdAt,
          lastUpdated: attendance.updatedAt,
          recordedBy:
            attendance.recordedBy?.firstName +
            ' ' +
            attendance.recordedBy?.lastName,
          isCorrected: attendance.isCorrected,
        },
      };

      ResponseService.send(
        res,
        StatusCodes.OK,
        `Attendance record retrieved successfully`,
        responseData,
      );
    } catch (error) {
      if (error.message.includes('not found')) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Attendance record not found',
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
        'Error retrieving attendance record',
        error.message,
      );
    }
  }

  /**
   * Get attendance records by employee and date range
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getAttendanceByEmployee(req, res) {
    try {
      const { employeeId } = req.params;
      const { startDate, endDate } = req.query;
      const currentUser = req.user;
      const attendanceService = new AttendanceService(req.businessId);

      const attendances =
        await attendanceService.getAttendanceByEmployeeAndDateRange(
          employeeId,
          startDate,
          endDate,
          currentUser,
        );

      ResponseService.send(
        res,
        StatusCodes.OK,
        'Employee attendance records retrieved successfully',
        {
          data: attendances,
          employeeId,
          dateRange: { startDate, endDate },
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
        'Error retrieving employee attendance',
        error.message,
      );
    }
  }

  /**
   * Get attendance records by store and date
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getAttendanceByStoreAndDate(req, res) {
    try {
      const { storeId } = req.params;
      const { date } = req.query;
      const currentUser = req.user;
      const attendanceService = new AttendanceService(req.businessId);

      const attendances = await attendanceService.getAttendanceByStoreAndDate(
        storeId,
        date,
        currentUser,
      );

      ResponseService.send(
        res,
        StatusCodes.OK,
        'Store attendance records retrieved successfully',
        {
          data: attendances,
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
        'Error retrieving store attendance',
        error.message,
      );
    }
  }

  /**
   * Get no-show attendance records
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getNoShows(req, res) {
    try {
      const { date } = req.query;
      const currentUser = req.user;
      const attendanceService = new AttendanceService(req.businessId);

      const noShows = await attendanceService.getNoShows(date, currentUser);

      ResponseService.send(
        res,
        StatusCodes.OK,
        'No-show attendance records retrieved successfully',
        {
          data: noShows,
          date: date || new Date().toISOString().split('T')[0],
          count: noShows.length,
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
        'Error retrieving no-shows',
        error.message,
      );
    }
  }
}

export default AttendanceController;
