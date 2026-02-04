import mongoose from 'mongoose';

const normalizeEmpty = (value) => {
  if (value === '' || value === null || value === undefined) {
    return undefined;
  }
  return value;
};

const productSchema = new mongoose.Schema(
  {
    // Global identification
    productName: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      minlength: [2, 'Product name must be at least 2 characters'],
      maxlength: [150, 'Product name cannot exceed 150 characters'],
    },
    SKU: {
      type: String,
      required: [true, 'SKU is required'],
      unique: true,
      trim: true,
      uppercase: true,
      minlength: [5, 'SKU must be at least 5 characters long'],
      maxlength: [30, 'SKU cannot exceed 30 characters'],
      validate: {
        validator: (v) => /^[A-Z0-9-_]+$/.test(v),
        message: (props) =>
          `${props.value} is not a valid SKU. Only letters, numbers, "-" and "_" allowed.`,
      },
    },

    // Variation controls
    hasVariation: {
      type: Boolean,
      default: false,
    },
    // Variant references (support single or composite variants)
    variantIds: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Variant',
        },
      ],
      set: function (v) {
        if (v === '' || v === null) return undefined;
        if (Array.isArray(v)) return v.length === 0 ? undefined : v;
        return v ? [v] : undefined;
      },
      required: function () {
        return this.hasVariation === true;
      },
      validate: {
        validator: function (arr) {
          if (this.hasVariation === true) {
            return Array.isArray(arr) && arr.length > 0;
          }
          return arr == null || arr.length === 0;
        },
        message:
          'variantIds must be a non-empty array when hasVariation is true, and empty when false',
      },
    },

    // Legacy barcode fields - kept for backward compatibility
    barcode: {
      type: String,
      trim: true,
      sparse: true, // allows multiple nulls but enforces uniqueness for non-null values
      unique: true, // enforce uniqueness across all products
      validate: {
        validator: function (v) {
          // If hasVariation is true, barcode should be null/undefined
          if (this.hasVariation === true && v) {
            return false;
          }
          // If hasVariation is false, validate barcode format
          return !v || /^[0-9]{8,20}$/.test(v);
        },
        // Avoid using document context in message to prevent runtime errors
        message: (props) =>
          `${props.value} is not allowed as a main product barcode (invalid or not permitted for variant products)`,
      },
    },
    barcodeUrl: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          // If hasVariation is true, barcodeUrl should be null/undefined
          if (this.hasVariation === true && v) {
            return false;
          }
          return true;
        },
        message: function () {
          return 'Main product barcode URL is not allowed when hasVariation is true. Only variants should have barcode URLs.';
        },
      },
    },

    // Global classification
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProductCategory',
      required: [true, 'Category is required'],
    },
    subCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SubCategory',
      required: [true, 'Sub category is required'],
    },
    brand: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Brand',
      required: [true, 'Brand is required'],
    },

    // Global content
    description: {
      type: String,
      trim: true,
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
    },
    productImage: {
      type: String, // URL or file path
      trim: true,
    },
    tax: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TenantTax',
    }],
    warrantyType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warranty',
      default: null,
      set: normalizeEmpty,
    },
    expiryDate: {
      type: String,
      set: normalizeEmpty,
      validate: {
        validator: function (v) {
          if (!v) return true; // Allow empty values
          // Check if it's a valid yyyy-mm-dd format
          const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
          if (!dateRegex.test(v)) return false;
          // Check if it's a valid date
          const date = new Date(v);
          if (!(date instanceof Date && !isNaN(date))) return false;
          // Check if it's in the future
          return date > new Date();
        },
        message: 'Expiry date must be in yyyy-mm-dd format and in the future',
      },
    },
    dimensions: {
      type: String, // Example: "10x20x30"
      trim: true,
      validate: {
        validator: (v) => !v || /^\d+x\d+x\d+$/.test(v),
        message: 'Dimensions must be in LxWxH format (numbers only)',
      },
    },
    unit: {
      unit: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Unit',
        required: [true, 'Unit is required'],
      },
      value: {
        type: Number,
        required: [true, 'Unit value is required'],
        min: [0, 'Unit value cannot be negative'],
      },
    },

    status: {
      type: Boolean,
      default: true, // true = Active, false = Inactive
    },

    // Variant data for variant products (no store quantities here)
    variantData: [
      {
        variantValues: [
          {
            value: String,
            valueId: mongoose.Schema.Types.ObjectId,
          },
        ],
        SKU: {
          type: String,
          required: true,
          trim: true,
          uppercase: true,
          validate: {
            validator: (v) => /^[A-Z0-9-_]+$/.test(v),
          },
        },
        barcode: {
          type: String,
          trim: true,
          validate: {
            validator: (v) => /^[0-9]{8,20}$/.test(v),
          },
        },
        barcodeUrl: {
          type: String,
          trim: true,
        },
        variantImage: {
          type: String,
          trim: true,
        },
        status: {
          type: Boolean,
          default: true,
        },
        costPrice: {
          type: Number,
          required: true,
          min: [0, 'Cost Price cannot be negative'],
        },
        sellingPrice: {
          type: Number,
          required: true,
          min: [0, 'Selling Price cannot be negative'],
        },
        discount: {
          type: Number,
          default: 0,
          min: [0, 'Discount cannot be negative'],
        },
        lowStockAlert: {
          type: Number,
          default: 0,
          min: [0, 'Low stock alert cannot be negative'],
        },
      },
    ],
    // Non-variant pricing (only when hasVariation is false)
    costPrice: {
      type: Number,
      min: [0, 'Cost Price cannot be negative'],
      required: function () {
        return this.hasVariation === false;
      },
    },
    sellingPrice: {
      type: Number,
      min: [0, 'Selling Price cannot be negative'],
      required: function () {
        return this.hasVariation === false;
      },
    },
    discount: {
      type: Number,
      min: [0, 'Discount cannot be negative'],
      default: 0,
      validate: {
        validator: function (v) {
          // If variant product, discount should not be set at top level (or 0)
          if (this.hasVariation === true && v > 0) return false;
          return true;
        },
        message: 'Main product discount must be 0 when variants are present',
      },
    },
    lowStockAlert: {
      type: Number,
      min: [0, 'Low stock alert cannot be negative'],
      default: 0,
      validate: {
        validator: function (v) {
          // If variant product, lowStockAlert should not be set at top level (or 0)
          if (this.hasVariation === true && v > 0) return false;
          return true;
        },
        message: 'Main product low stock alert must be 0 when variants are present',
      },
    },
  },
  { timestamps: true },
);

// Indexes for performance
productSchema.index({ productName: 'text', description: 'text' }); // full-text search
productSchema.index({ category: 1, brand: 1 }); // compound query optimization
productSchema.index({ status: 1 }); // product status filtering
productSchema.index({ expiryDate: 1 }); // track near-expiry products

// VariantData indexes
productSchema.index({ 'variantData.SKU': 1 });
productSchema.index({ 'variantData.barcode': 1 });
productSchema.index({ 'variantData.status': 1 });
productSchema.index({ 'variantData.variantValues.valueId': 1 });

// Validation to ensure proper variation setup (top-level only)
productSchema.pre('save', async function (next) {
  // Clear main product barcode fields for variant products
  if (this.hasVariation === true) {
    this.barcode = undefined;
    this.barcodeUrl = undefined;
  }

  // For variant products
  if (this.hasVariation === true) {
    if (!Array.isArray(this.variantIds) || this.variantIds.length === 0) {
      return next(
        new Error(
          'variantIds must be a non-empty array when hasVariation is true',
        ),
      );
    }
    if (!Array.isArray(this.variantData) || this.variantData.length === 0) {
      return next(
        new Error('variantData must contain at least one variant combination'),
      );
    }

    // Batch-load allowed variant value IDs for all variantIds
    let variantDocs;
    try {
      const Variant = this.model('Variant');
      variantDocs = await Variant.find({ _id: { $in: this.variantIds } })
        .select({ _id: 1, values: 1 })
        .lean();
    } catch (err) {
      return next(err);
    }
    if (!variantDocs || variantDocs.length !== this.variantIds.length) {
      return next(new Error('One or more variantIds do not exist'));
    }

    // Map valueId -> variantId for reverse lookup
    // AND variantId -> Set(valueIds) for checking existence
    const variantIdByValueId = new Map();
    const allowedByVariantId = new Map();

    for (const v of variantDocs) {
      const vId = String(v._id);
      const allowed = new Set();
      if (Array.isArray(v.values)) {
        v.values.forEach((vv) => {
          const valId = String(vv._id);
          allowed.add(valId);
          variantIdByValueId.set(valId, vId);
        });
      }
      allowedByVariantId.set(vId, allowed);
    }

    // Validate each variantData entry
    const comboKeys = [];
    const skuSet = new Set();
    const barcodeSet = new Set();

    for (const entry of this.variantData) {
      if (
        !Array.isArray(entry.variantValues) ||
        entry.variantValues.length === 0
      ) {
        return next(
          new Error('Each variantData entry must include variantValues'),
        );
      }

      // Instead of checking length, we validate that every provided value belongs to a valid variantId
      // and ensure we don't have multiple values for the same variantId.
      const foundDimensions = new Map(); // variantId -> valueId

      for (const v of entry.variantValues) {
        const valId = String(v.valueId);
        if (!valId) {
          return next(
            new Error('Each variantValues item must include valueId'),
          );
        }

        const parentVariantId = variantIdByValueId.get(valId);
        if (!parentVariantId) {
          // If the valueId isn't found in any of the linked variant definitions
          return next(
            new Error(
              `Value ID ${valId} does not belong to any of the product's assigned variantIds`,
            ),
          );
        }

        // Check for duplicates (two values for the same variation dimension, e.g. two Colors)
        if (foundDimensions.has(parentVariantId)) {
          return next(
            new Error(
              `Multiple values provided for the same variant dimension: ${parentVariantId}`,
            ),
          );
        }
        foundDimensions.set(parentVariantId, valId);
      }

      // Build a canonical key based on the strict order of this.variantIds
      // Use "MISSING" for any dimension not provided in this entry
      const ids = this.variantIds.map((vId) => {
        return foundDimensions.get(String(vId)) || 'MISSING';
      });

      const key = ids.join('|');
      if (comboKeys.includes(key)) {
        return next(
          new Error('Duplicate variant combination found in variantData'),
        );
      }
      comboKeys.push(key);

      // SKU uniqueness within product
      if (skuSet.has(entry.SKU)) {
        return next(new Error('Duplicate SKU found in variantData'));
      }
      skuSet.add(entry.SKU);

      // Barcode uniqueness within product (ignore empty)
      if (entry.barcode) {
        if (barcodeSet.has(entry.barcode)) {
          return next(new Error('Duplicate barcode found in variantData'));
        }
        barcodeSet.add(entry.barcode);
      }
    }
  } else {
    // Non-variant products: ensure variantData is empty/undefined
    if (Array.isArray(this.variantData) && this.variantData.length > 0) {
      return next(
        new Error('variantData must be empty when hasVariation is false'),
      );
    }
  }

  next();
});

export { productSchema as ProductSchema };
