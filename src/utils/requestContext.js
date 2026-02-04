import { AsyncLocalStorage } from 'async_hooks';

/**
 * Request-scoped context store using AsyncLocalStorage
 * Provides thread-safe access to user context throughout the request lifecycle
 * without requiring manual parameter passing
 */
const requestContextStore = new AsyncLocalStorage();

/**
 * Run a function within a request context
 * This should be called by middleware at the start of each request
 * @param {Object} context - Request context object
 * @param {Function} fn - Function to execute within context
 * @returns {Promise<any>} Result of function execution
 */
export function runInContext(context, fn) {
  return requestContextStore.run(context, fn);
}

/**
 * Get the current request context
 * Returns null if called outside of a request context
 * @returns {Object|null} Current request context or null
 */
export function getContext() {
  return requestContextStore.getStore() || null;
}

/**
 * Get user from current request context
 * @returns {Object|null} User object or null
 */
export function getUser() {
  const context = getContext();
  return context?.user || null;
}

/**
 * Get businessId from current request context
 * @returns {String|null} Business ID or null
 */
export function getBusinessId() {
  const context = getContext();
  return context?.businessId || null;
}

/**
 * Get role from current request context
 * @returns {String|null} User role or null
 */
export function getRole() {
  const context = getContext();
  if (!context?.user) return null;
  
  // Support both populated roleId.name and direct role property
  return context.user.roleId?.name || context.user.role || null;
}

/**
 * Get store IDs accessible to current user
 * Returns null for admin/superadmin (unrestricted), array for manager/cashier
 * @returns {Array<String>|null} Array of store IDs or null for unrestricted
 */
export function getAccessibleStoreIds() {
  const context = getContext();
  return context?.accessibleStoreIds ?? null;
}

/**
 * Get single store ID for cashier (cashier has exactly one store)
 * @returns {String|null} Store ID or null
 */
export function getStoreId() {
  const context = getContext();
  return context?.storeId || null;
}

/**
 * Get active shift ID (cashier only)
 * @returns {String|null} Active shift ID or null
 */
export function getActiveShiftId() {
  const context = getContext();
  return context?.activeShiftId || null;
}

export default {
  runInContext,
  getContext,
  getUser,
  getBusinessId,
  getRole,
  getAccessibleStoreIds,
  getStoreId,
  getActiveShiftId,
};
