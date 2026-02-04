import mongoose from 'mongoose';

// Line item schema for sales return
const salesReturnItemSchema = new mongoose.Schema(
  {
    // Optional link to the original sale line item
    salesItemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sales.products',
    },

    // Product references
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product is required'],
      index: true,
    },
    variantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Variant',
    },
    SKU: { type: String, trim: true },
    productName: { type: String, trim: true },
    hasVariation: { type: Boolean, default: false },
    variantCombination: [
      {
        variantId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Variant',
        },
        valueId: mongoose.Schema.Types.ObjectId,
        valueLabel: String,
      },
    ],

    // Quantities
    soldQuantity: { type: Number, min: 0, default: 0 }, // original sold qty for this line
    returnQuantity: {
      type: Number,
      required: [true, 'Return quantity is required'],
      min: [0, 'Return quantity cannot be negative'],
    },

    // Original discount on this line (for proportional reversal)
    // e.g. Product B had total discount 50 on 2 qty => 25 per unit
    originalLineDiscountAmount: {
      type: Number,
      min: [0, 'Original line discount cannot be negative'],
      default: 0,
    },

    // Pricing and calculations (aligned with Sales schema semantics)
    // Selling price per unit INCLUDING inclusive tax (same as Sales.products.sellingPrice)
    sellingPrice: {
      type: Number,
      required: [true, 'Selling price is required'],
      min: [0, 'Selling price cannot be negative'],
    },

    // Gross amount for the returned quantity = sellingPrice × returnQuantity (still inclusive)
    grossAmount: {
      type: Number,
      min: [0, 'Gross amount cannot be negative'],
      default: 0,
    },

    // Discount percent applied on this line (used only when originalLineDiscountAmount is not provided)
    discountPercent: {
      type: Number,
      min: [0, 'Discount percent cannot be negative'],
      max: [100, 'Discount percent cannot exceed 100'],
      default: 0,
    },

    // Discount amount for this returned line (proportional reversal from original line + extra % if any)
    discountAmount: {
      type: Number,
      min: [0, 'Discount amount cannot be negative'],
      default: 0,
    },

    // Tax split configuration for this line (inclusive vs exclusive GST)
    inclusiveTaxRatePercent: {
      type: Number,
      min: [0, 'Inclusive tax rate percent cannot be negative'],
      default: 0,
    },
    exclusiveTaxRatePercent: {
      type: Number,
      min: [0, 'Exclusive tax rate percent cannot be negative'],
      default: 0,
    },

    // Taxable value (Return Base) after all discounts, before any tax
    taxableValue: {
      type: Number,
      min: [0, 'Taxable value cannot be negative'],
      default: 0,
    },

    // Inclusive and exclusive tax components computed from Return Base
    inclusiveTaxAmount: {
      type: Number,
      min: [0, 'Inclusive tax amount cannot be negative'],
      default: 0,
    },
    exclusiveTaxAmount: {
      type: Number,
      min: [0, 'Exclusive tax amount cannot be negative'],
      default: 0,
    },
    taxAmount: {
      type: Number,
      min: [0, 'Tax amount cannot be negative'],
      default: 0,
    },

    // Net amount for this returned line (after discount + both taxes)
    netAmount: {
      type: Number,
      min: [0, 'Net amount cannot be negative'],
      default: 0,
    },

    reason: { type: String, trim: true, maxlength: 500 },
    notes: { type: String, trim: true, maxlength: 1000 },
  },
  { _id: false },
);

// Refund transaction tracking (optional, for partial / multi-mode refunds)
const refundTransactionSchema = new mongoose.Schema(
  {
    amount: {
      type: Number,
      required: [true, 'Refund amount is required'],
      min: [0, 'Refund amount cannot be negative'],
    },
    date: { type: Date, default: Date.now },
    method: {
      type: String,
      enum: [
        'cash',
        'card',
        'upi',
        'wallet',
        'bank_transfer',
        'loyalty',
        'gift_card',
        'other',
      ],
      default: 'other',
    },
    reference: { type: String, trim: true },
    notes: { type: String, trim: true, maxlength: 1000 },
  },
  { _id: false },
);

const salesReturnSchema = new mongoose.Schema(
  {
    // Linkage
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: [true, 'Customer is required'],
      index: true,
    },
    salesId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sales',
      required: [true, 'Sales reference is required'],
      index: true,
    },
    invoiceNumber: {
      type: String,
      trim: true,
      uppercase: true,
      index: true,
      required: [true, 'Invoice number is required'],
    },

    // Header
    returnDate: {
      type: Date,
      required: [true, 'Return date is required'],
      index: true,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ['pending', 'complete'],
      default: 'pending',
      index: true,
    },
    reason: {
      type: String,
      trim: true,
      maxlength: [1000, 'Reason cannot exceed 1000 characters'],
      required: [true, 'Return reason is required'],
    },

    // Line-wise returned products and amounts
    items: {
      type: [salesReturnItemSchema],
      validate: {
        validator: function (arr) {
          return Array.isArray(arr) && arr.length > 0;
        },
        message: 'At least one return item is required',
      },
    },

    // Totals and refund tracking (calculation fields, like sales)
    itemsSubtotal: { type: Number, min: 0, default: 0 }, // sum of taxableValue
    itemsTaxTotal: { type: Number, min: 0, default: 0 }, // sum of taxAmount
    shippingAdjustment: { type: Number, default: 0 },
    otherAdjustment: { type: Number, default: 0 },

    // Total refund amount for this sales return
    totalRefundAmount: {
      type: Number,
      min: 0,
      default: 0,
      index: true,
    },
    refundedAmount: { type: Number, min: 0, default: 0 },

    // Per-transaction refund records (cash/card/etc.)
    refundTransactions: { type: [refundTransactionSchema], default: [] },

    // Optional external references (e.g., credit note / return invoice)
    returnInvoiceNumber: { type: String, trim: true, index: true },
    returnInvoiceDate: { type: Date },

    // Audit
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
  },
);

// Virtuals
salesReturnSchema.virtual('balanceRefundAmount').get(function () {
  const total = Number(this.totalRefundAmount || 0);
  const refunded = Number(this.refundedAmount || 0);
  return Math.max(0, total - refunded);
});

// Pre-validate hook to compute line and header totals if not provided
salesReturnSchema.pre('validate', function (next) {
  if (Array.isArray(this.items)) {
    let subtotal = 0;
    let taxTotal = 0;

    this.items = this.items.map((item) => {
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
      // e.g. 210 * 1 = 210 for Product B
      const grossAmount = Math.max(0, priceIncl * qty);

      // Step 2: remove inclusive GST to get base before discounts
      // baseBeforeDiscount = gross / (1 + inclusiveRate/100)
      let baseBeforeDiscount = grossAmount;
      if (inclusiveRate > 0) {
        baseBeforeDiscount = grossAmount / (1 + inclusiveRate / 100);
      }

      // Step 3: proportional discount reversal from original line
      // e.g. 50 total discount on 2 qty => 25 per unit
      let discountFromLine = 0;
      if (soldQty > 0 && originalLineDiscount > 0) {
        const perUnitDiscount = originalLineDiscount / soldQty;
        discountFromLine = perUnitDiscount * qty;
      }

      // Optional extra percentage discount on the returned base, if provided
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

      subtotal += taxableValue;
      taxTotal += taxAmount;

      return {
        ...item,
        grossAmount,
        discountAmount,
        taxableValue,
        inclusiveTaxAmount,
        exclusiveTaxAmount,
        taxAmount,
        netAmount,
      };
    });

    if (!this.itemsSubtotal || this.itemsSubtotal === 0) {
      this.itemsSubtotal = Number(subtotal);
    }
    if (!this.itemsTaxTotal || this.itemsTaxTotal === 0) {
      this.itemsTaxTotal = Number(taxTotal);
    }
  }

  const shippingAdj = Number(this.shippingAdjustment || 0);
  const otherAdj = Number(this.otherAdjustment || 0);

  const computedTotal =
    Number(this.itemsSubtotal || 0) +
    Number(this.itemsTaxTotal || 0) +
    shippingAdj +
    otherAdj;

  if (!this.totalRefundAmount || this.totalRefundAmount === 0) {
    this.totalRefundAmount = Math.max(0, computedTotal);
  }

  // If refundedAmount not explicitly set, derive from refundTransactions
  if (
    (!this.refundedAmount || this.refundedAmount === 0) &&
    Array.isArray(this.refundTransactions)
  ) {
    this.refundedAmount = this.refundTransactions.reduce(
      (sum, tx) => sum + Number(tx.amount || 0),
      0,
    );
  }

  next();
});

// Helpful indexes
salesReturnSchema.index({ salesId: 1, status: 1, returnDate: -1 });
salesReturnSchema.index({ customerId: 1, returnDate: -1 });

export { salesReturnSchema as SalesReturnSchema };

