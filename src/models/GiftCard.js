import mongoose from 'mongoose';

const giftCardSchema = new mongoose.Schema(
  {
    // Gift Card Name
    name: {
      type: String,
      required: [true, 'Gift card name is required'],
      trim: true,
      minlength: [2, 'Gift card name must be at least 2 characters'],
      maxlength: [100, 'Gift card name cannot exceed 100 characters'],
      index: true,
    },

    // Gift Card Number (Auto / Manual)
    number: {
      type: String,
      required: [true, 'Gift card number is required'],
      trim: true,
      minlength: [4, 'Gift card number must be at least 4 characters'],
      maxlength: [50, 'Gift card number cannot exceed 50 characters'],
      validate: {
        validator: (v) => /^[A-Z0-9-_]+$/.test(v),
        message:
          'Gift card number can only contain uppercase letters, numbers, hyphens, and underscores',
      },
    },

    // Number Generation Type (Auto or Manual)
    numberGenerationType: {
      type: String,
      enum: {
        values: ['Auto', 'Manual'],
        message: 'Number generation type must be either "Auto" or "Manual"',
      },
      required: [true, 'Number generation type is required'],
      default: 'Auto',
    },

    // Gift Card Value
    value: {
      type: Number,
      required: [true, 'Gift card value is required'],
      min: [0.01, 'Gift card value must be greater than 0'],
      validate: {
        validator: function (value) {
          // Ensure value has at most 2 decimal places
          return value === Math.round(value * 100) / 100;
        },
        message: 'Gift card value cannot have more than 2 decimal places',
      },
    },

    // Threshold Amount (Optional)
    thresholdAmount: {
      type: Number,
      default: null,
      min: [0, 'Threshold amount cannot be negative'],
      validate: {
        validator: function (value) {
          if (value === null || value === undefined) return true;
          // Ensure value has at most 2 decimal places
          return value === Math.round(value * 100) / 100;
        },
        message: 'Threshold amount cannot have more than 2 decimal places',
      },
    },

    // Validity (Future Date) - ISO date string
    validity: {
      type: Date,
      required: [true, 'Validity date is required'],
      validate: {
        validator: function (value) {
          // Support both document validation (save) and query validation (findOneAndUpdate)
          const isDocumentContext =
            this &&
            typeof this.isNew === 'boolean' &&
            typeof this.isModified === 'function';

          // Document context: rely on document APIs
          if (isDocumentContext) {
            if (!this.isNew && !this.isModified('validity')) {
              return true;
            }
            const validityDate = new Date(value);
            return validityDate > new Date();
          }

          // Query context: pull the incoming update payload
          const update =
            (this &&
              typeof this.getUpdate === 'function' &&
              this.getUpdate()) ||
            {};
          const payload = update.$set || update;

          if (
            payload &&
            Object.prototype.hasOwnProperty.call(payload, 'validity')
          ) {
            const validityDate = new Date(payload.validity);
            return validityDate > new Date();
          }

          // Validity not being updated
          return true;
        },
        message: 'Validity date must be a future date',
      },
      index: true,
    },

    // Customer Scope (Specific / All)
    customerScope: {
      type: String,
      enum: {
        values: ['Specific', 'All'],
        message: 'Customer scope must be either "Specific" or "All"',
      },
      required: [true, 'Customer scope is required'],
      default: 'All',
    },

    // Specific customer IDs if customerScope is "Specific"
    assignedCustomerIds: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Customer',
          validate: {
            validator: function (v) {
              return mongoose.isValidObjectId(v);
            },
            message: 'Invalid customer ID',
          },
        },
      ],
      default: [],
      validate: {
        validator: function (value) {
          // If customerScope is "Specific", at least one customer ID is required
          if (this.customerScope === 'Specific') {
            return value && value.length > 0;
          }
          return true;
        },
        message:
          'At least one customer ID is required when customer scope is "Specific"',
      },
    },

    // Terms & Conditions (HTML)
    terms: {
      type: String,
      trim: true,
      maxlength: [10000, 'Terms & conditions cannot exceed 10000 characters'],
      default: null,
    },

    // Gift Card Image URL
    giftCardImage: {
      type: String,
      trim: true,
      default: null,
      validate: {
        validator: function (value) {
          if (!value) return true; // Optional field
          // Validate URL format
          try {
            new URL(value);
            return true;
          } catch {
            return false;
          }
        },
        message: 'Image must be a valid URL',
      },
    },

    // Status (Active / Inactive)
    status: {
      type: String,
      enum: {
        values: ['Active', 'Inactive'],
        message: 'Status must be either "Active" or "Inactive"',
      },
      required: [true, 'Status is required'],
      default: 'Active',
      index: true,
    },

    // Soft delete
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    
    // ===== USAGE TRACKING =====
    // Track which customers have used this gift card (one-time per customer)
    usedByCustomerIds: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Customer',
        },
      ],
      default: [],
    },
    // Track usage details for audit purposes
    usageHistory: {
      type: [
        {
          customerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Customer',
          },
          saleId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Sales',
          },
          usedAt: {
            type: Date,
            default: Date.now,
          },
          amountUsed: {
            type: Number,
            min: 0,
          },
        },
      ],
      default: [],
    },
    // Total usage count (for quick reference)
    usageCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ===== OPTIMIZED INDEXES FOR PERFORMANCE =====

// Unique constraint on gift card number
giftCardSchema.index({ number: 1 }, { unique: true, sparse: true });

// Primary queries (most common access patterns)
giftCardSchema.index({ status: 1, validity: 1 });
giftCardSchema.index({ customerScope: 1, status: 1 });
giftCardSchema.index({ status: 1, createdAt: -1 });

// Customer-specific queries
giftCardSchema.index({ assignedCustomerIds: 1, status: 1 });
giftCardSchema.index({ assignedCustomerIds: 1, validity: 1 });

// Validity and expiration queries
giftCardSchema.index({ validity: 1, status: 1 });

// Search and filtering
giftCardSchema.index({ name: 1, status: 1 });

// Timestamp queries
giftCardSchema.index({ createdAt: -1 });
giftCardSchema.index({ updatedAt: -1 });

// Usage tracking indexes
giftCardSchema.index({ usedByCustomerIds: 1 });
giftCardSchema.index({ usageCount: 1 });

// ===== VIRTUAL FIELDS =====

// Virtual for checking if gift card is expired
giftCardSchema.virtual('isExpired').get(function () {
  return new Date() > this.validity;
});

// Virtual for checking if gift card is valid (not expired and active)
giftCardSchema.virtual('isValid').get(function () {
  return this.status === 'Active' && !this.isExpired;
});

// Virtual for checking if gift card is fully used
// For 'All' scope: This virtual is not meaningful since each customer can use it once
// For 'Specific' scope: Check if all assigned customers have used it
giftCardSchema.virtual('isFullyUsed').get(function () {
  if (this.customerScope === 'All') {
    // For 'All' scope, gift card is never "fully used" in the traditional sense
    // Each customer can use it once, so it's never fully exhausted
    // Return false to indicate it can still be used by other customers
    return false;
  }
  // For 'Specific' scope, check if all assigned customers have used it
  if (!this.assignedCustomerIds || this.assignedCustomerIds.length === 0) {
    return false;
  }
  return this.assignedCustomerIds.every((assignedId) =>
    this.usedByCustomerIds.some(
      (usedId) => usedId.toString() === assignedId.toString(),
    ),
  );
});

// Virtual for days until expiration
giftCardSchema.virtual('daysUntilExpiration').get(function () {
  const now = new Date();
  const expiration = new Date(this.validity);
  const diffTime = expiration - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
});

// Virtual for formatted validity date
giftCardSchema.virtual('formattedValidity').get(function () {
  return this.validity.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
});

// Virtual for status display
giftCardSchema.virtual('statusDisplay').get(function () {
  if (this.isExpired) {
    return 'Expired';
  }
  return this.status;
});

// ===== PRE-SAVE MIDDLEWARE =====

giftCardSchema.pre('save', function (next) {
  // Ensure number is uppercase if provided
  if (this.number) {
    this.number = this.number.toUpperCase().trim();
  }

  // Ensure name is properly trimmed
  if (this.name) {
    this.name = this.name.trim();
  }

  // Validate assignedCustomerIds when customerScope is Specific
  if (this.customerScope === 'Specific') {
    if (!this.assignedCustomerIds || this.assignedCustomerIds.length === 0) {
      return next(
        new Error(
          'At least one customer ID is required when customer scope is "Specific"',
        ),
      );
    }
  } else if (this.customerScope === 'All') {
    // Clear assignedCustomerIds if scope is All
    this.assignedCustomerIds = [];
  }

  next();
});

// ===== PRE-VALIDATE MIDDLEWARE =====

giftCardSchema.pre('validate', function (next) {
  // Additional validation for assignedCustomerIds
  if (this.customerScope === 'Specific') {
    if (!this.assignedCustomerIds || this.assignedCustomerIds.length === 0) {
      return next(
        new Error(
          'At least one customer ID is required when customer scope is "Specific"',
        ),
      );
    }
  }
  next();
});

// ===== STATIC METHODS =====

// Find active gift cards
giftCardSchema.statics.findActive = function () {
  return this.find({
    status: 'Active',
    validity: { $gt: new Date() },
    isDeleted: { $ne: true },
  });
};

// Find gift cards by customer
giftCardSchema.statics.findByCustomer = function (customerId) {
  return this.find({
    $or: [{ customerScope: 'All' }, { assignedCustomerIds: customerId }],
    status: 'Active',
    validity: { $gt: new Date() },
    isDeleted: { $ne: true },
  });
};

// Find expired gift cards
giftCardSchema.statics.findExpired = function () {
  return this.find({
    validity: { $lte: new Date() },
    isDeleted: { $ne: true },
  });
};

// Find gift cards expiring soon (within specified days)
giftCardSchema.statics.findExpiringSoon = function (days = 30) {
  const now = new Date();
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);

  return this.find({
    validity: {
      $gte: now,
      $lte: futureDate,
    },
    status: 'Active',
    isDeleted: { $ne: true },
  });
};

// Find gift cards by value range
giftCardSchema.statics.findByValueRange = function (minValue, maxValue) {
  return this.find({
    value: {
      $gte: minValue,
      $lte: maxValue,
    },
    status: 'Active',
    isDeleted: { $ne: true },
  });
};

// ===== INSTANCE METHODS =====

// Check if gift card can be used by a specific customer
giftCardSchema.methods.canBeUsedByCustomer = function (customerId) {
  // Check if gift card is valid
  if (!this.isValid) {
    return false;
  }

  // If scope is All, check if this specific customer has already used it
  if (this.customerScope === 'All') {
    if (!customerId) {
      // Without customerId, we can't check per-customer usage
      // For walk-in customers, allow usage (they don't have customerId)
      return true;
    }
    // Check if this specific customer has already used the gift card
    const hasUsed = this.usedByCustomerIds.some(
      (id) => id && id.toString() === customerId.toString(),
    );
    return !hasUsed; // Can be used if customer hasn't used it yet
  }

  // If scope is Specific, check if customer is in assigned list AND hasn't used it yet
  if (this.customerScope === 'Specific') {
    const isAssigned = this.assignedCustomerIds.some(
      (id) => id.toString() === customerId.toString(),
    );
    if (!isAssigned) {
      return false;
    }
    
    // Check if customer has already used this gift card
    const hasUsed = this.usedByCustomerIds.some(
      (id) => id.toString() === customerId.toString(),
    );
    return !hasUsed;
  }

  return false;
};

// Check if customer has already used this gift card
giftCardSchema.methods.hasBeenUsedByCustomer = function (customerId) {
  if (!customerId) return false;
  return this.usedByCustomerIds.some(
    (id) => id.toString() === customerId.toString(),
  );
};

// Record gift card usage
giftCardSchema.methods.recordUsage = function (customerId, saleId, amountUsed) {
  if (customerId) {
    const customerIdStr = customerId.toString();
    // Check if customer already used this gift card
    const alreadyUsed = this.usedByCustomerIds.some(
      (id) => id.toString() === customerIdStr,
    );
    if (!alreadyUsed) {
      this.usedByCustomerIds.push(customerId);
    }
  }
  
  // Add to usage history
  this.usageHistory.push({
    customerId: customerId || null,
    saleId: saleId || null,
    usedAt: new Date(),
    amountUsed: amountUsed || this.value,
  });
  
  // Increment usage count
  this.usageCount += 1;
  
  return this;
};

// Activate gift card
giftCardSchema.methods.activate = function () {
  this.status = 'Active';
  return this.save();
};

// Deactivate gift card
giftCardSchema.methods.deactivate = function () {
  this.status = 'Inactive';
  return this.save();
};

// Add customer to assigned list
giftCardSchema.methods.addCustomer = function (customerId) {
  if (this.customerScope !== 'Specific') {
    throw new Error('Cannot add customer: Gift card scope must be "Specific"');
  }

  if (!mongoose.isValidObjectId(customerId)) {
    throw new Error('Invalid customer ID');
  }

  const customerIdStr = customerId.toString();
  if (!this.assignedCustomerIds.some((id) => id.toString() === customerIdStr)) {
    this.assignedCustomerIds.push(customerId);
  }

  return this.save();
};

// Remove customer from assigned list
giftCardSchema.methods.removeCustomer = function (customerId) {
  if (this.customerScope !== 'Specific') {
    throw new Error(
      'Cannot remove customer: Gift card scope must be "Specific"',
    );
  }

  // Check if removing this customer would leave assignedCustomerIds empty
  const customerIdStr = customerId.toString();
  const wouldBeEmpty =
    this.assignedCustomerIds.length === 1 &&
    this.assignedCustomerIds.some((id) => id.toString() === customerIdStr);

  if (wouldBeEmpty) {
    throw new Error(
      'Cannot remove last customer from a Specific-scoped gift card',
    );
  }

  // Only mutate after validation passes
  this.assignedCustomerIds = this.assignedCustomerIds.filter(
    (id) => id.toString() !== customerIdStr,
  );

  return this.save();
};

// Check if gift card meets threshold requirement
giftCardSchema.methods.meetsThreshold = function (purchaseAmount) {
  if (!this.thresholdAmount) {
    return true; // No threshold requirement
  }
  return purchaseAmount >= this.thresholdAmount;
};

export { giftCardSchema };
