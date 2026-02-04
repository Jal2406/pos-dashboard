import mongoose from 'mongoose';

const supplierSchema = new mongoose.Schema(
  {
    supplierCode: {
      type: String,
      required: [true, 'Supplier code is required'],
      trim: true,
      uppercase: true,
      minlength: [3, 'Supplier code must be at least 3 characters long'],
      maxlength: [20, 'Supplier code cannot exceed 20 characters'],
      validate: {
        validator: (v) => /^[A-Z0-9-_]+$/.test(v),
        message: (props) =>
          `${props.value} is not a valid supplier code. Only letters, numbers, "-" and "_" allowed.`,
      },
    },

    name: {
      type: String,
      required: [true, 'Supplier name is required'],
      trim: true,
      minlength: [2, 'Supplier name must be at least 2 characters'],
      maxlength: [150, 'Supplier name cannot exceed 150 characters'],
      index: true,
    },

    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
      validate: {
        validator(value) {
          return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value);
        },
        message: 'Invalid email address',
      },
    },

    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      validate: {
        validator: (v) => /^\+?[0-9]{7,15}$/.test(v),
        message: 'Please provide a valid phone number (7-15 digits)',
      },
      index: true,
    },

    supplierImage: {
      type: String,
      trim: true,
      default: null,
      validate: {
        validator: (v) =>
          !v || /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/i.test(v),
        message: 'Image must be a valid URL with image extension',
      },
    },

    address: {
      street: {
        type: String,
        required: [true, 'Street address is required'],
        trim: true,
        maxlength: [200, 'Street address cannot exceed 200 characters'],
      },
      city: {
        type: String,
        required: [true, 'City is required'],
        trim: true,
        maxlength: [100, 'City name cannot exceed 100 characters'],
        index: true,
      },
      state: {
        type: String,
        required: [true, 'State is required'],
        trim: true,
        maxlength: [100, 'State name cannot exceed 100 characters'],
        index: true,
      },
      pincode: {
        type: String,
        required: [true, 'Pincode is required'],
        trim: true,
        validate: {
          validator: (v) => /^\d{4,10}$/.test(v),
          message: 'Pincode must be 4-10 digits',
        },
      },
      country: {
        type: String,
        required: [true, 'Country is required'],
        trim: true,
        maxlength: [100, 'Country name cannot exceed 100 characters'],
        default: 'India',
        index: true,
      },
    },

    // Business relationship fields removed - handled by tenant database

    // Status and tracking
    status: {
      type: Boolean,
      default: true,
      index: true,
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
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Indexes for performance optimization
supplierSchema.index({ supplierCode: 1 }, { unique: true });
supplierSchema.index({ email: 1 }, { unique: true });
// businessId indexes removed - handled by tenant database
supplierSchema.index({ 'address.city': 1, 'address.state': 1 });
supplierSchema.index({ 'address.pincode': 1 });
supplierSchema.index({ createdBy: 1 });
supplierSchema.index({ updatedBy: 1 });

// Compound indexes for common query patterns
supplierSchema.index({ status: 1, isDeleted: 1 });
supplierSchema.index({ createdAt: -1 });

// Text index for search functionality
supplierSchema.index({
  name: 'text',
  supplierCode: 'text',
  email: 'text',
  'address.city': 'text',
  'address.state': 'text',
});

// Pre-save middleware for validation and business rules
supplierSchema.pre('save', async function (next) {
  try {
    // Business rule: If status is false (inactive), ensure proper handling
    if (this.status === false) {
      // Keep isDeleted as is - inactive suppliers are still visible but not active
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Pre-update middleware for validation
supplierSchema.pre(['updateOne', 'findOneAndUpdate'], async function (next) {
  try {
    next();
  } catch (error) {
    next(error);
  }
});

// Virtual for full address
supplierSchema.virtual('fullAddress').get(function () {
  const addr = this.address;
  if (!addr) return '';

  const parts = [
    addr.street,
    addr.city,
    addr.state,
    addr.pincode,
    addr.country,
  ].filter(Boolean);

  return parts.join(', ');
});

// Virtual for display name with code
supplierSchema.virtual('displayName').get(function () {
  return `${this.name} (${this.supplierCode})`;
});

// Instance methods
supplierSchema.methods.isActive = function () {
  return this.status === true && !this.isDeleted;
};

supplierSchema.methods.canReceiveOrders = function () {
  return this.status === true && !this.isDeleted;
};

// Static methods
supplierSchema.statics.findActive = function () {
  return this.find({
    status: true,
    isDeleted: false,
  }).sort({ name: 1 });
};

supplierSchema.statics.findByStatus = function (status) {
  const query = { status, isDeleted: false };
  return this.find(query).sort({ name: 1 });
};

supplierSchema.statics.searchSuppliers = function (searchTerm) {
  const query = {
    isDeleted: false,
    $text: { $search: searchTerm },
  };
  return this.find(query, { score: { $meta: 'textScore' } }).sort({
    score: { $meta: 'textScore' },
  });
};

supplierSchema.statics.findByLocation = function (city, state) {
  const query = {
    isDeleted: false,
    'address.city': new RegExp(city, 'i'),
    'address.state': new RegExp(state, 'i'),
  };
  return this.find(query).sort({ name: 1 });
};

// Ensure virtuals are included when converting to JSON/Object
supplierSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    // Remove sensitive fields if needed
    return ret;
  },
});

supplierSchema.set('toObject', {
  virtuals: true,
  transform(doc, ret) {
    // Remove sensitive fields if needed
    return ret;
  },
});

export { supplierSchema as SupplierSchema };
