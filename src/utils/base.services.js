import mongoose from 'mongoose';
import { createTenantModelFactory } from '../config/dbManager.js';
import {
  assertCanCreate,
  assertCanUpdate,
  assertCanDelete,
  assertManagerCanUpdateFields,
  applyStoreScope,
  validateStoreAccess,
  sanitizeFieldsByRole,
  getFieldProjection,
} from './serviceGuard.js';

class BaseService {
  constructor(modelOrOptions) {
    // Support both legacy constructor(BaseModel) and new signature: { modelName, schema, collection, businessId }
    const isMongooseModel =
      modelOrOptions &&
      typeof modelOrOptions === 'function' &&
      modelOrOptions.modelName &&
      modelOrOptions.schema &&
      typeof modelOrOptions.find === 'function';

    const opts = isMongooseModel ? {} : modelOrOptions || {};

    // Legacy path: direct model provided
    if (isMongooseModel) {
      this.model = modelOrOptions;
      this.modelName = modelOrOptions.modelName || null;
      this.schema = modelOrOptions.schema || null;
      this.collection = null;
      this.businessId = null;
    } else {
      // New options-based path
      this.model = null;
      this.modelName = opts.modelName || null;
      this.schema = opts.schema || null;
      this.collection = opts.collection || null;
      this.businessId = opts.businessId || null;
    }

    // Per-model caches
    this._modelCache = new Map();
    this._modelPromiseCache = new Map();

    // If a concrete model was supplied (global connection), seed cache so query builders work synchronously
    if (this.model && this.modelName) {
      const key = this._composeModelKey(this.modelName);
      this._modelCache.set(key, this.model);
    }

    // RBAC configuration
    // Override in child services to customize behavior
    this.rbacConfig = {
      enabled: true, // Enable RBAC by default
      storeScoped: false, // Set to true if entity is store-scoped (e.g., Stock, StockAdjustment)
      storeIdField: 'storeId', // Field name that contains storeId
      applyFieldSanitization: true, // Apply field-level sanitization for cashiers
    };

    // Note: async warm-up removed to avoid starting asynchronous work in constructor
  }

  /**
   * Validate that a cached model's connection is still valid
   * @param {Object} model - Mongoose model to validate
   * @returns {Boolean} True if model and connection are valid
   */
  _validateModelConnection(model) {
    if (!model || typeof model !== 'function') {
      return false;
    }
    // Check if model has a db property (connection)
    if (!model.db) {
      return false;
    }
    // Check connection readyState: 1 = connected, 0 = disconnected, 2 = connecting, 3 = disconnecting
    // Only reuse if connection is connected (readyState === 1)
    return model.db.readyState === 1;
  }

  /**
   * Resolve and cache tenant-specific or global model
   * - Uses tenant when businessId is present; falls back to global
   * - Caches per-instance via this._modelCache
   * - Always creates fresh factory in getModel() instead of reusing cached factory
   * - Validates cached model connections before reuse
   */
  async getModel(modelName = null, schema = null, collection = null) {
    // If a concrete model was provided via legacy constructor, validate it before use
    if (this.model) {
      if (this._validateModelConnection(this.model)) {
        return this.model;
      }
      // Legacy model connection invalid, cannot proceed (legacy mode doesn't support recreation)
      throw new Error('Legacy model connection is invalid or disconnected');
    }
    // Determine target model parameters, falling back to defaults
    const resolvedModelName = modelName || this.modelName;
    const resolvedSchema = schema || this.schema;
    const resolvedCollection = collection || this.collection;

    if (!resolvedModelName || !resolvedSchema) {
      throw new Error(
        'BaseService requires modelName and schema to resolve model',
      );
    }

    const key = this._composeModelKey(resolvedModelName);

    // Fast path: already resolved, but validate connection before reuse
    if (this._modelCache.has(key)) {
      const cachedModel = this._modelCache.get(key);
      if (this._validateModelConnection(cachedModel)) {
        return cachedModel;
      }
      // Connection invalid, remove from cache and recreate
      this._modelCache.delete(key);
    }

    // In-flight promise deduplication to avoid race conditions
    if (this._modelPromiseCache.has(key)) {
      return this._modelPromiseCache.get(key);
    }

    // Always create fresh factory instead of reusing cached one
    const factory = createTenantModelFactory(this.businessId || null);
    const promise = factory
      .getModel(resolvedModelName, resolvedSchema, resolvedCollection)
      .then((m) => {
        this._modelCache.set(key, m);
        this._modelPromiseCache.delete(key);
        return m;
      })
      .catch((err) => {
        // Clean failed promise to allow retries
        this._modelPromiseCache.delete(key);
        throw err;
      });

    this._modelPromiseCache.set(key, promise);
    return promise;
  }

  // Compose a per-tenant, per-model cache key
  _composeModelKey(modelName) {
    const tenant = this.businessId || 'global';
    return `${tenant.toString()}::${modelName}`;
  }

  /**
   * Public accessor to the resolved model
   * Usage in child services: const Model = await this.getModelRef();
   */
  async getModelRef() {
    return this.getModel();
  }

  /**
   * Get the tenant connection for this service
   * @returns {Promise<mongoose.Connection>} Tenant connection
   */
  async getConnection() {
    const Model = await this.getModel();
    return Model.db;
  }

  /**
   * Execute a transaction with tenant-aware session
   * @param {Function} transactionFn - The transaction function to execute
   * @param {Object} options - Retry options
   * @returns {Promise<any>} Transaction result
   */
  async executeTenantTransaction(transactionFn, options = {}) {
    const connection = await this.getConnection();
    const session = await connection.startSession();

    try {
      let result;
      await session.withTransaction(async () => {
        result = await transactionFn(session);
      });
      return result;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Validate ObjectId format
   * @param {String} id - ID to validate
   * @returns {Boolean} True if valid
   */
  validateObjectId(id) {
    if (!id || !mongoose.isValidObjectId(id)) {
      throw new Error('Invalid ID format');
    }
    return true;
  }

  /**
   * Validate required fields in data object
   * @param {Object} data - Data object to validate
   * @param {Array} requiredFields - Array of required field names
   * @returns {Boolean} True if valid
   */
  validateRequiredFields(data, requiredFields) {
    if (!data || typeof data !== 'object') {
      throw new Error('Data must be a valid object');
    }

    for (const field of requiredFields) {
      if (
        !data[field] ||
        (typeof data[field] === 'string' && data[field].trim() === '')
      ) {
        throw new Error(`${field} is required`);
      }
    }
    return true;
  }

  /**
   * Validate pagination parameters
   * @param {Number} page - Page number
   * @param {Number} limit - Items per page
   * @param {Number} maxLimit - Maximum allowed limit
   * @returns {Object} Validated pagination object
   */
  validatePagination(page = 1, limit = 10, maxLimit = 100) {
    const validatedPage = Math.max(1, Number.parseInt(page) || 1);
    const validatedLimit = Math.min(
      maxLimit,
      Math.max(1, Number.parseInt(limit) || 10),
    );

    return {
      page: validatedPage,
      limit: validatedLimit,
      skip: (validatedPage - 1) * validatedLimit,
    };
  }

  /**
   * Create a new document
   * @param {Object} data - Document data
   * @param {Object} [options] - Options
   * @param {Object} [options.session] - Mongoose session for transactions
   * @param {boolean} [options.allowUnauthenticatedCreate] - If true, skips RBAC create guard (use only for public flows e.g. auth register)
   */
  async create(data, options = {}) {
    try {
      if (!data || typeof data !== 'object') {
        throw new Error('Data must be a valid object');
      }

      // RBAC: Enforce create permission (unless bypassed for public flows e.g. registration)
      if (this.rbacConfig.enabled && !options.allowUnauthenticatedCreate) {
        // Allow cashiers to create if service explicitly allows it (e.g., Sales)
        if (!this.rbacConfig.allowCashierCreate) {
          assertCanCreate();
        }
        // Always validate store access if entity is store-scoped and storeId provided
        if (this.rbacConfig.storeScoped && data[this.rbacConfig.storeIdField]) {
          validateStoreAccess(data[this.rbacConfig.storeIdField]);
        }
      }

      // Handle session properly - if session is provided, pass data as array
      if (options.session) {
        const Model = await this.getModel();
        const document = await Model.create([data], {
          session: options.session,
        });
        const result = document[0];
        
        // RBAC: Sanitize fields before returning
        if (this.rbacConfig.enabled && this.rbacConfig.applyFieldSanitization) {
          return sanitizeFieldsByRole(result);
        }
        return result;
      } else {
        const Model = await this.getModel();
        const document = await Model.create(data);
        
        // RBAC: Sanitize fields before returning
        if (this.rbacConfig.enabled && this.rbacConfig.applyFieldSanitization) {
          return sanitizeFieldsByRole(document);
        }
        return document;
      }
    } catch (error) {
      if (error.name === 'ValidationError') {
        const validationErrors = Object.values(error.errors).map(
          (err) => err.message,
        );
        throw new Error(`Validation failed: ${validationErrors.join(', ')}`);
      }
      if (error.code === 11000) {
        const field = Object.keys(error.keyPattern)[0];
        throw new Error(`${field} already exists`);
      }
      throw new Error(`Error creating document: ${error.message}`, {
        cause: error,
      });
    }
  }

  async getAll(query = {}) {
    try {
      // RBAC: Apply store scoping if entity is store-scoped
      const scopedQuery = { ...query };
      if (this.rbacConfig.enabled && this.rbacConfig.storeScoped) {
        applyStoreScope(scopedQuery, this.rbacConfig.storeIdField);
      }

      const Model = await this.getModel();
      
      // RBAC: Apply field projection for cashiers (more efficient than post-fetch sanitization)
      const projection = this.rbacConfig.enabled && this.rbacConfig.applyFieldSanitization
        ? getFieldProjection()
        : {};
      
      let queryBuilder = Object.keys(projection).length > 0
        ? Model.find(scopedQuery).select(projection)
        : Model.find(scopedQuery);
      
      const documents = await queryBuilder.exec();
      
      // RBAC: Sanitize fields (handles nested objects and arrays)
      if (this.rbacConfig.enabled && this.rbacConfig.applyFieldSanitization) {
        return sanitizeFieldsByRole(documents);
      }
      
      return documents;
    } catch (error) {
      throw new Error(`Error retrieving documents: ${error.message}`, {
        cause: error,
      });
    }
  }

  async getAllAndPopulate(query = {}, populateFields = undefined) {
    try {
      // RBAC: Apply store scoping if entity is store-scoped
      const scopedQuery = { ...query };
      if (this.rbacConfig.enabled && this.rbacConfig.storeScoped) {
        applyStoreScope(scopedQuery, this.rbacConfig.storeIdField);
      }

      const Model = await this.getModel();
      
      // RBAC: Apply field projection for cashiers
      const projection = this.rbacConfig.enabled && this.rbacConfig.applyFieldSanitization
        ? getFieldProjection()
        : {};
      
      let queryBuilder = Object.keys(projection).length > 0
        ? Model.find(scopedQuery).select(projection)
        : Model.find(scopedQuery);
      
      if (populateFields) {
        queryBuilder = queryBuilder.populate(populateFields);
      }
      
      const documents = await queryBuilder.exec();
      
      // RBAC: Sanitize fields
      if (this.rbacConfig.enabled && this.rbacConfig.applyFieldSanitization) {
        return sanitizeFieldsByRole(documents);
      }
      
      return documents;
    } catch (error) {
      throw new Error(
        `Error retrieving documents with populate: ${error.message}`,
        { cause: error },
      );
    }
  }

  async getByIdAndPopulate(id, populateFields) {
    try {
      this.validateObjectId(id);

      const Model = await this.getModel();
      
      // RBAC: Apply field projection for cashiers
      const projection = this.rbacConfig.enabled && this.rbacConfig.applyFieldSanitization
        ? getFieldProjection()
        : {};
      
      let queryBuilder = Object.keys(projection).length > 0
        ? Model.findById(id).select(projection)
        : Model.findById(id);
      
      if (populateFields) {
        queryBuilder = queryBuilder.populate(populateFields);
      }
      
      const document = await queryBuilder.exec();
      if (!document) {
        throw new Error(`Document with id ${id} not found`);
      }
      
      // RBAC: Apply store scoping validation (post-fetch check for single document)
      if (this.rbacConfig.enabled && this.rbacConfig.storeScoped) {
        const storeId = document[this.rbacConfig.storeIdField];
        if (storeId) {
          validateStoreAccess(storeId);
        }
      }
      
      // RBAC: Sanitize fields
      if (this.rbacConfig.enabled && this.rbacConfig.applyFieldSanitization) {
        return sanitizeFieldsByRole(document);
      }
      
      return document;
    } catch (error) {
      throw new Error(`Error retrieving document: ${error.message}`, {
        cause: error,
      });
    }
  }

  async getById(id) {
    try {
      this.validateObjectId(id);

      const Model = await this.getModel();
      
      // RBAC: Apply field projection for cashiers
      const projection = this.rbacConfig.enabled && this.rbacConfig.applyFieldSanitization
        ? getFieldProjection()
        : {};
      
      const document = Object.keys(projection).length > 0
        ? await Model.findById(id).select(projection).exec()
        : await Model.findById(id).exec();
      
      if (!document) {
        throw new Error(`Document with id ${id} not found`);
      }
      
      // RBAC: Apply store scoping validation (post-fetch check for single document)
      if (this.rbacConfig.enabled && this.rbacConfig.storeScoped) {
        const storeId = document[this.rbacConfig.storeIdField];
        if (storeId) {
          validateStoreAccess(storeId);
        }
      }
      
      // RBAC: Sanitize fields
      if (this.rbacConfig.enabled && this.rbacConfig.applyFieldSanitization) {
        return sanitizeFieldsByRole(document);
      }
      
      return document;
    } catch (error) {
      throw new Error(`Error retrieving document: ${error.message}`, {
        cause: error,
      });
    }
  }

  /**
   * Get multiple documents by IDs with optional populate
   * @param {Array<string>} ids - Array of document IDs to retrieve
   * @param {Object} options - Optional configuration
   * @param {String|Object|Array} options.populate - Fields to populate
   * @param {Boolean} options.lean - Use lean queries for better performance (default: true)
   * @param {Boolean} options.throwOnNotFound - Throw error if any ID not found (default: false)
   * @returns {Promise<Object>} Object containing:
   *   - documents: Array of found documents
   *   - found: Number of documents found
   *   - notFound: Array of IDs that were not found
   *   - totalRequested: Total number of IDs requested
   */
  async bulkGetByIds(ids, options = {}) {
    try {
      // Validate input
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('IDs array is required and must not be empty');
      }

      // Validate all IDs
      ids.forEach((id) => this.validateObjectId(id));

      // Extract options with defaults
      const {
        populate = null,
        lean = true,
        throwOnNotFound = false,
      } = options;

      // Build query
      const Model = await this.getModel();
      let query = Model.find({ _id: { $in: ids } });

      // RBAC: Apply store scoping if entity is store-scoped
      if (this.rbacConfig.enabled && this.rbacConfig.storeScoped) {
        applyStoreScope(query, this.rbacConfig.storeIdField);
      }

      // RBAC: Apply field projection for cashiers
      const projection = this.rbacConfig.enabled && this.rbacConfig.applyFieldSanitization
        ? getFieldProjection()
        : {};
      
      if (Object.keys(projection).length > 0) {
        query = query.select(projection);
      }

      // Add populate if specified
      if (populate) {
        query = query.populate(populate);
      }

      // Add lean for performance if requested
      if (lean) {
        query = query.lean();
      }

      // Execute query
      const documents = await query.exec();
      
      // RBAC: Sanitize fields
      const sanitizedDocuments = this.rbacConfig.enabled && this.rbacConfig.applyFieldSanitization
        ? sanitizeFieldsByRole(documents)
        : documents;

      // Identify which IDs were not found
      const foundIds = new Set(
        sanitizedDocuments.map((doc) => (doc._id || doc.id).toString()),
      );
      const notFound = ids.filter((id) => !foundIds.has(id.toString()));

      // Throw error if any IDs not found and throwOnNotFound is true
      if (throwOnNotFound && notFound.length > 0) {
        throw new Error(
          `${notFound.length} document(s) not found: ${notFound.join(', ')}`,
        );
      }

      return {
        documents: sanitizedDocuments,
        found: sanitizedDocuments.length,
        notFound,
        totalRequested: ids.length,
      };
    } catch (error) {
      throw new Error(`Bulk get by IDs failed: ${error.message}`, {
        cause: error,
      });
    }
  }

  // New method that returns a query object for chaining operations
  getByIdQuery(id, modelName = null) {
    try {
      this.validateObjectId(id);
      const resolvedModelName = modelName || this.modelName;
      if (!resolvedModelName) {
        throw new Error('BaseService requires modelName to create query');
      }
      const key = this._composeModelKey(resolvedModelName);
      const Model = this._modelCache.get(key);
      // Fallback for legacy constructor path where this.model is provided directly
      if (!Model) {
        if (this.model) {
          // Validate legacy model connection before use
          if (!this._validateModelConnection(this.model)) {
            throw new Error(
              'Legacy model connection is invalid or disconnected',
            );
          }
          return this.model.findById(id);
        }
        throw new Error(
          'Model not resolved. Call getModel(modelName, schema, collection) first',
        );
      }
      // Validate cached model connection before use
      if (!this._validateModelConnection(Model)) {
        // Connection invalid, remove from cache
        this._modelCache.delete(key);
        throw new Error(
          'Cached model connection is invalid. Call getModel() to refresh',
        );
      }
      return Model.findById(id);
    } catch (error) {
      throw new Error(`Error creating query: ${error.message}`, {
        cause: error,
      });
    }
  }

  async updateById(id, data) {
    try {
      this.validateObjectId(id);

      if (!data || typeof data !== 'object') {
        throw new Error('Update data must be a valid object');
      }

      // RBAC: Enforce update permission
      if (this.rbacConfig.enabled) {
        assertCanUpdate();
        
        // RBAC: Check manager field restrictions
        assertManagerCanUpdateFields(data);
        
        // RBAC: Validate store access if entity is store-scoped and storeId being updated
        if (this.rbacConfig.storeScoped && data[this.rbacConfig.storeIdField]) {
          validateStoreAccess(data[this.rbacConfig.storeIdField]);
        }
        
        // RBAC: Also validate existing document's storeId if not being changed
        if (this.rbacConfig.storeScoped && !data[this.rbacConfig.storeIdField]) {
          const Model = await this.getModel();
          const existing = await Model.findById(id).select(this.rbacConfig.storeIdField).lean();
          if (existing && existing[this.rbacConfig.storeIdField]) {
            validateStoreAccess(existing[this.rbacConfig.storeIdField]);
          }
        }
      }

      const Model = await this.getModel();
      const updatedDocument = await Model.findByIdAndUpdate(id, data, {
        new: true,
        runValidators: true,
      });

      if (!updatedDocument) {
        throw new Error(`Document with id ${id} not found`);
      }
      
      // RBAC: Sanitize fields before returning
      if (this.rbacConfig.enabled && this.rbacConfig.applyFieldSanitization) {
        return sanitizeFieldsByRole(updatedDocument);
      }
      
      return updatedDocument;
    } catch (error) {
      if (error.name === 'ValidationError') {
        const validationErrors = Object.values(error.errors).map(
          (err) => err.message,
        );
        throw new Error(`Validation failed: ${validationErrors.join(', ')}`);
      }
      if (error.code === 11000) {
        const field = Object.keys(error.keyPattern)[0];
        throw new Error(`${field} already exists`);
      }
      throw new Error(`Error updating document: ${error.message}`, {
        cause: error,
      });
    }
  }

  async deleteById(id) {
    try {
      this.validateObjectId(id);

      const Model = await this.getModel();
      const deletedDocument = await Model.findByIdAndDelete(id);
      if (!deletedDocument) {
        throw new Error(`Document with id ${id} not found`);
      }
      return deletedDocument;
    } catch (error) {
      throw new Error(`Error deleting document: ${error.message}`, {
        cause: error,
      });
    }
  }

  /**
   * Soft delete by setting isDeleted flag
   * @param {String} id - Document ID
   * @returns {Object} Updated document
   */
  async softDeleteById(id) {
    try {
      this.validateObjectId(id);

      const Model = await this.getModel();
      const updatedDocument = await Model.findByIdAndUpdate(
        id,
        { isDeleted: true, deletedAt: new Date() },
        { new: true },
      );

      if (!updatedDocument) {
        throw new Error(`Document with id ${id} not found`);
      }
      return updatedDocument;
    } catch (error) {
      throw new Error(`Error soft deleting document: ${error.message}`, {
        cause: error,
      });
    }
  }

  /**
   * Restore soft deleted document
   * @param {String} id - Document ID
   * @returns {Object} Updated document
   */
  async restoreById(id) {
    try {
      this.validateObjectId(id);

      const Model = await this.getModel();
      const updatedDocument = await Model.findByIdAndUpdate(
        id,
        { isDeleted: false, deletedAt: null },
        { new: true },
      );

      if (!updatedDocument) {
        throw new Error(`Document with id ${id} not found`);
      }
      return updatedDocument;
    } catch (error) {
      throw new Error(`Error restoring document: ${error.message}`, {
        cause: error,
      });
    }
  }

  /**
   * Count documents with optional query
   * @param {Object} query - Query object
   * @returns {Number} Count of documents
   */
  async count(query = {}) {
    try {
      // RBAC: Apply store scoping if entity is store-scoped
      const scopedQuery = { ...query };
      if (this.rbacConfig.enabled && this.rbacConfig.storeScoped) {
        applyStoreScope(scopedQuery, this.rbacConfig.storeIdField);
      }

      const Model = await this.getModel();
      return await Model.countDocuments(scopedQuery);
    } catch (error) {
      throw new Error(`Error counting documents: ${error.message}`, {
        cause: error,
      });
    }
  }

  /**
   * Check if document exists
   * @param {String} id - Document ID
   * @returns {Boolean} True if exists
   */
  async exists(id) {
    try {
      this.validateObjectId(id);
      const Model = await this.getModel();
      const count = await Model.countDocuments({ _id: id });
      return count > 0;
    } catch (error) {
      throw new Error(`Error checking document existence: ${error.message}`, {
        cause: error,
      });
    }
  }

  /**
   * Find documents with pagination
   * @param {Object} query - Query object
   * @param {Number} page - Page number
   * @param {Number} limit - Items per page
   * @param {Object} sort - Sort object
   * @param {String|Object} populate - Populate fields
   * @returns {Object} Paginated results
   */
  async findWithPagination(
    query = {},
    page = 1,
    limit = 10,
    sort = {},
    populate = null,
  ) {
    try {
      const {
        page: validatedPage,
        limit: validatedLimit,
        skip,
      } = this.validatePagination(page, limit);

      // RBAC: Apply store scoping if entity is store-scoped
      const scopedQuery = { ...query };
      if (this.rbacConfig.enabled && this.rbacConfig.storeScoped) {
        applyStoreScope(scopedQuery, this.rbacConfig.storeIdField);
      }

      const Model = await this.getModel();
      
      // RBAC: Apply field projection for cashiers
      const projection = this.rbacConfig.enabled && this.rbacConfig.applyFieldSanitization
        ? getFieldProjection()
        : {};
      
      let queryBuilder = Object.keys(projection).length > 0
        ? Model.find(scopedQuery).select(projection)
        : Model.find(scopedQuery);
      
      queryBuilder = queryBuilder
        .sort(sort)
        .skip(skip)
        .limit(validatedLimit);

      if (populate) {
        queryBuilder = queryBuilder.populate(populate);
      }

      const [documents, total] = await Promise.all([
        queryBuilder.exec(),
        Model.countDocuments(scopedQuery),
      ]);

      // RBAC: Sanitize fields
      const sanitizedData = this.rbacConfig.enabled && this.rbacConfig.applyFieldSanitization
        ? sanitizeFieldsByRole(documents)
        : documents;

      return {
        data: sanitizedData,
        pagination: {
          page: validatedPage,
          limit: validatedLimit,
          total,
          pages: Math.ceil(total / validatedLimit),
          hasNext: validatedPage * validatedLimit < total,
          hasPrev: validatedPage > 1,
        },
      };
    } catch (error) {
      throw new Error(
        `Error finding documents with pagination: ${error.message}`,
        { cause: error },
      );
    }
  }

  /**
   * Find one document with optional populate
   * @param {Object} query - Query object
   * @param {String|Object} populate - Populate fields
   * @returns {Object} Document
   */
  async findOne(query = {}, populate = null) {
    try {
      // RBAC: Apply store scoping if entity is store-scoped
      const scopedQuery = { ...query };
      if (this.rbacConfig.enabled && this.rbacConfig.storeScoped) {
        applyStoreScope(scopedQuery, this.rbacConfig.storeIdField);
      }

      const Model = await this.getModel();
      
      // RBAC: Apply field projection for cashiers
      const projection = this.rbacConfig.enabled && this.rbacConfig.applyFieldSanitization
        ? getFieldProjection()
        : {};
      
      let queryBuilder = Object.keys(projection).length > 0
        ? Model.findOne(scopedQuery).select(projection)
        : Model.findOne(scopedQuery);

      if (populate) {
        queryBuilder = queryBuilder.populate(populate);
      }

      const document = await queryBuilder.exec();
      if (!document) {
        throw new Error('Document not found');
      }

      // RBAC: Sanitize fields
      if (this.rbacConfig.enabled && this.rbacConfig.applyFieldSanitization) {
        return sanitizeFieldsByRole(document);
      }

      return document;
    } catch (error) {
      throw new Error(`Error finding document: ${error.message}`, {
        cause: error,
      });
    }
  }

  /**
   * Find documents with search functionality
   * @param {String} searchTerm - Search term
   * @param {Array} searchFields - Fields to search in
   * @param {Object} additionalQuery - Additional query criteria
   * @returns {Array} Search results
   */
  async search(searchTerm, searchFields = [], additionalQuery = {}) {
    try {
      if (!searchTerm || !searchFields.length) {
        return await this.getAll(additionalQuery);
      }

      const searchQuery = {
        $or: searchFields.map((field) => ({
          [field]: { $regex: searchTerm, $options: 'i' },
        })),
      };

      const finalQuery = {
        ...additionalQuery,
        ...searchQuery,
      };

      // Use getAll which already has RBAC applied
      return await this.getAll(finalQuery);
    } catch (error) {
      throw new Error(`Error searching documents: ${error.message}`, {
        cause: error,
      });
    }
  }

  /**
   * List documents with advanced filtering, search, and pagination
   * @param {Object} queryParams - Query parameters object
   * @param {Number} queryParams.page - Page number (default: 1)
   * @param {Number} queryParams.limit - Items per page (default: 10)
   * @param {String} queryParams.search - Search term
   * @param {Array} queryParams.searchFields - Fields to search in
   * @param {String} queryParams.sortBy - Field to sort by (default: 'createdAt')
   * @param {String} queryParams.sortOrder - Sort order 'asc' or 'desc' (default: 'desc')
   * @param {Object} queryParams.filters - Additional filters to apply
   * @param {String|Object} queryParams.populate - Populate fields
   * @returns {Object} Paginated results with data and pagination info
   */
  async list(queryParams = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        search = '',
        searchFields = [],
        sortBy = 'createdAt',
        sortOrder = 'desc',
        filters = {},
        populate = null,
      } = queryParams;

      // Build filter object
      const filter = { ...filters };

      // Add search functionality
      if (search && searchFields.length > 0) {
        filter.$or = searchFields.map((field) => ({
          [field]: { $regex: search, $options: 'i' },
        }));
      }

      // RBAC: Apply store scoping if entity is store-scoped
      if (this.rbacConfig.enabled && this.rbacConfig.storeScoped) {
        applyStoreScope(filter, this.rbacConfig.storeIdField);
      }

      // Build sort object
      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      // Validate and calculate pagination
      const {
        page: validatedPage,
        limit: validatedLimit,
        skip,
      } = this.validatePagination(page, limit);

      // Build query
      const Model = await this.getModel();
      
      // RBAC: Apply field projection for cashiers
      const projection = this.rbacConfig.enabled && this.rbacConfig.applyFieldSanitization
        ? getFieldProjection()
        : {};
      
      let queryBuilder = Object.keys(projection).length > 0
        ? Model.find(filter).select(projection)
        : Model.find(filter);
      
      queryBuilder = queryBuilder
        .sort(sort)
        .skip(skip)
        .limit(validatedLimit);

      // Add populate if specified
      if (populate) {
        queryBuilder = queryBuilder.populate(populate);
      }

      // Execute query and count in parallel
      const [documents, total] = await Promise.all([
        queryBuilder.exec(),
        Model.countDocuments(filter),
      ]);

      // RBAC: Sanitize fields
      const sanitizedData = this.rbacConfig.enabled && this.rbacConfig.applyFieldSanitization
        ? sanitizeFieldsByRole(documents)
        : documents;

      return {
        data: sanitizedData,
        pagination: {
          currentPage: validatedPage,
          totalPages: Math.ceil(total / validatedLimit),
          totalItems: total,
          itemsPerPage: validatedLimit,
          hasNext: validatedPage * validatedLimit < total,
          hasPrev: validatedPage > 1,
        },
      };
    } catch (error) {
      throw new Error(`Error listing documents: ${error.message}`, {
        cause: error,
      });
    }
  }
}

export default BaseService;
