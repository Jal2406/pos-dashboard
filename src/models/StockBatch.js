import mongoose from 'mongoose';

const LIFECYCLE_STATUSES = [
  'active',
  'reserved',
  'consumed',
  'expired',
  'quarantined',
  'archived',
];

const stockBatchSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Store',
      required: true,
      index: true,
    },
    SKU: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      validate: {
        validator: (v) => /^[A-Z0-9-_]+$/.test(v),
        message: 'Invalid SKU format',
      },
      index: true,
    },
    batchCode: {
      type: Number,
      required: true,
      min: [1, 'Batch code must be a positive integer'],
      validate: {
        validator: Number.isInteger,
        message: 'Batch code must be an integer',
      },
      index: true,
    },
    isVariant: {
      type: Boolean,
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: [0, 'Quantity cannot be negative'],
      default: 0,
      index: true,
    },
    reservedQuantity: {
      type: Number,
      min: [0, 'Reserved quantity cannot be negative'],
      default: 0,
    },
    initialQuantity: {
      type: Number,
      min: [0, 'Initial quantity cannot be negative'],
      default: function () {
        return typeof this.quantity === 'number' ? this.quantity : 0;
      },
      immutable: true,
    },
    status: {
      type: Boolean,
      default: true,
      index: true,
    },
    lifecycleStatus: {
      type: String,
      enum: LIFECYCLE_STATUSES,
      default: 'active',
      index: true,
    },
    manufacturedAt: {
      type: Date,
    },
    receivedAt: {
      type: Date,
      default: Date.now,
    },
    expiryDate: {
      type: Date,
      index: true,
    },
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      index: true,
    },
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
    },
    sourceDocumentType: {
      type: String,
      enum: [
        'purchase_order',
        'stock_adjustment',
        'transfer',
        'return',
        'manual',
      ],
      default: 'manual',
    },
    sourceDocumentId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    costPerUnit: {
      type: Number,
      min: [0, 'Cost per unit cannot be negative'],
    },
    sellingPrice: {
      type: Number,
      min: [0, 'Selling price cannot be negative'],
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [1000, 'Notes cannot exceed 1000 characters'],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    updatedBy: {
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
  },
  { timestamps: true },
);

// Compound uniqueness per batch within store/product/SKU
stockBatchSchema.index(
  { productId: 1, storeId: 1, SKU: 1, batchCode: 1 },
  { unique: true },
);

// Fast lookups
stockBatchSchema.index({ storeId: 1, SKU: 1, expiryDate: 1 });
stockBatchSchema.index({ businessId: 1, lifecycleStatus: 1, expiryDate: 1 });
stockBatchSchema.index({ supplierId: 1, expiryDate: 1 });

stockBatchSchema.virtual('availableQuantity').get(function () {
  const available = this.quantity - this.reservedQuantity;
  return Math.max(0, available);
});

stockBatchSchema.virtual('isExpired').get(function () {
  if (!this.expiryDate) return false;
  return this.expiryDate.getTime() < Date.now();
});

const getRegisteredModel = (doc, modelName) => {
  const connection = doc.constructor?.db || doc.db || mongoose.connection;
  if (!connection?.models || !connection.models[modelName]) {
    return null;
  }
  return connection.model(modelName);
};

const normalizeSku = (doc) => {
  if (typeof doc.SKU === 'string') {
    doc.SKU = doc.SKU.trim().toUpperCase();
  }
};

const validateQuantities = (doc) => {
  if (doc.quantity < 0) {
    throw new Error('Quantity cannot be negative');
  }

  if (doc.reservedQuantity < 0) {
    throw new Error('Reserved quantity cannot be negative');
  }

  if (doc.reservedQuantity > doc.quantity) {
    throw new Error('Reserved quantity cannot exceed total quantity');
  }
};

const validateExpiryTimeline = (doc) => {
  if (
    doc.manufacturedAt &&
    doc.expiryDate &&
    doc.expiryDate <= doc.manufacturedAt
  ) {
    throw new Error('Expiry date must be later than manufactured date');
  }

  if (doc.receivedAt && doc.expiryDate && doc.expiryDate <= doc.receivedAt) {
    throw new Error('Expiry date must be later than received date');
  }
};

const ensureStoreExists = async (doc) => {
  const Store = getRegisteredModel(doc, 'Store');
  if (!Store) return;
  const store = await Store.findById(doc.storeId).select({ _id: 1 }).lean();
  if (!store) {
    throw new Error('Store not found');
  }
};

const ensureProductRelationship = async (doc) => {
  const Product = getRegisteredModel(doc, 'Product');
  if (!Product) {
    return null;
  }
  const productQuery = Product.findById(doc.productId)
    .select({
      hasVariation: 1,
      SKU: 1,
      category: 1,
      variantData: { $elemMatch: { SKU: doc.SKU } },
    })
    .lean();

  if (doc.$session()) {
    productQuery.session(doc.$session());
  }

  const product = await productQuery;

  // If the product is not yet persisted (e.g. during initial product creation
  // with stock upsert in the same flow), skip strict relationship checks here.
  if (!product) {
    return null;
  }

  if (product.hasVariation === true) {
    if (
      !Array.isArray(product.variantData) ||
      product.variantData.length === 0
    ) {
      throw new Error('SKU not found in product variantData');
    }
    doc.isVariant = true;
  } else {
    if (product.SKU !== doc.SKU) {
      throw new Error('SKU does not match non-variant product SKU');
    }
    doc.isVariant = false;
  }

  return product;
};

const ensureInitialQuantity = (doc) => {
  if (typeof doc.initialQuantity === 'number' && doc.initialQuantity >= 0)
    return;
  doc.initialQuantity = doc.quantity;
};

const enforceLifecycleState = (doc) => {
  const now = Date.now();
  const isExpired = doc.expiryDate && doc.expiryDate.getTime() < now;

  if (isExpired) {
    doc.lifecycleStatus = 'expired';
    doc.status = false;
    return;
  }

  if (doc.quantity === 0 && doc.lifecycleStatus === 'active') {
    doc.lifecycleStatus = 'consumed';
    doc.status = false;
    return;
  }

  if (doc.lifecycleStatus === 'consumed' && doc.quantity > 0) {
    doc.lifecycleStatus = 'active';
    doc.status = true;
  }
};

const ensureBatchCodeGenerated = async (doc) => {
  if (Number.isInteger(doc.batchCode) && doc.batchCode > 0) {
    return;
  }

  if (!doc.isNew) {
    throw new Error('Batch code is required');
  }

  if (!doc.productId || !doc.storeId || !doc.SKU) {
    throw new Error(
      'productId, storeId, and SKU are required to generate batch code',
    );
  }

  const collectionName = 'stockbatch_sequences';
  const sequenceCollection = doc.constructor.db.collection(collectionName);
  const key = {
    productId: doc.productId.toString(),
    storeId: doc.storeId.toString(),
    SKU: doc.SKU,
  };
  const now = new Date();
  const result = await sequenceCollection.findOneAndUpdate(
    key,
    {
      $inc: { seq: 1 },
      $setOnInsert: { createdAt: now },
      $set: { updatedAt: now },
    },
    { upsert: true, returnDocument: 'after' },
  );

  // Support both MongoDB driver shapes:
  // - v3: { value: doc }
  // - v4+: doc directly
  const seqDoc = result && result.value !== undefined ? result.value : result;

  if (!seqDoc || typeof seqDoc.seq !== 'number') {
    throw new Error('Unable to generate batch code');
  }

  doc.batchCode = seqDoc.seq;
};

const validateBatchCode = (doc) => {
  if (!Number.isInteger(doc.batchCode) || doc.batchCode <= 0) {
    throw new Error('Batch code must be a positive integer');
  }
};

const ensureCategoryCompliance = async (doc, product) => {
  if (!product?.category) return;
  const ProductCategory = getRegisteredModel(doc, 'ProductCategory');
  if (!ProductCategory) return;
  const category = await ProductCategory.findById(product.category)
    .select({ hasExpiry: 1 })
    .lean();

  if (category?.hasExpiry && !doc.expiryDate) {
    throw new Error('Expiry date is required for products in this category');
  }
};

stockBatchSchema.pre('validate', async function (next) {
  try {
    normalizeSku(this);
    await ensureBatchCodeGenerated(this);
    validateBatchCode(this);
    return next();
  } catch (error) {
    return next(error);
  }
});

stockBatchSchema.pre('save', async function (next) {
  try {
    validateQuantities(this);
    validateExpiryTimeline(this);
    await ensureStoreExists(this);
    const product = await ensureProductRelationship(this);
    await ensureCategoryCompliance(this, product);
    ensureInitialQuantity(this);
    enforceLifecycleState(this);

    return next();
  } catch (error) {
    return next(error);
  }
});

stockBatchSchema.set('toJSON', { virtuals: true });
stockBatchSchema.set('toObject', { virtuals: true });

export { stockBatchSchema as StockBatchSchema };
