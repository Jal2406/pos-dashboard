import mongoose from 'mongoose';

const planSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['monthly', 'yearly', 'daily', 'weekly'],
      required: true,
    },
    price: {
      type: Number,
      required() {
        return !this.isTrial;
      },
      min: [0, 'Price must be a positive number'],
      default() {
        return this.isTrial ? 0 : undefined;
      },
    },
    discount: {
      type: Number,
      min: [0, 'Discount must be a non-negative number'],
      default: 0,
    },
    discountType: {
      type: String,
      enum: ['percentage', 'fixed'],
      default: 'fixed',
    },
    currencyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Currency',
      required: false, // Will be set automatically by pre-save middleware
      default: null,
    },
    storeLimit: {
      type: Number,
      required: true,
      min: [1, 'Store limit must be a non-negative number'],
    },
    staffLimit: {
      type: Number,
      required: true,
      min: [1, 'User limit must be a non-negative number'],
    },
    status: {
      type: Boolean,
      default: false,
    },
    isTrial: {
      type: Boolean,
      default: false,
    },
    taxes: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Tax',
        },
      ],
      default() {
        return this.isTrial ? [] : undefined;
      },
      validate: [
        {
          validator(value) {
            if (this.isTrial) {
              return Array.isArray(value) ? value.length === 0 : true;
            }
            return Array.isArray(value) && value.length > 0;
          },
          message: 'At least one tax is required for non-trial plans.',
        },
      ],
    },
    screens: [
      {
        type: String,
        enum: ['POS 1', 'POS 2', 'POS 3', 'POS 4', 'POS 5'],
        required: true,
      },
    ],
    description: {
      type: String,
      trim: true,
      maxLength: 500,
    },
    duration: {
      type: Number,
      required: true,
      min: [1, 'Duration must be a positive number'],
      validate: {
        validator(value) {
          return Number.isInteger(value) && value > 0;
        },
        message: 'Duration must be a positive integer',
      },
    },
    modules: [
      {
        type: String,
        enum: [
          'Sales',
          'Inventory',
          'POS',
          'Dashboard',
          'Reports',
          'Customer',
          'Employee',
          'Purchase',
          'Returns',
          'Finance',
          'Tax',
        ],
        required: true,
      },
    ],
    totalPrice: {
      type: Number,
      default: 0,
      min: [0, 'Total price must be a non-negative number'],
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Pre-save middleware to ensure only one free plan exists and validate trial plan constraints
planSchema.pre('save', async function (next) {
  try {
    // Only check if this is a free plan
    if (this.isTrial === true || this.price === 0) {
      const query = {
        _id: { $ne: this._id }, // Exclude current document for updates
        $or: [{ isTrial: true }, { price: 0 }],
      };

      const existingFreePlan = await this.constructor.findOne(query);

      if (existingFreePlan) {
        const error = new Error(
          'Only one free plan is allowed in the database',
        );
        return next(error);
      }
    }

    // Ensure price is set to 0 for trial plans
    if (this.isTrial === true && this.price !== 0) {
      this.price = 0;
    }

    // Ensure taxes array is cleared for trial plans
    if (this.isTrial === true && this.taxes?.length) {
      this.taxes = [];
    }

    // Ensure currencyId is null for trial plans
    if (this.isTrial === true && this.currencyId !== null) {
      this.currencyId = null;
    }

    // For non-trial plans, automatically set the primary currency
    if (!this.isTrial) {
      const Currency = mongoose.model('Currency');
      let primaryCurrency = await Currency.findOne({
        isPrimary: true,
        isDeleted: false,
      });

      // If no primary currency exists, find any currency and set it as primary
      if (!primaryCurrency) {
        primaryCurrency = await Currency.findOne({ isDeleted: false });
        if (primaryCurrency) {
          // Set the first available currency as primary
          await Currency.findOneAndUpdate(
            { _id: primaryCurrency._id, isDeleted: false },
            {
              isPrimary: true,
            },
          );
        } else {
          // If no currencies exist at all, create a default one
          primaryCurrency = await Currency.create({
            currencyName: 'US Dollar',
            currencyCode: 'USD',
            currencySymbol: '$',
            currencyPosition: 'Left',
            thousandSeparator: ',',
            decimalSeparator: '.',
            numberOfDecimals: 2,
            isPrimary: true,
          });
        }
      }

      // Always use the primary currency for non-trial plans
      this.currencyId = primaryCurrency._id;
    }

    await this.refreshTotalPrice();

    next();
  } catch (error) {
    next(error);
  }
});

planSchema.methods.calculateTotalPrice = async function () {
  if (this.isTrial === true) {
    return 0;
  }

  const basePrice = Number(this.price) || 0;
  let discountValue = Number(this.discount) || 0;

  const discountType = (this.discountType || 'fixed').toLowerCase();
  if (discountType === 'percentage') {
    discountValue = (basePrice * discountValue) / 100;
  }

  if (discountValue > basePrice) {
    discountValue = basePrice;
  }

  let priceAfterDiscount = basePrice - discountValue;
  if (priceAfterDiscount < 0) {
    priceAfterDiscount = 0;
  }

  let taxAmount = 0;
  if (Array.isArray(this.taxes) && this.taxes.length > 0) {
    const Tax = mongoose.model('Tax');
    const taxDocs = await Tax.find({
      _id: { $in: this.taxes },
      isDeleted: false,
    }).lean();

    taxAmount = taxDocs.reduce((sum, taxDoc) => {
      if (!taxDoc) {
        return sum;
      }
      const taxType = (taxDoc.type || '').toLowerCase();
      const taxValue = Number(taxDoc.value) || 0;
      if (taxType === 'percentage') {
        return sum + (priceAfterDiscount * taxValue) / 100;
      }
      return sum + taxValue;
    }, 0);
  }

  const total = priceAfterDiscount + taxAmount;
  return Math.max(0, Math.round(total * 100) / 100);
};

planSchema.methods.refreshTotalPrice = async function () {
  this.totalPrice = await this.calculateTotalPrice();
  return this.totalPrice;
};

planSchema.pre('findOneAndUpdate', async function (next) {
  try {
    const update = this.getUpdate() || {};
    const fieldsToCheck = [
      'price',
      'discount',
      'discountType',
      'taxes',
      'isTrial',
    ];

    const hasRelevantUpdate = fieldsToCheck.some((field) => {
      if (field in update) {
        return true;
      }
      if (update.$set && field in update.$set) {
        return true;
      }
      if (update.$unset && field in update.$unset) {
        return true;
      }
      return false;
    });

    if (!hasRelevantUpdate) {
      return next();
    }

    const doc = await this.model.findOne(this.getQuery());
    if (!doc) {
      return next();
    }

    if (update.$set) {
      doc.set(update.$set);
    }

    if (update.$unset) {
      for (const key in update.$unset) {
        if (Object.prototype.hasOwnProperty.call(update.$unset, key)) {
          doc.set(key, undefined);
        }
      }
    }

    const directUpdates = {};
    for (const key in update) {
      if (!Object.prototype.hasOwnProperty.call(update, key)) {
        continue;
      }
      if (key.startsWith('$')) {
        continue;
      }
      directUpdates[key] = update[key];
    }
    if (Object.keys(directUpdates).length > 0) {
      doc.set(directUpdates);
    }

    const totalPrice = await doc.calculateTotalPrice();
    this.set({ totalPrice });

    next();
  } catch (error) {
    next(error);
  }
});

// Post-save validation to ensure currencyId is set for non-trial plans
planSchema.post('save', function (doc, next) {
  if (!doc.isTrial && !doc.currencyId) {
    const error = new Error('Currency is required for non-trial plans');
    return next(error);
  }
  next();
});

// Add indexes for better performance
planSchema.index({ isTrial: 1, status: 1 }); // For trial plan queries
planSchema.index({ status: 1 }); // For active plan queries
planSchema.index({ price: 1 }); // For free plan queries
planSchema.index({ currencyId: 1 }); // For currency-based queries
planSchema.index({ name: 1 }); // For plan name searches
planSchema.index({ type: 1, status: 1 }); // For plan type filtering
planSchema.index({ createdAt: -1 }); // For sorting by creation date
planSchema.index({ isDeleted: 1, deletedAt: 1 }); // For soft delete queries

const Plan = mongoose.model('Plan', planSchema);
export default Plan;
