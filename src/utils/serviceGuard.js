import mongoose from 'mongoose';
import { getRole, getAccessibleStoreIds, getStoreId, getBusinessId } from './requestContext.js';

/**
 * Role capability definitions
 * Defines what each role can do at the method level
 */
const ROLE_CAPABILITIES = {
  superadmin: {
    canRead: true,
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    canMutate: true,
    scopeLevel: 'unrestricted', // No data scoping
  },
  admin: {
    canRead: true,
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    canMutate: true,
    scopeLevel: 'business', // Business-scoped only
  },
  manager: {
    canRead: true,
    canCreate: true,
    canUpdate: true,
    canDelete: false, // Managers cannot delete products
    canMutate: true, // But with restrictions (no price changes)
    scopeLevel: 'store', // Store-scoped (multiple stores)
  },
  cashier: {
    canRead: true,
    canCreate: false, // Generally read-only, but exceptions allowed per-service
    canUpdate: false,
    canDelete: false,
    canMutate: false, // Generally read-only
    scopeLevel: 'store', // Store-scoped (single store)
    // Note: Sales creation is allowed via service-level override
  },
};

/**
 * Fields that cashiers must never see
 * These contain sensitive business information
 */
const CASHIER_HIDDEN_FIELDS = [
  'costPrice',
  'cost',
  'margin',
  'profitMargin',
  'supplier',
  'supplierId',
  'supplierData',
  'purchasePrice',
  'wholesalePrice',
  'internalNotes',
  'adminNotes',
];

/**
 * Fields that managers cannot modify
 * These require admin-level privileges
 */
const MANAGER_RESTRICTED_FIELDS = new Set([
  'sellingPrice',
  'price',
  'costPrice',
  'cost',
  'margin',
  'profitMargin',
]);

/**
 * Get role capabilities for current user
 * @returns {Object} Capabilities object
 */
export function getRoleCapabilities() {
  const role = getRole();
  if (!role) {
    // No role = deny all (should not happen if middleware ran)
    return {
      canRead: false,
      canCreate: false,
      canUpdate: false,
      canDelete: false,
      canMutate: false,
      scopeLevel: 'none',
    };
  }
  
  return ROLE_CAPABILITIES[role] || {
    canRead: false,
    canCreate: false,
    canUpdate: false,
    canDelete: false,
    canMutate: false,
    scopeLevel: 'none',
  };
}

/**
 * Assert that current user can perform mutations (create/update/delete)
 * Throws error if mutation is not allowed
 * @param {String} operation - Operation name for error message
 * @throws {Error} If mutation is not allowed
 */
export function assertCanMutate(operation = 'perform this operation') {
  const capabilities = getRoleCapabilities();
  
  if (!capabilities.canMutate) {
    const role = getRole();
    throw new Error(
      `Access denied: ${role || 'Unauthenticated'} role cannot ${operation}`
    );
  }
}

/**
 * Assert that current user can create entities
 * @throws {Error} If create is not allowed
 */
export function assertCanCreate() {
  const capabilities = getRoleCapabilities();
  
  if (!capabilities.canCreate) {
    const role = getRole();
    throw new Error(
      `Access denied: ${role || 'Unauthenticated'} role cannot create entities`
    );
  }
}

/**
 * Assert that current user can update entities
 * @throws {Error} If update is not allowed
 */
export function assertCanUpdate() {
  const capabilities = getRoleCapabilities();
  
  if (!capabilities.canUpdate) {
    const role = getRole();
    throw new Error(
      `Access denied: ${role || 'Unauthenticated'} role cannot update entities`
    );
  }
}

/**
 * Assert that current user can delete entities
 * @throws {Error} If delete is not allowed
 */
export function assertCanDelete() {
  const capabilities = getRoleCapabilities();
  
  if (!capabilities.canDelete) {
    const role = getRole();
    throw new Error(
      `Access denied: ${role || 'Unauthenticated'} role cannot delete entities`
    );
  }
}

/**
 * Assert that manager is not modifying restricted fields
 * @param {Object} updateData - Update data object
 * @throws {Error} If restricted fields are being modified
 */
export function assertManagerCanUpdateFields(updateData) {
  const role = getRole();
  if (role !== 'manager') return; // Only applies to managers
  
  const restrictedFields = Object.keys(updateData).filter((field) =>
    MANAGER_RESTRICTED_FIELDS.has(field)
  );
  
  if (restrictedFields.length > 0) {
    throw new Error(
      `Access denied: Managers cannot modify restricted fields: ${restrictedFields.join(', ')}`
    );
  }
}

/**
 * Apply store scoping to a query object
 * This ensures queries only return data from stores the user can access
 * CRITICAL: Must be applied at query level, not post-fetch
 * 
 * @param {Object} query - Mongoose query object (will be mutated)
 * @param {String} storeIdField - Field name that contains storeId (default: 'storeId')
 * @returns {Object} Mutated query object with store scoping applied
 */
export function applyStoreScope(query, storeIdField = 'storeId') {
  const role = getRole();
  const accessibleStoreIds = getAccessibleStoreIds();
  const singleStoreId = getStoreId();
  
  // Superadmin: no scoping (unrestricted)
  if (role === 'superadmin') {
    return query;
  }
  
  // Admin: business-scoped (no store-level restriction needed at query level)
  // Business scoping is handled by tenant database isolation
  if (role === 'admin') {
    return query;
  }
  
  // Manager: multiple stores
  if (role === 'manager' && Array.isArray(accessibleStoreIds) && accessibleStoreIds.length > 0) {
    // Ensure query only matches stores in accessible list
    const existingStoreFilter = query[storeIdField];
    
    if (existingStoreFilter) {
      // If query already has storeId filter, intersect with accessible stores
      if (typeof existingStoreFilter === 'string' || mongoose.isValidObjectId(existingStoreFilter)) {
        // Single storeId - check if it's in accessible list
        const storeIdStr = existingStoreFilter.toString();
        if (!accessibleStoreIds.some(id => id.toString() === storeIdStr)) {
          // Store not accessible - force empty result
          query._id = { $in: [] };
          return query;
        }
        // Store is accessible - keep existing filter
        return query;
      } else if (existingStoreFilter.$in) {
        // $in operator - intersect arrays
        const requestedIds = existingStoreFilter.$in.map(id => id.toString());
        const allowedIdsSet = new Set(accessibleStoreIds.map(id => id.toString()));
        const intersection = requestedIds.filter(id => allowedIdsSet.has(id));
        
        if (intersection.length === 0) {
          query._id = { $in: [] };
        } else {
          query[storeIdField] = { $in: intersection.map(id => {
            return mongoose.isValidObjectId(id) ? id : mongoose.Types.ObjectId.createFromHexString(id);
          }) };
        }
        return query;
      }
    }
    
    // No existing filter - apply accessible stores filter
    query[storeIdField] = { $in: accessibleStoreIds.map(id => 
      mongoose.isValidObjectId(id) ? id : new mongoose.Types.ObjectId(id)
    ) };
    return query;
  }
  
  // Cashier: single store
  if (role === 'cashier' && singleStoreId) {
    const existingStoreFilter = query[storeIdField];
    
    if (existingStoreFilter) {
      // If query already has storeId, validate it matches cashier's store
      const requestedStoreId = (typeof existingStoreFilter === 'string' || mongoose.isValidObjectId(existingStoreFilter))
        ? existingStoreFilter.toString()
        : null;
      
      if (requestedStoreId && requestedStoreId !== singleStoreId.toString()) {
        // Cashier trying to access different store - deny
        query._id = { $in: [] };
        return query;
      }
    }
    
      // Apply single store filter
      query[storeIdField] = mongoose.isValidObjectId(singleStoreId)
        ? singleStoreId
        : mongoose.Types.ObjectId.createFromHexString(singleStoreId);
      return query;
  }
  
  // Manager/Cashier with no accessible stores - force empty result
  if ((role === 'manager' || role === 'cashier') && 
      (!accessibleStoreIds || (Array.isArray(accessibleStoreIds) && accessibleStoreIds.length === 0)) &&
      !singleStoreId) {
    query._id = { $in: [] };
    return query;
  }
  
  return query;
}

/**
 * Validate that a storeId belongs to user's accessible stores
 * Used when storeId comes from request body/params
 * @param {String} storeId - Store ID to validate
 * @throws {Error} If storeId is not accessible
 */
export function validateStoreAccess(storeId) {
  if (!storeId) {
    throw new Error('Store ID is required');
  }
  
  const role = getRole();
  const accessibleStoreIds = getAccessibleStoreIds();
  const singleStoreId = getStoreId();
  
  // Superadmin: always allowed
  if (role === 'superadmin') {
    return;
  }
  
  // Admin: business-scoped (validation happens at business level)
  if (role === 'admin') {
    return;
  }
  
  // Manager: check if storeId is in accessible list
  if (role === 'manager') {
    if (!Array.isArray(accessibleStoreIds) || accessibleStoreIds.length === 0) {
      throw new Error('Access denied: No stores assigned to manager');
    }
    
    const storeIdStr = storeId.toString();
    const isAccessible = accessibleStoreIds.some(id => id.toString() === storeIdStr);
    
    if (!isAccessible) {
      throw new Error(`Access denied: Store ${storeId} is not accessible to manager`);
    }
    return;
  }
  
  // Cashier: must match exactly
  if (role === 'cashier') {
    if (!singleStoreId) {
      throw new Error('Access denied: Cashier has no assigned store');
    }
    
    if (singleStoreId.toString() !== storeId.toString()) {
      throw new Error(`Access denied: Cashier can only access store ${singleStoreId}`);
    }
    return;
  }
  
  throw new Error(`Access denied: Invalid role or store access configuration`);
}

/**
 * Sanitize document fields based on role
 * Removes sensitive fields that cashiers should not see
 * @param {Object|Array} doc - Document or array of documents
 * @returns {Object|Array} Sanitized document(s)
 */
export function sanitizeFieldsByRole(doc) {
  if (!doc) return doc;
  
  const role = getRole();
  
  // Only cashiers need field sanitization
  if (role !== 'cashier') {
    return doc;
  }
  
  // Handle arrays
  if (Array.isArray(doc)) {
    return doc.map(item => sanitizeFieldsByRole(item));
  }
  
  // Handle Mongoose documents (convert to plain object)
  const plainDoc = doc.toObject ? doc.toObject() : { ...doc };
  
  // Remove hidden fields
  const sanitized = { ...plainDoc };
  CASHIER_HIDDEN_FIELDS.forEach(field => {
    delete sanitized[field];
  });
  
  // Handle nested objects (e.g., variant data)
  Object.keys(sanitized).forEach(key => {
    if (typeof sanitized[key] === 'object' && sanitized[key] !== null && !Array.isArray(sanitized[key])) {
      sanitized[key] = sanitizeFieldsByRole(sanitized[key]);
    } else if (Array.isArray(sanitized[key])) {
      sanitized[key] = sanitized[key].map(item => 
        typeof item === 'object' && item !== null ? sanitizeFieldsByRole(item) : item
      );
    }
  });
  
  return sanitized;
}

/**
 * Build projection object to exclude sensitive fields at query level
 * More efficient than post-fetch sanitization
 * @returns {Object} Mongoose projection object
 */
export function getFieldProjection() {
  const role = getRole();
  
  if (role !== 'cashier') {
    return {}; // No projection needed
  }
  
  // Build exclusion projection
  const projection = {};
  CASHIER_HIDDEN_FIELDS.forEach(field => {
    projection[field] = 0; // Exclude field
  });
  
  return projection;
}

export default {
  getRoleCapabilities,
  assertCanMutate,
  assertCanCreate,
  assertCanUpdate,
  assertCanDelete,
  assertManagerCanUpdateFields,
  applyStoreScope,
  validateStoreAccess,
  sanitizeFieldsByRole,
  getFieldProjection,
};
