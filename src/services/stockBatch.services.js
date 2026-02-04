import { BaseService } from '../utils/index.js';
import { StockBatchSchema } from '../models/index.js';

class StockBatchServices extends BaseService {
  constructor(businessId) {
    if (!businessId) {
      throw new Error('StockBatchServices initialized without businessId');
    }
    super({
      modelName: 'StockBatch',
      schema: StockBatchSchema,
      collection: 'stockbatches',
      businessId,
    });
    
    // RBAC: Stock batches are store-scoped
    this.rbacConfig.storeScoped = true;
    this.rbacConfig.storeIdField = 'storeId';
  }

  _normalizeBatchCodeInput(value, { required = true } = {}) {
    if (value === undefined || value === null) {
      if (required) {
        throw new Error('batchCode is required');
      }
      return undefined;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error('batchCode must be a positive integer');
    }
    return Math.trunc(parsed);
  }

  async getAvailableQuantity(productId, storeId, SKU, batchCode) {
    const normalizedBatchCode = this._normalizeBatchCodeInput(batchCode);
    const StockBatchModel = await this.getModel();
    const row = await StockBatchModel.findOne({
      productId,
      storeId,
      SKU,
      batchCode: normalizedBatchCode,
      status: true,
      isDeleted: false,
    })
      .select({ quantity: 1, reservedQuantity: 1 })
      .lean();

    if (!row) return 0;
    const available = row.quantity - (row.reservedQuantity || 0);
    return Math.max(0, available);
  }

  async increment(
    productId,
    storeId,
    SKU,
    batchCode,
    delta,
    updatedBy = null,
  ) {
    if (!Number.isFinite(delta)) throw new Error('delta must be a number');
    const normalizedBatchCode = this._normalizeBatchCodeInput(batchCode);
    const StockBatchModel = await this.getModel();

    const setClause = { updatedBy };
    if (delta > 0) {
      setClause.lifecycleStatus = 'active';
      setClause.status = true;
    }

    const doc = await StockBatchModel.findOneAndUpdate(
      {
        productId,
        storeId,
        SKU,
        batchCode: normalizedBatchCode,
        isDeleted: false,
      },
      {
        $inc: { quantity: delta },
        $set: setClause,
      },
      { new: true },
    );

    if (!doc) {
      throw new Error('Batch not found');
    }

    if (doc.quantity < 0) {
      await StockBatchModel.updateOne(
        { _id: doc._id },
        { $inc: { quantity: -delta } },
      );
      throw new Error('Resulting quantity cannot be negative');
    }

    if (doc.quantity === 0) {
      doc.lifecycleStatus = 'consumed';
      doc.status = false;
      await doc.save();
    }

    return doc;
  }

  async reserveQuantity(batchId, amount, userId = null) {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Amount must be a positive number');
    }

    const StockBatchModel = await this.getModel();
    const doc = await StockBatchModel.findOneAndUpdate(
      {
        _id: batchId,
        isDeleted: false,
        status: true,
      },
      {
        $inc: { reservedQuantity: amount },
        $set: { updatedBy: userId },
      },
      { new: true },
    );

    if (!doc) {
      throw new Error('Batch not found or inactive');
    }

    if (doc.reservedQuantity > doc.quantity) {
      await StockBatchModel.updateOne(
        { _id: doc._id },
        { $inc: { reservedQuantity: -amount } },
      );
      throw new Error('Cannot reserve more than available quantity');
    }

    if (doc.availableQuantity === 0 && doc.lifecycleStatus === 'active') {
      doc.lifecycleStatus = 'reserved';
      await doc.save();
    }

    return doc;
  }

  async releaseReservedQuantity(batchId, amount, userId = null) {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Amount must be a positive number');
    }

    const StockBatchModel = await this.getModel();
    const doc = await StockBatchModel.findOneAndUpdate(
      { _id: batchId, isDeleted: false },
      {
        $inc: { reservedQuantity: -amount },
        $set: { updatedBy: userId },
      },
      { new: true },
    );

    if (!doc) {
      throw new Error('Batch not found');
    }

    if (doc.reservedQuantity < 0) {
      await StockBatchModel.updateOne(
        { _id: doc._id },
        { $inc: { reservedQuantity: amount } },
      );
      throw new Error('Reserved quantity cannot be negative');
    }

    if (doc.lifecycleStatus === 'reserved' && doc.availableQuantity > 0) {
      doc.lifecycleStatus = doc.isExpired ? 'expired' : 'active';
      doc.status = !doc.isExpired;
      await doc.save();
    }

    return doc;
  }

  async findExpiringSoon(storeId, days = 30, options = {}) {
    const now = new Date();
    const horizon = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const StockBatchModel = await this.getModel();

    const query = {
      storeId,
      isDeleted: false,
      expiryDate: { $gte: now, $lte: horizon },
    };

    if (options.productId) {
      query.productId = options.productId;
    }

    if (options.SKU) {
      query.SKU = options.SKU.trim().toUpperCase();
    }

    return StockBatchModel.find(query).sort({ expiryDate: 1 });
  }

  /**
   * Decrement stock using FIFO logic from batches
   * @param {String} productId
   * @param {String} storeId
   * @param {String} SKU
   * @param {Number} quantity
   * @param {String} updatedBy
   */
  async decrementStockFIFO(
    productId,
    storeId,
    SKU,
    quantity,
    updatedBy = null,
    options = {},
  ) {
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error('Quantity to decrement must be a positive number');
    }

    const StockBatchModel = await this.getModel();
    const normalizedSku = SKU ? SKU.trim().toUpperCase() : '';
    const session = options.session;

    // Find candidates sorted by FIFO (Expiry asc, Received asc)
    const batches = await StockBatchModel.find({
      productId,
      storeId,
      SKU: normalizedSku,
      quantity: { $gt: 0 },
      status: true,
      isDeleted: false,
    })
      .sort({ expiryDate: 1, receivedAt: 1 })
      .session(session);

    let remaining = quantity;

    for (const batch of batches) {
      if (remaining <= 0) break;

      const deduct = Math.min(batch.quantity, remaining);

      // Atomically decrement
      const updatedBatch = await StockBatchModel.findOneAndUpdate(
        { _id: batch._id, quantity: { $gte: deduct } },
        {
          $inc: { quantity: -deduct },
          $set: { updatedBy },
        },
        { new: true, session },
      );

      if (updatedBatch) {
        remaining -= deduct;

        // Update lifecycle if consumed
        if (updatedBatch.quantity === 0) {
          updatedBatch.lifecycleStatus = 'consumed';
          updatedBatch.status = false;
          await updatedBatch.save({ session });
        }
      }
    }

    if (remaining > 0) {
      console.warn(
        `StockBatch FIFO Warning: Could not deduct full quantity for SKU ${SKU}. Shortfall: ${remaining}`,
      );
    }

    return { success: true, shortfall: remaining };
  }

  async softDelete(batchId, userId) {
    const StockBatchModel = await this.getModel();
    return StockBatchModel.findByIdAndUpdate(
      batchId,
      {
        $set: {
          isDeleted: true,
          status: false,
          lifecycleStatus: 'archived',
          deletedAt: new Date(),
          deletedBy: userId,
        },
      },
      { new: true },
    );
  }
}

export default StockBatchServices;

