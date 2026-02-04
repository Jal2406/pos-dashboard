import { runInContext } from '../utils/requestContext.js';
import { EmployeeSchema } from '../models/index.js';
import { createTenantModelFactory } from '../config/dbManager.js';
import mongoose from 'mongoose';

/**
 * Middleware to populate request context from req.user and req.businessId
 * This makes user context available to all services via AsyncLocalStorage
 * without requiring manual parameter passing
 * 
 * MUST run after auth middleware and businessAccessMiddleware
 */
export async function populateRequestContext(req, res, next) {
  // Extract user and businessId from request
  const user = req.user;
  const businessId = req.businessId;
  
  // If no user, skip context population (let auth middleware handle it)
  if (!user) {
    return next();
  }
  
  // Extract role
  const role = user.roleId?.name || user.role;
  
  // Build base context
  const context = {
    user: {
      _id: user._id,
      userId: user._id,
      role,
      roleId: user.roleId,
      permissions: user.permissions || [],
      businessId: user.businessId || businessId,
    },
    businessId: businessId || user.businessId,
  };
  
  try {
    // Resolve store access based on role
    const storeAccess = await resolveStoreAccess(user, role, businessId);
    context.accessibleStoreIds = storeAccess.storeIds;
    context.storeId = storeAccess.singleStoreId;
    context.activeShiftId = storeAccess.activeShiftId;
  } catch (error) {
    console.error('[RequestContext] Error resolving store access:', error);
    // Continue without store context (will be handled by guards)
    context.accessibleStoreIds = [];
    context.storeId = null;
    context.activeShiftId = null;
  }
  
  // Run the rest of the request within this context
  runInContext(context, () => {
    next();
  });
}

/**
 * Resolve store IDs accessible to user based on role
 * @param {Object} user - User object
 * @param {String} role - User role
 * @param {String} businessId - Business ID
 * @returns {Promise<Object>} Store access information
 */
async function resolveStoreAccess(user, role, businessId) {
  // Superadmin: unrestricted
  if (role === 'superadmin') {
    return {
      storeIds: null, // null = unrestricted
      singleStoreId: null,
      activeShiftId: null,
    };
  }
  
  // Admin: business-scoped (no store-level restriction)
  if (role === 'admin') {
    return {
      storeIds: null, // null = all stores in business
      singleStoreId: null,
      activeShiftId: null,
    };
  }
  
  // Manager and Cashier: resolve from Employee records
  if (role === 'manager' || role === 'cashier') {
    if (!businessId) {
      return {
        storeIds: [],
        singleStoreId: null,
        activeShiftId: null,
      };
    }
    
    try {
      // Get tenant-specific Employee model
      const factory = createTenantModelFactory(businessId);
      const EmployeeModel = await factory.getModel(
        'Employee',
        EmployeeSchema,
        'employees'
      );
      
      // Find active employee records for this user
      const employeeQuery = {
        user: user._id,
        isActive: true,
      };
      
      if (role === 'manager') {
        employeeQuery.designation = 'manager';
      } else if (role === 'cashier') {
        employeeQuery.designation = 'cashier';
      }
      
      const employees = await EmployeeModel.find(employeeQuery)
        .select('store')
        .lean();
      
      const storeIds = employees
        .map(emp => emp.store)
        .filter(Boolean)
        .map(id => id.toString());
      
      // Manager: multiple stores
      if (role === 'manager') {
        return {
          storeIds: storeIds.length > 0 ? storeIds : [],
          singleStoreId: null,
          activeShiftId: null,
        };
      }
      
      // Cashier: single store (take first if multiple exist)
      if (role === 'cashier') {
        const singleStoreId = storeIds.length > 0 ? storeIds[0] : null;
        
        // TODO: Resolve activeShiftId from Shift model if needed
        // For now, return null
        const activeShiftId = null;
        
        return {
          storeIds: singleStoreId ? [singleStoreId] : [],
          singleStoreId,
          activeShiftId,
        };
      }
    } catch (error) {
      console.error('[RequestContext] Error fetching employee records:', error);
      return {
        storeIds: [],
        singleStoreId: null,
        activeShiftId: null,
      };
    }
  }
  
  // Unknown role: no access
  return {
    storeIds: [],
    singleStoreId: null,
    activeShiftId: null,
  };
}

export default populateRequestContext;
