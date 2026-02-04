import mongoose from 'mongoose';

const customerSchema = new mongoose.Schema(
  {
    customerCode: {
      type: String,
      required: [true, 'Customer code is required'],
      trim: true,
      uppercase: true,
      minlength: [3, 'Customer code must be at least 3 characters long'],
      maxlength: [20, 'Customer code cannot exceed 20 characters'],
      validate: {
        validator: (v) => /^[A-Z0-9-_]+$/.test(v),
      },
      message: (props) =>
        `${props.value} is not a valid customer code. Only letters, numbers, "-" and "_" allowed.`,
    },
    customerName: {
      type: String,
      required: [true, 'Customer name is required'],
      trim: true,
      minlength: [2, 'Customer name must be at least 2 characters'],
      maxlength: [50, 'Customer name cannot exceed 50 characters'],
      validate: {
        validator: (v) => /^[a-zA-Z\s'-]+$/.test(v),
        message:
          'Customer name can only contain letters, spaces, hyphens, and apostrophes',
      },
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      validate: {
        validator(value) {
          // Only validate if email is provided (not null/undefined)
          // Skip validation if email is not provided (allows optional email)
          if (value === null || value === undefined) {
            return true; // Allow null/undefined
          }
          // If provided, must be valid email format
          if (typeof value !== 'string' || value.trim() === '') {
            return false; // Reject empty strings
          }
          return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value);
        },
        message: 'Invalid email address format',
      },
    },

    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      validate: {
        validator: (v) => /^\+?\d{7,15}$/.test(v),
        message:
          'Please provide a valid phone number (7-15 digits, optionally prefixed with +)',
      },
    },

    gender: {
      type: String,
      enum: {
        values: ['Male', 'Female', 'Other'],
        message: 'Gender must be one of: Male, Female, Other',
      },
    },

    address: {
      street: {
        type: String,
        trim: true,
        maxlength: [200, 'Street address cannot exceed 200 characters'],
      },
      city: {
        type: String,
        trim: true,
        maxlength: [100, 'City name cannot exceed 100 characters'],
      },
      state: {
        type: String,
        trim: true,
        maxlength: [100, 'State name cannot exceed 100 characters'],
      },
      country: {
        type: String,
        trim: true,
        maxlength: [100, 'Country name cannot exceed 100 characters'],
        default: 'India',
      },
      pincode: {
        type: String,
        trim: true,
      },
    },

    // Status and tracking
    isActive: {
      type: Boolean,
      default: true,
    },

    // Audit fields
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // Soft delete
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
    id: false,
  },
);

// Indexes for performance optimization
// Unique indexes
customerSchema.index({ customerCode: 1 }, { unique: true }); // Required for generateCustomerCode uniqueness guarantee
customerSchema.index({ email: 1 }, { unique: true, sparse: true }); // sparse allows multiple null/undefined values
customerSchema.index({ phone: 1 }, { unique: true });

// Single field indexes for common queries
customerSchema.index({ customerName: 1 });
customerSchema.index({ isActive: 1 });
customerSchema.index({ isDeleted: 1 });
customerSchema.index({ createdBy: 1 });
customerSchema.index({ updatedBy: 1 });

// Compound indexes for common query patterns
customerSchema.index({ isActive: 1, isDeleted: 1 }); // For active customer queries
customerSchema.index({ 'address.city': 1, 'address.state': 1 }); // For location-based queries
customerSchema.index({ 'address.country': 1, 'address.state': 1 }); // For country/state queries
customerSchema.index({ createdAt: -1 }); // For chronological sorting
customerSchema.index({ updatedAt: -1 }); // For recent updates

// Text index for full-text search across multiple fields
customerSchema.index({
  customerName: 'text',
  email: 'text',
  phone: 'text',
  'address.city': 'text',
  'address.state': 'text',
  'address.country': 'text',
});

// Pre-save middleware for validation and business rules
customerSchema.pre('save', async function (next) {
  try {
    // Normalize email: only normalize if it's a valid non-empty string
    // Service layer already removes empty emails, so this just handles normalization
    if (this.email && typeof this.email === 'string' && this.email.trim() !== '') {
      this.email = this.email.toLowerCase().trim();
    }

    // Normalize phone number (remove spaces, keep + prefix)
    if (this.phone) {
      this.phone = this.phone.replace(/\s+/g, '');
    }

    // Capitalize first letter of customerName
    if (this.customerName) {
      this.customerName =
        this.customerName.charAt(0).toUpperCase() +
        this.customerName.slice(1).toLowerCase();
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Pre-update middleware for validation
customerSchema.pre(['updateOne', 'findOneAndUpdate'], async function (next) {
  try {
    const update = this.getUpdate();
    
    // If $unset is being used for email, don't process it in $set
    const isEmailBeingUnset = update.$unset && update.$unset.email !== undefined;
    
    if (update.$set) {
      // Normalize email if being updated (and not being unset)
      if ('email' in update.$set && !isEmailBeingUnset) {
        if (
          update.$set.email &&
          typeof update.$set.email === 'string' &&
          update.$set.email.trim() !== ''
        ) {
          update.$set.email = update.$set.email.toLowerCase().trim();
        } else {
          // Remove email field if empty to avoid sparse index conflicts
          // Delete from $set and add to $unset to properly remove the field
          delete update.$set.email;
          if (!update.$unset) {
            update.$unset = {};
          }
          update.$unset.email = '';
        }
      }
      // Normalize phone if being updated
      if (update.$set.phone) {
        update.$set.phone = update.$set.phone.replace(/\s+/g, '');
      }
      // Capitalize names if being updated
      if (update.$set.customerName) {
        update.$set.customerName =
          update.$set.customerName.charAt(0).toUpperCase() +
          update.$set.customerName.slice(1).toLowerCase();
      }
    }
    next();
  } catch (error) {
    next(error);
  }
});

// Virtual for full name
customerSchema.virtual('fullName').get(function () {
  return `${this.customerName}`.trim();
});



// Instance methods
customerSchema.methods.isActiveCustomer = function () {
  return this.isActive === true && !this.isDeleted;
};

customerSchema.methods.canPlaceOrders = function () {
  return this.isActive === true && !this.isDeleted;
};

// Static methods
customerSchema.statics.findActive = function () {
  return this.find({
    isActive: true,
    isDeleted: false,
  }).sort({ customerName: 1 });
};

customerSchema.statics.findByStatus = function (isActive) {
  const query = { isActive, isDeleted: false };
  return this.find(query).sort({ customerName: 1 });
};

customerSchema.statics.searchCustomers = function (searchTerm) {
  const query = {
    isDeleted: false,
    $text: { $search: searchTerm },
  };
  return this.find(query, { score: { $meta: 'textScore' } }).sort({
    score: { $meta: 'textScore' },
  });
};

customerSchema.statics.findByLocation = function (city, state) {
  const query = {
    isDeleted: false,
    'address.city': new RegExp(city, 'i'),
    'address.state': new RegExp(state, 'i'),
  };
  return this.find(query).sort({ customerName: 1 });
};

customerSchema.statics.findByGender = function (gender) {
  const query = {
    isDeleted: false,
    gender,
  };
  return this.find(query).sort({ customerName: 1 });
};

// Ensure virtuals are included when converting to JSON/Object
customerSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    // Remove sensitive fields if needed in the future
    return ret;
  },
});

customerSchema.set('toObject', {
  virtuals: true,
  transform(doc, ret) {
    // Remove sensitive fields if needed in the future
    return ret;
  },
});

export { customerSchema as CustomerSchema };
