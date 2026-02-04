import { BaseService, BarcodeUtils, deleteImage } from '../utils/index.js';
import mongoose from 'mongoose';
import {
  StockBatchServices,
  ProductCategoryServices,
  SubCategoryServices,
  BrandServices,
  UnitServices,
  WarrantyServices,
  VariantServices,
  StockServices,
  StoreService,
  TenantTaxService,
} from './index.js';

import { ProductSchema } from '../models/index.js';

const INITIAL_STOCK_BATCH_NOTE = 'ProductServices::InitialStock';

class ProductServices extends BaseService {
  constructor(businessId) {
    if (!businessId) {
      throw new Error('ProductServices initialized without businessId');
    }
    super({
      modelName: 'Product',
      schema: ProductSchema,
      collection: 'products',
      businessId,
    });
    this._refsReady = false;
    this._stockBatchService = new StockBatchServices(businessId);
    this._productCategoryService = new ProductCategoryServices(businessId);
    this._subCategoryService = new SubCategoryServices(businessId);
    this._brandService = new BrandServices(businessId);
    this._unitService = new UnitServices(businessId);
    this._warrantyService = new WarrantyServices(businessId);
    this._variantService = new VariantServices(businessId);
    this._stockService = new StockServices(businessId);
    this._storeService = new StoreService(businessId);
    this._tenantTaxService = new TenantTaxService(businessId);
  }

  async _ensureRefModels() {
    if (this._refsReady) return;
    // Warm-up referenced models on the same tenant connection so populate works
    await Promise.all([
      this._productCategoryService.getModelRef(),
      this._subCategoryService.getModelRef(),
      this._brandService.getModelRef(),
      this._unitService.getModelRef(),
      this._warrantyService.getModelRef(),
      this._variantService.getModelRef(),
      this._stockService.getStockModel(),
      this._storeService.getModelRef(),
      this._tenantTaxService.getModelRef(),
    ]).catch(() => { });
    this._refsReady = true;
  }

  async _upsertInitialStock(savedProduct, payload, session) {
    try {
      if (!payload) return;
      const [StockModel, StockBatchModel] = await Promise.all([
        this._stockService.getStockModel(),
        this._stockBatchService.getModel(),
      ]);

      const toObjectId = (value) => {
        if (!value) return value;
        if (value instanceof mongoose.Types.ObjectId) return value;
        if (typeof value === 'string') {
          return mongoose.Types.ObjectId.isValid(value)
            ? new mongoose.Types.ObjectId(value)
            : value;
        }
        return value;
      };

      const productObjectId = toObjectId(savedProduct?._id);
      const businessId =
        savedProduct?.businessId || this.businessId || undefined;
      const logContextBase = {
        productId:
          typeof productObjectId?.toString === 'function'
            ? productObjectId.toString()
            : productObjectId,
        hasVariation: savedProduct?.hasVariation === true,
        stockItemsCount: Array.isArray(payload.stock) ? payload.stock.length : 0,
        variantStocksCount: Array.isArray(payload.variantStocks)
          ? payload.variantStocks.length
          : 0,
      };
      console.log(
        '[ProductServices::_upsertInitialStock] Begin upsert',
        logContextBase,
      );

      const ensureNumeric = (n) => {
        const v = Number(n);
        if (!Number.isFinite(v) || v < 0) return null;
        return v;
      };

      // Non-variant stock: payload.stock = [{ storeId, quantity }]
      if (savedProduct.hasVariation !== true) {
        const stockItems = Array.isArray(payload.stock) ? payload.stock : [];
        for (const item of stockItems) {
          const qty = ensureNumeric(item?.quantity);
          if (!item?.storeId || qty === null) continue;
          const storeObjectId = toObjectId(item.storeId);
          console.log(
            '[ProductServices::_upsertInitialStock] Non-variant stock upsert',
            {
              ...logContextBase,
              storeId:
                typeof storeObjectId?.toString === 'function'
                  ? storeObjectId.toString()
                  : storeObjectId,
              sku: savedProduct?.SKU,
              quantity: qty,
            },
          );

          await StockModel.findOneAndUpdate(
            {
              productId: productObjectId,
              storeId: storeObjectId,
              SKU: savedProduct.SKU,
            },
            { $set: { quantity: qty, status: true } },
            { upsert: true, new: true, setDefaultsOnInsert: true, session },
          );

          await this._upsertManualStockBatchEntry({
            StockBatchModel,
            productId: productObjectId,
            storeId: storeObjectId,
            sku: savedProduct.SKU,
            isVariant: false,
            targetQuantity: qty,
            expiryDate: savedProduct.expiryDate,
            session,
            businessId,
            lifecycleStatus: 'active', // Since we are setting quantity, ensure it is active
          });
        }
        return;
      }

      // Variant stock: payload.variantStocks = [{ SKU, storeId, quantity }]
      const variantStocks = Array.isArray(payload.variantStocks)
        ? payload.variantStocks
        : [];
      if (variantStocks.length === 0) return;

      const validVariantSkus = new Set(
        (savedProduct.variantData || []).map((v) => String(v.SKU)),
      );
      for (const item of variantStocks) {
        const sku = String(item?.SKU || '')
          .trim()
          .toUpperCase();
        const qty = ensureNumeric(item?.quantity);
        if (!item?.storeId || !sku || qty === null) continue;
        const storeObjectId = toObjectId(item.storeId);
        if (!validVariantSkus.has(sku)) {
          throw new Error(`Invalid variant SKU for stock: ${sku}`);
        }
        console.log(
          '[ProductServices::_upsertInitialStock] Variant stock upsert',
          {
            ...logContextBase,
            storeId:
              typeof storeObjectId?.toString === 'function'
                ? storeObjectId.toString()
                : storeObjectId,
            sku,
            quantity: qty,
          },
        );
        await StockModel.findOneAndUpdate(
          { productId: productObjectId, storeId: storeObjectId, SKU: sku },
          { $set: { quantity: qty, status: true } },
          { upsert: true, new: true, setDefaultsOnInsert: true, session },
        );

        await this._upsertManualStockBatchEntry({
          StockBatchModel,
          productId: productObjectId,
          storeId: storeObjectId,
          sku,
          isVariant: true,
          targetQuantity: qty,
          expiryDate: savedProduct.expiryDate,
          session,
          businessId,
          lifecycleStatus: 'active',
        });
      }
    } catch (err) {
      console.error(
        '[ProductServices::_upsertInitialStock] Stock upsert failed',
        {
          error: err?.message,
        },
      );
      throw new Error(`Stock upsert failed: ${err.message}`);
    }
  }

  async _upsertManualStockBatchEntry({
    StockBatchModel,
    productId,
    storeId,
    sku,
    isVariant,
    targetQuantity,
    expiryDate,
    session,
    businessId,
  }) {
    if (!StockBatchModel) {
      StockBatchModel = await this._stockBatchService.getModel();
    }

    const normalizedSku =
      typeof sku === 'string' ? sku.trim().toUpperCase() : '';
    if (!normalizedSku) return;

    if (!Number.isFinite(targetQuantity) || targetQuantity < 0) {
      return;
    }

    const baseMatch = {
      productId,
      storeId,
      SKU: normalizedSku,
      isDeleted: false,
    };

    const manualFilter = {
      ...baseMatch,
      sourceDocumentType: 'manual',
      sourceDocumentId: productId,
      notes: INITIAL_STOCK_BATCH_NOTE,
    };

    const manualQuery = StockBatchModel.findOne(manualFilter);
    if (session) {
      manualQuery.session(session);
    }
    let manualBatch = await manualQuery;

    if (!manualBatch && targetQuantity <= 0) {
      return;
    }

    let otherQuantity = 0;
    if (targetQuantity > 0) {
      const aggregateMatch = { ...baseMatch };
      if (manualBatch?._id) {
        aggregateMatch._id = { $ne: manualBatch._id };
      }
      const aggregatePipeline = [
        { $match: aggregateMatch },
        { $group: { _id: null, quantity: { $sum: '$quantity' } } },
      ];
      let aggregateCursor = StockBatchModel.aggregate(aggregatePipeline);
      if (session) {
        aggregateCursor = aggregateCursor.session(session);
      }
      const result = await aggregateCursor;
      otherQuantity = result?.[0]?.quantity || 0;
    }

    const manualQuantity =
      targetQuantity > 0 ? Math.max(0, targetQuantity - otherQuantity) : 0;

    if (!manualBatch) {
      if (manualQuantity <= 0) {
        return;
      }
      const manualDoc = new StockBatchModel({
        ...baseMatch,
        isVariant,
        quantity: manualQuantity,
        expiryDate,
        sourceDocumentType: 'manual',
        sourceDocumentId: productId,
        notes: INITIAL_STOCK_BATCH_NOTE,
        businessId,
        createdBy: null,
        updatedBy: null,
        receivedAt: new Date(),
      });
      await manualDoc.save(session ? { session } : undefined);
      return;
    }

    const nextStatus = manualQuantity > 0;
    const nextLifecycle = nextStatus ? 'active' : 'consumed';
    const nextReservedQuantity = Math.min(
      manualBatch.reservedQuantity || 0,
      manualQuantity,
    );

    const requiresUpdate =
      manualBatch.quantity !== manualQuantity ||
      manualBatch.isVariant !== isVariant ||
      manualBatch.status !== nextStatus ||
      manualBatch.lifecycleStatus !== nextLifecycle ||
      manualBatch.reservedQuantity !== nextReservedQuantity;

    if (!requiresUpdate) {
      return;
    }

    manualBatch.quantity = manualQuantity;
    manualBatch.isVariant = isVariant;
    manualBatch.status = nextStatus;
    manualBatch.lifecycleStatus = nextLifecycle;
    manualBatch.reservedQuantity = nextReservedQuantity;
    if (expiryDate) {
      manualBatch.expiryDate = expiryDate;
    }

    await manualBatch.save(session ? { session } : undefined);
  }

  /**
   * Generate barcode images in background and update database
   * @param {Object} savedProduct - The saved product object
   * @param {Object} processedData - The processed product data
   */
  _generateBarcodeImagesInBackground(savedProduct, processedData) {
    // Generate main product barcode image if needed
    if (savedProduct.barcode && !savedProduct.barcodeUrl) {
      BarcodeUtils.generateBarcodeImageInBackground(
        savedProduct.barcode,
        savedProduct.SKU,
        async (barcodeUrl) => {
          try {
            const Model = await this.getModelRef();
            await Model.findByIdAndUpdate(savedProduct._id, { barcodeUrl });
            console.log(`Updated barcode URL for product ${savedProduct.SKU}`);
          } catch (error) {
            console.error(
              `Failed to update barcode URL for product ${savedProduct.SKU}:`,
              error.message,
            );
          }
        },
        (error) => {
          console.error(
            `Background barcode generation failed for product ${savedProduct.SKU}:`,
            error.message,
          );
        },
      );
    }

    // Generate variant barcode images if needed
    if (savedProduct.hasVariation && Array.isArray(savedProduct.variantData)) {
      for (const variant of savedProduct.variantData) {
        if (variant.barcode && !variant.barcodeUrl) {
          BarcodeUtils.generateBarcodeImageInBackground(
            variant.barcode,
            variant.SKU,
            async (barcodeUrl) => {
              try {
                const Model = await this.getModelRef();
                await Model.findOneAndUpdate(
                  {
                    _id: savedProduct._id,
                    'variantData.SKU': variant.SKU,
                  },
                  {
                    $set: {
                      'variantData.$.barcodeUrl': barcodeUrl,
                    },
                  },
                );
                console.log(`Updated barcode URL for variant ${variant.SKU}`);
              } catch (error) {
                console.error(
                  `Failed to update barcode URL for variant ${variant.SKU}:`,
                  error.message,
                );
              }
            },
            (error) => {
              console.error(
                `Background barcode generation failed for variant ${variant.SKU}:`,
                error.message,
              );
            },
          );
        }
      }
    }
  }

  /**
   * List products with store-wise stock information
   * @param {Object} queryParams - Query parameters for filtering and pagination
   * @param {number} queryParams.page - Page number (default: 1)
   * @param {number} queryParams.limit - Items per page (default: 10, max: 100)
   * @param {string} queryParams.search - Search term for product name, SKU, or description
   * @param {string} queryParams.sortBy - Sort field (default: 'createdAt')
   * @param {string} queryParams.sortOrder - Sort order 'asc' or 'desc' (default: 'desc')
   * @param {boolean} queryParams.status - Filter by product status
   * @param {boolean} queryParams.isActive - Filter by product status (alias for status)
   * @param {boolean} queryParams.all - If true, fetch all records without pagination
   * @param {boolean} queryParams.hasVariation - Filter by variation type
   * @param {string} queryParams.variantId - Filter by variant ID
   * @param {string} queryParams.categoryId - Filter by category ID
   * @param {boolean} queryParams.includeStock - Include stock information (default: true)
   * @returns {Promise<Object>} Products with stock information including:
   *   - For non-variant products: stock.storeStock[] and stock.totalStock
   *   - For variant products: stock embedded directly in variantData[].stock
   *   - Stock fields: { storeId, storeName, quantity, SKU, isVariant }
   */
  async list(queryParams = {}) {
    await this._ensureRefModels();
    const {
      all,
      page = 1,
      limit = 10,
      search = '',
      sortBy = 'createdAt',
      sortOrder = 'desc',
      status,
      isActive,
      hasVariation,
      variantId,
      includeStock = true,
      storeId, // Add storeId parameter for filtering by store
      inStockOnly,
      categoryId,
    } = queryParams;

    const isTruthy = (value) => {
      if (typeof value === 'string') {
        return value.toLowerCase() === 'true';
      }
      return Boolean(value);
    };

    const shouldFetchAll = all === true || all === 'true';
    const enforcePositiveStock = isTruthy(inStockOnly);

    // Performance optimization: Limit maximum items per page
    const {
      page: validatedPage,
      limit: validatedLimit,
      skip,
    } = this.validatePagination(page, limit, 100);

    const filters = {};

    // Add search filter
    if (search) {
      filters.$or = [
        { productName: { $regex: search, $options: 'i' } },
        { SKU: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    // Add status filter - support both 'status' and 'isActive' for consistency
    const statusFlag = isActive !== undefined ? isActive : status;
    if (statusFlag !== undefined) {
      filters.status =
        statusFlag === 'true' || statusFlag === true ? true : false;
    }

    // Add variation filter
    if (hasVariation !== undefined) {
      filters.hasVariation = hasVariation === 'true';
    }

    // Add variant filter
    if (variantId) {
      filters.variantIds = { $in: [variantId] };
    }

    // Add category filter
    if (categoryId) {
      filters.category = categoryId;
    }

    const Model = await this.getModelRef();
    let sortField = sortBy;
    if (sortBy === 'weight') sortField = 'unit.value';
    const sort = { [sortField]: sortOrder === 'desc' ? -1 : 1 };

    // Build query with optional pagination
    let productsQuery = Model.find(filters)
      .populate('category', 'categoryName hasExpiry hasWarranty')
      .populate('subCategory', 'subcategory')
      .populate('brand', 'brand')
      .populate('unit.unit', 'unit')
      .populate('warrantyType', 'warranty')
      .populate('variantIds', 'variant')
      .populate('tax', 'taxName taxType valueType value')
      .sort(sort);

    // Apply pagination only if not fetching all
    if (!shouldFetchAll) {
      productsQuery = productsQuery.skip(skip).limit(validatedLimit);
    }

    const [products, total] = await Promise.all([
      productsQuery.lean(),
      Model.countDocuments(filters),
    ]);

    let productsWithStock = products;

    // Only fetch stock information if requested
    if (includeStock) {
      const StockModel = await this._stockService.getStockModel();
      const productIds = products.map((p) => p._id);

      // If storeId is provided, fetch stock only for that store
      const stockData = await this._getStockInformationForProducts(
        productIds,
        StockModel,
        products,
        storeId, // Pass storeId to filter stock by store
      );

      // Attach stock information to products
      productsWithStock = products.map((product) => {
        // Clean nested refs to remove _id and keep readable fields only
        const category = product.category
          ? {
            categoryName: product.category.categoryName,
            hasExpiry: product.category.hasExpiry || false,
            hasWarranty: product.category.hasWarranty || false,
          }
          : null;
        const subCategory = product.subCategory
          ? { subcategory: product.subCategory.subcategory }
          : null;
        const brand = product.brand ? { brand: product.brand.brand } : null;
        const unit = product.unit
          ? {
            _id: product.unit.unit?._id || null,
            name: product.unit.unit?.unit || null,
            shortName: product.unit.unit?.shortName || null,
            value: product.unit.value,
          }
          : null;
        const warrantyType = product.warrantyType
          ? {
            _id: product.warrantyType._id || null,
            name: product.warrantyType.warranty,
          }
          : null;

        const tax = Array.isArray(product.tax)
          ? product.tax.map((t) => ({
            _id: t._id || null,
            taxName: t.taxName,
            taxType: t.taxType,
            valueType: t.valueType,
            value: t.value,
          }))
          : [];

        // For variant products, embed stock directly in variantData and remove main stock
        if (
          product.hasVariation === true &&
          Array.isArray(product.variantData)
        ) {
          const updatedVariantData = product.variantData.map((variant) => {
            const stockKey = `${product._id}_${variant.SKU}`;
            const variantStockData = stockData[stockKey] || {
              storeStock: [],
              totalStock: 0,
            };
            const variantTitle = Array.isArray(variant.variantValues)
              ? variant.variantValues
                .map((v) => v?.value)
                .filter(Boolean)
                .join(' ')
              : '';
            return {
              ...variant,
              variantTitle,
              stock: variantStockData,
            };
          });

          // compute totalQuantity as sum of each variant's totalStock
          const totalQuantity = updatedVariantData.reduce(
            (sum, v) => sum + (v?.stock?.totalStock || 0),
            0,
          );

          return {
            ...product,
            variantData: updatedVariantData,
            totalQuantity,
            // Remove main stock field for variant products
            category,
            subCategory,
            brand,
            unit,
            warrantyType,
            tax,
          };
        }

        // For non-variant products, include main stock
        const productStock = stockData[product._id.toString()] || {
          storeStock: [],
          totalStock: 0,
        };

        return {
          ...product,
          stock: productStock,
          totalQuantity: productStock.totalStock,
          category,
          subCategory,
          brand,
          unit,
          warrantyType,
          tax,
        };
      });

      const shouldFilterByStock = Boolean(storeId) || enforcePositiveStock;

      if (shouldFilterByStock) {
        productsWithStock = productsWithStock
          .map((product) => {
            if (
              product.hasVariation === true &&
              Array.isArray(product.variantData)
            ) {
              const filteredVariants = product.variantData.filter(
                (variant) => (variant.stock?.totalStock || 0) > 0,
              );
              const totalQuantity = filteredVariants.reduce(
                (sum, v) => sum + (v?.stock?.totalStock || 0),
                0,
              );
              return {
                ...product,
                variantData: filteredVariants,
                totalQuantity,
              };
            }

            return product;
          })
          .filter((product) => {
            return (product.totalQuantity || 0) > 0;
          });
      }
    }

    const effectiveTotal =
      includeStock && (Boolean(storeId) || enforcePositiveStock)
        ? productsWithStock.length
        : total;

    // If fetching all, return without pagination info
    if (shouldFetchAll) {
      return {
        products: productsWithStock,
        total: effectiveTotal,
      };
    }

    return {
      products: productsWithStock,
      pagination: {
        currentPage: validatedPage,
        totalPages: Math.ceil(effectiveTotal / validatedLimit),
        totalItems: effectiveTotal,
        itemsPerPage: validatedLimit,
        hasNext: validatedPage * validatedLimit < effectiveTotal,
        hasPrev: validatedPage > 1,
      },
    };
  }

  /**
   * Bulk get products by IDs with full data (same as list method returns)
   * @param {Array} ids - Array of product IDs
   * @param {Object} options - Options for the query
   * @param {boolean} options.lean - Whether to return lean documents (default: true)
   * @param {boolean} options.throwOnNotFound - Whether to throw error if some IDs not found (default: false)
   * @returns {Promise<Object>} Result with products, found count, and not found IDs
   */
  async bulkGetProducts(ids, options = {}) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('Product IDs array is required and must not be empty');
      }

      const normalizedIds = ids.map((id) => {
        const normalized =
          typeof id === 'string' ? id.trim() : id?.toString?.();

        if (!normalized) {
          throw new Error('Invalid product ID format');
        }

        this.validateObjectId(normalized);
        return normalized;
      });

      const { lean = true, throwOnNotFound = false } = options;

      await this._ensureRefModels();

      const Model = await this.getModelRef();

      // Fetch products with same population as list method
      const products = await Model.find({
        _id: { $in: normalizedIds },
      })
        .populate('category', 'categoryName hasExpiry hasWarranty')
        .populate('subCategory', 'subcategory')
        .populate('brand', 'brand')
        .populate('unit.unit', 'unit')
        .populate('warrantyType', 'warranty')
        .populate('variantIds', 'variant')
        .populate('tax', 'taxName taxType valueType value')
        .lean(lean);

      const foundIds = new Set(products.map((doc) => doc._id.toString()));
      const notFoundIds = normalizedIds.filter((id) => !foundIds.has(id));

      if (throwOnNotFound && notFoundIds.length > 0) {
        throw new Error(`Products not found: ${notFoundIds.join(', ')}`);
      }

      // Get stock information for products (same as list method)
      const StockModel = await this._stockService.getStockModel();
      const productIds = products.map((p) => p._id);
      const stockData = await this._getStockInformationForProducts(
        productIds,
        StockModel,
        products,
      );

      // Attach stock information to products (same transformation as list method)
      const productsWithStock = products.map((product) => {
        // Clean nested refs to remove _id and keep readable fields only
        const category = product.category
          ? {
            categoryName: product.category.categoryName,
            hasExpiry: product.category.hasExpiry || false,
            hasWarranty: product.category.hasWarranty || false,
          }
          : null;
        const subCategory = product.subCategory
          ? { subcategory: product.subCategory.subcategory }
          : null;
        const brand = product.brand ? { brand: product.brand.brand } : null;
        const unit = product.unit
          ? {
            name: product.unit.unit?.unit || null,
            shortName: product.unit.unit?.shortName || null,
            value: product.unit.value,
          }
          : null;
        const warrantyType = product.warrantyType
          ? {
            _id: product.warrantyType._id || null,
            name: product.warrantyType.warranty,
          }
          : null;

        const tax = Array.isArray(product.tax)
          ? product.tax.map((t) => ({
            _id: t._id || null,
            taxName: t.taxName,
            taxType: t.taxType,
            valueType: t.valueType,
            value: t.value,
          }))
          : [];

        // For variant products, embed stock directly in variantData
        if (
          product.hasVariation === true &&
          Array.isArray(product.variantData)
        ) {
          const updatedVariantData = product.variantData.map((variant) => {
            const stockKey = `${product._id}_${variant.SKU}`;
            const variantStockData = stockData[stockKey] || {
              storeStock: [],
              totalStock: 0,
            };
            const variantTitle = Array.isArray(variant.variantValues)
              ? variant.variantValues
                .map((v) => v?.value)
                .filter(Boolean)
                .join(' ')
              : '';
            return {
              ...variant,
              variantTitle,
              stock: variantStockData,
            };
          });

          const totalQuantity = updatedVariantData.reduce(
            (sum, v) => sum + (v?.stock?.totalStock || 0),
            0,
          );

          return {
            ...product,
            variantData: updatedVariantData,
            totalQuantity,
            category,
            subCategory,
            brand,
            unit,
            warrantyType,
            tax,
          };
        }

        // For non-variant products, include main stock
        const productStock = stockData[product._id.toString()] || {
          storeStock: [],
          totalStock: 0,
        };

        return {
          ...product,
          stock: productStock,
          totalQuantity: productStock.totalStock,
          category,
          subCategory,
          brand,
          unit,
          warrantyType,
          tax,
        };
      });

      return {
        data: productsWithStock,
        found: productsWithStock.length,
        notFound: notFoundIds,
        totalRequested: normalizedIds.length,
      };
    } catch (error) {
      throw new Error(`Bulk get products failed: ${error.message}`);
    }
  }

  /**
   * Get stock information for multiple products (OPTIMIZED VERSION)
   * @param {Array} productIds - Array of product IDs
   * @param {Object} StockModel - Stock model instance
   * @param {Array} products - Array of product objects for variant detection
   * @param {string} storeId - Optional store ID to filter stock by specific store
   * @param {Object} session - Optional MongoDB session for transaction support
   * @returns {Promise<Object>} Stock data organized by product ID and SKU
   *
   * PERFORMANCE OPTIMIZATIONS:
   * - Uses aggregation pipeline to avoid N+1 queries
   * - Single database round-trip for all data
   * - Minimal field selection (storeName only, no location data)
   * - Efficient memory usage with streaming
   * - Expected performance: ~30-80ms for 100 products
   */
  async _getStockInformationForProducts(
    productIds,
    StockModel,
    products = [],
    storeId = null,
    session = null,
  ) {
    if (!productIds || productIds.length === 0) {
      return {};
    }

    try {
      // Ensure Store model is available
      await this._ensureRefModels();

      // Build query filter
      const stockQuery = {
        productId: { $in: productIds },
        status: true,
      };

      // Add storeId filter if provided
      if (storeId) {
        stockQuery.storeId = storeId;
      }

      // Get all stock records for these products with store information
      // Use session if provided to read uncommitted transaction data
      let query = StockModel.find(stockQuery)
        .populate('storeId', '_id name');

      if (session) {
        query = query.session(session);
      }

      const stockRecords = await query.lean();

      // Organize stock data by product ID and SKU
      const result = {};

      stockRecords.forEach((stock) => {
        const productId = stock.productId.toString();
        const sku = stock.SKU;

        // Determine if this is a variant stock by checking if isVariant is set
        // If not set, we need to determine it from the product data
        let isVariant = stock.isVariant;

        // If isVariant is not set in the stock record, we need to determine it
        if (isVariant === undefined || isVariant === null) {
          // Find the product to check if this SKU belongs to a variant
          const product = products.find((p) => p._id.toString() === productId);
          if (
            product &&
            product.hasVariation === true &&
            Array.isArray(product.variantData)
          ) {
            // Check if this SKU exists in variantData
            const variantExists = product.variantData.some(
              (variant) => variant.SKU === sku,
            );
            isVariant = variantExists;
          } else {
            isVariant = false;
          }
        }

        const key = isVariant ? `${productId}_${sku}` : productId;

        if (!result[key]) {
          result[key] = {
            storeStock: [],
            totalStock: 0,
          };
        }

        // Add store-wise stock information
        if (stock.storeId) {
          result[key].storeStock.push({
            storeId: stock.storeId._id,
            storeName: stock.storeId.name,
            quantity: stock.quantity,
            SKU: sku,
            isVariant: isVariant,
          });
        }

        // Add to total stock
        result[key].totalStock += stock.quantity;
      });

      return result;
    } catch (error) {
      console.error('Error fetching stock information:', error);
      return {};
    }
  }

  /**
   * Get product by ID with populated fields and stock information
   * @param {string} id - Product ID
   * @param {Array} populateFields - Fields to populate
   * @returns {Promise<Object|null>} Product with stock information including:
   *   - For non-variant products: stock.storeStock[] and stock.totalStock
   *   - For variant products: stock embedded directly in variantData[].stock
   *   - Stock fields: { storeId, storeName, quantity, SKU, isVariant }
   */
  async getByIdAndPopulate(id, populateFields = []) {
    const Model = await this.getModelRef();
    let query = Model.findById(id);

    if (populateFields.length > 0) {
      populateFields.forEach((field) => {
        query = query.populate(field);
      });
    } else {
      // Default population matching list method
      query = query
        .populate('category', 'categoryName hasExpiry hasWarranty')
        .populate('subCategory', 'subcategory')
        .populate('brand', 'brand')
        .populate('unit.unit', 'unit')
        .populate('warrantyType', 'warranty')
        .populate('variantIds', 'variant');
    }

    const product = await query.lean();

    if (!product) {
      return null;
    }

    // Get stock information for this product
    const StockModel = await this._stockService.getStockModel();
    const stockData = await this._getStockInformationForProducts(
      [id],
      StockModel,
      [product],
    );

    // For variant products, embed stock directly in variantData and remove main stock
    if (product.hasVariation === true && Array.isArray(product.variantData)) {
      const updatedVariantData = product.variantData.map((variant) => {
        const variantStockData = stockData[`${id}_${variant.SKU}`] || {
          storeStock: [],
          totalStock: 0,
        };
        const variantTitle = Array.isArray(variant.variantValues)
          ? variant.variantValues
            .map((v) => v?.value)
            .filter(Boolean)
            .join(' ')
          : '';

        return {
          ...variant,
          variantTitle,
          stock: variantStockData,
        };
      });

      const totalQuantity = updatedVariantData.reduce(
        (sum, v) => sum + (v?.stock?.totalStock || 0),
        0,
      );

      // Flatten readable refs
      const category = product.category
        ? { categoryName: product.category.categoryName }
        : null;
      const subCategory = product.subCategory
        ? { subcategory: product.subCategory.subcategory }
        : null;
      const brand = product.brand ? { brand: product.brand.brand } : null;
      const unit = product.unit?.unit
        ? { name: product.unit.unit.name, value: product.unit.value }
        : null;
      const warrantyType = product.warrantyType
        ? {
          _id: product.warrantyType._id || null,
          name: product.warrantyType.warranty,
        }
        : null;

      return {
        ...product,
        variantData: updatedVariantData,
        totalQuantity,
        // Remove main stock field for variant products
        category,
        subCategory,
        brand,
        unit,
        warrantyType,
      };
    }

    // For non-variant products, include main stock
    const productStock = stockData[id.toString()] || {
      storeStock: [],
      totalStock: 0,
    };

    // Flatten readable refs for non-variant products
    const category = product.category
      ? { categoryName: product.category.categoryName }
      : null;
    const subCategory = product.subCategory
      ? { subcategory: product.subCategory.subcategory }
      : null;
    const brand = product.brand ? { brand: product.brand.brand } : null;
    const unit = product.unit?.unit
      ? { name: product.unit.unit.name, value: product.unit.value }
      : null;
    const warrantyType = product.warrantyType
      ? {
        _id: product.warrantyType._id || null,
        name: product.warrantyType.warranty,
      }
      : null;

    return {
      ...product,
      stock: productStock,
      totalQuantity: productStock.totalStock,
      category,
      subCategory,
      brand,
      unit,
      warrantyType,
    };
  }

  async bulkDelete(ids) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('Product IDs array is required and cannot be empty');
      }

      const Model = await this.getModelRef();

      return await this.executeTenantTransaction(async (session) => {
        // Get products to collect all image URLs for cleanup
        const products = await Model.find(
          { _id: { $in: ids } },
          { barcodeUrl: 1, productImage: 1, variantData: 1 },
          { session },
        );

        // Collect all image URLs for cleanup (inline)
        const imageUrls = [];
        for (const p of products) {
          if (p.barcodeUrl) imageUrls.push(p.barcodeUrl);
          if (p.productImage) imageUrls.push(p.productImage);
          const vds = Array.isArray(p.variantData) ? p.variantData : [];
          for (const v of vds) {
            if (v.barcodeUrl) imageUrls.push(v.barcodeUrl);
            if (v.image) imageUrls.push(v.image);
          }
        }

        // Delete products
        const result = await Model.deleteMany(
          { _id: { $in: ids } },
          { session },
        );

        // Cleanup Stock and StockBatch
        const StockModel = await this._stockService.getStockModel();
        await StockModel.deleteMany({ productId: { $in: ids } }, { session });

        const StockBatchModel = await this._stockBatchService.getModel();
        await StockBatchModel.updateMany(
          { productId: { $in: ids } },
          {
            $set: {
              isDeleted: true,
              status: false,
              lifecycleStatus: 'archived',
              deletedAt: new Date(),
            },
          },
          { session },
        );

        // Clean up all images asynchronously (inline)
        if (imageUrls.length > 0) {
          setImmediate(async () => {
            try {
              await Promise.all(
                imageUrls.map(async (url) => {
                  try {
                    if (url.includes('pos-barcodes')) {
                      return await BarcodeUtils.deleteBarcodeFromCloudinary(
                        url,
                      );
                    }
                    return await deleteImage(url, 'productImages', 'image');
                  } catch (err) {
                    return false;
                  }
                }),
              );
            } catch (e) { }
          });
        }

        return {
          message: `Successfully deleted ${result.deletedCount} products`,
          deletedCount: result.deletedCount,
        };
      });
    } catch (error) {
      throw new Error(`Bulk delete failed: ${error.message}`);
    }
  }

  /**
   * Create a product with barcode generation using MongoDB transactions
   * This method ensures atomicity - either everything succeeds or everything is rolled back
   * @param {Object} productData - Product data
   * @returns {Promise<Object>} Created product with barcode and productId
   */
  async createWithBarcode(productData) {
    return await this.executeTenantTransaction(async (session) => {
      await this._ensureRefModels();
      const Model = await this.getModelRef();

      // Clean session-ish props inline
      const processedProductData = { ...productData };
      delete processedProductData.session;
      delete processedProductData._session;
      delete processedProductData.$$session;
      Object.keys(processedProductData).forEach((k) => {
        const val = processedProductData[k];
        if (val && typeof val === 'object' && val.constructor) {
          const cname = val.constructor.name;
          if (cname === 'ClientSession' || cname.includes('Session')) {
            delete processedProductData[k];
          }
        }
      });

      // Normalize SKU if provided as productSKU (fail-safe if controller mapping missed it)
      if (!processedProductData.SKU && processedProductData.productSKU) {
        processedProductData.SKU = processedProductData.productSKU;
      }

      // Process variation shape inline to match model (variantIds/variantData)
      const processedWithVariations = { ...processedProductData };
      const hasVar =
        processedWithVariations.hasVariation === true ||
        processedWithVariations.hasVariation === 'true';
      // No console logs in service
      if (hasVar) {
        if (
          !Array.isArray(processedWithVariations.variantIds) ||
          processedWithVariations.variantIds.length === 0
        ) {
          throw new Error('variantIds is required and cannot be empty');
        }
        if (
          !Array.isArray(processedWithVariations.variantData) ||
          processedWithVariations.variantData.length === 0
        ) {
          throw new Error('variantData is required and cannot be empty');
        }

        // Ensure main SKU exists
        if (!processedWithVariations.SKU) {
          throw new Error('Main product SKU not given (createWithBarcode)');
        }

        // Ensure variant SKUs exist
        const processedVariantData = [];

        // Validate Variant SKUs
        for (const [idx, vd] of processedWithVariations.variantData.entries()) {
          if (!vd.SKU) {
            throw new Error(`Variant SKU not given at index ${idx}`);
          }
        }

        const variantDataWithSKUs = processedWithVariations.variantData;

        // Generate barcodes instantly for variants (respect provided barcode)
        for (const vd of variantDataWithSKUs) {
          let variantBarcode = vd.barcode || null;
          let variantBarcodeUrl = vd.barcodeUrl || null;

          // no logging

          if (vd.SKU && !vd.barcode) {
            try {
              const variantBarcodeData = BarcodeUtils.generateBarcodeForProduct(
                {
                  ...processedWithVariations,
                  SKU: vd.SKU,
                  productName: `${processedWithVariations.productName} - ${(
                    vd.variantValues || []
                  )
                    .map((v) => v?.value)
                    .join(' ')}`,
                },
              );
              variantBarcode = variantBarcodeData.barcode;
              variantBarcodeUrl = null; // image generated in background
            } catch (error) {
              console.warn(
                `Failed to generate barcode for variant ${vd.SKU}:`,
                error.message,
              );
            }
          }

          processedVariantData.push({
            ...vd,
            barcode: variantBarcode,
            barcodeUrl: variantBarcodeUrl,
          });
        }

        processedWithVariations.variantData = processedVariantData;

        // Clear non-variant pricing on variant products
        delete processedWithVariations.costPrice;
        delete processedWithVariations.sellingPrice;
        delete processedWithVariations.discount;
        delete processedWithVariations.lowStockAlert;
      } else {
        // Non-variant: clear variant fields
        delete processedWithVariations.variantIds;
        delete processedWithVariations.variantData;
      }

      // Step 3: Generate barcode data instantly (no async operations)
      // Respect incoming barcode when provided
      // For products with variations, only generate/keep SKU (no main barcode)
      // For products without variations, generate SKU and barcode (or keep provided barcode)

      if (!processedWithVariations.SKU) {
        throw new Error('SKU not given (non-variant check)');
      }

      const barcodeData =
        hasVar === true
          ? {
            // If main SKU provided, keep it
            sku: processedWithVariations.SKU,
            barcode: null, // No main barcode for variant products
            barcodeUrl: null, // No main barcode URL for variant products
          }
          : (() => {
            // Non-variant product
            const skuValue = processedWithVariations.SKU;
            // If payload contains barcode, use it; else generate
            if (
              processedWithVariations.barcode &&
              typeof processedWithVariations.barcode === 'string'
            ) {
              return {
                sku: skuValue,
                barcode: String(processedWithVariations.barcode).trim(),
                barcodeUrl: null, // image will be generated in background
              };
            }
            const gen = BarcodeUtils.generateBarcodeForProduct({
              ...processedWithVariations,
              SKU: skuValue,
            });
            return gen;
          })();

      // Step 4: Validate SKU and barcode uniqueness within transaction
      const existingProduct = await Model.findOne({
        SKU: barcodeData.sku,
      }).session(session);
      if (existingProduct) {
        throw new Error(
          `SKU '${barcodeData.sku}' already exists. Please use a different SKU.`,
        );
      }

      // Validate barcode uniqueness (only for non-variant products with barcodes)
      if (barcodeData.barcode && hasVar !== true) {
        const existingBarcode = await Model.findOne({
          barcode: barcodeData.barcode,
        }).session(session);
        if (existingBarcode) {
          throw new Error(
            `Barcode '${barcodeData.barcode}' already exists. Please use a different barcode.`,
          );
        }

        // Also check variant barcodes for uniqueness
        const existingVariantBarcode = await Model.findOne({
          'variantData.barcode': barcodeData.barcode,
        }).session(session);
        if (existingVariantBarcode) {
          throw new Error(
            `Barcode '${barcodeData.barcode}' already exists in variant inventory. Please use a different barcode.`,
          );
        }
      }

      // Step 5: Create product with barcode data within transaction
      const productWithBarcode = {
        ...processedWithVariations,
        SKU: barcodeData.sku,
        barcode: barcodeData.barcode,
        barcodeUrl: barcodeData.barcodeUrl,
      };

      const product = new Model(productWithBarcode);
      const savedProduct = await product.save({ session });

      // Step 5: Validate the saved product
      if (!savedProduct) {
        throw new Error('Product was not saved successfully');
      }

      // Upsert initial stock if provided
      await this._upsertInitialStock(
        savedProduct.toObject(),
        processedProductData,
        session,
      );

      // Generate barcode images in background after product is saved
      this._generateBarcodeImagesInBackground(
        savedProduct.toObject(),
        processedWithVariations,
      );

      return {
        ...savedProduct.toObject(),
        productId: savedProduct._id,
      };
    });
  }

  /**
   * Process variation data based on hasVariation flag
   * @param {Object} productData - Product data
   * @returns {Promise<Object>} Processed product data
   */
  // helper removed; variation processing is inlined in create/update

  /**
   * Find product by barcode with optimized performance
   * Searches both main product barcode and variant barcodes
   * @param {string} barcode - The barcode to search for
   * @returns {Promise<Object|null>} Product with populated references or null
   */
  async findByBarcode(barcode) {
    try {
      if (!barcode || typeof barcode !== 'string') {
        throw new Error('Valid barcode is required');
      }

      const Model = await this.getModelRef();
      const trimmedBarcode = barcode.trim();

      // Single aggregation covering both main and variantData barcode match + lookups
      const results = await Model.aggregate([
        {
          $match: {
            status: true,
            $or: [
              { barcode: trimmedBarcode },
              {
                'variantData.barcode': trimmedBarcode,
                'variantData.status': true,
              },
            ],
          },
        },
        // Identify if variant matched and isolate matching variant
        {
          $addFields: {
            matchedVariant: {
              $first: {
                $filter: {
                  input: { $ifNull: ['$variantData', []] },
                  as: 'vi',
                  cond: {
                    $and: [
                      { $eq: ['$$vi.barcode', trimmedBarcode] },
                      { $eq: ['$$vi.status', true] },
                    ],
                  },
                },
              },
            },
          },
        },
        {
          $addFields: {
            isVariantMatch: { $ne: ['$matchedVariant', null] },
            variantData: {
              $cond: [
                { $ne: [{ $ifNull: ['$matchedVariant', null] }, null] },
                ['$matchedVariant'],
                {
                  $filter: {
                    input: { $ifNull: ['$variantData', []] },
                    as: 'vi',
                    cond: { $ne: ['$$vi', null] },
                  },
                },
              ],
            },
          },
        },
        // Lookups for refs; using localField/foreignField avoids cast errors on non-ObjectId values
        {
          $lookup: {
            from: 'productcategories',
            localField: 'category',
            foreignField: '_id',
            as: 'category',
          },
        },
        { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'subcategories',
            localField: 'subCategory',
            foreignField: '_id',
            as: 'subCategory',
          },
        },
        { $unwind: { path: '$subCategory', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'brands',
            localField: 'brand',
            foreignField: '_id',
            as: 'brand',
          },
        },
        { $unwind: { path: '$brand', preserveNullAndEmptyArrays: true } },
        // Note: no direct store lookup; store references are inside storeQuantities arrays
        {
          $lookup: {
            from: 'units',
            localField: 'unit',
            foreignField: '_id',
            as: 'unit',
          },
        },
        { $unwind: { path: '$unit', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'taxes',
            localField: 'tax',
            foreignField: '_id',
            as: 'tax',
          },
        },
        {
          $lookup: {
            from: 'warranties',
            localField: 'warrantyType',
            foreignField: '_id',
            as: 'warrantyType',
          },
        },
        {
          $unwind: { path: '$warrantyType', preserveNullAndEmptyArrays: true },
        },
        // Optional: load variant definitions referenced by variantIds
        {
          $lookup: {
            from: 'variants',
            localField: 'variantIds',
            foreignField: '_id',
            as: 'variantIds',
          },
        },
        {
          $project: {
            _id: 1,
            productName: 1,
            SKU: 1,
            description: 1,
            costPrice: 1,
            sellingPrice: 1,
            discount: 1,
            weight: 1,
            dimensions: 1,
            productImage: 1,
            status: 1,
            hasVariation: 1,
            variantIds: 1,
            variantData: 1,
            createdAt: 1,
            updatedAt: 1,
            barcode: 1,
            barcodeUrl: 1,
            isVariantMatch: 1,
            category: {
              $cond: [
                { $gt: [{ $type: '$category' }, 'missing'] },
                {
                  _id: '$category._id',
                  categoryName: '$category.categoryName',
                  hasExpiry: '$category.hasExpiry',
                  hasWarranty: '$category.hasWarranty',
                },
                null,
              ],
            },
            subCategory: {
              $cond: [
                { $gt: [{ $type: '$subCategory' }, 'missing'] },
                {
                  _id: '$subCategory._id',
                  subCategoryName: '$subCategory.subcategory',
                },
                null,
              ],
            },
            brand: {
              $cond: [
                { $gt: [{ $type: '$brand' }, 'missing'] },
                { _id: '$brand._id', brandName: '$brand.brand' },
                null,
              ],
            },
            unit: 1,
            warrantyType: 1,
            tax: 1,
          },
        },
      ]).exec();

      if (!results || results.length === 0) return null;

      const doc = results[0];
      return doc;
    } catch (error) {
      console.error('Error in findByBarcode:', error);
      throw new Error(`Failed to find product by barcode: ${error.message}`);
    }
  }

  /**
   * Find active product by barcode - only returns products with barcodes and active status
   * Searches both main product barcode and variant barcodes
   * @param {string} barcode - The barcode to search for
   * @returns {Promise<Object|null>} Product with populated references or null
   */
  async findActiveBarcodeByBarcode(barcode) {
    try {
      // Strict validation for barcode
      if (!barcode || typeof barcode !== 'string') {
        throw new Error('Valid barcode is required');
      }

      const trimmedBarcode = barcode.trim();

      // Reject empty strings, '0', 'undefined', 'null', etc.
      if (
        !trimmedBarcode ||
        trimmedBarcode.length === 0 ||
        trimmedBarcode === '0' ||
        trimmedBarcode.toLowerCase() === 'undefined' ||
        trimmedBarcode.toLowerCase() === 'null'
      ) {
        return null;
      }

      const Model = await this.getModelRef();

      // Single aggregation covering both main and variantData barcode match + lookups
      // Only returns products that have a barcode (not null) and are active
      const results = await Model.aggregate([
        {
          $match: {
            status: true,
            $or: [
              {
                // Use $and to combine both conditions properly
                $and: [
                  { barcode: trimmedBarcode },
                  { barcode: { $ne: null } },
                  { barcode: { $ne: '' } },
                  { barcode: { $exists: true } },
                ],
              },
              {
                // Use $and to combine variant barcode conditions
                $and: [
                  { 'variantData.barcode': trimmedBarcode },
                  { 'variantData.barcode': { $ne: null } },
                  { 'variantData.barcode': { $ne: '' } },
                  { 'variantData.barcode': { $exists: true } },
                  { 'variantData.status': true },
                ],
              },
            ],
          },
        },
        // Identify if variant matched and isolate matching variant
        {
          $addFields: {
            matchedVariant: {
              $first: {
                $filter: {
                  input: { $ifNull: ['$variantData', []] },
                  as: 'vi',
                  cond: {
                    $and: [
                      { $eq: ['$$vi.barcode', trimmedBarcode] },
                      { $eq: ['$$vi.status', true] },
                      { $ne: ['$$vi.barcode', null] },
                      { $ne: ['$$vi.barcode', ''] },
                    ],
                  },
                },
              },
            },
          },
        },
        {
          $addFields: {
            isVariantMatch: { $ne: ['$matchedVariant', null] },
            variantData: {
              $cond: [
                { $ne: [{ $ifNull: ['$matchedVariant', null] }, null] },
                ['$matchedVariant'],
                {
                  $filter: {
                    input: { $ifNull: ['$variantData', []] },
                    as: 'vi',
                    cond: { $ne: ['$$vi', null] },
                  },
                },
              ],
            },
          },
        },
        // Lookups for refs; using localField/foreignField avoids cast errors on non-ObjectId values
        {
          $lookup: {
            from: 'productcategories',
            localField: 'category',
            foreignField: '_id',
            as: 'category',
          },
        },
        { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'subcategories',
            localField: 'subCategory',
            foreignField: '_id',
            as: 'subCategory',
          },
        },
        { $unwind: { path: '$subCategory', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'brands',
            localField: 'brand',
            foreignField: '_id',
            as: 'brand',
          },
        },
        { $unwind: { path: '$brand', preserveNullAndEmptyArrays: true } },
        // Note: no direct store lookup; store references are inside storeQuantities arrays
        {
          $lookup: {
            from: 'units',
            localField: 'unit',
            foreignField: '_id',
            as: 'unit',
          },
        },
        { $unwind: { path: '$unit', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'taxes',
            localField: 'tax',
            foreignField: '_id',
            as: 'tax',
          },
        },
        {
          $lookup: {
            from: 'warranties',
            localField: 'warrantyType',
            foreignField: '_id',
            as: 'warrantyType',
          },
        },
        {
          $unwind: { path: '$warrantyType', preserveNullAndEmptyArrays: true },
        },
        // Optional: load variant definitions referenced by variantIds
        {
          $lookup: {
            from: 'variants',
            localField: 'variantIds',
            foreignField: '_id',
            as: 'variantIds',
          },
        },
        {
          $project: {
            _id: 1,
            productName: 1,
            SKU: 1,
            description: 1,
            costPrice: 1,
            sellingPrice: 1,
            weight: 1,
            dimensions: 1,
            productImage: 1,
            status: 1,
            hasVariation: 1,
            variantIds: 1,
            variantData: 1,
            createdAt: 1,
            updatedAt: 1,
            barcode: 1,
            barcodeUrl: 1,
            isVariantMatch: 1,
            category: {
              $cond: [
                { $gt: [{ $type: '$category' }, 'missing'] },
                {
                  _id: '$category._id',
                  categoryName: '$category.categoryName',
                  hasExpiry: '$category.hasExpiry',
                  hasWarranty: '$category.hasWarranty',
                },
                null,
              ],
            },
            subCategory: {
              $cond: [
                { $gt: [{ $type: '$subCategory' }, 'missing'] },
                {
                  _id: '$subCategory._id',
                  subCategoryName: '$subCategory.subcategory',
                },
                null,
              ],
            },
            brand: {
              $cond: [
                { $gt: [{ $type: '$brand' }, 'missing'] },
                { _id: '$brand._id', brandName: '$brand.brand' },
                null,
              ],
            },
            unit: 1,
            warrantyType: 1,
            tax: 1,
          },
        },
      ]).exec();

      if (!results || results.length === 0) return null;

      const doc = results[0];
      return doc;
    } catch (error) {
      console.error('Error in findActiveBarcodeByBarcode:', error);
      throw new Error(
        `Failed to find active product by barcode: ${error.message}`,
      );
    }
  }

  /**
   * Find multiple products by barcodes (batch operation)
   * @param {string[]} barcodes - Array of barcodes to search for
   * @returns {Promise<Object[]>} Array of products found
   */
  async findByBarcodes(barcodes) {
    try {
      if (!Array.isArray(barcodes) || barcodes.length === 0) {
        throw new Error('Valid array of barcodes is required');
      }

      const Model = await this.getModelRef();
      const trimmedBarcodes = barcodes.map((b) => b.trim()).filter(Boolean);

      if (trimmedBarcodes.length === 0) {
        return [];
      }

      // Aggregation with lookups in one pass
      const aggProducts = await Model.aggregate([
        {
          $match: {
            status: true,
            $or: [
              { barcode: { $in: trimmedBarcodes } },
              {
                'variantData.barcode': { $in: trimmedBarcodes },
                'variantData.status': true,
              },
            ],
          },
        },
        // For each product, keep only matched variant if barcode hits a variant
        {
          $addFields: {
            matchedVariant: {
              $first: {
                $filter: {
                  input: { $ifNull: ['$variantData', []] },
                  as: 'vi',
                  cond: {
                    $and: [
                      { $in: ['$$vi.barcode', trimmedBarcodes] },
                      { $eq: ['$$vi.status', true] },
                    ],
                  },
                },
              },
            },
          },
        },
        {
          $addFields: {
            isVariantMatch: { $ne: ['$matchedVariant', null] },
            variantData: {
              $cond: [
                { $ne: [{ $ifNull: ['$matchedVariant', null] }, null] },
                ['$matchedVariant'],
                {
                  $filter: {
                    input: { $ifNull: ['$variantData', []] },
                    as: 'vi',
                    cond: { $ne: ['$$vi', null] },
                  },
                },
              ],
            },
          },
        },
        {
          $lookup: {
            from: 'productcategories',
            localField: 'category',
            foreignField: '_id',
            as: 'category',
          },
        },
        { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'subcategories',
            localField: 'subCategory',
            foreignField: '_id',
            as: 'subCategory',
          },
        },
        { $unwind: { path: '$subCategory', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'brands',
            localField: 'brand',
            foreignField: '_id',
            as: 'brand',
          },
        },
        { $unwind: { path: '$brand', preserveNullAndEmptyArrays: true } },
        // Note: no direct store lookup; store references are inside storeQuantities arrays
        {
          $lookup: {
            from: 'units',
            localField: 'unit',
            foreignField: '_id',
            as: 'unit',
          },
        },
        { $unwind: { path: '$unit', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'taxes',
            localField: 'tax',
            foreignField: '_id',
            as: 'tax',
          },
        },
        {
          $lookup: {
            from: 'warranties',
            localField: 'warrantyType',
            foreignField: '_id',
            as: 'warrantyType',
          },
        },
        {
          $unwind: { path: '$warrantyType', preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: 'variants',
            localField: 'variantIds',
            foreignField: '_id',
            as: 'variantIds',
          },
        },
        {
          $project: {
            _id: 1,
            productName: 1,
            SKU: 1,
            description: 1,
            costPrice: 1,
            sellingPrice: 1,
            discount: 1,
            weight: 1,
            dimensions: 1,
            productImage: 1,
            status: 1,
            hasVariation: 1,
            variantIds: 1,
            variantData: 1,
            createdAt: 1,
            updatedAt: 1,
            barcode: 1,
            barcodeUrl: 1,
            isVariantMatch: 1,
            category: {
              $cond: [
                { $gt: [{ $type: '$category' }, 'missing'] },
                {
                  _id: '$category._id',
                  categoryName: '$category.categoryName',
                  hasExpiry: '$category.hasExpiry',
                  hasWarranty: '$category.hasWarranty',
                },
                null,
              ],
            },
            subCategory: {
              $cond: [
                { $gt: [{ $type: '$subCategory' }, 'missing'] },
                {
                  _id: '$subCategory._id',
                  subCategoryName: '$subCategory.subcategory',
                },
                null,
              ],
            },
            brand: {
              $cond: [
                { $gt: [{ $type: '$brand' }, 'missing'] },
                { _id: '$brand._id', brandName: '$brand.brand' },
                null,
              ],
            },
            unit: 1,
            warrantyType: 1,
            tax: 1,
          },
        },
      ]).exec();

      // Map back to requested order: return first matching main product else variant match per barcode
      const results = [];
      for (const b of trimmedBarcodes) {
        const product = aggProducts.find(
          (p) =>
            p.barcode === b ||
            (Array.isArray(p.variantData) &&
              p.variantData.some((v) => v.barcode === b && v.status === true)),
        );
        if (!product) continue;
        if (product.barcode === b) {
          results.push({ ...product, isVariantMatch: false });
        } else {
          const mv = (product.variantData || []).find(
            (v) => v.barcode === b && v.status === true,
          );
          if (mv)
            results.push({
              ...product,
              variantData: [mv],
              matchedVariant: mv,
              isVariantMatch: true,
            });
        }
      }

      return results;
    } catch (error) {
      console.error('Error in findByBarcodes:', error);
      throw new Error(`Failed to find products by barcodes: ${error.message}`);
    }
  }

  /**
   * Update product with barcode regeneration and stock management
   * @param {string} id - Product ID
   * @param {Object} updateData - Update data
   * @returns {Promise<Object>} Updated product with stock information including:
   *   - For non-variant products: stock.storeStock[] and stock.totalStock, totalQuantity
   *   - For variant products: stock embedded directly in variantData[].stock, totalQuantity
   *   - Stock fields: { storeId, storeName, quantity, SKU, isVariant }
   *   - Populated refs: category, subCategory, brand, unit, warrantyType, variantIds
   */
  async updateWithBarcode(id, updateData) {
    return await this.executeTenantTransaction(async (session) => {
      const Model = await this.getModelRef();
      const product = await Model.findById(id, null, { session });

      if (!product) {
        throw new Error('Product not found');
      }

      // Clean session-ish props inline
      const processedUpdateData = { ...updateData };
      delete processedUpdateData.session;
      delete processedUpdateData._session;
      delete processedUpdateData.$$session;
      Object.keys(processedUpdateData).forEach((k) => {
        const val = processedUpdateData[k];
        if (val && typeof val === 'object' && val.constructor) {
          const cname = val.constructor.name;
          if (cname === 'ClientSession' || cname.includes('Session')) {
            delete processedUpdateData[k];
          }
        }
      });

      // Normalize SKU if provided as productSKU (fail-safe)
      if (!processedUpdateData.SKU && processedUpdateData.productSKU) {
        processedUpdateData.SKU = processedUpdateData.productSKU;
      }

      // Process variation updates similar to create method
      const processedWithVariations = { ...processedUpdateData };
      const hasVar =
        processedWithVariations.hasVariation !== undefined
          ? processedWithVariations.hasVariation === true ||
          processedWithVariations.hasVariation === 'true'
          : product.hasVariation === true;

      let removedSkus = [];
      // Handle variant updates
      if (hasVar && Array.isArray(processedWithVariations.variantData)) {
        // Validate variant data
        // Fix: Use existing variantIds if not provided in payload
        if (
          !Array.isArray(processedWithVariations.variantIds) ||
          processedWithVariations.variantIds.length === 0
        ) {
          if (product.variantIds && product.variantIds.length > 0) {
            processedWithVariations.variantIds = product.variantIds;
          } else {
            throw new Error('variantIds is required and cannot be empty');
          }
        }

        // Process variant data with SKUs and barcodes
        const processedVariantData = [];
        const existingVariants = product.variantData || [];
        const existingVariantMap = new Map();

        // Index existing variants by value combination for duplicate detection
        existingVariants.forEach((v) => {
          if (Array.isArray(v.variantValues)) {
            // Create a unique key based on sorted valueIds
            const key = v.variantValues
              .map((val) => String(val.valueId))
              .sort()
              .join('|');
            if (key) existingVariantMap.set(key, v);
          }
        });

        const distinctIncomingKeys = new Set();

        processedWithVariations.variantData.forEach((vd) => {
          // Fix: Ensure SKU is present
          if (!vd.SKU) {
            throw new Error('SKU not given');
          }

          // Validate variant values
          if (
            !Array.isArray(vd.variantValues) ||
            vd.variantValues.length === 0
          ) {
            throw new Error('Variant values are required for each variant');
          }

          // Generate key for incoming variant
          const key = vd.variantValues
            .map((val) => String(val.valueId))
            .sort()
            .join('|');

          // Prevent duplicates in payload
          if (distinctIncomingKeys.has(key)) {
            return;
          }
          distinctIncomingKeys.add(key);

          const variantSKU = vd.SKU;
          let variantBarcode = vd.barcode || null;
          let variantBarcodeUrl = vd.barcodeUrl || null;
          let variantId = vd._id;

          // Attempt to match with existing variant to preserve _id
          if (!variantId && existingVariantMap.has(key)) {
            const existing = existingVariantMap.get(key);
            variantId = existing._id;
            // Optionally preserve existing SKU if strictly matching values? 
            // The user might be updating SKU, so we respect payload SKU.
            // But we reuse the _id so Mongoose performs an update instead of insert.
          }

          // Generate barcode for new variants or if barcode is missing
          if (variantSKU && !vd.barcode) {
            try {
              const variantBarcodeData = BarcodeUtils.generateBarcodeForProduct(
                {
                  ...product.toObject(),
                  ...processedWithVariations,
                  SKU: variantSKU,
                  productName: `${processedWithVariations.productName || product.productName
                    } - ${(vd.variantValues || [])
                      .map((v) => v?.value)
                      .join(' ')}`,
                },
              );

              variantBarcode = variantBarcodeData.barcode;
              variantBarcodeUrl = null; // Will be generated in background
            } catch (error) {
              console.warn(
                `Failed to generate barcode for variant ${variantSKU}:`,
                error.message,
              );
            }
          }

          const processedVariant = {
            ...vd,
            SKU: variantSKU,
            barcode: variantBarcode,
            barcodeUrl: variantBarcodeUrl,
          };

          if (variantId) {
            processedVariant._id = variantId;
          }

          processedVariantData.push(processedVariant);
        });

        processedWithVariations.variantData = processedVariantData;

        // Calculate removed SKUs for stock cleanup
        const oldSkus = existingVariants.map((v) => v.SKU).filter(Boolean);
        const newSkus = processedVariantData.map((v) => v.SKU).filter(Boolean);
        removedSkus = oldSkus.filter((sku) => !newSkus.includes(sku));

        // Check for Simple -> Variant switch to clean up old simple stock
        if (!product.hasVariation && product.SKU) {
          removedSkus.push(product.SKU);
        }

        // Clear non-variant pricing on variant products
        delete processedWithVariations.costPrice;
        delete processedWithVariations.sellingPrice;
        delete processedWithVariations.discount;
        delete processedWithVariations.lowStockAlert;
      } else if (!hasVar) {
        // Non-variant: clear variant fields
        processedWithVariations.variantIds = [];
        processedWithVariations.variantData = [];

        // If product was previously a variant, cleanup stock for all variants
        if (product.hasVariation && Array.isArray(product.variantData)) {
          removedSkus = product.variantData.map((v) => v.SKU).filter(Boolean);
        }
      }

      // Prefer client-provided barcode for non-variant update
      let clientProvidedBarcode = null;
      if (!hasVar && typeof processedWithVariations.barcode === 'string') {
        clientProvidedBarcode = String(processedWithVariations.barcode).trim();
      }

      // Check if barcode needs regeneration for non-variant products (only when not provided by client)
      const needsBarcodeRegeneration =
        !clientProvidedBarcode &&
        ((processedWithVariations.productName &&
          processedWithVariations.productName !== product.productName) ||
          (processedWithVariations.SKU &&
            processedWithVariations.SKU !== product.SKU));

      let barcodeData = null;
      if (needsBarcodeRegeneration && !hasVar) {
        barcodeData = await BarcodeUtils.generateBarcodeForProduct({
          ...product.toObject(),
          ...processedWithVariations,
        });
      }

      // Prepare update payload
      const updatePayload = { ...processedWithVariations };
      if (!hasVar) {
        if (clientProvidedBarcode) {
          // Remove old barcode image asynchronously if exists
          if (product.barcodeUrl) {
            const oldUrl = product.barcodeUrl;
            setImmediate(async () => {
              try {
                await BarcodeUtils.deleteBarcodeFromCloudinary(oldUrl);
              } catch (e) { }
            });
          }
          updatePayload.barcode = clientProvidedBarcode;
          updatePayload.barcodeUrl = null; // regenerate image in background
        } else if (barcodeData) {
          updatePayload.barcode = barcodeData.barcode;
          updatePayload.barcodeUrl = barcodeData.barcodeUrl;
        }
      }

      if (updatePayload.barcode == null) {
        delete updatePayload.barcode;
      }

      // Update product
      const updatedProduct = await Model.findByIdAndUpdate(id, updatePayload, {
        new: true,
        session,
      });

      if (!updatedProduct) {
        throw new Error('Product update failed');
      }

      // Cleanup stock for removed variants
      if (removedSkus.length > 0) {
        const StockModel = await this._stockService.getStockModel();
        await StockModel.deleteMany(
          {
            productId: id,
            SKU: { $in: removedSkus },
          },
          { session },
        );
        console.log(
          `[ProductServices::updateWithBarcode] Removed stock for ${removedSkus.length} detached variants (or old simple stock)`,
        );

        const StockBatchModel = await this._stockBatchService.getModel();
        await StockBatchModel.updateMany(
          {
            productId: id,
            SKU: { $in: removedSkus },
          },
          {
            $set: {
              isDeleted: true,
              status: false,
              lifecycleStatus: 'archived',
              deletedAt: new Date(),
              deletedBy: processedUpdateData.updatedBy || null,
            },
          },
          { session },
        );
      }

      // Upsert stock on update (handles both variant and non-variant stock)
      console.log('[ProductServices::updateWithBarcode] Upserting stock', {
        productId: id,
        hasVariation: updatedProduct.hasVariation === true,
        payloadStockCount: Array.isArray(processedUpdateData.stock)
          ? processedUpdateData.stock.length
          : 0,
        payloadVariantStockCount: Array.isArray(processedUpdateData.variantStocks)
          ? processedUpdateData.variantStocks.length
          : 0,
        sessionProvided: Boolean(session),
      });
      await this._upsertInitialStock(
        updatedProduct.toObject(),
        processedUpdateData,
        session,
      );
      console.log('[ProductServices::updateWithBarcode] Stock upsert complete', {
        productId: id,
      });

      // Generate barcode images in background for new barcodes
      this._generateBarcodeImagesInBackground(
        updatedProduct.toObject(),
        processedWithVariations,
      );

      // Fetch storewise stock data for the updated product
      const productObj = updatedProduct.toObject();
      const StockModel = await this._stockService.getStockModel();
      const stockData = await this._getStockInformationForProducts(
        [id],
        StockModel,
        [productObj],
        null, // storeId - no filter, get all stores
        session, // pass session to read uncommitted stock updates
      );

      // Populate the product with references for response
      await updatedProduct.populate([
        { path: 'category', select: 'categoryName hasExpiry hasWarranty' },
        { path: 'subCategory', select: 'subcategory' },
        { path: 'brand', select: 'brand' },
        { path: 'unit.unit', select: 'unit' },
        { path: 'warrantyType', select: 'warranty' },
        { path: 'variantIds', select: 'variant' },
      ]);

      const populatedProduct = updatedProduct.toObject();

      // For variant products, embed stock directly in variantData
      if (
        populatedProduct.hasVariation === true &&
        Array.isArray(populatedProduct.variantData)
      ) {
        const updatedVariantData = populatedProduct.variantData.map(
          (variant) => {
            const variantStockData = stockData[`${id}_${variant.SKU}`] || {
              storeStock: [],
              totalStock: 0,
            };
            const variantTitle = Array.isArray(variant.variantValues)
              ? variant.variantValues
                .map((v) => v?.value)
                .filter(Boolean)
                .join(' ')
              : '';

            return {
              ...variant,
              variantTitle,
              stock: variantStockData,
            };
          },
        );

        const totalQuantity = updatedVariantData.reduce(
          (sum, v) => sum + (v?.stock?.totalStock || 0),
          0,
        );

        // Flatten readable refs
        const category = populatedProduct.category
          ? { categoryName: populatedProduct.category.categoryName }
          : null;
        const subCategory = populatedProduct.subCategory
          ? { subcategory: populatedProduct.subCategory.subcategory }
          : null;
        const brand = populatedProduct.brand
          ? { brand: populatedProduct.brand.brand }
          : null;
        const unit = populatedProduct.unit?.unit
          ? {
            name: populatedProduct.unit.unit.name,
            value: populatedProduct.unit.value,
          }
          : null;
        const warrantyType = populatedProduct.warrantyType
          ? {
            _id: populatedProduct.warrantyType._id || null,
            name: populatedProduct.warrantyType.warranty,
          }
          : null;

        return {
          ...populatedProduct,
          variantData: updatedVariantData,
          totalQuantity,
          category,
          subCategory,
          brand,
          unit,
          warrantyType,
        };
      }

      // For non-variant products, include main stock
      const productStock = stockData[id.toString()] || {
        storeStock: [],
        totalStock: 0,
      };

      // Flatten readable refs for non-variant products
      const category = populatedProduct.category
        ? { categoryName: populatedProduct.category.categoryName }
        : null;
      const subCategory = populatedProduct.subCategory
        ? { subcategory: populatedProduct.subCategory.subcategory }
        : null;
      const brand = populatedProduct.brand
        ? { brand: populatedProduct.brand.brand }
        : null;
      const unit = populatedProduct.unit?.unit
        ? {
          name: populatedProduct.unit.unit.name,
          value: populatedProduct.unit.value,
        }
        : null;
      const warrantyType = populatedProduct.warrantyType
        ? {
          _id: populatedProduct.warrantyType._id || null,
          name: populatedProduct.warrantyType.warranty,
        }
        : null;

      return {
        ...populatedProduct,
        stock: productStock,
        totalQuantity: productStock.totalStock,
        category,
        subCategory,
        brand,
        unit,
        warrantyType,
      };
    });
  }

  /**
   * Delete product with barcode cleanup
   * @param {string} id - Product ID
   * @returns {Promise<Object>} Deletion result
   */
  async deleteWithBarcode(id) {
    return await this.executeTenantTransaction(async (session) => {
      const Model = await this.getModelRef();
      const product = await Model.findById(id, null, { session });

      if (!product) {
        throw new Error('Product not found');
      }

      // Collect all image URLs for cleanup (inline)
      const imageUrls = [];
      if (product.barcodeUrl) imageUrls.push(product.barcodeUrl);
      if (product.productImage) imageUrls.push(product.productImage);
      const vds = Array.isArray(product.variantData) ? product.variantData : [];
      for (const v of vds) {
        if (v.barcodeUrl) imageUrls.push(v.barcodeUrl);
        if (v.image) imageUrls.push(v.image);
      }

      // Delete product
      await Model.findByIdAndDelete(id, { session });

      // Clean up all images asynchronously (inline)
      if (imageUrls.length > 0) {
        setImmediate(async () => {
          try {
            await Promise.all(
              imageUrls.map(async (url) => {
                try {
                  if (url.includes('pos-barcodes')) {
                    return await BarcodeUtils.deleteBarcodeFromCloudinary(url);
                  }
                  return await deleteImage(url, 'productImages', 'image');
                } catch (err) {
                  return false;
                }
              }),
            );
          } catch (e) { }
        });
      }

      return { message: 'Product deleted successfully' };
    });
  }

  /**
   * Regenerate barcode for a product
   * @param {string} id - Product ID
   * @returns {Promise<Object>} Updated product with new barcode
   */
  async regenerateBarcode(id) {
    return await this.executeTenantTransaction(async (session) => {
      const Model = await this.getModelRef();
      const product = await Model.findById(id, null, { session });

      if (!product) {
        throw new Error('Product not found');
      }

      // If product has variations, do not regenerate main barcode
      if (product.hasVariation === true) {
        return product;
      }

      // Delete old barcode asynchronously
      if (product.barcodeUrl) {
        const oldUrl = product.barcodeUrl;
        setImmediate(async () => {
          try {
            await BarcodeUtils.deleteBarcodeFromCloudinary(oldUrl);
          } catch (e) { }
        });
      }

      // Generate new barcode
      const barcodeData = await BarcodeUtils.generateBarcodeForProduct(
        product.toObject(),
      );

      // Update product with new barcode
      const updatedProduct = await Model.findByIdAndUpdate(
        id,
        {
          barcode: barcodeData.barcode,
          barcodeUrl: barcodeData.barcodeUrl,
        },
        { new: true, session },
      );

      return updatedProduct;
    });
  }

  /**
   * Get product statistics
   * @returns {Promise<Object>} Product statistics
   */
  async getProductStats() {
    const Model = await this.getModelRef();

    const [
      totalProducts,
      activeProducts,
      inactiveProducts,
      productsWithVariations,
      productsWithoutVariations,
    ] = await Promise.all([
      Model.countDocuments(),
      Model.countDocuments({ status: true }),
      Model.countDocuments({ status: false }),
      Model.countDocuments({ hasVariation: true }),
      Model.countDocuments({ hasVariation: false }),
    ]);

    return {
      totalProducts,
      activeProducts,
      inactiveProducts,
      productsWithVariations,
      productsWithoutVariations,
    };
  }

  // low-stock removed as inventory is handled elsewhere

  /**
   * Bulk update product status
   * @param {Array} ids - Array of product IDs
   * @param {boolean} status - New status
   * @returns {Promise<Object>} Update result
   */
  async bulkUpdateStatus(ids, status) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('Product IDs array is required and cannot be empty');
      }

      const Model = await this.getModelRef();
      const result = await Model.updateMany({ _id: { $in: ids } }, { status });

      return {
        message: `Successfully updated status for ${result.modifiedCount} products`,
        modifiedCount: result.modifiedCount,
      };
    } catch (error) {
      throw new Error(`Bulk status update failed: ${error.message}`);
    }
  }

  // Variant-related methods removed - now handled in product creation/update
  /**
   * Get products with low stock (quantity <= lowStockAlert)
   * Reports across all stores and variants matching the condition.
   * @param {Object} queryParams - Query parameters
   * @param {string} queryParams.storeId - Optional store filter
   * @returns {Promise<Array>} List of low stock items with details
   */
  async getLowStockProducts(queryParams = {}) {
    await this._ensureRefModels();
    const StockModel = await this._stockService.getStockModel();
    const {
      storeId,
      page = 1,
      limit = 10,
      search = '',
      all,
    } = queryParams;

    const pipeline = [
      // 1. Match active stock entries
      { $match: { status: true } },
    ];

    if (storeId) {
      pipeline.push({
        $match: {
          storeId: new mongoose.Types.ObjectId(storeId),
        },
      });
    }

    // 2. Lookup Product
    pipeline.push({
      $lookup: {
        from: 'products',
        localField: 'productId',
        foreignField: '_id',
        as: 'product',
      },
    });
    pipeline.push({ $unwind: '$product' });
    pipeline.push({ $match: { 'product.status': true } });

    // 3. Lookup Store
    pipeline.push({
      $lookup: {
        from: 'stores',
        localField: 'storeId',
        foreignField: '_id',
        as: 'store',
      },
    });
    pipeline.push({ $unwind: '$store' });

    // 4. Lookup Category
    pipeline.push({
      $lookup: {
        from: 'productcategories',
        localField: 'product.category',
        foreignField: '_id',
        as: 'category',
      },
    });
    pipeline.push({
      $unwind: {
        path: '$category',
        preserveNullAndEmptyArrays: true,
      },
    });

    // 5. Calculate Alert Threshold
    pipeline.push({
      $addFields: {
        alertThreshold: {
          $cond: {
            if: { $eq: ['$product.hasVariation', true] },
            then: {
              $let: {
                vars: {
                  matchedVariant: {
                    $arrayElemAt: [
                      {
                        $filter: {
                          input: '$product.variantData',
                          as: 'v',
                          cond: { $eq: ['$$v.SKU', '$SKU'] },
                        },
                      },
                      0,
                    ],
                  },
                },
                in: { $ifNull: ['$$matchedVariant.lowStockAlert', 0] },
              },
            },
            else: { $ifNull: ['$product.lowStockAlert', 0] },
          },
        },
      },
    });

    // 6. Filter Low Stock (Quantity <= Alert)
    pipeline.push({
      $match: {
        $expr: { $lte: ['$quantity', '$alertThreshold'] },
      },
    });

    // 7. Search Filter (if provided)
    if (search) {
      const searchRegex = { $regex: search, $options: 'i' };
      pipeline.push({
        $match: {
          $or: [
            { 'product.productName': searchRegex },
            { SKU: searchRegex },
            { 'store.name': searchRegex },
            { 'category.categoryName': searchRegex },
          ],
        },
      });
    }

    // 8. Project Required Fields
    const projectStage = {
      $project: {
        _id: 0,
        Store: '$store.name',
        Product: '$product.productName',
        Category: { $ifNull: ['$category.categoryName', 'Uncategorized'] },
        SKU: '$SKU',
        'Current Qty': '$quantity',
        'Qty Alert': '$alertThreshold',
      },
    };
    pipeline.push(projectStage);

    // 9. Pagination
    const shouldFetchAll = all === true || all === 'true';

    if (shouldFetchAll) {
      return await StockModel.aggregate(pipeline);
    } else {
      const {
        page: validatedPage,
        limit: validatedLimit,
        skip,
      } = this.validatePagination(page, limit);

      const countPipeline = [...pipeline];
      // Remove the last $project stage for counting to save checking fields not needed
      countPipeline.pop();
      countPipeline.push({ $count: 'total' });

      // Add skip and limit for data
      pipeline.push({ $skip: skip });
      pipeline.push({ $limit: validatedLimit });

      const [data, countResult] = await Promise.all([
        StockModel.aggregate(pipeline),
        StockModel.aggregate(countPipeline),
      ]);

      const total = countResult[0]?.total || 0;

      return {
        products: data,
        pagination: {
          currentPage: validatedPage,
          totalPages: Math.ceil(total / validatedLimit),
          totalItems: total,
          itemsPerPage: validatedLimit,
          hasNext: validatedPage * validatedLimit < total,
          hasPrev: validatedPage > 1,
        },
      };
    }
  }
}

export default ProductServices;
