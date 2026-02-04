import mongoose from 'mongoose';
import { AttendanceSchema, Business } from '../models/index.js';
import { BaseService } from '../utils/index.js';
import { ShiftService, EmployeeService, StockServices, UserServices, StoreService } from './index.js';

class AttendanceService extends BaseService {

  constructor(businessId) {
    if (!businessId) {
      throw new Error('ProductServices initialized without businessId');
    }
    super({
      modelName: 'Attendance',
      schema: AttendanceSchema,
      collection: 'attendances',
      businessId,
    });
  }

  /**
   * Manually populate attendance relations for cross-database connections
   * @param {Object|Array} attendances - Single attendance or array of attendances
   * @returns {Promise<Object|Array>} Attendance(s) with populated relations
   */
  async _populateAttendanceRelations(attendances) {
    const isArray = Array.isArray(attendances);
    const attendanceArray = isArray ? attendances : [attendances];

    if (attendanceArray.length === 0) return isArray ? [] : null;

    // Collect all unique IDs for batch fetching (using Sets to avoid duplicates)
    const employeeIds = new Set();
    const shiftIds = new Set();
    const userIds = new Set();
    const storeIds = new Set();

    attendanceArray.forEach((attendance) => {
      if (attendance?.employeeId) {
        const empId = attendance.employeeId._id || attendance.employeeId;
        if (empId) employeeIds.add(empId.toString());
      }
      if (attendance?.shiftId) {
        const sId = attendance.shiftId._id || attendance.shiftId;
        if (sId) shiftIds.add(sId.toString());
      }
      if (attendance?.recordedBy) {
        const uId = attendance.recordedBy._id || attendance.recordedBy;
        if (uId) userIds.add(uId.toString());
      }
      if (attendance?.storeId) {
        const stId = attendance.storeId._id || attendance.storeId;
        if (stId) storeIds.add(stId.toString());
      }
    });

    // Batch fetch all related documents (convert Sets to arrays for MongoDB queries)
    const [employees, shifts, users, stores] = await Promise.all([
      employeeIds.size > 0
        ? (async () => {
          const employeeService = new EmployeeService(this.businessId);
          const EmployeeModel = await employeeService.getModelRef();
          const emps = await EmployeeModel.find({
            _id: { $in: Array.from(employeeIds) },
          })
            .select('user designation')
            .lean();
          // Also fetch user details for employees
          const empUserIds = emps
            .map((e) => e.user)
            .filter(Boolean)
            .map((id) => (id._id || id).toString());
          const empUsers =
            empUserIds.length > 0
              ? await (async () => {
                const userService = new UserServices();
                const UserModel = await userService.getModelRef();
                return UserModel.find({ _id: { $in: empUserIds } })
                  .select('name firstName lastName')
                  .lean();
              })()
              : [];
          const userMap = new Map(empUsers.map((u) => [u._id.toString(), u]));
          return emps.map((emp) => ({
            ...emp,
            user: emp.user
              ? userMap.get((emp.user._id || emp.user).toString())
              : null,
          }));
        })()
        : [],
      shiftIds.size > 0
        ? (async () => {
          const shiftService = new ShiftService(this.businessId);
          const ShiftModel = await shiftService.getModelRef();
          return await ShiftModel.find({
            _id: { $in: Array.from(shiftIds) },
          })
            .select('shiftTypeId plannedStartTime plannedEndTime')
            .lean();
        })()
        : [],
      userIds.size > 0
        ? (async () => {
          const userService = new UserServices();
          const UserModel = await userService.getModelRef();
          return UserModel.find({ _id: { $in: Array.from(userIds) } })
            .select('name firstName lastName')
            .lean();
        })()
        : [],
      storeIds.size > 0
        ? (async () => {
          const storeService = new StoreService(this.businessId);
          const StoreModel = await storeService.getModelRef();
          return await StoreModel.find({
            _id: { $in: Array.from(storeIds) },
          })
            .select('name description')
            .lean();
        })()
        : [],
    ]);

    // Create maps for O(1) lookup
    const employeeMap = new Map(
      employees.map((emp) => [emp._id.toString(), emp]),
    );
    const shiftMap = new Map(shifts.map((s) => [s._id.toString(), s]));
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));
    const storeMap = new Map(stores.map((s) => [s._id.toString(), s]));

    // Populate each attendance
    const populatedAttendances = attendanceArray.map((attendance) => {
      const populated = { ...attendance };

      if (attendance?.employeeId) {
        const empId = (
          attendance.employeeId._id || attendance.employeeId
        ).toString();
        populated.employeeId = employeeMap.get(empId) || attendance.employeeId;
      }

      if (attendance?.shiftId) {
        const sId = (attendance.shiftId._id || attendance.shiftId).toString();
        populated.shiftId = shiftMap.get(sId) || attendance.shiftId;
      }

      if (attendance?.recordedBy) {
        const uId = (
          attendance.recordedBy._id || attendance.recordedBy
        ).toString();
        populated.recordedBy = userMap.get(uId) || attendance.recordedBy;
      }

      if (attendance?.storeId) {
        const stId = (attendance.storeId._id || attendance.storeId).toString();
        populated.storeId = storeMap.get(stId) || attendance.storeId;
      }

      return populated;
    });

    return isArray ? populatedAttendances : populatedAttendances[0];
  }

  /**
   * Create attendance record for a shift
   * @param {Object} data - Attendance data
   * @param {Object} currentUser - Current user making the request
   * @returns {Object} Created attendance record
   */
  async createAttendanceRecord(data, currentUser) {
    try {
      // Validate access and get business ID
      const businessId = await this.validateAttendanceCreationAccess(
        data,
        currentUser,
      );

      // Convert attendanceDate from string to Date if needed
      if (data.attendanceDate && typeof data.attendanceDate === 'string') {
        data.attendanceDate = new Date(data.attendanceDate);
      }

      // Validate attendance data
      this.validateAttendanceData(data);

      // Check if shift exists and is scheduled
      const shift = await this.validateShiftForAttendance(
        data.shiftId,
        businessId,
      );

      // Check if attendance record already exists
      await this.checkForExistingAttendance(
        data.employeeId,
        data.shiftId,
        data.attendanceDate,
      );

      // Add access control fields
      // Use shift.storeId if available, otherwise fall back to payload storeId
      const storeId = shift.storeId || data.storeId;
      if (!storeId) {
        throw new Error(
          'Store ID is required. It must be provided in the shift or in the request payload.',
        );
      }

      const attendanceData = {
        ...data,
        businessId,
        storeId,
        recordedBy: currentUser._id, // Always use currentUser, ignore payload recordedBy
      };

      const attendance = await super.create(attendanceData);

      // Populate the created attendance manually for cross-DB connections
      const AttendanceModel = await this.getModelRef();
      const attendanceDoc = await AttendanceModel.findById(attendance._id)
        .lean()
        .exec();

      const populatedAttendance =
        await this._populateAttendanceRelations(attendanceDoc);

      return await this.transformAttendanceForResponse(populatedAttendance);
    } catch (error) {
      console.log(error);
      throw new Error(`Error creating attendance record: ${error.message}`);
    }
  }

  /**
   * Clock in for a shift
   * @param {String} shiftId - Shift ID
   * @param {Object} currentUser - Current user making the request
   * @param {Date} clockInTime - Optional clock-in time (defaults to now)
   * @param {Boolean} allowAdminOverride - Allow admin to clock in for any employee
   * @returns {Object} Updated attendance record
   */
  async clockIn(
    shiftId,
    currentUser,
    clockInTime = new Date(),
    allowAdminOverride = false,
  ) {
    try {
      const userRole = currentUser.roleId?.name;

      // Get shift and validate access
      const shift = await this.getShiftForAttendance(
        shiftId,
        currentUser,
        allowAdminOverride,
      );

      // For managers, they can only clock in/out themselves, not create attendance for others
      if (userRole === 'manager' && !allowAdminOverride) {
        const employeeId = await this.getEmployeeIdForUser(currentUser);
        if (shift.employeeId._id.toString() !== employeeId.toString()) {
          throw new Error(
            'Unauthorized: Managers can only clock in/out for themselves',
          );
        }
      }

      // Get or create attendance record
      let attendance = await this.getOrCreateAttendanceRecord(
        shift,
        currentUser,
      );

      // Clock in
      await attendance.clockIn(clockInTime);

      // Determine if clock-in is late
      const isLate = this.isClockInLate(clockInTime, shift);
      if (isLate) {
        attendance.clockInStatus = 'late';
      } else {
        attendance.clockInStatus = 'on_time';
      }

      await attendance.save();

      return await this.getAttendanceById(attendance._id);
    } catch (error) {
      throw new Error(`Error clocking in: ${error.message}`);
    }
  }

  /**
   * Clock out from a shift
   * @param {String} shiftId - Shift ID
   * @param {Object} currentUser - Current user making the request
   * @param {Date} clockOutTime - Optional clock-out time (defaults to now)
   * @param {Boolean} allowAdminOverride - Allow admin to clock out for any employee
   * @returns {Object} Updated attendance record
   */
  async clockOut(
    shiftId,
    currentUser,
    clockOutTime = new Date(),
    allowAdminOverride = false,
  ) {
    try {
      const userRole = currentUser.roleId?.name;

      // Get shift and validate access
      const shift = await this.getShiftForAttendance(
        shiftId,
        currentUser,
        allowAdminOverride,
      );

      // For managers, they can only clock in/out themselves, not create attendance for others
      if (userRole === 'manager' && !allowAdminOverride) {
        const employeeId = await this.getEmployeeIdForUser(currentUser);
        if (shift.employeeId._id.toString() !== employeeId.toString()) {
          throw new Error(
            'Unauthorized: Managers can only clock in/out for themselves',
          );
        }
      }

      // Get attendance record
      const attendance = await this.getAttendanceByShift(shiftId, currentUser);

      if (!attendance) {
        throw new Error('No attendance record found for this shift');
      }

      // Clock out
      await attendance.clockOut(clockOutTime);

      // Determine if clock-out is early
      const isEarly = this.isClockOutEarly(clockOutTime, shift);
      if (isEarly) {
        attendance.clockOutStatus = 'early_out';
      } else {
        attendance.clockOutStatus = 'completed';
      }

      await attendance.save();

      return await this.getAttendanceById(attendance._id);
    } catch (error) {
      throw new Error(`Error clocking out: ${error.message}`);
    }
  }

  /**
   * Add a break to attendance
   * @param {String} shiftId - Shift ID
   * @param {String} breakType - Type of break
   * @param {Number} duration - Break duration in minutes
   * @param {String} notes - Break notes
   * @param {Object} currentUser - Current user making the request
   * @returns {Object} Updated attendance record
   */
  async addBreak(shiftId, breakType, duration, notes, currentUser) {
    try {
      // Get attendance record
      const attendance = await this.getAttendanceByShift(shiftId, currentUser);

      if (!attendance) {
        throw new Error('No attendance record found for this shift');
      }

      // Add break
      await attendance.addBreak(breakType, duration, notes);

      return await this.getAttendanceById(attendance._id);
    } catch (error) {
      throw new Error(`Error adding break: ${error.message}`);
    }
  }

  /**
   * Mark attendance as no-show
   * @param {String} shiftId - Shift ID
   * @param {Object} currentUser - Current user making the request
   * @param {Boolean} allowAdminOverride - Allow admin to mark no-show for any employee
   * @returns {Object} Updated attendance record
   */
  async markAsNoShow(shiftId, currentUser, allowAdminOverride = false) {
    try {
      // Get shift and validate access
      const shift = await this.getShiftForAttendance(
        shiftId,
        currentUser,
        allowAdminOverride,
      );

      // Get or create attendance record
      let attendance = await this.getOrCreateAttendanceRecord(
        shift,
        currentUser,
      );

      // Mark as no-show
      await attendance.markAsNoShow(currentUser._id);

      return await this.getAttendanceById(attendance._id);
    } catch (error) {
      throw new Error(`Error marking as no-show: ${error.message}`);
    }
  }

  /**
   * Mark attendance as leave
   * @param {String} shiftId - Shift ID
   * @param {String} notes - Leave notes
   * @param {Object} currentUser - Current user making the request
   * @param {Boolean} allowAdminOverride - Allow admin to mark leave for any employee
   * @returns {Object} Updated attendance record
   */
  async markAsLeave(shiftId, notes, currentUser, allowAdminOverride = false) {
    try {
      // Get shift and validate access
      const shift = await this.getShiftForAttendance(
        shiftId,
        currentUser,
        allowAdminOverride,
      );

      // Get or create attendance record
      let attendance = await this.getOrCreateAttendanceRecord(
        shift,
        currentUser,
      );

      // Mark as leave
      await attendance.markAsLeave(currentUser._id, notes);

      return await this.getAttendanceById(attendance._id);
    } catch (error) {
      throw new Error(`Error marking as leave: ${error.message}`);
    }
  }

  /**
   * Correct attendance record
   * @param {String} attendanceId - Attendance ID
   * @param {Object} correctionData - Correction data
   * @param {Object} currentUser - Current user making the request
   * @returns {Object} Updated attendance record
   */
  async correctAttendance(attendanceId, correctionData, currentUser) {
    try {
      // Get attendance record and validate access
      const attendance = await this.getAttendanceByIdWithAccess(
        attendanceId,
        currentUser,
      );

      // Apply correction
      await attendance.correctAttendance(correctionData, currentUser._id);

      return await this.getAttendanceById(attendance._id);
    } catch (error) {
      throw new Error(`Error correcting attendance: ${error.message}`);
    }
  }

  /**
   * Get all attendance records with filtering and pagination
   * @param {Object} queryParams - Query parameters for filtering and pagination
   * @param {Object} currentUser - Current user making the request (optional, for role-based filtering)
   * @returns {Object} Paginated attendance records data
   */
  async listAttendanceRecords(queryParams = {}, currentUser = null) {
    const {
      page = 1,
      limit = 10,
      search,
      sortBy = 'attendanceDate',
      sortOrder = 'desc',
      status,
      storeId,
      employeeId,
      startDate,
      endDate,
      businessId,
    } = queryParams;

    // Build filter object
    const filters = this._buildAttendanceFilters({
      businessId,
      status,
      storeId,
      employeeId,
      startDate,
      endDate,
    });

    // Apply role-based data scoping if currentUser is provided
    if (currentUser) {
      await this._applyRoleBasedAttendanceFilter(filters, currentUser);
    }

    // Build sort object
    const sort = this._buildSort(sortBy, sortOrder);

    try {
      const AttendanceModel = await this.getModelRef();

      // Use parallel execution for count and data fetching
      const [totalCount, attendances] = await Promise.all([
        AttendanceModel.countDocuments(filters),
        this._fetchAttendancesWithQuery(filters, sort, page, limit, search),
      ]);

      // Calculate pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const totalPages = Math.ceil(totalCount / parseInt(limit));

      // Transform data for response
      const transformedAttendances = await Promise.all(
        attendances.map((attendance) =>
          this.transformAttendanceForResponse(attendance),
        ),
      );

      return {
        data: transformedAttendances,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalCount,
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1,
          limit: parseInt(limit),
        },
      };
    } catch (error) {
      throw new Error(`Error retrieving attendance records: ${error.message}`);
    }
  }

  /**
   * Get attendance record by ID
   * @param {String} id - Attendance ID
   * @returns {Object} Attendance record data
   */
  async getAttendanceById(id) {
    try {
      const AttendanceModel = await this.getModelRef();
      const attendance = await AttendanceModel.findById(id).lean().exec();

      if (!attendance) {
        throw new Error(`Attendance record with id ${id} not found`);
      }

      // Manually populate relations for cross-DB connections
      const populatedAttendance =
        await this._populateAttendanceRelations(attendance);

      return await this.transformAttendanceForResponse(populatedAttendance);
    } catch (error) {
      throw new Error(`Error retrieving attendance record: ${error.message}`);
    }
  }

  /**
   * Get attendance records by employee and date range
   * @param {String} employeeId - Employee ID
   * @param {String} startDate - Start date
   * @param {String} endDate - End date
   * @param {Object} currentUser - Current user making the request
   * @returns {Array} Employee attendance records
   */
  async getAttendanceByEmployeeAndDateRange(
    employeeId,
    startDate,
    endDate,
    currentUser,
  ) {
    try {
      // Validate access
      await this.validateEmployeeAttendanceAccess(employeeId, currentUser);

      const AttendanceModel = await this.getModelRef();
      const attendancesQuery = AttendanceModel.findByEmployeeAndDateRange(
        employeeId,
        new Date(startDate),
        new Date(endDate),
      );
      const attendances = await attendancesQuery.lean().exec();

      // Manually populate relations for cross-DB connections
      const populatedAttendances =
        await this._populateAttendanceRelations(attendances);

      return await Promise.all(
        populatedAttendances.map((attendance) =>
          this.transformAttendanceForResponse(attendance),
        ),
      );
    } catch (error) {
      throw new Error(`Error retrieving employee attendance: ${error.message}`);
    }
  }

  /**
   * Get attendance records by store and date
   * @param {String} storeId - Store ID
   * @param {String} date - Date
   * @param {Object} currentUser - Current user making the request
   * @returns {Array} Store attendance records
   */
  async getAttendanceByStoreAndDate(storeId, date, currentUser) {
    try {
      // Validate access
      await this.validateStoreAttendanceAccess(storeId, currentUser);

      const AttendanceModel = await this.getModelRef();
      const attendances = await AttendanceModel.findByStoreAndDate(
        storeId,
        new Date(date),
      );

      return await Promise.all(
        attendances.map((attendance) =>
          this.transformAttendanceForResponse(attendance),
        ),
      );
    } catch (error) {
      throw new Error(`Error retrieving store attendance: ${error.message}`);
    }
  }

  /**
   * Get no-show attendance records
   * @param {String} date - Date
   * @param {Object} currentUser - Current user making the request
   * @returns {Array} No-show attendance records
   */
  async getNoShows(date, currentUser) {
    try {
      const businessId = await this.getBusinessIdForUser(currentUser);

      const AttendanceModel = await this.getModelRef();
      const noShows = await AttendanceModel.findNoShows(
        businessId,
        new Date(date),
      );

      return await Promise.all(
        noShows.map((attendance) =>
          this.transformAttendanceForResponse(attendance),
        ),
      );
    } catch (error) {
      throw new Error(`Error retrieving no-shows: ${error.message}`);
    }
  }

  // ===== HELPER METHODS =====

  /**
   * Get or create attendance record for a shift
   * @param {Object} shift - Shift object
   * @param {Object} currentUser - Current user
   * @returns {Object} Attendance record
   */
  async getOrCreateAttendanceRecord(shift, currentUser) {
    const AttendanceModel = await this.getModelRef();

    // Try to find existing attendance record
    let attendance = await AttendanceModel.findOne({
      employeeId: shift.employeeId,
      shiftId: shift._id,
      attendanceDate: shift.assignmentDate,
    });

    // Create new attendance record if it doesn't exist
    if (!attendance) {
      attendance = new AttendanceModel({
        employeeId: shift.employeeId,
        shiftId: shift._id,
        attendanceDate: shift.assignmentDate,
        businessId: shift.businessId,
        storeId: shift.storeId,
        recordedBy: currentUser._id,
        status: 'absent', // Default status
      });
    }

    return attendance;
  }

  /**
   * Get attendance record by shift
   * @param {String} shiftId - Shift ID
   * @param {Object} currentUser - Current user
   * @returns {Object} Attendance record
   */
  async getAttendanceByShift(shiftId, currentUser) {
    const AttendanceModel = await this.getModelRef();

    // Get employee ID for current user
    const employeeId = await this.getEmployeeIdForUser(currentUser);

    return await AttendanceModel.findOne({
      shiftId,
      employeeId,
    });
  }

  /**
   * Get shift for attendance operations
   * @param {String} shiftId - Shift ID
   * @param {Object} currentUser - Current user
   * @param {Boolean} allowAdminOverride - Allow admin to access any shift
   * @returns {Object} Shift object
   */
  async getShiftForAttendance(
    shiftId,
    currentUser,
    allowAdminOverride = false,
  ) {
    const shiftService = new ShiftService(this.businessId);
    const ShiftModel = await shiftService.getModelRef();
    const shift = await ShiftModel.findById(shiftId).lean();

    if (!shift) {
      throw new Error('Shift not found');
    }

    const userRole = currentUser.roleId?.name;

    // Admin can access any shift if override is allowed
    if (allowAdminOverride && userRole === 'admin') {
      return shift;
    }

    // Manager can access shifts for employees in their managed stores
    if (userRole === 'manager') {
      const businessId = await this.getBusinessIdForUser(currentUser);
      if (shift.businessId.toString() !== businessId.toString()) {
        throw new Error('Unauthorized: Shift does not belong to your business');
      }

      // Check if the shift employee is under manager's store
      const employeeService = new EmployeeService(this.businessId);
      const EmployeeModel = await employeeService.getModelRef();
      const employee = await EmployeeModel.findById(
        shift.employeeId._id,
      ).lean();

      if (!employee) {
        throw new Error('Employee not found');
      }

      const storeService = new StoreService(this.businessId);
      const StoreModel = await storeService.getModelRef();
      const store = await StoreModel.findById(employee.store).lean();

      if (!store || store.manager.toString() !== currentUser._id.toString()) {
        throw new Error(
          'Unauthorized: You can only access shifts for employees in your managed stores',
        );
      }

      return shift;
    }

    // Regular employees can only access their own shifts
    const employeeId = await this.getEmployeeIdForUser(currentUser);
    if (shift.employeeId._id.toString() !== employeeId.toString()) {
      throw new Error('Unauthorized: You can only access your own shifts');
    }

    return shift;
  }

  /**
   * Check if clock-in is late
   * @param {Date} clockInTime - Actual clock-in time
   * @param {Object} shift - Shift object
   * @returns {Boolean} Is late
   */
  isClockInLate(clockInTime, shift) {
    const plannedStartTime =
      shift.plannedStartTime || shift.shiftTypeId?.startTime;
    if (!plannedStartTime) return false;

    const [plannedHour, plannedMin] = plannedStartTime.split(':').map(Number);
    const plannedDateTime = new Date(shift.assignmentDate);
    plannedDateTime.setHours(plannedHour, plannedMin, 0, 0);

    // Allow 15 minutes grace period
    const gracePeriod = 15 * 60 * 1000; // 15 minutes in milliseconds
    return clockInTime > new Date(plannedDateTime.getTime() + gracePeriod);
  }

  /**
   * Check if clock-out is early
   * @param {Date} clockOutTime - Actual clock-out time
   * @param {Object} shift - Shift object
   * @returns {Boolean} Is early
   */
  isClockOutEarly(clockOutTime, shift) {
    const plannedEndTime = shift.plannedEndTime || shift.shiftTypeId?.endTime;
    if (!plannedEndTime) return false;

    const [plannedHour, plannedMin] = plannedEndTime.split(':').map(Number);
    const plannedDateTime = new Date(shift.assignmentDate);
    plannedDateTime.setHours(plannedHour, plannedMin, 0, 0);

    // Allow 15 minutes grace period
    const gracePeriod = 15 * 60 * 1000; // 15 minutes in milliseconds
    return clockOutTime < new Date(plannedDateTime.getTime() - gracePeriod);
  }

  /**
   * Get employee ID for user
   * @param {Object} currentUser - Current user
   * @returns {String} Employee ID
   */
  async getEmployeeIdForUser(currentUser) {
    const employeeService = new EmployeeService(this.businessId);
    const EmployeeModel = await employeeService.getModelRef();
    const employee = await EmployeeModel.findOne({
      user: currentUser._id,
    }).lean();

    if (!employee) {
      throw new Error('Employee record not found for user');
    }

    return employee._id;
  }

  // ===== VALIDATION METHODS =====

  /**
   * Validate attendance data
   * @param {Object} data - Attendance data
   */
  validateAttendanceData(data) {
    if (!data.employeeId) {
      throw new Error('Employee ID is required');
    }

    if (!data.shiftId) {
      throw new Error('Shift ID is required');
    }

    if (!data.attendanceDate) {
      throw new Error('Attendance date is required');
    }
  }

  /**
   * Validate shift for attendance
   * @param {String} shiftId - Shift ID
   * @param {String} businessId - Business ID
   * @returns {Object} Shift object
   */
  async validateShiftForAttendance(shiftId, businessId) {
    if (!shiftId) {
      throw new Error('Shift ID is required');
    }

    if (!businessId) {
      throw new Error('Business ID is required');
    }

    // Validate ObjectId format
    if (!shiftId.match(/^[0-9a-fA-F]{24}$/)) {
      throw new Error('Invalid shift ID format');
    }

    // Convert shiftId to ObjectId if it's a string
    const shiftObjectId =
      typeof shiftId === 'string'
        ? new mongoose.Types.ObjectId(shiftId)
        : shiftId;

    // Convert businessId to ObjectId if it's a string
    const businessObjectId =
      typeof businessId === 'string'
        ? new mongoose.Types.ObjectId(businessId)
        : businessId;

    // Use the validated businessId to get the correct model context
    // This ensures we're looking in the right tenant database
    const shiftService = new ShiftService(businessObjectId);
    const ShiftModel = await shiftService.getModelRef();
    const shift = await ShiftModel.findById(shiftObjectId).lean();
    if (!shift) {
      throw new Error(`Shift not found with ID: ${shiftId}`);
    }

    if (
      shift.businessId &&
      shift.businessId.toString() !== businessObjectId.toString()
    ) {
      throw new Error('Shift does not belong to your business');
    }

    if (shift.status !== 'scheduled') {
      throw new Error(
        `Can only create attendance for scheduled shifts. Current shift status: ${shift.status}`,
      );
    }

    return shift;
  }

  /**
   * Check for existing attendance record
   * @param {String} employeeId - Employee ID
   * @param {String} shiftId - Shift ID
   * @param {Date} attendanceDate - Attendance date
   */
  async checkForExistingAttendance(employeeId, shiftId, attendanceDate) {
    // Normalize date to start of day for comparison
    const normalizedDate = new Date(attendanceDate);
    normalizedDate.setHours(0, 0, 0, 0);

    const endOfDay = new Date(normalizedDate);
    endOfDay.setHours(23, 59, 59, 999);

    const AttendanceModel = await this.getModelRef();
    const existingAttendance = await AttendanceModel.findOne({
      employeeId,
      shiftId,
      attendanceDate: {
        $gte: normalizedDate,
        $lte: endOfDay,
      },
    });

    if (existingAttendance) {
      throw new Error(
        'Attendance record already exists for this employee and shift on this date',
      );
    }
  }

  /**
   * Build filters for attendance queries
   * @param {Object} params - Filter parameters
   * @returns {Object} Filter object
   */
  _buildAttendanceFilters({
    businessId,
    status,
    storeId,
    employeeId,
    startDate,
    endDate,
  }) {
    const filters = {};

    if (businessId) {
      filters.businessId = businessId;
    }

    if (status) {
      filters.status = status;
    }

    if (storeId) {
      filters.storeId = storeId;
    }

    if (employeeId) {
      filters.employeeId = employeeId;
    }

    if (startDate || endDate) {
      filters.attendanceDate = {};
      if (startDate) {
        filters.attendanceDate.$gte = new Date(startDate);
      }
      if (endDate) {
        filters.attendanceDate.$lte = new Date(endDate);
      }
    }

    return filters;
  }

  /**
   * Apply role-based filter to attendance query
   * @param {Object} filters - Existing filters object (modified in place)
   * @param {Object} currentUser - Current user making the request
   */
  async _applyRoleBasedAttendanceFilter(filters, currentUser) {
    const role = currentUser.roleId?.name;

    // Admin and Superadmin have full access - no additional filters
    if (role === 'admin' || role === 'superadmin') {
      return;
    }

    // Manager: Can see attendance from stores they manage
    if (role === 'manager') {
      const managedStoreIds = await this._getManagedStoreIds(currentUser);
      if (managedStoreIds.length > 0) {
        // Only override storeId if not already specified by query params
        if (!filters.storeId) {
          filters.storeId = { $in: managedStoreIds };
        } else {
          // If storeId is specified, validate it's in manager's stores
          const requestedStoreId = filters.storeId.toString();
          if (!managedStoreIds.some(id => id.toString() === requestedStoreId)) {
            // Manager requested a store they don't manage - return empty results
            filters._id = null; // This will return no results
          }
        }
      } else {
        // Manager has no stores assigned - return empty results
        filters._id = null;
      }
      return;
    }

    // Cashier and other roles: Can only see their own attendance records
    try {
      const employeeId = await this.getEmployeeIdForUser(currentUser);
      // Override any employeeId filter - cashiers can ONLY see their own data
      filters.employeeId = employeeId;
    } catch (error) {
      // If employee record not found, return empty results
      filters._id = null;
    }
  }

  /**
   * Get store IDs managed by a manager user
   * @param {Object} currentUser - Current user (manager)
   * @returns {Array} Array of store IDs
   */
  async _getManagedStoreIds(currentUser) {
    const employeeService = new EmployeeService(this.businessId);
    const EmployeeModel = await employeeService.getModelRef();

    const managerEmployees = await EmployeeModel.find({
      user: currentUser._id,
      designation: 'manager',
      isActive: true,
    })
      .select('store')
      .lean();

    return managerEmployees
      .filter(emp => emp.store)
      .map(emp => emp.store);
  }

  /**
   * Build sort object
   * @param {String} sortBy - Sort field
   * @param {String} sortOrder - Sort order
   * @returns {Object} Sort object
   */
  _buildSort(sortBy, sortOrder) {
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Add secondary sort for consistent pagination
    if (sortBy !== '_id') {
      sort._id = -1;
    }

    return sort;
  }

  /**
   * Fetch attendances with query and population
   * @param {Object} filters - Database filters
   * @param {Object} sort - Sort configuration
   * @param {Number} page - Page number
   * @param {Number} limit - Items per page
   * @param {String} search - Search term
   * @returns {Array} Attendances with populated data
   */
  async _fetchAttendancesWithQuery(filters, sort, page, limit, search) {
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const AttendanceModel = await this.getModelRef();

    // Note: populate() removed - using manual population via _populateAttendanceRelations for cross-DB support
    let query = AttendanceModel.find(filters)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    // Apply search filter if provided
    if (search) {
      const results = await this._searchAttendancesWithAggregation(
        filters,
        sort,
        skip,
        parseInt(limit),
        search,
      );
      // Manually populate relations for cross-DB connections
      return await this._populateAttendanceRelations(results);
    }

    const attendances = await query.lean().exec();
    // Manually populate relations for cross-DB connections
    return await this._populateAttendanceRelations(attendances);
  }

  /**
   * Search attendances using aggregation pipeline
   * @param {Object} filters - Database filters
   * @param {Object} sort - Sort configuration
   * @param {Number} skip - Skip count
   * @param {Number} limit - Limit count
   * @param {String} search - Search term
   * @returns {Array} Filtered attendances
   */
  async _searchAttendancesWithAggregation(filters, sort, skip, limit, search) {
    const searchRegex = new RegExp(search, 'i');

    const AttendanceModel = await this.getModelRef();

    const pipeline = [
      { $match: filters },
      {
        $lookup: {
          from: 'employees',
          localField: 'employeeId',
          foreignField: '_id',
          as: 'employeeId',
        },
      },
      {
        $lookup: {
          from: 'shifts',
          localField: 'shiftId',
          foreignField: '_id',
          as: 'shiftId',
        },
      },
      {
        $match: {
          $or: [
            { 'employeeId.user.firstName': searchRegex },
            { 'employeeId.user.lastName': searchRegex },
            { notes: searchRegex },
          ],
        },
      },
      { $sort: sort },
      { $skip: skip },
      { $limit: limit },
    ];

    return AttendanceModel.aggregate(pipeline).exec();
  }

  /**
   * Transform attendance data for response
   * @param {Object} attendance - Attendance document
   * @returns {Object} Transformed attendance data
   */
  async transformAttendanceForResponse(attendance) {
    if (!attendance) return attendance;

    const attendanceObj = attendance.toObject
      ? attendance.toObject()
      : attendance;

    return {
      // Strict response fields
      attendanceId: attendanceObj._id,
      employeeId: attendanceObj.employeeId,
      employee: attendanceObj.employeeId
        ? {
          _id: attendanceObj.employeeId._id,
          fullName:
            attendanceObj.employeeId.user?.firstName +
            ' ' +
            attendanceObj.employeeId.user?.lastName,
          designation: attendanceObj.employeeId.designation,
        }
        : null,
      shiftId: attendanceObj.shiftId,
      shift: attendanceObj.shiftId
        ? {
          _id: attendanceObj.shiftId._id,
          plannedStartTime: attendanceObj.shiftId.plannedStartTime,
          plannedEndTime: attendanceObj.shiftId.plannedEndTime,
        }
        : null,
      attendanceDate: attendanceObj.attendanceDate,
      clockInTime: attendanceObj.clockInTime,
      clockOutTime: attendanceObj.clockOutTime,
      clockInStatus: attendanceObj.clockInStatus,
      clockOutStatus: attendanceObj.clockOutStatus,
      status: attendanceObj.status,
      breaks: attendanceObj.breaks,
      totalBreakTime: attendanceObj.totalBreakTime,
      totalHours: attendanceObj.totalHours,
      overtimeHours: attendanceObj.overtimeHours,
      regularHours: attendanceObj.regularHours,
      notes: attendanceObj.notes,
      businessId: attendanceObj.businessId,
      storeId: attendanceObj.storeId,
      store: attendanceObj.storeId
        ? {
          _id: attendanceObj.storeId._id,
          name: attendanceObj.storeId.name,
          description: attendanceObj.storeId.description,
        }
        : null,
      recordedBy: attendanceObj.recordedBy,
      isCorrected: attendanceObj.isCorrected,
      correction: attendanceObj.correction,
      createdAt: attendanceObj.createdAt,
      updatedAt: attendanceObj.updatedAt,
      formattedDate: this._formatDate(attendanceObj.attendanceDate),
      statusDisplay: this._getStatusDisplay(attendanceObj.status),
      clockInStatusDisplay: this._getClockInStatusDisplay(
        attendanceObj.clockInStatus,
      ),
      clockOutStatusDisplay: this._getClockOutStatusDisplay(
        attendanceObj.clockOutStatus,
      ),

      // Original data for backward compatibility
      _id: attendanceObj._id,
      __v: attendanceObj.__v,
    };
  }

  /**
   * Format date for display
   * @param {Date|String} date - Date to format
   * @returns {String} Formatted date string
   */
  _formatDate(date) {
    return new Date(date).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  /**
   * Get status display text
   * @param {String} status - Status value
   * @returns {String} Display text
   */
  _getStatusDisplay(status) {
    const statusMap = {
      present: 'Present',
      absent: 'Absent',
      leave: 'On Leave',
      no_show: 'No Show',
    };
    return statusMap[status] || status;
  }

  /**
   * Get clock-in status display text
   * @param {String} status - Clock-in status value
   * @returns {String} Display text
   */
  _getClockInStatusDisplay(status) {
    const statusMap = {
      on_time: 'On Time',
      late: 'Late',
    };
    return statusMap[status] || status;
  }

  /**
   * Get clock-out status display text
   * @param {String} status - Clock-out status value
   * @returns {String} Display text
   */
  _getClockOutStatusDisplay(status) {
    const statusMap = {
      completed: 'Completed',
      early_out: 'Early Out',
    };
    return statusMap[status] || status;
  }

  // ===== ACCESS CONTROL METHODS =====

  /**
   * Validate attendance creation access
   * @param {Object} data - Attendance data
   * @param {Object} currentUser - Current user
   * @returns {String} Business ID
   */
  async validateAttendanceCreationAccess(data, currentUser) {
    const userRole = currentUser.roleId?.name;

    // Superadmin can create attendance records for anyone
    if (userRole === 'superadmin') {
      return data.businessId || this.businessId;
    }

    // Admin (business owner) can create attendance records for their business
    if (userRole === 'admin') {
      const businessId =
        data.businessId ||
        this.businessId ||
        (await this.getBusinessIdForUser(currentUser));
      const isOwner = await this.isBusinessOwner(currentUser, businessId);

      if (!isOwner) {
        throw new Error(
          'Unauthorized: Only business owners can create attendance records for their business',
        );
      }

      return businessId;
    }

    // Manager can create attendance records for their assigned stores only
    if (userRole === 'manager') {
      const businessId = await this.getBusinessIdForUser(currentUser);
      return businessId;
    }

    // Regular employees can create attendance records for themselves
    if (userRole === 'employee') {
      const businessId = await this.getBusinessIdForUser(currentUser);
      return businessId;
    }

    throw new Error(
      'Unauthorized: Invalid user role for attendance record creation',
    );
  }

  /**
   * Get attendance by ID with access control
   * @param {String} id - Attendance ID
   * @param {Object} currentUser - Current user
   * @returns {Object} Attendance record
   */
  async getAttendanceByIdWithAccess(id, currentUser) {
    const attendance = await this.getAttendanceById(id);

    if (!attendance) {
      return null;
    }

    const userRole = currentUser.roleId?.name;

    // Superadmin can access any attendance record
    if (userRole === 'superadmin') {
      return attendance;
    }

    // Check business context for other roles
    const businessId = await this.getBusinessIdForUser(currentUser);

    if (
      attendance.businessId &&
      attendance.businessId.toString() !== businessId.toString()
    ) {
      throw new Error(
        'Unauthorized: You can only access attendance records in your business',
      );
    }

    return attendance;
  }

  /**
   * Validate employee attendance access
   * @param {String} employeeId - Employee ID
   * @param {Object} currentUser - Current user
   */
  async validateEmployeeAttendanceAccess(employeeId, currentUser) {
    const userRole = currentUser.roleId?.name;

    // Superadmin can access any employee's attendance
    if (userRole === 'superadmin') {
      return;
    }

    // Admin and manager can access any employee's attendance in their business
    if (userRole === 'admin' || userRole === 'manager') {
      const businessId = await this.getBusinessIdForUser(currentUser);
      const employeeService = new EmployeeService(this.businessId);
      const EmployeeModel = await employeeService.getModelRef();
      const employee = await EmployeeModel.findById(employeeId).lean();

      if (!employee) {
        throw new Error('Employee not found');
      }

      // Check if employee belongs to the same business
      const storeService = new StoreService(this.businessId);
      const StoreModel = await storeService.getModelRef();
      const store = await StoreModel.findById(employee.store).lean();

      if (!store) {
        throw new Error('Employee store not found');
      }

      const isOwner = await this.isBusinessOwner(currentUser, businessId);
      if (!isOwner && store.owner.toString() !== currentUser._id.toString()) {
        throw new Error(
          'Unauthorized: You can only access attendance for employees in your business',
        );
      }

      return;
    }

    // Regular employees can only access their own attendance
    const employeeService = new EmployeeService(this.businessId);
    const EmployeeModel = await employeeService.getModelRef();
    const employee = await EmployeeModel.findOne({
      user: currentUser._id,
      _id: employeeId,
    }).lean();

    if (!employee) {
      throw new Error('Unauthorized: You can only access your own attendance');
    }
  }

  /**
   * Validate store attendance access
   * @param {String} storeId - Store ID
   * @param {Object} currentUser - Current user
   */
  async validateStoreAttendanceAccess(storeId, currentUser) {
    const userRole = currentUser.roleId?.name;

    // Superadmin can access any store's attendance
    if (userRole === 'superadmin') {
      return;
    }

    // Admin and manager can access attendance for stores in their business
    if (userRole === 'admin' || userRole === 'manager') {
      const businessId = await this.getBusinessIdForUser(currentUser);
      await this.validateStoreBelongsToBusiness(storeId, businessId);
      return;
    }

    throw new Error(
      'Unauthorized: Invalid user role for store attendance access',
    );
  }

  /**
   * Check if user is business owner
   * @param {Object} currentUser - Current user
   * @param {String} businessId - Business ID
   * @returns {Boolean} Is business owner
   */
  async isBusinessOwner(currentUser, businessId) {
    const business = await Business.findById(businessId)
      .select('owner')
      .lean()
      .exec();

    if (!business) {
      return false;
    }

    return business.owner.toString() === currentUser._id.toString();
  }

  /**
   * Get business ID for user
   * @param {Object} currentUser - Current user
   * @returns {String} Business ID
   */
  async getBusinessIdForUser(currentUser) {
    const userRole = currentUser.roleId?.name;

    if (userRole === 'admin') {
      // Admin users own the business directly
      const business = await Business.findOne({ owner: currentUser._id })
        .select('_id')
        .lean()
        .exec();
      if (!business) {
        throw new Error('Business not found for admin user');
      }
      return business._id;
    }

    if (userRole === 'manager') {
      // Manager users: Find their store, then find the business that owns that store
      const storeService = new StoreService(this.businessId);
      const StoreModel = await storeService.getModelRef();
      const store = await StoreModel.findOne({ manager: currentUser._id })
        .select('owner')
        .lean()
        .exec();

      if (!store) {
        throw new Error('Store not found for manager user');
      }

      // Find the business owned by the store owner
      const business = await Business.findOne({ owner: store.owner })
        .select('_id')
        .lean()
        .exec();

      if (!business) {
        throw new Error('Business not found for store owner');
      }

      return business._id;
    }

    if (userRole === 'employee') {
      // Employee users: Find their employee record, then find the business
      const employeeService = new EmployeeService(this.businessId);
      const EmployeeModel = await employeeService.getModelRef();
      const employee = await EmployeeModel.findOne({ user: currentUser._id })
        .select('store')
        .lean()
        .exec();

      if (!employee) {
        throw new Error('Employee record not found for user');
      }

      const storeService = new StoreService(this.businessId);
      const StoreModel = await storeService.getModelRef();
      const store = await StoreModel.findById(employee.store)
        .select('owner')
        .lean()
        .exec();

      if (!store) {
        throw new Error('Store not found for employee');
      }

      // Find the business owned by the store owner
      const business = await Business.findOne({ owner: store.owner })
        .select('_id')
        .lean()
        .exec();

      if (!business) {
        throw new Error('Business not found for store owner');
      }

      return business._id;
    }

    throw new Error('Unable to determine business for user role: ' + userRole);
  }

  /**
   * Validate that store belongs to business
   * @param {String} storeId - Store ID
   * @param {String} businessId - Business ID
   */
  async validateStoreBelongsToBusiness(storeId, businessId) {
    const storeService = new StoreService(this.businessId);
    const StoreModel = await storeService.getModelRef();
    const store = await StoreModel.findById(storeId).select('owner').lean();

    if (!store) {
      throw new Error('Store not found');
    }

    const business = await Business.findById(businessId).select('owner').lean();
    if (!business) {
      throw new Error('Business not found');
    }

    if (business.owner.toString() !== store.owner.toString()) {
      throw new Error('Store does not belong to your business');
    }
  }
}

export default AttendanceService;
