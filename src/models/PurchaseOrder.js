import mongoose from 'mongoose';

const round2 = (n) => {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
};

// Enterprise-grade address schema for supplier and delivery addresses
const addressSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      required: [true, 'Address name is required'],
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    company: {
      type: String,
      trim: true,
      maxlength: [200, 'Company name cannot exceed 200 characters'],
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please enter a valid email',
      ],
    },
    phone: {
      type: String,
      trim: true,
      match: [/^[\+]?[1-9][\d]{0,15}$/, 'Please enter a valid phone number'],
    },
    address1: {
      type: String,
      trim: true,
      required: [true, 'Address line 1 is required'],
      maxlength: [200, 'Address line 1 cannot exceed 200 characters'],
    },
    address2: {
      type: String,
      trim: true,
      maxlength: [200, 'Address line 2 cannot exceed 200 characters'],
    },
    city: {
      type: String,
      trim: true,
      required: [true, 'City is required'],
      maxlength: [100, 'City name cannot exceed 100 characters'],
    },
    state: {
      type: String,
      trim: true,
      required: [true, 'State is required'],
      maxlength: [100, 'State name cannot exceed 100 characters'],
    },
    country: {
      type: String,
      trim: true,
      required: [true, 'Country is required'],
      maxlength: [100, 'Country name cannot exceed 100 characters'],
    },
    postalCode: {
      type: String,
      trim: true,
      required: [true, 'Postal code is required'],
      maxlength: [20, 'Postal code cannot exceed 20 characters'],
    },
    gstinOrVat: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: [50, 'GSTIN/VAT cannot exceed 50 characters'],
    },
    isDefault: { type: Boolean, default: false },
  },
  { _id: false },
);

// Supplier information schema
const supplierInfoSchema = new mongoose.Schema(
  {
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
      required: [true, 'Supplier ID is required'],
      index: true,
    },
    supplierName: {
      type: String,
      trim: true,
      required: [true, 'Supplier name is required'],
      maxlength: [200, 'Supplier name cannot exceed 200 characters'],
    },
    supplierCode: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: [50, 'Supplier code cannot exceed 50 characters'],
    },
    contactPerson: {
      type: String,
      trim: true,
      maxlength: [100, 'Contact person name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please enter a valid email',
      ],
    },
    phone: {
      type: String,
      trim: true,
      match: [/^[\+]?[1-9][\d]{0,15}$/, 'Please enter a valid phone number'],
    },
    billingAddress: {
      type: addressSchema,
      required: [true, 'Billing address is required'],
    },
    shippingAddress: {
      type: addressSchema,
      required: [true, 'Shipping address is required'],
    },
  },
  { _id: false },
);

// Product variant schema for handling product variations
const productVariantSchema = new mongoose.Schema(
  {
    variantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Variant',
      required: [true, 'Variant ID is required'],
    },
    variantName: {
      type: String,
      trim: true,
      required: [true, 'Variant name is required'],
      maxlength: [200, 'Variant name cannot exceed 200 characters'],
    },
    variantValue: {
      type: String,
      trim: true,
      maxlength: [100, 'Variant value cannot exceed 100 characters'],
    },
    SKU: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: [100, 'SKU cannot exceed 100 characters'],
    },
    quantity: {
      type: Number,
      min: [0, 'Quantity cannot be negative'],
      required: [true, 'Quantity is required'],
    },
    receivedQuantity: {
      type: Number,
      min: [0, 'Received quantity cannot be negative'],
      default: 0,
    },
    returnedQuantity: {
      type: Number,
      min: [0, 'Returned quantity cannot be negative'],
      default: 0,
    },
    unitPrice: {
      type: Number,
      min: [0, 'Unit price cannot be negative'],
      required: [true, 'Unit price is required'],
    },
    unitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Unit',
    },
    unitName: {
      type: String,
      trim: true,
      maxlength: [50, 'Unit name cannot exceed 50 characters'],
    },
  },
  { _id: true },
);

// Product line item schema with variant support
const productLineItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product ID is required'],
      index: true,
    },
    productName: {
      type: String,
      trim: true,
      required: [true, 'Product name is required'],
      maxlength: [200, 'Product name cannot exceed 200 characters'],
    },
    productCode: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: [100, 'Product code cannot exceed 100 characters'],
    },
    hasVariation: {
      type: Boolean,
      default: false,
    },
    // For products without variations
    quantity: {
      type: Number,
      min: [0, 'Quantity cannot be negative'],
      validate: {
        validator: function (v) {
          return !this.hasVariation ? v > 0 : true;
        },
        message: 'Quantity is required for products without variations',
      },
    },
    receivedQuantity: {
      type: Number,
      min: [0, 'Received quantity cannot be negative'],
      default: 0,
    },
    returnedQuantity: {
      type: Number,
      min: [0, 'Returned quantity cannot be negative'],
      default: 0,
    },
    unitPrice: {
      type: Number,
      min: [0, 'Unit price cannot be negative'],
      validate: {
        validator: function (v) {
          return !this.hasVariation ? v > 0 : true;
        },
        message: 'Unit price is required for products without variations',
      },
    },
    unitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Unit',
    },
    unitName: {
      type: String,
      trim: true,
      maxlength: [50, 'Unit name cannot exceed 50 characters'],
    },
    // For products with variations
    variants: {
      type: [productVariantSchema],
      validate: {
        validator: function (v) {
          return !this.hasVariation || (Array.isArray(v) && v.length > 0);
        },
        message:
          'At least one variant is required for products with variations',
      },
    },
    // Line-level discount
    discountType: {
      type: String,
      enum: ['Percentage', 'Fixed', 'None'],
      default: 'None',
    },
    discountValue: {
      type: Number,
      min: [0, 'Discount value cannot be negative'],
      default: 0,
    },
    discountAmount: {
      type: Number,
      min: [0, 'Discount amount cannot be negative'],
      default: 0,
    },
    // Line-level tax
    taxType: {
      type: String,
      enum: ['Percentage', 'Fixed', 'None'],
      default: 'None',
    },
    taxValue: {
      type: Number,
      min: [0, 'Tax value cannot be negative'],
      default: 0,
    },
    taxAmount: {
      type: Number,
      min: [0, 'Tax amount cannot be negative'],
      default: 0,
    },
    taxId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TenantTax',
    },
    // Computed totals
    lineSubtotal: {
      type: Number,
      default: 0,
    },
    lineTotal: {
      type: Number,
      default: 0,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [1000, 'Line item notes cannot exceed 1000 characters'],
    },
  },
  { _id: true },
);

// Order details schema
const orderDetailsSchema = new mongoose.Schema(
  {
    poNumber: {
      type: String,
      trim: true,
      uppercase: true,
      required: [true, 'PO Number is required'],
      maxlength: [50, 'PO Number cannot exceed 50 characters'],
    },
    purchaseDate: {
      type: Date,
      required: [true, 'Purchase date is required'],
      default: Date.now,
      index: true,
    },
    expectedDeliveryDate: {
      type: Date,
      required: [true, 'Expected delivery date is required'],
      validate: {
        validator: function (v) {
          if (!v || !this.purchaseDate) return true;
          return v >= this.purchaseDate;
        },
        message: 'Expected delivery date must be on or after the purchase date',
      },
      index: true,
    },
    deliveryAddress: {
      type: addressSchema,
      required: [true, 'Delivery address is required'],
    },
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Store',
      index: true,
    },
    storeName: {
      type: String,
      trim: true,
      maxlength: [200, 'Store name cannot exceed 200 characters'],
    },
    reference: {
      type: String,
      trim: true,
      maxlength: [100, 'Reference cannot exceed 100 characters'],
    },
    currency: {
      type: String,
      trim: true,
      default: 'INR',
      maxlength: [3, 'Currency code cannot exceed 3 characters'],
    },
    exchangeRate: {
      type: Number,
      min: [0, 'Exchange rate cannot be negative'],
      default: 1,
    },
  },
  { _id: false },
);

// Order-level discount and tax schema
const orderDiscountTaxSchema = new mongoose.Schema(
  {
    discountType: {
      type: String,
      enum: ['Percentage', 'Fixed', 'None'],
      default: 'None',
    },
    discountValue: {
      type: Number,
      min: [0, 'Discount value cannot be negative'],
      default: 0,
    },
    discountAmount: {
      type: Number,
      min: [0, 'Discount amount cannot be negative'],
      default: 0,
    },
    taxType: {
      type: String,
      enum: ['Percentage', 'Fixed', 'None'],
      default: 'None',
    },
    taxValue: {
      type: Number,
      min: [0, 'Tax value cannot be negative'],
      default: 0,
    },
    taxAmount: {
      type: Number,
      min: [0, 'Tax amount cannot be negative'],
      default: 0,
    },
    shippingFee: {
      type: Number,
      min: [0, 'Shipping fee cannot be negative'],
      default: 0,
    },
    otherCharges: {
      type: Number,
      min: [0, 'Other charges cannot be negative'],
      default: 0,
    },
  },
  { _id: false },
);

// Final totals schema
const orderTotalsSchema = new mongoose.Schema(
  {
    subtotal: {
      type: Number,
      min: [0, 'Subtotal cannot be negative'],
      default: 0,
    },
    totalDiscount: {
      type: Number,
      min: [0, 'Total discount cannot be negative'],
      default: 0,
    },
    totalTax: {
      type: Number,
      min: [0, 'Total tax cannot be negative'],
      default: 0,
    },
    shippingFee: {
      type: Number,
      min: [0, 'Shipping fee cannot be negative'],
      default: 0,
    },
    otherCharges: {
      type: Number,
      min: [0, 'Other charges cannot be negative'],
      default: 0,
    },
    grandTotal: {
      type: Number,
      min: [0, 'Grand total cannot be negative'],
      default: 0,
    },
    amountPaid: {
      type: Number,
      min: [0, 'Amount paid cannot be negative'],
      default: 0,
    },
    balanceDue: {
      type: Number,
      min: [0, 'Balance due cannot be negative'],
      default: 0,
    },
  },
  { _id: false },
);

// Attachment schema for documents
const attachmentSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      trim: true,
      required: [true, 'Attachment URL is required'],
    },
    name: {
      type: String,
      trim: true,
      required: [true, 'Attachment name is required'],
      maxlength: [200, 'Attachment name cannot exceed 200 characters'],
    },
    mimeType: {
      type: String,
      trim: true,
      required: [true, 'MIME type is required'],
    },
    size: {
      type: Number,
      min: [0, 'File size cannot be negative'],
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { _id: true },
);

// Receive log schema for tracking deliveries
const receiveLogSchema = new mongoose.Schema(
  {
    receivedAt: {
      type: Date,
      default: Date.now,
    },
    receivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Received by user is required'],
    },
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Store',
      required: [true, 'Store ID is required'],
    },
    items: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Product',
          required: [true, 'Product ID is required'],
        },
        // For products with variants
        variantId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Variant',
          // variantId is required if product has variants, but we can't validate that here
          // without checking the product. This should be validated in the service layer.
        },
        SKU: {
          type: String,
          trim: true,
          uppercase: true,
        },
        quantity: {
          type: Number,
          min: [0, 'Received quantity cannot be negative'],
          required: [true, 'Received quantity is required'],
        },
        // Note: For products with variants, variantId should be provided
        // For products without variants, variantId should be null/undefined
      },
    ],
    note: {
      type: String,
      trim: true,
      maxlength: [1000, 'Receive note cannot exceed 1000 characters'],
    },
  },
  { _id: true },
);

const returnLogSchema = new mongoose.Schema(
  {
    returnedAt: {
      type: Date,
      default: Date.now,
    },
    purchaseReturnId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PurchaseReturn',
      required: [true, 'Purchase return ID is required'],
    },
    returnedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Returned by user is required'],
    },
  },
  { _id: true },
);

// Main Purchase Order Schema
const purchaseOrderSchema = new mongoose.Schema(
  {
    // Supplier Information
    supplier: {
      type: supplierInfoSchema,
      required: [true, 'Supplier information is required'],
    },

    // Order Details
    orderDetails: {
      type: orderDetailsSchema,
      required: [true, 'Order details are required'],
    },

    // Product Line Items
    items: {
      type: [productLineItemSchema],
      validate: {
        validator: function (arr) {
          return Array.isArray(arr) && arr.length > 0;
        },
        message: 'At least one item is required',
      },
    },

    // Order-level Discount and Tax
    orderDiscountTax: {
      type: orderDiscountTaxSchema,
      default: {},
    },

    // Final Totals
    totals: {
      type: orderTotalsSchema,
      default: {},
    },

    // Payment Information
    paymentTerms: {
      type: String,
      trim: true,
      maxlength: [200, 'Payment terms cannot exceed 200 characters'],
    },
    dueDate: {
      type: Date,
      validate: {
        validator: function (v) {
          if (!v || !this.orderDetails?.purchaseDate) return true;
          return v >= this.orderDetails.purchaseDate;
        },
        message: 'Due date must be on or after the purchase date',
      },
      index: true,
    },

    // Shipping Information
    shippingMethod: {
      type: String,
      trim: true,
      maxlength: [100, 'Shipping method cannot exceed 100 characters'],
    },
    trackingNumber: {
      type: String,
      trim: true,
      maxlength: [100, 'Tracking number cannot exceed 100 characters'],
    },

    // Status Management
    status: {
      type: String,
      enum: [
        'Draft',
        'Approved',
        'Received',
        'Billed',
        'Cancelled',
      ],
      default: 'Draft',
      index: true,
    },

    // Approval Information
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedAt: {
      type: Date,
    },
    approvalNotes: {
      type: String,
      trim: true,
      maxlength: [1000, 'Approval notes cannot exceed 1000 characters'],
    },

    // Delivery Tracking
    receiveLogs: {
      type: [receiveLogSchema],
      default: [],
    },
    returnLogs: {
      type: [returnLogSchema],
      default: [],
    },

    // Document Attachments
    attachments: {
      type: [attachmentSchema],
      default: [],
    },

    // Notes and Comments
    notes: {
      type: String,
      trim: true,
      maxlength: [2000, 'Notes cannot exceed 2000 characters'],
    },
    internalNotes: {
      type: String,
      trim: true,
      maxlength: [2000, 'Internal notes cannot exceed 2000 characters'],
    },
    supplierNotes: {
      type: String,
      trim: true,
      maxlength: [2000, 'Supplier notes cannot exceed 2000 characters'],
    },

    // Audit and Metadata
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Created by user is required'],
    },
    lastModifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    metadata: {
      type: Map,
      of: String,
    },

    // External invoice reference (generated on frontend)
    externalInvoice: {
      number: { type: String, trim: true, uppercase: true },
      date: { type: Date },
      pdfUrl: { type: String, trim: true },
      source: { type: String, trim: true },
    },
  },
  {
    timestamps: true,
  },
);

// Enterprise-grade Indexes for optimal query performance
purchaseOrderSchema.index(
  { 'orderDetails.poNumber': 1 },
  { unique: true, sparse: true },
);
purchaseOrderSchema.index({
  'supplier.supplierId': 1,
  status: 1,
  'orderDetails.purchaseDate': -1,
});
// Removed storeId and businessId indexes as per tenant-scoped design
purchaseOrderSchema.index({ createdBy: 1, status: 1 });
purchaseOrderSchema.index({
  status: 1,
  'orderDetails.expectedDeliveryDate': 1,
});
purchaseOrderSchema.index({ isDeleted: 1, status: 1 });
purchaseOrderSchema.index({ 'totals.grandTotal': 1 });

// Advanced calculation logic for enterprise-grade purchase orders
purchaseOrderSchema.pre('validate', function (next) {
  try {
    // Enforce Draft status for newly created orders regardless of payload
    if (this.isNew) {
      this.status = 'Draft';
    }

    let orderSubtotal = 0;
    let orderDiscountTotal = 0;
    let orderTaxTotal = 0;

    // Process line items with variant support
    if (Array.isArray(this.items)) {
      this.items = this.items.map((item) => {
        let lineSubtotal = 0;
        let lineDiscount = 0;
        let lineTax = 0;
        let lineTotal = 0;

        if (item.hasVariation && Array.isArray(item.variants)) {
          // Process variants
          item.variants = item.variants.map((variant) => {
            const quantity = Number(variant.quantity) || 0;
            const unitPrice = Number(variant.unitPrice) || 0;

            const variantBase = round2(quantity * unitPrice);
            const variantSubtotal = round2(variantBase);
            const variantTotal = round2(variantSubtotal);

            lineSubtotal += variantSubtotal;
            lineTotal += variantTotal;

            return {
              ...variant,
              lineBase: variantBase,
              lineSubtotal: variantSubtotal,
              lineTotal: variantTotal,
            };
          });
        } else {
          // Process single product without variants
          const quantity = Number(item.quantity) || 0;
          const unitPrice = Number(item.unitPrice) || 0;

          const lineBase = round2(quantity * unitPrice);

          // Calculate line-level discount
          const discountType = item.discountType || 'None';
          const discountValue = Number(item.discountValue) || 0;

          if (discountType === 'Percentage') {
            lineDiscount = round2(lineBase * (discountValue / 100));
          } else if (discountType === 'Fixed') {
            lineDiscount = round2(discountValue);
          } else {
            // Reset to 0 when type is None
            lineDiscount = 0;
          }

          lineSubtotal = round2(Math.max(0, lineBase - lineDiscount));

          // Calculate line-level tax
          const taxType = item.taxType || 'None';
          const taxValue = Number(item.taxValue) || 0;

          if (taxType === 'Percentage') {
            lineTax = round2(lineSubtotal * (taxValue / 100));
          } else if (taxType === 'Fixed') {
            lineTax = round2(taxValue);
          } else {
            // Reset to 0 when type is None
            lineTax = 0;
          }

          lineTotal = round2(lineSubtotal + lineTax);

          // Update item with calculated values - ensure consistency
          item.discountType = discountType;
          item.discountValue = discountType === 'None' ? 0 : discountValue;
          item.discountAmount = lineDiscount;
          item.taxType = taxType;
          item.taxValue = taxType === 'None' ? 0 : taxValue;
          item.taxAmount = lineTax;
        }

        item.lineSubtotal = round2(lineSubtotal);
        item.lineTotal = round2(lineTotal);

        orderSubtotal += lineSubtotal;
        orderDiscountTotal += lineDiscount;
        orderTaxTotal += lineTax;

        return item;
      });
    }

    // Calculate order-level discount and tax
    const orderDiscountType = this.orderDiscountTax?.discountType || 'None';
    const orderDiscountValue =
      Number(this.orderDiscountTax?.discountValue) || 0;
    const orderTaxType = this.orderDiscountTax?.taxType || 'None';
    const orderTaxValue = Number(this.orderDiscountTax?.taxValue) || 0;
    const shippingFee = Number(this.orderDiscountTax?.shippingFee) || 0;
    const otherCharges = Number(this.orderDiscountTax?.otherCharges) || 0;

    let orderLevelDiscount = 0;
    if (orderDiscountType === 'Percentage') {
      orderLevelDiscount = round2(orderSubtotal * (orderDiscountValue / 100));
    } else if (orderDiscountType === 'Fixed') {
      orderLevelDiscount = round2(orderDiscountValue);
    } else {
      // Reset to 0 when type is None
      orderLevelDiscount = 0;
    }

    const subtotalAfterOrderDiscount = round2(
      Math.max(0, orderSubtotal - orderLevelDiscount),
    );

    let orderLevelTax = 0;
    if (orderTaxType === 'Percentage') {
      orderLevelTax = round2(
        subtotalAfterOrderDiscount * (orderTaxValue / 100),
      );
    } else if (orderTaxType === 'Fixed') {
      orderLevelTax = round2(orderTaxValue);
    } else {
      // Reset to 0 when type is None
      orderLevelTax = 0;
    }

    // Calculate final totals
    const grandTotal = round2(
      subtotalAfterOrderDiscount + orderLevelTax + shippingFee + otherCharges,
    );
    const amountPaid = Number(this.totals?.amountPaid) || 0;
    const balanceDue = round2(Math.max(0, grandTotal - amountPaid));

    // Update order discount tax object - ensure consistency
    this.orderDiscountTax = {
      discountType: orderDiscountType,
      discountValue: orderDiscountType === 'None' ? 0 : orderDiscountValue,
      discountAmount: orderLevelDiscount,
      taxType: orderTaxType,
      taxValue: orderTaxType === 'None' ? 0 : orderTaxValue,
      taxAmount: orderLevelTax,
      shippingFee: shippingFee,
      otherCharges: otherCharges,
    };

    // Update totals object
    this.totals = {
      subtotal: round2(orderSubtotal),
      totalDiscount: round2(orderDiscountTotal + orderLevelDiscount),
      totalTax: round2(orderTaxTotal + orderLevelTax),
      shippingFee: shippingFee,
      otherCharges: otherCharges,
      grandTotal: grandTotal,
      amountPaid: amountPaid,
      balanceDue: balanceDue,
    };

    return next();
  } catch (err) {
    return next(err);
  }
});

// Post-save middleware for audit logging
purchaseOrderSchema.post('save', function (doc, next) {
  // Update lastModifiedBy if not already set
  if (!doc.lastModifiedBy && doc.createdBy) {
    doc.lastModifiedBy = doc.createdBy;
    doc
      .save()
      .catch((err) => console.error('Error updating lastModifiedBy:', err));
  }
  next();
});

export { purchaseOrderSchema as PurchaseOrderSchema };
