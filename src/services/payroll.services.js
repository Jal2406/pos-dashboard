import mongoose from 'mongoose';
import {
  EmployeeSchema,
  payrollSchema,
  LeaveManageSchema,
  LeaveTypeSchema,
  User,
  StoreSchema,
} from '../models/index.js';
import { BaseService } from '../utils/index.js';

class PayrollService extends BaseService {
  constructor(businessId) {
    if (!businessId) {
      throw new Error('PayrollService initialized without businessId');
    }
    super({
      modelName: 'Payroll',
      schema: payrollSchema,
      collection: 'payrolls',
      businessId,
    });
  }

  /**
   * Calculate unpaid leave days for an employee in a specific month
   * @param {ObjectId} employeeId - Employee ID
   * @param {Number} month - Month (1-12)
   * @param {Number} year - Year (e.g., 2025)
   * @returns {Number} - Number of unpaid leave days
   */
  async _calculateUnpaidLeaveDays(employeeId, month, year) {
    try {
      // Create start and end dates for the month
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59, 999);

      // Get LeaveManage and LeaveType models
      const LeaveManageModel = await this.getModel(
        'LeaveManage',
        LeaveManageSchema,
        'leavemanages',
      );

      // Find all approved leaves for this employee in the given month
      const leaves = await LeaveManageModel.find({
        employeeId,
        status: 'approved',
        $or: [
          {
            startDate: { $gte: startDate, $lte: endDate },
          },
          {
            endDate: { $gte: startDate, $lte: endDate },
          },
          {
            startDate: { $lte: startDate },
            endDate: { $gte: endDate },
          },
        ],
      }).populate('leaveTypeId');

      let unpaidLeaveDays = 0;

      for (const leave of leaves) {
        // Check if this is an unpaid leave type
        if (leave.leaveTypeId?.type === 'Unpaid') {
          // Calculate the number of days for this leave that fall within the month
          const leaveStart = new Date(
            Math.max(leave.startDate.getTime(), startDate.getTime()),
          );
          const leaveEnd = new Date(
            Math.min(leave.endDate.getTime(), endDate.getTime()),
          );

          if (leave.isHalfDay) {
            unpaidLeaveDays += 0.5;
          } else {
            // Calculate days between start and end (inclusive)
            const timeDiff = leaveEnd.getTime() - leaveStart.getTime();
            const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1;
            unpaidLeaveDays += daysDiff;
          }
        }
      }

      return unpaidLeaveDays;
    } catch (error) {
      console.error('Error calculating unpaid leave days:', error);
      return 0;
    }
  }

  /**
   * Calculate deduction based on unpaid leave days
   * @param {Number} baseSalary - Base salary of employee
   * @param {Number} unpaidLeaveDays - Number of unpaid leave days
   * @param {Number} month - Month (1-12)
   * @param {Number} year - Year (e.g., 2025)
   * @returns {Number} - Deduction amount
   */
  _calculateDeduction(baseSalary, unpaidLeaveDays, month, year) {
    if (unpaidLeaveDays === 0) return 0;

    // Get number of days in the month
    const daysInMonth = new Date(year, month, 0).getDate();

    // Calculate per-day salary
    const perDaySalary = baseSalary / daysInMonth;

    // Calculate total deduction
    const deduction = perDaySalary * unpaidLeaveDays;

    return Math.round(deduction * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Generate payroll for a single employee
   * @param {ObjectId} employeeId - Employee ID
   * @param {Number} month - Month (1-12)
   * @param {Number} year - Year (e.g., 2025)
   * @param {Object} currentUser - Current user making the request
   * @returns {Object} - Generated payroll record
   */
  async generatePayrollForEmployee(employeeId, month, year, currentUser) {
    if (!mongoose.isValidObjectId(employeeId)) {
      throw new Error('Invalid employee ID');
    }

    // Validate month and year
    if (!month || month < 1 || month > 12) {
      throw new Error('Month must be between 1 and 12');
    }

    if (!year || year < 2000 || year > 2100) {
      throw new Error('Year must be between 2000 and 2100');
    }

    // Get Employee model
    const EmployeeModel = await this.getModel(
      'Employee',
      EmployeeSchema,
      'employees',
    );

    // Find employee and get their current salary
    const employee = await EmployeeModel.findById(employeeId).lean();

    if (!employee) {
      throw new Error('Employee not found');
    }

    if (!employee.salary || employee.salary <= 0) {
      throw new Error(
        'Employee does not have a valid salary configured. Please update the employee salary first.',
      );
    }

    // Get Payroll model
    const PayrollModel = await this.getModelRef();

    // Check if payroll already exists for this employee, month and year
    const existingPayroll = await PayrollModel.findOne({
      employee: employeeId,
      month,
      year,
    });

    if (existingPayroll) {
      throw new Error(
        `Payroll for ${month}/${year} already exists for this employee`,
      );
    }

    // Calculate unpaid leave days
    const unpaidLeaveDays = await this._calculateUnpaidLeaveDays(
      employeeId,
      month,
      year,
    );

    // Calculate deduction
    const deduction = this._calculateDeduction(
      employee.salary,
      unpaidLeaveDays,
      month,
      year,
    );

    // Calculate total salary (baseSalary - deduction)
    // Note: allowance is not used in current implementation, but can be added later
    const totalSalary = employee.salary - deduction;

    // Create payroll record
    const payrollData = {
      employee: employeeId,
      baseSalary: employee.salary, // Snapshot of current salary
      deduction,
      totalSalary, // Calculate explicitly to avoid validation errors
      month,
      year,
    };

    const payroll = await PayrollModel.create(payrollData);

    // Manually populate employee and user (User is in global DB, Employee in tenant DB)
    const payrollDoc = await PayrollModel.findById(payroll._id).lean();

    if (payrollDoc.employee) {
      const EmployeeModel = await this.getModel('Employee', EmployeeSchema, 'employees');
      const employee = await EmployeeModel.findById(payrollDoc.employee)
        .select('user designation joinDate')
        .lean();

      if (employee) {
        payrollDoc.employee = employee;

        // Fetch user from global DB
        if (employee.user) {
          const user = await User.findById(employee.user)
            .select('name email phone')
            .lean();
          payrollDoc.employee.user = user;
        }
      }
    }

    return {
      ...payrollDoc,
      unpaidLeaveDays, // Include this for transparency
    };
  }

  /**
   * Generate payroll for multiple employees
   * @param {Array} employeeIds - Array of employee IDs
   * @param {Number} month - Month (1-12)
   * @param {Number} year - Year (e.g., 2025)
   * @param {Object} currentUser - Current user making the request
   * @returns {Object} - Summary of generated payrolls
   */
  async generateBulkPayroll(employeeIds, month, year, currentUser) {
    const results = {
      successful: [],
      failed: [],
      total: employeeIds.length,
    };

    for (const employeeId of employeeIds) {
      try {
        const payroll = await this.generatePayrollForEmployee(
          employeeId,
          month,
          year,
          currentUser,
        );
        results.successful.push({
          employeeId,
          payroll,
        });
      } catch (error) {
        results.failed.push({
          employeeId,
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Generate payroll for all active employees in a store
   * @param {ObjectId} storeId - Store ID (optional, null for unassigned employees)
   * @param {Number} month - Month (1-12)
   * @param {Number} year - Year (e.g., 2025)
   * @param {Object} currentUser - Current user making the request
   * @returns {Object} - Summary of generated payrolls
   */
  async generatePayrollForStore(storeId, month, year, currentUser) {
    const EmployeeModel = await this.getModel(
      'Employee',
      EmployeeSchema,
      'employees',
    );

    // Find all active employees in the store
    const query = {
      isActive: true,
      salary: { $gt: 0 }, // Only employees with salary configured
    };

    if (storeId) {
      if (!mongoose.isValidObjectId(storeId)) {
        throw new Error('Invalid store ID');
      }
      query.store = storeId;
    } else {
      query.store = null;
    }

    const employees = await EmployeeModel.find(query).select('_id').lean();

    if (employees.length === 0) {
      throw new Error('No active employees with configured salary found');
    }

    const employeeIds = employees.map((emp) => emp._id);
    return await this.generateBulkPayroll(
      employeeIds,
      month,
      year,
      currentUser,
    );
  }

  /**
   * Get payroll by ID
   * @param {ObjectId} payrollId - Payroll ID
   * @returns {Object} - Payroll record
   */
  async getPayrollById(payrollId) {
    if (!mongoose.isValidObjectId(payrollId)) {
      throw new Error('Invalid payroll ID');
    }

    const PayrollModel = await this.getModelRef();
    const payroll = await PayrollModel.findById(payrollId).lean();

    if (!payroll) {
      throw new Error('Payroll not found');
    }

    // Manually populate employee and user
    if (payroll.employee) {
      const EmployeeModel = await this.getModel('Employee', EmployeeSchema, 'employees');
      const employee = await EmployeeModel.findById(payroll.employee)
        .select('user designation joinDate salary')
        .lean();

      if (employee) {
        payroll.employee = employee;

        // Fetch user from global DB
        if (employee.user) {
          const user = await User.findById(employee.user)
            .select('name email phone')
            .lean();
          payroll.employee.user = user;
        }
      }
    }

    return payroll;
  }

  /**
   * Get payrolls with filtering and pagination
   * @param {Object} filters - Filter criteria
   * @param {Object} options - Pagination options
   * @param {Object} currentUser - Current user making the request (optional, for role-based filtering)
   * @returns {Object} - Paginated payroll records
   */
  async getPayrolls(filters = {}, options = {}, currentUser = null) {
    const PayrollModel = await this.getModelRef();
    const { page = 1, limit = 10, month, year, employeeId, storeId } = options;

    const query = {};

    if (month) {
      query.month = parseInt(month);
    }

    if (year) {
      query.year = parseInt(year);
    }

    if (employeeId) {
      if (!mongoose.isValidObjectId(employeeId)) {
        throw new Error('Invalid employee ID');
      }
      query.employee = employeeId;
    }

    // If storeId is provided, we need to find employees in that store first
    if (storeId) {
      if (!mongoose.isValidObjectId(storeId)) {
        throw new Error('Invalid store ID');
      }
      const EmployeeModel = await this.getModel(
        'Employee',
        EmployeeSchema,
        'employees',
      );
      const storeEmployees = await EmployeeModel.find({ store: storeId })
        .select('_id')
        .lean();
      const employeeIds = storeEmployees.map((emp) => emp._id);
      query.employee = { $in: employeeIds };
    }

    // Apply role-based data scoping if currentUser is provided
    if (currentUser) {
      const roleFilterResult = await this._applyRoleBasedPayrollFilter(query, currentUser, options);
      if (roleFilterResult) {
        return roleFilterResult; // Return early with empty results if filter returns a result
      }
    }

    const skip = (page - 1) * limit;

    const [payrolls, total] = await Promise.all([
      PayrollModel.find(query)
        .sort({ year: -1, month: -1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      PayrollModel.countDocuments(query),
    ]);

    // Manually populate employee, user, and store
    if (payrolls.length > 0) {
      const EmployeeModel = await this.getModel('Employee', EmployeeSchema, 'employees');
      const StoreModel = await this.getModel('Store', StoreSchema, 'stores');

      // Collect all employee IDs
      const employeeIds = payrolls.map(p => p.employee).filter(Boolean);

      // Fetch all employees in one query
      const employees = await EmployeeModel.find({ _id: { $in: employeeIds } })
        .select('_id user designation joinDate salary store')
        .lean();

      // Create employee map
      const employeeMap = new Map(employees.map(e => [e._id.toString(), e]));

      // Collect all user and store IDs
      const userIds = employees.map(e => e.user).filter(Boolean);
      const storeIds = employees.map(e => e.store).filter(Boolean);

      // Fetch users from global DB and stores from tenant DB
      const [users, stores] = await Promise.all([
        userIds.length > 0
          ? User.find({ _id: { $in: userIds } }).select('name email phone').lean()
          : [],
        storeIds.length > 0
          ? StoreModel.find({ _id: { $in: storeIds } }).select('name').lean()
          : []
      ]);

      // Create maps
      const userMap = new Map(users.map(u => [u._id.toString(), u]));
      const storeMap = new Map(stores.map(s => [s._id.toString(), s]));

      // Populate each payroll
      for (const payroll of payrolls) {
        if (payroll.employee) {
          const employee = employeeMap.get(payroll.employee.toString());
          if (employee) {
            // Attach user
            if (employee.user) {
              employee.user = userMap.get(employee.user.toString()) || employee.user;
            }
            // Attach store
            if (employee.store) {
              employee.store = storeMap.get(employee.store.toString()) || employee.store;
            }
            payroll.employee = employee;
          }
        }
      }
    }

    return {
      payrolls,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Update payroll deduction manually
   * @param {ObjectId} payrollId - Payroll ID
   * @param {Number} deduction - New deduction amount
   * @param {Object} currentUser - Current user making the request
   * @returns {Object} - Updated payroll record
   */
  async updatePayrollDeduction(payrollId, deduction, currentUser) {
    if (!mongoose.isValidObjectId(payrollId)) {
      throw new Error('Invalid payroll ID');
    }

    if (deduction < 0) {
      throw new Error('Deduction cannot be negative');
    }

    const PayrollModel = await this.getModelRef();
    const payroll = await PayrollModel.findById(payrollId);

    if (!payroll) {
      throw new Error('Payroll not found');
    }

    payroll.deduction = deduction;
    await payroll.save(); // This will trigger the pre-save hook to recalculate totalSalary

    return await this.getPayrollById(payrollId);
  }

  /**
   * Delete payroll record
   * @param {ObjectId} payrollId - Payroll ID
   * @param {Object} currentUser - Current user making the request
   * @returns {Boolean} - Success status
   */
  async deletePayroll(payrollId, currentUser) {
    if (!mongoose.isValidObjectId(payrollId)) {
      throw new Error('Invalid payroll ID');
    }

    const PayrollModel = await this.getModelRef();
    const payroll = await PayrollModel.findByIdAndDelete(payrollId);

    if (!payroll) {
      throw new Error('Payroll not found');
    }

    return true;
  }

  /**
   * Get payroll summary for a specific month and year
   * @param {Number} month - Month (1-12)
   * @param {Number} year - Year (e.g., 2025)
   * @param {ObjectId} storeId - Optional store ID filter
   * @returns {Object} - Payroll summary statistics
   */
  async getPayrollSummary(month, year, storeId = null) {
    const PayrollModel = await this.getModelRef();
    const matchQuery = { month: parseInt(month), year: parseInt(year) };

    // If storeId is provided, filter by store
    if (storeId) {
      if (!mongoose.isValidObjectId(storeId)) {
        throw new Error('Invalid store ID');
      }
      const EmployeeModel = await this.getModel(
        'Employee',
        EmployeeSchema,
        'employees',
      );
      const storeEmployees = await EmployeeModel.find({ store: storeId })
        .select('_id')
        .lean();
      const employeeIds = storeEmployees.map((emp) => emp._id);
      matchQuery.employee = { $in: employeeIds };
    }

    const summary = await PayrollModel.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalEmployees: { $sum: 1 },
          totalBaseSalary: { $sum: '$baseSalary' },
          totalDeductions: { $sum: '$deduction' },
          totalPayable: { $sum: '$totalSalary' },
          averageSalary: { $avg: '$totalSalary' },
          maxSalary: { $max: '$totalSalary' },
          minSalary: { $min: '$totalSalary' },
        },
      },
    ]);

    if (summary.length === 0) {
      return {
        month,
        year,
        totalEmployees: 0,
        totalBaseSalary: 0,
        totalDeductions: 0,
        totalPayable: 0,
        averageSalary: 0,
        maxSalary: 0,
        minSalary: 0,
      };
    }

    return {
      month,
      year,
      ...summary[0],
    };
  }

  /**
   * Apply role-based filter to payroll query
   * @param {Object} query - Existing query object (modified in place)
   * @param {Object} currentUser - Current user making the request
   * @param {Object} options - Query options
   * @returns {Object|null} Returns empty result object if access denied, null to continue
   */
  async _applyRoleBasedPayrollFilter(query, currentUser, options) {
    const role = currentUser.roleId?.name;
    const { page = 1, limit = 10 } = options;

    // Admin and Superadmin have full access - no additional filters
    if (role === 'admin' || role === 'superadmin') {
      return null;
    }

    // Manager: Can see payrolls for employees in stores they manage
    if (role === 'manager') {
      const managedStoreIds = await this._getManagedStoreIds(currentUser);
      if (managedStoreIds.length > 0) {
        const EmployeeModel = await this.getModel(
          'Employee',
          EmployeeSchema,
          'employees',
        );
        const storeEmployees = await EmployeeModel.find({
          store: { $in: managedStoreIds }
        })
          .select('_id')
          .lean();
        const employeeIds = storeEmployees.map((emp) => emp._id);

        if (employeeIds.length > 0) {
          // If query already has employee filter, intersect with managed employees
          if (query.employee) {
            if (query.employee.$in) {
              query.employee.$in = query.employee.$in.filter(id =>
                employeeIds.some(empId => empId.toString() === id.toString())
              );
            } else {
              // Single employee requested - check if in managed stores
              const requestedEmpId = query.employee.toString();
              if (!employeeIds.some(id => id.toString() === requestedEmpId)) {
                return this._emptyPayrollResult(page, limit);
              }
            }
          } else {
            query.employee = { $in: employeeIds };
          }
        } else {
          return this._emptyPayrollResult(page, limit);
        }
      } else {
        return this._emptyPayrollResult(page, limit);
      }
      return null;
    }

    // Cashier and other roles: Can only see their own payroll records
    try {
      const employeeId = await this.getEmployeeIdForUser(currentUser);
      // Override any employee filter - cashiers can ONLY see their own data
      query.employee = employeeId;
    } catch (error) {
      return this._emptyPayrollResult(page, limit);
    }
    return null;
  }

  /**
   * Return empty payroll result with pagination structure
   * @param {Number} page - Page number
   * @param {Number} limit - Limit
   * @returns {Object} Empty result with pagination
   */
  _emptyPayrollResult(page, limit) {
    return {
      payrolls: [],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: 0,
        pages: 0,
      },
    };
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
}

export default PayrollService;
