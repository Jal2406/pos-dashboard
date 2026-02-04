import mongoose from 'mongoose';
import TENANT_DB_CONFIG from './tenant-db-config.js';
import { Business } from '../models/index.js';



// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================

const CONFIG = {
  // Connection settings
  MAX_POOL_SIZE: TENANT_DB_CONFIG.MAX_POOL_SIZE,
  SERVER_SELECTION_TIMEOUT_MS: TENANT_DB_CONFIG.SERVER_SELECTION_TIMEOUT_MS,
  CONNECT_TIMEOUT_MS: TENANT_DB_CONFIG.CONNECT_TIMEOUT_MS,

  IDLE_TTL_MS: TENANT_DB_CONFIG.IDLE_TTL_MS, 
  CLEANUP_INTERVAL_MS: TENANT_DB_CONFIG.CLEANUP_INTERVAL_MS, 
  RECONNECTION_DELAY_MS: TENANT_DB_CONFIG.RECONNECTION_DELAY_MS,
  MAX_RECONNECTION_ATTEMPTS: TENANT_DB_CONFIG.MAX_RECONNECTION_ATTEMPTS,

  // Additional safety settings
  MIN_CONNECTION_LIFETIME_MS: TENANT_DB_CONFIG.MIN_CONNECTION_LIFETIME_MS,
  HEALTH_CHECK_INTERVAL_MS: TENANT_DB_CONFIG.HEALTH_CHECK_INTERVAL_MS,

  // Debug and logging
  ENABLE_DEBUG_LOG: TENANT_DB_CONFIG.ENABLE_DEBUG_LOG,
  ENABLE_METRICS: TENANT_DB_CONFIG.ENABLE_METRICS,
};

// ============================================================================
// CORE DATA STRUCTURES
// ============================================================================
class ConnectionMetadata {
  constructor(connection, businessId) {
    this.connection = connection;
    this.businessId = businessId;
    this.createdAt = Date.now();
    this.lastUsed = Date.now();
    this.lastHealthCheck = Date.now();
    this.isHealthy = true;
    this.reconnectionAttempts = 0;
    this.registeredModels = new Set();
    this.isClosing = false;
  }

  touch() {
    this.lastUsed = Date.now();
  }

  markHealthy() {
    this.isHealthy = true;
    this.lastHealthCheck = Date.now();
    this.reconnectionAttempts = 0;
  }

  markUnhealthy() {
    this.isHealthy = false;
    this.lastHealthCheck = Date.now();
  }

  incrementReconnectionAttempts() {
    this.reconnectionAttempts++;
  }

  canReconnect() {
    return this.reconnectionAttempts < CONFIG.MAX_RECONNECTION_ATTEMPTS;
  }

  isIdle() {
    const now = Date.now();
    const timeSinceLastUsed = now - this.lastUsed;
    const timeSinceCreated = now - this.createdAt;

    // Don't consider a connection idle if it's too young
    if (timeSinceCreated < CONFIG.MIN_CONNECTION_LIFETIME_MS) {
      return false;
    }

    return timeSinceLastUsed > CONFIG.IDLE_TTL_MS;
  }

  isStale() {
    return Date.now() - this.lastHealthCheck > CONFIG.IDLE_TTL_MS;
  }
}

/**
 * Model metadata with connection validation
 */
class ModelMetadata {
  constructor(model, connection, businessId, modelName) {
    this.model = model;
    this.connection = connection;
    this.businessId = businessId;
    this.modelName = modelName;
    this.createdAt = Date.now();
    this.lastUsed = Date.now();
  }

  touch() {
    this.lastUsed = Date.now();
  }

  isValid() {
    return (
      this.connection &&
      this.connection.readyState === 1 &&
      !this.connection.isClosing
    );
  }
}

// ============================================================================
// CORE STORAGE WITH ATOMIC OPERATIONS
// ============================================================================

class TenantConnectionStore {
  constructor(logger) {
    // Core maps with atomic access patterns
    this._connections = new Map(); // businessId -> ConnectionMetadata
    this._models = new Map(); // `${businessId}::${modelName}` -> ModelMetadata
    this._connectionPromises = new Map(); // businessId -> Promise<Connection>
    this._modelPromises = new Map(); // `${businessId}::${modelName}` -> Promise<Model>

    // Synchronization primitives
    this._locks = new Map(); // businessId -> Promise (for connection creation)
    this._modelLocks = new Map(); // `${businessId}::${modelName}` -> Promise (for model creation)

    // Logger for this store
    this.logger = logger;

    // Metrics and monitoring
    this._metrics = {
      connectionsCreated: 0,
      connectionsClosed: 0,
      modelsCreated: 0,
      modelsEvicted: 0,
      reconnectionsAttempted: 0,
      reconnectionsSuccessful: 0,
      healthChecksPerformed: 0,
      lastCleanup: Date.now(),
    };
  }

  // ============================================================================
  // ATOMIC CONNECTION MANAGEMENT
  // ============================================================================

  /**
   * Get or create connection with atomic operations
   */
  async getConnection(businessId) {
    const key = String(businessId);

    // Fast path: return existing healthy connection
    const existing = this._connections.get(key);
    if (
      existing &&
      existing.isHealthy &&
      existing.connection.readyState === 1
    ) {
      existing.touch();
      return existing.connection;
    }

    // Check for in-flight connection creation
    if (this._connectionPromises.has(key)) {
      return await this._connectionPromises.get(key);
    }

    // Acquire lock for connection creation
    if (this._locks.has(key)) {
      await this._locks.get(key);
      // After lock release, check again for existing connection
      const afterLock = this._connections.get(key);
      if (
        afterLock &&
        afterLock.isHealthy &&
        afterLock.connection.readyState === 1
      ) {
        afterLock.touch();
        return afterLock.connection;
      }
    }

    // Create new connection with lock
    const lockPromise = this._createConnection(businessId);
    this._locks.set(key, lockPromise);

    try {
      const connection = await lockPromise;
      return connection;
    } finally {
      this._locks.delete(key);
    }
  }

  /**
   * Create new connection with comprehensive error handling
   */
  async _createConnection(businessId) {
    const key = String(businessId);

    try {
      this.logger.info('Creating tenant connection', { businessId, key });

      // Validate that the business exists before creating tenant database
      // This prevents orphaned tenant databases for non-existent businesses
      if (businessId) {
        try {
          const business = await Business.findById(businessId).select('_id').lean();
          if (!business) {
            const error = new Error(
              `Cannot create tenant connection: Business with id ${businessId} does not exist`,
            );
            this.logger.error('Business validation failed', {
              businessId,
              error: error.message,
            });
            throw error;
          }
        } catch (error) {
          // Handle invalid ObjectId format
          if (error.name === 'CastError' || error.kind === 'ObjectId') {
            const validationError = new Error(
              `Invalid business ID format: ${businessId}`,
            );
            this.logger.error('Business ID validation failed', {
              businessId,
              error: validationError.message,
            });
            throw validationError;
          }
          // Re-throw if it's our custom error
          if (error.message?.includes('does not exist')) {
            throw error;
          }
          // For other errors (e.g., database connection issues), log and re-throw
          this.logger.error('Business validation error', {
            businessId,
            error: error?.message || String(error),
          });
          throw error;
        }
      }

      const tenantUri = this._buildTenantMongoUri(businessId);
      if (!tenantUri) {
        this.logger.warn(
          'No tenant URI template configured, using global connection',
          { businessId },
        );
        return mongoose.connection;
      }

      const connection = await mongoose
        .createConnection(tenantUri, {
          maxPoolSize: CONFIG.MAX_POOL_SIZE,
          minPoolSize: 2, // Maintain minimum connections
          serverSelectionTimeoutMS: CONFIG.SERVER_SELECTION_TIMEOUT_MS,
          connectTimeoutMS: CONFIG.CONNECT_TIMEOUT_MS,
          socketTimeoutMS: 60000, // 60 seconds socket timeout
          bufferCommands: false,
          retryWrites: true,
          retryReads: true, // Enable retry for reads
          heartbeatFrequencyMS: 5000, // Check connection health more frequently
          maxIdleTimeMS: 60000, // Keep connections alive longer
          w: 'majority',
        })
        .asPromise();

      // Wait for connection to be ready
      if (connection.readyState !== 1) {
        await this._waitForConnectionReady(connection);
      }

      // Create metadata and register
      const metadata = new ConnectionMetadata(connection, businessId);
      this._connections.set(key, metadata);
      this._metrics.connectionsCreated++;

      // Set up lifecycle event handlers
      this._setupConnectionEventHandlers(connection, businessId);

      this.logger.info('Tenant connection created successfully', {
        businessId,
        readyState: connection.readyState,
        host: connection.host,
        port: connection.port,
        name: connection.name,
      });

      return connection;
    } catch (error) {
      this.logger.error('Failed to create tenant connection', {
        businessId,
        error: error?.message || String(error),
        stack: error?.stack,
      });

      // Clean up any partial state
      this._connections.delete(key);
      this._connectionPromises.delete(key);

      throw new Error(
        `Failed to create connection for tenant ${businessId}: ${error.message}`,
      );
    }
  }

  /**
   * Wait for connection to be ready with timeout
   */
  async _waitForConnectionReady(connection) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        connection.off('open', onOpen);
        connection.off('error', onError);
        reject(new Error('Connection timeout'));
      }, CONFIG.CONNECT_TIMEOUT_MS);

      const onOpen = () => {
        clearTimeout(timeout);
        connection.off('error', onError);
        resolve();
      };

      const onError = (err) => {
        clearTimeout(timeout);
        connection.off('open', onOpen);
        reject(err);
      };

      connection.once('open', onOpen);
      connection.once('error', onError);
    });
  }

  /**
   * Set up comprehensive connection event handlers
   */
  _setupConnectionEventHandlers(connection, businessId) {
    const key = String(businessId);

    connection.on('connected', () => {
      this.logger.info('Tenant connection connected', { businessId });
      const metadata = this._connections.get(key);
      if (metadata) {
        metadata.markHealthy();
      }
    });

    connection.on('disconnected', () => {
      this.logger.warn('Tenant connection disconnected', { businessId });
      const metadata = this._connections.get(key);
      if (metadata) {
        metadata.markUnhealthy();
      }
    });

    connection.on('close', () => {
      this.logger.info('Tenant connection closed', { businessId });
      this._cleanupTenantData(businessId);
    });

    connection.on('error', (error) => {
      this.logger.error('Tenant connection error', {
        businessId,
        error: error.message,
        readyState: connection.readyState,
      });

      const metadata = this._connections.get(key);
      if (metadata) {
        metadata.markUnhealthy();
      }
    });

    connection.on('reconnected', () => {
      this.logger.info('Tenant connection reconnected', { businessId });
      const metadata = this._connections.get(key);
      if (metadata) {
        metadata.markHealthy();
        this._metrics.reconnectionsSuccessful++;
      }
    });
  }

  // ============================================================================
  // ATOMIC MODEL MANAGEMENT
  // ============================================================================

  /**
   * Get or create model with connection health validation
   */
  async getModel(businessId, modelName, schema, collectionName) {
    const key = `${businessId}::${modelName}`;

    // Fast path: return existing valid model
    const existing = this._models.get(key);
    if (existing && existing.isValid()) {
      existing.touch();
      return existing.model;
    }

    // Check for in-flight model creation
    if (this._modelPromises.has(key)) {
      return await this._modelPromises.get(key);
    }

    // Acquire lock for model creation
    if (this._modelLocks.has(key)) {
      await this._modelLocks.get(key);
      // After lock release, check again for existing model
      const afterLock = this._models.get(key);
      if (afterLock && afterLock.isValid()) {
        afterLock.touch();
        return afterLock.model;
      }
    }

    // Create new model with lock
    const lockPromise = this._createModel(
      businessId,
      modelName,
      schema,
      collectionName,
    );
    this._modelLocks.set(key, lockPromise);

    try {
      const model = await lockPromise;
      return model;
    } finally {
      this._modelLocks.delete(key);
    }
  }

  /**
   * Create new model with connection validation
   */
  async _createModel(businessId, modelName, schema, collectionName) {
    const key = `${businessId}::${modelName}`;

    try {
      this.logger.debug('Creating tenant model', {
        businessId,
        modelName,
        key,
      });

      // Get or create connection
      const connection = await this.getConnection(businessId);

      // Validate connection health
      if (connection.readyState !== 1) {
        throw new Error(
          `Connection not ready for model creation: readyState=${connection.readyState}`,
        );
      }

      // Check if model already exists on connection
      if (connection.models[modelName]) {
        const existingModel = connection.models[modelName];
        const metadata = new ModelMetadata(
          existingModel,
          connection,
          businessId,
          modelName,
        );
        this._models.set(key, metadata);
        this._metrics.modelsCreated++;

        // Update connection metadata
        const connMetadata = this._connections.get(String(businessId));
        if (connMetadata) {
          connMetadata.registeredModels.add(modelName);
        }

        return existingModel;
      }

      // Create new model
      const model = connection.model(modelName, schema, collectionName);
      const metadata = new ModelMetadata(
        model,
        connection,
        businessId,
        modelName,
      );
      this._models.set(key, metadata);
      this._metrics.modelsCreated++;

      // Update connection metadata
      const connMetadata = this._connections.get(String(businessId));
      if (connMetadata) {
        connMetadata.registeredModels.add(modelName);
        connMetadata.touch();
      }

      this.logger.debug('Tenant model created successfully', {
        businessId,
        modelName,
        collectionName: collectionName || modelName.toLowerCase() + 's',
      });

      return model;
    } catch (error) {
      this.logger.error('Failed to create tenant model', {
        businessId,
        modelName,
        error: error?.message || String(error),
      });

      // Clean up any partial state
      this._models.delete(key);
      this._modelPromises.delete(key);

      throw new Error(
        `Failed to create model ${modelName} for tenant ${businessId}: ${error.message}`,
      );
    }
  }

  // ============================================================================
  // INTELLIGENT CLEANUP & HEALTH MANAGEMENT
  // ============================================================================

  /**
   * Perform intelligent cleanup of idle connections and stale models
   */
  async performCleanup() {
    const now = Date.now();
    const cutoff = now - CONFIG.IDLE_TTL_MS;
    let cleanedConnections = 0;
    let cleanedModels = 0;

    this.logger.debug('Starting tenant cleanup', {
      totalConnections: this._connections.size,
      totalModels: this._models.size,
      cutoffTime: new Date(cutoff).toISOString(),
    });

    // Clean up stale models first
    for (const [key, modelMetadata] of this._models.entries()) {
      if (!modelMetadata.isValid() || modelMetadata.lastUsed < cutoff) {
        this._models.delete(key);
        cleanedModels++;
        this.logger.debug('Evicted stale model', {
          key,
          lastUsed: new Date(modelMetadata.lastUsed).toISOString(),
          isValid: modelMetadata.isValid(),
        });
      }
    }

    // Clean up idle connections
    for (const [businessId, connMetadata] of this._connections.entries()) {
      if (connMetadata.isIdle() && !connMetadata.isClosing) {
        try {
          await this._gracefulCloseConnection(businessId, connMetadata);
          cleanedConnections++;
        } catch (error) {
          this.logger.error('Error during connection cleanup', {
            businessId,
            error: error?.message || String(error),
          });
        }
      }
    }

    this._metrics.lastCleanup = now;
    this._metrics.modelsEvicted += cleanedModels;
    this._metrics.connectionsClosed += cleanedConnections;

    if (cleanedConnections > 0 || cleanedModels > 0) {
      this.logger.info('Tenant cleanup completed', {
        cleanedConnections,
        cleanedModels,
        remainingConnections: this._connections.size,
        remainingModels: this._models.size,
      });
    }
  }

  /**
   * Gracefully close connection with proper cleanup
   */
  async _gracefulCloseConnection(businessId, metadata) {
    const key = String(businessId);

    this.logger.info('Gracefully closing idle connection', {
      businessId,
      lastUsed: new Date(metadata.lastUsed).toISOString(),
      registeredModels: Array.from(metadata.registeredModels),
    });

    metadata.isClosing = true;

    try {
      // Close the connection
      await metadata.connection.close();

      // Clean up all related data
      this._cleanupTenantData(businessId);

      this.logger.info('Connection closed successfully', { businessId });
    } catch (error) {
      this.logger.error('Error closing connection', {
        businessId,
        error: error?.message || String(error),
      });

      // Force cleanup even if close failed
      this._cleanupTenantData(businessId);
    }
  }

  /**
   * Clean up all data related to a tenant
   */
  _cleanupTenantData(businessId) {
    const key = String(businessId);

    // Remove connection
    this._connections.delete(key);

    // Remove all models for this tenant
    for (const [modelKey, modelMetadata] of this._models.entries()) {
      if (modelMetadata.businessId === businessId) {
        this._models.delete(modelKey);
      }
    }

    // Remove promises
    this._connectionPromises.delete(key);
    for (const [modelKey, promise] of this._modelPromises.entries()) {
      if (modelKey.startsWith(`${businessId}::`)) {
        this._modelPromises.delete(modelKey);
      }
    }

    // Remove locks
    this._locks.delete(key);
    for (const [modelKey, lock] of this._modelLocks.entries()) {
      if (modelKey.startsWith(`${businessId}::`)) {
        this._modelLocks.delete(modelKey);
      }
    }
  }

  // ============================================================================
  // HEALTH MONITORING & RECONNECTION
  // ============================================================================

  /**
   * Perform health check on all connections
   */
  async performHealthCheck() {
    const now = Date.now();
    let healthyConnections = 0;
    let unhealthyConnections = 0;
    let reconnectionAttempts = 0;

    for (const [businessId, metadata] of this._connections.entries()) {
      try {
        const isHealthy = metadata.connection.readyState === 1;

        if (isHealthy) {
          metadata.markHealthy();
          healthyConnections++;
        } else {
          metadata.markUnhealthy();
          unhealthyConnections++;

          // Attempt reconnection if possible
          if (metadata.canReconnect()) {
            reconnectionAttempts++;
            await this._attemptReconnection(businessId, metadata);
          }
        }

        this._metrics.healthChecksPerformed++;
      } catch (error) {
        this.logger.error('Health check failed for connection', {
          businessId,
          error: error?.message || String(error),
        });
        metadata.markUnhealthy();
        unhealthyConnections++;
      }
    }

    if (unhealthyConnections > 0 || reconnectionAttempts > 0) {
      this.logger.info('Health check completed', {
        healthyConnections,
        unhealthyConnections,
        reconnectionAttempts,
      });
    }
  }

  /**
   * Attempt to reconnect a failed connection
   */
  async _attemptReconnection(businessId, metadata) {
    try {
      this.logger.info('Attempting reconnection', {
        businessId,
        attempt: metadata.reconnectionAttempts + 1,
        maxAttempts: CONFIG.MAX_RECONNECTION_ATTEMPTS,
      });

      metadata.incrementReconnectionAttempts();
      this._metrics.reconnectionsAttempted++;

      // Wait before reconnection attempt
      await new Promise((resolve) =>
        setTimeout(resolve, CONFIG.RECONNECTION_DELAY_MS),
      );

      // Create new connection
      const newConnection = await this._createConnection(businessId);

      // Update metadata
      metadata.connection = newConnection;
      metadata.markHealthy();

      this.logger.info('Reconnection successful', { businessId });
    } catch (error) {
      this.logger.error('Reconnection failed', {
        businessId,
        attempt: metadata.reconnectionAttempts,
        error: error?.message || String(error),
      });
    }
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Build tenant MongoDB URI from template
   */
  _buildTenantMongoUri(businessId) {
    const template = process.env.MONGO_TENANT_URI_TEMPLATE;
    if (!template) return null;

    return template
      .replaceAll('${BUSINESS_ID}', String(businessId))
      .replaceAll('{BUSINESS_ID}', String(businessId));
  }

  /**
   * Get connection metadata for monitoring
   */
  getConnectionMetadata(businessId) {
    return this._connections.get(String(businessId));
  }

  /**
   * Get model metadata for monitoring
   */
  getModelMetadata(businessId, modelName) {
    return this._models.get(`${businessId}::${modelName}`);
  }

  /**
   * Get comprehensive metrics
   */
  getMetrics() {
    return {
      ...this._metrics,
      activeConnections: this._connections.size,
      activeModels: this._models.size,
      inFlightConnections: this._connectionPromises.size,
      inFlightModels: this._modelPromises.size,
      activeLocks: this._locks.size + this._modelLocks.size,
    };
  }

  /**
   * Get all registered models for a tenant
   */
  getRegisteredModels(businessId) {
    const metadata = this._connections.get(String(businessId));
    return metadata ? Array.from(metadata.registeredModels) : [];
  }

  /**
   * Force cleanup of all data (for testing/shutdown)
   */
  async forceCleanup() {
    this.logger.info('Force cleanup initiated');

    // Close all connections
    const closePromises = [];
    for (const [businessId, metadata] of this._connections.entries()) {
      closePromises.push(
        metadata.connection.close().catch((error) =>
          this.logger.error('Error during force cleanup', {
            businessId,
            error: error?.message || String(error),
          }),
        ),
      );
    }

    await Promise.allSettled(closePromises);

    // Clear all maps
    this._connections.clear();
    this._models.clear();
    this._connectionPromises.clear();
    this._modelPromises.clear();
    this._locks.clear();
    this._modelLocks.clear();

    this.logger.info('Force cleanup completed');
  }
}

// ============================================================================
// LOGGING SYSTEM
// ============================================================================

class TenantDbLogger {
  constructor() {
    this.enabled = CONFIG.ENABLE_DEBUG_LOG;
  }

  info(message, meta = {}) {
    if (this.enabled) {
      console.log(`[TenantDbManager:INFO] ${message}`, meta);
    }
  }

  debug(message, meta = {}) {
    if (this.enabled) {
      console.log(`[TenantDbManager:DEBUG] ${message}`, meta);
    }
  }

  warn(message, meta = {}) {
    if (this.enabled) {
      console.warn(`[TenantDbManager:WARN] ${message}`, meta);
    }
  }

  error(message, meta = {}) {
    if (this.enabled) {
      console.error(`[TenantDbManager:ERROR] ${message}`, meta);
    }
  }
}

// ============================================================================
// MAIN MANAGER CLASS
// ============================================================================

class TenantDbManager {
  constructor() {
    this.logger = new TenantDbLogger();
    this.store = new TenantConnectionStore(this.logger);
    this.cleanupTimer = null;
    this.healthCheckTimer = null;
    this.isShuttingDown = false;

    this._startBackgroundTasks();
    this._setupGracefulShutdown();
  }

  /**
   * Get tenant connection with automatic health validation
   */
  async getTenantConnection(businessId) {
    if (!businessId) {
      return mongoose.connection;
    }

    try {
      return await this.store.getConnection(businessId);
    } catch (error) {
      this.logger.error('Failed to get tenant connection', {
        businessId,
        error: error?.message || String(error),
      });
      throw error;
    }
  }

  /**
   * Get tenant model with connection health validation
   */
  async getTenantModel(businessId, modelName, schema, collectionName) {
    if (!businessId) {
      throw new Error('Business ID is required for tenant model creation');
    }

    try {
      return await this.store.getModel(
        businessId,
        modelName,
        schema,
        collectionName,
      );
    } catch (error) {
      this.logger.error('Failed to get tenant model', {
        businessId,
        modelName,
        error: error?.message || String(error),
      });
      throw error;
    }
  }

  /**
   * Create tenant model factory for service usage
   */
  createTenantModelFactory(businessId) {
    return {
      getModel: async (modelName, schema, collectionName) =>
        this.getTenantModel(businessId, modelName, schema, collectionName),
      getConnection: async () => this.getTenantConnection(businessId),
    };
  }

  /**
   * Get global connection (for superadmin/global services)
   */
  getGlobalConnection() {
    return mongoose.connection;
  }

  /**
   * Get registered models for a tenant
   */
  async getRegisteredModelsForTenant(businessId) {
    return this.store.getRegisteredModels(businessId);
  }

  /**
   * Get comprehensive metrics
   */
  getMetrics() {
    return this.store.getMetrics();
  }

  /**
   * Force cleanup (for testing)
   */
  async forceCleanup() {
    return this.store.forceCleanup();
  }

  // ============================================================================
  // BACKGROUND TASKS
  // ============================================================================

  /**
   * Start background cleanup and health check tasks
   */
  _startBackgroundTasks() {
    // Start cleanup timer
    this.cleanupTimer = setInterval(async () => {
      if (!this.isShuttingDown) {
        try {
          await this.store.performCleanup();
        } catch (error) {
          this.logger.error('Cleanup task failed', {
            error: error?.message || String(error),
          });
        }
      }
    }, CONFIG.CLEANUP_INTERVAL_MS);

    // Start health check timer (more frequent than cleanup)
    this.healthCheckTimer = setInterval(async () => {
      if (!this.isShuttingDown) {
        try {
          await this.store.performHealthCheck();
        } catch (error) {
          this.logger.error('Health check task failed', {
            error: error?.message || String(error),
          });
        }
      }
    }, CONFIG.HEALTH_CHECK_INTERVAL_MS);

    this.logger.info('Background tasks started', {
      cleanupInterval: CONFIG.CLEANUP_INTERVAL_MS,
      healthCheckInterval: CONFIG.HEALTH_CHECK_INTERVAL_MS,
    });
  }

  /**
   * Setup graceful shutdown handlers
   */
  _setupGracefulShutdown() {
    const gracefulShutdown = async (signal) => {
      this.logger.info('Graceful shutdown initiated', { signal });
      this.isShuttingDown = true;

      // Stop background tasks
      if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
        this.cleanupTimer = null;
      }
      if (this.healthCheckTimer) {
        clearInterval(this.healthCheckTimer);
        this.healthCheckTimer = null;
      }

      // Force cleanup all connections
      await this.store.forceCleanup();

      this.logger.info('Graceful shutdown completed');
      process.exit(0);
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  }
}

// ============================================================================
// SINGLETON INSTANCE & EXPORTS
// ============================================================================

const tenantDbManager = new TenantDbManager();

// Export main functions for backward compatibility
export const getTenantConnection = (businessId) =>
  tenantDbManager.getTenantConnection(businessId);

export const getTenantModel = (businessId, modelName, schema, collectionName) =>
  tenantDbManager.getTenantModel(businessId, modelName, schema, collectionName);

export const createTenantModelFactory = (businessId) =>
  tenantDbManager.createTenantModelFactory(businessId);

export const getGlobalConnection = () => tenantDbManager.getGlobalConnection();

export const getRegisteredModelsForTenant = (businessId) =>
  tenantDbManager.getRegisteredModelsForTenant(businessId);

// Export manager instance for advanced usage
export const getTenantDbManager = () => tenantDbManager;

// Export default for backward compatibility
export default {
  getTenantConnection,
  getTenantModel,
  createTenantModelFactory,
  getGlobalConnection,
  getRegisteredModelsForTenant,
  getTenantDbManager,
};
