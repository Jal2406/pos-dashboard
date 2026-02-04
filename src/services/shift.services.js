import {
  ShiftSchema,
  Business,
  StoreSchema,
  EmployeeSchema,
  ShiftTypeSchema,
  User,
} from '../models/index.js';
import { BaseService } from '../utils/index.js';
import { applyStoreScope, validateStoreAccess } from '../utils/serviceGuard.js';

class ShiftService extends BaseService {
  constructor(businessId) {
    if (!businessId) {
      throw new Error('ShiftService initialized without businessId');
    }
    super({
      modelName: 'Shift',
      schema: ShiftSchema,
      collection: 'shifts',
      businessId,
    });
    
    // RBAC: Shifts are store-scoped
    this.rbacConfig.storeScoped = true;
    this.rbacConfig.storeIdField = 'storeId';
  }

  /**
   * Manually populate shift relations for cross-database connections
   * @param {Object|Array} shifts - Single shift or array of shifts
   * @returns {Promise<Object|Array>} Shift(s) with populated relations
   */
  async _populateShiftRelations(shifts) {
    const isArray = Array.isArray(shifts);
    const shiftArray = isArray ? shifts : [shifts];

    if (shiftArray.length === 0) return isArray ? [] : null;

    // Collect all IDs for batch fetching
    const employeeIds = [];
    const shiftTypeIds = [];
    const userIds = [];
    const storeIds = [];

    shiftArray.forEach((shift) => {
      if (shift?.employeeId) {
        const empId = shift.employeeId._id || shift.employeeId;
        if (empId) employeeIds.push(empId);
      }
      if (shift?.shiftTypeId) {
        const stId = shift.shiftTypeId._id || shift.shiftTypeId;
        if (stId) shiftTypeIds.push(stId);
      }
      if (shift?.assignedBy) {
        const uId = shift.assignedBy._id || shift.assignedBy;
        if (uId) userIds.push(uId);
      }
      if (shift?.storeId) {
        const sId = shift.storeId._id || shift.storeId;
        if (sId) storeIds.push(sId);
      }
    });

    // Batch fetch all related documents
    const [employees, shiftTypes, users, stores] = await Promise.all([
      employeeIds.length > 0
        ? (async () => {
          const EmployeeModel = await this.getModel(
            'Employee',
            EmployeeSchema,
            'employees',
          );
          const emps = await EmployeeModel.find({
            _id: { $in: employeeIds },
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
              ? await User.find({ _id: { $in: empUserIds } })
                .select('name')
                .lean()
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
      shiftTypeIds.length > 0
        ? (async () => {
          const ShiftTypeModel = await this.getModel(
            'ShiftType',
            ShiftTypeSchema,
            'shifttypes',
          );
          return await ShiftTypeModel.find({ _id: { $in: shiftTypeIds } })
            .select('title shiftType startTime endTime')
            .lean();
        })()
        : [],
      userIds.length > 0
        ? User.find({ _id: { $in: userIds } })
          .select('name')
          .lean()
        : [],
      storeIds.length > 0
        ? (async () => {
          const StoreModel = await this.getModel(
            'Store',
            StoreSchema,
            'stores',
          );
          return await StoreModel.find({ _id: { $in: storeIds } })
            .select('name description')
            .lean();
        })()
        : [],
    ]);

    // Create maps for O(1) lookup
    const employeeMap = new Map(
      employees.map((emp) => [emp._id.toString(), emp]),
    );
    const shiftTypeMap = new Map(
      shiftTypes.map((st) => [st._id.toString(), st]),
    );
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));
    const storeMap = new Map(stores.map((s) => [s._id.toString(), s]));

    // Populate each shift
    const populatedShifts = shiftArray.map((shift) => {
      const populated = { ...shift };

      if (shift?.employeeId) {
        const empId = (shift.employeeId._id || shift.employeeId).toString();
        populated.employeeId = employeeMap.get(empId) || shift.employeeId;
      }

      if (shift?.shiftTypeId) {
        const stId = (shift.shiftTypeId._id || shift.shiftTypeId).toString();
        populated.shiftTypeId = shiftTypeMap.get(stId) || shift.shiftTypeId;
      }

      if (shift?.assignedBy) {
        const uId = (shift.assignedBy._id || shift.assignedBy).toString();
        populated.assignedBy = userMap.get(uId) || shift.assignedBy;
      }

      if (shift?.storeId) {
        const sId = (shift.storeId._id || shift.storeId).toString();
        populated.storeId = storeMap.get(sId) || shift.storeId;
      }

      return populated;
    });

    return isArray ? populatedShifts : populatedShifts[0];
  }

  /**
   * Create a new shift assignment with access control
   * @param {Object} data - Shift assignment data
   * @param {Object} currentUser - Current user making the request
   * @returns {Object} Created shift assignment
   */
  async createShiftAssignment(data, currentUser) {
    try {
      // Validate access and get business ID
      const businessId = await this.validateShiftAssignmentCreationAccess(
        data,
        currentUser,
      );

      // Validate shift assignment data
      this.validateShiftAssignmentData(data);

      // Validate custom week off data if provided
      if (data.customWeekOff !== undefined) {
        this._validateCustomWeekOffData(data.customWeekOff);
      }

      // Check for conflicts (employee already assigned to another shift at the same time)
      await this.checkForShiftConflicts(
        data.employeeId,
        data.assignmentDate,
        data.actualStartTime,
        data.actualEndTime,
        businessId,
      );

      // Add access control fields
      const shiftData = {
        ...data,
        assignedBy: currentUser._id,
        businessId,
      };

      const shift = await super.create(shiftData);

      // Populate the created shift manually for cross-DB connections
      const ShiftModel = await this.getModel('Shift', ShiftSchema, 'shifts');
      const shiftDoc = await ShiftModel.findById(shift._id).lean().exec();
      const populatedShift = await this._populateShiftRelations(shiftDoc);

      return await this.transformShiftForResponse(populatedShift);
    } catch (error) {
      console.log(error);
      throw new Error(`Error creating shift assignment: ${error.message}`);
    }
  }

  /**
   * Get all shift assignments with filtering and pagination
   * @param {Object} queryParams - Query parameters for filtering and pagination
   * @returns {Object} Paginated shift assignments data
   */
  async listShiftAssignments(queryParams = {}) {
    const {
      page = 1,
      limit = 10,
      search,
      sortBy = 'assignmentDate',
      sortOrder = 'desc',
      status,
      isActive,
      storeId,
      employeeId,
      startDate,
      endDate,
      businessId,
      shiftTypeId,
      assignmentDate,
    } = queryParams;

    // Build filter object
    const filters = this._buildShiftFilters({
      businessId,
      status,
      isActive,
      storeId,
      employeeId,
      startDate,
      endDate,
      shiftTypeId,
      assignmentDate,
    });

    // Build sort object
    const sort = this._buildSort(sortBy, sortOrder);

    try {
      const ShiftModel = await this.getModel('Shift', ShiftSchema, 'shifts');

      // Use parallel execution for count and data fetching
      const [totalCount, shifts] = await Promise.all([
        ShiftModel.countDocuments(filters),
        this._fetchShiftsWithQuery(filters, sort, page, limit, search),
      ]);

      // Calculate pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const totalPages = Math.ceil(totalCount / parseInt(limit));

      // Transform data for response
      const transformedShifts = await Promise.all(
        shifts.map((shift) => this.transformShiftForResponse(shift)),
      );

      return {
        data: transformedShifts,
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
      throw new Error(`Error retrieving shift assignments: ${error.message}`);
    }
  }

  /**
   * Build filters for shift assignment queries
   * @param {Object} params - Filter parameters
   * @returns {Object} Filter object
   */
  _buildShiftFilters({
    businessId,
    status,
    isActive,
    storeId,
    employeeId,
    startDate,
    endDate,
    shiftTypeId,
    assignmentDate,
  }) {
    const filters = {};

    if (businessId) {
      filters.businessId = businessId;
    }

    // Add status filter - isActive takes precedence over status
    if (isActive !== undefined) {
      // If isActive is provided, map it to status
      const isActiveValue =
        typeof isActive === 'string'
          ? isActive.toLowerCase() === 'true'
          : Boolean(isActive);
      filters.status = isActiveValue ? 'scheduled' : 'cancelled';
    } else if (status) {
      // If only status is provided, use it directly
      filters.status = status;
    }

    if (storeId) {
      filters.storeId = storeId;
    }

    if (employeeId) {
      filters.employeeId = employeeId;
    }

    // Add shiftTypeId filter
    if (shiftTypeId) {
      filters.shiftTypeId = shiftTypeId;
    }

    // assignmentDate takes precedence over startDate/endDate range
    if (assignmentDate) {
      // Filter for exact date - set to start and end of the day
      const date = new Date(assignmentDate);
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      filters.assignmentDate = {
        $gte: startOfDay,
        $lte: endOfDay,
      };
    } else if (startDate || endDate) {
      filters.assignmentDate = {};
      if (startDate) {
        filters.assignmentDate.$gte = new Date(startDate);
      }
      if (endDate) {
        filters.assignmentDate.$lte = new Date(endDate);
      }
    }

    return filters;
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
   * Fetch shifts with query and population
   * @param {Object} filters - Database filters
   * @param {Object} sort - Sort configuration
   * @param {Number} page - Page number
   * @param {Number} limit - Items per page
   * @param {String} search - Search term
   * @returns {Array} Shifts with populated data
   */
  async _fetchShiftsWithQuery(filters, sort, page, limit, search) {
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const ShiftModel = await this.getModel('Shift', ShiftSchema, 'shifts');

    // RBAC: Apply store scoping if entity is store-scoped
    if (this.rbacConfig.enabled && this.rbacConfig.storeScoped) {
        applyStoreScope(filters, this.rbacConfig.storeIdField);
    }

    let shifts;
    // Apply search filter if provided
    if (search) {
      shifts = await this._searchShiftsWithAggregation(
        filters,
        sort,
        skip,
        parseInt(limit),
        search,
      );
    } else {
      shifts = await ShiftModel.find(filters)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean()
        .exec();
    }

    // Manually populate relations for cross-DB connections
    return await this._populateShiftRelations(shifts);
  }

  /**
   * Search shifts using aggregation pipeline
   * @param {Object} filters - Database filters
   * @param {Object} sort - Sort configuration
   * @param {Number} skip - Skip count
   * @param {Number} limit - Limit count
   * @param {String} search - Search term
   * @returns {Array} Filtered shifts
   */
  async _searchShiftsWithAggregation(filters, sort, skip, limit, search) {
    const searchRegex = new RegExp(search, 'i');

    const ShiftModel = await this.getModel('Shift', ShiftSchema, 'shifts');

    // RBAC: Apply store scoping if entity is store-scoped (filters already modified by caller)
    // Store scoping is applied in _fetchShiftsWithQuery before calling this method

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
          from: 'shifttypes',
          localField: 'shiftTypeId',
          foreignField: '_id',
          as: 'shiftTypeId',
        },
      },
      {
        $match: {
          $or: [
            { 'employeeId.user.firstName': searchRegex },
            { 'employeeId.user.lastName': searchRegex },
            { 'shiftTypeId.title': searchRegex },
            { 'shiftTypeId.shiftType': searchRegex },
            { notes: searchRegex },
          ],
        },
      },
      { $sort: sort },
      { $skip: skip },
      { $limit: limit },
    ];

    return ShiftModel.aggregate(pipeline).exec();
  }

  /**
   * Get shift assignment by ID with populated data
   * @param {String} id - Shift assignment ID
   * @returns {Object} Shift assignment data
   */
  async getShiftAssignmentById(id) {
    try {
      const ShiftModel = await this.getModel('Shift', ShiftSchema, 'shifts');
      const shift = await ShiftModel.findById(id).lean().exec();

      if (!shift) {
        throw new Error(`Shift assignment with id ${id} not found`);
      }

      // Manually populate relations for cross-DB connections
      const populatedShift = await this._populateShiftRelations(shift);

      return await this.transformShiftForResponse(populatedShift);
    } catch (error) {
      throw new Error(`Error retrieving shift assignment: ${error.message}`);
    }
  }

  /**
   * Update shift assignment by ID with access control
   * @param {String} id - Shift assignment ID
   * @param {Object} data - Update data
   * @param {Object} currentUser - Current user making the request
   * @returns {Object} Updated shift assignment
   */
  async updateShiftAssignmentById(id, data, currentUser) {
    try {
      // Get existing shift and validate access
      const existingShift = await this.getShiftAssignmentById(id);
      if (!existingShift) {
        throw new Error(`Shift assignment with id ${id} not found`);
      }

      // Validate access control
      await this.validateShiftAssignmentUpdateAccess(
        existingShift,
        data,
        currentUser,
      );

      // Validate shift assignment data if provided
      if (data.plannedStartTime || data.plannedEndTime || data.assignmentDate) {
        this.validateShiftAssignmentData(data);
      }

      // Check for conflicts if time or date is being updated
      if (data.plannedStartTime || data.plannedEndTime || data.assignmentDate) {
        await this.checkForShiftConflicts(
          data.employeeId || existingShift.employeeId,
          data.assignmentDate || existingShift.assignmentDate,
          data.plannedStartTime || existingShift.plannedStartTime,
          data.plannedEndTime || existingShift.plannedEndTime,
          existingShift.businessId,
          id, // Exclude current shift from conflict check
        );
      }

      const updatedShift = await super.updateById(id, data);
      if (!updatedShift) {
        throw new Error(`Shift assignment with id ${id} not found`);
      }

      // Populate the updated shift
      const ShiftModel = await this.getModel('Shift', ShiftSchema, 'shifts');
      const shiftDoc = await ShiftModel.findById(updatedShift._id)
        .lean()
        .exec();

      // Manually populate relations for cross-DB connections
      const populatedShift = await this._populateShiftRelations(shiftDoc);

      return await this.transformShiftForResponse(populatedShift);
    } catch (error) {
      throw new Error(`Error updating shift assignment: ${error.message}`);
    }
  }

  /**
   * Delete shift assignment by ID with access control
   * @param {String} id - Shift assignment ID
   * @param {Object} currentUser - Current user making the request
   * @returns {Object} Deleted shift assignment
   */
  async deleteShiftAssignmentById(id, currentUser) {
    try {
      // Get existing shift and validate access
      const existingShift = await this.getShiftAssignmentById(id);
      if (!existingShift) {
        throw new Error(`Shift assignment with id ${id} not found`);
      }

      // Validate access control
      await this.validateShiftAssignmentDeleteAccess(
        existingShift,
        currentUser,
      );

      const deletedShift = await super.deleteById(id);
      return deletedShift;
    } catch (error) {
      throw new Error(`Error deleting shift assignment: ${error.message}`);
    }
  }

  /**
   * Cancel a shift assignment
   * @param {String} id - Shift assignment ID
   * @param {String} reason - Cancellation reason
   * @param {Object} currentUser - Current user making the request
   * @returns {Object} Updated shift assignment
   */
  async cancelShift(id, reason, currentUser) {
    try {
      const shift = await this.getShiftAssignmentById(id);
      if (!shift) {
        throw new Error(`Shift assignment with id ${id} not found`);
      }

      // Validate access control
      await this.validateShiftAssignmentUpdateAccess(shift, {}, currentUser);

      const ShiftModel = await this.getModel('Shift', ShiftSchema, 'shifts');
      const shiftDoc = await ShiftModel.findById(id);

      await shiftDoc.cancel(reason);

      return await this.getShiftAssignmentById(id);
    } catch (error) {
      throw new Error(`Error cancelling shift: ${error.message}`);
    }
  }

  /**
   * Get shifts by employee and date range
   * @param {String} employeeId - Employee ID
   * @param {String} startDate - Start date
   * @param {String} endDate - End date
   * @param {Object} currentUser - Current user making the request
   * @returns {Array} Employee shifts
   */
  async getShiftsByEmployeeAndDateRange(
    employeeId,
    startDate,
    endDate,
    currentUser,
  ) {
    try {
      // Validate access
      await this.validateEmployeeShiftAccess(employeeId, currentUser);

      // Default to today's date if not provided or invalid
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Set to start of day

      const start = startDate ? new Date(startDate) : today;

      // Validate startDate - if invalid, use today's date
      const validStartDate = Number.isNaN(start.getTime()) ? today : start;

      // Set time to start of day for startDate
      validStartDate.setHours(0, 0, 0, 0);

      const ShiftModel = await this.getModel('Shift', ShiftSchema, 'shifts');

      // Build query conditionally - endDate is optional
      let shiftsQuery;
      if (endDate) {
        const end = new Date(endDate);
        // Validate endDate - if invalid, don't use it
        if (!Number.isNaN(end.getTime())) {
          end.setHours(23, 59, 59, 999); // Set to end of day
          // Use direct query instead of static method for reliability
          // Note: populate() removed - using manual population via _populateShiftRelations for cross-DB support
          shiftsQuery = ShiftModel.find({
            employeeId,
            assignmentDate: {
              $gte: validStartDate,
              $lte: end,
            },
          }).sort({ assignmentDate: 1, plannedStartTime: 1 });
        } else {
          // If endDate is invalid, only filter by startDate
          // Note: populate() removed - using manual population via _populateShiftRelations for cross-DB support
          shiftsQuery = ShiftModel.find({
            employeeId,
            assignmentDate: { $gte: validStartDate },
          }).sort({ assignmentDate: 1, plannedStartTime: 1 });
        }
      } else {
        // If endDate is not provided, only filter by startDate
        // Note: populate() removed - using manual population via _populateShiftRelations for cross-DB support
        shiftsQuery = ShiftModel.find({
          employeeId,
          assignmentDate: { $gte: validStartDate },
        }).sort({ assignmentDate: 1, plannedStartTime: 1 });
      }

      const shifts = await shiftsQuery.lean().exec();

      // Manually populate relations for cross-DB connections
      const populatedShifts = await this._populateShiftRelations(shifts);

      // Use cleaner transformation for list response
      return populatedShifts.map((shift) =>
        this.transformShiftForListResponse(shift),
      );
    } catch (error) {
      throw new Error(`Error retrieving employee shifts: ${error.message}`);
    }
  }

  /**
   * Get shifts by store and date
   * @param {String} storeId - Store ID
   * @param {String} date - Date
   * @param {Object} currentUser - Current user making the request
   * @returns {Array} Store shifts
   */
  async getShiftsByStoreAndDate(storeId, date, currentUser) {
    try {
      // Validate access
      await this.validateStoreShiftAccess(storeId, currentUser);

      const ShiftModel = await this.getModel('Shift', ShiftSchema, 'shifts');
      const shiftsQuery = ShiftModel.findByStoreAndDate(
        storeId,
        new Date(date),
      );
      const shifts = await shiftsQuery.lean().exec();

      // Manually populate relations for cross-DB connections
      const populatedShifts = await this._populateShiftRelations(shifts);

      return await Promise.all(
        populatedShifts.map((shift) => this.transformShiftForResponse(shift)),
      );
    } catch (error) {
      throw new Error(`Error retrieving store shifts: ${error.message}`);
    }
  }

  /**
   * Get scheduled shifts (for attendance tracking)
   * @param {String} storeId - Store ID (optional)
   * @param {Object} currentUser - Current user making the request
   * @returns {Array} Scheduled shifts
   */
  async getScheduledShifts(storeId, currentUser) {
    try {
      const businessId = await this.getBusinessIdForUser(currentUser);

      const ShiftModel = await this.getModel('Shift', ShiftSchema, 'shifts');
      const shiftsQuery = ShiftModel.findScheduledShifts(businessId, storeId);
      const shifts = await shiftsQuery.lean().exec();

      // Manually populate relations for cross-DB connections
      const populatedShifts = await this._populateShiftRelations(shifts);

      return await Promise.all(
        populatedShifts.map((shift) => this.transformShiftForResponse(shift)),
      );
    } catch (error) {
      throw new Error(`Error retrieving scheduled shifts: ${error.message}`);
    }
  }

  /**
   * Get shift assignments with business context filtering
   * @param {Object} queryParams - Query parameters
   * @param {Object} currentUser - Current user
   * @returns {Object} Filtered shift assignments
   */
  async listShiftAssignmentsWithBusinessContext(queryParams = {}, currentUser) {
    const userRole = currentUser.roleId?.name;
    let businessId;

    // Superadmin can see all shift assignments
    if (userRole === 'superadmin') {
      return await this.listShiftAssignments(queryParams);
    }

    // Get business context
    businessId = await this.getBusinessIdForUser(currentUser);

    // Build filtered params with business context
    const filteredParams = {
      ...queryParams,
      businessId,
    };

    // Admin: Full access within business
    if (userRole === 'admin') {
      return await this.listShiftAssignments(filteredParams);
    }

    // Manager: Can see shifts from stores they manage
    if (userRole === 'manager') {
      const managedStoreIds = await this._getManagedStoreIds(currentUser);
      if (managedStoreIds.length > 0) {
        // Only override storeId if not already specified by query params
        if (!filteredParams.storeId) {
          filteredParams.storeId = { $in: managedStoreIds };
        } else {
          // Validate manager has access to the requested store
          const requestedStoreId = filteredParams.storeId.toString();
          if (!managedStoreIds.some(id => id.toString() === requestedStoreId)) {
            // Return empty results if manager doesn't manage this store
            return {
              data: [],
              pagination: { currentPage: 1, totalPages: 0, totalCount: 0, hasNextPage: false, hasPrevPage: false, limit: 10 },
            };
          }
        }
      } else {
        // Manager has no stores assigned - return empty results
        return {
          data: [],
          pagination: { currentPage: 1, totalPages: 0, totalCount: 0, hasNextPage: false, hasPrevPage: false, limit: 10 },
        };
      }
      return await this.listShiftAssignments(filteredParams);
    }

    // Cashier and other roles: Can only see their own shift assignments
    try {
      const employeeId = await this.getEmployeeIdForUser(currentUser);
      filteredParams.employeeId = employeeId;
      return await this.listShiftAssignments(filteredParams);
    } catch (error) {
      // If employee record not found, return empty results
      return {
        data: [],
        pagination: { currentPage: 1, totalPages: 0, totalCount: 0, hasNextPage: false, hasPrevPage: false, limit: 10 },
      };
    }
  }

  /**
   * Get shift assignment by ID with business context
   * @param {String} id - Shift assignment ID
   * @param {Object} currentUser - Current user
   * @returns {Object} Shift assignment data
   */
  async getShiftAssignmentByIdWithBusinessContext(id, currentUser) {
    const shift = await this.getShiftAssignmentById(id);

    if (!shift) {
      return null;
    }

    const userRole = currentUser.roleId?.name;

    // Superadmin can access any shift assignment
    if (userRole === 'superadmin') {
      return shift;
    }

    // Check business context for other roles
    const businessId = await this.getBusinessIdForUser(currentUser);

    if (
      shift.businessId &&
      shift.businessId.toString() !== businessId.toString()
    ) {
      throw new Error(
        'Unauthorized: You can only access shift assignments in your business',
      );
    }

    return shift;
  }

  // ===== VALIDATION METHODS =====

  /**
   * Validate shift assignment data
   * @param {Object} data - Shift assignment data
   */
  validateShiftAssignmentData(data) {
    if (!data.employeeId) {
      throw new Error('Employee ID is required');
    }

    if (!data.shiftTypeId) {
      throw new Error('Shift type ID is required');
    }

    if (!data.assignmentDate) {
      throw new Error('Shift date is required');
    }

    if (!data.storeId) {
      throw new Error('Store ID is required');
    }

    // Validate date is not in the past
    const assignmentDate = new Date(data.assignmentDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (assignmentDate < today) {
      throw new Error('Shift date cannot be in the past');
    }
  }

  /**
   * Validate custom week off data
   * @param {Array} customWeekOff - Custom week off days array
   */
  _validateCustomWeekOffData(customWeekOff) {
    if (!Array.isArray(customWeekOff)) {
      throw new Error('Custom week off must be an array');
    }

    const validDays = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ];

    // Check for valid day names
    for (const day of customWeekOff) {
      if (!validDays.includes(day)) {
        throw new Error(
          `Invalid day name: ${day}. Must be one of: ${validDays.join(', ')}`,
        );
      }
    }

    // Check for duplicates
    const uniqueDays = new Set(customWeekOff);
    if (uniqueDays.size !== customWeekOff.length) {
      throw new Error('Custom week off days must be unique');
    }
  }

  /**
   * Check for shift conflicts
   * @param {String} employeeId - Employee ID
   * @param {Date} assignmentDate - Shift date
   * @param {String} startTime - Start time
   * @param {String} endTime - End time
   * @param {String} businessId - Business ID
   * @param {String} excludeId - Shift ID to exclude from check
   */
  async checkForShiftConflicts(
    employeeId,
    assignmentDate,
    startTime,
    endTime,
    businessId,
    excludeId = null,
  ) {
    if (!startTime || !endTime) {
      return; // Skip conflict check if times are not provided
    }

    const filters = {
      employeeId,
      businessId,
      assignmentDate: {
        $gte: new Date(assignmentDate).setHours(0, 0, 0, 0),
        $lte: new Date(assignmentDate).setHours(23, 59, 59, 999),
      },
      status: { $in: ['scheduled', 'in_progress'] },
    };

    if (excludeId) {
      filters._id = { $ne: excludeId };
    }

    const ShiftModel = await this.getModel('Shift', ShiftSchema, 'shifts');
    const conflictingShifts = await ShiftModel.find(filters).lean();

    // Check for time overlaps
    for (const shift of conflictingShifts) {
      if (
        this._timesOverlap(
          startTime,
          endTime,
          shift.plannedStartTime,
          shift.plannedEndTime,
        )
      ) {
        throw new Error(
          'Employee is already assigned to another shift during this time period',
        );
      }
    }
  }

  /**
   * Check if two time ranges overlap
   * @param {String} start1 - First start time
   * @param {String} end1 - First end time
   * @param {String} start2 - Second start time
   * @param {String} end2 - Second end time
   * @returns {Boolean} Whether times overlap
   */
  _timesOverlap(start1, end1, start2, end2) {
    if (!start1 || !end1 || !start2 || !end2) {
      return false;
    }

    const [start1Hour, start1Min] = start1.split(':').map(Number);
    const [end1Hour, end1Min] = end1.split(':').map(Number);
    const [start2Hour, start2Min] = start2.split(':').map(Number);
    const [end2Hour, end2Min] = end2.split(':').map(Number);

    const start1Minutes = start1Hour * 60 + start1Min;
    const end1Minutes = end1Hour * 60 + end1Min;
    const start2Minutes = start2Hour * 60 + start2Min;
    const end2Minutes = end2Hour * 60 + end2Min;

    return start1Minutes < end2Minutes && end1Minutes > start2Minutes;
  }

  /**
   * Get employee ID for a user
   * @param {Object} currentUser - Current user
   * @returns {String} Employee ID
   */
  async getEmployeeIdForUser(currentUser) {
    const EmployeeModel = await this.getModel(
      'Employee',
      EmployeeSchema,
      'employees',
    );
    const employee = await EmployeeModel.findOne({
      user: currentUser._id,
    }).lean();

    if (!employee) {
      throw new Error('Employee record not found for user');
    }

    return employee._id;
  }

  /**
   * Get store IDs managed by a manager user
   * @param {Object} currentUser - Current user (manager)
   * @returns {Array} Array of store IDs
   */
  async _getManagedStoreIds(currentUser) {
    const EmployeeModel = await this.getModel(
      'Employee',
      EmployeeSchema,
      'employees',
    );

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
   * Transform shift data for response
   * @param {Object} shift - Shift document
   * @returns {Object} Transformed shift data
   */
  async transformShiftForResponse(shift) {
    if (!shift) return shift;

    const shiftObj = shift.toObject ? shift.toObject() : shift;

    // Pre-calculate applicable dates between assignmentDate and endDate
    const applicableDates = this._getApplicableDatesInRange(shiftObj);

    return {
      // Strict response fields
      shiftId: shiftObj._id,
      employeeId: shiftObj.employeeId,
      employee: shiftObj.employeeId
        ? {
          _id: shiftObj.employeeId._id,
          fullName:
            shiftObj.employeeId.user?.name ||
            (shiftObj.employeeId.user?.firstName &&
              shiftObj.employeeId.user?.lastName
              ? `${shiftObj.employeeId.user.firstName} ${shiftObj.employeeId.user.lastName}`
              : ''),
          designation: shiftObj.employeeId.designation,
        }
        : null,
      shiftTypeId: shiftObj.shiftTypeId,
      shiftType: shiftObj.shiftTypeId
        ? {
          _id: shiftObj.shiftTypeId._id,
          title: shiftObj.shiftTypeId.title,
          shiftType: shiftObj.shiftTypeId.shiftType,
          startTime: shiftObj.shiftTypeId.startTime,
          endTime: shiftObj.shiftTypeId.endTime,
        }
        : null,
      assignmentDate: shiftObj.assignmentDate,
      plannedStartTime: shiftObj.plannedStartTime,
      plannedEndTime: shiftObj.plannedEndTime,
      status: shiftObj.status,
      notes: shiftObj.notes,
      assignedBy: shiftObj.assignedBy,
      businessId: shiftObj.businessId,
      storeId: shiftObj.storeId,
      store: shiftObj.storeId
        ? {
          _id: shiftObj.storeId._id,
          name: shiftObj.storeId.name,
          description: shiftObj.storeId.description,
        }
        : null,
      isRecurring: shiftObj.isRecurring,
      recurringPattern: shiftObj.recurringPattern,
      parentShiftId: shiftObj.parentShiftId,
      createdAt: shiftObj.createdAt,
      updatedAt: shiftObj.updatedAt,
      formattedDate: this._formatDate(shiftObj.assignmentDate),
      statusDisplay: this._getStatusDisplay(shiftObj.status),
      plannedDuration: this._calculateDuration(
        shiftObj.plannedStartTime,
        shiftObj.plannedEndTime,
      ),
      applicableDates,

      // Original data for backward compatibility
      _id: shiftObj._id,
      __v: shiftObj.__v,
    };
  }

  /**
   * Transform shift data for list response (cleaner, no duplicates)
   * @param {Object} shift - Shift document
   * @returns {Object} Clean transformed shift data
   */
  transformShiftForListResponse(shift) {
    if (!shift) return shift;

    const shiftObj = shift.toObject ? shift.toObject() : shift;

    // Format assignment date to YYYY-MM-DD
    const assignmentDate = shiftObj.assignmentDate
      ? new Date(shiftObj.assignmentDate).toISOString().split('T')[0]
      : null;

    // Handle shiftTypeId - could be populated object or just ID string
    let shiftType = null;
    if (shiftObj.shiftTypeId) {
      if (
        typeof shiftObj.shiftTypeId === 'object' &&
        shiftObj.shiftTypeId._id
      ) {
        // Populated object
        shiftType = {
          _id: shiftObj.shiftTypeId._id,
          title: shiftObj.shiftTypeId.title,
          startTime: shiftObj.shiftTypeId.startTime,
          endTime: shiftObj.shiftTypeId.endTime,
        };
      }
      // If it's just an ID string, shiftType remains null (shouldn't happen after _populateShiftRelations)
    }

    // Handle employeeId - could be populated object or just ID string
    let employee = null;
    if (shiftObj.employeeId) {
      if (typeof shiftObj.employeeId === 'object' && shiftObj.employeeId._id) {
        // Populated object
        employee = {
          _id: shiftObj.employeeId._id,
          name:
            shiftObj.employeeId.user?.name ||
            (shiftObj.employeeId.user?.firstName &&
              shiftObj.employeeId.user?.lastName
              ? `${shiftObj.employeeId.user.firstName} ${shiftObj.employeeId.user.lastName}`
              : ''),
          designation: shiftObj.employeeId.designation,
        };
      }
      // If it's just an ID string, employee remains null (shouldn't happen after _populateShiftRelations)
    }

    // Handle storeId - could be populated object or just ID string
    let store = null;
    if (shiftObj.storeId) {
      if (typeof shiftObj.storeId === 'object' && shiftObj.storeId._id) {
        // Populated object
        store = {
          _id: shiftObj.storeId._id,
          name: shiftObj.storeId.name,
        };
      }
      // If it's just an ID string, store remains null (shouldn't happen after _populateShiftRelations)
    }

    return {
      _id: shiftObj._id,
      employee,
      shiftType,
      assignmentDate,
      status: shiftObj.status,
      store,
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
      scheduled: 'Scheduled',
      cancelled: 'Cancelled',
    };
    return statusMap[status] || status;
  }

  /**
   * Calculate duration between start and end time
   * @param {String} startTime - Start time (HH:MM)
   * @param {String} endTime - End time (HH:MM)
   * @returns {Number} Duration in hours
   */
  _calculateDuration(startTime, endTime) {
    if (!startTime || !endTime) return 0;

    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);

    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    let durationMinutes;
    if (endMinutes < startMinutes) {
      // Crosses midnight
      durationMinutes = 24 * 60 - startMinutes + endMinutes;
    } else {
      durationMinutes = endMinutes - startMinutes;
    }

    return Math.round((durationMinutes / 60) * 100) / 100;
  }

  /**
   * Get all applicable dates between assignmentDate and endDate,
   * excluding recurringPattern.daysOfWeek and customWeekOff days.
   * @param {Object} shiftObj - Plain shift object
   * @returns {Array<String>} Array of ISO date strings (YYYY-MM-DD)
   */
  _getApplicableDatesInRange(shiftObj) {
    if (!shiftObj || !shiftObj.assignmentDate) {
      return [];
    }

    const MAX_DAYS = 3650; // Hard cap to prevent unbounded date generation (≈10 years)

    const start = new Date(shiftObj.assignmentDate);
    const hasEndDate = Boolean(shiftObj.endDate);
    const end = hasEndDate ? new Date(shiftObj.endDate) : new Date(start);

    // Normalize to start-of-day for safe comparison
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    if (end < start) {
      return [];
    }

    // Calculate the actual number of days in the range (inclusive)
    const msPerDay = 24 * 60 * 60 * 1000;
    const actualDays =
      Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1;

    // Enforce a hard cap on the number of days we will iterate over
    const maxIterations = Math.min(actualDays, MAX_DAYS);
    const isTrimmed = actualDays > MAX_DAYS;

    const customWeekOff = Array.isArray(shiftObj.customWeekOff)
      ? shiftObj.customWeekOff
      : [];

    const recurringDaysOfWeek =
      shiftObj.recurringPattern &&
      Array.isArray(shiftObj.recurringPattern.daysOfWeek)
        ? shiftObj.recurringPattern.daysOfWeek
        : [];

    const dayNames = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ];

    const result = [];
    let current = new Date(start);
    let iterations = 0;

    while (current <= end && iterations < maxIterations) {
      const dayName = dayNames[current.getDay()];

      const isRecurringOff = recurringDaysOfWeek.includes(dayName);
      const isCustomOff = customWeekOff.includes(dayName);

      // Only include dates that are NOT in recurringPattern.daysOfWeek or customWeekOff
      if (!isRecurringOff && !isCustomOff) {
        const year = current.getFullYear();
        const month = String(current.getMonth() + 1).padStart(2, '0');
        const day = String(current.getDate()).padStart(2, '0');

        // Use local date components instead of toISOString() to avoid UTC shifts
        result.push(`${year}-${month}-${day}`);
      }

      current.setDate(current.getDate() + 1);
      iterations += 1;
    }

    if (isTrimmed) {
      // Explicitly log when the requested range exceeds the cap
      // so it can be monitored and tuned if needed.
      // Do not throw to avoid breaking existing flows; we simply trim.
      // eslint-disable-next-line no-console
      console.warn(
        'ShiftService._getApplicableDatesInRange: date range exceeds MAX_DAYS cap; trimming results',
        {
          assignmentDate: shiftObj.assignmentDate,
          endDate: shiftObj.endDate,
          actualDays,
          maxDays: MAX_DAYS,
        },
      );
    }

    return result;
  }

  // ===== ACCESS CONTROL METHODS =====

  /**
   * Validate shift assignment creation access
   * @param {Object} data - Shift assignment data
   * @param {Object} currentUser - Current user
   * @returns {String} Business ID
   */
  async validateShiftAssignmentCreationAccess(data, currentUser) {
    const userRole = currentUser.roleId?.name;

    // Superadmin can create shift assignments for anyone
    if (userRole === 'superadmin') {
      return data.businessId || this.businessId;
    }

    // Admin (business owner) can create shift assignments for their business
    if (userRole === 'admin') {
      // Optimize: Use this.businessId first (set by middleware via req.businessId)
      // Only fetch if not available (fallback for edge cases)
      let businessId = data.businessId || this.businessId;

      // If businessId still not available, fetch it (edge case: admin route without middleware)
      if (!businessId) {
        businessId = await this.getBusinessIdForUser(currentUser);
      }

      // Always validate ownership (important if data.businessId is different from this.businessId)
      const isOwner = await this.isBusinessOwner(currentUser, businessId);
      if (!isOwner) {
        throw new Error(
          'Unauthorized: Only business owners can create shift assignments for their business',
        );
      }

      // Admin can create shift assignments for any store in their business
      // Store-level validation is essential (middleware doesn't do this)
      if (data.storeId) {
        await this.validateStoreBelongsToBusiness(data.storeId, businessId);
      }

      return businessId;
    }

    // Manager can create shift assignments for their assigned stores only
    // Manager routes don't use validateAdminSubscription middleware, so validation is essential
    if (userRole === 'manager') {
      // Manager routes don't have req.businessId set by middleware, so we need to fetch it
      const businessId = await this.getBusinessIdForUser(currentUser);

      if (!data.storeId) {
        throw new Error(
          'Managers can only create store-specific shift assignments',
        );
      }

      // Store-level validation is essential for managers
      await this.validateManagerCanManageStore(data.storeId, currentUser);
      return businessId;
    }

    throw new Error(
      'Unauthorized: Invalid user role for shift assignment creation',
    );
  }

  /**
   * Validate shift assignment update access
   * @param {Object} existingShift - Existing shift assignment
   * @param {Object} data - Update data
   * @param {Object} currentUser - Current user
   */
  async validateShiftAssignmentUpdateAccess(existingShift, data, currentUser) {
    const userRole = currentUser.roleId?.name;

    // Superadmin can update any shift assignment
    if (userRole === 'superadmin') {
      return;
    }

    // Admin (business owner) can update any shift assignment in their business
    if (userRole === 'admin') {
      const isOwner = await this.isBusinessOwner(
        currentUser,
        existingShift.businessId,
      );
      if (!isOwner) {
        throw new Error(
          'Unauthorized: You can only update shift assignments in your business',
        );
      }
      return;
    }

    // Manager can update shift assignments for their assigned stores only
    if (userRole === 'manager') {
      await this.validateManagerCanManageStore(
        existingShift.storeId,
        currentUser,
      );
      return;
    }

    throw new Error(
      'Unauthorized: Invalid user role for shift assignment update',
    );
  }

  /**
   * Validate shift assignment delete access
   * @param {Object} existingShift - Existing shift assignment
   * @param {Object} currentUser - Current user
   */
  async validateShiftAssignmentDeleteAccess(existingShift, currentUser) {
    const userRole = currentUser.roleId?.name;

    // Superadmin can delete any shift assignment
    if (userRole === 'superadmin') {
      return;
    }

    // Admin (business owner) can delete any shift assignment in their business
    if (userRole === 'admin') {
      const isOwner = await this.isBusinessOwner(
        currentUser,
        existingShift.businessId,
      );
      if (!isOwner) {
        throw new Error(
          'Unauthorized: You can only delete shift assignments in your business',
        );
      }
      return;
    }

    // Manager can delete shift assignments for their assigned stores only
    if (userRole === 'manager') {
      await this.validateManagerCanManageStore(
        existingShift.storeId,
        currentUser,
      );
      return;
    }

    throw new Error(
      'Unauthorized: Invalid user role for shift assignment deletion',
    );
  }

  /**
   * Validate employee access to their own shift
   * @param {Object} shift - Shift assignment
   * @param {Object} currentUser - Current user
   */
  async validateEmployeeAccess(shift, currentUser) {
    // Get employee record to check if user is the assigned employee
    const EmployeeModel = await this.getModel(
      'Employee',
      EmployeeSchema,
      'employees',
    );
    const employee = await EmployeeModel.findOne({
      user: currentUser._id,
      _id: shift.employeeId,
    }).lean();

    if (!employee) {
      throw new Error('Unauthorized: You can only access your own shifts');
    }
  }

  /**
   * Validate employee shift access
   * @param {String} employeeId - Employee ID
   * @param {Object} currentUser - Current user
   */
  async validateEmployeeShiftAccess(employeeId, currentUser) {
    const userRole = currentUser.roleId?.name;

    // Superadmin can access any employee's shifts
    if (userRole === 'superadmin') {
      return;
    }

    // Admin and manager can access any employee's shifts in their business
    if (userRole === 'admin' || userRole === 'manager') {
      const businessId = await this.getBusinessIdForUser(currentUser);
      const EmployeeModel = await this.getModel(
        'Employee',
        EmployeeSchema,
        'employees',
      );
      const employee = await EmployeeModel.findById(employeeId).lean();

      if (!employee) {
        throw new Error('Employee not found');
      }

      // Check if employee belongs to the same business
      const StoreModel = await this.getModel('Store', StoreSchema, 'stores');
      const store = await StoreModel.findById(employee.store).lean();

      if (!store) {
        throw new Error('Employee store not found');
      }

      const isOwner = await this.isBusinessOwner(currentUser, businessId);
      if (!isOwner && store.owner.toString() !== currentUser._id.toString()) {
        throw new Error(
          'Unauthorized: You can only access shifts for employees in your business',
        );
      }

      return;
    }

    // Regular employees can only access their own shifts
    const EmployeeModel = await this.getModel(
      'Employee',
      EmployeeSchema,
      'employees',
    );
    const employee = await EmployeeModel.findOne({
      user: currentUser._id,
      _id: employeeId,
    }).lean();

    if (!employee) {
      throw new Error('Unauthorized: You can only access your own shifts');
    }
  }

  /**
   * Validate store shift access
   * @param {String} storeId - Store ID
   * @param {Object} currentUser - Current user
   */
  async validateStoreShiftAccess(storeId, currentUser) {
    const userRole = currentUser.roleId?.name;

    // Superadmin can access any store's shifts
    if (userRole === 'superadmin') {
      return;
    }

    // Admin and manager can access shifts for stores in their business
    if (userRole === 'admin' || userRole === 'manager') {
      const businessId = await this.getBusinessIdForUser(currentUser);
      await this.validateStoreBelongsToBusiness(storeId, businessId);
      return;
    }

    throw new Error('Unauthorized: Invalid user role for store shift access');
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
      const StoreModel = await this.getModel('Store', StoreSchema, 'stores');
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

    throw new Error('Unable to determine business for user role: ' + userRole);
  }

  /**
   * Validate that store belongs to business
   * @param {String} storeId - Store ID
   * @param {String} businessId - Business ID
   */
  async validateStoreBelongsToBusiness(storeId, businessId) {
    const StoreModel = await this.getModel('Store', StoreSchema, 'stores');
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

  /**
   * Validate that manager can manage store
   * @param {String} storeId - Store ID
   * @param {Object} currentUser - Current user
   */
  async validateManagerCanManageStore(storeId, currentUser) {
    const StoreModel = await this.getModel('Store', StoreSchema, 'stores');
    const store = await StoreModel.findById(storeId).select('manager').lean();

    if (!store) {
      throw new Error('Store not found');
    }

    if (store.manager.toString() !== currentUser._id.toString()) {
      throw new Error(
        'Unauthorized: You can only manage shift assignments for stores you manage',
      );
    }
  }

  // ===== CUSTOM WEEK OFF METHODS =====

  /**
   * Get shifts applicable on a specific day considering custom week off
   * @param {String} dayName - Day name (e.g., 'Monday', 'Tuesday')
   * @param {String} businessId - Business ID
   * @param {String} storeId - Store ID (optional)
   * @returns {Array} Applicable shifts
   */
  async getShiftsApplicableOnDay(dayName, businessId, storeId = null) {
    try {
      const ShiftModel = await this.getModel('Shift', ShiftSchema, 'shifts');
      const shiftsQuery = ShiftModel.findApplicableOnDay(
        dayName,
        businessId,
        storeId,
      );
      const shifts = await shiftsQuery.lean().exec();

      // Manually populate relations for cross-DB connections
      const populatedShifts = await this._populateShiftRelations(shifts);

      // Filter out shifts where shift type week off includes the day
      const applicableShifts = [];
      for (const shift of populatedShifts) {
        if (shift.shiftTypeId && shift.shiftTypeId.weekOff) {
          // If shift has no custom week off, check shift type week off
          if (!shift.customWeekOff || shift.customWeekOff.length === 0) {
            if (!shift.shiftTypeId.weekOff.includes(dayName)) {
              applicableShifts.push(shift);
            }
          } else {
            // If shift has custom week off, it's already filtered by the query
            applicableShifts.push(shift);
          }
        } else {
          // If no shift type week off info, include the shift
          applicableShifts.push(shift);
        }
      }

      return applicableShifts;
    } catch (error) {
      throw new Error(
        `Error retrieving shifts for ${dayName}: ${error.message}`,
      );
    }
  }

  /**
   * Get shifts with custom week off information
   * @param {String} businessId - Business ID
   * @param {String} storeId - Store ID (optional)
   * @returns {Array} Shifts with custom week off data
   */
  async getShiftsWithCustomWeekOffInfo(businessId, storeId = null) {
    try {
      const ShiftModel = await this.getModel('Shift', ShiftSchema, 'shifts');
      const shiftsQuery = ShiftModel.findWithCustomWeekOffInfo(
        businessId,
        storeId,
      );
      const shifts = await shiftsQuery.lean().exec();

      // Manually populate relations for cross-DB connections
      return await this._populateShiftRelations(shifts);
    } catch (error) {
      throw new Error(
        `Error retrieving shifts with custom week off info: ${error.message}`,
      );
    }
  }

  /**
   * Add custom week off day to shift
   * @param {String} id - Shift ID
   * @param {String} dayName - Day name to add
   * @param {Object} currentUser - Current user
   * @returns {Object} Updated shift
   */
  async addCustomWeekOffDay(id, dayName, currentUser) {
    try {
      const existingShift = await this.getShiftAssignmentById(id);
      if (!existingShift) {
        throw new Error(`Shift with id ${id} not found`);
      }

      // Validate access control
      await this.validateShiftAssignmentUpdateAccess(
        existingShift,
        {},
        currentUser,
      );

      const ShiftModel = await this.getModel('Shift', ShiftSchema, 'shifts');
      const shift = await ShiftModel.findById(id);

      if (!shift) {
        throw new Error(`Shift with id ${id} not found`);
      }

      const added = shift.addCustomWeekOffDay(dayName);
      if (!added) {
        throw new Error(`Day ${dayName} is already a custom week off day`);
      }

      await shift.save();
      return await this.getShiftAssignmentById(id);
    } catch (error) {
      throw new Error(`Error adding custom week off day: ${error.message}`);
    }
  }

  /**
   * Remove custom week off day from shift
   * @param {String} id - Shift ID
   * @param {String} dayName - Day name to remove
   * @param {Object} currentUser - Current user
   * @returns {Object} Updated shift
   */
  async removeCustomWeekOffDay(id, dayName, currentUser) {
    try {
      const existingShift = await this.getShiftAssignmentById(id);
      if (!existingShift) {
        throw new Error(`Shift with id ${id} not found`);
      }

      // Validate access control
      await this.validateShiftAssignmentUpdateAccess(
        existingShift,
        {},
        currentUser,
      );

      const ShiftModel = await this.getModel('Shift', ShiftSchema, 'shifts');
      const shift = await ShiftModel.findById(id);

      if (!shift) {
        throw new Error(`Shift with id ${id} not found`);
      }

      const removed = shift.removeCustomWeekOffDay(dayName);
      if (!removed) {
        throw new Error(`Day ${dayName} is not a custom week off day`);
      }

      await shift.save();
      return await this.getShiftAssignmentById(id);
    } catch (error) {
      throw new Error(`Error removing custom week off day: ${error.message}`);
    }
  }

  /**
   * Clear custom week off from shift (revert to shift type week off)
   * @param {String} id - Shift ID
   * @param {Object} currentUser - Current user
   * @returns {Object} Updated shift
   */
  async clearCustomWeekOff(id, currentUser) {
    try {
      const existingShift = await this.getShiftAssignmentById(id);
      if (!existingShift) {
        throw new Error(`Shift with id ${id} not found`);
      }

      // Validate access control
      await this.validateShiftAssignmentUpdateAccess(
        existingShift,
        {},
        currentUser,
      );

      const ShiftModel = await this.getModel('Shift', ShiftSchema, 'shifts');
      const shift = await ShiftModel.findById(id);

      if (!shift) {
        throw new Error(`Shift with id ${id} not found`);
      }

      shift.clearCustomWeekOff();
      await shift.save();
      return await this.getShiftAssignmentById(id);
    } catch (error) {
      throw new Error(`Error clearing custom week off: ${error.message}`);
    }
  }
}

export default ShiftService;
