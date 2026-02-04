import mongoose from 'mongoose';

const purchaseReturnItemSchema = new mongoose.Schema(
  {
    purchaseOrderItemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PurchaseOrder.items',
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product is required'],
      index: true,
    },
    variantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProductVariant',
    },
    sku: { type: String, trim: true },
    name: { type: String, trim: true },
    uom: { type: String, trim: true },
    batchNumber: { type: String, trim: true },
    expiryDate: { type: Date },

    orderedQty: { type: Number, min: 0, default: 0 },
    receivedQty: { type: Number, min: 0, default: 0 },
    returnQty: {
      type: Number,
      required: [true, 'Return quantity is required'],
      min: [0, 'Return quantity cannot be negative'],
    },

    unitCost: {
      type: Number,
      required: [true, 'Unit cost is required'],
      min: [0, 'Unit cost cannot be negative'],
    },
    discountPerUnit: { type: Number, min: 0, default: 0 },
    taxRatePercent: { type: Number, min: 0, default: 0 },
    taxAmount: { type: Number, min: 0, default: 0 },
    lineSubtotal: { type: Number, min: 0, default: 0 }, // before tax
    lineTotal: { type: Number, min: 0, default: 0 }, // after tax

    reason: { type: String, trim: true, maxlength: 500 },
    restock: { type: Boolean, default: true },
    notes: { type: String, trim: true, maxlength: 1000 },
  },
  { _id: false },
);

const creditTransactionSchema = new mongoose.Schema(
  {
    amount: {
      type: Number,
      required: [true, 'Credit transaction amount is required'],
      min: [0, 'Credit amount cannot be negative'],
    },
    date: { type: Date, default: Date.now },
    method: {
      type: String,
      enum: ['Cash', 'Bank', 'Card', 'Wallet', 'Other'],
      default: 'Other',
    },
    reference: { type: String, trim: true },
    notes: { type: String, trim: true, maxlength: 1000 },
  },
  { _id: false },
);

const purchaseReturnSchema = new mongoose.Schema(
  {
    // Linkage
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
      required: [true, 'Supplier is required'],
      index: true,
    },
    purchaseOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PurchaseOrder',
      required: [true, 'Purchase order is required'],
      index: true,
    },
    purchaseReturnNumber: {
      type: String,
      trim: true,
      uppercase: true,
      index: true,
    },

    // Header
    returnDate: {
      type: Date,
      required: [true, 'Return date is required'],
      index: true,
    },
    status: {
      type: String,
      enum: [
        'Draft',
        'Approved',
        'Returned',
        'Credited',
        'Closed',
        'Cancelled',
      ],
      default: 'Draft',
      index: true,
    },
    reason: {
      type: String,
      trim: true,
      maxlength: [1000, 'Reason cannot exceed 1000 characters'],
      required: [true, 'Return reason is required'],
    },

    // Items returned from the purchase order
    items: {
      type: [purchaseReturnItemSchema],
      validate: {
        validator: function (arr) {
          return Array.isArray(arr) && arr.length > 0;
        },
        message: 'At least one return item is required',
      },
    },

    // Totals and credit tracking
    itemsSubtotal: { type: Number, min: 0, default: 0 },
    itemsTaxTotal: { type: Number, min: 0, default: 0 },
    shippingAdjustment: { type: Number, default: 0 },
    otherAdjustment: { type: Number, default: 0 },
    totalCreditAmount: {
      type: Number,
      min: 0,
      default: 0,
      index: true,
    },
    receivedCreditAmount: { type: Number, min: 0, default: 0 },

    creditTransactions: { type: [creditTransactionSchema], default: [] },

    // Optional references
    creditNoteNumber: { type: String, trim: true, index: true },
    creditNoteDate: { type: Date },

    // Audit
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
  },
);

// Virtuals
purchaseReturnSchema.virtual('balanceCreditAmount').get(function () {
  const total = Number(this.totalCreditAmount || 0);
  const received = Number(this.receivedCreditAmount || 0);
  return Math.max(0, total - received);
});

// Pre-validate to compute line totals and header totals if not provided
purchaseReturnSchema.pre('validate', function (next) {
  if (Array.isArray(this.items)) {
    let subtotal = 0;
    let taxTotal = 0;
    this.items = this.items.map((it) => {
      const unit = Number(it.unitCost || 0);
      const discount = Number(it.discountPerUnit || 0);
      const qty = Number(it.returnQty || 0);
      const rate = Number(it.taxRatePercent || 0);
      const lineSubtotal = Math.max(0, (unit - discount) * qty);
      const taxAmount = Math.max(0, (lineSubtotal * rate) / 100);
      const lineTotal = lineSubtotal + taxAmount;
      subtotal += lineSubtotal;
      taxTotal += taxAmount;
      return {
        ...it,
        lineSubtotal,
        taxAmount,
        lineTotal,
      };
    });
    this.itemsSubtotal = Number(this.itemsSubtotal || subtotal);
    this.itemsTaxTotal = Number(this.itemsTaxTotal || taxTotal);
  }

  const shippingAdj = Number(this.shippingAdjustment || 0);
  const otherAdj = Number(this.otherAdjustment || 0);
  const computedTotal =
    Number(this.itemsSubtotal || 0) +
    Number(this.itemsTaxTotal || 0) +
    shippingAdj +
    otherAdj;
  if (!this.totalCreditAmount || this.totalCreditAmount === 0) {
    this.totalCreditAmount = Math.max(0, computedTotal);
  }

  // Sum credit transactions into receivedCreditAmount if not explicitly set
  if (
    (!this.receivedCreditAmount || this.receivedCreditAmount === 0) &&
    Array.isArray(this.creditTransactions)
  ) {
    this.receivedCreditAmount = this.creditTransactions.reduce(
      (sum, tx) => sum + Number(tx.amount || 0),
      0,
    );
  }

  next();
});

// Helpful indexes
purchaseReturnSchema.index({ purchaseOrderId: 1, status: 1, returnDate: -1 });
purchaseReturnSchema.index({ supplierId: 1, returnDate: -1 });

export { purchaseReturnSchema as PurchaseReturnSchema };
