/**
 * Tenant Database Configuration
 *
 * This file provides configuration options for the tenant database manager
 * to prevent unwanted deregistration issues.
 */

// Production-safe configuration
const TENANT_DB_CONFIG = {
  // Connection settings
  MAX_POOL_SIZE: Number(process.env.MONGO_MAX_POOL_SIZE || 30),
  SERVER_SELECTION_TIMEOUT_MS: Number(
    process.env.MONGO_SELECTION_TIMEOUT_MS || 45000, // Increased from 10s to 30s
  ),
  CONNECT_TIMEOUT_MS: Number(process.env.MONGO_CONNECT_TIMEOUT_MS || 45000),

  // TTL and cleanup settings - PRODUCTION SAFE DEFAULTS
  IDLE_TTL_MS: Number(
    process.env.MONGO_TENANT_IDLE_TTL_MS || 4 * 60 * 60 * 1000,
  ), // 2 hours default (was 30 minutes)
  CLEANUP_INTERVAL_MS: Number(
    process.env.MONGO_CLEANUP_INTERVAL_MS || 15 * 60 * 1000,
  ), // 15 minutes (was 5 minutes)
  RECONNECTION_DELAY_MS: Number(
    process.env.MONGO_RECONNECTION_DELAY_MS || 1000,
  ),
  MAX_RECONNECTION_ATTEMPTS: Number(
    process.env.MONGO_MAX_RECONNECTION_ATTEMPTS || 3,
  ),

  // Debug and logging
  ENABLE_DEBUG_LOG:
    String(process.env.DB_MANAGER_DEBUG || '').toLowerCase() === 'true',
  ENABLE_METRICS:
    String(process.env.DB_MANAGER_METRICS || '').toLowerCase() === 'true',

  // Additional safety settings
  MIN_CONNECTION_LIFETIME_MS: Number(
    process.env.MONGO_MIN_CONNECTION_LIFETIME_MS || 10 * 60 * 1000,
  ), // 5 minutes minimum
  HEALTH_CHECK_INTERVAL_MS: Number(
    process.env.MONGO_HEALTH_CHECK_INTERVAL_MS || 2 * 60 * 1000,
  ), // 2 minutes
};

// Apply configuration to environment if not already set
if (!process.env.MONGO_TENANT_IDLE_TTL_MS) {
  process.env.MONGO_TENANT_IDLE_TTL_MS = String(TENANT_DB_CONFIG.IDLE_TTL_MS);
}

if (!process.env.MONGO_CLEANUP_INTERVAL_MS) {
  process.env.MONGO_CLEANUP_INTERVAL_MS = String(
    TENANT_DB_CONFIG.CLEANUP_INTERVAL_MS,
  );
}

if (!process.env.DB_MANAGER_DEBUG) {
  process.env.DB_MANAGER_DEBUG = String(TENANT_DB_CONFIG.ENABLE_DEBUG_LOG);
}

export default TENANT_DB_CONFIG;
