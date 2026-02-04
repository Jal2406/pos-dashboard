/**
 * Legacy dbManager.js - Now uses the new TenantDbManager for backward compatibility
 *
 * This file maintains the same API as before but delegates to the new
 * production-grade TenantDbManager implementation.
 *
 * @deprecated Use tenantDbManager.js directly for new code
 */

import {
  getTenantConnection as newGetTenantConnection,
  getTenantModel as newGetTenantModel,
  createTenantModelFactory as newCreateTenantModelFactory,
  getGlobalConnection as newGetGlobalConnection,
  getRegisteredModelsForTenant as newGetRegisteredModelsForTenant,
} from './tenantDbManager.js';

// Re-export all functions with the same API for backward compatibility
export const getTenantConnection = newGetTenantConnection;
export const getTenantModel = newGetTenantModel;
export const createTenantModelFactory = newCreateTenantModelFactory;
export const getGlobalConnection = newGetGlobalConnection;
export const getRegisteredModelsForTenant = newGetRegisteredModelsForTenant;

// Default export for backward compatibility
export default {
  getTenantConnection,
  getTenantModel,
  createTenantModelFactory,
  getGlobalConnection,
  getRegisteredModelsForTenant,
};
