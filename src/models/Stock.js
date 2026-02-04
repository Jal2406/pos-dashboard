import mongoose from 'mongoose';

// Stock tracks quantity at store granularity per product SKU
// Works for both non-variant (top-level SKU) and variant SKUs
const stockSchema = new mongoose.Schema(
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
    // No variant value references here; SKU uniquely identifies the item/combination
    status: {
      type: Boolean,
      default: true,
      index: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true },
);

// Ensure uniqueness per store-product-SKU
stockSchema.index({ productId: 1, storeId: 1, SKU: 1 }, { unique: true });

// Fast lookups
stockSchema.index({ storeId: 1, SKU: 1 });
stockSchema.index({ productId: 1, SKU: 1 });
stockSchema.index({ storeId: 1, status: 1 });
stockSchema.index({ productId: 1, status: 1 });

// Validation and normalization
stockSchema.pre('validate', async function (next) {
  try {
    // Normalize SKU once
    if (typeof this.SKU === 'string') {
      this.SKU = this.SKU.trim().toUpperCase();
    }

    // Validate store exists
    const Store = this.model('Store');
    const store = await Store.findById(this.storeId).select({ _id: 1 }).lean();
    if (!store) return next(new Error('Store not found'));

    // Validate product and SKU relationship
    const Product = this.model('Product');
    const productQuery = Product.findById(this.productId)
      .select({
        hasVariation: 1,
        SKU: 1,
        // Only bring the matching variantData entry (if present)
        variantData: { $elemMatch: { SKU: this.SKU } },
      })
      .lean();

    if (this.$session()) {
      productQuery.session(this.$session());
    }

    const product = await productQuery;
    if (!product) return next(new Error('Product not found'));

    if (product.hasVariation === true) {
      // Variant SKU must exist in variantData (elemMatch returned at most one)
      if (!Array.isArray(product.variantData)) {
        return next(new Error('Product variantData missing'));
      }
      if (product.variantData.length === 0) {
        return next(new Error('SKU not found in product variantData'));
      }
      // Normalize isVariant
      this.isVariant = true;
    } else {
      // Non-variant: SKU must match product top-level SKU
      if (product.SKU !== this.SKU) {
        return next(new Error('SKU does not match non-variant product SKU'));
      }
      this.isVariant = false;
    }

    if (this.quantity < 0) {
      return next(new Error('Quantity cannot be negative'));
    }

    return next();
  } catch (err) {
    return next(err);
  }
});

// Static helpers
stockSchema.statics.getQuantity = async function (productId, storeId, SKU) {
  const row = await this.findOne({ productId, storeId, SKU, status: true })
    .select({ quantity: 1 })
    .lean();
  return row ? row.quantity : 0;
};

stockSchema.statics.setQuantity = async function (
  productId,
  storeId,
  SKU,
  newQuantity,
  isVariant,
  updatedBy = null,
  options = {},
) {
  if (newQuantity < 0) throw new Error('Quantity cannot be negative');
  const update = {
    $set: { quantity: newQuantity, updatedBy, status: true },
  };
  if (isVariant !== undefined) {
    update.$set.isVariant = isVariant;
  }
  const session = options.session;
  const doc = await this.findOneAndUpdate(
    { productId, storeId, SKU },
    update,
    { upsert: true, new: true, setDefaultsOnInsert: true, session },
  );
  return doc;
};

stockSchema.statics.increment = async function (
  productId,
  storeId,
  SKU,
  delta,
  isVariant,
  updatedBy = null,
  options = {},
) {
  if (!Number.isFinite(delta)) throw new Error('delta must be a number');
  const update = {
    $inc: { quantity: delta },
    $set: { updatedBy, status: true },
  };
  if (isVariant !== undefined) {
    update.$set.isVariant = isVariant;
  }
  const session = options.session;
  const doc = await this.findOneAndUpdate(
    { productId, storeId, SKU },
    update,
    { upsert: true, new: true, setDefaultsOnInsert: true, session },
  );
  if (doc.quantity < 0) {
    // revert to prevent negative stock (using same session)
    await this.updateOne(
      { _id: doc._id },
      { $inc: { quantity: -delta } },
      { session },
    );
    throw new Error('Resulting quantity cannot be negative');
  }
  return doc;
};

export { stockSchema as StockSchema };
