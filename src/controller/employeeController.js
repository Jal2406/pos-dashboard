import { StatusCodes } from 'http-status-codes';
import { EmployeeService } from '../services/index.js';
import { ResponseService } from '../utils/index.js';

class EmployeeController {
  /**
   * Create a new employee
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware function
   */
  static async createEmployee(req, res, next) {
    try {
      const rawData = req.body;
      const currentUser = req.user;
      const businessId = req.businessId;
      const employeeService = new EmployeeService(businessId);

      // Validate required fields
      if (!rawData.email) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Email is required',
        );
      }
      if (!rawData.name) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Name is required',
        );
      }
      if (!rawData.designation) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Designation is required',
        );
      }

      // Handle name construction from firstName/lastName or use provided name
      let userName = rawData.name;
      if (rawData.firstName || rawData.lastName) {
        const firstName = rawData.firstName || '';
        const lastName = rawData.lastName || '';
        userName = `${firstName} ${lastName}`.trim();
      }

      // Map incoming data to expected service format
      const employeeData = {
        user: rawData.user, // Optional: existing user ID
        store: rawData.store,
        designation: rawData.designation?.toLowerCase(), // Normalize to lowercase
        userEmail: rawData.email,
        userName: userName,
        userPhone: rawData.phone,
        salary: rawData.salary,
        userPassword: rawData.password, // Optional: will generate if not provided
        userProfilePicture: rawData.profilePicture, // Profile picture from upload route
        joinDate: rawData.joiningDate,
        isActive: rawData.isActive !== undefined ? rawData.isActive : true,
      };

      const employee = await employeeService.createEmployee(
        employeeData,
        currentUser,
        businessId,
      );

      if (employee == null) {
        return ResponseService.send(
          res,
          StatusCodes.FORBIDDEN,
          'You do not have permission to create employees',
        );
      }

      ResponseService.send(
        res,
        StatusCodes.CREATED,
        'Employee created successfully',
        employee,
      );
    } catch (error) {
      console.log(error);
      if (
        error.message.includes('validation failed') ||
        error.message.includes('already exists') ||
        error.message.includes('Unauthorized')
      ) {

        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          error.message,
        );
      }
      next(error);
    }
  }

  /**
   * Bulk get employees
   */
  static async bulkGet(req, res, next) {
    try {
      const { ids } = req.body;
      const businessId = req.businessId;
      const employeeService = new EmployeeService(businessId);

      const result = await employeeService.bulkGet(ids, req.user);

      ResponseService.send(
        res,
        StatusCodes.OK,
        'Employees retrieved successfully',
        result,
      );
    } catch (error) {
      if (error.message.includes('IDs must be a non-empty array')) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          error.message,
        );
      }
      if (error.message.includes('Unauthorized')) {
        return ResponseService.send(res, StatusCodes.FORBIDDEN, error.message);
      }
      next(error);
    }
  }

  /**
   * Bulk update employee status
   */
  static async bulkUpdateStatus(req, res, next) {
    try {
      const { ids, status } = req.body;
      const currentUser = req.user;
      const businessId = req.businessId;
      const employeeService = new EmployeeService(businessId);

      const result = await employeeService.bulkUpdateStatus(
        ids,
        status,
        currentUser,
      );

      ResponseService.send(
        res,
        StatusCodes.OK,
        'Employees status updated successfully',
        result,
      );
    } catch (error) {
      if (
        error.message.includes('IDs must be a non-empty array') ||
        error.message.includes('Invalid')
      ) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          error.message,
        );
      }
      if (error.message.includes('Unauthorized')) {
        return ResponseService.send(res, StatusCodes.FORBIDDEN, error.message);
      }
      next(error);
    }
  }

  /**
   * Bulk delete employees
   */
  static async bulkDelete(req, res, next) {
    try {
      const { ids } = req.body;
      const currentUser = req.user;
      const businessId = req.businessId;
      const employeeService = new EmployeeService(businessId);

      const result = await employeeService.bulkDelete(ids, currentUser);

      ResponseService.send(
        res,
        StatusCodes.OK,
        'Employees unassigned successfully',
        result,
      );
    } catch (error) {
      if (error.message.includes('IDs must be a non-empty array')) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          error.message,
        );
      }
      if (error.message.includes('Unauthorized')) {
        return ResponseService.send(res, StatusCodes.FORBIDDEN, error.message);
      }
      next(error);
    }
  }

  /**
   * Get employee by ID
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware function
   */
  static async getEmployeeById(req, res, next) {
    try {
      const { id } = req.params;
      const currentUser = req.user;
      const businessId = req.businessId;
      const employeeService = new EmployeeService(businessId);

      const employee = await employeeService.getEmployeeById(
        id,
        currentUser,
        businessId,
      );

      if (employee == null) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Employee not found',
        );
      }

      ResponseService.send(
        res,
        StatusCodes.OK,
        'Employee retrieved successfully',
        employee,
      );
    } catch (error) {
      if (
        error.message.includes('not found') ||
        error.message.includes('Invalid employee ID')
      ) {
        return ResponseService.send(res, StatusCodes.NOT_FOUND, error.message);
      }
      if (error.message.includes('Unauthorized')) {
        return ResponseService.send(res, StatusCodes.FORBIDDEN, error.message);
      }
      next(error);
    }
  }

  /**
   * Update employee
   * @param {String} id - Employee ID
   * @param {Object} updateData - Data to update
   */
  static async updateEmployee(req, res, next) {
    try {
      const { id } = req.params;
      const rawData = req.body;
      const currentUser = req.user;
      const businessId = req.businessId;
      const employeeService = new EmployeeService(businessId);

      // Process update data to handle firstName/lastName in user object
      const updateData = { ...rawData };

      // Map root-level user fields to user object if they exist
      // This handles cases where frontend sends name, email, phone, profilePicture at root level
      if (!updateData.user) {
        updateData.user = {};
      }

      // Map root-level fields to user object if they exist and aren't already in user object
      // This allows frontend to send data either at root level or nested in user object
      if (rawData.name !== undefined && updateData.user.name === undefined) {
        updateData.user.name = rawData.name;
      }
      if (rawData.email !== undefined && updateData.user.email === undefined) {
        updateData.user.email = rawData.email;
      }
      if (rawData.phone !== undefined && updateData.user.phone === undefined) {
        updateData.user.phone = rawData.phone;
      }
      if (
        rawData.profilePicture !== undefined &&
        updateData.user.profilePicture === undefined
      ) {
        updateData.user.profilePicture = rawData.profilePicture;
      }

      // If user object contains firstName/lastName, construct name from them
      if (
        updateData.user &&
        (updateData.user.firstName || updateData.user.lastName)
      ) {
        const firstName = updateData.user.firstName || '';
        const lastName = updateData.user.lastName || '';
        updateData.user.name = `${firstName} ${lastName}`.trim();
      }

      const employee = await employeeService.updateEmployee(
        id,
        updateData,
        currentUser,
        businessId,
      );

      if (employee == null) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Employee not found',
        );
      }

      ResponseService.send(
        res,
        StatusCodes.OK,
        'Employee updated successfully',
        employee,
      );
    } catch (error) {
      if (
        error.message.includes('not found') ||
        error.message.includes('Invalid employee ID')
      ) {
        return ResponseService.send(res, StatusCodes.NOT_FOUND, error.message);
      }
      if (error.message.includes('validation failed')) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          error.message,
        );
      }
      if (error.message.includes('Unauthorized')) {
        return ResponseService.send(res, StatusCodes.FORBIDDEN, error.message);
      }
      next(error);
    }
  }

  /**
   * Delete employee
   */
  static async deleteEmployee(req, res, next) {
    try {
      const { id } = req.params;
      const currentUser = req.user;
      const businessId = req.businessId;
      const employeeService = new EmployeeService(businessId);

      const deleted = await employeeService.deleteEmployee(
        id,
        currentUser,
        businessId,
      );

      if (!deleted) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Employee not found',
        );
      }

      ResponseService.send(
        res,
        StatusCodes.OK,
        'Employee unassigned successfully',
      );
    } catch (error) {
      if (
        error.message.includes('not found') ||
        error.message.includes('Invalid employee ID')
      ) {
        return ResponseService.send(res, StatusCodes.NOT_FOUND, error.message);
      }
      if (error.message.includes('Unauthorized')) {
        return ResponseService.send(res, StatusCodes.FORBIDDEN, error.message);
      }
      next(error);
    }
  }

  /**
   * Assign employee to a store
   */
  static async assignEmployeeToStore(req, res, next) {
    try {
      const { id: employeeId, storeId } = req.params;
      const currentUser = req.user;
      const businessId = req.businessId;
      const employeeService = new EmployeeService(businessId);

      if (!employeeId || !storeId) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Employee ID and Store ID are required',
        );
      }

      const employee = await employeeService.assignEmployeeToStore(
        employeeId,
        storeId,
        currentUser,
        businessId,
      );

      if (employee == null) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Employee not found or action not allowed',
        );
      }

      ResponseService.send(
        res,
        StatusCodes.OK,
        'Employee assigned to store successfully',
        employee,
      );
    } catch (error) {
      if (
        error.message.includes('Invalid') ||
        error.message.includes('not found')
      ) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          error.message,
        );
      }
      if (error.message.includes('Unauthorized')) {
        return ResponseService.send(res, StatusCodes.FORBIDDEN, error.message);
      }
      next(error);
    }
  }

  /**
   * Unassign employee from store
   */
  static async unassignEmployeeFromStore(req, res, next) {
    try {
      const { id: employeeId, storeId } = req.params;
      const currentUser = req.user;
      const businessId = req.businessId;
      const employeeService = new EmployeeService(businessId);

      if (!employeeId) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Employee ID is required',
        );
      }

      // Note: storeId parameter is included for consistency with route pattern
      // but the service method doesn't require it since it unassigns from any store
      const employee = await employeeService.unassignEmployeeFromStore(
        employeeId,
        currentUser,
        businessId,
      );

      if (employee == null) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Employee not found or action not allowed',
        );
      }

      ResponseService.send(
        res,
        StatusCodes.OK,
        'Employee unassigned from store successfully',
        employee,
      );
    } catch (error) {
      if (
        error.message.includes('Invalid') ||
        error.message.includes('not found')
      ) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          error.message,
        );
      }
      if (error.message.includes('Unauthorized')) {
        return ResponseService.send(res, StatusCodes.FORBIDDEN, error.message);
      }
      next(error);
    }
  }

  /**
   * Toggle employee active status
   */
  static async toggleEmployeeStatus(req, res, next) {
    try {
      const { id } = req.params;
      const currentUser = req.user;
      const businessId = req.businessId;
      const employeeService = new EmployeeService(businessId);

      const employee = await employeeService.toggleEmployeeStatus(
        id,
        currentUser,
        businessId,
      );

      if (employee == null) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Employee not found',
        );
      }

      const status = employee.isActive ? 'activated' : 'deactivated';

      ResponseService.send(
        res,
        StatusCodes.OK,
        `Employee ${status} successfully`,
        employee,
      );
    } catch (error) {
      if (
        error.message.includes('not found') ||
        error.message.includes('Invalid employee ID')
      ) {
        return ResponseService.send(res, StatusCodes.NOT_FOUND, error.message);
      }
      if (error.message.includes('Unauthorized')) {
        return ResponseService.send(res, StatusCodes.FORBIDDEN, error.message);
      }
      next(error);
    }
  }

  /**
   * Get all stores where current user has manager access
   */
  static async getManagerStores(req, res, next) {
    try {
      const currentUser = req.user;
      const businessId = req.businessId;
      const employeeService = new EmployeeService(businessId);

      // Note: The id parameter is included for route consistency but the service method
      // gets stores for the current user, not a specific employee ID
      const stores = await employeeService.getManagerStores(
        currentUser,
        businessId,
      );

      ResponseService.send(
        res,
        StatusCodes.OK,
        'Manager stores retrieved successfully',
        { stores },
      );
    } catch (error) {
      if (error.message.includes('Unauthorized')) {
        return ResponseService.send(res, StatusCodes.FORBIDDEN, error.message);
      }
      next(error);
    }
  }

  /**
   * Get employees with unified query support
   */
  static async getEmployees(req, res, next) {
    try {
      const queryParams = req.query;
      const currentUser = req.user;
      const businessId = req.businessId;
      const employeeService = new EmployeeService(businessId);

      // Extract filters from query parameters
      const filters = {
        storeId: queryParams.storeId || queryParams.store,
        user: queryParams.user,
        designation: queryParams.designation,
        isActive: queryParams.isActive,
      };

      // Remove filter parameters from queryParams to avoid duplication
      const {
        store,
        storeId,
        user,
        designation,
        isActive,
        ...remainingParams
      } = queryParams;

      // Use the unified getEmployees method
      const employees = await employeeService.getEmployees(
        filters,
        remainingParams,
        currentUser,
        businessId,
      );

      ResponseService.send(
        res,
        StatusCodes.OK,
        'Employees retrieved successfully',
        employees,
      );
    } catch (error) {
      if (error.message.includes('Unauthorized')) {
        return ResponseService.send(res, StatusCodes.FORBIDDEN, error.message);
      }
      if (
        error.message.includes('Invalid') ||
        error.message.includes('not found')
      ) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          error.message,
        );
      }
      next(error);
    }
  }
}

export default EmployeeController;
