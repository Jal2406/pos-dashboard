import { BaseService } from '../utils/index.js';
import { getRole } from '../utils/requestContext.js';
import { validateStoreAccess } from '../utils/serviceGuard.js';
import {
  StoreSchema,
  EmployeeSchema,
  User,
  Subscription,
} from '../models/index.js';
import mongoose from 'mongoose';

class StoreService extends BaseService {
  constructor(businessId) {
    if (!businessId) {
      throw new Error('StoreService initialized without businessId');
    }
    super({
      modelName: 'Store',
      schema: StoreSchema,
      collection: 'stores',
      businessId,
    });
    // Simple in-memory cache for subscription data (5 minute TTL)
    this.subscriptionCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes

    // Cache for user data to avoid repeated lookups
    this.userCache = new Map();
    this.userCacheTimeout = 2 * 60 * 1000; // 2 minutes
  }

  /**
   * Get cached subscription data or fetch from database
   * @param {String} userId - User ID
   * @returns {Promise<Object>} Cached or fresh subscription data
   */
  getCachedSubscription(userId) {
    const cacheKey = `sub_${userId}`;
    const cached = this.subscriptionCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    return null;
  }

  /**
   * Set subscription data in cache
   * @param {String} userId - User ID
   * @param {Object} data - Subscription data
   */
  setCachedSubscription(userId, data) {
    const cacheKey = `sub_${userId}`;
    this.subscriptionCache.set(cacheKey, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Get cached user data or fetch from database
   * @param {String} userId - User ID
   * @returns {Object|null} Cached or null
   */
  getCachedUser(userId) {
    const cacheKey = `user_${userId}`;
    const cached = this.userCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.userCacheTimeout) {
      return cached.data;
    }

    return null;
  }

  /**
   * Set user data in cache
   * @param {String} userId - User ID
   * @param {Object} data - User data
   */
  setCachedUser(userId, data) {
    const cacheKey = `user_${userId}`;
    this.userCache.set(cacheKey, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Helper method to populate store with owner details
   * @param {Object} store - Store object
   * @returns {Promise<Object>} Populated store
   */
  async populateStore(store) {
    if (!store) {
      return null;
    }
    const StoreModel = await this.getModelRef();
    const storeDoc = await StoreModel.findById(store._id).lean();
    if (!storeDoc) return null;
    const owner = storeDoc.owner
      ? await User.findById(storeDoc.owner)
        .select('firstName lastName email')
        .lean()
      : null;
    return { ...storeDoc, owner };
  }

  /**
   * Helper method to populate employee with related details
   * @param {Object} employee - Employee object
   * @returns {Promise<Object>} Populated employee
   */
  async populateEmployee(employee) {
    if (!employee) {
      return null;
    }
    const EmployeeModel = await this.getModel(
      'Employee',
      EmployeeSchema,
      'employees',
    );
    const emp = await EmployeeModel.findById(employee._id).lean();
    if (!emp) return null;
    const [user, storeDoc, createdBy] = await Promise.all([
      emp.user
        ? User.findById(emp.user)
          .select('firstName lastName email phone profilePicture')
          .lean()
        : Promise.resolve(null),
      emp.store
        ? (await this.getModelRef())
          .findById(emp.store)
          .select('name address')
          .lean()
        : Promise.resolve(null),
      emp.createdBy
        ? User.findById(emp.createdBy).select('firstName lastName email').lean()
        : Promise.resolve(null),
    ]);
    return { ...emp, user, store: storeDoc, createdBy };
  }

  /**
   * Get active stores
   * @returns {Promise<Array>} Active stores
   */
  async getActiveStores() {
    try {
      const StoreModel = await this.getModelRef();
      const stores = await StoreModel.find({ status: true, isDeleted: false })
        .select('_id name location')
        .sort({ name: 1 })
        .lean();
      return stores;
    } catch (error) {
      throw new Error(`Error retrieving active stores: ${error.message}`);
    }
  }

  /**
   * Bulk get stores by IDs
   * @param {Array<string>} ids - Store IDs to retrieve
   * @param {Object} options - Optional configuration
   * @param {Object|Array|string|null} options.populate - Populate definition
   * @param {Boolean} options.lean - Return lean documents (default: true)
   * @param {Boolean} options.throwOnNotFound - Throw if any ID missing (default: false)
   */
  async bulkGetStores(ids, options = {}) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('Store IDs array is required and must not be empty');
      }

      const normalizedIds = ids.map((id) => {
        const normalized =
          typeof id === 'string' ? id.trim() : id?.toString?.();
        if (!normalized) {
          throw new Error('Invalid store ID format');
        }
        this.validateObjectId(normalized);
        return normalized;
      });

      const { populate = null, lean = true, throwOnNotFound = false } = options;

      const result = await this.bulkGetByIds(normalizedIds, {
        populate,
        lean,
        throwOnNotFound,
      });

      return {
        data: result.documents,
        found: result.found,
        notFound: result.notFound,
        totalRequested: result.totalRequested,
      };
    } catch (error) {
      throw new Error(`Bulk get stores failed: ${error.message}`);
    }
  }

  /**
   * Get user's active subscription with plan details
   * @param {String} userId - User ID
   * @returns {Promise<Object>} Subscription with plan
   */
  async getUserSubscription(userId) {
    try {
      this.validateObjectId(userId);

      // Try active subscription first
      let subscription = await Subscription.findOne({
        user: userId,
        status: true,
      })
        .populate('planName')
        .lean();

      // Fallback to any subscription (dev/testing)
      if (!subscription) {
        subscription = await Subscription.findOne({ user: userId })
          .populate('planName')
          .lean();
        if (subscription) {
          console.log('Found non-active subscription:', {
            subscriptionId: subscription._id,
            status: subscription.status,
            planId: subscription.planName?._id,
          });
        }
      }

      if (!subscription) {
        console.warn(
          `No subscription found for user ${userId}. This might be a development/testing scenario.`,
        );
        return { allowCreation: false, reason: 'No subscription found' };
      }

      if (!subscription.planName) {
        throw new Error('Subscription plan not found or not populated');
      }

      return subscription;
    } catch (error) {
      throw new Error(`Error fetching subscription: ${error.message}`);
    }
  }

  /**
   * Optimized method to get only store limit from subscription with caching
   * @param {String} userId - User ID
   * @returns {Promise<Number>} Store limit
   */
  async getStoreLimit(userId) {
    try {
      this.validateObjectId(userId);

      // Check cache first
      const cached = this.getCachedSubscription(userId);
      if (cached && cached.storeLimit) {
        return cached.storeLimit;
      }

      const subscription = await this.getUserSubscription(userId);

      // Allow in dev/testing when no subscription
      if (subscription.allowCreation) {
        console.log('No subscription found, allowing store creation');
        return Number.MAX_SAFE_INTEGER;
      }

      const storeLimit = subscription.planName.storeLimit;
      if (!storeLimit || storeLimit <= 0) {
        throw new Error('Invalid store limit in plan');
      }

      // Cache the result
      this.setCachedSubscription(userId, { storeLimit });

      return storeLimit;
    } catch (error) {
      throw new Error(`Error fetching store limit: ${error.message}`);
    }
  }

  /**
   * Check if user has reached store limit for their subscription
   * @param {String} userId - User ID
   * @returns {Promise<Boolean>} True if limit reached
   */
  async hasReachedStoreLimit(userId) {
    try {
      this.validateObjectId(userId);

      const storeLimit = await this.getStoreLimit(userId);

      // Optimization: count only up to the allowed limit using aggregation + $limit
      // Uses index on { owner: 1 } to stop scanning early
      const StoreModel = await this.getModelRef();
      const limitedCountAgg = await StoreModel.aggregate([
        {
          $match: {
            owner: new mongoose.Types.ObjectId(userId),
            isDeleted: false,
          },
        },
        { $limit: storeLimit },
        { $count: 'total' },
      ]);
      const storeCount = limitedCountAgg.length ? limitedCountAgg[0].total : 0;
      return storeCount >= storeLimit;
    } catch (error) {
      throw new Error(`Error checking store limit: ${error.message}`);
    }
  }

  /**
   * Check if user has reached staff limit for their subscription
   * @param {String} userId - User ID
   * @returns {Promise<Boolean>} True if limit reached
   */
  async hasReachedStaffLimit(userId) {
    try {
      this.validateObjectId(userId);

      const subscription = await this.getUserSubscription(userId);

      if (subscription.allowCreation) {
        console.log('No subscription found, allowing employee creation');
        return false;
      }

      const staffLimit = subscription.planName.staffLimit;
      if (!staffLimit || staffLimit <= 0) {
        throw new Error('Invalid user limit in plan');
      }

      const StoreModel = await this.getModelRef();
      const EmployeeModel = await this.getModel(
        'Employee',
        EmployeeSchema,
        'employees',
      );
      const [ownedStoreIds, unassignedCount] = await Promise.all([
        StoreModel.find({ owner: userId, isDeleted: false }).distinct('_id'),
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
    } catch (error) {
      throw new Error(`Error checking staff limit: ${error.message}`);
    }
  }

  /**
   * Create a new store with plan validation - OPTIMIZED VERSION
   * @param {Object} storeData - Store data
   * @param {String} ownerId - Owner user ID
   * @returns {Promise<Object>} Created store
   */
  async createStore(storeData, ownerId) {
    try {
      this.validateObjectId(ownerId);
      this.validateRequiredFields(storeData, ['name']);

      // Set the owner
      storeData.owner = ownerId;

      // OPTIMIZATION: Parallel execution of subscription check and store count
      // This reduces sequential database calls from 3 to 2 parallel calls
      const StoreModel = await this.getModelRef();
      const [storeLimit, storeCount] = await Promise.all([
        this.getStoreLimit(ownerId),
        StoreModel.countDocuments({ owner: ownerId, isDeleted: false }),
      ]);

      // Check if limit is reached
      if (storeCount >= storeLimit) {
        throw new Error('Store limit reached for your subscription plan');
      }

      // OPTIMIZATION: Create store and get owner details in parallel
      const [store, owner] = await Promise.all([
        this.create(storeData),
        User.findById(ownerId).select('_id name username role isActive').lean(),
      ]);

      // Return the store with populated owner (no additional query needed)
      return {
        ...store.toObject(),
        owner,
      };
    } catch (error) {
      console.log(error);
      throw new Error(`Error creating store: ${error.message}`);
    }
  }

  /**
   * Assign a manager to a store with plan validation
   * @param {String} storeId - Store ID
   * @param {String} userId - User ID to assign as manager
   * @param {String} assignedBy - User ID who is making the assignment
   * @returns {Promise<Object>} Created employee record
   */
  async assignManagerToStore(storeId, userId, assignedBy) {
    try {
      // Validate ObjectIds
      this.validateObjectId(storeId);
      this.validateObjectId(userId);
      this.validateObjectId(assignedBy);

      // Validate store exists using base service
      const store = await this.getById(storeId);
      if (!store) {
        throw new Error('Store not found');
      }

      // Check staff limit for the store owner
      const hasReachedStaffLimit = await this.hasReachedStaffLimit(store.owner);
      if (hasReachedStaffLimit) {
        throw new Error('Staff limit reached for your subscription plan');
      }

      // Validate user exists and has appropriate role
      const user = await User.findById(userId).populate('roleId');
      if (!user) {
        throw new Error('User not found');
      }

      const userRole = user.roleId?.name;
      if (userRole !== 'admin' && userRole !== 'manager') {
        throw new Error(
          'Only admin users or existing managers can be assigned as store managers',
        );
      }

      // Check if user is already an employee at another store
      const EmployeeModel = await this.getModel(
        'Employee',
        EmployeeSchema,
        'employees',
      );
      const existingEmployee = await EmployeeModel.findOne({ user: userId });
      if (existingEmployee) {
        throw new Error(
          'User is already an employee at another store. Each employee can only be assigned to one store.',
        );
      }

      // Create employee record with manager designation
      const employeeData = {
        user: userId,
        store: storeId,
        designation: 'manager',
        joinDate: new Date(),
        isActive: true,
        createdBy: assignedBy,
      };

      const employee = await EmployeeModel.create(employeeData);

      // Populate and return
      return await this.populateEmployee(employee);
    } catch (error) {
      throw new Error(`Error assigning manager: ${error.message}`);
    }
  }

  /**
   * Get store by ID with employee information
   * @param {String} storeId - Store ID
   * @returns {Promise<Object>} Store with employees
   */
  async getStoreWithEmployees(storeId) {
    try {
      this.validateObjectId(storeId);
      const StoreModel = await this.getModelRef();
      const storeDoc = await StoreModel.findById(storeId).lean();
      if (!storeDoc) throw new Error('Store not found');

      const EmployeeModel = await this.getModel(
        'Employee',
        EmployeeSchema,
        'employees',
      );
      let employees = await EmployeeModel.find({
        store: storeId,
        isActive: true,
      })
        .sort({ joinDate: -1 })
        .lean();

      const userIds = [
        ...new Set(
          employees
            .map((e) => [e.user, e.createdBy])
            .flat()
            .filter(Boolean)
            .map((id) => id.toString()),
        ),
      ];
      const users = userIds.length
        ? await User.find({ _id: { $in: userIds } })
          .select('firstName lastName email phone profilePicture')
          .lean()
        : [];
      const userMap = new Map(users.map((u) => [u._id.toString(), u]));
      employees = employees.map((e) => ({
        ...e,
        user: e.user ? userMap.get(e.user.toString()) || e.user : null,
        createdBy: e.createdBy
          ? userMap.get(e.createdBy.toString()) || e.createdBy
          : null,
      }));

      const owner = storeDoc.owner
        ? await User.findById(storeDoc.owner)
          .select('firstName lastName email')
          .lean()
        : null;
      const store = { ...storeDoc, owner };
      const managers = employees.filter((emp) => emp.designation === 'manager');

      return {
        store,
        employees,
        managers,
        employeeCount: employees.length,
        managerCount: managers.length,
      };
    } catch (error) {
      throw new Error(`Error fetching store with employees: ${error.message}`);
    }
  }

  /**
   * Update store.
   * Any manager, cashier, or admin can update; scoping unchanged (tenant + store access for manager/cashier).
   * @param {String} storeId - Store ID
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object>} Updated store
   */
  async updateStore(storeId, updateData) {
    try {
      this.validateObjectId(storeId);
      const role = getRole();

      // Manager/cashier: enforce store scoping (only stores they have access to), then update (bypass base so cashier is allowed)
      if (role === 'manager' || role === 'cashier') {
        validateStoreAccess(storeId);
        const Model = await this.getModel();
        const updatedDocument = await Model.findByIdAndUpdate(
          storeId,
          updateData,
          { new: true, runValidators: true },
        );
        if (!updatedDocument) {
          throw new Error(`Store with id ${storeId} not found`);
        }
        return await this.populateStore(updatedDocument);
      }

      // Admin/superadmin: use base service (tenant-scoped via businessId)
      const store = await this.updateById(storeId, updateData);
      return await this.populateStore(store);
    } catch (error) {
      throw new Error(`Error updating store: ${error.message}`);
    }
  }

  /**
   * Soft delete store
   * @param {String} storeId - Store ID
   * @returns {Promise<Object>} Updated store
   */
  async softDeleteStore(storeId) {
    try {
      this.validateObjectId(storeId);

      // Prevent deletion when there are active employees assigned
      const EmployeeModel = await this.getModel(
        'Employee',
        EmployeeSchema,
        'employees',
      );
      const activeEmployees = await EmployeeModel.find({
        store: storeId,
        isActive: true,
      });
      if (activeEmployees.length > 0) {
        throw new Error(
          'Cannot delete store with active employees. Please reassign or deactivate employees first.',
        );
      }

      // Soft delete using base service
      return await this.softDeleteById(storeId);
    } catch (error) {
      throw new Error(`Error deleting store: ${error.message}`);
    }
  }

  /**
   * Bulk update status of stores
   * @param {Array<string>} ids - Store IDs
   * @param {Boolean} status - New status
   * @returns {Promise<Object>} Result
   */
  async bulkUpdateStatusStores(ids, status) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('Store IDs array is required');
      }

      const normalizedIds = ids.map((id) => {
        this.validateObjectId(id);
        return id;
      });

      const StoreModel = await this.getModelRef();
      const result = await StoreModel.updateMany(
        { _id: { $in: normalizedIds } },
        { $set: { status: status } },
      );

      return {
        matched: result.matchedCount,
        modified: result.modifiedCount,
      };
    } catch (error) {
      throw new Error(`Error bulk updating store status: ${error.message}`);
    }
  }

  /**
   * Bulk soft delete stores
   * @param {Array<string>} ids - Store IDs
   * @returns {Promise<Object>} Result
   */
  async bulkDeleteStores(ids) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('Store IDs array is required');
      }

      const normalizedIds = ids.map((id) => {
        this.validateObjectId(id);
        return id;
      });

      // Check for active employees in any of the stores
      const EmployeeModel = await this.getModel(
        'Employee',
        EmployeeSchema,
        'employees',
      );

      const storesWithEmployees = await EmployeeModel.distinct('store', {
        store: { $in: normalizedIds },
        isActive: true,
      });

      if (storesWithEmployees.length > 0) {
        // Create a readable error message
        const StoreModel = await this.getModelRef();
        const stores = await StoreModel.find({ _id: { $in: storesWithEmployees } }).select('name');
        const storeNames = stores.map(s => s.name).join(', ');

        throw new Error(
          `Cannot delete the following stores because they have active employees: ${storeNames}. Please reassign or deactivate employees first.`
        );
      }

      const StoreModel = await this.getModelRef();
      const result = await StoreModel.updateMany(
        { _id: { $in: normalizedIds } },
        {
          $set: {
            isDeleted: true,
            deletedAt: new Date()
          }
        },
      );

      return {
        matched: result.matchedCount,
        modified: result.modifiedCount,
      };
    } catch (error) {
      throw new Error(`Error bulk deleting stores: ${error.message}`);
    }
  }

  /**
   * Find nearby stores
   * @param {Number} lng - Longitude
   * @param {Number} lat - Latitude
   * @param {Number} radius - Search radius in km
   * @returns {Promise<Array>} Nearby stores
   */
  async findNearbyStores(lng, lat, radius) {
    try {
      // Validate coordinates
      if (typeof lng !== 'number' || typeof lat !== 'number') {
        throw new Error('Longitude and latitude must be numbers');
      }

      if (lng < -180 || lng > 180) {
        throw new Error('Longitude must be between -180 and 180');
      }

      if (lat < -90 || lat > 90) {
        throw new Error('Latitude must be between -90 and 90');
      }

      if (!radius || radius <= 0) {
        radius = 5; // Default radius
      }

      // Use aggregation for better performance with geospatial queries
      const StoreModel = await this.getModelRef();
      const stores = await StoreModel.aggregate([
        {
          $geoNear: {
            near: {
              type: 'Point',
              coordinates: [lng, lat],
            },
            distanceField: 'distance',
            maxDistance: radius * 1000, // Convert km to meters
            spherical: true,
          },
        },
      ]);
      const ownerIds = [
        ...new Set(
          stores.map((s) => s.owner && s.owner.toString()).filter(Boolean),
        ),
      ];
      const owners = ownerIds.length
        ? await User.find({ _id: { $in: ownerIds } })
          .select('_id firstName lastName email')
          .lean()
        : [];
      const ownerMap = new Map(owners.map((o) => [o._id.toString(), o]));
      return stores.map((s) => ({
        ...s,
        owner: s.owner ? ownerMap.get(s.owner.toString()) || s.owner : null,
      }));
    } catch (error) {
      throw new Error(`Error finding nearby stores: ${error.message}`);
    }
  }

  /**
   * Search stores with pagination
   * @param {Object} searchParams - Search parameters
   * @returns {Promise<Object>} Search results with pagination
   */
  async searchStores(searchParams) {
    try {
      const {
        query,
        page = 1,
        limit = 10,
        sort = { createdAt: -1 },
      } = searchParams;

      // Use base service pagination validation
      const {
        page: validatedPage,
        limit: validatedLimit,
        skip,
      } = this.validatePagination(page, limit);

      const searchQuery = query
        ? {
          $or: [
            { name: { $regex: query, $options: 'i' } },
            { address: { $regex: query, $options: 'i' } },
            { city: { $regex: query, $options: 'i' } },
            { state: { $regex: query, $options: 'i' } },
          ],
          isDeleted: false,
        }
        : { isDeleted: false };

      // Convert sort object to aggregation sort format
      const sortStage = {};
      Object.entries(sort).forEach(([key, value]) => {
        sortStage[key] = value;
      });

      // Use aggregation for better performance
      const StoreModel = await this.getModelRef();
      const aggregationPipeline = [
        { $match: searchQuery },
        { $sort: sortStage },
        { $skip: skip },
        { $limit: validatedLimit },
      ];

      // Get total count
      const total = await StoreModel.countDocuments(searchQuery);

      // Execute aggregation
      const stores = await StoreModel.aggregate(aggregationPipeline);

      return {
        stores,
        pagination: {
          page: validatedPage,
          limit: validatedLimit,
          total,
          pages: Math.ceil(total / validatedLimit),
        },
      };
    } catch (error) {
      throw new Error(`Error searching stores: ${error.message}`);
    }
  }

  /**
   * List stores with filters and pagination - OPTIMIZED VERSION
   * @param {Object} queryParams - Query parameters
   * @returns {Promise<Object>} Stores with pagination
   */
  async listStores(queryParams) {
    try {
      const {
        page = 1,
        limit = 10,
        search,
        sortBy = 'createdAt',
        sortOrder = -1,
        owner,
        city,
        state,
        country,
        status, // legacy support
        isActive,
        all = false,
        accessibleStoreIds,
      } = queryParams;

      const fetchAll = all === true || all === 'true';

      // Use base service pagination validation unless fetching all
      const {
        page: validatedPage,
        limit: validatedLimit,
        skip,
      } = fetchAll
          ? { page: 1, limit: 0, skip: 0 }
          : this.validatePagination(page, limit);

      // Validate sort order
      if (sortOrder !== 1 && sortOrder !== -1) {
        throw new Error('Sort order must be 1 (ascending) or -1 (descending)');
      }

      // Build match query
      const matchQuery = { isDeleted: false };

      if (owner && !fetchAll && !Array.isArray(accessibleStoreIds)) {
        this.validateObjectId(owner);
        matchQuery.owner = new mongoose.Types.ObjectId(owner);
      }

      // Add status filter (prefer isActive param, fallback to legacy status)
      if (isActive !== undefined) {
        const activeBool =
          typeof isActive === 'string'
            ? isActive.toLowerCase() === 'true'
            : Boolean(isActive);
        matchQuery.status = activeBool;
      } else if (status !== undefined) {
        matchQuery.status = status === true || status === 'true';
      }

      if (search) {
        // Use MongoDB text search for faster multi-field search across text-indexed fields
        matchQuery.$text = { $search: search };
      }

      // Keep regex filters for specific location fields if provided
      if (city) {
        matchQuery['location.city'] = { $regex: city, $options: 'i' };
      }
      if (state) {
        matchQuery['location.state'] = { $regex: state, $options: 'i' };
      }
      if (country) {
        matchQuery['location.country'] = { $regex: country, $options: 'i' };
      }

      // Restrict by explicit list of accessible store IDs when provided
      if (Array.isArray(accessibleStoreIds)) {
        if (accessibleStoreIds.length === 0) {
          // Explicitly no accessible stores → force empty result set
          matchQuery._id = { $in: [] };
        } else {
          const normalizedIds = accessibleStoreIds.map((id) => {
            const strId =
              typeof id === 'string' ? id : id.toString?.();
            if (!strId) {
              throw new Error('Invalid store ID in access control filter');
            }
            this.validateObjectId(strId);
            return new mongoose.Types.ObjectId(strId);
          });
          matchQuery._id = { $in: normalizedIds };
        }
      }

      // OPTIMIZATION: Use parallel queries with smart caching
      // This is much faster for most use cases
      const StoreModel = await this.getModelRef();
      const storesQuery = StoreModel.find(matchQuery)
        .select(
          '_id name description owner email contactNumber location geoLocation storeImage status createdAt updatedAt',
        )
        .sort({ [sortBy]: sortOrder })
        .lean(); // Use lean() for faster query execution

      if (!fetchAll) {
        storesQuery.skip(skip).limit(validatedLimit);
      }

      const [stores, total] = await Promise.all([
        // Get stores (population happens after caching)
        storesQuery,
        // Get total count in parallel
        StoreModel.countDocuments(matchQuery),
      ]);

      // OPTIMIZATION: Batch populate owners using caching
      const uniqueOwnerIds = [
        ...new Set(
          stores.map((store) => store.owner?.toString()).filter(Boolean),
        ),
      ];
      const ownerMap = new Map();

      // Check cache first for all owners
      const uncachedOwnerIds = [];
      for (const ownerId of uniqueOwnerIds) {
        const cached = this.getCachedUser(ownerId);
        if (cached) {
          ownerMap.set(ownerId, cached);
        } else {
          uncachedOwnerIds.push(ownerId);
        }
      }

      // Fetch uncached owners in batch
      if (uncachedOwnerIds.length > 0) {
        const owners = await User.find({ _id: { $in: uncachedOwnerIds } })
          .select('_id name username role isActive')
          .lean();

        // Cache the fetched owners
        for (const owner of owners) {
          this.setCachedUser(owner._id.toString(), owner);
          ownerMap.set(owner._id.toString(), owner);
        }
      }

      // Populate owners in the stores (no id mapping, keep _id as-is)
      const populatedStores = stores.map((store) => ({
        ...store,
        owner: store.owner
          ? ownerMap.get(store.owner.toString()) || null
          : null,
      }));

      if (fetchAll) {
        return {
          data: populatedStores,
          total,
        };
      }

      return {
        stores: populatedStores,
        pagination: {
          page: validatedPage,
          limit: validatedLimit,
          total,
          pages: Math.ceil(total / validatedLimit),
        },
      };
    } catch (error) {
      throw new Error(`Error listing stores: ${error.message}`);
    }
  }

  /**
   * Count stores by user
   * @param {String} userId - User ID
   * @returns {Promise<Number>} Store count
   */
  async countStoresByUser(userId) {
    try {
      this.validateObjectId(userId);
      return await this.count({ owner: userId });
    } catch (error) {
      throw new Error(`Error counting stores: ${error.message}`);
    }
  }

  /**
   * Get all stores with optional filters
   * @param {Object} filters - Filter criteria
   * @returns {Promise<Array>} Stores
   */
  async getAllStores(filters = {}) {
    try {
      return await this.getAllAndPopulate(filters, 'owner');
    } catch (error) {
      throw new Error(`Error fetching stores: ${error.message}`);
    }
  }

  /**
   * Check if store exists
   * @param {String} storeId - Store ID
   * @returns {Promise<Boolean>} True if exists
   */
  async storeExists(storeId) {
    try {
      return await this.exists(storeId);
    } catch (error) {
      throw new Error(`Error checking store existence: ${error.message}`);
    }
  }

  /**
   * Get stores by owner with basic info
   * @param {String} ownerId - Owner ID
   * @returns {Promise<Array>} Stores
   */
  async getStoresByOwner(ownerId) {
    try {
      this.validateObjectId(ownerId);
      return await this.getAllAndPopulate({ owner: ownerId }, 'owner');
    } catch (error) {
      throw new Error(`Error fetching owner stores: ${error.message}`);
    }
  }

  /**
   * Search stores using base service search method
   * @param {String} searchTerm - Search term
   * @param {Object} additionalQuery - Additional query criteria
   * @returns {Promise<Array>} Search results
   */
  async searchStoresByTerm(searchTerm, additionalQuery = {}) {
    try {
      const searchFields = ['name', 'address', 'city', 'state', 'country'];
      return await this.search(searchTerm, searchFields, additionalQuery);
    } catch (error) {
      throw new Error(`Error searching stores: ${error.message}`);
    }
  }

  /**
   * Get stores with advanced pagination using base service
   * @param {Object} query - Query object
   * @param {Number} page - Page number
   * @param {Number} limit - Items per page
   * @param {Object} sort - Sort object
   * @returns {Promise<Object>} Paginated results
   */
  async getStoresWithPagination(
    query = {},
    page = 1,
    limit = 10,
    sort = { createdAt: -1 },
  ) {
    try {
      return await this.findWithPagination(query, page, limit, sort, 'owner');
    } catch (error) {
      throw new Error(
        `Error fetching stores with pagination: ${error.message}`,
      );
    }
  }

  /**
   * Find store by name
   * @param {String} name - Store name
   * @returns {Promise<Object>} Store
   */
  async findStoreByName(name) {
    try {
      if (!name || typeof name !== 'string') {
        throw new Error('Store name is required and must be a string');
      }
      return await this.findOne(
        { name: { $regex: name, $options: 'i' } },
        'owner',
      );
    } catch (error) {
      throw new Error(`Error finding store by name: ${error.message}`);
    }
  }

  /**
   * Get stores by location (city, state, country)
   * @param {String} city - City name
   * @param {String} state - State name
   * @param {String} country - Country name
   * @returns {Promise<Array>} Stores
   */
  async getStoresByLocation(city = null, state = null, country = null) {
    try {
      const query = {};

      if (city) {
        query.city = { $regex: city, $options: 'i' };
      }
      if (state) {
        query.state = { $regex: state, $options: 'i' };
      }
      if (country) {
        query.country = { $regex: country, $options: 'i' };
      }

      if (Object.keys(query).length === 0) {
        throw new Error('At least one location parameter is required');
      }

      return await this.getAllAndPopulate(query, 'owner');
    } catch (error) {
      throw new Error(`Error fetching stores by location: ${error.message}`);
    }
  }

  /**
   * Validate that a manager employee is assigned to a specific store
   * @param {String} userId - User ID of the manager
   * @param {String} storeId - Store ID
   * @returns {Promise<Boolean>} True if manager is assigned to the store
   * @throws {Error} If manager is not assigned to the store
   */
  async validateManagerStoreAccess(userId, storeId) {
    try {
      const EmployeeModel = await this.getModel(
        'Employee',
        EmployeeSchema,
        'employees',
      );
      const managerEmployee = await EmployeeModel.findOne({
        user: userId,
        store: storeId,
        designation: 'manager',
        isActive: true,
      }).lean();

      if (!managerEmployee) {
        throw new Error(
          'You can only view details of stores where you are assigned as manager',
        );
      }

      return true;
    } catch (error) {
      throw new Error(
        error.message || 'Failed to validate manager store access',
      );
    }
  }

  /**
   * Resolve store IDs that a user is allowed to access based on their role
   * - Admin/Superadmin: full access within the business (returns null → no restriction)
   * - Manager: stores where the user is assigned as manager
   * - Cashier: stores where the user is assigned as cashier
   * @param {Object} user - Authenticated user object
   * @returns {Promise<Array|null>} Array of store IDs or null for unrestricted access
   */
  async getAccessibleStoreIdsForUser(user) {
    try {
      if (!user || !user._id) {
        throw new Error('User context is required to determine store access');
      }

      const roleName =
        user.roleId?.name ||
        (typeof user.role === 'string' ? user.role : null);

      if (!roleName) {
        throw new Error('Unable to determine user role for store access');
      }

      // Admin-level roles: full access to all stores within the business
      if (roleName === 'admin' || roleName === 'superadmin') {
        return null;
      }

      const EmployeeModel = await this.getModel(
        'Employee',
        EmployeeSchema,
        'employees',
      );

      const baseQuery = {
        user: user._id,
        isActive: true,
      };

      if (roleName === 'manager') {
        baseQuery.designation = 'manager';
      } else if (roleName === 'cashier') {
        baseQuery.designation = 'cashier';
      } else {
        // Any other role should not see stores via this helper
        return [];
      }

      const storeIds = await EmployeeModel.find(baseQuery).distinct('store');

      return storeIds || [];
    } catch (error) {
      throw new Error(
        `Failed to resolve accessible stores for user: ${error.message}`,
      );
    }
  }
}

export default StoreService;
