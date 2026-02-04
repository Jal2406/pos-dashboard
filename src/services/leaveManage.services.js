import { BaseService } from '../utils/index.js';
import {
  LeaveManageSchema,
} from '../models/index.js';
import mongoose from 'mongoose';
import {
  StoreService,
  EmployeeService,
  LeaveTypeServices,
} from './index.js';

/**
 * Leave Management Service
 *
 * Enterprise-grade service for managing employee leave requests with tenant isolation,
 * business rule validation, and comprehensive audit trails.
 *
 * @class LeaveManageService
 * @extends BaseService
 */
class LeaveManageService extends BaseService {
  /**
   * Creates an instance of LeaveManageService
   * @param {string} businessId - Business/tenant identifier for data isolation
   */
  constructor(businessId) {
    if (!businessId) {
      throw new Error('LeaveManageService initialized without businessId');
    }
    super({
      modelName: 'LeaveManage',
      schema: LeaveManageSchema,
      collection: 'leaveManages',
      businessId,
    });

    this._refsReady = false;
    this._storeService = new StoreService(businessId);
    this._employeeService = new EmployeeService(businessId);
    this._leaveTypeService = new LeaveTypeServices(businessId);
  }

  async _ensureRefModels() {
    if (this._refsReady) return;
    // Warm-up referenced models on the same tenant connection so populate works
    await Promise.all([
      this._storeService.getModelRef(),
      this._employeeService.getModelRef(),
      this._leaveTypeService.getModelRef(),
    ]).catch(() => { });
    this._refsReady = true;
  }

  /**
   * Validates leave request data against business rules
   * @private
   * @param {Object} data - Leave request data
   * @param {string} data.storeId - Store identifier
   * @param {string} data.employeeId - Employee identifier
   * @param {string} data.leaveTypeId - Leave type identifier
   * @param {Date} data.startDate - Leave start date
   * @param {Date} data.endDate - Leave end date
   * @param {boolean} data.isHalfDay - Whether it's a half-day leave
   * @param {string} data.reason - Leave reason
   * @throws {Error} If validation fails
   */
  async _validateLeaveRequestData(data) {
    const {
      storeId,
      employeeId,
      leaveTypeId,
      startDate,
      endDate,
      isHalfDay,
      reason,
    } = data;

    // Validate required fields
    this.validateRequiredFields(data, [
      'storeId',
      'employeeId',
      'leaveTypeId',
      'startDate',
      'endDate',
      'reason',
    ]);

    // Validate ObjectIds
    this.validateObjectId(storeId);
    this.validateObjectId(employeeId);
    this.validateObjectId(leaveTypeId);

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (start < today) {
      throw new Error('Start date cannot be in the past');
    }

    if (end < today) {
      throw new Error('End date cannot be in the past');
    }

    if (isHalfDay && start.getTime() !== end.getTime()) {
      throw new Error(
        'For half-day leave, start date and end date must be the same',
      );
    }

    if (!isHalfDay && end < start) {
      throw new Error('End date cannot be before start date');
    }

    // Validate reason length
    if (reason.trim().length < 10) {
      throw new Error('Reason must be at least 10 characters long');
    }

    if (reason.trim().length > 500) {
      throw new Error('Reason cannot exceed 500 characters');
    }
  }

  /**
   * Validates employee belongs to the specified store
   * @private
   * @param {string} employeeId - Employee identifier
   * @param {string} storeId - Store identifier
   * @throws {Error} If employee doesn't belong to store
   */
  async _validateEmployeeStoreRelationship(employeeId, storeId) {
    const Employee = await this._employeeService.getModelRef();

    const employee = await Employee.findById(employeeId).select('store').lean();

    if (!employee) {
      throw new Error('Employee does not exist');
    }

    if (employee.store && employee.store.toString() !== storeId.toString()) {
      throw new Error('Employee does not belong to the specified store');
    }
  }

  /**
   * Validates that a user can only create leave for themselves
   * @private
   * @param {string} userId - User identifier
   * @param {string} employeeId - Employee identifier
   * @throws {Error} If user is not the employee
   */
  async validateEmployeeSelfAccess(userId, employeeId) {
    const EmployeeModel = await this._employeeService.getModelRef();
    const employee = await EmployeeModel.findOne({ user: userId }).lean();

    if (!employee) {
      throw new Error('Employee record not found for user');
    }

    if (employee._id.toString() !== employeeId.toString()) {
      throw new Error('You can only create leave requests for yourself');
    }

    return true;
  }

  /**
   * Validates leave type exists and is active
   * @private
   * @param {string} leaveTypeId - Leave type identifier
   * @throws {Error} If leave type is invalid or inactive
   */
  async _validateLeaveType(leaveTypeId) {
    const LeaveType = await this._leaveTypeService.getModelRef();

    const leaveType = await LeaveType.findById(leaveTypeId)
      .select('status name')
      .lean();

    if (!leaveType) {
      throw new Error('Leave type does not exist');
    }

    if (!leaveType.status) {
      throw new Error('Leave type is not active');
    }
  }

  /**
   * Validates that a manager can manage the specified store
   * @private
   * @param {string} managerId - Manager user ID
   * @param {string} storeId - Store ID to validate
   * @throws {Error} If manager doesn't have access to store
   */
  async _validateManagerStoreAccess(managerId, storeId) {
    const Employee = await this._employeeService.getModelRef();

    const managerEmployee = await Employee.findOne({
      user: managerId,
      store: storeId,
      designation: 'manager',
      isActive: true,
    })
      .select('_id')
      .lean();

    if (!managerEmployee) {
      throw new Error(
        'You can only manage leave requests for stores where you are assigned as manager',
      );
    }
  }

  /**
   * Gets stores where a manager has access
   * @private
   * @param {string} managerId - Manager user ID
   * @returns {Array} Array of store IDs where manager has access
   */
  async _getManagerStores(managerId) {
    const Employee = await this._employeeService.getModelRef();

    const managerStores = await Employee.find({
      user: managerId,
      designation: 'manager',
      isActive: true,
    })
      .select('store')
      .lean();

    return managerStores.map((emp) => emp.store);
  }

  /**
   * Checks for overlapping leave requests
   * @private
   * @param {string} employeeId - Employee identifier
   * @param {Date} startDate - Leave start date
   * @param {Date} endDate - Leave end date
   * @param {string} excludeId - Leave request ID to exclude from check
   * @throws {Error} If overlapping leave exists
   */
  async _checkForOverlappingLeaves(
    employeeId,
    startDate,
    endDate,
    excludeId = null,
  ) {
    const LeaveManage = await this.getModelRef();
    const query = {
      businessId: this.businessId,
      employeeId,
      // Only consider overlaps with already approved leaves
      status: 'approved',
      $or: [
        {
          startDate: { $lte: endDate },
          endDate: { $gte: startDate },
        },
      ],
    };

    if (excludeId) {
      query._id = { $ne: excludeId };
    }

    const existingLeave = await LeaveManage.findOne(query)
      .select('_id startDate endDate status')
      .lean();

    if (existingLeave) {
      throw new Error('Already applied for the leave');
    }
  }

  /**
   * Creates a new leave request
   * @param {Object} data - Leave request data
   * @param {string} userId - User creating the request
   * @returns {Object} Created leave request with populated fields
   * @throws {Error} If creation fails
   */
  async createLeaveRequest(data, userId, userRole = null) {
    try {
      await this._ensureRefModels();
      // Need to validate data before using it
      await this._validateLeaveRequestData(data);

      // For cashier/manager, validate they can only create leave for themselves
      if (userRole === 'cashier' || userRole === 'manager') {
        await this.validateEmployeeSelfAccess(userId, data.employeeId);
      }

      await this._validateEmployeeStoreRelationship(
        data.employeeId,
        data.storeId,
      );
      await this._validateLeaveType(data.leaveTypeId);
      await this._checkForOverlappingLeaves(
        data.employeeId,
        data.startDate,
        data.endDate,
      );

      const leaveRequestData = {
        ...data,
        businessId: this.businessId,
        createdBy: userId,
        status: 'pending',
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
      };

      const leaveRequest = await this.create(leaveRequestData);

      const LeaveManage = await this.getModelRef();
      const populated = await LeaveManage.findById(leaveRequest._id)
        .populate('storeId', 'name address phone')
        .populate({
          path: 'employeeId',
          select: 'user designation joinDate isActive',
          populate: {
            path: 'user',
            select: 'name email phone profilePicture',
            model: mongoose.model('User'),
          },
        })
        .populate('leaveTypeId', 'name type paidCount status description')
        .populate({ path: 'createdBy', select: 'name email', model: mongoose.model('User') })
        .populate({
          path: 'approvedBy',
          select: 'name email',
          model: mongoose.model('User'),
        })
        .lean({ virtuals: true });
      return populated;
    } catch (error) {
      throw new Error(`Failed to create leave request: ${error.message}`);
    }
  }

  /**
   * Creates an approved leave request (Admin/Manager only)
   * @param {Object} data - Leave request data
   * @param {string} userId - Admin/Manager user ID
   * @param {string} userRole - User role for permission checking
   * @returns {Object} Created approved leave request
   * @throws {Error} If creation fails
   */
  async createApprovedLeave(data, userId, userRole) {
    try {
      await this._ensureRefModels();
      console.log('[LeaveManageService.createApprovedLeave] entry', {
        businessId: this.businessId,
        userId,
        userRole,
        payload: {
          storeId: data?.storeId,
          employeeId: data?.employeeId,
          leaveTypeId: data?.leaveTypeId,
          isHalfDay: data?.isHalfDay,
          hasReason: Boolean(data?.reason),
          hasDates: Boolean(data?.startDate) && Boolean(data?.endDate),
        },
      });
      // Validate permissions
      if (userRole !== 'admin' && userRole !== 'manager') {
        throw new Error(
          'Only admins and managers can create approved leave requests',
        );
      }

      // If manager, validate they can manage this store
      if (userRole === 'manager') {
        await this._validateManagerStoreAccess(userId, data.storeId);
      }

      await this._validateLeaveRequestData(data);
      await this._validateEmployeeStoreRelationship(
        data.employeeId,
        data.storeId,
      );
      await this._validateLeaveType(data.leaveTypeId);
      await this._checkForOverlappingLeaves(
        data.employeeId,
        data.startDate,
        data.endDate,
      );

      const leaveRequestData = {
        ...data,
        businessId: this.businessId,
        createdBy: userId,
        approvedBy: userId,
        approvedAt: new Date(),
        status: 'approved',
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
      };

      const leaveRequest = await this.create(leaveRequestData);

      const LeaveManage = await this.getModelRef();
      const populated = await LeaveManage.findById(leaveRequest._id)
        .populate('storeId', 'name address phone')
        .populate({
          path: 'employeeId',
          select: 'user designation joinDate isActive',
          populate: {
            path: 'user',
            select: 'name email phone profilePicture',
            model: mongoose.model('User'),
          },
        })
        .populate('leaveTypeId', 'name type paidCount status description')
        .populate({ path: 'createdBy', select: 'name email', model: mongoose.model('User') })
        .populate({
          path: 'approvedBy',
          select: 'name email',
          model: mongoose.model('User'),
        })
        .lean({ virtuals: true });
      console.log('[LeaveManageService.createApprovedLeave] success', {
        leaveId: populated?._id,
        status: populated?.status,
        employeeId: populated?.employeeId?._id || data?.employeeId,
        storeId: populated?.storeId?._id || data?.storeId,
      });
      return populated;
    } catch (error) {
      console.log('[LeaveManageService.createApprovedLeave] error', {
        message: error?.message,
        name: error?.name,
        stack: error?.stack,
      });
      throw new Error(`Failed to create approved leave: ${error.message}`);
    }
  }

  /**
   * Updates an existing leave request
   * @param {string} leaveId - Leave request ID
   * @param {Object} data - Update data
   * @param {string} userId - User making the update
   * @param {string} userRole - User role for permission checking
   * @returns {Object} Updated leave request
   * @throws {Error} If update fails
   */
  async updateLeaveRequest(leaveId, data, userId, userRole) {
    try {
      await this._ensureRefModels();
      this.validateObjectId(leaveId);

      const leaveRequest = await this.getById(leaveId);

      // Check permissions
      if (userRole === 'admin') {
        // Admin can update any leave request
      } else if (userRole === 'manager') {
        // Manager can update leave requests for employees in their managed stores
        await this._validateManagerStoreAccess(userId, leaveRequest.storeId);
      } else if (leaveRequest.createdBy.toString() !== userId.toString()) {
        throw new Error('You can only update your own leave requests');
      }

      // Check if leave can be updated
      if (
        leaveRequest.status === 'approved' &&
        userRole !== 'admin' &&
        userRole !== 'manager'
      ) {
        throw new Error('Cannot update approved leave request');
      }

      // if (leaveRequest.status === 'rejected') {
      //   throw new Error('Cannot update rejected leave request');
      // }

      // Validate updated data if dates or employee changed
      if (
        data.startDate ||
        data.endDate ||
        data.employeeId ||
        data.leaveTypeId
      ) {
        const updateData = { ...leaveRequest.toObject(), ...data };
        await this._validateLeaveRequestData(updateData);

        if (data.employeeId) {
          await this._validateEmployeeStoreRelationship(
            data.employeeId,
            updateData.storeId,
          );
        }

        if (data.leaveTypeId) {
          await this._validateLeaveType(data.leaveTypeId);
        }

        if (data.startDate || data.endDate) {
          await this._checkForOverlappingLeaves(
            updateData.employeeId,
            new Date(updateData.startDate),
            new Date(updateData.endDate),
            leaveId,
          );
        }
      }

      // Convert dates if provided
      if (data.startDate) {
        data.startDate = new Date(data.startDate);
      }
      if (data.endDate) {
        data.endDate = new Date(data.endDate);
      }

      data.updatedBy = userId;
      const updatedLeave = await this.updateById(leaveId, data);

      const LeaveManage = await this.getModelRef();
      const populated = await LeaveManage.findById(updatedLeave._id)
        .populate('storeId', 'name address phone')
        .populate({
          path: 'employeeId',
          select: 'user designation joinDate isActive',
          populate: {
            path: 'user',
            select: 'name email phone profilePicture',
            model: mongoose.model('User'),
          },
        })
        .populate('leaveTypeId', 'name type paidCount status description')
        .populate({ path: 'createdBy', select: 'name email', model: mongoose.model('User') })
        .populate({
          path: 'approvedBy',
          select: 'name email',
          model: mongoose.model('User'),
        })
        .lean({ virtuals: true });
      return populated;
    } catch (error) {
      console.log(error)
      throw new Error(`Failed to update leave request: ${error.message}`);
    }
  }

  /**
   * Cancels a leave request
   * @param {string} leaveId - Leave request ID
   * @param {string} userId - User cancelling the request
   * @param {string} userRole - User role for permission checking
   * @returns {Object} Cancelled leave request
   * @throws {Error} If cancellation fails
   */
  async cancelLeaveRequest(leaveId, userId, userRole) {
    try {
      await this._ensureRefModels();
      this.validateObjectId(leaveId);

      const leaveRequest = await this.getById(leaveId);

      // Check permissions
      if (userRole === 'admin') {
        // Admin can cancel any leave request
      } else if (userRole === 'manager') {
        // Manager can cancel leave requests for employees in their managed stores
        await this._validateManagerStoreAccess(userId, leaveRequest.storeId);
      } else if (leaveRequest.createdBy.toString() !== userId.toString()) {
        throw new Error('You can only cancel your own leave requests');
      }

      // Check if leave can be cancelled
      if (!leaveRequest.canBeCancelled()) {
        throw new Error('This leave request cannot be cancelled');
      }

      const updatedLeave = await this.updateById(leaveId, {
        status: 'cancelled',
        updatedBy: userId,
      });

      const LeaveManage = await this.getModelRef();
      const populated = await LeaveManage.findById(updatedLeave._id)
        .populate('storeId', 'name address phone')
        .populate({
          path: 'employeeId',
          select: 'user designation joinDate isActive',
          populate: {
            path: 'user',
            select: 'name email phone profilePicture',
            model: mongoose.model('User'),
          },
        })
        .populate('leaveTypeId', 'name type paidCount status description')
        .populate({ path: 'createdBy', select: 'name email', model: mongoose.model('User') })
        .populate({
          path: 'approvedBy',
          select: 'name email',
          model: mongoose.model('User'),
        })
        .lean({ virtuals: true });
      return populated;
    } catch (error) {
      throw new Error(`Failed to cancel leave request: ${error.message}`);
    }
  }

  /**
   * Approves a leave request (Admin/Manager only)
   * @param {string} leaveId - Leave request ID
   * @param {string} userId - Admin/Manager user ID
   * @param {string} userRole - User role for permission checking
   * @returns {Object} Approved leave request
   * @throws {Error} If approval fails
   */
  async approveLeaveRequest(leaveId, userId, userRole) {
    try {
      await this._ensureRefModels();
      this.validateObjectId(leaveId);

      // Validate permissions
      if (userRole !== 'admin' && userRole !== 'manager') {
        throw new Error('Only admins and managers can approve leave requests');
      }

      const leaveRequest = await this.getById(leaveId);

      // If manager, validate they can manage this store
      if (userRole === 'manager') {
        await this._validateManagerStoreAccess(userId, leaveRequest.storeId);
      }

      if (!leaveRequest.canBeApproved()) {
        throw new Error('This leave request cannot be approved');
      }

      // Ensure no overlap with other approved leaves for this employee
      await this._checkForOverlappingLeaves(
        leaveRequest.employeeId,
        new Date(leaveRequest.startDate),
        new Date(leaveRequest.endDate),
        leaveId,
      );

      const updatedLeave = await this.updateById(leaveId, {
        status: 'approved',
        approvedBy: userId,
        approvedAt: new Date(),
        updatedBy: userId,
      });

      const LeaveManage = await this.getModelRef();
      const populated = await LeaveManage.findById(updatedLeave._id)
        .populate('storeId', 'name address phone')
        .populate({
          path: 'employeeId',
          select: 'user designation joinDate isActive',
          populate: {
            path: 'user',
            select: 'name email phone profilePicture',
            model: mongoose.model('User'),
          },
        })
        .populate('leaveTypeId', 'name type paidCount status description')
        .populate({ path: 'createdBy', select: 'name email', model: mongoose.model('User') })
        .populate({
          path: 'approvedBy',
          select: 'name email',
          model: mongoose.model('User'),
        });
      return populated;
    } catch (error) {
      throw new Error(`Failed to approve leave request: ${error.message}`);
    }
  }

  /**
   * Rejects a leave request (Admin/Manager only)
   * @param {string} leaveId - Leave request ID
   * @param {string} userId - Admin/Manager user ID
   * @param {string} userRole - User role for permission checking
   * @param {string} rejectionReason - Reason for rejection
   * @returns {Object} Rejected leave request
   * @throws {Error} If rejection fails
   */
  async rejectLeaveRequest(leaveId, userId, userRole, rejectionReason) {
    try {
      await this._ensureRefModels();
      this.validateObjectId(leaveId);

      // Validate permissions
      if (userRole !== 'admin' && userRole !== 'manager') {
        throw new Error('Only admins and managers can reject leave requests');
      }

      if (!rejectionReason || rejectionReason.trim().length === 0) {
        throw new Error('Rejection reason is required');
      }

      if (rejectionReason.trim().length > 500) {
        throw new Error('Rejection reason cannot exceed 500 characters');
      }

      const leaveRequest = await this.getById(leaveId);

      // If manager, validate they can manage this store
      if (userRole === 'manager') {
        await this._validateManagerStoreAccess(userId, leaveRequest.storeId);
      }

      if (!leaveRequest.canBeRejected()) {
        throw new Error('This leave request cannot be rejected');
      }

      const updatedLeave = await this.updateById(leaveId, {
        status: 'rejected',
        approvedBy: userId,
        approvedAt: new Date(),
        rejectionReason: rejectionReason.trim(),
        updatedBy: userId,
      });

      const LeaveManage = await this.getModelRef();
      const populated = await LeaveManage.findById(updatedLeave._id)
        .populate('storeId', 'name address phone')
        .populate({
          path: 'employeeId',
          select: 'user designation joinDate isActive',
          populate: {
            path: 'user',
            select: 'name email phone profilePicture',
            model: mongoose.model('User'),
          },
        })
        .populate('leaveTypeId', 'name type paidCount status description')
        .populate({ path: 'createdBy', select: 'name email', model: mongoose.model('User') })
        .populate({
          path: 'approvedBy',
          select: 'name email',
          model: mongoose.model('User'),
        });
      return populated;
    } catch (error) {
      throw new Error(`Failed to reject leave request: ${error.message}`);
    }
  }

  /**
   * Gets all leave requests with advanced filtering and pagination
   * @param {Object} options - Query options
   * @param {string} [options.isActive] - Filter by status (maps to status field)
   * @param {string} [options.leaveTypeId] - Filter by leave type
   * @param {string} [options.storeId] - Filter by store
   * @param {string} [options.employeeId] - Filter by employee
   * @param {string} [options.startDate] - Filter by start date
   * @param {string} [options.endDate] - Filter by end date
   * @param {boolean} [options.all=false] - If true, fetch all data without pagination
   * @param {number} [options.page=1] - Page number
   * @param {number} [options.limit=10] - Items per page
   * @param {string} [options.sortBy=createdAt] - Sort field
   * @param {string} [options.sortOrder=desc] - Sort order (asc/desc)
   * @param {string} [options.userId] - User ID for permission checking
   * @param {string} [options.userRole] - User role for permission checking
   * @returns {Object} Paginated leave requests
   * @throws {Error} f retrieval fails
   */
  async getAllLeaveRequests(options = {}) {
    try {
      await this._ensureRefModels();
      const {
        isActive,
        leaveTypeId,
        storeId,
        employeeId,
        startDate,
        endDate,
        all = false,
        page = 1,
        limit = 10,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        userId,
        userRole,
        status,
        search,
      } = options;

      // Build filter object
      const filter = { businessId: this.businessId };

      // Handle role-based access control
      if (userRole === 'cashier' && userId) {
        // Cashier: Can only see their own leave requests
        try {
          const Employee = await this._employeeService.getModelRef();
          const employee = await Employee.findOne({ user: userId })
            .select('_id')
            .lean();
          if (employee) {
            filter.employeeId = employee._id;
          } else {
            // Employee not found - return empty results
            return {
              data: [],
              pagination: {
                currentPage: 1,
                totalPages: 0,
                totalItems: 0,
                itemsPerPage: parseInt(limit) || 10,
                hasNext: false,
                hasPrev: false,
              },
            };
          }
        } catch (error) {
          return {
            data: [],
            pagination: {
              currentPage: 1,
              totalPages: 0,
              totalItems: 0,
              itemsPerPage: parseInt(limit) || 10,
              hasNext: false,
              hasPrev: false,
            },
          };
        }
      } else if (userRole === 'manager' && userId) {
        // Manager: Can see leave requests from stores they manage
        const managerStores = await this._getManagerStores(userId);
        if (managerStores.length === 0) {
          return {
            data: [],
            pagination: {
              currentPage: 1,
              totalPages: 0,
              totalItems: 0,
              itemsPerPage: parseInt(limit) || 10,
              hasNext: false,
              hasPrev: false,
            },
          };
        }
        if (storeId) {
          this.validateObjectId(storeId);
          if (!managerStores.some((store) => store.toString() === storeId.toString())) {
            throw new Error('You can only access leave requests for stores you manage');
          }
          filter.storeId = storeId;
        } else {
          filter.storeId = { $in: managerStores };
        }
      } else if (storeId) {
        // Admin/Superadmin: Can filter by store if provided
        this.validateObjectId(storeId);
        filter.storeId = storeId;
      }

      // Apply filters
      if (isActive !== undefined && isActive !== null) {
        filter.status = isActive;
      }

      if (status) {
        const validStatuses = ['pending', 'approved', 'rejected', 'cancelled'];
        if (typeof status === 'string' && status.includes(',')) {
          const statusArray = status.split(',').map((s) => s.trim()).filter((s) => validStatuses.includes(s));
          if (statusArray.length > 0) filter.status = { $in: statusArray };
        } else if (validStatuses.includes(status)) {
          filter.status = status;
        }
      }

      if (leaveTypeId) {
        this.validateObjectId(leaveTypeId);
        filter.leaveTypeId = leaveTypeId;
      }

      if (employeeId) {
        this.validateObjectId(employeeId);
        filter.employeeId = employeeId;
      }

      if (startDate && endDate) {
        filter.startDate = { $gte: new Date(startDate) };
        filter.endDate = { $lte: new Date(endDate) };
      } else if (startDate) {
        filter.startDate = { $gte: new Date(startDate) };
      } else if (endDate) {
        filter.endDate = { $lte: new Date(endDate) };
      }

      // Build sort object
      const sort = {};
      const validSortFields = ['createdAt', 'startDate', 'endDate', 'status', 'leaveTypeId', 'employeeId', 'storeId'];
      sort[validSortFields.includes(sortBy) ? sortBy : 'createdAt'] = sortOrder === 'asc' ? 1 : -1;

      // Validate and calculate pagination
      const validatedPage = all ? 1 : Math.max(1, parseInt(page) || 1);
      const validatedLimit = all ? 0 : Math.max(1, parseInt(limit) || 10);
      const skip = all ? 0 : (validatedPage - 1) * validatedLimit;

      const Model = await this.getModelRef();

      // Handle search - add search conditions for direct fields
      if (search && typeof search === 'string' && search.trim()) {
        const escapedSearch = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        filter.$or = [
          { status: { $regex: escapedSearch, $options: 'i' } },
          { reason: { $regex: escapedSearch, $options: 'i' } },
          { rejectionReason: { $regex: escapedSearch, $options: 'i' } },
        ];
      }

      // Build query
      let queryBuilder = Model.find(filter).sort(sort).lean({ virtuals: true });

      if (!all) {
        queryBuilder = queryBuilder.skip(skip).limit(validatedLimit);
      }

      // Add populate
      queryBuilder = queryBuilder
        .populate({
          path: 'employeeId',
          select: 'user designation joinDate isActive',
          populate: {
            path: 'user',
            select: 'name email phone profilePicture',
            model: mongoose.model('User'),
          },
        })
        .populate({ path: 'createdBy', select: 'name email', model: mongoose.model('User') })
        .populate({ path: 'approvedBy', select: 'name email', model: mongoose.model('User') })
        .populate({ path: 'storeId', select: 'name' })
        .populate({ path: 'leaveTypeId', select: 'name type' });

      // Execute query and count in parallel
      const [documents, total] = await Promise.all([
        queryBuilder.exec(),
        Model.countDocuments(filter),
      ]);

      const itemsPerPage = all ? total : validatedLimit;

      return {
        data: documents,
        pagination: {
          currentPage: validatedPage,
          totalPages: itemsPerPage > 0 ? Math.ceil(total / itemsPerPage) : 0,
          totalItems: total,
          itemsPerPage: itemsPerPage,
          hasNext: !all && validatedPage * validatedLimit < total,
          hasPrev: validatedPage > 1,
        },
      };
    } catch (error) {
      throw new Error(`Failed to retrieve leave requests: ${error.message}`);
    }
  }

  /**
   * Gets leave requests for a specific user (their own requests)
   * @param {string} userId - User identifier
   * @param {Object} options - Query options
   * @param {string} [options.status] - Filter by status
   * @param {string} [options.startDate] - Filter by start date
   * @param {string} [options.endDate] - Filter by end date
   * @param {number} [options.page=1] - Page number
   * @param {number} [options.limit=10] - Items per page
   * @returns {Object} Paginated leave requests
   * @throws {Error} If retrieval fails
   */
  async getMyLeaveRequests(userId, options = {}) {
    try {
      await this._ensureRefModels();
      const Employee = await this._employeeService.getModelRef();
      const employee = await Employee.findOne({ user: userId })
        .select('_id')
        .lean();

      if (!employee) {
        throw new Error('Employee record not found');
      }

      return await this.getLeaveRequestsByEmployee(employee._id, options);
    } catch (error) {
      throw new Error(`Failed to retrieve leave requests: ${error.message}`);
    }
  }

  /**
   * Gets all leave requests for a specific employee
   * @param {string} employeeId - Employee identifier
   * @param {Object} options - Query options
   * @returns {Object} Paginated leave requests
   */
  async getLeaveRequestsByEmployee(employeeId, options = {}) {
    const {
      status,
      startDate,
      endDate,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = options;

    const query = {
      businessId: this.businessId,
      employeeId
    };

    if (status) {
      query.status = status;
    }

    if (startDate && endDate) {
      query.startDate = { $gte: new Date(startDate) };
      query.endDate = { $lte: new Date(endDate) };
    }

    const LeaveManage = await this.getModelRef();
    const skip = (page - 1) * limit;

    const sortObj = {};
    sortObj[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const [leaveRequests, totalCount] = await Promise.all([
      LeaveManage.find(query)
        .sort(sortObj)
        .skip(skip)
        .limit(limit)
        .populate('storeId', 'name address phone')
        .populate({
          path: 'employeeId',
          select: 'user designation joinDate isActive',
          populate: {
            path: 'user',
            select: 'name email phone profilePicture',
            model: mongoose.model('User')
          }
        })
        .populate('leaveTypeId', 'name type paidCount status description')
        .populate({ path: 'createdBy', select: 'name email', model: mongoose.model('User') })
        .populate({
          path: 'approvedBy',
          select: 'name email',
          model: mongoose.model('User')
        })
        .lean({ virtuals: true }),
      LeaveManage.countDocuments(query)
    ]);

    return {
      data: leaveRequests,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      }
    };
  }

  /**
   * Gets all leave requests for stores managed by a manager
   * @param {string} managerId - Manager user ID
   * @param {Object} options - Query options
   * @param {string} [options.status] - Filter by status
   * @param {string} [options.startDate] - Filter by start date
   * @param {string} [options.endDate] - Filter by end date
   * @param {string} [options.storeId] - Filter by specific store
   * @param {number} [options.page=1] - Page number
   * @param {number} [options.limit=10] - Items per page
   * @returns {Object} Paginated leave requests
   * @throws {Error} If retrieval fails
   */
  async getManagerLeaveRequests(managerId, options = {}) {
    try {
      await this._ensureRefModels();
      const {
        status,
        startDate,
        endDate,
        storeId,
        page = 1,
        limit = 10,
      } = options;

      // Get stores managed by this manager
      const managerStores = await this._getManagerStores(managerId);

      if (managerStores.length === 0) {
        return {
          data: [],
          pagination: {
            page: 1,
            limit: 10,
            total: 0,
            pages: 0,
          },
        };
      }

      // If specific store is requested, validate manager has access
      let targetStores = managerStores;
      if (storeId) {
        this.validateObjectId(storeId);
        if (
          !managerStores.some(
            (store) => store.toString() === storeId.toString(),
          )
        ) {
          throw new Error(
            'You can only access leave requests for stores you manage',
          );
        }
        targetStores = [storeId];
      }

      const query = {
        businessId: this.businessId,
        storeId: { $in: targetStores },
      };

      if (status) {
        query.status = status;
      }

      if (startDate && endDate) {
        query.startDate = { $gte: new Date(startDate) };
        query.endDate = { $lte: new Date(endDate) };
      }

      // Use direct query with proper population
      const LeaveManage = await this.getModelRef();
      const skip = (page - 1) * limit;

      const [leaveRequests, totalCount] = await Promise.all([
        LeaveManage.find(query)
          .populate('storeId', 'name address phone')
          .populate({
            path: 'employeeId',
            select: 'user designation joinDate isActive',
            populate: {
              path: 'user',
              select: 'name email phone profilePicture',
              model: mongoose.model('User'),
            },
          })
          .populate('leaveTypeId', 'name type paidCount status description')
          .populate({
            path: 'createdBy',
            select: 'name email',
            model: mongoose.model('User'),
          })
          .populate({
            path: 'approvedBy',
            select: 'name email',
            model: mongoose.model('User'),
          })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        LeaveManage.countDocuments(query),
      ]);

      return {
        data: leaveRequests,
        pagination: {
          page,
          limit,
          total: totalCount,
          pages: Math.ceil(totalCount / limit),
        },
      };
    } catch (error) {
      throw new Error(
        `Failed to retrieve manager leave requests: ${error.message}`,
      );
    }
  }

  /**
   * Gets pending leave requests for all stores managed by a manager
   * @param {string} managerId - Manager user ID
   * @param {Object} options - Query options
   * @param {string} [options.storeId] - Filter by specific store
   * @param {number} [options.page=1] - Page number
   * @param {number} [options.limit=10] - Items per page
   * @returns {Object} Paginated pending leave requests
   * @throws {Error} If retrieval fails
   */
  async getManagerPendingLeaveRequests(managerId, options = {}) {
    try {
      await this._ensureRefModels();
      const { storeId, page = 1, limit = 10 } = options;

      // Get stores managed by this manager
      const managerStores = await this._getManagerStores(managerId);

      if (managerStores.length === 0) {
        return {
          data: [],
          pagination: {
            page: 1,
            limit: 10,
            total: 0,
            pages: 0,
          },
        };
      }

      // If specific store is requested, validate manager has access
      let targetStores = managerStores;
      if (storeId) {
        this.validateObjectId(storeId);
        if (
          !managerStores.some(
            (store) => store.toString() === storeId.toString(),
          )
        ) {
          throw new Error(
            'You can only access pending leave requests for stores you manage',
          );
        }
        targetStores = [storeId];
      }

      const query = {
        businessId: this.businessId,
        storeId: { $in: targetStores },
        status: 'pending',
      };

      // Use direct query with proper population
      const LeaveManage = await this.getModelRef();
      const skip = (page - 1) * limit;

      const [leaveRequests, totalCount] = await Promise.all([
        LeaveManage.find(query)
          .populate('storeId', 'name address phone')
          .populate({
            path: 'employeeId',
            select: 'user designation joinDate isActive',
            populate: {
              path: 'user',
              select: 'name email phone profilePicture',
              model: mongoose.model('User'),
            },
          })
          .populate('leaveTypeId', 'name type paidCount status description')
          .populate({
            path: 'createdBy',
            select: 'name email',
            model: mongoose.model('User'),
          })
          .populate({
            path: 'approvedBy',
            select: 'name email',
            model: mongoose.model('User'),
          })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        LeaveManage.countDocuments(query),
      ]);

      return {
        data: leaveRequests,
        pagination: {
          page,
          limit,
          total: totalCount,
          pages: Math.ceil(totalCount / limit),
        },
      };
    } catch (error) {
      throw new Error(
        `Failed to retrieve manager pending leave requests: ${error.message}`,
      );
    }
  }
}

export default LeaveManageService;
