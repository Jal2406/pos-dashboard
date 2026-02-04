// controllers/store.controller.js
import { StatusCodes } from 'http-status-codes';
import { ResponseService } from '../utils/index.js';
import { StoreService } from '../services/index.js';
import mongoose from 'mongoose';

// Note: instantiate per request using req.businessId so each call is tenant-scoped

class StoreController {
  /**
   * Check if user has admin role
   * @param {Object} user - User object
   * @returns {Boolean} True if admin
   */
  static isAdmin(user) {
    try {
      return user?.roleId?.name === 'admin';
    } catch (error) {
      console.log(error);
      return false;
    }
  }

  /**
   * Check if user has manager role
   * @param {Object} user - User object
   * @returns {Boolean} True if manager
   */
  static isManager(user) {
    return user?.roleId?.name === 'manager';
  }

  /**
   * Check if user is authenticated
   * @param {Object} user - User object
   * @returns {Boolean} True if authenticated
   */
  static isAuthenticated(user) {
    return user && user._id;
  }

  /**
   * Validate ObjectId format
   * @param {String} id - ID to validate
   * @returns {Boolean} True if valid
   */
  static isValidObjectId(id) {
    return mongoose.isValidObjectId(id);
  }

  /**
   * Create a new store
   */
  static async create(req, res) {
    try {
      const currentUser = req.user;
      const storeService = new StoreService(req.businessId);

      // Authorization check
      if (!StoreController.isAuthenticated(currentUser)) {
        return ResponseService.send(
          res,
          StatusCodes.UNAUTHORIZED,
          'User not authenticated',
        );
      }

      if (!StoreController.isAdmin(currentUser)) {
        return ResponseService.send(
          res,
          StatusCodes.FORBIDDEN,
          'Only admins can create stores',
        );
      }

      // Validate geoLocation is provided
      if (!req.body.geoLocation) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'GeoLocation is required',
        );
      }

      // Prepare store data
      let geoLocation = req.body.geoLocation;

      // Handle geoLocation - it could be a string or already an object
      if (typeof geoLocation === 'string') {
        try {
          geoLocation = JSON.parse(geoLocation);
        } catch (parseError) {
          return ResponseService.send(
            res,
            StatusCodes.BAD_REQUEST,
            'Invalid geoLocation format. Must be valid JSON.',
          );
        }
      }

      // Validate geoLocation structure
      if (
        !geoLocation ||
        !geoLocation.coordinates ||
        !Array.isArray(geoLocation.coordinates) ||
        geoLocation.coordinates.length !== 2
      ) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Invalid geoLocation. Must include coordinates array with [longitude, latitude]',
        );
      }

      const storeData = {
        ...req.body,
        geoLocation,
        storeImage: req.file?.path || req.file?.location || req.body.storeImage,
      };

      const store = await storeService.createStore(storeData, currentUser._id);
      return ResponseService.send(
        res,
        StatusCodes.CREATED,
        'Store created successfully',
        store,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to create store',
      );
    }
  }

  /**
   * Update store details
   */
  static async update(req, res) {
    try {
      const { id } = req.params;
      const currentUser = req.user;
      const storeService = new StoreService(req.businessId);

      // Authorization check
      if (!StoreController.isAuthenticated(currentUser)) {
        return ResponseService.send(
          res,
          StatusCodes.UNAUTHORIZED,
          'User not authenticated',
        );
      }

      // Validate ObjectId
      if (!StoreController.isValidObjectId(id)) {
        console.log('Invalid store ID', id);
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Invalid store ID',
        );
      }

      const updateData = {
        ...req.body,
        storeImage: req.file?.path || req.file?.location || req.body.storeImage,
      };

      const store = await storeService.updateStore(id, updateData);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Store updated successfully',
        store,
      );
    } catch (error) {
      console.log(error);
      if (error.message.includes('not found')) {
        return ResponseService.send(res, StatusCodes.NOT_FOUND, error.message);
      }
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to update store',
      );
    }
  }

  /**
   * Permanently delete store
   */
  static async remove(req, res) {
    try {
      const { id } = req.params;
      const currentUser = req.user;
      const storeService = new StoreService(req.businessId);

      // Authorization check
      if (!StoreController.isAuthenticated(currentUser)) {
        return ResponseService.send(
          res,
          StatusCodes.UNAUTHORIZED,
          'User not authenticated',
        );
      }

      if (!StoreController.isAdmin(currentUser)) {
        return ResponseService.send(
          res,
          StatusCodes.FORBIDDEN,
          'Only admins can delete stores',
        );
      }

      // Validate ObjectId
      if (!StoreController.isValidObjectId(id)) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Invalid store ID',
        );
      }

      const result = await storeService.softDeleteStore(id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Store deleted successfully',
        { deleted: result },
      );
    } catch (error) {
      if (error.message.includes('not found')) {
        return ResponseService.send(res, StatusCodes.NOT_FOUND, error.message);
      }
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to delete store',
      );
    }
  }

  /**
   * Find nearby stores
   */
  static async findNearby(req, res) {
    try {
      const { lng, lat, radius } = req.query;
      const storeService = new StoreService(req.businessId);

      if (!lng || !lat) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Longitude and latitude are required',
        );
      }

      const stores = await storeService.findNearbyStores(
        parseFloat(lng),
        parseFloat(lat),
        parseFloat(radius) || 5,
      );
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Nearby stores fetched successfully',
        stores,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to fetch nearby stores',
      );
    }
  }

  /**
   * Search with pagination
   */
  static async search(req, res) {
    try {
      const storeService = new StoreService(req.businessId);
      const { query, page, limit, sort } = req.body;
      const result = await storeService.searchStores({
        query,
        page,
        limit,
        sort,
      });
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Stores fetched successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to search stores',
      );
    }
  }

  /**
   * Get single store by ID with employee information
   */
  static async getById(req, res) {
    try {
      const { id } = req.params;
      const currentUser = req.user;
      const storeService = new StoreService(req.businessId);

      // Authorization check
      if (!StoreController.isAuthenticated(currentUser)) {
        return ResponseService.send(
          res,
          StatusCodes.UNAUTHORIZED,
          'User not authenticated',
        );
      }

      if (
        !StoreController.isAdmin(currentUser) &&
        !StoreController.isManager(currentUser)
      ) {
        return ResponseService.send(
          res,
          StatusCodes.FORBIDDEN,
          'Only admins and managers can view store details',
        );
      }

      // Validate ObjectId
      if (!StoreController.isValidObjectId(id)) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Invalid store ID',
        );
      }

      // If manager, verify they manage this store
      if (StoreController.isManager(currentUser)) {
        await storeService.validateManagerStoreAccess(currentUser._id, id);
      }

      const storeData = await storeService.getStoreWithEmployees(id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Store fetched successfully',
        storeData,
      );
    } catch (error) {
      if (error.message.includes('not found')) {
        return ResponseService.send(res, StatusCodes.NOT_FOUND, error.message);
      }
      if (
        error.message.includes('You can only view details') ||
        error.message.includes('Unauthorized')
      ) {
        return ResponseService.send(res, StatusCodes.FORBIDDEN, error.message);
      }
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to fetch store',
      );
    }
  }

  /**
   * Assign manager to store
   */
  static async assignManager(req, res) {
    try {
      const { storeId } = req.params;
      const { userId } = req.body;
      const currentUser = req.user;
      const storeService = new StoreService(req.businessId);

      // Authorization check
      if (!StoreController.isAuthenticated(currentUser)) {
        return ResponseService.send(
          res,
          StatusCodes.UNAUTHORIZED,
          'User not authenticated',
        );
      }

      if (!StoreController.isAdmin(currentUser)) {
        return ResponseService.send(
          res,
          StatusCodes.FORBIDDEN,
          'Only admins can assign store managers',
        );
      }

      // Validate required fields
      if (!userId) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'User ID is required to assign manager',
        );
      }

      // Validate ObjectIds
      if (!StoreController.isValidObjectId(storeId)) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Invalid store ID',
        );
      }

      if (!StoreController.isValidObjectId(userId)) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Invalid user ID',
        );
      }

      const employee = await storeService.assignManagerToStore(
        storeId,
        userId,
        currentUser._id,
      );
      return ResponseService.send(
        res,
        StatusCodes.CREATED,
        'Manager assigned to store successfully',
        employee,
      );
    } catch (error) {
      if (error.message.includes('not found')) {
        return ResponseService.send(res, StatusCodes.NOT_FOUND, error.message);
      }
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to assign manager',
      );
    }
  }

  /**
   * Get stores by owner with pagination
   */
  static async list(req, res) {
    try {
      const currentUser = req.user;
      const storeService = new StoreService(req.businessId);

      const roleName =
        currentUser?.roleId?.name ||
        (typeof currentUser?.role === 'string' ? currentUser.role : null);

      // Authorization check
      if (!StoreController.isAuthenticated(currentUser)) {
        return ResponseService.send(
          res,
          StatusCodes.UNAUTHORIZED,
          'User not authenticated',
        );
      }

      // Extract all query parameters
      const {
        page,
        limit,
        search,
        sortBy,
        sortOrder,
        city,
        state,
        country,
        all,
        isActive,
      } = req.query;

      const fetchAll = all === 'true' || all === true;
      const isActiveFilter =
        typeof isActive === 'boolean'
          ? isActive
          : typeof isActive === 'string'
            ? isActive.toLowerCase() === 'true'
            : undefined;

      // Prepare query params object
      const queryParams = {
        page: page ? parseInt(page) : undefined,
        limit: limit ? parseInt(limit) : undefined,
        search,
        sortBy,
        sortOrder,
        owner: fetchAll ? undefined : currentUser._id, // Only show stores owned by current user unless requesting all
        city,
        state,
        country,
        all: fetchAll,
        isActive: isActiveFilter,
      };

      // Remove undefined values
      Object.keys(queryParams).forEach(
        (key) => queryParams[key] === undefined && delete queryParams[key],
      );

      // Restrict visibility based on role:
      // - Admin/Superadmin: full access within business (no additional filter)
      // - Manager: only stores they manage
      // - Cashier: only stores they are assigned to
      if (roleName === 'manager' || roleName === 'cashier') {
        const accessibleStoreIds =
          await storeService.getAccessibleStoreIdsForUser(currentUser);
        queryParams.accessibleStoreIds = accessibleStoreIds;
      }

      // Call the service method with the query params
      const stores = await storeService.listStores(queryParams);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Stores fetched successfully',
        stores,
      );
    } catch (error) {
      console.log(error);

      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch stores',
      );
    }
  }

  /**
   * Get active stores only
   */
  static async getActiveStores(req, res) {
    try {
      const currentUser = req.user;
      const storeService = new StoreService(req.businessId);

      const roleName =
        currentUser?.roleId?.name ||
        (typeof currentUser?.role === 'string' ? currentUser.role : null);

      // Authorization check
      if (!StoreController.isAuthenticated(currentUser)) {
        return ResponseService.send(
          res,
          StatusCodes.UNAUTHORIZED,
          'User not authenticated',
        );
      }

      // Extract query parameters
      const { page, limit, search, sortBy, sortOrder, city, state, country } =
        req.query;

      // Prepare query params object with status filter
      const queryParams = {
        page: page ? parseInt(page) : undefined,
        limit: limit ? parseInt(limit) : undefined,
        search,
        sortBy,
        sortOrder,
        status: true, // Only active stores
        city,
        state,
        country,
      };

      // Remove undefined values
      Object.keys(queryParams).forEach(
        (key) => queryParams[key] === undefined && delete queryParams[key],
      );

      // Restrict visibility based on role for active stores as well
      if (roleName === 'manager' || roleName === 'cashier') {
        const accessibleStoreIds =
          await storeService.getAccessibleStoreIdsForUser(currentUser);
        queryParams.accessibleStoreIds = accessibleStoreIds;
      }

      // Call the service method with the query params
      const stores = await storeService.listStores(queryParams);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Active stores fetched successfully',
        stores,
      );
    } catch (error) {
      console.log(error);

      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch active stores',
      );
    }
  }

  /**
   * Bulk get stores by IDs
   */
  static async bulkGet(req, res) {
    try {
      const currentUser = req.user;
      const { ids, lean, throwOnNotFound, populate } = req.body;

      if (!StoreController.isAuthenticated(currentUser)) {
        return ResponseService.send(
          res,
          StatusCodes.UNAUTHORIZED,
          'User not authenticated',
        );
      }

      if (!StoreController.isAdmin(currentUser)) {
        return ResponseService.send(
          res,
          StatusCodes.FORBIDDEN,
          'Only admins can fetch stores in bulk',
        );
      }

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Store IDs array is required and must not be empty',
        );
      }

      const MAX_IDS = 100;
      if (ids.length > MAX_IDS) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          `Maximum ${MAX_IDS} store IDs allowed per request`,
        );
      }

      const storeService = new StoreService(req.businessId);
      const result = await storeService.bulkGetStores(ids, {
        populate,
        lean,
        throwOnNotFound,
      });

      const message =
        result.found === result.totalRequested
          ? 'All stores fetched successfully'
          : result.found > 0
            ? `${result.found} of ${result.totalRequested} stores fetched successfully`
            : 'No stores found';

      return ResponseService.send(
        res,
        result.found > 0 ? StatusCodes.OK : StatusCodes.NOT_FOUND,
        message,
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Error fetching stores',
      );
    }
  }

  /**
   * Bulk update status of stores
   */
  static async bulkUpdateStatus(req, res) {
    try {
      const currentUser = req.user;
      const { ids, status } = req.body;

      if (!StoreController.isAuthenticated(currentUser)) {
        return ResponseService.send(
          res,
          StatusCodes.UNAUTHORIZED,
          'User not authenticated',
        );
      }

      if (!StoreController.isAdmin(currentUser)) {
        return ResponseService.send(
          res,
          StatusCodes.FORBIDDEN,
          'Only admins can update store status in bulk',
        );
      }

      const storeService = new StoreService(req.businessId);
      const result = await storeService.bulkUpdateStatusStores(ids, status);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Stores status updated successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to update stores status',
      );
    }
  }

  /**
   * Bulk delete stores (soft delete)
   */
  static async bulkDelete(req, res) {
    try {
      const currentUser = req.user;
      const { ids } = req.body;

      if (!StoreController.isAuthenticated(currentUser)) {
        return ResponseService.send(
          res,
          StatusCodes.UNAUTHORIZED,
          'User not authenticated',
        );
      }

      if (!StoreController.isAdmin(currentUser)) {
        return ResponseService.send(
          res,
          StatusCodes.FORBIDDEN,
          'Only admins can delete stores in bulk',
        );
      }

      const storeService = new StoreService(req.businessId);
      const result = await storeService.bulkDeleteStores(ids);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Stores deleted successfully',
        result,
      );
    } catch (error) {
      console.log(error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to delete stores',
      );
    }
  }
}

export default StoreController;
