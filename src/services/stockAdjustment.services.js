import {
    StockAdjustmentSchema,
    ProductSchema,
    StockSchema,
    StoreSchema,
    ProductCategorySchema,
    SubCategorySchema,
    User,
} from '../models/index.js';
import { BaseService } from '../utils/index.js';
import { applyStoreScope, validateStoreAccess } from '../utils/serviceGuard.js';

const ADJUSTMENT_STATUSES = Object.freeze({
    PENDING: 'pending',
    APPROVED: 'approved',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
});

const ADJUSTMENT_STATUS_TRANSITIONS = Object.freeze({
    [ADJUSTMENT_STATUSES.PENDING]: new Set([
        ADJUSTMENT_STATUSES.PENDING,
        ADJUSTMENT_STATUSES.APPROVED,
        ADJUSTMENT_STATUSES.COMPLETED,
        ADJUSTMENT_STATUSES.CANCELLED,
    ]),
    [ADJUSTMENT_STATUSES.APPROVED]: new Set([
        ADJUSTMENT_STATUSES.PENDING,
        ADJUSTMENT_STATUSES.APPROVED,
        ADJUSTMENT_STATUSES.COMPLETED,
        ADJUSTMENT_STATUSES.CANCELLED,
    ]),
    [ADJUSTMENT_STATUSES.COMPLETED]: new Set([ADJUSTMENT_STATUSES.COMPLETED]),
    [ADJUSTMENT_STATUSES.CANCELLED]: new Set([ADJUSTMENT_STATUSES.CANCELLED]),
});

/**
 * StockAdjustmentServices
 * Handles all stock adjustment operations including CRUD, approval workflow, and statistics
 * Extends BaseService for multi-tenant support
 */
class StockAdjustmentServices extends BaseService {
    constructor(businessId) {
        if (!businessId) {
            throw new Error('StockAdjustmentServices initialized without businessId');
        }
        super({
            modelName: 'StockAdjustment',
            schema: StockAdjustmentSchema,
            collection: 'stockadjustments',
            businessId,
        });
        
        // RBAC: Stock adjustments are store-scoped
        this.rbacConfig.storeScoped = true;
        this.rbacConfig.storeIdField = 'storeId';
        
        this._referenceModelsReady = false;
    }

    async _ensureReferenceModels() {
        if (this._referenceModelsReady) {
            return;
        }

        await Promise.all([
            this.getModel('Store', StoreSchema, 'stores'),
            this.getModel('Product', ProductSchema, 'products'),
            this.getModel('ProductCategory', ProductCategorySchema, 'productcategories'),
            this.getModel('SubCategory', SubCategorySchema, 'subcategories'),
            // User model is NOT registered here - it's a global model only
        ]);

        this._referenceModelsReady = true;
    }

    async _getStockAdjustmentModel() {
        const StockAdjustment = await this.getModel();
        await this._ensureReferenceModels();
        return StockAdjustment;
    }

    /**
     * Helper method to manually populate User references from global database
     * @param {Array|Object} data - Single object or array of objects with User references
     * @param {Array<string>} fields - Fields to populate (e.g., ['createdBy', 'approvedBy'])
     * @returns {Promise<Array|Object>} Data with populated User fields
     */
    async _populateUsers(data, fields = ['createdBy', 'approvedBy', 'cancelledBy']) {
        if (!data) return data;

        const isArray = Array.isArray(data);
        const items = isArray ? data : [data];

        // Collect all unique user IDs
        const userIds = new Set();
        items.forEach(item => {
            fields.forEach(field => {
                if (item[field]) userIds.add(item[field].toString());
            });
        });

        // Fetch users from global database
        let usersMap = {};
        if (userIds.size > 0) {
            const users = await User.find({ _id: { $in: Array.from(userIds) } })
                .select('firstName lastName email roleId')
                .lean();
            usersMap = users.reduce((acc, user) => {
                acc[user._id.toString()] = user;
                return acc;
            }, {});
        }

        // Attach user data
        items.forEach(item => {
            fields.forEach(field => {
                if (item[field]) {
                    item[field] = usersMap[item[field].toString()] || item[field];
                }
            });
        });

        return isArray ? items : items[0];
    }

    _shouldFetchAll(all) {
        if (typeof all === 'string') {
            return all.toLowerCase() === 'true';
        }
        return Boolean(all);
    }

    _buildAdjustmentFilters({
        status,
        storeId,
        adjustmentType,
        productId,
        categoryId,
        subCategoryId,
        SKU,
        startDate,
        endDate,
    } = {}) {
        const filters = {};

        if (this.businessId) {
            filters.businessId = this.businessId;
        }

        const normalizedStatus =
            typeof status === 'string'
                ? status.trim().toLowerCase()
                : status;

        if (normalizedStatus && normalizedStatus !== 'all') {
            filters.status = normalizedStatus;
        }

        filters.isDeleted = false;

        if (storeId) filters.storeId = storeId;
        if (adjustmentType) filters.adjustmentType = adjustmentType;
        if (productId) filters.productId = productId;
        if (categoryId) filters.categoryId = categoryId;
        if (subCategoryId) filters.subCategoryId = subCategoryId;

        if (SKU) {
            filters.SKU = SKU.trim().toUpperCase();
        }

        if (startDate || endDate) {
            filters.createdAt = {};
            if (startDate) filters.createdAt.$gte = new Date(startDate);
            if (endDate) filters.createdAt.$lte = new Date(endDate);
        }

        return filters;
    }

    async _listAllAdjustments({
        filters = {},
        search = '',
        searchFields = [],
        sortBy = 'createdAt',
        sortOrder = 'desc',
        populate = null,
    } = {}) {
        const StockAdjustment = await this._getStockAdjustmentModel();
        const filter = this._applySearchFilter(filters, search, searchFields);
        const sort = this._composeSort(sortBy, sortOrder);

        let query = StockAdjustment.find(filter).sort(sort);
        if (populate) {
            query = query.populate(populate);
        }

        return query.lean({ virtuals: true }).exec();
    }

    _applySearchFilter(filters = {}, searchTerm = '', searchFields = []) {
        const term =
            typeof searchTerm === 'string' ? searchTerm.trim() : searchTerm || '';

        if (!term || !searchFields.length) {
            return { ...filters };
        }

        if (filters.$or) {
            return { ...filters };
        }

        return {
            ...filters,
            $or: searchFields.map((field) => ({
                [field]: { $regex: term, $options: 'i' },
            })),
        };
    }

    _composeSort(sortBy = 'createdAt', sortOrder = 'desc') {
        const normalizedField = sortBy || 'createdAt';
        const normalizedOrder =
            typeof sortOrder === 'string'
                ? sortOrder.trim().toLowerCase() === 'asc'
                : sortOrder === 1 || sortOrder === true;

        return {
            [normalizedField]: normalizedOrder ? 1 : -1,
        };
    }

    // ========================================
    // CRUD OPERATIONS
    // ========================================

    /**
     * Create a new stock adjustment
     * @param {Object} adjustmentData - Adjustment details
     * @param {string} adjustmentData.storeId - Store ID
     * @param {string} adjustmentData.productId - Product ID
     * @param {string} adjustmentData.categoryId - Category ID
     * @param {string} adjustmentData.subCategoryId - Sub Category ID
     * @param {string} adjustmentData.SKU - Product SKU
     * @param {string} adjustmentData.adjustmentType - Adjustment type (increase/decrease/no_change)
     * @param {number} adjustmentData.actualStock - Actual stock after recount
     * @param {number} adjustmentData.previousStock - Stock before adjustment
     * @param {string} adjustmentData.reason - Reason for adjustment
     * @param {string} adjustmentData.createdBy - User ID who created
     * @param {string} [adjustmentData.notes] - Additional notes
     * @param {string} [adjustmentData.referenceType] - Reference type
     * @param {string} [adjustmentData.referenceId] - Reference ID
     * @returns {Promise<Object>} Created adjustment record
     */
    async createAdjustment(adjustmentData) {
        const StockAdjustment = await this._getStockAdjustmentModel();
        const Product = await this.getModel('Product', ProductSchema, 'products');
        const Stock = await this.getModel('Stock', StockSchema, 'stocks');

        // Validate product exists
        const product = await Product.findOne({
            _id: adjustmentData.productId,
            status: true,
        }).select('hasVariation SKU variantData category subCategory');

        if (!product) {
            throw new Error('Product not found');
        }

        // Validate SKU belongs to product
        let targetSKU = adjustmentData.SKU.trim().toUpperCase();

        if (product.hasVariation) {
            const variantExists = product.variantData?.some(
                (v) => v.SKU === targetSKU && v.status === true
            );
            if (!variantExists) {
                throw new Error(`SKU '${targetSKU}' not found in product variants`);
            }
        } else {
            if (product.SKU !== targetSKU) {
                throw new Error('SKU does not match product SKU');
            }
        }

        // Get current stock to verify previousStock value
        const currentStock = await Stock.findOne({
            productId: adjustmentData.productId,
            storeId: adjustmentData.storeId,
            SKU: targetSKU,
            status: true,
        });

        if (!currentStock) {
            throw new Error('Stock record not found for this product/SKU in the specified store');
        }

        // Verify previousStock matches current stock
        if (currentStock.quantity !== adjustmentData.previousStock) {
            throw new Error(
                `Previous stock mismatch. Expected: ${currentStock.quantity}, Provided: ${adjustmentData.previousStock}`
            );
        }

        // Create adjustment record
        const adjustment = new StockAdjustment({
            businessId: this.businessId,
            ...adjustmentData,
            SKU: targetSKU,
            categoryId: adjustmentData.categoryId || product.category,
            subCategoryId: adjustmentData.subCategoryId || product.subCategory,
        });

        return await adjustment.save();
    }

    /**
     * Get adjustment by ID
     * @param {string} adjustmentId - Adjustment ID
     * @returns {Promise<Object>} Adjustment record
     */
    async getAdjustment(adjustmentId) {
        const StockAdjustment = await this._getStockAdjustmentModel();
        const adjustment = await StockAdjustment.findById(adjustmentId)
            .populate('storeId productId categoryId subCategoryId')
            .lean();

        if (!adjustment) return null;

        // RBAC: Validate store access if entity is store-scoped
        if (this.rbacConfig.enabled && this.rbacConfig.storeScoped && adjustment.storeId) {
            const storeId = typeof adjustment.storeId === 'object' ? adjustment.storeId._id : adjustment.storeId;
            validateStoreAccess(storeId);
        }

        return await this._populateUsers(adjustment);
    }

    /**
     * Get all adjustments with optional filters
     * @param {Object} [filters] - Filter options
     * @param {string} [filters.storeId] - Store ID
     * @param {string} [filters.status] - Adjustment status
     * @param {string} [filters.adjustmentType] - Adjustment type
     * @param {string} [filters.productId] - Product ID
     * @param {string} [filters.SKU] - Product SKU
     * @param {string} [filters.categoryId] - Category ID
     * @param {string} [filters.subCategoryId] - Sub Category ID
     * @param {Date} [filters.startDate] - Start date
     * @param {Date} [filters.endDate] - End date
     * @param {boolean|string} [filters.all] - Return all records without pagination
     * @param {number} [page=1] - Page number
     * @param {number} [limit=10] - Items per page
     * @returns {Promise<Object>} Paginated adjustments
     */
    async getAdjustments(filters = {}, page = 1, limit = 10) {
        await this._ensureReferenceModels();

        const {
            all,
            status,
            storeId,
            adjustmentType,
            productId,
            categoryId,
            subCategoryId,
            SKU,
            startDate,
            endDate,
            search = '',
            sortBy = 'createdAt', // Default for adjustments
            sortOrder = 'desc',
        } = filters;

        const shouldFetchAll = this._shouldFetchAll(all);
        const populateConfig = [
            { path: 'storeId', select: 'name' },
            {
                path: 'productId',
                select:
                    'productName SKU variantData.variantValues variantData.SKU variantData.variantTitle',
            },
            { path: 'categoryId', select: 'categoryName' },
            { path: 'subCategoryId', select: 'subcategory' },
        ];

        const queryFilters = this._buildAdjustmentFilters({
            status,
            storeId,
            adjustmentType,
            productId,
            categoryId,
            subCategoryId,
            SKU,
            startDate,
            endDate,
        });

        // --- Enhanced Search Logic ---
        if (search && typeof search === 'string' && search.trim()) {
            const searchTerm = search.trim();
            const searchRegex = new RegExp(searchTerm, 'i');
            const orConditions = [];

            // 1. Existing text fields
            ['reason', 'notes', 'SKU'].forEach((field) => {
                orConditions.push({ [field]: searchRegex });
            });

            // 2. Quantity (exact match if number)
            if (!isNaN(searchTerm)) {
                orConditions.push({ actualStock: Number(searchTerm) });
            }

            // 3. Pre-fetch related IDs
            const Store = await this.getModel('Store', StoreSchema, 'stores');
            const Product = await this.getModel('Product', ProductSchema, 'products');
            const Category = await this.getModel(
                'ProductCategory',
                ProductCategorySchema,
                'productcategories',
            );
            const SubCategory = await this.getModel(
                'SubCategory',
                SubCategorySchema,
                'subcategories',
            );

            const [storeIds, productIds, categoryIds, subCategoryIds] =
                await Promise.all([
                    Store.find({ name: searchRegex }).distinct('_id'),
                    Product.find({ productName: searchRegex }).distinct('_id'),
                    Category.find({ categoryName: searchRegex }).distinct('_id'),
                    SubCategory.find({ subcategory: searchRegex }).distinct('_id'),
                ]);

            if (storeIds.length) {
                orConditions.push({ storeId: { $in: storeIds } });
            }
            if (productIds.length) {
                orConditions.push({ productId: { $in: productIds } });
            }
            if (categoryIds.length) {
                orConditions.push({ categoryId: { $in: categoryIds } });
            }
            if (subCategoryIds.length) {
                orConditions.push({ subCategoryId: { $in: subCategoryIds } });
            }

            // Combine with existing filters
            if (orConditions.length) {
                queryFilters.$or = orConditions;
            }
        }

        const listParams = {
            page,
            limit,
            search,
            sortBy,
            sortOrder,
            searchFields: [], // We handled search manually in filters.$or
            filters: queryFilters,
            populate: populateConfig,
        };

        let result;
        if (shouldFetchAll) {
            const data = await this._listAllAdjustments({
                filters: queryFilters,
                search,
                searchFields: [],
                sortBy,
                sortOrder,
                populate: populateConfig,
            });
            result = {
                data,
                total: data.length,
            };
        } else {
            result = await super.list(listParams);
        }

        // Manually populate User references from global database
        if (result.data) {
            result.data = await this._populateUsers(result.data);
        }

        return result;
    }

    /**
     * Update an adjustment (only pending adjustments can be updated)
     * Allows updating any field except truly immutable ones (_id, createdBy, businessId)
     * @param {string} adjustmentId - Adjustment ID
     * @param {Object} updateData - Update data
     * @returns {Promise<Object>} Updated adjustment
     */
    async updateAdjustment(adjustmentId, updateData) {
        const StockAdjustment = await this._getStockAdjustmentModel();
        const Product = await this.getModel('Product', ProductSchema, 'products');
        const Stock = await this.getModel('Stock', StockSchema, 'stocks');

        const adjustment = await StockAdjustment.findById(adjustmentId);

        if (!adjustment) {
            throw new Error('Adjustment not found');
        }

        if (adjustment.status !== ADJUSTMENT_STATUSES.PENDING) {
            throw new Error('Only pending adjustments can be updated');
        }

        // Prevent updates to truly immutable fields
        const immutableFields = ['businessId', 'createdBy', '_id'];
        for (const field of immutableFields) {
            if (updateData[field] !== undefined) {
                throw new Error(`Cannot update immutable field: ${field}`);
            }
        }

        // Prevent status updates through this method (use dedicated status methods instead)
        if (updateData.status !== undefined) {
            throw new Error('Cannot update status directly. Use approveAdjustment, cancelAdjustment, or completeAdjustment methods instead.');
        }

        // Determine target values (may change if productId, SKU, or storeId is updated)
        let targetProductId = updateData.productId || adjustment.productId;
        let targetStoreId = updateData.storeId || adjustment.storeId;
        let targetSKU = updateData.SKU ? updateData.SKU.trim().toUpperCase() : adjustment.SKU;

        // Handle productId update with validation
        if (updateData.productId !== undefined) {
            const newProduct = await Product.findOne({
                _id: updateData.productId,
                status: true,
            }).select('hasVariation SKU variantData category subCategory');

            if (!newProduct) {
                throw new Error('New product not found');
            }

            // If SKU is also provided, validate it belongs to the new product
            if (updateData.SKU !== undefined) {
                if (newProduct.hasVariation) {
                    const variantExists = newProduct.variantData?.some(
                        (v) => v.SKU === targetSKU && v.status === true
                    );
                    if (!variantExists) {
                        throw new Error(`SKU '${targetSKU}' not found in new product variants`);
                    }
                } else {
                    if (newProduct.SKU !== targetSKU) {
                        throw new Error('SKU does not match new product SKU');
                    }
                }
            } else {
                // If only productId is updated, validate current SKU belongs to new product
                if (newProduct.hasVariation) {
                    const variantExists = newProduct.variantData?.some(
                        (v) => v.SKU === adjustment.SKU && v.status === true
                    );
                    if (!variantExists) {
                        throw new Error(`Current SKU '${adjustment.SKU}' not found in new product variants. Please provide a valid SKU.`);
                    }
                } else {
                    if (newProduct.SKU !== adjustment.SKU) {
                        throw new Error(`Current SKU '${adjustment.SKU}' does not match new product SKU '${newProduct.SKU}'. Please update SKU.`);
                    }
                }
                targetSKU = adjustment.SKU; // Keep current SKU if it's valid for new product
            }

            // Update productId and auto-update category/subcategory from new product
            adjustment.productId = updateData.productId;
            if (!updateData.categoryId) {
                adjustment.categoryId = newProduct.category;
            }
            if (!updateData.subCategoryId && !updateData.subcategoryId) {
                adjustment.subCategoryId = newProduct.subCategory || adjustment.subCategoryId;
            }
        } else if (updateData.SKU !== undefined) {
            // Only SKU is being updated (same product)
            const product = await Product.findOne({
                _id: adjustment.productId,
                status: true,
            }).select('hasVariation SKU variantData category subCategory');

            if (!product) {
                throw new Error('Product not found');
            }

            // Validate SKU belongs to product
            if (product.hasVariation) {
                const variantExists = product.variantData?.some(
                    (v) => v.SKU === targetSKU && v.status === true
                );
                if (!variantExists) {
                    throw new Error(`SKU '${targetSKU}' not found in product variants`);
                }
            } else {
                if (product.SKU !== targetSKU) {
                    throw new Error('SKU does not match product SKU');
                }
            }
        }

        // Handle storeId update with validation
        if (updateData.storeId !== undefined) {
            adjustment.storeId = updateData.storeId;
            targetStoreId = updateData.storeId;
        }

        // Update SKU if changed
        if (updateData.SKU !== undefined || updateData.productId !== undefined) {
            adjustment.SKU = targetSKU;
        }

        // Validate stock exists for the final product/SKU/store combination
        const currentStock = await Stock.findOne({
            productId: targetProductId,
            storeId: targetStoreId,
            SKU: targetSKU,
            status: true,
        });

        if (!currentStock) {
            throw new Error(`Stock record not found for product/SKU '${targetProductId}/${targetSKU}' in store '${targetStoreId}'`);
        }

        // Update previousStock if provided, or auto-update it based on current stock if product/SKU/store changed
        if (updateData.previousStock !== undefined) {
            adjustment.previousStock = updateData.previousStock;
        } else if (updateData.productId !== undefined || updateData.SKU !== undefined || updateData.storeId !== undefined) {
            // Auto-update previousStock to match current stock when product/SKU/store changes
            adjustment.previousStock = currentStock.quantity;
        }

        // Update all other fields that are provided (except immutable ones already handled)
        const fieldsToSkip = ['_id', 'businessId', 'createdBy', 'status', 'productId', 'SKU', 'storeId', 'previousStock'];
        for (const [key, value] of Object.entries(updateData)) {
            if (!fieldsToSkip.includes(key) && value !== undefined) {
                // Handle subcategory field name variations
                if (key === 'subcategoryId') {
                    adjustment.subCategoryId = value;
                } else {
                    adjustment[key] = value;
                }
            }
        }

        // Recalculate adjustmentType based on difference if actualStock or previousStock changed
        const actualStockChanged = updateData.actualStock !== undefined;
        const previousStockChanged = updateData.previousStock !== undefined;
        const productOrSkuOrStoreChanged = updateData.productId !== undefined ||
            updateData.SKU !== undefined ||
            updateData.storeId !== undefined;

        if (actualStockChanged || previousStockChanged || productOrSkuOrStoreChanged) {
            const actualStock = updateData.actualStock !== undefined
                ? updateData.actualStock
                : adjustment.actualStock;
            const previousStock = adjustment.previousStock;

            const difference = actualStock - previousStock;

            // Auto-calculate adjustmentType if not explicitly provided
            if (updateData.adjustmentType === undefined) {
                if (difference > 0) {
                    adjustment.adjustmentType = 'increase';
                } else if (difference < 0) {
                    adjustment.adjustmentType = 'decrease';
                } else {
                    adjustment.adjustmentType = 'no_change';
                }
            }
        }

        // Save the adjustment (pre-save middleware will handle adjustedValue recalculation)
        const savedAdjustment = await adjustment.save();

        // Return the saved adjustment (convert to plain object for consistency)
        return savedAdjustment.toObject ? savedAdjustment.toObject() : savedAdjustment;
    }

    /**
     * Delete an adjustment (soft delete)
     * @param {string} adjustmentId - Adjustment ID
     * @param {string} deletedBy - User ID who deleted
     * @returns {Promise<Object>} Deleted adjustment
     */
    async deleteAdjustment(adjustmentId, deletedBy) {
        const StockAdjustment = await this._getStockAdjustmentModel();

        const adjustment = await StockAdjustment.findById(adjustmentId);

        if (!adjustment) {
            throw new Error('Adjustment not found');
        }

        if (adjustment.status !== ADJUSTMENT_STATUSES.PENDING && adjustment.status !== ADJUSTMENT_STATUSES.CANCELLED) {
            throw new Error('Only pending or cancelled adjustments can be deleted');
        }

        adjustment.isDeleted = true;
        adjustment.deletedAt = new Date();
        adjustment.deletedBy = deletedBy;

        return await adjustment.save();
    }

    /**
     * Bulk delete adjustments
     * @param {Array<string>} adjustmentIds
     * @param {string} deletedBy
     * @returns {Promise<Array>}
     */
    async bulkDeleteAdjustments(adjustmentIds, deletedBy) {
        if (!Array.isArray(adjustmentIds) || adjustmentIds.length === 0) {
            throw new Error('Adjustment IDs array is required');
        }

        const results = [];

        for (const id of adjustmentIds) {
            try {
                const data = await this.deleteAdjustment(id, deletedBy);
                results.push({ success: true, id, data });
            } catch (error) {
                results.push({
                    success: false,
                    id,
                    error: error.message,
                });
            }
        }

        return results;
    }

    // ========================================
    // APPROVAL WORKFLOW
    // ========================================

    /**
     * Get pending adjustments requiring approval
     * @param {string} [storeId] - Optional store ID filter
     * @returns {Promise<Array>} List of pending adjustments
     */
    async getPendingAdjustments(storeId = null) {
        const StockAdjustment = await this._getStockAdjustmentModel();

        const query = {
            status: 'pending',
            isDeleted: false,
        };

        if (this.businessId) {
            query.businessId = this.businessId;
        }

        if (storeId) {
            query.storeId = storeId;
        }

        const adjustments = await StockAdjustment.find(query)
            .populate('storeId productId')
            .sort({ createdAt: 1 }) // Oldest first
            .lean();

        return await this._populateUsers(adjustments, ['createdBy']);
    }

    /**
     * Change adjustment status to pending
     * @param {string} adjustmentId - Adjustment ID
     * @returns {Promise<Object>} Updated adjustment record
     */
    async pendingAdjustment(adjustmentId) {
        const StockAdjustment = await this._getStockAdjustmentModel();
        const adjustment = await StockAdjustment.findById(adjustmentId);

        if (!adjustment) {
            throw new Error('Adjustment not found');
        }

        this._assertStatusTransition(adjustment.status, ADJUSTMENT_STATUSES.PENDING);

        adjustment.status = ADJUSTMENT_STATUSES.PENDING;
        // Clear approval details
        adjustment.approvedBy = undefined;
        adjustment.approvedAt = undefined;

        return await adjustment.save();
    }


    /**
     * Approve an adjustment
     * @param {string} adjustmentId - Adjustment ID
     * @param {string} approvedBy - User ID who approved
     * @returns {Promise<Object>} Approved adjustment
     */
    async approveAdjustment(adjustmentId, approvedBy) {
        const StockAdjustment = await this._getStockAdjustmentModel();

        const adjustment = await StockAdjustment.findById(adjustmentId);

        if (!adjustment) {
            throw new Error('Adjustment not found');
        }

        if (!ADJUSTMENT_STATUS_TRANSITIONS[adjustment.status].has(ADJUSTMENT_STATUSES.APPROVED)) {
            throw new Error(`Cannot approve adjustment in ${adjustment.status} state`);
        }

        return await adjustment.approve(approvedBy);
    }

    /**
     * Cancel an adjustment
     * @param {string} adjustmentId - Adjustment ID
     * @param {string} cancelledBy - User ID who cancelled
     * @param {string} rejectionReason - Reason for cancellation
     * @returns {Promise<Object>} Cancelled adjustment
     */
    async cancelAdjustment(adjustmentId, cancelledBy, rejectionReason) {
        const StockAdjustment = await this._getStockAdjustmentModel();

        const adjustment = await StockAdjustment.findById(adjustmentId);

        if (!adjustment) {
            throw new Error('Adjustment not found');
        }

        if (!ADJUSTMENT_STATUS_TRANSITIONS[adjustment.status].has(ADJUSTMENT_STATUSES.CANCELLED)) {
            throw new Error(`Cannot cancel adjustment in ${adjustment.status} state`);
        }

        return await adjustment.cancel(cancelledBy, rejectionReason);
    }

    /**
     * Complete an adjustment (apply to stock)
     * @param {string} adjustmentId - Adjustment ID
     * @param {string} actingUserId - User ID who completed (acting as approver if needed)
     * @returns {Promise<Object>} Completed adjustment
     */
    async completeAdjustment(adjustmentId, actingUserId) {
        return this.executeTenantTransaction(async (session) => {
            const StockAdjustment = await this._getStockAdjustmentModel();
            const Stock = await this.getModel('Stock', StockSchema, 'stocks');

            const adjustment = await StockAdjustment.findById(adjustmentId).session(session);

            if (!adjustment) {
                throw new Error('Adjustment not found');
            }

            if (!ADJUSTMENT_STATUS_TRANSITIONS[adjustment.status].has(ADJUSTMENT_STATUSES.COMPLETED)) {
                throw new Error(`Cannot complete adjustment in ${adjustment.status} state`);
            }

            // Auto-approve if moving directly to completed and not yet approved
            if (!adjustment.approvedBy && actingUserId) {
                adjustment.approvedBy = actingUserId;
                if (!adjustment.approvedAt) {
                    adjustment.approvedAt = new Date();
                }
            }

            // Apply stock adjustment
            const stock = await Stock.findOne({
                productId: adjustment.productId,
                storeId: adjustment.storeId,
                SKU: adjustment.SKU,
                status: true,
            }).session(session);

            if (!stock) {
                throw new Error('Stock record not found');
            }

            // Update stock quantity
            stock.quantity = adjustment.adjustedValue;
            await stock.save({ session });

            // Mark adjustment as completed
            return await adjustment.complete();
        });
    }

    /**
     * Update adjustment status with transition validation
     * @param {string} adjustmentId
     * @param {string} targetStatus
     * @param {string} actingUserId
     * @param {Object} [options]
     * @returns {Promise<Object>}
     */
    async updateAdjustmentStatus(
        adjustmentId,
        targetStatus,
        actingUserId,
        options = {}
    ) {
        if (!adjustmentId) {
            throw new Error('Adjustment ID is required');
        }

        const normalizedStatus = this._normalizeAdjustmentStatus(targetStatus);

        const StockAdjustment = await this._getStockAdjustmentModel();
        const adjustment = await StockAdjustment.findById(adjustmentId);

        if (!adjustment) {
            throw new Error('Adjustment not found');
        }

        this._assertStatusTransition(adjustment.status, normalizedStatus);

        if (adjustment.status === normalizedStatus) {
            return adjustment;
        }

        switch (normalizedStatus) {
            case ADJUSTMENT_STATUSES.PENDING:
                return this.pendingAdjustment(adjustmentId);
            case ADJUSTMENT_STATUSES.APPROVED:
                return this.approveAdjustment(adjustmentId, actingUserId);
            case ADJUSTMENT_STATUSES.COMPLETED:
                return this.completeAdjustment(adjustmentId, actingUserId);
            case ADJUSTMENT_STATUSES.CANCELLED:
                return this.cancelAdjustment(adjustmentId, actingUserId, options.reason);
            default:
                throw new Error(`Unsupported status transition to "${normalizedStatus}"`);
        }
    }

    /**
     * Bulk update adjustment statuses with constraints
     * @param {Array<Object>} updates
     * @param {string} actingUserId
     * @returns {Promise<Array>}
     */
    async bulkUpdateAdjustmentStatus(updates = [], actingUserId) {
        if (!Array.isArray(updates) || updates.length === 0) {
            throw new Error('Updates array is required');
        }

        if (updates.length > 100) {
            throw new Error('Maximum 100 adjustments allowed per request');
        }

        const results = [];

        for (const update of updates) {
            const { adjustmentId, status, reason } = update || {};

            if (!adjustmentId || !status) {
                results.push({
                    success: false,
                    adjustmentId,
                    error: 'Both adjustmentId and status are required',
                });
                continue;
            }

            try {
                const data = await this.updateAdjustmentStatus(
                    adjustmentId,
                    status,
                    actingUserId,
                    { reason }
                );
                results.push({ success: true, adjustmentId, data });
            } catch (error) {
                results.push({
                    success: false,
                    adjustmentId,
                    error: error.message,
                });
            }
        }

        return results;
    }

    _normalizeAdjustmentStatus(status) {
        const normalized =
            typeof status === 'string' ? status.trim().toLowerCase() : '';

        const validStatuses = Object.values(ADJUSTMENT_STATUSES);
        if (!normalized || !validStatuses.includes(normalized)) {
            throw new Error(`Invalid status "${status}" provided`);
        }

        return normalized;
    }

    _assertStatusTransition(currentStatus, nextStatus) {
        const allowedTargets = ADJUSTMENT_STATUS_TRANSITIONS[currentStatus];

        if (!allowedTargets || !allowedTargets.has(nextStatus)) {
            throw new Error(
                `Cannot move adjustment from "${currentStatus}" to "${nextStatus}"`
            );
        }
    }

    // ========================================
    // STATISTICS & REPORTING
    // ========================================

    /**
     * Get adjustment statistics for a store
     * @param {string} storeId - Store ID
     * @param {Date} [startDate] - Start date
     * @param {Date} [endDate] - End date
     * @returns {Promise<Object>} Adjustment statistics
     */
    async getAdjustmentStats(storeId, startDate = null, endDate = null) {
        const StockAdjustment = await this._getStockAdjustmentModel();

        const matchQuery = {
            storeId,
            isDeleted: false,
        };

        if (this.businessId) {
            matchQuery.businessId = this.businessId;
        }

        if (startDate || endDate) {
            matchQuery.createdAt = {};
            if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
            if (endDate) matchQuery.createdAt.$lte = new Date(endDate);
        }

        const stats = await StockAdjustment.aggregate([
            { $match: matchQuery },
            {
                $addFields: {
                    difference: { $subtract: ['$actualStock', '$previousStock'] },
                },
            },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    totalIncrease: {
                        $sum: {
                            $cond: [{ $gt: ['$difference', 0] }, '$difference', 0],
                        },
                    },
                    totalDecrease: {
                        $sum: {
                            $cond: [
                                { $lt: ['$difference', 0] },
                                { $abs: '$difference' },
                                0,
                            ],
                        },
                    },
                },
            },
        ]);

        // Format results
        const result = {
            pending: { count: 0, totalIncrease: 0, totalDecrease: 0 },
            approved: { count: 0, totalIncrease: 0, totalDecrease: 0 },
            cancelled: { count: 0, totalIncrease: 0, totalDecrease: 0 },
            completed: { count: 0, totalIncrease: 0, totalDecrease: 0 },
            total: { count: 0, totalIncrease: 0, totalDecrease: 0 },
        };

        stats.forEach((stat) => {
            result[stat._id] = {
                count: stat.count,
                totalIncrease: stat.totalIncrease,
                totalDecrease: stat.totalDecrease,
            };
            result.total.count += stat.count;
            result.total.totalIncrease += stat.totalIncrease;
            result.total.totalDecrease += stat.totalDecrease;
        });

        return result;
    }

    /**
     * Get product adjustment summary
     * @param {string} productId - Product ID
     * @param {string} storeId - Store ID
     * @param {string} SKU - Product SKU
     * @returns {Promise<Array>} Adjustment summary
     */
    async getProductAdjustmentSummary(productId, storeId, SKU) {
        const StockAdjustment = await this._getStockAdjustmentModel();
        return await StockAdjustment.getProductSummary(productId, storeId, SKU);
    }

    /**
     * Get adjustments by store
     * @param {string} storeId - Store ID
     * @param {Object} [options] - Filter options
     * @returns {Promise<Array>} List of adjustments
     */
    async getAdjustmentsByStore(storeId, options = {}) {
        const StockAdjustment = await this._getStockAdjustmentModel();
        const adjustments = await StockAdjustment.findByStore(storeId, options);
        return await this._populateUsers(adjustments, ['createdBy', 'approvedBy', 'cancelledBy']);
    }

    /**
     * Get adjustment history for a product
     * @param {string} productId - Product ID
     * @param {string} [storeId] - Optional store ID
     * @param {number} [limit=50] - Limit results
     * @returns {Promise<Array>} Adjustment history
     */
    async getProductAdjustmentHistory(productId, storeId = null, limit = 50) {
        const StockAdjustment = await this._getStockAdjustmentModel();

        const query = {
            productId,
            isDeleted: false,
        };

        if (this.businessId) {
            query.businessId = this.businessId;
        }

        if (storeId) {
            query.storeId = storeId;
        }

        const adjustments = await StockAdjustment.find(query)
            .populate('storeId')
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();

        return await this._populateUsers(adjustments, ['createdBy', 'approvedBy']);
    }

    /**
     * Get adjustments by date range
     * @param {Date} startDate - Start date
     * @param {Date} endDate - End date
     * @param {Object} [filters] - Additional filters
     * @returns {Promise<Array>} List of adjustments
     */
    async getAdjustmentsByDateRange(startDate, endDate, filters = {}) {
        const StockAdjustment = await this._getStockAdjustmentModel();

        const query = {
            createdAt: {
                $gte: new Date(startDate),
                $lte: new Date(endDate),
            },
            isDeleted: false,
            ...filters,
        };

        if (this.businessId) {
            query.businessId = this.businessId;
        }

        const adjustments = await StockAdjustment.find(query)
            .populate('storeId productId')
            .sort({ createdAt: -1 })
            .lean();

        return await this._populateUsers(adjustments, ['createdBy', 'approvedBy']);
    }

    /**
     * Get recent adjustments
     * @param {number} [limit=10] - Number of recent adjustments
     * @param {string} [storeId] - Optional store ID filter
     * @returns {Promise<Array>} Recent adjustments
     */
    async getRecentAdjustments(limit = 10, storeId = null) {
        const StockAdjustment = await this._getStockAdjustmentModel();

        const query = { isDeleted: false };

        if (this.businessId) {
            query.businessId = this.businessId;
        }

        if (storeId) {
            query.storeId = storeId;
        }

        const adjustments = await StockAdjustment.find(query)
            .populate('storeId productId')
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();

        return await this._populateUsers(adjustments, ['createdBy']);
    }

    /**
     * Bulk get stock adjustments by IDs
     * @param {Array<string>} ids - Stock adjustment IDs to retrieve
     * @param {Object} options - Optional configuration
     * @param {String} options.status - Filter by status (pending, approved, cancelled, completed)
     * @param {String} options.storeId - Filter by store
     * @returns {Promise<Object>} Result object with data, found, notFound counts
     */
    async bulkGetAdjustments(ids, options = {}) {
        if (!Array.isArray(ids) || !ids.length) {
            throw new Error('Adjustment IDs array is required');
        }

        const normalizedIds = ids.map((id) => {
            const normalized = id?.toString?.()?.trim();
            if (!normalized) throw new Error('Invalid adjustment ID format');
            this.validateObjectId(normalized);
            return normalized;
        });

        const { status, storeId } = options;
        const StockAdjustment = await this._getStockAdjustmentModel();

        // Build query
        const query = { _id: { $in: normalizedIds }, isDeleted: false };
        if (status) query.status = status;
        if (storeId) query.storeId = storeId;

        let documents = await StockAdjustment.find(query)
            .populate('storeId productId categoryId subCategoryId')
            .lean();

        // Populate User references
        documents = await this._populateUsers(documents);

        const foundIds = new Set(documents.map((doc) => doc._id.toString()));

        return {
            data: documents,
            found: documents.length,
            notFound: normalizedIds.filter((id) => !foundIds.has(id)),
            totalRequested: normalizedIds.length,
        };
    }
}

export default StockAdjustmentServices;
