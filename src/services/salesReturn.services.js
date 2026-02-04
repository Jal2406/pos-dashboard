import mongoose from 'mongoose';
import { BaseService } from '../utils/index.js';
import {
  SalesReturnSchema,
  Business,
  CustomerSchema,
} from '../models/index.js';
import SalesService from './sales.services.js';
import ProductServices from './product.services.js';
import StockServices from './stock.services.js';
import StockBatchServices from './stockBatch.services.js';
import CustomerLoyaltyPointService from './customerLoyaltyPoint.services.js';
import GiftCardService from './giftCard.services.js';

const SALES_RETURN_STATUSES = Object.freeze({
  PENDING: 'pending',
  COMPLETE: 'complete',
});

class SalesReturnServices extends BaseService {
  constructor(businessId) {
    if (!businessId) {
      throw new Error('SalesReturnServices initialized without businessId');
    }
    super({
      modelName: 'SalesReturn',
      schema: SalesReturnSchema,
      collection: 'salesreturns',
      businessId,
    });
    this.models = null;
    this.businessId = businessId;
    this._salesService = new SalesService(businessId);
    this._productService = new ProductServices(businessId);
    this._stockService = new StockServices(businessId);
    this._stockBatchService = new StockBatchServices(businessId);
    this._customerLoyaltyPointService = new CustomerLoyaltyPointService(
      businessId,
    );
    this._giftCardService = new GiftCardService(businessId);
  }

  async _getSalesReturnModel() {
    return this.getModel(
      'SalesReturn',
      SalesReturnSchema,
      'salesreturns',
    );
  }

  /**
   * Validate that the business exists before performing operations
   */
  async _validateBusinessExists() {
    if (!this.businessId) {
      return;
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
      if (error.name === 'CastError' || error.kind === 'ObjectId') {
        throw new Error(`Invalid business ID format: ${this.businessId}`);
      }
      if (error.message?.includes('does not exist')) {
        throw error;
      }
      throw new Error(
        `Business validation failed: ${error.message || String(error)}`,
      );
    }
  }

  async _ensureRefModels() {
    if (this.models) return;
    const [Sales, Product, Stock, Customer] = await Promise.all([
      this._salesService.getCachedModel(),
      this._productService.getModelRef(),
      this._stockService.getStockModel(),
      this.getModel('Customer', CustomerSchema, 'customers'),
    ]);
    this.models = {
      Sales,
      Product,
      Stock,
      Customer,
    };
  }

  static isValidStatusTransition(current, next) {
    if (current === next) return true;
    const allowed = {
      pending: new Set(['complete']),
      complete: new Set([]), // Once complete, cannot change
    };
    return Boolean(allowed[current]?.has(next));
  }

  /**
   * Calculate return amounts for a line item following global standard rules
   * @param {Object} item - Return item with original sale data
   * @returns {Object} Calculated return amounts
   */
  _calculateReturnAmounts(item) {
    const qty = Number(item.returnQuantity || 0);
    const soldQty = Number(item.soldQuantity || 0);
    const priceIncl = Number(item.sellingPrice || 0);

    const originalLineDiscount = Number(
      item.originalLineDiscountAmount || 0,
    );
    const discountPercent = Number(item.discountPercent || 0);

    const inclusiveRate = Number(item.inclusiveTaxRatePercent || 0);
    const exclusiveRate = Number(item.exclusiveTaxRatePercent || 0);

    // Step 1: gross = inclusive price × returned qty
    const grossAmount = Math.max(0, priceIncl * qty);

    // Step 2: remove inclusive GST to get base before discounts
    let baseBeforeDiscount = grossAmount;
    if (inclusiveRate > 0) {
      baseBeforeDiscount = grossAmount / (1 + inclusiveRate / 100);
    }

    // Step 3: proportional discount reversal from original line
    let discountFromLine = 0;
    if (soldQty > 0 && originalLineDiscount > 0) {
      const perUnitDiscount = originalLineDiscount / soldQty;
      discountFromLine = perUnitDiscount * qty;
    }

    // Optional extra percentage discount
    let percentDiscount = 0;
    if (!(soldQty > 0 && originalLineDiscount > 0) && discountPercent > 0) {
      percentDiscount =
        (baseBeforeDiscount * Math.min(discountPercent, 100)) / 100;
    }

    const discountAmount = Math.max(0, discountFromLine + percentDiscount);

    // Return Base = baseBeforeDiscount − proportional discounts
    const taxableValue = Math.max(0, baseBeforeDiscount - discountAmount);

    // Step 4: tax split (inclusive + exclusive) on the Return Base
    const inclusiveTaxAmount = Math.max(
      0,
      (taxableValue * inclusiveRate) / 100,
    );
    const exclusiveTaxAmount = Math.max(
      0,
      (taxableValue * exclusiveRate) / 100,
    );
    const taxAmount = inclusiveTaxAmount + exclusiveTaxAmount;

    // Refund = (Return Base × (1 + inclusiveRate)) + exclusive GST
    const netAmount = taxableValue + inclusiveTaxAmount + exclusiveTaxAmount;

    return {
      grossAmount,
      discountAmount,
      taxableValue,
      inclusiveTaxAmount,
      exclusiveTaxAmount,
      taxAmount,
      netAmount,
    };
  }

  /**
   * Create a draft sales return
   * @param {Object} payload - Return payload
   * @param {String} userId - User ID creating the return
   * @returns {Promise<Object>} Created sales return
   */
  async createDraft(payload, userId) {
    await this._validateBusinessExists();
    await this._ensureRefModels();

    const data = { ...payload };
    if (!data.salesId) throw new Error('salesId is required');
    if (!data.customerId) throw new Error('customerId is required');
    if (!data.invoiceNumber) throw new Error('invoiceNumber is required');
    if (!Array.isArray(data.items) || data.items.length === 0) {
      throw new Error('At least one return item is required');
    }

    // Fetch original sale
    const sale = await this.models.Sales.findById(data.salesId).lean();
    if (!sale) throw new Error('Sale not found');

    // Validate invoice number matches
    if (sale.invoiceNumber !== data.invoiceNumber) {
      throw new Error('Invoice number does not match the sale');
    }

    // Validate customer matches
    const saleCustomerId = sale.customer?.toString() || sale.customer;
    const returnCustomerId = data.customerId?.toString() || data.customerId;
    if (saleCustomerId !== returnCustomerId) {
      throw new Error('Customer does not match the sale');
    }

    // Enrich return items with original sale data
    const enrichedItems = await this._enrichReturnItems(
      data.items,
      sale,
      data.salesId,
    );

    data.items = enrichedItems;
    data.status = SALES_RETURN_STATUSES.PENDING;
    if (!data.returnDate) data.returnDate = new Date();
    if (userId) data.createdBy = userId;

    // Pre-validate hook will calculate amounts
    return await super.create(data);
  }

  /**
   * Enrich return items with original sale line data
   * @param {Array} returnItems - Items to return
   * @param {Object} sale - Original sale document
   * @param {String} salesId - Sale ID
   * @returns {Promise<Array>} Enriched return items
   */
  async _enrichReturnItems(returnItems, sale, salesId) {
    const saleProducts = sale.products || [];
    const enriched = [];

    for (const returnItem of returnItems) {
      const productId =
        returnItem.productId?.toString() || returnItem.productId;
      const variantId =
        returnItem.variantId?.toString() || returnItem.variantId;

      // Find matching sale line item
      let saleLineItem = null;
      for (const sp of saleProducts) {
        const spProductId = sp.product?.toString() || sp.product;
        const spVariantId = sp.variantCombination?.[0]?.variantId?.toString();

        if (
          spProductId === productId &&
          (!variantId || spVariantId === variantId)
        ) {
          saleLineItem = sp;
          break;
        }
      }

      if (!saleLineItem) {
        throw new Error(
          `Product ${productId} not found in sale ${salesId}`,
        );
      }

      // Extract tax rates from sale line item
      const taxSnapshots = saleLineItem.taxSnapshots || [];
      let inclusiveRate = 0;
      let exclusiveRate = 0;

      for (const taxSnap of taxSnapshots) {
        if (taxSnap.taxType === 'Inclusive') {
          if (taxSnap.valueType === 'Percentage') {
            inclusiveRate += Number(taxSnap.percentage || 0);
          }
        } else if (taxSnap.taxType === 'Exclusive') {
          if (taxSnap.valueType === 'Percentage') {
            exclusiveRate += Number(taxSnap.percentage || 0);
          }
        }
      }

      // Build enriched item
      const enrichedItem = {
        salesItemId: saleLineItem._id,
        productId: returnItem.productId,
        variantId: returnItem.variantId || null,
        SKU: returnItem.SKU || saleLineItem.SKU,
        productName: returnItem.productName || saleLineItem.productName,
        hasVariation: saleLineItem.hasVariation || false,
        variantCombination: saleLineItem.variantCombination || [],
        soldQuantity: Number(saleLineItem.quantity || 0),
        returnQuantity: Number(returnItem.returnQuantity || 0),
        originalLineDiscountAmount: Number(
          saleLineItem.discountAmount || 0,
        ),
        sellingPrice: Number(saleLineItem.sellingPrice || 0),
        inclusiveTaxRatePercent: inclusiveRate,
        exclusiveTaxRatePercent: exclusiveRate,
        reason: returnItem.reason || null,
        notes: returnItem.notes || null,
      };

      // Validate return quantity doesn't exceed sold quantity
      if (enrichedItem.returnQuantity > enrichedItem.soldQuantity) {
        throw new Error(
          `Return quantity (${enrichedItem.returnQuantity}) exceeds sold quantity (${enrichedItem.soldQuantity}) for product ${enrichedItem.productName}`,
        );
      }

      enriched.push(enrichedItem);
    }

    return enriched;
  }

  /**
   * Update sales return by ID
   * @param {String} id - Return ID
   * @param {Object} data - Update data
   * @param {String} userId - User ID
   * @returns {Promise<Object>} Updated return
   */
  async updateById(id, data, userId) {
    await this._ensureRefModels();
    const Model = await this.getModelRef();
    const doc = await Model.findById(id).select('status').lean();

    if (!doc) {
      throw new Error(`Sales return with id ${id} not found`);
    }

    if (doc.status === SALES_RETURN_STATUSES.COMPLETE) {
      throw new Error(
        `Cannot update sales return details when status is ${doc.status}.`,
      );
    }

    if (userId) {
      data.updatedBy = userId;
    }

    // If items are being updated, re-enrich them
    if (data.items && Array.isArray(data.items) && data.items.length > 0) {
      const sale = await this.models.Sales.findById(doc.salesId).lean();
      if (!sale) throw new Error('Original sale not found');
      data.items = await this._enrichReturnItems(
        data.items,
        sale,
        doc.salesId,
      );
    }

    return await super.updateById(id, data);
  }

  /**
   * Complete sales return (increment stock, update sale, process refunds)
   * Only "complete" status triggers stock updates
   * @param {String} id - Return ID
   * @param {Object} options - Options { actorUserId, note, refund }
   * @returns {Promise<Object>} Completed return
   */
  async completeReturn(id, options = {}) {
    const { actorUserId, note, refund } = options || {};
    return await this.executeTenantTransaction(async (session) => {
      await this._ensureRefModels();
      const Model = await this.getModelRef();
      const salesReturn = await Model.findById(id).session(session);

      if (!salesReturn) {
        throw new Error(`Sales return ${id} not found`);
      }
      if (salesReturn.status !== SALES_RETURN_STATUSES.PENDING) {
        throw new Error(
          `Return can be completed only from pending state. Current: ${salesReturn.status}`,
        );
      }

      const sale = await this.models.Sales.findById(
        salesReturn.salesId,
      ).session(session);
      if (!sale) throw new Error('Linked sale not found');

      const storeId = sale.store?.toString() || sale.store;
      if (!storeId) throw new Error('Sale store is not set');

      // Increment stock for returned items (only when status is complete)
      await this._incrementStockForReturnItems(
        salesReturn,
        storeId,
        actorUserId,
        session,
      );

      // Update sale with return tracking
      await this._updateSaleWithReturn(sale, salesReturn, actorUserId, session);

      // Process refunds if provided
      if (refund) {
        await this._processRefund(salesReturn, sale, refund, actorUserId, session);
      }

      // Update return status to complete
      salesReturn.status = SALES_RETURN_STATUSES.COMPLETE;
      if (actorUserId) salesReturn.updatedBy = actorUserId;
      if (note) {
        salesReturn.reason = salesReturn.reason
          ? `${salesReturn.reason} | ${note}`
          : note;
      }
      await salesReturn.save({ session });

      return salesReturn.toObject();
    });
  }

  /**
   * Increment stock for returned items
   * @param {Object} salesReturn - Sales return document
   * @param {String} storeId - Store ID
   * @param {String} actorUserId - User ID
   * @param {Object} session - MongoDB session
   */
  async _incrementStockForReturnItems(
    salesReturn,
    storeId,
    actorUserId,
    session,
  ) {
    const Stock = await this._stockService.getStockModel();

    for (const item of salesReturn.items || []) {
      const productId = item.productId;
      const qty = Number(item.returnQuantity || 0);
      if (!productId || qty <= 0) continue;

      const sku = item.SKU
        ? item.SKU.trim().toUpperCase()
        : null;
      if (!sku) {
        console.log(
          `Skipping item - no SKU found for productId: ${productId}`,
        );
        continue;
      }

      const productIdObj =
        productId instanceof mongoose.Types.ObjectId
          ? productId
          : new mongoose.Types.ObjectId(String(productId));

      // Increment stock (positive quantity)
      await Stock.increment(
        productIdObj,
        storeId,
        sku,
        qty,
        item.hasVariation || false,
        actorUserId,
        { session },
      );

      // Update stock batches if service available
      if (this._stockBatchService) {
        await this._stockBatchService.incrementStockFIFO(
          productIdObj,
          storeId,
          sku,
          qty,
          actorUserId,
          {
            session,
            sourceDocumentType: 'sales_return',
            sourceDocumentId: salesReturn._id,
          },
        );
      }
    }
  }

  /**
   * Update sale document with return tracking
   * @param {Object} sale - Sale document
   * @param {Object} salesReturn - Sales return document
   * @param {String} actorUserId - User ID
   * @param {Object} session - MongoDB session
   */
  async _updateSaleWithReturn(sale, salesReturn, actorUserId, session) {
    if (!Array.isArray(sale.products)) {
      sale.products = [];
    }

    // Track returned quantities per product line
    for (const returnItem of salesReturn.items || []) {
      const returnProductId =
        returnItem.productId?.toString() || returnItem.productId;
      const returnVariantId =
        returnItem.variantId?.toString() || returnItem.variantId;
      const returnQty = Number(returnItem.returnQuantity || 0);

      for (const saleProduct of sale.products) {
        const saleProductId =
          saleProduct.product?.toString() || saleProduct.product;
        const saleVariantId =
          saleProduct.variantCombination?.[0]?.variantId?.toString();

        if (
          saleProductId === returnProductId &&
          (!returnVariantId || saleVariantId === returnVariantId)
        ) {
          // Update returned quantity
          saleProduct.returnedQuantity =
            (Number(saleProduct.returnedQuantity || 0) + returnQty);
          break;
        }
      }
    }

    // Initialize returnLogs if not exists
    if (!Array.isArray(sale.returnLogs)) {
      sale.returnLogs = [];
    }

    // Add return log entry
    sale.returnLogs.push({
      returnedAt: salesReturn.returnDate || new Date(),
      salesReturnId: salesReturn._id,
      returnedBy: actorUserId || salesReturn.createdBy,
      totalReturnAmount: salesReturn.totalRefundAmount || 0,
      items: salesReturn.items.map((item) => ({
        productId: item.productId,
        variantId: item.variantId || undefined,
        SKU: item.SKU || undefined,
        quantity: item.returnQuantity || 0,
        returnAmount: item.netAmount || 0,
      })),
      note: salesReturn.reason || undefined,
    });

    sale.markModified('products');
    sale.markModified('returnLogs');
    await sale.save({ session });
  }

  /**
   * Record refund with proper split (loyalty first, then cash)
   * @param {String} id - Return ID
   * @param {Object} refund - Refund data { amount, method, reference, notes, date }
   * @param {String} userId - User ID
   * @returns {Promise<Object>} Updated return
   */
  async recordRefund(id, refund, userId) {
    const { amount, method, reference, notes, date } = refund || {};

    return await this.executeTenantTransaction(async (session) => {
      const Model = await this.getModelRef();
      const doc = await Model.findById(id).session(session);
      if (!doc) throw new Error(`Sales return ${id} not found`);

      if (doc.status !== SALES_RETURN_STATUSES.COMPLETE) {
        throw new Error(
          `Refund can be recorded only when status is complete. Current: ${doc.status}`,
        );
      }

      // Get original sale to determine payment split
      const sale = await this.models.Sales.findById(doc.salesId).session(
        session,
      );
      if (!sale) throw new Error('Original sale not found');

      // Calculate refund split: loyalty first, then cash
      const refundSplit = this._calculateRefundSplit(
        doc.totalRefundAmount,
        doc.refundedAmount,
        sale,
      );

      let refundAmount = amount;
      if (
        refundAmount == null ||
        !Number.isFinite(Number(refundAmount))
      ) {
        refundAmount = refundSplit.remaining;
      } else {
        refundAmount = Number(refundAmount);
        if (refundAmount <= 0) {
          throw new Error('Refund amount must be positive');
        }
      }

      // Create refund transactions following the split
      const refundTransactions = [];
      let remainingRefund = refundAmount;

      // Refund loyalty first
      if (refundSplit.loyaltyRemaining > 0 && remainingRefund > 0) {
        const loyaltyRefund = Math.min(
          refundSplit.loyaltyRemaining,
          remainingRefund,
        );
        refundTransactions.push({
          amount: loyaltyRefund,
          method: 'loyalty',
          date: date ? new Date(date) : new Date(),
          reference: reference || undefined,
          notes: notes || undefined,
        });
        remainingRefund -= loyaltyRefund;

        // Credit loyalty points back to customer
        if (sale.loyalty?.pointsRedeemed > 0 && doc.customerId) {
          await this._creditLoyaltyPoints(
            doc.customerId,
            sale.loyalty.pointsRedeemed,
            doc._id,
            session,
          );
        }
      }

      // Refund gift card if applicable
      if (refundSplit.giftCardRemaining > 0 && remainingRefund > 0) {
        const giftCardRefund = Math.min(
          refundSplit.giftCardRemaining,
          remainingRefund,
        );
        refundTransactions.push({
          amount: giftCardRefund,
          method: 'gift_card',
          date: date ? new Date(date) : new Date(),
          reference: reference || undefined,
          notes: notes || undefined,
        });
        remainingRefund -= giftCardRefund;

        // Credit gift card back
        if (sale.giftCard?.giftCardId && this._giftCardService) {
          await this._giftCardService.creditAmount(
            sale.giftCard.giftCardId,
            giftCardRefund,
            {
              session,
              reference: `Sales Return ${doc._id}`,
            },
          );
        }
      }

      // Remaining refund goes to cash/other payment methods
      if (remainingRefund > 0) {
        refundTransactions.push({
          amount: remainingRefund,
          method: method || 'cash',
          date: date ? new Date(date) : new Date(),
          reference: reference || undefined,
          notes: notes || undefined,
        });
      }

      // Add transactions to return
      doc.refundTransactions = Array.isArray(doc.refundTransactions)
        ? doc.refundTransactions
        : [];
      doc.refundTransactions.push(...refundTransactions);

      // Update refunded amount
      const totalReceived = doc.refundTransactions.reduce(
        (sum, tx) => sum + Number(tx.amount || 0),
        0,
      );
      const totalRefund = Number(doc.totalRefundAmount || 0);
      doc.refundedAmount = Math.min(totalReceived, totalRefund);

      // Status remains complete (refunds are tracked separately)

      if (userId) doc.updatedBy = userId;
      await doc.save({ session });

      return doc.toObject();
    });
  }

  /**
   * Calculate refund split (loyalty first, then cash)
   * @param {Number} totalRefund - Total refund amount
   * @param {Number} alreadyRefunded - Already refunded amount
   * @param {Object} sale - Original sale
   * @returns {Object} Refund split breakdown
   */
  _calculateRefundSplit(totalRefund, alreadyRefunded, sale) {
    const remaining = Math.max(0, totalRefund - alreadyRefunded);

    // Get original payment breakdown
    const loyaltyRedeemed = Number(sale.loyalty?.redemptionValue || 0);
    const giftCardApplied = Number(sale.giftCard?.discountAmount || 0);
    const totalPaid = Number(sale.billingSummary?.amountPaid || 0);

    // Calculate proportional refunds
    let loyaltyRemaining = 0;
    let giftCardRemaining = 0;

    if (totalPaid > 0) {
      // Proportional to original payment
      const loyaltyRatio = loyaltyRedeemed / totalPaid;
      const giftCardRatio = giftCardApplied / totalPaid;

      loyaltyRemaining = Math.min(
        remaining,
        remaining * loyaltyRatio,
        loyaltyRedeemed,
      );
      giftCardRemaining = Math.min(
        remaining - loyaltyRemaining,
        remaining * giftCardRatio,
        giftCardApplied,
      );
    }

    return {
      remaining,
      loyaltyRemaining,
      giftCardRemaining,
      cashRemaining: Math.max(0, remaining - loyaltyRemaining - giftCardRemaining),
    };
  }

  /**
   * Credit loyalty points back to customer
   * @param {String} customerId - Customer ID
   * @param {Number} points - Points to credit
   * @param {String} salesReturnId - Sales return ID
   * @param {Object} session - MongoDB session
   */
  async _creditLoyaltyPoints(customerId, points, salesReturnId, session) {
    if (!this._customerLoyaltyPointService || !points || points <= 0) {
      return;
    }

    try {
      await this._customerLoyaltyPointService.addPoints(
        customerId,
        {
          points: points,
          reason: 'Sales Return Refund',
          referenceId: salesReturnId,
          referenceType: 'sales_return',
        },
        { session },
      );
    } catch (error) {
      console.error('Failed to credit loyalty points:', error);
      // Don't throw - refund should still proceed
    }
  }

  /**
   * Process refunds during completion
   * @param {Object} salesReturn - Sales return document
   * @param {Object} sale - Original sale document
   * @param {Object} refund - Refund data
   * @param {String} actorUserId - User ID
   * @param {Object} session - MongoDB session
   */
  async _processRefund(salesReturn, sale, refund, actorUserId, session) {
    const { amount, method, reference, notes, date } = refund || {};

    // Calculate refund split: loyalty first, then cash
    const refundSplit = this._calculateRefundSplit(
      salesReturn.totalRefundAmount,
      salesReturn.refundedAmount,
      sale,
    );

    let refundAmount = amount;
    if (
      refundAmount == null ||
      !Number.isFinite(Number(refundAmount))
    ) {
      refundAmount = refundSplit.remaining;
    } else {
      refundAmount = Number(refundAmount);
      if (refundAmount <= 0) {
        return; // No refund to process
      }
    }

    // Create refund transactions following the split
    const refundTransactions = [];
    let remainingRefund = refundAmount;

    // Refund loyalty first
    if (refundSplit.loyaltyRemaining > 0 && remainingRefund > 0) {
      const loyaltyRefund = Math.min(
        refundSplit.loyaltyRemaining,
        remainingRefund,
      );
      refundTransactions.push({
        amount: loyaltyRefund,
        method: 'loyalty',
        date: date ? new Date(date) : new Date(),
        reference: reference || undefined,
        notes: notes || undefined,
      });
      remainingRefund -= loyaltyRefund;

      // Credit loyalty points back to customer
      if (sale.loyalty?.pointsRedeemed > 0 && salesReturn.customerId) {
        await this._creditLoyaltyPoints(
          salesReturn.customerId,
          sale.loyalty.pointsRedeemed,
          salesReturn._id,
          session,
        );
      }
    }

    // Refund gift card if applicable
    if (refundSplit.giftCardRemaining > 0 && remainingRefund > 0) {
      const giftCardRefund = Math.min(
        refundSplit.giftCardRemaining,
        remainingRefund,
      );
      refundTransactions.push({
        amount: giftCardRefund,
        method: 'gift_card',
        date: date ? new Date(date) : new Date(),
        reference: reference || undefined,
        notes: notes || undefined,
      });
      remainingRefund -= giftCardRefund;

      // Credit gift card back
      if (sale.giftCard?.giftCardId && this._giftCardService) {
        await this._giftCardService.creditAmount(
          sale.giftCard.giftCardId,
          giftCardRefund,
          {
            session,
            reference: `Sales Return ${salesReturn._id}`,
          },
        );
      }
    }

    // Remaining refund goes to cash/other payment methods
    if (remainingRefund > 0) {
      refundTransactions.push({
        amount: remainingRefund,
        method: method || 'cash',
        date: date ? new Date(date) : new Date(),
        reference: reference || undefined,
        notes: notes || undefined,
      });
    }

    // Add transactions to return
    salesReturn.refundTransactions = Array.isArray(salesReturn.refundTransactions)
      ? salesReturn.refundTransactions
      : [];
    salesReturn.refundTransactions.push(...refundTransactions);

    // Update refunded amount
    const totalReceived = salesReturn.refundTransactions.reduce(
      (sum, tx) => sum + Number(tx.amount || 0),
      0,
    );
    const totalRefund = Number(salesReturn.totalRefundAmount || 0);
    salesReturn.refundedAmount = Math.min(totalReceived, totalRefund);
  }

  /**
   * Change status with validation
   * @param {String} id - Return ID
   * @param {String} nextStatus - Next status
   * @param {Object} options - Options { actorUserId, note, refund }
   * @returns {Promise<Object>} Updated return
   */
  async _changeStatus(id, nextStatus, options = {}) {
    return await this.executeTenantTransaction(async (session) => {
      const Model = await this.getModelRef();
      const doc = await Model.findById(id).session(session);
      if (!doc) throw new Error(`Sales return ${id} not found`);

      const allowedStatuses =
        Model.schema.path('status').options.enum || [];
      if (!allowedStatuses.includes(nextStatus)) {
        throw new Error(`Invalid status: ${nextStatus}`);
      }

      if (
        !SalesReturnServices.isValidStatusTransition(doc.status, nextStatus)
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

  /**
   * Change status (public method)
   * @param {String} id - Return ID
   * @param {String} nextStatus - Next status ('pending' or 'complete')
   * @param {Object} options - Options { note, refund, actorUserId }
   * @returns {Promise<Object>} Updated return
   */
  async changeStatus(id, nextStatus, options = {}) {
    const { note, refund, actorUserId } = options;

    // Only allow transition from pending to complete
    if (nextStatus === SALES_RETURN_STATUSES.COMPLETE) {
      return this.completeReturn(id, {
        actorUserId,
        note,
        refund,
      });
    }

    // For pending status, use generic change (though typically only used on creation)
    return this._changeStatus(id, nextStatus, options);
  }

  /**
   * Get sales return by ID with populated data
   * @param {String} id - Return ID
   * @returns {Promise<Object>} Sales return
   */
  async getById(id) {
    try {
      await this._ensureRefModels();
      this.validateObjectId(id);
      const Model = await this.getModelRef();

      const doc = await Model.findById(id)
        .populate('customerId', 'customerName customerCode phone email')
        .populate('salesId', 'invoiceNumber saleDate billingSummary')
        .populate('createdBy', 'name email')
        .populate('updatedBy', 'name email')
        .lean();

      if (!doc) {
        throw new Error(`Sales return with id ${id} not found`);
      }

      return doc;
    } catch (error) {
      throw new Error(`Error retrieving sales return: ${error.message}`);
    }
  }

  /**
   * List sales returns with filters
   * @param {Object} queryParams - Query parameters
   * @returns {Promise<Object>} Paginated list
   */
  async list(queryParams = {}) {
    const {
      page = 1,
      limit = 10,
      search = '',
      status,
      salesId,
      customerId,
      all,
    } = queryParams;

    const ALLOWED_STATUSES = ['pending', 'complete'];

    if (status && !ALLOWED_STATUSES.includes(status)) {
      throw new Error(
        `Invalid status. Allowed values: ${ALLOWED_STATUSES.join(', ')}`,
      );
    }

    const filters = {};
    if (status) filters.status = status;
    if (salesId) filters.salesId = salesId;
    if (customerId) filters.customerId = customerId;

    const searchFields = ['invoiceNumber', 'reason', 'returnInvoiceNumber'];

    const populate = [
      { path: 'customerId', select: 'customerName customerCode phone' },
      {
        path: 'salesId',
        select: 'invoiceNumber saleDate billingSummary.grandTotal',
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

    return await super.list(listParams);
  }

  /**
   * Delete sales return (soft delete or hard delete if draft/cancelled)
   * @param {String} id - Return ID
   * @returns {Promise<Object>} Deleted return
   */
  async deleteById(id) {
    const doc = await this.getById(id);
    if (!doc) throw new Error(`Sales return ${id} not found`);

    if (doc.status === SALES_RETURN_STATUSES.COMPLETE) {
      throw new Error(
        `Cannot delete sales return with status ${doc.status}. Only pending returns can be deleted.`,
      );
    }

    return await super.deleteById(id);
  }
}

export default SalesReturnServices;
