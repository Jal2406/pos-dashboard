import {
  StockTransferSchema,
  ProductSchema,
  StockSchema,
  StoreSchema,
  ProductCategorySchema,
  SubCategorySchema,
} from '../models/index.js';
import { BaseService } from '../utils/index.js';
import { applyStoreScope } from '../utils/serviceGuard.js';
import { StockBatchServices } from './index.js';

const TRANSFER_SEARCH_FIELDS = Object.freeze([
  'reason',
  'notes',
  'SKU',
]);

const TRANSFER_STATUSES = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
});

const TRANSFER_STATUS_TRANSITIONS = Object.freeze({
  [TRANSFER_STATUSES.PENDING]: new Set([
    TRANSFER_STATUSES.PENDING,
    TRANSFER_STATUSES.APPROVED,
    TRANSFER_STATUSES.COMPLETED,
    TRANSFER_STATUSES.CANCELLED,
  ]),
  [TRANSFER_STATUSES.APPROVED]: new Set([
    TRANSFER_STATUSES.APPROVED,
    TRANSFER_STATUSES.PENDING,
    TRANSFER_STATUSES.COMPLETED,
    TRANSFER_STATUSES.CANCELLED,
  ]),
  [TRANSFER_STATUSES.COMPLETED]: new Set([TRANSFER_STATUSES.COMPLETED]),
  [TRANSFER_STATUSES.CANCELLED]: new Set([TRANSFER_STATUSES.CANCELLED]),
});

class StockServices extends BaseService {
  constructor(businessId) {
    if (!businessId) {
      throw new Error('StockServices initialized without businessId');
    }
    super({
      modelName: 'StockTransfer',
      schema: StockTransferSchema,
      collection: 'stocktransfers',
      businessId,
    });
    
    // RBAC: Stock transfers are store-scoped (fromStoreId/toStoreId)
    // Note: Stock model itself uses storeId, but this service handles transfers
    // Store scoping applied via fromStoreId/toStoreId fields in queries
    this.rbacConfig.storeScoped = true;
    this.rbacConfig.storeIdField = 'fromStoreId'; // Primary field for scoping
    
    this._referenceModelsReady = false;
    this._stockBatchService = new StockBatchServices(businessId);
  }

  // Expose Stock model via service to avoid direct schema imports elsewhere
  async getStockModel() {
    return this.getModel('Stock', StockSchema, 'stocks');
  }

  async _ensureReferenceModels() {
    if (this._referenceModelsReady) {
      return;
    }

    await Promise.all([
      this.getModel('Store', StoreSchema, 'stores'),
      this.getModel(
        'ProductCategory',
        ProductCategorySchema,
        'productcategories',
      ),
      this.getModel('SubCategory', SubCategorySchema, 'subcategories'),
      this.getModel('Product', ProductSchema, 'products'),
    ]);

    this._referenceModelsReady = true;
  }

  async _getStockTransferModel() {
    const StockTransfer = await this.getModel();
    await this._ensureReferenceModels();
    return StockTransfer;
  }

  _shouldFetchAll(all) {
    if (typeof all === 'string') {
      return all.toLowerCase() === 'true';
    }
    return Boolean(all);
  }

  _buildTransferFilters({ status, storeId, productId, requestedBy, SKU } = {}) {
    const filters = {};

    if (this.businessId) {
      filters.businessId = this.businessId;
    }

    const normalizedStatus =
      typeof status === 'string' ? status.trim().toLowerCase() : status;
    if (normalizedStatus && normalizedStatus !== 'all') {
      filters.status = normalizedStatus;
    }

    const objectIdFields = {
      productId,
      requestedBy,
    };

    Object.entries(objectIdFields).forEach(([field, value]) => {
      if (value) {
        this.validateObjectId(value);
        filters[field] = value;
      }
    });

    if (storeId) {
      this.validateObjectId(storeId);
      filters.$or = [
        { fromStoreId: storeId },
        { toStoreId: storeId },
      ];
    }

    if (SKU) {
      filters.SKU = SKU.trim().toUpperCase();
    }

    return filters;
  }

  async _listAllTransfers({
    filters = {},
    search = '',
    searchFields = [],
    sortBy = 'requestedDate',
    sortOrder = 'desc',
    populate = null,
  } = {}) {
    const StockTransfer = await this._getStockTransferModel();
    const filter = this._applySearchFilter(filters, search, searchFields);
    
    // RBAC: Apply store scoping if entity is store-scoped
    // Note: Stock transfers use fromStoreId/toStoreId, but we scope by fromStoreId
    if (this.rbacConfig.enabled && this.rbacConfig.storeScoped) {
        applyStoreScope(filter, this.rbacConfig.storeIdField);
    }
    
    const sort = this._composeSort(sortBy, sortOrder);

    let query = StockTransfer.find(filter).sort(sort);
    if (populate) {
      query = query.populate(populate);
    }

    return query.lean({ virtuals: true }).exec();
  }

  _applySearchFilter(filters = {}, searchTerm = '', searchFields = []) {
    const term =
      typeof searchTerm === 'string' ? searchTerm.trim() : searchTerm || '';

    // Simplified: Search invalidation is handled in getTransfers via manual construction
    // This method only handles the simple regex fields passed to it, or returns filters if empty
    if (!term || !searchFields.length) {
      return { ...filters };
    }

    // if $or is already populated by getTransfers, we don't want to overwrite it with simple fields
    // unless we want to AND them? Use discretion.
    // For now, if filters.$or exists, we assume getTransfers handled the search entirely.
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

  _composeSort(sortBy = 'requestedDate', sortOrder = 'desc') {
    const normalizedField = sortBy || 'requestedDate';
    const normalizedOrder =
      typeof sortOrder === 'string'
        ? sortOrder.trim().toLowerCase() === 'asc'
        : sortOrder === 1 || sortOrder === true;

    return {
      [normalizedField]: normalizedOrder ? 1 : -1,
    };
  }



  // ========================================
  // STOCK MANAGEMENT METHODS (Product-based)
  // ========================================

  /**
   * Get stock by product for a specific store
   * @param {string} storeId - Store ID
   * @param {string} productId - Product ID
   * @returns {Promise<Object>} Product with stock information and inventory
   */
  async getStockByProduct(storeId, productId) {
    const Product = await this.getModel('Product', ProductSchema, 'products');
    const Stock = await this.getModel('Stock', StockSchema, 'stocks');

    // Get the product details
    const product = await Product.findOne({
      _id: productId,
      status: true,
    }).populate('category subCategory brand unit');

    if (!product) {
      return null;
    }

    // Get stock records for this product at this store
    const stockRecords = await Stock.find({
      productId: productId,
      storeId: storeId,
      status: true,
    });

    // Attach stock information to product
    product._doc.stockRecords = stockRecords;
    product._doc.storeId = storeId;

    return product;
  }

  /**
   * Update stock quantity for a specific product
   * @param {string} storeId - Store ID
   * @param {string} productId - Product ID
   * @param {number} quantity - Quantity to update
   * @param {string} operation - Operation type ('add', 'subtract', 'set')
   * @param {string} [SKU] - SKU (required for variant products, optional for non-variant)
   * @returns {Promise<Object>} Updated stock record
   */
  async updateStockQuantity(
    storeId,
    productId,
    quantity,
    operation = 'set',
    SKU = null,
  ) {
    const Product = await this.getModel('Product', ProductSchema, 'products');
    const Stock = await this.getModel('Stock', StockSchema, 'stocks');

    // Get the product to determine if it has variations
    const product = await Product.findOne({
      _id: productId,
      status: true,
    });

    if (!product) {
      throw new Error('Product not found');
    }

    let targetSKU;

    // Determine the SKU to use
    if (product.hasVariation) {
      if (!SKU) {
        throw new Error('SKU is required for products with variations');
      }

      // Verify the SKU exists in variantData
      const variantExists = product.variantData.some(
        (v) => v.SKU === SKU && v.status === true,
      );
      if (!variantExists) {
        throw new Error(
          `SKU '${SKU}' not found or inactive in product variants`,
        );
      }

      targetSKU = SKU;
    } else {
      // For non-variant products, use the product's main SKU
      targetSKU = product.SKU;
    }

    // Perform the stock operation using the Stock model's static methods
    let updatedStock;

    if (operation === 'add') {
      updatedStock = await Stock.increment(
        productId,
        storeId,
        targetSKU,
        quantity,
        product.hasVariation,
      );
    } else if (operation === 'subtract') {
      updatedStock = await Stock.increment(
        productId,
        storeId,
        targetSKU,
        -quantity,
        product.hasVariation,
      );
    } else {
      // 'set' operation
      updatedStock = await Stock.setQuantity(
        productId,
        storeId,
        targetSKU,
        quantity,
        product.hasVariation,
      );
    }

    return updatedStock;
  }

  /**
   * Manually add stock entries per store while creating dedicated StockBatch documents.
   * @param {Array|Object} entries - Single entry or array of entries to apply.
   * @param {Object} [options] - Optional metadata (userId, note, supplierId, sourceDocumentId).
   * @returns {Promise<Object>} Summary of processed entries.
   */
  async addManualStock(entries = [], options = {}) {
    const normalizedEntries = Array.isArray(entries) ? entries : [entries];
    if (normalizedEntries.length === 0) {
      throw new Error('entries array with at least one item is required');
    }

    const [Product, Stock, StockBatchModel, ProductCategory] =
      await Promise.all([
        this.getModel('Product', ProductSchema, 'products'),
        this.getModel('Stock', StockSchema, 'stocks'),
        this._stockBatchService.getModel(),
        this.getModel(
          'ProductCategory',
          ProductCategorySchema,
          'productcategories',
        ),
      ]);

    const categoryExpiryCache = new Map();
    const requiresExpiry = async (categoryId) => {
      if (!categoryId) return false;
      const key = String(categoryId);
      if (categoryExpiryCache.has(key)) {
        return categoryExpiryCache.get(key);
      }
      const category = await ProductCategory.findById(categoryId)
        .select('hasExpiry')
        .lean();
      const flag = Boolean(category?.hasExpiry);
      categoryExpiryCache.set(key, flag);
      return flag;
    };

    const normalizeDate = (value, fieldName) => {
      if (value === undefined || value === null || value === '') {
        return undefined;
      }
      const date = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(date.getTime())) {
        throw new Error(`Invalid ${fieldName} provided`);
      }
      return date;
    };

    const normalizeSkuInput = (value) =>
      typeof value === 'string' ? value.trim().toUpperCase() : '';

    const results = [];

    for (const rawEntry of normalizedEntries) {
      try {
        if (!rawEntry || typeof rawEntry !== 'object') {
          throw new Error('Each entry must be an object');
        }

        const {
          productId,
          storeId,
          quantity,
          SKU,
          expiryDate,
          manufacturedAt,
          costPerUnit,
          sellingPrice,
          supplierId,
          note,
          sourceDocumentId,
        } = rawEntry;

        if (!productId || !storeId) {
          throw new Error('productId and storeId are required');
        }

        const parsedQuantity = Number(quantity);
        if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
          throw new Error('quantity must be a positive number');
        }

        const product = await Product.findOne({ _id: productId, status: true })
          .select('SKU hasVariation variantData category')
          .lean();

        if (!product) {
          throw new Error('Product not found');
        }

        let resolvedSKU = '';
        if (product.hasVariation) {
          resolvedSKU = normalizeSkuInput(SKU || rawEntry.variantSKU);
          if (!resolvedSKU) {
            throw new Error('SKU is required for products with variations');
          }
          const variantExists = (product.variantData || []).some(
            (variant) =>
              variant.SKU === resolvedSKU &&
              (variant.status === undefined || variant.status === true),
          );
          if (!variantExists) {
            throw new Error(
              `SKU '${resolvedSKU}' not found or inactive in product variants`,
            );
          }
        } else {
          resolvedSKU = product.SKU;
        }

        const needsExpiry = await requiresExpiry(product.category);
        const normalizedExpiry = normalizeDate(expiryDate, 'expiryDate');
        if (needsExpiry && !normalizedExpiry) {
          throw new Error(
            'expiryDate is required for products in categories that enforce expiry tracking',
          );
        }
        const normalizedManufacturedAt = normalizeDate(
          manufacturedAt,
          'manufacturedAt',
        );

        const actorId =
          options.userId ||
          rawEntry.updatedBy ||
          rawEntry.createdBy ||
          options.actorUserId ||
          null;

        let stockIncremented = false;
        const noteToPersist = note || options.note || 'Manual stock entry';

        try {
          await Stock.increment(
            productId,
            storeId,
            resolvedSKU,
            parsedQuantity,
            product.hasVariation, // Pass isVariant
            actorId,
          );
          stockIncremented = true;

          const batchDoc = new StockBatchModel({
            productId,
            storeId,
            SKU: resolvedSKU,
            isVariant: product.hasVariation,
            quantity: parsedQuantity,
            businessId: this.businessId,
            sourceDocumentType: 'manual',
            sourceDocumentId: sourceDocumentId || options.sourceDocumentId,
            supplierId: supplierId || options.supplierId,
            costPerUnit:
              costPerUnit ??
              rawEntry.unitCost ??
              options.defaultCostPerUnit ??
              undefined,
            sellingPrice:
              sellingPrice ??
              rawEntry.unitPrice ??
              options.defaultSellingPrice ??
              undefined,
            notes: noteToPersist,
            createdBy: actorId,
            updatedBy: actorId,
            receivedAt: new Date(),
          });

          const normalizedBatchExpiry = normalizedExpiry;
          if (normalizedBatchExpiry) {
            batchDoc.expiryDate = normalizedBatchExpiry;
          }
          if (normalizedManufacturedAt) {
            batchDoc.manufacturedAt = normalizedManufacturedAt;
          }

          await batchDoc.save();

          results.push({
            success: true,
            productId,
            storeId,
            SKU: resolvedSKU,
            addedQuantity: parsedQuantity,
            batchId: batchDoc._id,
          });
        } catch (innerError) {
          if (stockIncremented) {
            await Stock.increment(
              productId,
              storeId,
              resolvedSKU,
              -parsedQuantity,
              product.hasVariation, // Pass isVariant
              actorId,
            ).catch((rollbackError) => {
              console.error(
                'Failed to rollback stock after manual batch error',
                rollbackError,
              );
            });
          }
          throw innerError;
        }
      } catch (error) {
        results.push({
          success: false,
          error: error.message,
          productId: rawEntry?.productId,
          storeId: rawEntry?.storeId,
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;

    return {
      totalEntries: normalizedEntries.length,
      successCount,
      failureCount: normalizedEntries.length - successCount,
      results,
    };
  }

  /**
   * Get all products with stock information for a business
   * @param {Object} [filters] - Filter options
   * @param {string} [filters.storeId] - Store ID
   * @param {string} [filters.categoryId] - Category ID
   * @param {string} [filters.subCategoryId] - Sub Category ID
   * @param {string} [filters.productId] - Product ID
   * @param {string} [filters.status] - Product status
   * @returns {Promise<Array>} List of products with stock information
   */
  async getStocks(filters = {}) {
    const Product = await this.getModel('Product', ProductSchema, 'products');
    const query = { status: true, ...filters };

    return await Product.find(query)
      .populate('category subCategory brand unit store')
      .sort({ updatedAt: -1 });
  }

  /**
   * Get low stock items for a business
   * @param {string} [storeId] - Optional store ID filter
   * @param {number} [threshold] - Low stock threshold (default: 10)
   * @returns {Promise<Array>} List of low stock items
   */
  async getLowStock(storeId = null, threshold = 10) {
    const Product = await this.getModel('Product', ProductSchema, 'products');

    const matchQuery = { status: true };
    if (storeId) {
      matchQuery.store = storeId;
    }

    const pipeline = [
      { $match: matchQuery },
      {
        $addFields: {
          // For regular products, use main quantity
          // For variant products, check if any variant is low stock
          isLowStock: {
            $cond: [
              { $eq: ['$hasVariation', true] },
              {
                $gt: [
                  {
                    $size: {
                      $filter: {
                        input: '$variantInventory',
                        cond: {
                          $and: [
                            { $eq: ['$$this.status', true] },
                            { $lte: ['$$this.quantity', threshold] },
                          ],
                        },
                      },
                    },
                  },
                  0,
                ],
              },
              { $lte: [{ $ifNull: ['$quantity', 0] }, threshold] },
            ],
          },
          // Add total quantity for sorting
          totalQuantity: {
            $cond: [
              { $eq: ['$hasVariation', true] },
              { $sum: '$variantInventory.quantity' },
              { $ifNull: ['$quantity', 0] },
            ],
          },
        },
      },
      { $match: { isLowStock: true } },
      { $sort: { totalQuantity: 1 } },
    ];

    const products = await Product.aggregate(pipeline);

    // Populate references for each product
    return await Product.populate(products, {
      path: 'category subCategory brand unit store',
    });
  }

  /**
   * Get out of stock items for a business
   * @param {string} [storeId] - Optional store ID filter
   * @returns {Promise<Array>} List of out of stock items
   */
  async getOutOfStock(storeId = null) {
    const Product = await this.getModel('Product', ProductSchema, 'products');

    const matchQuery = { status: true };
    if (storeId) {
      matchQuery.store = storeId;
    }

    const pipeline = [
      { $match: matchQuery },
      {
        $addFields: {
          // For regular products, check if main quantity is 0
          // For variant products, check if any variant is out of stock
          isOutOfStock: {
            $cond: [
              { $eq: ['$hasVariation', true] },
              {
                $gt: [
                  {
                    $size: {
                      $filter: {
                        input: '$variantInventory',
                        cond: {
                          $and: [
                            { $eq: ['$$this.status', true] },
                            { $eq: ['$$this.quantity', 0] },
                          ],
                        },
                      },
                    },
                  },
                  0,
                ],
              },
              { $eq: [{ $ifNull: ['$quantity', 0] }, 0] },
            ],
          },
        },
      },
      { $match: { isOutOfStock: true } },
      { $sort: { updatedAt: -1 } },
    ];

    const products = await Product.aggregate(pipeline);

    // Populate references for each product
    return await Product.populate(products, {
      path: 'category subCategory brand unit store',
    });
  }

  /**
   * Get stock statistics for a business
   * @param {Object} [filters] - Optional filters
   * @returns {Promise<Object>} Stock statistics
   */
  async getStockStats(filters = {}) {
    const Product = await this.getModel('Product', ProductSchema, 'products');

    const pipeline = [
      { $match: { status: true, ...filters } },
      {
        $addFields: {
          // Calculate total quantity including variants
          totalQuantity: {
            $cond: [
              { $eq: ['$hasVariation', true] },
              { $sum: '$variantInventory.quantity' },
              { $ifNull: ['$quantity', 0] },
            ],
          },
          // Calculate total value including variants
          totalValue: {
            $cond: [
              { $eq: ['$hasVariation', true] },
              {
                $sum: {
                  $map: {
                    input: '$variantInventory',
                    as: 'variant',
                    in: {
                      $multiply: ['$$variant.quantity', '$$variant.costPrice'],
                    },
                  },
                },
              },
              {
                $multiply: [
                  { $ifNull: ['$quantity', 0] },
                  { $ifNull: ['$costPrice', 0] },
                ],
              },
            ],
          },
          // Check if product is low stock (for regular products) or has any low stock variants
          isLowStock: {
            $cond: [
              { $eq: ['$hasVariation', true] },
              {
                $gt: [
                  {
                    $size: {
                      $filter: {
                        input: '$variantInventory',
                        cond: { $lte: ['$$this.quantity', 10] },
                      },
                    },
                  },
                  0,
                ],
              },
              { $lte: [{ $ifNull: ['$quantity', 0] }, 10] },
            ],
          },
          // Check if product is out of stock (for regular products) or has any out of stock variants
          isOutOfStock: {
            $cond: [
              { $eq: ['$hasVariation', true] },
              {
                $gt: [
                  {
                    $size: {
                      $filter: {
                        input: '$variantInventory',
                        cond: { $eq: ['$$this.quantity', 0] },
                      },
                    },
                  },
                  0,
                ],
              },
              { $eq: [{ $ifNull: ['$quantity', 0] }, 0] },
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          totalQuantity: { $sum: '$totalQuantity' },
          totalValue: { $sum: '$totalValue' },
          lowStockCount: {
            $sum: {
              $cond: ['$isLowStock', 1, 0],
            },
          },
          outOfStockCount: {
            $sum: {
              $cond: ['$isOutOfStock', 1, 0],
            },
          },
        },
      },
    ];

    const result = await Product.aggregate(pipeline);
    return (
      result[0] || {
        totalProducts: 0,
        totalQuantity: 0,
        totalValue: 0,
        lowStockCount: 0,
        outOfStockCount: 0,
      }
    );
  }

  // ========================================
  // STOCK TRANSFER METHODS
  // ========================================

  /**
   * Create a new stock transfer request
   * @param {Object} transferData - Transfer details
   * @param {string} transferData.fromStoreId - Source store ID
   * @param {string} transferData.toStoreId - Destination store ID
   * @param {string} transferData.productId - Product ID
   * @param {string} transferData.categoryId - Category ID
   * @param {string} transferData.subCategoryId - Sub Category ID
   * @param {number} transferData.quantity - Transfer quantity
   * @param {string} transferData.reason - Transfer reason
   * @param {string} transferData.requestedBy - User ID who requested
   * @param {string} [transferData.notes] - Additional notes
   * @param {Date} [transferData.expectedTransferDate] - Expected transfer date
   * @param {string} [transferData.variantValue] - Variant value (required for variant products)
   * @returns {Promise<Object>} Created transfer record
   */
  async createTransfer(transferData) {
    const StockTransfer = await this._getStockTransferModel();
    const Product = await this.getModel('Product', ProductSchema, 'products');
    const Stock = await this.getModel('Stock', StockSchema, 'stocks');

    // Get the product to validate it exists and determine if it has variations
    const product = await Product.findOne({
      _id: transferData.productId,
      status: true,
    });

    if (!product) {
      throw new Error('Product not found');
    }

    let targetSKU;

    // Determine the SKU to transfer
    if (product.hasVariation) {
      // For variant products, SKU must be provided
      if (!transferData.SKU) {
        throw new Error('SKU is required for products with variations');
      }

      // Verify the SKU exists in variantData
      const variantExists = product.variantData.some(
        (v) => v.SKU === transferData.SKU && v.status === true,
      );
      if (!variantExists) {
        throw new Error(
          `SKU '${transferData.SKU}' not found or inactive in product variants`,
        );
      }

      targetSKU = transferData.SKU;
    } else {
      // For non-variant products, use the product's main SKU
      targetSKU = product.SKU;
    }

    // Check stock availability in source store using the Stock model
    const sourceStock = await Stock.findOne({
      productId: transferData.productId,
      storeId: transferData.fromStoreId,
      SKU: targetSKU,
      status: true,
    });

    if (!sourceStock) {
      throw new Error('Product not found in source store');
    }

    if (sourceStock.quantity < transferData.quantity) {
      throw new Error(
        `Insufficient stock in source store. Available: ${sourceStock.quantity}, Requested: ${transferData.quantity}`,
      );
    }

    // Create transfer record with SKU
    const transfer = new StockTransfer({
      businessId: this.businessId,
      ...transferData,
      SKU: targetSKU, // Store the SKU in the transfer record
    });

    return await transfer.save();
  }

  /**
   * Get stock transfer by ID
   * @param {string} transferId - Transfer ID
   * @returns {Promise<Object>} Transfer record
   */
  async getTransfer(transferId) {
    const StockTransfer = await this._getStockTransferModel();
    return await StockTransfer.findById(transferId).populate(
      'fromStoreId toStoreId productId categoryId subCategoryId',
    );
  }

  /**
   * Update a stock transfer request
   * @param {string} transferId - Transfer ID
   * @param {Object} updateData - Update data
   * @param {string} [updateData.toStoreId] - Destination store ID
   * @param {number} [updateData.quantity] - Transfer quantity
   * @param {string} [updateData.reason] - Transfer reason
   * @param {string} [updateData.notes] - Additional notes
   * @param {Date} [updateData.expectedTransferDate] - Expected transfer date
   * @returns {Promise<Object>} Updated transfer record
   */
  async updateTransfer(transferId, updateData) {
    const StockTransfer = await this._getStockTransferModel();
    const Stock = await this.getModel('Stock', StockSchema, 'stocks');

    const transfer = await StockTransfer.findById(transferId);

    if (!transfer) {
      throw new Error('Transfer not found');
    }

    if (transfer.status !== 'pending') {
      throw new Error('Only pending transfers can be updated');
    }

    // If quantity is being updated, validate stock availability
    if (updateData.quantity && updateData.quantity !== transfer.quantity) {
      const sourceStock = await Stock.findOne({
        productId: transfer.productId,
        storeId: transfer.fromStoreId,
        SKU: transfer.SKU,
        status: true,
      });

      if (!sourceStock) {
        throw new Error('Product not found in source store');
      }

      if (sourceStock.quantity < updateData.quantity) {
        throw new Error(
          `Insufficient stock in source store. Available: ${sourceStock.quantity}, Requested: ${updateData.quantity}`,
        );
      }
    }

    // Update allowed fields
    const allowedFields = [
      'productId',
      'categoryId',
      'subCategoryId',
      'SKU',
      'toStoreId',
      'quantity',
      'reason',
      'notes',
      'expectedTransferDate',
    ];

    allowedFields.forEach((field) => {
      if (updateData[field] !== undefined) {
        transfer[field] = updateData[field];
      }
    });

    return await transfer.save();
  }

  /**
   * Delete a stock transfer (only pending transfers can be deleted)
   * @param {string} transferId - Transfer ID
   * @returns {Promise<Object>} Deleted transfer record
   * @throws {Error} If transfer not found or status is not 'pending'
   */
  async deleteTransfer(transferId) {
    const StockTransfer = await this._getStockTransferModel();

    const transfer = await StockTransfer.findById(transferId);

    if (!transfer) {
      throw new Error('Transfer not found');
    }

    if (transfer.status !== 'pending' && transfer.status !== 'cancelled') {
      throw new Error(
        `Cannot delete transfer with status '${transfer.status}'. Only pending and cancelled transfers can be deleted.`,
      );
    }

    await StockTransfer.findByIdAndDelete(transferId);

    return transfer;
  }

  /**
   * Bulk delete multiple stock transfers
   * @param {Array<string>} ids - Array of transfer IDs to delete
   * @returns {Promise<Array<Object>>} Results of deletion for each ID
   */
  async bulkDeleteTransfers(ids) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new Error('Transfer IDs array is required and must not be empty');
    }

    const results = [];

    for (const id of ids) {
      try {
        this.validateObjectId(id);
        await this.deleteTransfer(id);
        results.push({
          id,
          success: true,
          message: 'Deleted successfully',
        });
      } catch (error) {
        results.push({
          id,
          success: false,
          message: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Get all transfers for a business with optional filters
   * @param {Object} [queryParams] - Filter & pagination options
   * @param {string} [queryParams.status] - Transfer status filter
   * @param {string} [queryParams.storeId] - Store ID (matches both source and destination)
   * @param {string} [queryParams.productId] - Product ID
   * @param {string} [queryParams.requestedBy] - Requester user ID
   * @param {string|boolean} [queryParams.all] - Fetch all records without pagination
   * @returns {Promise<Object>} Paginated result or full list when all=true
   */
  async getTransfers(queryParams = {}) {
    await this._ensureReferenceModels();

    const {
      all,
      status,
      storeId,
      productId,
      requestedBy,
      SKU,
      search = '',
      sortBy = 'requestedDate',
      sortOrder = 'desc',
      ...paginationParams
    } = queryParams;

    const shouldFetchAll = this._shouldFetchAll(all);
    const populateConfig = [
      { path: 'fromStoreId', select: 'name' },
      { path: 'toStoreId', select: 'name' },
      {
        path: 'productId',
        select:
          'productName SKU variantData.variantValues variantData.SKU variantData.variantTitle',
      },
      { path: 'categoryId', select: 'categoryName' },
      { path: 'subCategoryId', select: 'subcategory' },
    ];
    const filters = this._buildTransferFilters({
      status,
      storeId,
      productId,
      requestedBy,
      SKU,
    });

    // --- Enhanced Search Logic ---
    if (search && typeof search === 'string' && search.trim()) {
      const searchTerm = search.trim();
      const searchRegex = new RegExp(searchTerm, 'i');
      const orConditions = [];

      // 1. Existing text fields (reason, notes, SKU)
      ['reason', 'notes', 'SKU'].forEach((field) => {
        orConditions.push({ [field]: searchRegex });
      });

      // 2. Quantity (exact match if number)
      if (!isNaN(searchTerm)) {
        orConditions.push({ quantity: Number(searchTerm) });
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
        orConditions.push({ fromStoreId: { $in: storeIds } });
        orConditions.push({ toStoreId: { $in: storeIds } });
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
        filters.$or = orConditions;
      }
    }

    const listParams = {
      ...paginationParams,
      search,
      sortBy,
      sortOrder,
      searchFields: [], // We handled search manually in filters.$or, so pass empty array to prevent BaseService from overriding or crashing
      filters,
      populate: populateConfig,
    };

    if (shouldFetchAll) {
      const data = await this._listAllTransfers({
        filters,
        search,
        searchFields: [], // Pass empty here too
        sortBy,
        sortOrder,
        populate: populateConfig,
      });
      return {
        data,
        total: data.length,
      };
    }

    const result = await super.list(listParams);

    return result;
  }

  /**
   * Bulk get stock transfers by IDs
   * @param {Array<string>} ids - Array of transfer IDs
   * @param {Object} [options] - Optional filters
   * @param {string} [options.status] - Filter by status
   * @param {string} [options.storeId] - Filter by store ID
   * @returns {Promise<Object>} Object containing found count, requested count, and results
   */
  async bulkGetTransfers(ids, { status, storeId } = {}) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new Error('Transfer IDs array is required and must not be empty');
    }

    const StockTransfer = await this._getStockTransferModel();
    const query = {
      _id: { $in: ids },
      businessId: this.businessId,
    };

    if (status) {
      query.status = status;
    }

    if (storeId) {
      query.$or = [{ fromStoreId: storeId }, { toStoreId: storeId }];
    }

    const transfers = await StockTransfer.find(query)
      .populate('fromStoreId toStoreId productId categoryId subCategoryId')
      .lean();

    return {
      totalRequested: ids.length,
      found: transfers.length,
      data: transfers,
    };
  }

  /**
   * Get pending transfers requiring approval
   * @param {string} [storeId] - Optional store ID filter
   * @returns {Promise<Array>} List of pending transfers
   */
  async getPendingTransfers(storeId = null) {
    const StockTransfer = await this._getStockTransferModel();
    return await StockTransfer.findPending(this.businessId, storeId);
  }
  /**
   * Change transfer status to pending
   * @param {string} transferId - Transfer ID
   * @returns {Promise<Object>} Updated transfer record
   */
  async pendingTransfer(transferId) {
    const StockTransfer = await this._getStockTransferModel();
    const transfer = await StockTransfer.findById(transferId);

    if (!transfer) {
      throw new Error('Transfer not found');
    }

    this._assertStatusTransition(transfer.status, TRANSFER_STATUSES.PENDING);

    transfer.status = TRANSFER_STATUSES.PENDING;
    // Clear approval details if they exist, as it's ensuring the transfer is back to pending
    transfer.approvedBy = undefined;
    transfer.approvedAt = undefined;

    return await transfer.save();
  }


  /**
   * Approve a stock transfer
   * @param {string} transferId - Transfer ID
   * @param {string} approvedBy - User ID who approved
   * @returns {Promise<Object>} Updated transfer record
   */
  async approveTransfer(transferId, approvedBy) {
    const StockTransfer = await this._getStockTransferModel();
    const transfer = await StockTransfer.findById(transferId);

    if (!transfer) {
      throw new Error('Transfer not found');
    }

    if (transfer.status !== 'pending') {
      throw new Error('Only pending transfers can be approved');
    }

    transfer.status = 'approved';
    transfer.approvedBy = approvedBy;
    transfer.approvedAt = new Date();

    return await transfer.save();
  }

  /**
   * Complete a stock transfer (execute the actual stock movement)
   * @param {string} transferId - Transfer ID
   * @param {string} receivedBy - User ID who received the transfer
   * @returns {Promise<Object>} Updated transfer record
   */
  async completeTransfer(transferId, receivedBy) {
    const StockTransfer = await this._getStockTransferModel();
    const transfer = await StockTransfer.findById(transferId);

    if (!transfer) {
      throw new Error('Transfer not found');
    }

    this._assertStatusTransition(transfer.status, TRANSFER_STATUSES.COMPLETED);

    // Execute the actual stock movement
    await this.executeStockMovement(transfer);

    transfer.status = 'completed';
    transfer.receivedBy = receivedBy;
    transfer.receivedAt = new Date();
    transfer.actualTransferDate = new Date();

    return await transfer.save();
  }

  /**
   * Cancel a stock transfer
   * @param {string} transferId - Transfer ID
   * @param {string} cancelledBy - User ID who cancelled
   * @param {string} reason - Cancellation reason
   * @returns {Promise<Object>} Updated transfer record
   */
  async cancelTransfer(transferId, cancelledBy, reason) {
    const StockTransfer = await this._getStockTransferModel();
    const transfer = await StockTransfer.findById(transferId);

    if (!transfer) {
      throw new Error('Transfer not found');
    }

    if (!['pending', 'approved'].includes(transfer.status)) {
      throw new Error('Only pending or approved transfers can be cancelled');
    }

    transfer.status = 'cancelled';
    transfer.cancelledBy = cancelledBy;
    transfer.cancelledAt = new Date();
    transfer.notes = reason;

    return await transfer.save();
  }

  /**
   * Update transfer status with transition validation
   * @param {string} transferId
   * @param {string} targetStatus
   * @param {string} actingUserId
   * @param {Object} [options]
   * @returns {Promise<Object>}
   */
  async updateTransferStatus(
    transferId,
    targetStatus,
    actingUserId,
    options = {},
  ) {
    if (!transferId) {
      throw new Error('Transfer ID is required');
    }

    const normalizedStatus = this._normalizeTransferStatus(targetStatus);
    this.validateObjectId(transferId);

    const StockTransfer = await this._getStockTransferModel();
    const transfer = await StockTransfer.findById(transferId);

    if (!transfer) {
      throw new Error('Transfer not found');
    }

    this._assertStatusTransition(transfer.status, normalizedStatus);

    if (transfer.status === normalizedStatus) {
      return transfer;
    }

    switch (normalizedStatus) {
      case TRANSFER_STATUSES.PENDING:
        return this.pendingTransfer(transferId);
      case TRANSFER_STATUSES.APPROVED:
        return this.approveTransfer(transferId, actingUserId);
      case TRANSFER_STATUSES.COMPLETED: {
        const receiver = options.receivedBy || actingUserId;
        return this.completeTransfer(transferId, receiver);
      }
      case TRANSFER_STATUSES.CANCELLED:
        return this.cancelTransfer(transferId, actingUserId, options.reason);
      default:
        throw new Error(`Unsupported status transition to "${normalizedStatus}"`);
    }
  }

  /**
   * Bulk update transfer statuses with constraints
   * @param {Array<Object>} updates
   * @param {string} actingUserId
   * @returns {Promise<Array>}
   */
  async bulkUpdateTransferStatus(updates = [], actingUserId) {
    if (!Array.isArray(updates) || updates.length === 0) {
      throw new Error('Updates array is required');
    }

    if (updates.length > 100) {
      throw new Error('Maximum 100 transfers allowed per request');
    }

    const results = [];

    for (const update of updates) {
      const { transferId, status, reason, receivedBy } = update || {};

      if (!transferId || !status) {
        results.push({
          success: false,
          transferId,
          error: 'Both transferId and status are required',
        });
        continue;
      }

      try {
        const data = await this.updateTransferStatus(
          transferId,
          status,
          actingUserId,
          { reason, receivedBy },
        );
        results.push({ success: true, transferId, data });
      } catch (error) {
        results.push({
          success: false,
          transferId,
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Execute the actual stock movement for a completed transfer
   * @param {Object} transfer - Transfer document
   */
  async executeStockMovement(transfer) {
    // Reduce stock from source store
    await this.updateStockQuantity(
      transfer.fromStoreId,
      transfer.productId,
      transfer.quantity,
      'subtract',
      transfer.SKU,
    );

    // Add stock to destination store
    await this.updateStockQuantity(
      transfer.toStoreId,
      transfer.productId,
      transfer.quantity,
      'add',
      transfer.SKU,
    );
  }

  _normalizeTransferStatus(status) {
    const normalized =
      typeof status === 'string' ? status.trim().toLowerCase() : '';

    const validStatuses = Object.values(TRANSFER_STATUSES);
    if (!normalized || !validStatuses.includes(normalized)) {
      throw new Error(`Invalid status "${status}" provided`);
    }

    return normalized;
  }

  _assertStatusTransition(currentStatus, nextStatus) {
    const allowedTargets = TRANSFER_STATUS_TRANSITIONS[currentStatus];

    if (!allowedTargets || !allowedTargets.has(nextStatus)) {
      throw new Error(
        `Cannot move transfer from "${currentStatus}" to "${nextStatus}"`,
      );
    }
  }

  /**
   * Get product variant information for a specific store
   * @param {string} storeId - Store ID
   * @param {string} productId - Product ID
   * @param {string} variantValue - Variant value
   * @returns {Promise<Object>} Variant details with stock info
   */
  async getStockByVariant(storeId, productId, variantValue) {
    const Product = await this.getModel('Product', ProductSchema, 'products');

    const product = await Product.findOne({
      _id: productId,
      store: storeId,
      status: true,
      hasVariation: true,
    }).populate('category subCategory brand unit store');

    if (!product) {
      throw new Error('Product not found or does not have variations');
    }

    const variant = product.variantInventory.find(
      (v) => v.variantValue === variantValue && v.status === true,
    );

    if (!variant) {
      throw new Error(`Variant '${variantValue}' not found or inactive`);
    }

    return {
      product,
      variant,
      variantStock: variant.quantity,
      variantCostPrice: variant.costPrice,
      variantSellingPrice: variant.sellingPrice,
    };
  }

  /**
   * Get all active variants for a product
   * @param {string} storeId - Store ID
   * @param {string} productId - Product ID
   * @returns {Promise<Array>} Variant list
   */
  async getProductVariants(storeId, productId) {
    const Product = await this.getModel('Product', ProductSchema, 'products');

    const product = await Product.findOne({
      _id: productId,
      store: storeId,
      status: true,
      hasVariation: true,
    }).populate('category subCategory brand unit store');

    if (!product) {
      throw new Error('Product not found or does not have variations');
    }

    return product.variantInventory.filter((variant) => variant.status === true);
  }

  /**
   * Get low stock variants for a business
   * @param {string} [storeId] - Optional store ID filter
   * @param {number} [threshold=10] - Low stock threshold
   * @returns {Promise<Array>} Variants below threshold
   */
  async getLowStockVariants(storeId = null, threshold = 10) {
    const Product = await this.getModel('Product', ProductSchema, 'products');

    const matchQuery = {
      status: true,
      hasVariation: true,
    };
    if (storeId) {
      matchQuery.store = storeId;
    }

    const pipeline = [
      { $match: matchQuery },
      { $unwind: '$variantInventory' },
      {
        $match: {
          'variantInventory.status': true,
          'variantInventory.quantity': { $lte: threshold },
        },
      },
      {
        $project: {
          productName: 1,
          SKU: 1,
          category: 1,
          subCategory: 1,
          brand: 1,
          unit: 1,
          store: 1,
          variantValue: '$variantInventory.variantValue',
          variantSKU: '$variantInventory.SKU',
          variantQuantity: '$variantInventory.quantity',
          variantCostPrice: '$variantInventory.costPrice',
          variantSellingPrice: '$variantInventory.sellingPrice',
          variantImage: '$variantInventory.image',
        },
      },
      { $sort: { variantQuantity: 1 } },
    ];

    const variants = await Product.aggregate(pipeline);

    return await Product.populate(variants, {
      path: 'category subCategory brand unit store',
    });
  }

  /**
   * Get out-of-stock variants for a business
   * @param {string} [storeId] - Optional store ID filter
   * @returns {Promise<Array>} Variants with zero quantity
   */
  async getOutOfStockVariants(storeId = null) {
    const Product = await this.getModel('Product', ProductSchema, 'products');

    const matchQuery = {
      status: true,
      hasVariation: true,
    };
    if (storeId) {
      matchQuery.store = storeId;
    }

    const pipeline = [
      { $match: matchQuery },
      { $unwind: '$variantInventory' },
      {
        $match: {
          'variantInventory.status': true,
          'variantInventory.quantity': 0,
        },
      },
      {
        $project: {
          productName: 1,
          SKU: 1,
          category: 1,
          subCategory: 1,
          brand: 1,
          unit: 1,
          store: 1,
          variantValue: '$variantInventory.variantValue',
          variantSKU: '$variantInventory.SKU',
          variantQuantity: '$variantInventory.quantity',
          variantCostPrice: '$variantInventory.costPrice',
          variantSellingPrice: '$variantInventory.sellingPrice',
          variantImage: '$variantInventory.image',
        },
      },
      { $sort: { updatedAt: -1 } },
    ];

    const variants = await Product.aggregate(pipeline);

    return await Product.populate(variants, {
      path: 'category subCategory brand unit store',
    });
  }

  /**
   * Get aggregate variant stock statistics
   * @param {Object} [filters] - Optional filters
   * @returns {Promise<Object>} Variant stock summary
   */
  async getVariantStockStats(filters = {}) {
    const Product = await this.getModel('Product', ProductSchema, 'products');

    const matchQuery = {
      status: true,
      hasVariation: true,
      ...filters,
    };

    const pipeline = [
      { $match: matchQuery },
      { $unwind: '$variantInventory' },
      {
        $match: {
          'variantInventory.status': true,
        },
      },
      {
        $group: {
          _id: null,
          totalVariants: { $sum: 1 },
          totalVariantQuantity: { $sum: '$variantInventory.quantity' },
          totalVariantValue: {
            $sum: {
              $multiply: [
                '$variantInventory.quantity',
                '$variantInventory.costPrice',
              ],
            },
          },
          lowStockVariantCount: {
            $sum: {
              $cond: [{ $lte: ['$variantInventory.quantity', 10] }, 1, 0],
            },
          },
          outOfStockVariantCount: {
            $sum: {
              $cond: [{ $eq: ['$variantInventory.quantity', 0] }, 1, 0],
            },
          },
        },
      },
    ];

    const result = await Product.aggregate(pipeline);
    return (
      result[0] || {
        totalVariants: 0,
        totalVariantQuantity: 0,
        totalVariantValue: 0,
        lowStockVariantCount: 0,
        outOfStockVariantCount: 0,
      }
    );
  }
}

export default StockServices;
