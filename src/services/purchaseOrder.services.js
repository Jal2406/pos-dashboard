import { BaseService, EmailService } from '../utils/index.js';
import mongoose from 'mongoose';
import { StockBatchServices } from './index.js';
import TenantNotificationDispatcher from './tenantNotification/notificationDispatcher.service.js';


import {
  PurchaseOrderSchema,
  SupplierSchema,
  StoreSchema,
  ProductSchema,
  VariantSchema,
  UnitSchema,
  tenantTaxSchema,
  StockSchema,
  ProductCategorySchema,
} from '../models/index.js';

const PO_SEARCH_FIELDS = Object.freeze([
  'orderDetails.poNumber',
  'supplier.supplierName',
  'supplier.supplierCode',
]);

const DEFAULT_PO_TEMPLATE_LABEL = 'purchase_order_approved';
const EMAIL_BATCH_SIZE = 50;

const PO_STATUSES = Object.freeze({
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'PendingApproval',
  APPROVED: 'Approved',
  PARTIALLY_RECEIVED: 'PartiallyReceived',
  RECEIVED: 'Received',
  BILLED: 'Billed',
  CANCELLED: 'Cancelled',
  ON_HOLD: 'OnHold',
  IN_TRANSIT: 'InTransit',
});

const PO_STATUS_TRANSITIONS = Object.freeze({
  [PO_STATUSES.DRAFT]: new Set([
    PO_STATUSES.APPROVED,
    PO_STATUSES.CANCELLED
  ]),
  [PO_STATUSES.APPROVED]: new Set([
    PO_STATUSES.BILLED,
    PO_STATUSES.CANCELLED,
    PO_STATUSES.RECEIVED,
    PO_STATUSES.PARTIALLY_RECEIVED,
    PO_STATUSES.IN_TRANSIT,
    PO_STATUSES.ON_HOLD
  ]),
  [PO_STATUSES.BILLED]: new Set([]), // Terminal state
  [PO_STATUSES.CANCELLED]: new Set([]), // Terminal state
  [PO_STATUSES.RECEIVED]: new Set([PO_STATUSES.BILLED]),
  [PO_STATUSES.PARTIALLY_RECEIVED]: new Set([PO_STATUSES.RECEIVED, PO_STATUSES.BILLED]),
  [PO_STATUSES.IN_TRANSIT]: new Set([PO_STATUSES.RECEIVED, PO_STATUSES.PARTIALLY_RECEIVED, PO_STATUSES.CANCELLED]),
  [PO_STATUSES.ON_HOLD]: new Set([PO_STATUSES.APPROVED, PO_STATUSES.CANCELLED]),
});

class PurchaseOrderServices extends BaseService {
  constructor(businessId) {
    if (!businessId) {
      throw new Error('PurchaseOrderServices initialized without businessId');
    }
    super({
      modelName: 'PurchaseOrder',
      schema: PurchaseOrderSchema,
      collection: 'purchaseorders',
      businessId,
    });
    
    // RBAC: Purchase orders are store-scoped
    this.rbacConfig.storeScoped = true;
    this.rbacConfig.storeIdField = 'storeId';
    
    this._referenceModelsReady = false;
    this._userModel = null; // Cache for User model
    this._stockBatchService = new StockBatchServices(businessId);
  }

  // Expose PurchaseOrder model via service
  async getPurchaseOrderModel() {
    return this.getModel('PurchaseOrder', PurchaseOrderSchema, 'purchaseorders');
  }

  static _getService(req) {
    if (!req.businessId) {
      throw new Error('Business ID context is required');
    }
    return new PurchaseOrderServices(req.businessId);
  }

  async _ensureReferenceModels() {
    if (this._referenceModelsReady) return;
    await Promise.all([
      this.getModel('Supplier', SupplierSchema, 'suppliers'),
      this.getModel('Store', StoreSchema, 'stores'),
      this.getModel('Product', ProductSchema, 'products'),
      this.getModel('Variant', VariantSchema, 'variants'),
      this.getModel('Unit', UnitSchema, 'units'),
      this.getModel('TenantTax', tenantTaxSchema, 'tenanttaxes'),
      this.getModel('Stock', StockSchema, 'stocks'),
      this.getModel('ProductCategory', ProductCategorySchema, 'productcategories'),
    ]).catch(() => { });
    this._referenceModelsReady = true;
  }

  async _getPurchaseOrderModel() {
    const PurchaseOrder = await this.getModel();
    await this._ensureReferenceModels();
    return PurchaseOrder;
  }

  _shouldFetchAll(all) {
    if (typeof all === 'string') {
      return all.toLowerCase() === 'true';
    }
    return Boolean(all);
  }

  _buildPOFilters({ status, supplierId, startDate, endDate, search } = {}) {
    const filters = { isDeleted: false };

    // businessId is handled by the connection/model factory, not as a field query


    if (status) filters.status = status;
    if (supplierId) filters['supplier.supplierId'] = supplierId;

    if (startDate || endDate) {
      filters['orderDetails.purchaseDate'] = {};
      if (startDate)
        filters['orderDetails.purchaseDate'].$gte = new Date(startDate);
      if (endDate)
        filters['orderDetails.purchaseDate'].$lte = new Date(endDate);
    }

    return filters;
  }

  _applySearchFilter(filters = {}, searchTerm = '', searchFields = []) {
    const term = typeof searchTerm === 'string' ? searchTerm.trim() : searchTerm || '';

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

  _generatePoNumber() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const seq = String(now.getTime()).slice(-6);
    return `PO-${y}${m}${d}-${seq}`;
  }

  _generateInvoiceNumber() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const seq = String(now.getTime()).slice(-6);
    return `INV-${y}${m}${d}-${seq}`;
  }

  async _getPurchaseOrderModel() {
    const PurchaseOrderModel = await this.getModel();
    await this._ensureReferenceModels();
    return PurchaseOrderModel;
  }


  async _populateUsers(data, fields = ['createdBy', 'approvedBy']) {
    if (!data) {
      return data;
    }

    const isArray = Array.isArray(data);
    const items = isArray ? data : [data];
    const ids = new Set();

    items.forEach((item) => {
      fields.forEach((field) => {
        if (item?.[field]) {
          ids.add(item[field].toString());
        }
      });
    });

    let usersMap = {};
    if (ids.size > 0) {
      const users = await User.find({ _id: { $in: Array.from(ids) } })
        .select('email')
        .lean();
      usersMap = users.reduce((acc, user) => {
        acc[user._id.toString()] = user;
        return acc;
      }, {});
    }

    items.forEach((item) => {
      fields.forEach((field) => {
        if (item?.[field]) {
          const userId = item[field].toString();
          item[field] = usersMap[userId] || item[field];
        }
      });
    });

    return isArray ? items : items[0];
  }


  /**
   * Map Supplier data to billing address format
   */
  _mapSupplierToBillingAddress(supplier) {
    return {
      name: supplier.name || '',
      company: supplier.name || '',
      email: supplier.email || '',
      phone: supplier.phone || '',
      address1: supplier.address?.street || '',
      address2: '',
      city: supplier.address?.city || '',
      state: supplier.address?.state || '',
      country: supplier.address?.country || '',
      postalCode: supplier.address?.pincode || '',
      gstinOrVat: '',
      isDefault: true,
    };
  }

  /**
   * Map Supplier data to shipping address format
   */
  _mapSupplierToShippingAddress(supplier, shippingDetails = {}) {
    return {
      name: supplier.name || '',
      company: supplier.name || '',
      email: supplier.email || '',
      phone: supplier.phone || '',
      address1: shippingDetails.address1 || supplier.address?.street || '',
      address2: shippingDetails.address2 || '',
      city: shippingDetails.city || supplier.address?.city || '',
      state: shippingDetails.state || supplier.address?.state || '',
      country: shippingDetails.country || supplier.address?.country || '',
      postalCode: shippingDetails.postalCode || supplier.address?.pincode || '',
      gstinOrVat: '',
      isDefault: false,
    };
  }

  /**
   * Map Store data to delivery address format
   */
  _mapStoreToDeliveryAddress(store) {
    return {
      name: store.name || '',
      company: store.name || '',
      email: store.email || '',
      phone: store.contactNumber || '',
      address1: store.location?.address || '',
      address2: '',
      city: store.location?.city || '',
      state: store.location?.state || '',
      country: store.location?.country || '',
      postalCode: store.location?.postalCode || '',
      gstinOrVat: '',
      isDefault: true,
    };
  }

  async create(data, userId) {
    try {
      await this._ensureReferenceModels();

      const payload = { ...data };

      // Require orderDetails.storeId
      const storeId = payload?.orderDetails?.storeId;
      if (!storeId) {
        throw new Error('orderDetails.storeId is required');
      }
      this.validateObjectId(storeId);

      // Require supplier.supplierId
      const supplierId = payload?.supplier?.supplierId;
      if (!supplierId) {
        throw new Error('supplier.supplierId is required');
      }
      this.validateObjectId(supplierId);

      // Fetch Supplier
      const SupplierModel = await this.getModel('Supplier', SupplierSchema, 'suppliers');
      const supplier = await SupplierModel.findById(supplierId).lean();
      if (!supplier) {
        throw new Error(`Supplier with id ${supplierId} not found`);
      }

      // Validate supplier address
      if (!supplier.address || !supplier.address.pincode) {
        throw new Error(
          `Supplier "${supplier.name}" (${supplierId}) is missing postal code (pincode). Please update the supplier's address in the system before creating a purchase order.`,
        );
      }

      // Fetch Store
      const StoreModel = await this.getModel('Store', StoreSchema, 'stores');
      const store = await StoreModel.findById(storeId).lean();
      if (!store) {
        throw new Error(`Store with id ${storeId} not found`);
      }

      // Validate store location
      if (!store.location || !store.location.postalCode) {
        throw new Error(
          `Store "${store.name}" (${storeId}) is missing postal code. Please update the store's location in the system before creating a purchase order.`,
        );
      }

      // Map addresses
      const billingAddress = this._mapSupplierToBillingAddress(supplier);
      const deliveryAddress = this._mapStoreToDeliveryAddress(store);
      const shippingDetails = payload.shippingDetails || {};
      const shippingAddress = this._mapSupplierToShippingAddress(supplier, shippingDetails);

      if (!payload.supplier) payload.supplier = {};
      payload.supplier.billingAddress = billingAddress;
      payload.supplier.shippingAddress = shippingAddress;

      if (!payload.orderDetails) payload.orderDetails = {};
      payload.orderDetails.deliveryAddress = deliveryAddress;

      delete payload.shippingDetails;

      if (!payload.metadata) payload.metadata = {};
      if (!payload.metadata.fixedStoreId) {
        payload.metadata.fixedStoreId = storeId;
      }
      if (!payload.createdBy && userId) payload.createdBy = userId;

      payload.status = PO_STATUSES.DRAFT;

      if (!payload.orderDetails.poNumber) {
        payload.orderDetails.poNumber = this._generatePoNumber();
      }

      return await super.create(payload);
    } catch (error) {
      throw new Error(`Error creating purchase order: ${error.message}`);
    }
  }

  async updateById(id, data, userId) {
    try {
      await this._ensureReferenceModels();
      const updateData = { ...data };

      const needsAddressUpdate =
        updateData.supplier?.supplierId ||
        updateData.orderDetails?.storeId ||
        updateData.shippingDetails;

      if (needsAddressUpdate) {
        const Model = await this.getModelRef();
        const existing = await Model.findById(id).lean();
        if (!existing) {
          throw new Error(`Purchase order with id ${id} not found`);
        }

        const supplierId =
          updateData.supplier?.supplierId || existing.supplier?.supplierId;
        const storeId =
          updateData.orderDetails?.storeId || existing.orderDetails?.storeId;

        if (supplierId) {
          this.validateObjectId(supplierId);
          const SupplierModel = await this.getModel('Supplier', SupplierSchema, 'suppliers');
          const supplier = await SupplierModel.findById(supplierId).lean();
          if (!supplier) {
            throw new Error(`Supplier with id ${supplierId} not found`);
          }

          if (!updateData.supplier) updateData.supplier = {};
          updateData.supplier.billingAddress = this._mapSupplierToBillingAddress(supplier);

          const shippingDetails = updateData.shippingDetails || {};
          updateData.supplier.shippingAddress = this._mapSupplierToShippingAddress(supplier, shippingDetails);
        }

        if (storeId) {
          this.validateObjectId(storeId);
          const StoreModel = await this.getModel('Store', StoreSchema, 'stores');
          const store = await StoreModel.findById(storeId).lean();
          if (!store) {
            throw new Error(`Store with id ${storeId} not found`);
          }

          if (!updateData.orderDetails) updateData.orderDetails = {};
          updateData.orderDetails.deliveryAddress = this._mapStoreToDeliveryAddress(store);
        }

        delete updateData.shippingDetails;
      }

      if (userId) updateData.lastModifiedBy = userId;
      return await super.updateById(id, updateData);
    } catch (error) {
      throw new Error(`Error updating purchase order: ${error.message}`);
    }
  }

  /**
   * Get all purchase orders with optional filters and standardized structure
   */
  async getPurchaseOrders(queryParams = {}) {
    await this._ensureReferenceModels();

    const {
      page = 1,
      limit = 10,
      search = '',
      status,
      all,
    } = queryParams;

    // ✅ Allowed statuses
    const ALLOWED_STATUSES = ['Draft', 'Cancelled', 'Approved', 'Billed'];

    if (status && !ALLOWED_STATUSES.includes(status)) {
      throw new Error(
        `Invalid status. Allowed values: ${ALLOWED_STATUSES.join(', ')}`
      );
    }

    // ✅ Base filters
    const filters = this._buildPOFilters({ status });

    // ✅ Search filter
    if (typeof search === 'string' && search.trim()) {
      const term = search.trim();
      filters.$or = [
        { 'orderDetails.poNumber': { $regex: term, $options: 'i' } },
        { 'supplier.supplierName': { $regex: term, $options: 'i' } },
        { 'supplier.supplierCode': { $regex: term, $options: 'i' } },
      ];
    }

    const listParams = {
      filters,
      page,
      limit,
      populate: [
        { path: 'supplier.supplierId', select: 'name supplierCode' },
        { path: 'items.variants.variantId', select: 'variant' },
      ],
    };

    if (all === true || all === 'true') {
      delete listParams.page;
      delete listParams.limit;
    }

    const result = await super.list(listParams);

    const transformedRows = result.data.map((row) => {
      if (!Array.isArray(row.items)) return row;

      row.items = row.items.map((item) => {
        const { taxId, productId, ...cleanItem } = item;

        if (Array.isArray(cleanItem.variants)) {
          cleanItem.variants = cleanItem.variants.map((variant) => {
            const { variantId, variantName, ...rest } = variant;
            return {
              ...rest,
              variantName: variantId?.variant || variantName,
            };
          });
        }

        return cleanItem;
      });

      return row;
    });

    return {
      ...result,
      data: transformedRows,
    };
  }


  // Backward compatibility alias
  async list(queryParams = {}) {
    return this.getPurchaseOrders(queryParams);
  }

  async bulkGetPurchaseOrders(ids, options = {}) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('IDs array is required and must not be empty');
      }

      const normalizedIds = ids.map((id) => {
        const normalized = typeof id === 'string' ? id.trim() : id?.toString?.();
        if (!normalized) throw new Error('Invalid ID format');
        this.validateObjectId(normalized);
        return normalized;
      });

      const { lean = true, throwOnNotFound = false } = options;

      await this._ensureReferenceModels();

      const result = await super.bulkGetByIds(normalizedIds, {
        lean,
        throwOnNotFound,
        populate: [
          { path: 'supplier.supplierId', select: 'name supplierCode' },
          { path: 'items.productId', select: 'productName' },
          { path: 'items.unitId', select: 'name' },
          { path: 'items.taxId', select: 'name rate' },
          { path: 'items.variants.variantId', select: 'variant' },
        ],
      });

      const documents = result.documents;

      // Extract all user IDs for batch population (Optimization)
      const userIds = new Set();
      documents.forEach((doc) => {
        if (doc.createdBy) userIds.add(doc.createdBy.toString());
        if (doc.lastModifiedBy) userIds.add(doc.lastModifiedBy.toString());
        if (doc.approvedBy) userIds.add(doc.approvedBy.toString());
      });

      if (userIds.size > 0) {
        if (!this._userModel) {
          const { User } = await import('../models/index.js');
          this._userModel = User;
        }

        const users = await this._userModel
          .find({ _id: { $in: Array.from(userIds) } })
          .select('name email')
          .lean();

        const userMap = new Map(users.map((user) => [user._id.toString(), user]));

        documents.forEach((doc) => {
          if (doc.createdBy && userMap.has(doc.createdBy.toString())) {
            doc.createdBy = userMap.get(doc.createdBy.toString());
          }
          if (doc.lastModifiedBy && userMap.has(doc.lastModifiedBy.toString())) {
            doc.lastModifiedBy = userMap.get(doc.lastModifiedBy.toString());
          }
          if (doc.approvedBy && userMap.has(doc.approvedBy.toString())) {
            doc.approvedBy = userMap.get(doc.approvedBy.toString());
          }
        });
      }

      return {
        data: documents,
        found: result.found,
        notFound: result.notFound,
        totalRequested: result.totalRequested,
      };
    } catch (error) {
      throw new Error(`Bulk get purchase orders failed: ${error.message}`);
    }
  }

  async getByIdWithDetails(id) {
    try {
      await this._ensureReferenceModels();
      const Model = await this.getModelRef();

      const doc = await Model.findById(id)
        .select('-__v')
        .populate('supplier.supplierId', 'name supplierCode')
        .populate('items.productId', 'productName')
        .populate('items.unitId', 'name')
        .populate('items.taxId', 'name rate')
        .populate('items.variants.variantId', 'variant')
        .lean();

      if (!doc) {
        throw new Error(`Document with id ${id} not found`);
      }

      // Optimize User population
      const userIds = [doc.createdBy, doc.lastModifiedBy, doc.approvedBy].filter(Boolean);

      if (userIds.length > 0) {
        if (!this._userModel) {
          const { User } = await import('../models/index.js');
          this._userModel = User;
        }

        const users = await this._userModel
          .find({ _id: { $in: userIds } })
          .select('name email')
          .lean();

        const userMap = new Map(users.map((user) => [user._id.toString(), user]));

        if (doc.createdBy && userMap.has(doc.createdBy.toString())) {
          doc.createdBy = userMap.get(doc.createdBy.toString());
        }
        if (doc.lastModifiedBy && userMap.has(doc.lastModifiedBy.toString())) {
          doc.lastModifiedBy = userMap.get(doc.lastModifiedBy.toString());
        }
        if (doc.approvedBy && userMap.has(doc.approvedBy.toString())) {
          doc.approvedBy = userMap.get(doc.approvedBy.toString());
        }
      }

      return doc;
    } catch (error) {
      throw new Error(`Error retrieving purchase order: ${error.message}`);
    }
  }

  /**
 * PURCHASE REPORT
 * Status based: BILLED / RECEIVED / PARTIALLY_RECEIVED
 */
  async generatePurchaseReport(filters = {}) {
    await this._ensureReferenceModels();

    const {
      status, // ✅ optional now
      includeDeleted = false, // ✅ new

      fromDate,
      toDate,
      minAmount = 0,
      maxAmount,

      categoryId,
      subCategoryId,
      productId,
      variantId,

      categoryName,
      subCategoryName,
      productName,
      variantName,
      storeName,

      page = 1,
      limit = 10,
    } = filters;

    const pageNum = Math.max(Number(page), 1);
    const limitNum = Math.max(Number(limit), 1);
    const skip = (pageNum - 1) * limitNum;

    const Model = await this.getModelRef();

    /** ---------------------------
     * VALIDATION
     * --------------------------- */
    if (fromDate && toDate && new Date(fromDate) > new Date(toDate)) {
      throw new Error('fromDate cannot be greater than toDate');
    }

    /** ---------------------------
     * BASE MATCH (FIXED ✅)
     * --------------------------- */
    const matchStage = {
      ...(includeDeleted ? {} : { isDeleted: false }),
      ...(Array.isArray(status) && status.length
        ? { status: { $in: status } }
        : {}),
    };

    if (fromDate || toDate) {
      matchStage['orderDetails.purchaseDate'] = {};
      if (fromDate)
        matchStage['orderDetails.purchaseDate'].$gte = new Date(fromDate);
      if (toDate)
        matchStage['orderDetails.purchaseDate'].$lte = new Date(toDate);
    }

    /** ---------------------------
     * AGGREGATION PIPELINE
     * --------------------------- */
    const pipeline = [
      { $match: matchStage },

      /** Store */
      {
        $lookup: {
          from: 'stores',
          localField: 'orderDetails.storeId',
          foreignField: '_id',
          as: 'store',
        },
      },
      { $unwind: { path: '$store', preserveNullAndEmptyArrays: true } },

      /** Items */
      { $unwind: '$items' },

      /** Product */
      {
        $lookup: {
          from: 'products',
          localField: 'items.productId',
          foreignField: '_id',
          as: 'product',
        },
      },
      { $unwind: '$product' },

      /** Category */
      {
        $lookup: {
          from: 'productcategories',
          localField: 'product.category',
          foreignField: '_id',
          as: 'category',
        },
      },
      { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },

      /** Sub Category */
      {
        $lookup: {
          from: 'productsubcategories',
          localField: 'product.subCategory',
          foreignField: '_id',
          as: 'subCategory',
        },
      },
      { $unwind: { path: '$subCategory', preserveNullAndEmptyArrays: true } },

      /** Variant */
      {
        $lookup: {
          from: 'variants',
          localField: 'items.variants.variantId',
          foreignField: '_id',
          as: 'variant',
        },
      },
      { $unwind: { path: '$variant', preserveNullAndEmptyArrays: true } },
    ];

    /** ---------------------------
     * OPTIONAL FILTERS (ID)
     * --------------------------- */
    if (categoryId)
      pipeline.push({ $match: { 'category._id': new mongoose.Types.ObjectId(categoryId) } });

    if (subCategoryId)
      pipeline.push({ $match: { 'subCategory._id': new mongoose.Types.ObjectId(subCategoryId) } });

    if (productId)
      pipeline.push({ $match: { 'product._id': new mongoose.Types.ObjectId(productId) } });

    if (variantId)
      pipeline.push({ $match: { 'variant._id': new mongoose.Types.ObjectId(variantId) } });

    /** ---------------------------
     * OPTIONAL FILTERS (NAME)
     * --------------------------- */
    if (categoryName)
      pipeline.push({ $match: { 'category.name': { $regex: categoryName, $options: 'i' } } });

    if (subCategoryName)
      pipeline.push({ $match: { 'subCategory.name': { $regex: subCategoryName, $options: 'i' } } });

    if (productName)
      pipeline.push({
        $match: { 'product.productName': { $regex: productName, $options: 'i' } },
      });

    if (variantName)
      pipeline.push({
        $match: { 'variant.variant': { $regex: variantName, $options: 'i' } },
      });

    if (storeName)
      pipeline.push({ $match: { 'store.name': { $regex: storeName, $options: 'i' } } });

    /** ---------------------------
     * COMPUTED FIELDS
     * --------------------------- */
    pipeline.push({
      $addFields: {
        purchaseQty: {
          $cond: [
            { $gt: ['$items.receivedQuantity', 0] },
            '$items.receivedQuantity',
            '$items.quantity',
          ],
        },
        purchaseAmount: {
          $multiply: [
            {
              $cond: [
                { $gt: ['$items.receivedQuantity', 0] },
                '$items.receivedQuantity',
                '$items.quantity',
              ],
            },
            '$items.unitPrice',
          ],
        },
      },
    });

    /** ---------------------------
     * AMOUNT FILTER
     * --------------------------- */
    pipeline.push({
      $match: {
        purchaseAmount: {
          $gte: minAmount,
          ...(maxAmount !== undefined ? { $lte: maxAmount } : {}),
        },
      },
    });

    /** ---------------------------
     * FACET (DATA + SUMMARY)
     * --------------------------- */
    pipeline.push({
      $facet: {
        data: [
          { $sort: { 'orderDetails.purchaseDate': -1 } },
          { $skip: skip },
          { $limit: limitNum },
          {
            $project: {
              poNumber: '$orderDetails.poNumber',
              supplierName: '$supplier.supplierName',
              storeName: '$store.name',
              purchaseDate: '$orderDetails.purchaseDate',
              status: 1,
              category: '$category.name',
              subCategory: '$subCategory.name',
              productName: '$product.productName',
              variantName: {
                $cond: ['$items.hasVariation', '$variant.variant', null],
              },
              purchaseQty: 1,
              unitCost: '$items.unitPrice',
              purchaseAmount: 1,
            },
          },
        ],
        summary: [
          {
            $group: {
              _id: null,
              totalPurchaseQty: { $sum: '$purchaseQty' },
              totalPurchaseAmount: { $sum: '$purchaseAmount' },
              totalRecords: { $sum: 1 },
            },
          },
        ],
      },
    });

    const result = await Model.aggregate(pipeline);

    const summary = result[0]?.summary[0] || {
      totalPurchaseQty: 0,
      totalPurchaseAmount: 0,
      totalRecords: 0,
    };

    return {
      filters,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalRecords: summary.totalRecords,
        totalPages: Math.ceil(summary.totalRecords / limitNum),
      },
      summary: {
        totalPurchaseQty: summary.totalPurchaseQty,
        totalPurchaseAmount: summary.totalPurchaseAmount,
      },
      data: result[0]?.data || [],
    };
  }

  /**
   * PURCHASE REPORT DATA (Status: Approved & Billed Only)
   * Returns purchase report data with unit price and purchase amount totals
   * Includes advanced filtering options
   */
  async getPurchaseReportData(filters = {}) {
    await this._ensureReferenceModels();

    const {
      // Store filter
      storeId,
      storeName,

      // Status filter (Approved, Billed, or both if not specified)
      status,

      // Category & Product filters
      categoryId,
      subCategoryId,
      productId,
      variantId,

      categoryName,
      subCategoryName,
      productName,
      variantName,

      // Date range filters
      dateFrom,
      dateTo,

      // Range filters
      minPurchaseQty = 0,
      maxPurchaseQty,
      minPurchaseAmount = 0,
      maxPurchaseAmount,

      // Search
      search = '',

      // Pagination
      page = 1,
      limit = 10,
    } = filters;

    const pageNum = Math.max(Number(page), 1);
    const limitNum = Math.max(Number(limit), 1);
    const skip = (pageNum - 1) * limitNum;

    const Model = await this.getModelRef();

    /** ---------------------------
     * VALIDATION
     * --------------------------- */
    if (dateFrom && dateTo && new Date(dateFrom) > new Date(dateTo)) {
      throw new Error('dateFrom cannot be greater than dateTo');
    }

    /** ---------------------------
     * BASE MATCH - Handle Status Filter
     * --------------------------- */
    const matchStage = {
      isDeleted: false,
    };

    // Handle status filter: Approved, Billed, or both (default)
    const validStatuses = [PO_STATUSES.APPROVED, PO_STATUSES.BILLED];
    if (status && status !== 'undefined' && validStatuses.includes(status)) {
      // Filter by specific status
      matchStage.status = status;
    } else {
      // Default: show both Approved and Billed
      matchStage.status = { $in: validStatuses };
    }

    // Date range filter
    if (dateFrom || dateTo) {
      matchStage['orderDetails.purchaseDate'] = {};
      if (dateFrom)
        matchStage['orderDetails.purchaseDate'].$gte = new Date(dateFrom);
      if (dateTo)
        matchStage['orderDetails.purchaseDate'].$lte = new Date(dateTo);
    }


    /** ---------------------------
     * AGGREGATION PIPELINE
     * --------------------------- */
    const pipeline = [
      { $match: matchStage },

      /** Store Lookup */
      {
        $lookup: {
          from: 'stores',
          localField: 'orderDetails.storeId',
          foreignField: '_id',
          as: 'store',
        },
      },
      { $unwind: { path: '$store', preserveNullAndEmptyArrays: true } },

      /** Unwind Items */
      { $unwind: '$items' },

      /** Product Lookup */
      {
        $lookup: {
          from: 'products',
          localField: 'items.productId',
          foreignField: '_id',
          as: 'product',
        },
      },
      { $unwind: '$product' },

      /** Category Lookup */
      {
        $lookup: {
          from: 'productcategories',
          localField: 'product.category',
          foreignField: '_id',
          as: 'category',
        },
      },
      { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },

      /** Sub Category Lookup */
      {
        $lookup: {
          from: 'productsubcategories',
          localField: 'product.subCategory',
          foreignField: '_id',
          as: 'subCategory',
        },
      },
      { $unwind: { path: '$subCategory', preserveNullAndEmptyArrays: true } },

      /** Variant Lookup */
      {
        $lookup: {
          from: 'variants',
          localField: 'items.variants.variantId',
          foreignField: '_id',
          as: 'variant',
        },
      },
      { $unwind: { path: '$variant', preserveNullAndEmptyArrays: true } },
    ];

    /** ---------------------------
     * STORE FILTER (skip if undefined or 'undefined' string)
     * --------------------------- */
    if (storeId && storeId !== 'undefined') {
      pipeline.push({ $match: { 'store._id': new mongoose.Types.ObjectId(storeId) } });
    }
    if (storeName && storeName !== 'undefined') {
      pipeline.push({ $match: { 'store.name': { $regex: storeName, $options: 'i' } } });
    }


    /** ---------------------------
     * OPTIONAL FILTERS (ID-based)
     * --------------------------- */
    if (categoryId)
      pipeline.push({ $match: { 'category._id': new mongoose.Types.ObjectId(categoryId) } });

    if (subCategoryId)
      pipeline.push({ $match: { 'subCategory._id': new mongoose.Types.ObjectId(subCategoryId) } });

    if (productId)
      pipeline.push({ $match: { 'product._id': new mongoose.Types.ObjectId(productId) } });

    if (variantId)
      pipeline.push({ $match: { 'variant._id': new mongoose.Types.ObjectId(variantId) } });

    /** ---------------------------
     * OPTIONAL FILTERS (NAME-based)
     * --------------------------- */
    if (categoryName)
      pipeline.push({ $match: { 'category.name': { $regex: categoryName, $options: 'i' } } });

    if (subCategoryName)
      pipeline.push({ $match: { 'subCategory.name': { $regex: subCategoryName, $options: 'i' } } });

    if (productName)
      pipeline.push({
        $match: { 'product.productName': { $regex: productName, $options: 'i' } },
      });

    if (variantName)
      pipeline.push({
        $match: { 'variant.variant': { $regex: variantName, $options: 'i' } },
      });

    /** ---------------------------
     * SEARCH FILTER
     * --------------------------- */
    if (search && typeof search === 'string' && search.trim()) {
      const term = search.trim();
      pipeline.push({
        $match: {
          $or: [
            { 'product.productName': { $regex: term, $options: 'i' } },
            { 'category.name': { $regex: term, $options: 'i' } },
            { 'subCategory.name': { $regex: term, $options: 'i' } },
            { 'variant.variant': { $regex: term, $options: 'i' } },
            { 'store.name': { $regex: term, $options: 'i' } },
            { 'orderDetails.poNumber': { $regex: term, $options: 'i' } },
          ],
        },
      });
    }

    /** ---------------------------
     * COMPUTED FIELDS
     * --------------------------- */
    pipeline.push({
      $addFields: {
        purchaseQty: {
          $cond: [
            { $gt: ['$items.receivedQuantity', 0] },
            '$items.receivedQuantity',
            '$items.quantity',
          ],
        },
        unitPrice: '$items.unitPrice',
        purchaseAmount: {
          $multiply: [
            {
              $cond: [
                { $gt: ['$items.receivedQuantity', 0] },
                '$items.receivedQuantity',
                '$items.quantity',
              ],
            },
            '$items.unitPrice',
          ],
        },
      },
    });

    /** ---------------------------
     * QUANTITY RANGE FILTER
     * --------------------------- */
    const qtyRangeMatch = {};
    if (minPurchaseQty !== undefined && minPurchaseQty > 0) {
      qtyRangeMatch.$gte = Number(minPurchaseQty);
    }
    if (maxPurchaseQty !== undefined) {
      qtyRangeMatch.$lte = Number(maxPurchaseQty);
    }
    if (Object.keys(qtyRangeMatch).length > 0) {
      pipeline.push({ $match: { purchaseQty: qtyRangeMatch } });
    }

    /** ---------------------------
     * AMOUNT RANGE FILTER
     * --------------------------- */
    const amountRangeMatch = {};
    if (minPurchaseAmount !== undefined && minPurchaseAmount > 0) {
      amountRangeMatch.$gte = Number(minPurchaseAmount);
    }
    if (maxPurchaseAmount !== undefined) {
      amountRangeMatch.$lte = Number(maxPurchaseAmount);
    }
    if (Object.keys(amountRangeMatch).length > 0) {
      pipeline.push({ $match: { purchaseAmount: amountRangeMatch } });
    }

    /** ---------------------------
     * FACET (DATA + SUMMARY)
     * --------------------------- */
    pipeline.push({
      $facet: {
        data: [
          { $sort: { 'orderDetails.purchaseDate': -1 } },
          { $skip: skip },
          { $limit: limitNum },
          {
            $project: {
              _id: 1,
              poNumber: '$orderDetails.poNumber',
              purchaseDate: '$orderDetails.purchaseDate',
              storeName: '$store.name',
              storeId: '$store._id',
              productName: '$product.productName',
              productId: '$product._id',
              category: '$category.name',
              categoryId: '$category._id',
              subCategory: '$subCategory.name',
              subCategoryId: '$subCategory._id',
              variantName: {
                $cond: ['$items.hasVariation', '$variant.variant', null],
              },
              variantId: {
                $cond: ['$items.hasVariation', '$variant._id', null],
              },
              purchaseQty: 1,
              unitPrice: 1,
              purchaseAmount: 1,
              paymentMethod: '$orderDetails.paymentMethod',
              status: 1,
              supplierName: '$supplier.supplierName',
            },
          },
        ],
        summary: [
          {
            $group: {
              _id: null,
              totalPurchaseQty: { $sum: '$purchaseQty' },
              totalUnitPrice: { $sum: '$unitPrice' },
              totalPurchaseAmount: { $sum: '$purchaseAmount' },
              totalRecords: { $sum: 1 },
            },
          },
        ],
      },
    });

    const result = await Model.aggregate(pipeline);

    const summary = result[0]?.summary[0] || {
      totalPurchaseQty: 0,
      totalUnitPrice: 0,
      totalPurchaseAmount: 0,
      totalRecords: 0,
    };

    return {
      filters: {
        storeId,
        storeName,
        status,
        categoryId,
        subCategoryId,
        productId,
        variantId,
        categoryName,
        subCategoryName,
        productName,
        variantName,
        dateFrom,
        dateTo,
        minPurchaseQty,
        maxPurchaseQty,
        minPurchaseAmount,
        maxPurchaseAmount,
        search,
      },

      pagination: {
        page: pageNum,
        limit: limitNum,
        totalRecords: summary.totalRecords,
        totalPages: Math.ceil(summary.totalRecords / limitNum),
      },
      summary: {
        totalPurchaseQty: summary.totalPurchaseQty,
        totalUnitPrice: summary.totalUnitPrice,
        totalPurchaseAmount: summary.totalPurchaseAmount,
      },
      data: result[0]?.data || [],
    };
  }



  _buildReceiveLogEntry(doc, receiveLogData, resolvedStoreId) {
    const poItemMap = new Map();
    for (const item of doc.items || []) {
      if (item.hasVariation && Array.isArray(item.variants)) {
        for (const v of item.variants) {
          const key = `${String(item.productId)}|${String(v.variantId || '')}`;
          poItemMap.set(key, {
            purchaseOrderItemId: item._id,
            variantId: v.variantId,
            unitCost: v.unitCost || item.unitCost || 0,
            discountPerUnit: v.discountPerUnit || item.discountPerUnit || 0,
            taxRatePercent: v.taxRatePercent || item.taxRatePercent || 0,
            lineSubtotal: v.lineSubtotal || item.lineSubtotal || 0,
            lineTotal: v.lineTotal || item.lineTotal || 0,
            batchNumber: v.batchNumber || item.batchNumber || undefined,
            expiryDate: v.expiryDate || item.expiryDate || undefined,
          });
        }
      } else {
        const key = `${String(item.productId)}|`;
        poItemMap.set(key, {
          purchaseOrderItemId: item._id,
          unitCost: item.unitCost || 0,
          discountPerUnit: item.discountPerUnit || 0,
          taxRatePercent: item.taxRatePercent || 0,
          lineSubtotal: item.lineSubtotal || 0,
          lineTotal: item.lineTotal || 0,
          batchNumber: item.batchNumber || undefined,
          expiryDate: item.expiryDate || undefined,
        });
      }
    }

    const receiveItems = (receiveLogData.items || []).map((it) => {
      const key = `${String(it.productId)}|${it.variantId ? String(it.variantId) : ''}`;
      const poItem = poItemMap.get(key);
      const quantity = Number(it.quantity) || 0;

      const unitCost = poItem?.unitCost || it.unitCost || 0;
      const discountPerUnit = poItem?.discountPerUnit || 0;
      const taxRatePercent = poItem?.taxRatePercent || 0;
      const subtotal = (unitCost - discountPerUnit) * quantity;
      const taxAmount = (subtotal * taxRatePercent) / 100;
      const lineTotal = subtotal + taxAmount;

      return {
        productId: it.productId,
        variantId: it.variantId || undefined,
        SKU: it.SKU || undefined,
        quantity: quantity,
        purchaseOrderItemId: poItem?.purchaseOrderItemId || undefined,
        unitCost: unitCost,
        discountPerUnit: discountPerUnit,
        taxRatePercent: taxRatePercent,
        lineSubtotal: subtotal,
        taxAmount: taxAmount,
        lineTotal: lineTotal,
        batchNumber: it.batchNumber || poItem?.batchNumber || undefined,
        expiryDate: it.expiryDate || poItem?.expiryDate || undefined,
        note: it.note || undefined,
      };
    });

    const totalReceivedAmount = receiveItems.reduce(
      (sum, item) => sum + (item.lineTotal || 0),
      0,
    );

    const receiveLog = {
      receivedAt: new Date(),
      receivedBy: receiveLogData.receivedBy,
      storeId: resolvedStoreId,
      items: receiveItems,
      note: receiveLogData.note || undefined,
      totalReceivedAmount: totalReceivedAmount,
      purchaseOrderStatus: doc.status,
      purchaseOrderPoNumber: doc.orderDetails?.poNumber || undefined,
      supplierId: doc.supplier?.supplierId || undefined,
    };

    return receiveLog;
  }

  static isValidStatusTransition(current, next) {
    if (current === next) return true;
    const allowed = PO_STATUS_TRANSITIONS[current];
    return allowed ? allowed.has(next) : false;
  }

  async changeStatus(id, nextStatus, options = {}) {
    // Execute transaction and capture result
    const updatedDoc = await this.executeTenantTransaction(async (session) => {
      const Model = await this.getModelRef();
      const doc = await Model.findById(id).session(session);
      if (!doc) throw new Error(`Document with id ${id} not found`);
      if (doc.isDeleted) throw new Error('Cannot change status of a deleted document');

      const allowedStatuses = Model.schema.path('status').options.enum || [];
      if (!allowedStatuses.includes(nextStatus)) {
        throw new Error(`Invalid status: ${nextStatus}`);
      }

      if (!PurchaseOrderServices.isValidStatusTransition(doc.status, nextStatus)) {
        throw new Error(`Invalid status transition: ${doc.status} -> ${nextStatus}`);
      }

      const actorUserId = options.actorUserId || options.userId || undefined;
      if (actorUserId) {
        doc.lastModifiedBy = actorUserId;
      }

      let inventoryHelper = null;
      const ensureInventoryHelper = async () => {
        if (inventoryHelper) return inventoryHelper;
        const [
          StockModel,
          StockBatchModel,
          ProductModel,
          ProductCategoryModel,
        ] = await Promise.all([
          this.getModel('Stock', StockSchema, 'stocks'),
          this._stockBatchService.getModel(),
          this.getModel('Product', ProductSchema, 'products'),
          this.getModel('ProductCategory', ProductCategorySchema, 'productcategories'),
        ]);
        inventoryHelper = this._createInventoryHelper({
          StockModel,
          StockBatchModel,
          ProductModel,
          ProductCategoryModel,
          session,
        });
        return inventoryHelper;
      };

      if (nextStatus === PO_STATUSES.APPROVED) {
        if (!actorUserId) throw new Error('actorUserId is required to approve');
        doc.approvedBy = actorUserId;
        doc.approvedAt = new Date();
      }

      if (options.receiveLog) {
        const rl = options.receiveLog;
        if (!rl.receivedBy) throw new Error('receiveLog.receivedBy is required');

        const existingFixedId = (doc.metadata && typeof doc.metadata.get === 'function'
          ? doc.metadata.get('fixedStoreId')
          : doc.metadata?.fixedStoreId) || null;
        const resolvedStoreId = rl.storeId || existingFixedId;
        if (!resolvedStoreId) throw new Error('storeId is required');

        if (!Array.isArray(rl.items) || rl.items.length === 0) {
          throw new Error('receiveLog.items must be a non-empty array');
        }

        const receiveLog = this._buildReceiveLogEntry(doc, rl, resolvedStoreId);
        if (options.note) {
          receiveLog.note = options.note;
        }

        if (!doc.metadata) doc.metadata = new Map();
        const fixedStoreId = doc.metadata.get('fixedStoreId');
        if (fixedStoreId && String(fixedStoreId) !== String(receiveLog.storeId)) {
          throw new Error('This purchase order is locked to another store for receiving');
        }
        if (!fixedStoreId) doc.metadata.set('fixedStoreId', receiveLog.storeId);

        doc.receiveLogs = doc.receiveLogs || [];
        doc.receiveLogs.push(receiveLog);
        doc.markModified('receiveLogs');

        const incById = new Map();
        for (const it of receiveLog.items) {
          const key = `${String(it.productId)}|${it.variantId ? String(it.variantId) : ''}`;
          incById.set(key, (incById.get(key) || 0) + (Number(it.quantity) || 0));
        }

        for (const item of doc.items || []) {
          if (item.hasVariation && Array.isArray(item.variants)) {
            for (const v of item.variants) {
              const k = `${String(item.productId)}|${String(v.variantId || '')}`;
              const inc = incById.get(k) || 0;
              if (inc > 0) {
                v.receivedQuantity = Math.max(0, Number(v.receivedQuantity || 0) + inc);
              }
            }
          } else {
            const k = `${String(item.productId)}|`;
            const inc = incById.get(k) || 0;
            if (inc > 0) {
              item.receivedQuantity = Math.max(0, Number(item.receivedQuantity || 0) + inc);
            }
          }
        }

        const totals = { qty: 0, received: 0 };
        for (const item of doc.items || []) {
          if (item.hasVariation && Array.isArray(item.variants)) {
            for (const v of item.variants) {
              totals.qty += Number(v.quantity) || 0;
              totals.received += Number(v.receivedQuantity) || 0;
            }
          } else {
            totals.qty += Number(item.quantity) || 0;
            totals.received += Number(item.receivedQuantity) || 0;
          }
        }

        if (totals.qty > 0) {
          const fullyReceived = totals.received >= totals.qty;
          const partiallyReceived = totals.received > 0 && totals.received < totals.qty;
          if (nextStatus === PO_STATUSES.RECEIVED && !fullyReceived) {
            nextStatus = PO_STATUSES.PARTIALLY_RECEIVED;
          } else if (nextStatus === PO_STATUSES.PARTIALLY_RECEIVED && fullyReceived) {
            nextStatus = PO_STATUSES.RECEIVED;
          }
          if (partiallyReceived && ![PO_STATUSES.PARTIALLY_RECEIVED, PO_STATUSES.RECEIVED].includes(nextStatus)) {
            nextStatus = PO_STATUSES.PARTIALLY_RECEIVED;
          }
        }

        const inventory = await ensureInventoryHelper();
        const variantSkuByIds = new Map();
        for (const li of doc.items || []) {
          if (li.hasVariation && Array.isArray(li.variants)) {
            for (const v of li.variants) {
              if (v?.variantId && v?.SKU) {
                variantSkuByIds.set(`${String(li.productId)}|${String(v.variantId)}`, v.SKU);
              }
            }
          }
        }

        for (const it of receiveLog.items) {
          const qty = Number(it.quantity) || 0;
          if (qty <= 0) continue;

          let sku = it.SKU || null;
          if (!sku && it.variantId) {
            sku = variantSkuByIds.get(`${String(it.productId)}|${String(it.variantId)}`) || null;
          }
          if (!sku) {
            const prod = await inventory.loadProduct(it.productId);
            sku = prod?.SKU || null;
          }
          if (!sku) continue;

          await inventory.increment({
            productId: it.productId,
            storeId: receiveLog.storeId,
            sku,
            quantity: qty,
            userId: receiveLog.receivedBy,
            expiryDate: it.expiryDate,
            unitCost: it.unitCost,
            note: it.note,
            sourceDocumentId: doc._id,
            supplierId: doc.supplier?.supplierId,
            businessId: doc.businessId,
          });
        }
      }

      doc.status = nextStatus;

      if (nextStatus === PO_STATUSES.BILLED) {
        const storeId = doc.orderDetails?.storeId ||
          (doc.metadata && typeof doc.metadata.get === 'function' ? doc.metadata.get('fixedStoreId') : doc.metadata?.fixedStoreId);

        if (!storeId) {
          throw new Error('Store ID is required to bill the purchase order');
        }

        const inventory = await ensureInventoryHelper();
        const variantSkuByIds = new Map();
        for (const li of doc.items || []) {
          if (li.hasVariation && Array.isArray(li.variants)) {
            for (const v of li.variants) {
              if (v?.variantId && v?.SKU) {
                variantSkuByIds.set(`${String(li.productId)}|${String(v.variantId)}`, v.SKU);
              }
            }
          }
        }

        for (const item of doc.items || []) {
          if (item.hasVariation && Array.isArray(item.variants)) {
            for (const variant of item.variants) {
              const qty = Number(variant.quantity) || 0;
              if (qty <= 0) continue;

              let sku = variant.SKU || null;
              if (!sku) {
                sku = variantSkuByIds.get(`${String(item.productId)}|${String(variant.variantId)}`) || null;
              }
              if (!sku) {
                const prod = await inventory.loadProduct(item.productId);
                sku = prod?.SKU || null;
              }
              if (!sku) continue;

              await inventory.increment({
                productId: item.productId,
                storeId,
                sku,
                quantity: qty,
                userId: actorUserId || doc.lastModifiedBy || doc.createdBy,
                expiryDate: variant.expiryDate,
                unitCost: variant.unitCost || item.unitCost,
                note: variant.note || item.note,
                sourceDocumentId: doc._id,
                supplierId: doc.supplier?.supplierId,
                businessId: doc.businessId,
              });
            }
          } else {
            const qty = Number(item.quantity) || 0;
            if (qty <= 0) continue;

            let sku = item.SKU || null;
            if (!sku) {
              const prod = await inventory.loadProduct(item.productId);
              sku = prod?.SKU || null;
            }
            if (!sku) continue;

            await inventory.increment({
              productId: item.productId,
              storeId,
              sku,
              quantity: qty,
              userId: actorUserId || doc.lastModifiedBy || doc.createdBy,
              expiryDate: item.expiryDate,
              unitCost: item.unitCost,
              note: item.note,
              sourceDocumentId: doc._id,
              supplierId: doc.supplier?.supplierId,
              businessId: doc.businessId,
            });
          }
        }

        if (doc.totals) {
          const gt = Number(doc.totals.grandTotal || 0);
          let newAmountPaid = Number(doc.totals.amountPaid || 0);

          if (options.amountPaid !== undefined) {
            newAmountPaid = Math.max(0, Number(options.amountPaid));
          } else if (options.paymentAmount !== undefined) {
            const paymentAmount = Math.max(0, Number(options.paymentAmount));
            newAmountPaid = Math.max(0, newAmountPaid + paymentAmount);
          }

          newAmountPaid = Math.min(newAmountPaid, gt);
          const calculatedBalanceDue = Math.max(0, gt - newAmountPaid);

          if (!doc.totals) doc.totals = {};
          doc.totals.amountPaid = newAmountPaid;
          doc.totals.balanceDue = calculatedBalanceDue;
          doc.markModified('totals');
        }
      }

      // Generate invoice if moving to BILLED status and not already present
      if (nextStatus === PO_STATUSES.BILLED) {
        if (!doc.externalInvoice || !doc.externalInvoice.number) {
          doc.externalInvoice = {
            number: this._generateInvoiceNumber(),
            date: new Date(),
            source: 'System Generated',
            ...(doc.externalInvoice || {})
          };
          doc.markModified('externalInvoice');
        }
      }

      await doc.validate();

      if (nextStatus === PO_STATUSES.BILLED && doc.totals) {
        const gt = Number(doc.totals.grandTotal || 0);
        const amountPaidAfterValidation = Number(doc.totals.amountPaid || 0);
        const correctBalanceDue = Math.max(0, gt - amountPaidAfterValidation);
        if (doc.totals.balanceDue !== correctBalanceDue) {
          doc.totals.balanceDue = correctBalanceDue;
          doc.markModified('totals');
        }
      }

      await doc.save({ session });
      return doc.toObject();
    });

    // Trigger email asynchronously after successful transaction
    if (
      updatedDoc &&
      [
        PO_STATUSES.APPROVED,
        PO_STATUSES.BILLED,
        PO_STATUSES.CANCELLED,
      ].includes(nextStatus)
    ) {
      this._dispatchPurchaseOrderNotifications({
        purchaseOrder: updatedDoc,
        notificationOptions: {
          sendEmail: true,
          templateLabel: DEFAULT_PO_TEMPLATE_LABEL,
          recipientType: 'supplier',
        },
      }).catch((err) => {
        console.error(
          `Failed to dispatch PO status notification for ${updatedDoc.orderDetails.poNumber}:`,
          err,
        );
      });
    }

    return updatedDoc;
  }

  async updateStatus(id, nextStatus, options = {}) {
    return this.changeStatus(id, nextStatus, options);
  }

  async generateInvoice(id, userId) {
    return await this.executeTenantTransaction(async (session) => {
      const Model = await this.getModelRef();
      const doc = await Model.findById(id).session(session);
      if (!doc) throw new Error(`Document with id ${id} not found`);
      if (doc.isDeleted) throw new Error('Cannot generate invoice for a deleted document');

      if (doc.status !== PO_STATUSES.BILLED) {
        throw new Error(`Invoice can only be generated for Billed purchase orders. Current status: ${doc.status}`);
      }

      if (doc.externalInvoice && doc.externalInvoice.number) {
        // Invoice already exists, return current doc
        return doc.toObject();
      }

      doc.externalInvoice = {
        number: this._generateInvoiceNumber(),
        date: new Date(),
        source: 'System Generated',
        ...(doc.externalInvoice || {})
      };

      if (userId) doc.lastModifiedBy = userId;

      doc.markModified('externalInvoice');
      await doc.save({ session });
      return doc.toObject();
    });
  }

  async recordPayment(id, paymentAmount, userId, note) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const Model = await this.getModelRef();
      const doc = await Model.findById(id).session(session);
      if (!doc) throw new Error(`Document with id ${id} not found`);
      if (doc.isDeleted) throw new Error('Cannot record payment on a deleted document');
      if (doc.status !== PO_STATUSES.BILLED) {
        throw new Error(`Payment can only be recorded on Billed purchase orders. Current status: ${doc.status}`);
      }

      const payment = Math.max(0, Number(paymentAmount) || 0);
      if (payment <= 0) {
        throw new Error('Payment amount must be greater than 0');
      }

      const gt = Number(doc.totals?.grandTotal || 0);
      const currentPaid = Number(doc.totals?.amountPaid || 0);
      const newAmountPaid = Math.min(currentPaid + payment, gt);
      const calculatedBalanceDue = Math.max(0, gt - newAmountPaid);

      if (!doc.totals) doc.totals = {};
      doc.totals.amountPaid = newAmountPaid;
      doc.totals.balanceDue = calculatedBalanceDue;
      doc.markModified('totals');

      if (userId) doc.lastModifiedBy = userId;

      if (!doc.metadata) doc.metadata = new Map();
      const paymentHistory = doc.metadata.get('paymentHistory') || [];
      paymentHistory.push({
        amount: payment,
        recordedAt: new Date(),
        recordedBy: userId,
        note: note || undefined,
      });
      doc.metadata.set('paymentHistory', paymentHistory);

      await doc.validate();

      if (doc.totals) {
        const gt = Number(doc.totals.grandTotal || 0);
        const amountPaidAfterValidation = Number(doc.totals.amountPaid || 0);
        const correctBalanceDue = Math.max(0, gt - amountPaidAfterValidation);
        if (doc.totals.balanceDue !== correctBalanceDue) {
          doc.totals.balanceDue = correctBalanceDue;
          doc.markModified('totals');
        }
      }

      await doc.save({ session });
      await session.commitTransaction();
      return doc.toObject();
    } catch (err) {
      await session.abortTransaction().catch(() => { });
      throw new Error(`Error recording payment: ${err.message}`);
    } finally {
      session.endSession();
    }
  }

  _createInventoryHelper({ StockModel, StockBatchModel, ProductModel, ProductCategoryModel, session }) {
    const productCache = new Map();
    const categoryExpiryCache = new Map();

    const loadProduct = async (productId) => {
      const key = String(productId);
      if (productCache.has(key)) return productCache.get(key);
      const product = await ProductModel.findById(productId).select('SKU category hasVariation').lean();
      productCache.set(key, product);
      return product;
    };

    const requiresExpiry = async (categoryId) => {
      if (!categoryId) return false;
      const key = String(categoryId);
      if (categoryExpiryCache.has(key)) return categoryExpiryCache.get(key);
      const category = await ProductCategoryModel.findById(categoryId).select('hasExpiry').lean();
      const flag = Boolean(category?.hasExpiry);
      categoryExpiryCache.set(key, flag);
      return flag;
    };

    const normalizeExpiryDate = (value) => {
      if (value === undefined || value === null || value === '') return undefined;
      const date = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(date.getTime())) throw new Error('Invalid expiry date supplied');
      return date;
    };

    const increment = async ({ productId, storeId, sku, quantity, userId, expiryDate, unitCost, note, sourceDocumentId, supplierId, businessId }) => {
      if (!sku || !Number.isFinite(quantity) || quantity <= 0) return;

      await StockModel.findOneAndUpdate(
        { productId, storeId, SKU: sku },
        { $inc: { quantity }, $set: { updatedBy: userId, status: true } },
        { upsert: true, new: true, setDefaultsOnInsert: true, session },
      );

      const product = await loadProduct(productId);
      const requiresExpiryFlag = await requiresExpiry(product?.category);
      const normalizedExpiry = normalizeExpiryDate(expiryDate);
      if (requiresExpiryFlag && !normalizedExpiry) {
        throw new Error('Expiry date is required for perishable products');
      }

      const batchDoc = {
        productId,
        storeId,
        SKU: sku,
        isVariant: !!product?.hasVariation,
        quantity,
        sourceDocumentType: 'purchase_order',
        sourceDocumentId,
        supplierId,
        businessId,
        createdBy: userId,
        updatedBy: userId,
        costPerUnit: unitCost,
        notes: note,
        receivedAt: new Date(),
      };

      if (normalizedExpiry) batchDoc.expiryDate = normalizedExpiry;

      await StockBatchModel.create([batchDoc], { session });
    };

    return { increment, loadProduct };
  }

  async softDeleteById(id, userId) {
    try {
      const Model = await this.getModelRef();
      const updated = await Model.findByIdAndUpdate(
        id,
        {
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: userId || undefined,
        },
        { new: true },
      );
      if (!updated) {
        throw new Error(`Document with id ${id} not found`);
      }
      return updated;
    } catch (error) {
      throw new Error(`Error soft deleting purchase order: ${error.message}`);
    }
  }
  async deletePurchaseOrder(id) {
    const doc = await this.getById(id);
    if (!doc) throw new Error(`Purchase order ${id} not found`);

    if (![PO_STATUSES.DRAFT, PO_STATUSES.CANCELLED].includes(doc.status)) {
      throw new Error(
        `Cannot delete purchase order with status ${doc.status}. Only Draft or Cancelled orders can be deleted.`,
      );
    }

    return await super.deleteById(id);
  }



  async bulkDelete(payload, businessId) {
    try {
      if (!businessId) {
        throw new Error('Business ID is required');
      }

      const { ids } = payload;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        throw new Error('Purchase Order IDs must be a non-empty array');
      }

      const results = [];

      for (const id of ids) {
        try {
          // ✅ Validate ObjectId
          this.validateObjectId(id);

          /**
           * deleteById should internally:
           * - Check existence
           * - Check allowed statuses (Draft / Cancelled)
           * - Throw if not allowed
           */
          await this.deletePurchaseOrder(id);

          results.push({
            id,
            success: true,
            message: 'Purchase order deleted successfully',
          });
        } catch (error) {
          results.push({
            id,
            success: false,
            message: error.message,
          });
        }
      }

      return {
        total: ids.length,
        deleted: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
        results,
      };
    } catch (error) {
      throw new Error(
        `Error deleting bulk purchase orders: ${error.message}`,
      );
    }
  }




  async bulkDeleteById(ids) {
    return this.bulkDeletePurchaseOrders(ids);
  }

  async sendEmail(id) {
    const purchaseOrder = await this.getByIdWithDetails(id);

    if (!purchaseOrder) {
      throw new Error('Purchase order not found');
    }

    if (purchaseOrder.isDeleted) {
      throw new Error('Cannot send email for deleted purchase order');
    }

    // We intentionally do NOT manually validate supplier email here
    // because recipient resolution + filtering is handled by:
    // _resolvePurchaseOrderRecipients → _fetchSuppliersForScope

    const results = await this._dispatchPurchaseOrderNotifications({
      purchaseOrder,
      notificationOptions: {
        sendEmail: true,
        templateLabel: this._generateTemplateLabel(purchaseOrder.status),
        recipientType: 'supplier',
      },
    });

    if (!results || results.length === 0) {
      throw new Error('Email dispatch failed or no eligible recipients found');
    }

    return {
      message: 'Purchase order email dispatch initiated successfully',
      results,
    };
  }


  async bulkUpdateStatus(payload, businessId, userId) {
    try {
      if (!businessId) throw new Error('Business ID is required');
      if (!userId) throw new Error('User ID is required');

      const { ids, status } = payload;

      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('Purchase Order IDs must be a non-empty array');
      }

      const ALLOWED_TARGET_STATUSES = Object.values(PO_STATUSES);
      if (!ALLOWED_TARGET_STATUSES.includes(status)) {
        throw new Error(`Invalid purchase order status: ${status}`);
      }

      const Model = await this._getPurchaseOrderModel();

      /**
       * ✅ Allowed source statuses based on target status
       */
      let allowedCurrentStatuses = [];

      if (status === PO_STATUSES.APPROVED) {
        allowedCurrentStatuses = [PO_STATUSES.DRAFT];
      }

      if (status === PO_STATUSES.BILLED) {
        allowedCurrentStatuses = [PO_STATUSES.APPROVED];
      }

      if (status === PO_STATUSES.CANCELLED) {
        allowedCurrentStatuses = [
          PO_STATUSES.DRAFT,
          PO_STATUSES.APPROVED,
        ];
      }

      if (allowedCurrentStatuses.length === 0) {
        throw new Error(`Invalid status transition to ${status}`);
      }

      const query = {
        _id: { $in: ids },
        status: { $in: allowedCurrentStatuses },
      };

      const now = new Date();

      const updateData = {
        status,
        updatedBy: userId,
        updatedAt: now,
      };

      if (status === PO_STATUSES.APPROVED) {
        updateData.approvedBy = userId;
        updateData.approvedAt = now;
      }

      if (status === PO_STATUSES.BILLED) {
        updateData.billedBy = userId;
        updateData.billedAt = now;
        updateData['totals.balanceDue'] = 0;
      }

      if (status === PO_STATUSES.CANCELLED) {
        updateData.cancelledBy = userId;
        updateData.cancelledAt = now;
      }

      const result = await Model.updateMany(query, { $set: updateData });

      return {
        total: ids.length,
        matched: result.matchedCount,
        updated: result.modifiedCount,
        failed: ids.length - result.modifiedCount,
        message: `Bulk update completed`,
      };
    } catch (error) {
      throw new Error(
        `Error bulk updating purchase order status: ${error.message}`,
      );
    }
  }


  async _dispatchPurchaseOrderNotifications({
    purchaseOrder,
    notificationOptions,
    notificationContext = {},
  }) {
    if (!notificationOptions?.sendEmail) {
      return null;
    }

    if (!this.businessId) {
      console.warn(
        '[PurchaseOrderService] Missing businessId; skipping notification dispatch.',
      );
      return null;
    }

    const normalizedPO =
      purchaseOrder && typeof purchaseOrder.toObject === 'function'
        ? purchaseOrder.toObject()
        : purchaseOrder;

    try {
      const recipients = await this._resolvePurchaseOrderRecipients({
        purchaseOrder: normalizedPO,
        notificationOptions,
      });

      if (!recipients.length) {
        console.warn(
          '[PurchaseOrderService] No eligible recipients found for purchase order notification.',
        );
        return null;
      }

      const batches = this._chunkArray(
        recipients,
        notificationOptions.batchSize,
      );

      const results = [];

      for (const batch of batches) {
        const settled = await Promise.allSettled(
          batch.map((recipient) =>
            this._sendPurchaseOrderEmail({
              recipient,
              purchaseOrder: normalizedPO,
              notificationOptions,
              notificationContext,
            }),
          ),
        );

        results.push(...settled);
      }

      return results;
    } catch (error) {
      console.error(
        '[PurchaseOrderService] Failed to dispatch purchase order notifications:',
        error,
      );
      return null;
    }
  }


  async _resolvePurchaseOrderRecipients({ purchaseOrder, notificationOptions }) {
    if (notificationOptions?.overrideRecipients?.length) {
      return notificationOptions.overrideRecipients;
    }

    return this._fetchSuppliersForScope(purchaseOrder);
  }


  async _fetchSuppliersForScope(purchaseOrder) {
    const supplier = purchaseOrder?.supplier;

    if (!supplier) return [];

    const email = supplier?.billingAddress?.email;
    if (!email) return [];

    return [
      {
        name:
          supplier?.billingAddress?.name ||
          supplier?.supplierName ||
          'Valued Supplier',
        email,
        phone: supplier?.billingAddress?.phone,
      },
    ];
  }


  _chunkArray(list = [], size = EMAIL_BATCH_SIZE) {
    if (!Array.isArray(list) || list.length === 0) {
      return [];
    }

    const chunkSize = size > 0 ? size : EMAIL_BATCH_SIZE;
    const chunks = [];

    for (let i = 0; i < list.length; i += chunkSize) {
      chunks.push(list.slice(i, i + chunkSize));
    }

    return chunks;
  }


  _generateTemplateLabel(status) {
    if (!status) return DEFAULT_PO_TEMPLATE_LABEL;
    // Convert 'Approved' -> 'purchase_order_approved'
    return `purchase_order_${status.toLowerCase().replace(/\s+/g, '_')}`;
  }

  async _sendPurchaseOrderEmail({
    recipient,
    purchaseOrder,
    notificationOptions,
    notificationContext,
  }) {
    if (!recipient?.email) {
      return null;
    }

    const contextOptions = this._buildNotificationContext({
      recipient,
      purchaseOrder,
      notificationOptions,
      notificationContext,
    });

    return TenantNotificationDispatcher.dispatch({
      businessId: this.businessId,
      label: notificationOptions.templateLabel,
      recipientType: notificationOptions.recipientType,
      recipient: { email: recipient.email },
      channels: notificationOptions.channels,
      contextOptions,
    });
  }


  _buildNotificationContext({
    recipient,
    purchaseOrder,
    notificationOptions,
    notificationContext,
  }) {
    const sender =
      notificationContext?.sender || notificationOptions?.sender || null;

    const baseContext = {
      ...notificationContext,
      supplier: {
        name: recipient.name || '',
        email: recipient.email,
        phone: recipient.phone || '',
      },
      purchaseOrder: {
        number: purchaseOrder.orderDetails?.poNumber,
        date: purchaseOrder.orderDetails?.purchaseDate,
        status: purchaseOrder.status,
        totalAmount: purchaseOrder.totals?.grandTotal || 0,
      },
      metadata: {
        purchaseOrderId:
          purchaseOrder._id?.toString?.() || purchaseOrder.id || '',
      },
    };

    if (sender && !baseContext.sender) {
      baseContext.sender = sender;
    }

    return baseContext;
  }


  _normalizeNotificationOptions(options = {}) {
    const sendEmail = Boolean(options.sendEmail);
    const templateLabel =
      typeof options.templateLabel === 'string' && options.templateLabel.trim()
        ? options.templateLabel.trim()
        : DEFAULT_PO_TEMPLATE_LABEL;
    const recipientType =
      typeof options.recipientType === 'string' &&
        options.recipientType.trim()
        ? options.recipientType.trim()
        : 'supplier';

    const channels =
      Array.isArray(options.channels) && options.channels.length
        ? Array.from(
          new Set(
            options.channels
              .filter((channel) => typeof channel === 'string')
              .map((channel) => channel.toLowerCase()),
          ),
        )
        : ['email'];

    return {
      sendEmail,
      templateLabel,
      recipientType,
      channels,
      sender: options.sender || null,
      personalMessage: options.personalMessage,
    };
  }
}


export default PurchaseOrderServices;
