import mongoose from 'mongoose';
import {
  User,
  Role,
  Subscription,
  EmployeeSchema,
  StoreSchema,
} from '../models/index.js';
import { PasswordUtils, BaseService, deleteImage } from '../utils/index.js';

class EmployeeService extends BaseService {
  constructor(businessId) {
    if (!businessId) {
      throw new Error('ProductServices initialized without businessId');
    }
    super({
      modelName: 'Employee',
      schema: EmployeeSchema,
      collection: 'employees',
      businessId,
    });
    
    // RBAC: Employees are store-scoped
    this.rbacConfig.storeScoped = true;
    this.rbacConfig.storeIdField = 'store';
    
    this._roleCache = new Map();
  }

  // ========================================
  // SUBSCRIPTION AND BUSINESS LOGIC METHODS
  // ========================================

  async getUserSubscription(userId) {
    if (!mongoose.isValidObjectId(userId)) throw new Error('Invalid user ID');

    let subscription = await Subscription.findOne({
      user: userId,
      status: true,
    })
      .populate('planName')
      .lean();

    if (!subscription) {
      subscription = await Subscription.findOne({ user: userId })
        .populate('planName')
        .lean();
    }

    if (!subscription) {
      console.warn(
        `No subscription found for user ${userId}. This might be a development/testing scenario.`,
      );
      return { allowCreation: false, reason: 'No subscription found' };
    }

    if (!subscription.planName)
      throw new Error('Subscription plan not found or not populated');
    return subscription;
  }

  async hasReachedStaffLimit(userId, businessId) {
    if (!mongoose.isValidObjectId(userId)) throw new Error('Invalid user ID');

    const subscription = await this.getUserSubscription(userId);
    if (subscription.allowCreation) return false;
    if (!subscription?.planName)
      throw new Error('No active subscription or plan found');

    const staffLimit = subscription.planName.staffLimit;
    if (!staffLimit || staffLimit <= 0)
      throw new Error(`Invalid staff limit in plan: ${staffLimit}`);

    const EmployeeModel = await this.getModelRef();
    const [ownedStoreIds, unassignedCount] = await Promise.all([
      (await this.getModel('Store', StoreSchema, 'stores'))
        .find({ owner: userId })
        .distinct('_id'),
      EmployeeModel.countDocuments({
        store: null,
        createdBy: userId,
        isActive: true,
      }),
    ]);

    const assignedCount = await EmployeeModel.countDocuments({
      store: { $in: ownedStoreIds },
      isActive: true,
    });

    return assignedCount + unassignedCount >= staffLimit;
  }

  // ========================================
  // VALIDATION AND HELPER METHODS
  // ========================================

  async _validateAccessControl(currentUser, options = {}) {
    const { storeId, requireStoreAccess = false } = options;

    if (!currentUser?.roleId)
      throw new Error('Unauthorized: User not authenticated');

    const role = currentUser.roleId.name;

    // Cashier: read-only access to their own employee record(s) only
    if (role === 'cashier') {
      return {
        role: 'cashier',
        accessibleStores: [],
        canAccessAllStores: false,
        selfOnly: true,
      };
    }

    if (!['admin', 'manager'].includes(role)) {
      throw new Error(
        'Unauthorized: Only admins and managers can perform this action',
      );
    }

    if (requireStoreAccess && storeId) {
      return await this._resolveRequiredStoreAccess(role, currentUser, storeId);
    }

    return await this._resolveGeneralAccess(
      role,
      currentUser,
      requireStoreAccess,
    );
  }

  async _resolveRequiredStoreAccess(role, currentUser, storeId) {
    if (role === 'admin') {
      const StoreModel = await this.getModel('Store', StoreSchema, 'stores');
      const store = await StoreModel.findById(storeId).select('owner').lean();
      const isOwner = store?.owner?.toString() === currentUser._id.toString();
      const isChildOfOwner =
        store?.owner?.toString() === currentUser.parentId?.toString();
      if (!store || (!isOwner && !isChildOfOwner)) {
        throw new Error('Unauthorized: You can only access stores you own');
      }
      return { role, accessibleStores: [storeId], canAccessAllStores: true };
    }

    // manager
    const EmployeeModel = await this.getModelRef();
    const managerEmployee = await EmployeeModel.findOne({
      user: currentUser._id,
      store: storeId,
      designation: 'manager',
      isActive: true,
    }).lean();

    if (!managerEmployee) {
      throw new Error(
        'Unauthorized: You can only access stores where you are assigned as manager',
      );
    }
    return { role, accessibleStores: [storeId], canAccessAllStores: false };
  }

  async _resolveGeneralAccess(role, currentUser, requireStoreAccess) {
    if (role === 'admin') {
      const StoreModel = await this.getModel('Store', StoreSchema, 'stores');
      const ownedStores = await StoreModel.find({
        owner: currentUser._id,
      }).distinct('_id');
      return {
        role,
        accessibleStores: ownedStores,
        canAccessAllStores: true,
      };
    }

    // manager
    const EmployeeModel = await this.getModelRef();
    const managerStores = await EmployeeModel.find({
      user: currentUser._id,
      designation: 'manager',
      isActive: true,
    }).distinct('store');

    if (managerStores.length === 0 && requireStoreAccess) {
      throw new Error(
        'Unauthorized: Managers must be assigned to at least one store to manage employees',
      );
    }

    return {
      role,
      accessibleStores: managerStores,
      canAccessAllStores: false,
    };
  }

  _wasCreatedByUser(employee, currentUser) {
    return employee.createdBy?.toString() === currentUser._id.toString();
  }

  async _validateAssignmentPermissions(
    employee,
    store,
    currentUser,
    currentUserRole,
  ) {
    if (currentUserRole === 'admin') return;
    if (
      currentUserRole === 'manager' &&
      !this._wasCreatedByUser(employee, currentUser)
    ) {
      throw new Error(
        'Unauthorized: You can only assign employees you created',
      );
    }
  }

  async _findAndVerifyEmployee(
    employeeId,
    currentUser,
    currentUserRole,
    EmployeeModel,
  ) {
    if (!mongoose.isValidObjectId(employeeId))
      throw new Error('Invalid employee ID');

    const employee = await EmployeeModel.findById(employeeId);
    if (!employee) return null;

    // Cashier: only allow access to their own employee record
    if (currentUserRole === 'cashier') {
      if (employee.user?.toString() === currentUser._id.toString()) {
        return employee;
      }
      return null;
    }

    if (!employee.store) {
      if (currentUserRole === 'admin') return employee;
      throw new Error(
        'Unauthorized: Only admins can access unassigned employees',
      );
    }

    await this._validateAccessControl(currentUser, {
      storeId: employee.store,
      requireStoreAccess: true,
    });

    return employee;
  }

  async _populateEmployee(employee, EmployeeModel, minimal = false) {
    const employeeId = employee._id || employee;
    const employeeDoc = await EmployeeModel.findById(employeeId).lean();
    if (!employeeDoc) throw new Error('Employee not found');

    const populatedEmployee = { ...employeeDoc };

    if (employeeDoc.user) {
      populatedEmployee.user = await User.findById(employeeDoc.user)
        .select(
          minimal ? 'name email phone' : 'name email phone profilePicture',
        )
        .lean();
    }

    if (employeeDoc.store) {
      const StoreModel = await this.getModel('Store', StoreSchema, 'stores');
      populatedEmployee.store = await StoreModel.findById(employeeDoc.store)
        .select(minimal ? 'name' : 'name address')
        .lean();
    }

    if (employeeDoc.createdBy) {
      populatedEmployee.createdBy = await User.findById(employeeDoc.createdBy)
        .select('name email')
        .lean();
    }

    if (employeeDoc.updatedBy && !minimal) {
      populatedEmployee.updatedBy = await User.findById(employeeDoc.updatedBy)
        .select('name email')
        .lean();
    }

    return populatedEmployee;
  }

  async _batchPopulateEmployees(employees, { minimal = false } = {}) {
    if (!employees?.length) return employees;

    const userIds = new Set();
    const storeIds = new Set();
    const createdByIds = new Set();
    const updatedByIds = new Set();

    for (const e of employees) {
      if (e.user) userIds.add(String(e.user));
      if (e.store) storeIds.add(String(e.store));
      if (e.createdBy) createdByIds.add(String(e.createdBy));
      if (e.updatedBy) updatedByIds.add(String(e.updatedBy));
    }

    const userSelect = minimal
      ? 'name email phone'
      : 'name email phone profilePicture';
    const storeSelect = minimal ? 'name' : 'name address';
    const [users, stores, createdByUsers, updatedByUsers] = await Promise.all([
      userIds.size
        ? User.find({ _id: { $in: Array.from(userIds) } })
          .select(userSelect)
          .lean()
        : [],
      storeIds.size
        ? (await this.getModel('Store', StoreSchema, 'stores'))
          .find({ _id: { $in: Array.from(storeIds) } })
          .select(storeSelect)
          .lean()
        : [],
      createdByIds.size
        ? User.find({ _id: { $in: Array.from(createdByIds) } })
          .select('name email')
          .lean()
        : [],
      updatedByIds.size
        ? User.find({ _id: { $in: Array.from(updatedByIds) } })
          .select('name email')
          .lean()
        : [],
    ]);

    const userMap = new Map(users.map((u) => [String(u._id), u]));
    const storeMap = new Map(stores.map((s) => [String(s._id), s]));
    const createdByMap = new Map(createdByUsers.map((u) => [String(u._id), u]));
    const updatedByMap = new Map(updatedByUsers.map((u) => [String(u._id), u]));

    for (const e of employees) {
      const u = userMap.get(String(e.user));
      if (u) {
        e.user = u;
      }
      const s = storeMap.get(String(e.store));
      if (s) e.store = s;
      const cb = createdByMap.get(String(e.createdBy));
      if (cb) {
        e.createdBy = cb;
      }
      const ub = updatedByMap.get(String(e.updatedBy));
      if (ub) {
        e.updatedBy = ub;
      }
    }

    return employees;
  }

  async _checkStaffLimitAsync(storeId, currentUserId, businessId) {
    try {
      let staffLimitUserId = currentUserId;
      if (storeId) {
        const StoreModel = await this.getModel('Store', StoreSchema, 'stores');
        const store = await StoreModel.findById(storeId).select('owner').lean();
        if (store) staffLimitUserId = store.owner;
      }
      return await this.hasReachedStaffLimit(staffLimitUserId, businessId);
    } catch (error) {
      if (error.message.includes('Staff limit reached')) return true;
      console.warn('Staff limit check failed:', error.message);
      return false;
    }
  }

  async _validateUserAndStore(
    storeId,
    currentUser = null,
    verifyOwnership = false,
  ) {
    if (!storeId) return null;
    if (!mongoose.isValidObjectId(storeId)) throw new Error('Invalid store ID');

    const store = await (await this.getModel('Store', StoreSchema, 'stores'))
      .findById(storeId)
      .select('owner')
      .lean();
    if (!store) throw new Error('Store does not exist');

    if (
      verifyOwnership &&
      currentUser &&
      store.owner.toString() !== currentUser._id.toString()
    ) {
      throw new Error('Unauthorized: You can only access stores you own');
    }

    return { _id: storeId, ownerId: store.owner };
  }

  async _ensureUserForEmployee({
    user,
    userEmail,
    userName,
    userPhone,
    userPassword,
    userProfilePicture,
    designation,
    createdBy,
    businessId,
  }) {
    const orConditions = [];
    if (user) orConditions.push({ _id: user });
    if (userEmail) orConditions.push({ email: userEmail });

    if (orConditions.length > 0) {
      const existing = await User.findOne(
        orConditions.length > 1 ? { $or: orConditions } : orConditions[0],
      )
        .populate('roleId', 'name')
        .select('-password -__v')
        .lean();
      if (existing) return existing;
    }

    if (!userEmail) throw new Error('Email is required to create a new user');

    const roleNameByDesignation =
      designation === 'manager' ? 'manager' : 'cashier';
    let roleId = this._roleCache.get(roleNameByDesignation);
    if (!roleId) {
      const roleDoc = await Role.findOne({ name: roleNameByDesignation })
        .select('_id')
        .lean();
      roleId = roleDoc ? roleDoc._id : 4;
      this._roleCache.set(roleNameByDesignation, roleId);
    }

    const tempPassword =
      userPassword || `${Math.random().toString(36).slice(-10)}A1!`;
    const hashed = await PasswordUtils.hashPassword(tempPassword);

    const userData = {
      name: userName || userEmail.split('@')[0],
      email: userEmail,
      password: hashed,
      phone: userPhone || 'N/A',
      roleId,
      parentId: createdBy,
      isActive: true,
    };

    // Attach business context so manager/cashier tokens carry businessId
    if (businessId) {
      userData.businessId = businessId;
    }

    // Add optional fields if provided
    if (userProfilePicture) userData.profilePicture = userProfilePicture;

    const createdUser = await User.create(userData);

    return {
      _id: createdUser._id,
      name: createdUser.name,
      email: createdUser.email,
      phone: createdUser.phone,
      profilePicture: createdUser.profilePicture,
      roleId: { _id: roleId, name: roleNameByDesignation },
      parentId: createdUser.parentId,
      isActive: createdUser.isActive,
    };
  }

  async _checkEmployeeExistence(userId, storeId, EmployeeModel) {
    const existingEmployee = await EmployeeModel.findOne({
      user: userId,
      store: storeId || null,
    });
    if (existingEmployee) {
      const storeMessage = storeId ? 'and store' : 'as unassigned employee';
      throw new Error(`Employee already exists for this user ${storeMessage}`);
    }
  }

  _validateManagerDesignation(userExists, designation) {
    if (designation === 'manager') {
      const userRole = userExists.roleId?.name;
      if (!['admin', 'manager'].includes(userRole)) {
        throw new Error(
          'Only admin users or existing managers can be assigned as store managers',
        );
      }
    }
  }

  // ========================================
  // CRUD OPERATIONS
  // ========================================

  async createEmployee(employeeData, currentUser, businessId) {
    const {
      user,
      store,
      designation,
      userEmail,
      userName,
      userPhone,
      userPassword,
      userProfilePicture,
      salary,
    } = employeeData;
    console.log(employeeData);
    const EmployeeModel = await this.getModelRef();
    const roleName = currentUser.roleId?.name;

    // Cashier: cannot create employees; return null without throwing
    if (roleName === 'cashier') return null;

    if (store && roleName === 'manager') {
      const managerEmployee = await EmployeeModel.findOne({
        user: currentUser._id,
        store: store,
        designation: 'manager',
        isActive: true,
      })
        .select('_id')
        .lean();
      if (!managerEmployee) {
        throw new Error(
          'Unauthorized: You can only access stores where you are assigned as manager',
        );
      }
    }

    if (store) await this._validateUserAndStore(store);

    const [ensuredUser, staffLimitCheck] = await Promise.all([
      this._ensureUserForEmployee({
        user,
        userEmail,
        userName,
        userPhone,
        userPassword,
        userProfilePicture,
        designation,
        createdBy: currentUser._id,
        businessId,
      }),
      this._checkStaffLimitAsync(store, currentUser._id, businessId),
    ]);

    if (staffLimitCheck)
      throw new Error('Staff limit reached for your subscription plan');

    employeeData.createdBy = currentUser._id;
    employeeData.user = ensuredUser._id;
    if (!store) employeeData.isActive = false;
    if (salary !== undefined) employeeData.salary = salary;

    try {
      const employee = await EmployeeModel.create(employeeData);
      return await this._populateEmployee(employee, EmployeeModel, true);
    } catch (err) {
      if (err?.code === 11000) {
        const storeMessage = store ? 'and store' : 'as unassigned employee';
        throw new Error(
          `Employee already exists for this user ${storeMessage}`,
        );
      }
      throw err;
    }
  }

  async getEmployeeById(id, currentUser, businessId) {
    const EmployeeModel = await this.getModelRef();
    const employee = await this._findAndVerifyEmployee(
      id,
      currentUser,
      currentUser.roleId?.name,
      EmployeeModel,
    );
    if (!employee) return null;
    return await this._populateEmployee(id, EmployeeModel);
  }

  async updateEmployee(id, updateData, currentUser, businessId) {
    const EmployeeModel = await this.getModelRef();
    const employee = await this._findAndVerifyEmployee(
      id,
      currentUser,
      currentUser.roleId?.name,
      EmployeeModel,
    );
    if (!employee) return null;

    const { user, store, salary, ...updateFields } = updateData;
    updateFields.updatedBy = currentUser._id;
    if (salary !== undefined) updateFields.salary = salary;

    if (store && (!employee.store || store.toString() !== employee.store.toString())) {
      await this._validateUserAndStore(store);

      if (currentUser.roleId?.name === 'manager') {
        const managerEmployee = await EmployeeModel.findOne({
          user: currentUser._id,
          store: store,
          designation: 'manager',
          isActive: true,
        })
          .select('_id')
          .lean();

        if (!managerEmployee) {
          throw new Error(
            'Unauthorized: You can only assign employees to stores where you are a manager',
          );
        }
      }

      const limitCheck = await this._checkStaffLimitAsync(
        store,
        currentUser._id,
        businessId,
      );
      if (limitCheck)
        throw new Error('Staff limit reached for the target store');

      updateFields.store = store;
    }

    if (user && typeof user === 'object') {
      const userUpdateData = this._buildUserUpdateData(user);

      if (Object.keys(userUpdateData).length > 0) {
        await this._validateUserEmailChange(userUpdateData, employee);
        await this._handleProfilePictureChange(userUpdateData, employee);
        await User.findByIdAndUpdate(employee.user, userUpdateData, {
          new: true,
          runValidators: true,
        });
      }
    }

    const updatedEmployee = await EmployeeModel.findByIdAndUpdate(
      id,
      updateFields,
      {
        new: true,
        runValidators: true,
      },
    );

    if (!updatedEmployee) throw new Error('Employee not found');
    return await this._populateEmployee(updatedEmployee, EmployeeModel);
  }

  async deleteEmployee(id, currentUser, businessId) {
    const EmployeeModel = await this.getModelRef();
    const employee = await this._findAndVerifyEmployee(
      id,
      currentUser,
      currentUser.roleId?.name,
      EmployeeModel,
    );
    if (!employee) return false;

    await EmployeeModel.findByIdAndUpdate(id, {
      store: null,
      isActive: false,
      updatedBy: currentUser._id,
    });

    return true;
  }

  _buildUserUpdateData(user) {
    const userUpdateData = {};
    if (user.name) userUpdateData.name = user.name;
    if (user.email) userUpdateData.email = user.email;
    if (user.phone) userUpdateData.phone = user.phone;
    if (user.profilePicture !== undefined)
      userUpdateData.profilePicture = user.profilePicture;
    return userUpdateData;
  }

  async _validateUserEmailChange(userUpdateData, employee) {
    if (userUpdateData.email && userUpdateData.email !== employee.user.email) {
      const existingUser = await User.findOne({ email: userUpdateData.email });
      if (
        existingUser &&
        existingUser._id.toString() !== employee.user.toString()
      ) {
        throw new Error('Email already exists for another user');
      }
    }
  }

  async _handleProfilePictureChange(userUpdateData, employee) {
    // Check if profilePicture is being updated (even if set to empty/null)
    if (userUpdateData.profilePicture === undefined) return;

    const current = await User.findById(employee.user)
      .select('profilePicture')
      .lean();

    // Delete old image if it exists and is different from the new one
    // This handles both: updating to a new image OR removing the image (setting to empty/null)
    if (
      current?.profilePicture &&
      current.profilePicture !== userUpdateData.profilePicture
    ) {
      try {
        await deleteImage(current.profilePicture, 'profileImages');
      } catch (err) {
        console.error('Failed to delete old profile picture:', err);
        // Don't throw - continue with update even if deletion fails
      }
    }
  }

  async toggleEmployeeStatus(id, currentUser, businessId) {
    const EmployeeModel = await this.getModelRef();
    const employee = await this._findAndVerifyEmployee(
      id,
      currentUser,
      currentUser.roleId?.name,
      EmployeeModel,
    );
    if (!employee) return null;

    const updatedEmployee = await EmployeeModel.findByIdAndUpdate(
      id,
      { isActive: !employee.isActive, updatedBy: currentUser._id },
      { new: true, runValidators: true },
    );

    return await this._populateEmployee(updatedEmployee, EmployeeModel);
  }

  async assignEmployeeToStore(employeeId, storeId, currentUser, businessId) {
    if (
      !mongoose.isValidObjectId(employeeId) ||
      !mongoose.isValidObjectId(storeId)
    ) {
      throw new Error('Invalid employee ID or store ID');
    }

    const EmployeeModel = await this.getModelRef();
    const roleName = currentUser.roleId?.name;

    const employee = await EmployeeModel.findById(employeeId);
    if (!employee) throw new Error('Employee not found');

    const store = await this._validateUserAndStore(
      storeId,
      currentUser,
      roleName === 'admin',
    );
    await this._validateAssignmentPermissions(
      employee,
      store,
      currentUser,
      roleName,
    );

    if (roleName === 'manager') {
      const managerEmployee = await EmployeeModel.findOne({
        user: currentUser._id,
        store: storeId,
        designation: 'manager',
        isActive: true,
      })
        .select('_id')
        .lean();
      if (!managerEmployee) {
        throw new Error(
          'Unauthorized: You can only access stores where you are assigned as manager',
        );
      }
    }

    if (employee.store?.toString() === storeId) {
      throw new Error('Employee is already assigned to this store');
    }

    const existingEmployee = await EmployeeModel.findOne({
      user: employee.user,
      store: storeId,
      isActive: true,
    });
    if (existingEmployee)
      throw new Error('This user is already assigned to this store');

    try {
      const hasReachedStaffLimit = await this.hasReachedStaffLimit(
        store.ownerId,
        businessId,
      );
      if (hasReachedStaffLimit) {
        throw new Error(
          "Staff limit reached for this store owner's subscription plan",
        );
      }
    } catch (error) {
      if (error.message.includes('Staff limit reached')) throw error;
      console.warn(
        'Staff limit check failed during assignment:',
        error.message,
      );
    }

    const updatedEmployee = await EmployeeModel.findByIdAndUpdate(
      employeeId,
      { store: storeId, isActive: true, updatedBy: currentUser._id },
      { new: true, runValidators: true },
    );

    return await this._populateEmployee(updatedEmployee, EmployeeModel);
  }

  async unassignEmployeeFromStore(employeeId, currentUser, businessId) {
    if (!mongoose.isValidObjectId(employeeId))
      throw new Error('Invalid employee ID');

    const EmployeeModel = await this.getModelRef();
    const roleName = currentUser.roleId?.name;

    // Cashier: cannot unassign; return null without throwing
    if (roleName === 'cashier') return null;

    const accessContext = await this._validateAccessControl(currentUser, {});

    await this._findAndVerifyEmployee(
      employeeId,
      currentUser,
      accessContext.role,
      EmployeeModel,
    );

    const updatedEmployee = await EmployeeModel.findByIdAndUpdate(
      employeeId,
      { store: null, isActive: false, updatedBy: currentUser._id },
      { new: true, runValidators: true },
    );

    return await this._populateEmployee(updatedEmployee, EmployeeModel);
  }

  async bulkGet(ids, currentUser) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new Error('IDs must be a non-empty array');
    }

    const EmployeeModel = await this.getModelRef();
    let filter = { _id: { $in: ids } };

    // Store-scoping / role: cashier only sees their own records
    if (currentUser?.roleId?.name === 'cashier') {
      filter.user = currentUser._id;
    } else if (currentUser?.roleId?.name === 'manager') {
      const accessContext = await this._validateAccessControl(currentUser, {});
      if (accessContext.accessibleStores?.length) {
        filter.store = { $in: accessContext.accessibleStores };
      } else {
        filter.store = { $in: [] };
      }
    } else if (currentUser?.roleId?.name === 'admin') {
      const accessContext = await this._validateAccessControl(currentUser, {});
      if (accessContext.accessibleStores?.length) {
        filter.$or = [
          { store: { $in: accessContext.accessibleStores } },
          { store: null },
        ];
      } else {
        filter.store = null;
      }
    }

    const employees = await EmployeeModel.find(filter)
      .select(
        'user store designation joinDate salary isActive createdBy updatedBy createdAt updatedAt',
      )
      .lean();

    await this._batchPopulateEmployees(employees, { minimal: false });

    return {
      documents: employees,
      found: employees.length,
      totalRequested: ids.length,
    };
  }

  async bulkUpdateStatus(ids, status, currentUser) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new Error('IDs must be a non-empty array');
    }

    const EmployeeModel = await this.getModelRef();
    let filter = { _id: { $in: ids } };

    // Store-scoping / role: cashier only their own
    if (currentUser?.roleId?.name === 'cashier') {
      filter.user = currentUser._id;
    } else if (currentUser?.roleId?.name === 'manager') {
      const accessContext = await this._validateAccessControl(currentUser, {});
      if (accessContext.accessibleStores?.length) {
        filter.store = { $in: accessContext.accessibleStores };
      } else {
        filter.store = { $in: [] };
      }
    } else if (currentUser?.roleId?.name === 'admin') {
      const accessContext = await this._validateAccessControl(currentUser, {});
      if (accessContext.accessibleStores?.length) {
        filter.$or = [
          { store: { $in: accessContext.accessibleStores } },
          { store: null },
        ];
      } else {
        filter.store = null;
      }
    }

    const result = await EmployeeModel.updateMany(
      filter,
      {
        $set: {
          isActive: status,
          updatedBy: currentUser._id,
        },
      },
      { runValidators: true },
    );

    return {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
    };
  }

  async bulkDelete(ids, currentUser) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new Error('IDs must be a non-empty array');
    }

    const EmployeeModel = await this.getModelRef();
    let filter = { _id: { $in: ids } };

    // Store-scoping / role: cashier only their own
    if (currentUser?.roleId?.name === 'cashier') {
      filter.user = currentUser._id;
    } else if (currentUser?.roleId?.name === 'manager') {
      const accessContext = await this._validateAccessControl(currentUser, {});
      if (accessContext.accessibleStores?.length) {
        filter.store = { $in: accessContext.accessibleStores };
      } else {
        filter.store = { $in: [] };
      }
    } else if (currentUser?.roleId?.name === 'admin') {
      const accessContext = await this._validateAccessControl(currentUser, {});
      if (accessContext.accessibleStores?.length) {
        filter.$or = [
          { store: { $in: accessContext.accessibleStores } },
          { store: null },
        ];
      } else {
        filter.store = null;
      }
    }

    // Instead of hard delete, we'll do what deleteEmployee does: unassign and deactivate
    const result = await EmployeeModel.updateMany(
      filter,
      {
        $set: {
          store: null,
          isActive: false,
          updatedBy: currentUser._id,
        },
      },
      { runValidators: true },
    );

    return {
      modifiedCount: result.modifiedCount,
      matchedCount: result.matchedCount,
    };
  }

  // ========================================
  // QUERY AND SEARCH METHODS
  // ========================================

  async getEmployees(filters, queryParams, currentUser, businessId) {
    const safeFilters = filters || {};
    const safeQuery = queryParams || {};
    const { storeId, user, designation, isActive } = safeFilters;
    const { page = 1, limit = 10, search, all } = safeQuery;
    const EmployeeModel = await this.getModelRef();

    if (storeId && !mongoose.isValidObjectId(storeId))
      throw new Error('Invalid store ID');
    if (user && !mongoose.isValidObjectId(user))
      throw new Error('Invalid user ID');

    const matchQuery = await this._buildMatchQuery(
      currentUser,
      { storeId, user, designation, isActive },
      businessId,
    );
    matchQuery.$or = [{ store: { $ne: null } }, { isActive: true }];

    if (user) {
      const employees = await EmployeeModel.find(matchQuery)
        .select(
          'user store designation joinDate salary isActive createdBy updatedBy createdAt updatedAt',
        )
        .lean();
      await this._batchPopulateEmployees(employees, { minimal: false });
      return employees;
    }

    return await this._executeQueryWithPagination(
      matchQuery,
      { search, page, limit, all },
      EmployeeModel,
    );
  }

  async getManagerStores(currentUser, businessId) {
    const EmployeeModel = await this.getModelRef();
    const roleName = currentUser.roleId?.name;

    if (roleName === 'admin') {
      const StoreModel = await this.getModel('Store', StoreSchema, 'stores');
      return await StoreModel.find({ owner: currentUser._id }).select(
        '_id name address',
      );
    } else {
      const accessibleStoreIds = await EmployeeModel.find({
        user: currentUser._id,
        designation: 'manager',
        isActive: true,
      }).distinct('store');
      if (!accessibleStoreIds.length) return [];
      const StoreModel = await this.getModel('Store', StoreSchema, 'stores');
      return await StoreModel.find({ _id: { $in: accessibleStoreIds } }).select(
        '_id name address',
      );
    }
  }

  // ========================================
  // CONSOLIDATED QUERY AND PAGINATION METHODS
  // ========================================

  async _buildMatchQuery(currentUser, filters, businessId) {
    const safeFilters = filters || {};
    const accessContext = await this._validateAccessControl(currentUser, {
      storeId: safeFilters.storeId,
      requireStoreAccess: !!safeFilters.storeId,
    });

    const matchQuery = {};

    // Cashier: only their own employee record(s)
    if (accessContext.selfOnly) {
      matchQuery.user = new mongoose.Types.ObjectId(currentUser._id);
    } else if (safeFilters.storeId) {
      matchQuery.store = new mongoose.Types.ObjectId(
        String(safeFilters.storeId),
      );
    } else if (accessContext.role === 'manager') {
      if (accessContext.accessibleStores.length === 0) {
        matchQuery.store = { $in: [] }; // no stores = empty result, no throw
      } else {
        matchQuery.store = { $in: accessContext.accessibleStores };
      }
    } else if (accessContext.role === 'admin') {
      if (accessContext.accessibleStores.length === 0) {
        matchQuery.store = null;
      } else {
        matchQuery.$or = [
          { store: { $in: accessContext.accessibleStores } },
          { store: null },
        ];
      }
    }

    if (safeFilters.designation)
      matchQuery.designation = safeFilters.designation;
    if (safeFilters.isActive !== undefined)
      matchQuery.isActive =
        safeFilters.isActive === 'true' || safeFilters.isActive === true;
    if (safeFilters.user)
      matchQuery.user = new mongoose.Types.ObjectId(String(safeFilters.user));

    return matchQuery;
  }

  async _executeQueryWithPagination(matchQuery, options, EmployeeModel) {
    const opts = options || {};
    const { search, page = 1, limit = 10, all } = opts;
    const shouldFetchAll = all === true || all === 'true';

    let filter = matchQuery;

    if (search) {
      const userSearch = await User.find({
        $or: [
          { email: { $regex: search, $options: 'i' } },
          { name: { $regex: search, $options: 'i' } },
        ],
      })
        .select('_id')
        .lean();

      const candidateUserIds = userSearch.map((u) => u._id);
      filter = {
        $and: [
          matchQuery,
          {
            $or: [
              candidateUserIds.length
                ? { user: { $in: candidateUserIds } }
                : { _id: { $exists: true } },
              { designation: { $regex: search, $options: 'i' } },
            ],
          },
        ],
      };
    }

    let query = EmployeeModel.find(filter)
      .sort({ joinDate: -1 })
      .select(
        'user store designation joinDate salary isActive createdBy updatedBy createdAt updatedAt',
      )
      .lean();

    if (!shouldFetchAll) {
      const skip = (page - 1) * limit;
      query = query.skip(skip).limit(Number.parseInt(limit));
    }

    const [employees, total] = await Promise.all([
      query,
      EmployeeModel.countDocuments(filter),
    ]);

    await this._batchPopulateEmployees(employees, { minimal: false });

    if (shouldFetchAll) {
      return {
        data: employees,
        total: total,
      };
    }

    const totalPages = Math.ceil(total / limit);

    return {
      data: employees,
      pagination: {
        currentPage: Number.parseInt(page),
        totalPages,
        totalItems: total,
        itemsPerPage: Number.parseInt(limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }
}

export default EmployeeService;
