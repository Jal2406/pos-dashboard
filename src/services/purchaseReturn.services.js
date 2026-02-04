import mongoose from 'mongoose';
import { BaseService } from '../utils/index.js';
import { PurchaseReturnSchema, Business } from '../models/index.js';
import PurchaseOrderServices from './purchaseOrder.services.js';
import ProductServices from './product.services.js';
import StockServices from './stock.services.js';
import SupplierServices from './supplier.services.js';
import StockBatchServices from './stockBatch.services.js';



const PURCHASE_RETURN_STATUSES = Object.freeze({
  DRAFT: 'Draft',
  APPROVED: 'Approved',
  CREDITED: 'Credited',
  CANCELLED: 'Cancelled',
});


class PurchaseReturnServices extends BaseService {
  constructor(businessId) {
    if (!businessId) {
      throw new Error('PurchaseReturnServices initialized without businessId');
    }
    super({
      modelName: 'PurchaseReturn',
      schema: PurchaseReturnSchema,
      collection: 'purchasereturns',
      businessId,
    });
    this.models = null;
    this.businessId = businessId;
    this._purchaseOrderService = new PurchaseOrderServices(businessId);
    this._productService = new ProductServices(businessId);
    this._stockService = new StockServices(businessId);
    this._supplierService = new SupplierServices(businessId);
    this._stockBatchService = new StockBatchServices(businessId);
  }


  async _getPurchaseReturnModel() {
    return this.getModel('PurchaseReturn', PurchaseReturnSchema, 'purchasereturns');
  }

  /**
   * Validate that the business exists before performing operations
   * This prevents creating purchase returns in orphaned tenant databases
   */
  async _validateBusinessExists() {
    if (!this.businessId) {
      return; // No validation needed if no businessId
    }

    try {
      const business = await Business.findById(this.businessId)
        .select('_id')
        .lean();
      if (!business) {
        throw new Error(
          `Cannot perform operation: Business with id ${this.businessId} does not exist`,
        );
      }
    } catch (error) {
      // Handle invalid ObjectId format
      if (error.name === 'CastError' || error.kind === 'ObjectId') {
        throw new Error(`Invalid business ID format: ${this.businessId}`);
      }
      // Re-throw our custom error
      if (error.message?.includes('does not exist')) {
        throw error;
      }
      // For other errors, wrap and re-throw
      throw new Error(
        `Business validation failed: ${error.message || String(error)}`,
      );
    }
  }

  async _ensureRefModels() {
    if (this.models) return;
    const [PurchaseOrder, Product, Stock, Supplier] = await Promise.all([
      this._purchaseOrderService.getModelRef(),
      this._productService.getModelRef(),
      this._stockService.getStockModel(),
      this._supplierService.getModelRef(),
    ]);
    this.models = {
      PurchaseOrder,
      Product,
      Stock,
      Supplier,
    };
  }

  static isValidStatusTransition(current, next) {
    if (current === next) return true;
    const allowed = {
      Draft: new Set(['Approved', 'Cancelled']),
      Approved: new Set(['Returned', 'Cancelled']),
      Returned: new Set(['Credited']),
      Credited: new Set(['Closed']),
      Closed: new Set([]),
      Cancelled: new Set([]),
    };
    return Boolean(allowed[current]?.has(next));
  }

  async updateById(id, data, userId) {
    await this._ensureRefModels();
    const Model = await this.getModelRef();
    const doc = await Model.findById(id).select('status').lean();

    if (!doc) {
      throw new Error(`Purchase return with id ${id} not found`);
    }

    if (['Returned', 'Credited', 'Closed'].includes(doc.status)) {
      throw new Error(
        `Cannot update purchase return details when status is ${doc.status}.`,
      );
    }

    if (userId) {
      data.updatedBy = userId;
    }

    return await super.updateById(id, data);
  }

  async createDraft(payload, userId) {
    // Validate business exists before creating purchase return
    await this._validateBusinessExists();
    await this._ensureRefModels();

    const data = { ...payload };
    if (!data.purchaseOrderId) throw new Error('purchaseOrderId is required');
    if (!Array.isArray(data.items) || data.items.length === 0) {
      throw new Error('At least one return item is required');
    }

    const po = await this.models.PurchaseOrder.findById(data.purchaseOrderId);
    if (!po) throw new Error('Purchase order not found');

    if (!data.supplierId && po.supplier?.supplierId) {
      data.supplierId = po.supplier.supplierId;
    }
    if (!data.supplierId) {
      throw new Error('Supplier ID not found in purchase order');
    }

    if (!data.reason && data.note) {
      data.reason = data.note;
    }
    if (Array.isArray(data.items)) {
      data.items = data.items.map((item) => {
        if (item.taxRate != null && item.taxRatePercent == null) {
          item.taxRatePercent = item.taxRate;
          delete item.taxRate;
        }
        return item;
      });
    }
    data.status = 'Draft';
    if (!data.purchaseReturnNumber) {
      data.purchaseReturnNumber = this._generatePurchaseReturnNumber();
    }
    if (!data.returnDate) data.returnDate = new Date();
    if (userId) data.createdBy = userId;

    return await super.create(data);
  }

  async approve(id, userId) {
    return await this._changeStatus(id, 'Approved', { actorUserId: userId });
  }

  async returnGoods(id, options = {}) {
    const { actorUserId, note } = options || {};
    return await this.executeTenantTransaction(async (session) => {
      await this._ensureRefModels();
      const Model = await this.getModelRef();
      const POReturn = await Model.findById(id).session(session);

      if (!POReturn) throw new Error(`Purchase return ${id} not found`);
      if (POReturn.status !== 'Approved') {
        throw new Error(
          `Return can be executed only from Approved state. Current: ${POReturn.status}`,
        );
      }

      const po = await this.models.PurchaseOrder.findById(
        POReturn.purchaseOrderId,
      ).session(session);
      console.log('po', po);
      if (!po) throw new Error('Linked purchase order not found');

      const fixedStoreId = this._resolveFixedStoreIdFromPO(po);
      if (!fixedStoreId) throw new Error('Purchase order store is not set');
      const normalizedStoreId = this._normalizeObjectId(
        fixedStoreId,
        'storeId',
      );

      const variantSkuByIds = this._buildVariantSkuLookup(po);
      const { returnIncByKey, processedItems } =
        await this._decrementStockForReturnItems(
          POReturn,
          normalizedStoreId,
          variantSkuByIds,
          actorUserId,
          session,
        );

      console.log('returnIncByKey:', Array.from(returnIncByKey.entries()));
      await this._deductStockBatchesForReturnItems({
        processedItems,
        purchaseOrder: po,
        storeId: normalizedStoreId,
        actorUserId,
        session,
      });
      await this._applyReturnToPurchaseOrder(po, returnIncByKey, session);

      // Add return log entry to purchase order for audit purposes
      await this._addReturnLogToPurchaseOrder(
        po,
        POReturn,
        normalizedStoreId,
        actorUserId,
        note,
        session,
      );

      POReturn.status = 'Returned';
      if (actorUserId) POReturn.updatedBy = actorUserId;
      if (note) {
        POReturn.reason = POReturn.reason
          ? `${POReturn.reason} | ${note}`
          : note;
      }
      await POReturn.save({ session });
      return POReturn.toObject();
    });
  }

  _resolveFixedStoreIdFromPO(po) {
    let storeId = po.orderDetails?.storeId;

    if (!storeId) {
      storeId =
        po.metadata && typeof po.metadata.get === 'function'
          ? po.metadata.get('fixedStoreId')
          : po.metadata?.fixedStoreId;
    }

    if (
      !storeId &&
      Array.isArray(po.receiveLogs) &&
      po.receiveLogs.length > 0
    ) {
      const latestReceive = po.receiveLogs[po.receiveLogs.length - 1];
      storeId = latestReceive?.storeId;
    }

    return storeId;
  }

  _buildVariantSkuLookup(po) {
    const map = new Map();
    for (const li of po.items || []) {
      if (li.hasVariation && Array.isArray(li.variants)) {
        for (const v of li.variants) {
          if (v?.variantId && v?.SKU) {
            map.set(`${String(li.productId)}|${String(v.variantId)}`, v.SKU);
          }
        }
      }
    }
    return map;
  }

  async _decrementStockForReturnItems(
    POReturn,
    fixedStoreId,
    variantSkuByIds,
    actorUserId,
    session,
  ) {
    const returnIncByKey = new Map();
    const processedItems = [];
    const po = await this.models.PurchaseOrder.findById(
      POReturn.purchaseOrderId,
    )
      .select('items')
      .lean();

    for (const it of POReturn.items || []) {
      let productId = it.productId;
      const qty = Number(it.returnQty || 0);
      if (!productId || qty <= 0) continue;

      // Fix: If productId doesn't exist in Product collection, try to get it from PO item
      let prod = await this.models.Product.findById(productId)
        .select('SKU _id')
        .lean();

      if (!prod && po?.items) {
        // Try to find the correct productId from PO item
        let poItem = null;

        // First try using purchaseOrderItemId if available
        if (it.purchaseOrderItemId) {
          poItem = po.items.find(
            (item) => String(item._id) === String(it.purchaseOrderItemId),
          );
        }

        // If not found, try matching by productId (in case productId is actually PO item _id)
        if (!poItem) {
          poItem = po.items.find(
            (item) => String(item._id) === String(productId),
          );
        }

        if (poItem?.productId) {
          productId = poItem.productId;
          prod = await this.models.Product.findById(productId)
            .select('SKU _id')
            .lean();
          console.log(
            `Fixed productId: ${it.productId} -> ${productId} using PO item`,
          );
        }
      }

      let sku = it.sku || null;
      if (!sku && it.variantId) {
        sku =
          variantSkuByIds.get(`${String(productId)}|${String(it.variantId)}`) ||
          null;
      }
      if (!sku && prod) {
        sku = prod.SKU || null;
      }
      const normalizedSku =
        typeof sku === 'string' ? sku.trim().toUpperCase() : null;
      if (!normalizedSku) {
        console.log(
          `Skipping item - no SKU found for productId: ${productId}, original: ${it.productId}`,
        );
        continue;
      }

      // Ensure productId is an ObjectId for the stock update
      const productIdObj =
        productId instanceof mongoose.Types.ObjectId
          ? productId
          : new mongoose.Types.ObjectId(productId);

      await this.models.Stock.findOneAndUpdate(
        { productId: productIdObj, storeId: fixedStoreId, SKU: normalizedSku },
        {
          $inc: { quantity: -qty },
          $set: { updatedBy: actorUserId, status: true },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true, session },
      );

      const productIdStr =
        productId?.toString?.() ||
        productId?._id?.toString() ||
        String(productId);
      const variantId = it.variantId
        ? it.variantId.toString?.() || String(it.variantId)
        : '';
      const k = `${productIdStr}|${variantId}`;
      const currentQty = returnIncByKey.get(k) || 0;
      returnIncByKey.set(k, currentQty + qty);
      processedItems.push({
        productIdObj,
        productIdStr,
        variantId,
        sku: normalizedSku,
        returnQty: qty,
        batchCode: this._parseBatchCode(it.batchNumber),
        purchaseOrderItemId: it.purchaseOrderItemId || null,
      });
      console.log(
        `Added to returnIncByKey: key=${k}, qty=${qty}, total=${currentQty + qty}`,
      );
    }
    return { returnIncByKey, processedItems };
  }

  _parseBatchCode(value) {
    if (value === undefined || value === null) {
      return null;
    }
    const raw = String(value).trim();
    if (!raw) {
      return null;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      console.warn(`Ignoring invalid batch number input: ${value}`);
      return null;
    }
    return Math.trunc(parsed);
  }

  async _deductStockBatchesForReturnItems({
    processedItems = [],
    purchaseOrder,
    storeId,
    actorUserId,
    session,
  }) {
    if (!Array.isArray(processedItems) || processedItems.length === 0) {
      return;
    }
    const StockBatchModel = await this._stockBatchService.getModel();
    const normalizedStoreId = this._normalizeObjectId(storeId, 'storeId');
    const purchaseOrderId = this._normalizeObjectId(
      purchaseOrder?._id || purchaseOrder?.id || purchaseOrder,
      'purchaseOrderId',
      { required: false },
    );

    const batchCache = new Map();

    const runSortedFind = async (query, cacheKey) => {
      if (batchCache.has(cacheKey)) {
        return batchCache.get(cacheKey);
      }
      let finder = StockBatchModel.find(query).sort({
        receivedAt: 1,
        createdAt: 1,
        batchCode: 1,
        _id: 1,
      });
      if (session) {
        finder = finder.session(session);
      }
      const docs = await finder.exec();
      batchCache.set(cacheKey, docs);
      return docs;
    };

    const runFindOne = async (query) => {
      let finder = StockBatchModel.findOne(query);
      if (session) {
        finder = finder.session(session);
      }
      return finder.exec();
    };

    const consumeBatchDoc = async (batchDoc, quantityNeeded) => {
      if (
        !batchDoc ||
        !Number.isFinite(quantityNeeded) ||
        quantityNeeded <= 0
      ) {
        return quantityNeeded;
      }
      const available = Number(batchDoc.quantity || 0);
      if (available <= 0) {
        return quantityNeeded;
      }
      const deduction = Math.min(quantityNeeded, available);
      batchDoc.quantity = available - deduction;
      if (
        typeof batchDoc.reservedQuantity === 'number' &&
        batchDoc.reservedQuantity > batchDoc.quantity
      ) {
        batchDoc.reservedQuantity = batchDoc.quantity;
      }
      if (actorUserId) {
        batchDoc.updatedBy = actorUserId;
      }
      await batchDoc.save({ session });
      return quantityNeeded - deduction;
    };

    const consumeBatchCollection = async (collection = [], quantityNeeded) => {
      let outstanding = quantityNeeded;
      for (const batchDoc of collection) {
        outstanding = await consumeBatchDoc(batchDoc, outstanding);
        if (outstanding <= 0) break;
      }
      return outstanding;
    };

    const consumeSpecificBatch = async (item, batchCode, quantityNeeded) => {
      const query = {
        productId: item.productIdObj,
        storeId: normalizedStoreId,
        SKU: item.sku,
        batchCode,
        isDeleted: false,
      };
      const batchDoc = await runFindOne(query);
      if (!batchDoc) {
        throw new Error(
          `Batch ${batchCode} not found for SKU ${item.sku} (product ${item.productIdStr})`,
        );
      }
      const remaining = await consumeBatchDoc(batchDoc, quantityNeeded);
      if (remaining > 0) {
        console.warn(
          `Batch ${batchCode} for SKU ${item.sku} had insufficient quantity. Attempting to continue with other batches.`,
        );
      }
      return remaining;
    };

    for (const item of processedItems) {
      let remaining = Number(item.returnQty || 0);
      if (remaining <= 0 || !item.sku) {
        continue;
      }

      if (item.batchCode) {
        remaining = await consumeSpecificBatch(item, item.batchCode, remaining);
        if (remaining <= 0) {
          continue;
        }
      }

      if (purchaseOrderId) {
        const key = `${item.productIdStr}|${item.sku}|${purchaseOrderId.toString()}`;
        const batches = await runSortedFind(
          {
            productId: item.productIdObj,
            storeId: normalizedStoreId,
            SKU: item.sku,
            sourceDocumentType: 'purchase_order',
            sourceDocumentId: purchaseOrderId,
            isDeleted: false,
            quantity: { $gt: 0 },
          },
          key,
        );
        remaining = await consumeBatchCollection(batches, remaining);
      }

      if (remaining > 0) {
        const fallbackKey = `${item.productIdStr}|${item.sku}|__fallback`;
        const fallbackBatches = await runSortedFind(
          {
            productId: item.productIdObj,
            storeId: normalizedStoreId,
            SKU: item.sku,
            isDeleted: false,
            quantity: { $gt: 0 },
          },
          fallbackKey,
        );
        remaining = await consumeBatchCollection(fallbackBatches, remaining);
      }

      if (remaining > 0) {
        console.warn(
          `Insufficient stock batch quantity for SKU ${item.sku}. Unable to deduct remaining ${remaining} units. Proceeding with available stock adjustment.`,
        );
      }
    }
  }

  async _applyReturnToPurchaseOrder(po, returnIncByKey, session) {
    if (!returnIncByKey || returnIncByKey.size === 0) {
      console.log('No returnIncByKey or empty map');
      return po;
    }

    console.log(
      'Processing PO items, returnIncByKey size:',
      returnIncByKey.size,
    );
    console.log('returnIncByKey keys:', Array.from(returnIncByKey.keys()));
    let hasChanges = false;

    // Process items in reverse to safely remove items during iteration
    for (let itemIdx = (po.items || []).length - 1; itemIdx >= 0; itemIdx--) {
      const item = po.items[itemIdx];
      const itemProductId =
        item.productId?.toString?.() ||
        item.productId?._id?.toString() ||
        String(item.productId);
      console.log(
        `Processing item with productId: ${itemProductId}, hasVariation: ${item.hasVariation}`,
      );

      if (item.hasVariation && Array.isArray(item.variants)) {
        // Process variants in reverse to safely remove variants during iteration
        for (let i = item.variants.length - 1; i >= 0; i--) {
          const v = item.variants[i];
          const variantId = v.variantId
            ? v.variantId.toString?.() || String(v.variantId)
            : '';
          const k = `${itemProductId}|${variantId}`;
          const dec = returnIncByKey.get(k) || 0;
          console.log(
            `  Variant key: ${k}, decrement: ${dec}, current quantity: ${v.quantity}`,
          );
          if (dec > 0) {
            const current = Number(v.quantity || 0);
            // Cap processed quantity at current to prevent negative values
            const processed = Math.min(dec, current);
            const next = current - processed;

            // Validate: return quantity shouldn't exceed quantity
            if (dec > current) {
              console.warn(
                `  Warning: Return quantity (${dec}) exceeds available quantity (${current}) for variant ${variantId}. Processing only ${processed} units.`,
              );
            }

            // Update returnedQuantity for audit trail BEFORE potentially removing
            v.returnedQuantity = Math.max(
              0,
              Number(v.returnedQuantity || 0) + processed,
            );
            item.returnedQuantity = Math.max(
              0,
              Number(item.returnedQuantity || 0) + processed,
            );

            if (next === 0) {
              // Remove variant from array when fully returned
              console.log(`  Removing variant ${variantId} (fully returned)`);
              item.variants.splice(i, 1);
            } else {
              // Update quantity if not fully returned
              v.quantity = next;
              console.log(`  Updated variant quantity: ${current} -> ${next}`);
            }

            hasChanges = true;
          }
        }

        // If all variants are removed, remove the entire item
        if (item.variants.length === 0) {
          console.log(
            `  Removing item ${itemProductId} (all variants returned)`,
          );
          po.items.splice(itemIdx, 1);
        }
      } else {
        const k = `${itemProductId}|`;
        const dec = returnIncByKey.get(k) || 0;
        console.log(
          `  Non-variant key: ${k}, decrement: ${dec}, current quantity: ${item.quantity}`,
        );
        if (dec > 0) {
          const current = Number(item.quantity || 0);
          // Cap processed quantity at current to prevent negative values
          const processed = Math.min(dec, current);
          const next = current - processed;

          // Validate: return quantity shouldn't exceed quantity
          if (dec > current) {
            console.warn(
              `  Warning: Return quantity (${dec}) exceeds available quantity (${current}) for product ${itemProductId}. Processing only ${processed} units.`,
            );
          }

          // Update returnedQuantity for audit trail BEFORE potentially removing
          item.returnedQuantity = Math.max(
            0,
            Number(item.returnedQuantity || 0) + processed,
          );

          if (next === 0) {
            // Remove item from array when fully returned
            console.log(`  Removing item ${itemProductId} (fully returned)`);
            po.items.splice(itemIdx, 1);
          } else {
            // Update quantity if not fully returned
            item.quantity = next;
            console.log(`  Updated item quantity: ${current} -> ${next}`);
          }

          hasChanges = true;
        }
      }
    }

    console.log('hasChanges:', hasChanges);
    if (hasChanges) {
      po.markModified('items');
      const savedPO = await po.save({ session });
      console.log('PO saved successfully with updated items');
      return savedPO;
    }
    console.log('No changes detected, returning original PO');
    return po;
  }

  async _addReturnLogToPurchaseOrder(
    po,
    POReturn,
    storeId,
    actorUserId,
    note,
    session,
  ) {
    if (!po || !POReturn) {
      throw new Error('Purchase order and purchase return are required');
    }

    // Ensure returnedBy is set (required by schema)
    const returnedBy = actorUserId || POReturn.createdBy;
    if (!returnedBy) {
      throw new Error(
        'Cannot create return log: returnedBy user ID is required',
      );
    }

    // Build items array for audit purposes
    const returnItems = (POReturn.items || []).map((item) => ({
      productId: item.productId,
      variantId: item.variantId || undefined,
      SKU: item.sku || undefined,
      quantity: item.returnQty || 0,
      unitCost: item.unitCost || 0,
      lineTotal: item.lineTotal || 0,
      reason: item.reason || undefined,
    }));

    // Create return log entry with required fields and additional audit information
    const returnLogEntry = {
      returnedAt: POReturn.returnDate || new Date(),
      purchaseReturnId: POReturn._id,
      returnedBy: returnedBy,
      // Additional audit fields (not in schema but useful for audit)
      storeId: storeId || undefined,
      items: returnItems.length > 0 ? returnItems : undefined,
      note: note || POReturn.reason || undefined,
      totalReturnAmount: POReturn.totalCreditAmount || 0,
    };

    // Initialize returnLogs array if it doesn't exist
    if (!Array.isArray(po.returnLogs)) {
      po.returnLogs = [];
    }

    // Add the return log entry
    po.returnLogs.push(returnLogEntry);
    po.markModified('returnLogs');

    // Save the purchase order with the new return log
    await po.save({ session });
    console.log(
      `Added return log entry to purchase order ${po._id} for return ${POReturn._id}`,
    );
  }

  async recordCredit(id, credit, userId) {
    const { amount, method, reference, notes, date } = credit || {};

    return await this.executeTenantTransaction(async (session) => {
      const Model = await this.getModelRef();
      const doc = await Model.findById(id).session(session);
      if (!doc) throw new Error(`Purchase return ${id} not found`);
      if (!['Returned', 'Credited'].includes(doc.status)) {
        throw new Error(
          `Credit can be recorded only when status is Returned or Credited. Current: ${doc.status}`,
        );
      }

      let creditAmount = amount;
      if (creditAmount == null || !Number.isFinite(Number(creditAmount))) {
        const totalCredit = Number(doc.totalCreditAmount || 0);
        const receivedCredit = Number(doc.receivedCreditAmount || 0);
        creditAmount = Math.max(0, totalCredit - receivedCredit);

        if (creditAmount <= 0) {
          throw new Error('No remaining credit amount to record');
        }
      } else {
        creditAmount = Number(creditAmount);
        if (creditAmount <= 0) {
          throw new Error('amount must be a positive number');
        }
      }

      const creditTx = {
        amount: creditAmount,
        method: method || 'Other',
        reference: reference || undefined,
        notes: notes || undefined,
        date: date ? new Date(date) : new Date(),
      };

      doc.creditTransactions = Array.isArray(doc.creditTransactions)
        ? doc.creditTransactions
        : [];
      doc.creditTransactions.push(creditTx);

      const totalReceived = doc.creditTransactions.reduce(
        (sum, tx) => sum + Number(tx.amount || 0),
        0,
      );
      const totalCredit = Number(doc.totalCreditAmount || 0);
      doc.receivedCreditAmount = Math.min(totalReceived, totalCredit);

      if (doc.receivedCreditAmount >= totalCredit && totalCredit > 0) {
        doc.status = 'Credited';
      } else if (doc.status !== 'Returned') {
        doc.status = 'Returned';
      }

      if (userId) doc.updatedBy = userId;
      await doc.save({ session });
      return doc.toObject();
    });
  }

  async close(id, userId) {
    return await this.executeTenantTransaction(async (session) => {
      const Model = await this.getModelRef();
      const doc = await Model.findById(id).session(session);
      if (!doc) throw new Error(`Purchase return ${id} not found`);

      if (doc.status !== 'Credited') {
        throw new Error(
          `Only credited returns can be closed. Current: ${doc.status}`,
        );
      }
      const total = Number(doc.totalCreditAmount || 0);
      const received = Number(doc.receivedCreditAmount || 0);
      if (total > 0 && received < total) {
        throw new Error(
          `Cannot close: outstanding credit balance ${(total - received).toFixed(2)}`,
        );
      }
      doc.status = 'Closed';
      if (userId) doc.updatedBy = userId;
      await doc.save({ session });
      return doc.toObject();
    });
  }

  async _changeStatus(id, nextStatus, options = {}) {
    return await this.executeTenantTransaction(async (session) => {
      const Model = await this.getModelRef();
      const doc = await Model.findById(id).session(session);
      if (!doc) throw new Error(`Purchase return ${id} not found`);

      const allowedStatuses = Model.schema.path('status').options.enum || [];
      if (!allowedStatuses.includes(nextStatus)) {
        throw new Error(`Invalid status: ${nextStatus}`);
      }
      if (
        !PurchaseReturnServices.isValidStatusTransition(doc.status, nextStatus)
      ) {
        throw new Error(
          `Invalid status transition: ${doc.status} -> ${nextStatus}`,
        );
      }
      if (options.actorUserId) doc.updatedBy = options.actorUserId;
      doc.status = nextStatus;
      await doc.save({ session });
      return doc.toObject();
    });
  }

  _normalizeObjectId(value, label = 'id', options = {}) {
    const { required = true } = options;
    if (value === undefined || value === null) {
      if (required) {
        throw new Error(`${label} is required`);
      }
      return null;
    }
    if (value instanceof mongoose.Types.ObjectId) {
      return value;
    }
    if (value?._id) {
      return this._normalizeObjectId(value._id, label, options);
    }
    if (typeof value === 'string' && mongoose.Types.ObjectId.isValid(value)) {
      return new mongoose.Types.ObjectId(value);
    }
    if (
      typeof mongoose.isObjectIdOrHexString === 'function' &&
      mongoose.isObjectIdOrHexString(value)
    ) {
      return new mongoose.Types.ObjectId(value);
    }
    throw new Error(`Invalid ${label}`);
  }

  _extractProductIdString(productId) {
    if (!productId) return null;
    if (productId._id) return productId._id.toString();
    if (productId.toString && typeof productId.toString === 'function') {
      return productId.toString();
    }
    if (typeof productId === 'string') return productId;
    return null;
  }

  async getById(id) {
    try {
      await this._ensureRefModels();
      this.validateObjectId(id);
      const Model = await this.getModelRef();

      const doc = await Model.findById(id).select('-__v').lean();
      if (!doc) {
        throw new Error(`Purchase return with id ${id} not found`);
      }

      if (doc.supplierId) {
        const supplier = await this.models.Supplier.findById(doc.supplierId)
          .select('name email phone supplierCode')
          .lean();
        doc.supplierId = supplier || doc.supplierId;
      }

      let poProductMap = new Map();
      if (doc.purchaseOrderId) {
        const purchaseOrder = await this.models.PurchaseOrder.findById(
          doc.purchaseOrderId,
        )
          .select('orderDetails.poNumber status orderDetails.orderDate items')
          .lean();
        doc.purchaseOrderId = purchaseOrder || doc.purchaseOrderId;

        if (purchaseOrder?.items) {
          for (const poItem of purchaseOrder.items) {
            const productIdStr = this._extractProductIdString(poItem.productId);
            if (
              productIdStr &&
              poItem.productName &&
              !poProductMap.has(productIdStr)
            ) {
              poProductMap.set(productIdStr, {
                productName: poItem.productName,
                productCode: poItem.productCode || null,
              });
            }
          }
        }
      }

      if (doc.items?.length > 0) {
        const productIdStrings = [
          ...new Set(
            doc.items
              .map((item) => this._extractProductIdString(item.productId))
              .filter(Boolean),
          ),
        ].filter((id) => mongoose.isValidObjectId(id));

        if (productIdStrings.length > 0) {
          const products = await this.models.Product.find({
            _id: {
              $in: productIdStrings.map(
                (id) => new mongoose.Types.ObjectId(id),
              ),
            },
          })
            .select('productName SKU')
            .lean();

          const productMap = new Map(
            products.map((p) => [p._id.toString(), p]),
          );

          doc.items = doc.items.map((item) => {
            const productIdStr = this._extractProductIdString(item.productId);
            const product = productIdStr ? productMap.get(productIdStr) : null;
            const poProduct = productIdStr
              ? poProductMap.get(productIdStr)
              : null;

            return {
              ...item,
              productName:
                product?.productName ||
                poProduct?.productName ||
                item.name ||
                null,
              productSKU: product?.SKU || item.sku || null,
              productId: item.productId,
            };
          });
        }
      }

      const userIds = [doc.createdBy, doc.updatedBy].filter(Boolean);

      if (userIds.length > 0) {
        if (!this._userModel) {
          const { User } = await import('../models/index.js');
          this._userModel = User;
        }

        const users = await this._userModel
          .find({ _id: { $in: userIds } })
          .select('name email')
          .lean();

        const userMap = new Map(
          users.map((user) => [user._id.toString(), user]),
        );

        if (doc.createdBy && userMap.has(doc.createdBy.toString())) {
          doc.createdBy = userMap.get(doc.createdBy.toString());
        }
        if (doc.updatedBy && userMap.has(doc.updatedBy.toString())) {
          doc.updatedBy = userMap.get(doc.updatedBy.toString());
        }
      }

      return doc;
    } catch (error) {
      throw new Error(`Error retrieving purchase return: ${error.message}`);
    }
  }



  async list(queryParams = {}) {
    const {
      page = 1,
      limit = 10,
      search = '',
      status,
      all,
    } = queryParams;

    // ✅ Allowed statuses
    const ALLOWED_STATUSES = [
      'Draft',
      'Approved',
      'Returned',
      'Credited',
      'Closed',
    ];

    if (status && !ALLOWED_STATUSES.includes(status)) {
      throw new Error(
        `Invalid status. Allowed values: ${ALLOWED_STATUSES.join(', ')}`
      );
    }

    const filters = {};
    if (status) {
      filters.status = status;
    }

    const searchFields = ['reason', 'creditNoteNumber', 'status'];

    const populate = [
      { path: 'supplierId', select: 'name email phone' },
      {
        path: 'purchaseOrderId',
        select: 'orderDetails.poNumber orderDetails.storeName status',
      },
    ];

    const listParams = {
      filters,
      populate,
      search: typeof search === 'string' ? search.trim() : '',
      searchFields,
      page,
      limit,
    };

    if (all === true || all === 'true') {
      delete listParams.page;
      delete listParams.limit;
    }

    const result = await super.list(listParams);

    const rows = Array.isArray(result?.data) ? result.data : [];
    const extractIdString = (value) => {
      if (!value) return null;
      if (typeof value === 'string') return value;
      if (typeof value === 'object' && value._id) return value._id.toString();
      if (value?.toString) return value.toString();
      return null;
    };

    const createdByIds = [
      ...new Set(
        rows
          .map((doc) => extractIdString(doc?.createdBy))
          .filter((id) => id && mongoose.isValidObjectId(id))
      ),
    ];

    let userMap = new Map();
    if (createdByIds.length > 0) {
      if (!this._userModel) {
        const { User } = await import('../models/index.js');
        this._userModel = User;
      }

      const users = await this._userModel
        .find({ _id: { $in: createdByIds } })
        .select('name email')
        .lean();

      userMap = new Map(users.map((user) => [user._id.toString(), user]));
    }

    result.data = rows.map((doc) => {
      const docObj =
        typeof doc?.toObject === 'function'
          ? doc.toObject({ virtuals: true })
          : { ...doc };

      const purchaseOrder = docObj.purchaseOrderId;
      docObj.storeName =
        purchaseOrder?.orderDetails?.storeName ?? null;

      const createdById = extractIdString(docObj.createdBy);
      if (createdById && userMap.has(createdById)) {
        docObj.createdBy = userMap.get(createdById);
      }

      return docObj;
    });

    return result;
  }


  /**
   * Bulk get purchase returns by IDs
   * @param {Array<string>} ids - Purchase return IDs to fetch
   * @param {Object} options - Optional configuration
   * @param {Object|Array|string|null} options.populate - Populate configuration
   * @param {Boolean} options.lean - Return lean documents (default: true)
   * @param {Boolean} options.throwOnNotFound - Throw if any ID missing (default: false)
   */
  async bulkGetPurchaseReturns(ids, options = {}) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error(
          'Purchase return IDs array is required and must not be empty',
        );
      }

      const {
        populate = [
          { path: 'supplierId', select: 'name email phone supplierCode' },
          {
            path: 'purchaseOrderId',
            select: 'orderDetails.poNumber orderDetails.storeName status',
          },
        ],
        lean = true,
        throwOnNotFound = false,
      } = options;

      const result = await this.bulkGetByIds(ids, {
        populate,
        lean,
        throwOnNotFound,
      });

      return {
        data: result.documents,
        found: result.found,
        notFound: result.notFound,
        totalRequested: result.totalRequested,
      };
    } catch (error) {
      throw new Error(`Bulk get purchase returns failed: ${error.message}`);
    }
  }

  async deletePurchaseReturn(id) {
    const doc = await this.getById(id);
    if (!doc) throw new Error(`Purchase return ${id} not found`);

    if (!['Draft', 'Cancelled'].includes(doc.status)) {
      throw new Error(
        `Cannot delete purchase return with status ${doc.status}. Only Draft or Cancelled returns can be deleted.`,
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
        throw new Error('Purchase Return IDs must be a non-empty array');
      }

      const results = [];

      for (const id of ids) {
        try {
          // Validate ObjectId
          this.validateObjectId(id);


          await this.deletePurchaseReturn(id);

          results.push({
            id,
            success: true,
            message: 'Purchase return deleted successfully',
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
        `Error deleting bulk purchase returns: ${error.message}`,
      );
    }
  }


  async bulkUpdateStatus(payload, businessId, userId) {
    try {
      if (!businessId) throw new Error('Business ID is required');
      if (!userId) throw new Error('User ID is required');

      const { ids, status } = payload;

      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('Purchase Return IDs must be a non-empty array');
      }

      // Explicitly define allowed statuses here to avoid scope issues
      const ALLOWED_TARGET_STATUSES = [
        'Draft',
        'PendingApproval',
        'Approved',
        'Returned',
        'Credited',
        'Cancelled',
        'OnHold',
      ];

      if (!ALLOWED_TARGET_STATUSES.includes(status)) {
        throw new Error(`Invalid purchase return status: ${status}`);
      }

      // 🛑 Critical Fix: For statuses with side-effects (Approved, Returned, Credited, Closed),
      // we must iterate and call the respective logic methods (changeStatus handles delegation).
      const STATUSES_WITH_SIDE_EFFECTS = ['Approved', 'Returned', 'Credited', 'Closed'];

      if (STATUSES_WITH_SIDE_EFFECTS.includes(status)) {
        const results = [];
        let updatedCount = 0;
        let failedCount = 0;

        for (const id of ids) {
          try {
            await this.changeStatus(id, status, { actorUserId: userId });
            updatedCount++;
            results.push({ id, success: true });
          } catch (error) {
            console.error(`Failed to update status to ${status} for PR ${id}:`, error);
            failedCount++;
            results.push({ id, success: false, message: error.message });
          }
        }

        return {
          total: ids.length,
          updated: updatedCount,
          failed: failedCount,
          results,
          message: `Bulk status update to '${status}' completed`,
        };
      }

      // For statuses like 'Cancelled' or 'OnHold', we can use bulk update if no side-effects exist.
      // However, if strict validation is needed, iteration is safer, but updateMany is requested for "others" implicitly?
      // Keeping updateMany for Cancelled as clearly simpler.

      const Model = await this._getPurchaseReturnModel();

      /**
       * ✅ Allowed source statuses based on target status
       */
      let allowedCurrentStatuses = [];

      // DRAFT → APPROVED / CREDITED
      if (status === 'Approved') {
        allowedCurrentStatuses = ['Draft'];
      }

      // APPROVED → RETURNED
      // (Handled above via iteration, but keeping for completeness if logic changes)
      if (status === 'Returned') {
        allowedCurrentStatuses = ['Approved', 'Draft'];
      }

      // RETURNED → CREDITED
      if (status === 'Credited') {
        allowedCurrentStatuses = ['Returned', 'Approved', 'Draft'];
      }

      // APPROVED → CANCELLED
      if (status === 'Cancelled') {
        allowedCurrentStatuses = ['Approved', 'Draft'];
      }

      if (allowedCurrentStatuses.length === 0) {
        // Fallback for other statuses to allow generic updates if needed,
        // or throw if strict.
        // For now, if not in above map, we might want to restrict or allow all?
        // Assuming strict based on previous code.
        if (!['PendingApproval', 'OnHold'].includes(status)) {
          throw new Error(`Invalid status transition to ${status}`);
        }
      }

      const query = {
        _id: { $in: ids },
        businessId,
      };

      if (allowedCurrentStatuses.length > 0) {
        query.status = { $in: allowedCurrentStatuses };
      }

      const now = new Date();

      const updateData = {
        status,
        updatedBy: userId,
        updatedAt: now,
      };

      // 🔹 APPROVED
      if (status === 'Approved') {
        updateData.approvedBy = userId;
        updateData.approvedAt = now;
      }

      // 🔹 RETURNED - (Handled block above covers this, but if we fall through for some reason)
      if (status === 'Returned') {
        updateData.returnedBy = userId;
        updateData.returnedAt = now;
      }

      // 🔹 CREDITED
      if (status === 'Credited') {
        updateData.creditedBy = userId;
        updateData.creditedAt = now;
        updateData['totals.balanceDue'] = 0;
      }

      // 🔹 CANCELLED
      if (status === 'Cancelled') {
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
        `Error updating purchase return status: ${error.message}`,
      );
    }
  }


  async buildInvoiceDTO(id) {
    await this._ensureRefModels();
    const Model = await this.getModelRef();
    // Ensure Product model is loaded
    const Product = await this.getModel('Product');

    const pr = await Model.findById(id)
      .populate([
        // Added 'fullAddress' to selection based on user data
        { path: 'supplierId', select: 'name email phone gstin fullAddress' },
        {
          path: 'purchaseOrderId',
          select: 'orderDetails.poNumber orderDetails.storeName',
        },
      ])
      .lean();

    if (!pr) throw new Error('Purchase return not found');

    if (!['Returned', 'Credited', 'Closed'].includes(pr.status)) {
      throw new Error('Invoice can be generated only for Returned/Credited/Closed returns');
    }

    /** ---------------------------------------
     * Fetch Business
     --------------------------------------- */
    // Ensure Business is imported or available.
    const Business = mongoose.models.Business;
    const GeneralSettings = mongoose.models.GeneralSettings;

    if (!this.businessId) throw new Error('Business ID context is missing');

    const [businessDoc, settings] = await Promise.all([
      Business.findById(this.businessId).select('businessName').lean(),
      GeneralSettings.findOne().lean()
    ]);

    if (!businessDoc && !settings) throw new Error('Business details not found');

    let businessAddressStr = '';
    if (settings?.businessAddress) {
      const addr = settings.businessAddress;
      businessAddressStr = [
        addr.shopNumber,
        addr.buildingName,
        addr.area,
        addr.landmark,
        addr.city,
        addr.state,
        addr.country,
        addr.postalCode
      ].filter(Boolean).join(', ');
    }

    /** ---------------------------------------
     * Fetch Products using productId
     --------------------------------------- */
    const productIds = pr.items
      .map(i => i.productId)
      .filter(Boolean)
      .map(id => (id && id.toString ? id.toString() : String(id)));

    // Use Product model instance we fetched
    const products = await Product.find({
      _id: { $in: productIds },
    })
      .select('productName SKU')
      .lean();

    /** ---------------------------------------
     * Build product map for fast lookup
     --------------------------------------- */
    const productMap = new Map(
      products.map(p => [p._id.toString(), p])
    );

    /** ---------------------------------------
     * Build Invoice DTO
     --------------------------------------- */
    return {
      invoiceType: 'PURCHASE_RETURN',
      invoiceNumber:
        pr.creditNoteNumber || this._generatePurchaseReturnNumber(),
      invoiceDate: pr.returnDate,
      reason: pr.reason || null, // Included reason as per data

      business: {
        name: settings?.appName || businessDoc?.businessName || 'Your Business',
        address: businessAddressStr || 'N/A',
        gstin: 'N/A',
        phone: settings?.contactNumber || 'N/A',
        email: settings?.inquiryEmail || 'N/A',
      },

      supplier: {
        name: pr.supplierId?.name,
        email: pr.supplierId?.email,
        phone: pr.supplierId?.phone,
        gstin: pr.supplierId?.gstin,
        address: pr.supplierId?.fullAddress || pr.supplierId?.address || null, // Added address mapping
      },

      purchaseOrder: {
        poNumber: pr.purchaseOrderId?.orderDetails?.poNumber,
        storeName:
          pr.purchaseOrderId?.orderDetails?.storeName || pr.storeName,
      },

      items: pr.items.map((item, idx) => {
        const productIdStr = item.productId && item.productId.toString ? item.productId.toString() : String(item.productId);
        const product = productMap.get(productIdStr);

        return {
          srNo: idx + 1,
          productId: item.productId,
          variantId: item.variantId,

          // Safe access with fallbacks
          productName: product?.productName || item.productName || 'Unknown Product',
          sku: product?.SKU || item.sku || 'N/A',

          returnQty: item.returnQty,
          unitCost: item.unitCost,
          discountPerUnit: item.discountPerUnit || 0,
          taxRate: item.taxRatePercent || 0,
          taxAmount: item.taxAmount || 0,
          lineSubtotal: item.lineSubtotal,
          lineTotal: item.lineTotal,
        };
      }),

      summary: {
        itemsSubtotal: pr.itemsSubtotal,
        taxTotal: pr.itemsTaxTotal,
        shippingAdjustment: pr.shippingAdjustment || 0,
        otherAdjustment: pr.otherAdjustment || 0,
        totalCreditAmount: pr.totalCreditAmount,
        receivedCreditAmount: pr.receivedCreditAmount || 0,
        balanceCreditAmount: pr.balanceCreditAmount,
      },

      meta: {
        purchaseReturnId: pr._id,
        purchaseReturnNumber:
          pr.creditNoteNumber || this._generatePurchaseReturnNumber(),
        status: pr.status,
        createdAt: pr.createdAt,
      },
    };
  }

  async changeStatus(id, nextStatus, options = {}) {
    const { note, credit, actorUserId } = options;

    // Delegate to specific methods based on status
    if (nextStatus === 'Approved') {
      return this.approve(id, actorUserId);
    }

    if (nextStatus === 'Returned') {
      return this.returnGoods(id, {
        actorUserId,
        note,
      });
    }

    if (nextStatus === 'Credited') {
      const result = await this.recordCredit(id, credit, actorUserId);

      // ✅ Explicitly ensure balance is zeroed as requested
      // We do this by updating the document directly after recordCredit succeeds (if needed)
      // or ensure recordCredit logic allows "full settlement".
      // Since recordCredit might not set 'totals.balanceDue' (if it's a virtual or custom field), 
      // we force update it here if schema allows, consistent with user request.

      const Model = await this._getPurchaseReturnModel();
      await Model.updateOne(
        { _id: id },
        {
          $set: {
            'totals.balanceDue': 0
          }
        }
      );

      // Fetch fresh to return
      return await this.getById(id);
    }

    if (nextStatus === 'Closed') {
      return this.close(id, actorUserId);
    }

    throw new Error(`Unsupported status transition to: ${nextStatus}`);
  }

  async updateStatus(id, nextStatus, options = {}) {
    return this.changeStatus(id, nextStatus, options);
  }

  _generatePurchaseReturnNumber() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const seq = String(now.getTime()).slice(-6);
    return `PR-${y}${m}${d}-${seq}`;
  }

  _generateInvoiceNumber() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const seq = String(now.getTime()).slice(-6);
    return `INV-${y}${m}${d}-${seq}`;
  }

}

export default PurchaseReturnServices;
