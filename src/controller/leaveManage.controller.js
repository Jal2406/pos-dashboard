import {
  LeaveManageService,
  EmployeeService,
  StoreService,
  LeaveTypeServices,
} from '../services/index.js';
import { ResponseService } from '../utils/index.js';
import { StatusCodes } from 'http-status-codes';

/**
 * Leave Management Controller
 *
 * Handles HTTP requests for leave management operations with proper error handling,
 * validation, and response formatting.
 *
 * @class LeaveManageController
 */
class LeaveManageController {
  /**
   * Creates a new leave request (Cashier/Manager)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  async createLeaveRequest(req, res) {
    try {
      const {
        storeId,
        employeeId,
        leaveTypeId,
        startDate,
        endDate,
        isHalfDay,
        reason,
      } = req.body;
      const userId = req.user.id;
      const userRole = req.user.role;
      const businessId = req.user.businessId || req.businessId;

      // Validate required fields
      if (
        !storeId ||
        !employeeId ||
        !leaveTypeId ||
        !startDate ||
        !endDate ||
        !reason
      ) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'All required fields must be provided',
        );
      }

      const leaveService = new LeaveManageService(businessId);
      const leaveRequest = await leaveService.createLeaveRequest(
        {
          storeId,
          employeeId,
          leaveTypeId,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          isHalfDay: isHalfDay || false,
          reason,
        },
        userId,
        userRole,
      );

      return ResponseService.send(
        res,
        StatusCodes.CREATED,
        'Leave request created successfully',
        leaveRequest,
      );
    } catch (error) {
      // console.error('Create leave request error:', error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to create leave request',
      );
    }
  }

  /**
   * Creates an approved leave for employee (Admin/Manager only)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  async createApprovedLeave(req, res) {
    try {
      const {
        storeId,
        employeeId,
        leaveTypeId,
        startDate,
        endDate,
        isHalfDay,
        reason,
      } = req.body;
      const userId = req.user.id;
      const userRole = req.user.role;
      const businessId = req.user.businessId || req.businessId;

      // Validate required fields
      if (
        !storeId ||
        !employeeId ||
        !leaveTypeId ||
        !startDate ||
        !endDate ||
        !reason
      ) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'All required fields must be provided',
        );
      }

      const leaveService = new LeaveManageService(businessId);
      const leaveRequest = await leaveService.createApprovedLeave(
        {
          storeId,
          employeeId,
          leaveTypeId,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          isHalfDay: isHalfDay || false,
          reason,
        },
        userId,
        userRole,
      );
      return ResponseService.send(
        res,
        StatusCodes.CREATED,
        'Approved leave created successfully',
        leaveRequest,
      );
    } catch (error) {
      console.log(error);

      let statusCode = StatusCodes.BAD_REQUEST;
      if (
        error.message.includes('permission') ||
        error.message.includes('manage')
      ) {
        statusCode = StatusCodes.FORBIDDEN;
      }

      return ResponseService.send(
        res,
        statusCode,
        error.message || 'Failed to create approved leave',
      );
    }
  }

  /**
   * Updates an existing leave request
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  async updateLeaveRequest(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const userId = req.user.id;
      const userRole = req.user.role;
      const businessId = req.user.businessId || req.businessId;

      // Convert date strings to Date objects if provided
      if (updateData.startDate) {
        updateData.startDate = new Date(updateData.startDate);
      }
      if (updateData.endDate) {
        updateData.endDate = new Date(updateData.endDate);
      }

      const leaveService = new LeaveManageService(businessId);
      const leaveRequest = await leaveService.updateLeaveRequest(
        id,
        updateData,
        userId,
        userRole,
      );

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Leave request updated successfully',
        leaveRequest,
      );
    } catch (error) {
      console.error('Update leave request error:', error);

      let statusCode = StatusCodes.BAD_REQUEST;
      if (error.message.includes('not found')) {
        statusCode = StatusCodes.NOT_FOUND;
      } else if (
        error.message.includes('permission') ||
        error.message.includes('Access denied')
      ) {
        statusCode = StatusCodes.FORBIDDEN;
      }

      return ResponseService.send(
        res,
        statusCode,
        error.message || 'Failed to update leave request',
      );
    }
  }

  /**
   * Cancels a leave request
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  async cancelLeaveRequest(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const userRole = req.user.role;
      const businessId = req.user.businessId || req.businessId;

      const leaveService = new LeaveManageService(businessId);
      const leaveRequest = await leaveService.cancelLeaveRequest(
        id,
        userId,
        userRole,
      );

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Leave request cancelled successfully',
        leaveRequest,
      );
    } catch (error) {
      // console.error('Cancel leave request error:', error);

      let statusCode = StatusCodes.BAD_REQUEST;
      if (error.message.includes('not found')) {
        statusCode = StatusCodes.NOT_FOUND;
      } else if (
        error.message.includes('permission') ||
        error.message.includes('Access denied')
      ) {
        statusCode = StatusCodes.FORBIDDEN;
      }

      return ResponseService.send(
        res,
        statusCode,
        error.message || 'Failed to cancel leave request',
      );
    }
  }

  /**
   * Approves a leave request (Admin/Manager only)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  async approveLeaveRequest(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const userRole = req.user.role;
      const businessId = req.user.businessId || req.businessId;

      const leaveService = new LeaveManageService(businessId);
      const leaveRequest = await leaveService.approveLeaveRequest(
        id,
        userId,
        userRole,
      );

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Leave request approved successfully',
        leaveRequest,
      );
    } catch (error) {
      let statusCode = StatusCodes.BAD_REQUEST;
      if (error.message.includes('not found')) {
        statusCode = StatusCodes.NOT_FOUND;
      } else if (
        error.message.includes('permission') ||
        error.message.includes('manage')
      ) {
        statusCode = StatusCodes.FORBIDDEN;
      }

      return ResponseService.send(
        res,
        statusCode,
        error.message || 'Failed to approve leave request',
      );
    }
  }

  /**
   * Rejects a leave request (Admin/Manager only)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  async rejectLeaveRequest(req, res) {
    try {
      const { id } = req.params;
      const { rejectionReason } = req.body;
      const userId = req.user.id;
      const userRole = req.user.role;
      const businessId = req.user.businessId || req.businessId;

      if (!rejectionReason) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Rejection reason is required',
        );
      }

      const leaveService = new LeaveManageService(businessId);
      const leaveRequest = await leaveService.rejectLeaveRequest(
        id,
        userId,
        userRole,
        rejectionReason,
      );

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Leave request rejected successfully',
        leaveRequest,
      );
    } catch (error) {
      // console.error('Reject leave request error:', error);

      let statusCode = StatusCodes.BAD_REQUEST;
      if (error.message.includes('not found')) {
        statusCode = StatusCodes.NOT_FOUND;
      } else if (
        error.message.includes('permission') ||
        error.message.includes('manage')
      ) {
        statusCode = StatusCodes.FORBIDDEN;
      }

      return ResponseService.send(
        res,
        statusCode,
        error.message || 'Failed to reject leave request',
      );
    }
  }

  /**
   * Gets all leave requests with pagination and filtering (Admin/Manager)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  async getAllLeaveRequests(req, res) {
    try {
      const {
        status,
        leaveTypeId,
        storeId,
        employeeId,
        startDate,
        endDate,
        page = 1,
        limit = 10,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        search,
      } = req.query;
      const userId = req.user.id;
      const userRole = req.user.role;
      const businessId = req.user.businessId || req.businessId;

      const leaveService = new LeaveManageService(businessId);
      const employeeService = new EmployeeService(businessId);
      const storeService = new StoreService(businessId);
      const leaveTypeService = new LeaveTypeServices(businessId);

      // Determine role name for store fetching logic
      const roleName = req.user.roleId?.name || (typeof userRole === 'string' ? userRole : 'cashier');

      const promises = [
        leaveService.getAllLeaveRequests({
          status,
          leaveTypeId,
          storeId,
          employeeId,
          startDate,
          endDate,
          page: parseInt(page),
          limit: parseInt(limit),
          sortBy,
          sortOrder,
          userId,
          userRole,
          search,
        }),
        employeeService.getEmployees({}, { all: true }, req.user, businessId),
        leaveTypeService.list({ all: true }),
      ];

      // Fetch stores based on role
      if (roleName === 'admin') {
        promises.push(storeService.listStores({ owner: userId, limit: 1000 }));
      } else {
        promises.push(employeeService.getManagerStores(req.user, businessId));
      }

      const [result, employees, leaveTypes, stores] = await Promise.all(
        promises,
      );

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Leave requests retrieved successfully',
        {
          ...result,
          employees: employees.data || employees,
          stores: stores.stores || stores.data || stores,
          leaveTypes: leaveTypes.data || leaveTypes,
        },
      );
    } catch (error) {
      let statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
      if (error.message.includes('Invalid ID')) {
        statusCode = StatusCodes.BAD_REQUEST;
      } else if (error.message.includes('You can only access')) {
        statusCode = StatusCodes.FORBIDDEN;
      }

      return ResponseService.send(
        res,
        statusCode,
        error.message || 'Failed to retrieve leave requests',
      );
    }
  }

  /**
   * Gets leave requests for the current user (Cashier/Manager)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  async getMyLeaveRequests(req, res) {
    try {
      const userId = req.user.id;
      const businessId = req.user.businessId || req.businessId;
      const { status, startDate, endDate, page = 1, limit = 10 } = req.query;

      const leaveService = new LeaveManageService(businessId);
      const result = await leaveService.getMyLeaveRequests(userId, {
        status,
        startDate,
        endDate,
        page: parseInt(page),
        limit: parseInt(limit),
      });

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Leave requests retrieved successfully',
        result,
      );
    } catch (error) {
      // console.error('Get my leave requests error:', error);

      let statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
      if (error.message.includes('not found')) {
        statusCode = StatusCodes.NOT_FOUND;
      }

      return ResponseService.send(
        res,
        statusCode,
        error.message || 'Failed to retrieve leave requests',
      );
    }
  }

  /**
   * Gets all leave requests for stores managed by a manager
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  async getManagerLeaveRequests(req, res) {
    try {
      const {
        status,
        startDate,
        endDate,
        storeId,
        page = 1,
        limit = 10,
      } = req.query;
      const managerId = req.user.id;
      const businessId = req.user.businessId || req.businessId;

      const leaveService = new LeaveManageService(businessId);
      const result = await leaveService.getManagerLeaveRequests(managerId, {
        status,
        startDate,
        endDate,
        storeId,
        page: parseInt(page),
        limit: parseInt(limit),
      });

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Manager leave requests retrieved successfully',
        result,
      );
    } catch (error) {
      // console.error('Get manager leave requests error:', error);

      let statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
      if (error.message.includes('Invalid ID')) {
        statusCode = StatusCodes.BAD_REQUEST;
      } else if (
        error.message.includes('permission') ||
        error.message.includes('manage')
      ) {
        statusCode = StatusCodes.FORBIDDEN;
      }

      return ResponseService.send(
        res,
        statusCode,
        error.message || 'Failed to retrieve manager leave requests',
      );
    }
  }

  /**
   * Gets pending leave requests for all stores managed by a manager
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  async getManagerPendingLeaveRequests(req, res) {
    try {
      const { storeId, page = 1, limit = 10 } = req.query;
      const managerId = req.user.id;
      const businessId = req.user.businessId || req.businessId;

      const leaveService = new LeaveManageService(businessId);
      const result = await leaveService.getManagerPendingLeaveRequests(
        managerId,
        {
          storeId,
          page: parseInt(page),
          limit: parseInt(limit),
        },
      );

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Manager pending leave requests retrieved successfully',
        result,
      );
    } catch (error) {
      // console.error('Get manager pending leave requests error:', error);

      let statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
      if (error.message.includes('Invalid ID')) {
        statusCode = StatusCodes.BAD_REQUEST;
      } else if (
        error.message.includes('permission') ||
        error.message.includes('manage')
      ) {
        statusCode = StatusCodes.FORBIDDEN;
      }

      return ResponseService.send(
        res,
        statusCode,
        error.message || 'Failed to retrieve manager pending leave requests',
      );
    }
  }
}

export default new LeaveManageController();
