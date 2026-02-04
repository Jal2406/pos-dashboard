import mongoose from 'mongoose';

const GeneralSettingsSchema = new mongoose.Schema(
  {
    // General Information
    appName: {
      type: String,
      required: [true, 'App name is required'],
      trim: true,
      minlength: [2, 'App name must be at least 2 characters'],
      maxlength: [100, 'App name must not exceed 100 characters'],
      validate: {
        validator: function (v) {
          return /^[a-zA-Z0-9\s\-_&().]+$/.test(v);
        },
        message:
          'App name can only contain letters, numbers, spaces, hyphens, underscores, ampersands, parentheses, and periods',
      },
    },
    contactNumber: {
      type: String,
      required: [true, 'Contact number is required'],
      trim: true,
      match: [
        /^\+?[0-9\s\-()]{7,20}$/,
        'Please provide a valid contact number (7-20 digits, may include +, spaces, hyphens, and parentheses)',
      ],
      validate: {
        validator: function (v) {
          // Remove all non-digit characters except + at the beginning
          const digitsOnly = v.replace(/[^\d+]/g, '');
          return digitsOnly.length >= 7 && digitsOnly.length <= 20;
        },
        message: 'Contact number must contain 7-20 digits',
      },
    },
    inquiryEmail: {
      type: String,
      required: [true, 'Inquiry email is required'],
      trim: true,
      lowercase: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        'Please provide a valid email address',
      ],
      validate: {
        validator: function (v) {
          return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(v);
        },
        message: 'Please provide a valid email address format',
      },
    },
    siteDescription: {
      type: String,
      required: [true, 'Site description is required'],
      trim: true,
      minlength: [10, 'Site description must be at least 10 characters'],
      maxlength: [500, 'Site description must not exceed 500 characters'],
      validate: {
        validator: function (v) {
          return v.trim().length >= 10;
        },
        message: 'Site description must be at least 10 characters long',
      },
    },
    footerText: {
      type: String,
      trim: true,
      maxlength: [200, 'Footer text must not exceed 200 characters'],
      default: '',
    },

    // Business Address
    businessAddress: {
      shopNumber: {
        type: String,
        trim: true,
        maxlength: [50, 'Shop number must not exceed 50 characters'],
        validate: {
          validator: function (v) {
            if (!v) return true; // Optional field
            return /^[a-zA-Z0-9\s\-_/.#]+$/.test(v);
          },
          message:
            'Shop number can only contain letters, numbers, spaces, hyphens, underscores, slashes, periods, and hash symbols',
        },
      },
      buildingName: {
        type: String,
        trim: true,
        maxlength: [100, 'Building name must not exceed 100 characters'],
        validate: {
          validator: function (v) {
            if (!v) return true; // Optional field
            return /^[a-zA-Z0-9\s\-_&().,]+$/.test(v);
          },
          message:
            'Building name can only contain letters, numbers, spaces, hyphens, underscores, ampersands, parentheses, periods, and commas',
        },
      },
      area: {
        type: String,
        trim: true,
        maxlength: [100, 'Area must not exceed 100 characters'],
        validate: {
          validator: function (v) {
            if (!v) return true; // Optional field
            return /^[a-zA-Z0-9\s\-_&().,]+$/.test(v);
          },
          message:
            'Area can only contain letters, numbers, spaces, hyphens, underscores, ampersands, parentheses, periods, and commas',
        },
      },
      landmark: {
        type: String,
        trim: true,
        maxlength: [100, 'Landmark must not exceed 100 characters'],
        validate: {
          validator: function (v) {
            if (!v) return true; // Optional field
            return /^[a-zA-Z0-9\s\-_&().,]+$/.test(v);
          },
          message:
            'Landmark can only contain letters, numbers, spaces, hyphens, underscores, ampersands, parentheses, periods, and commas',
        },
      },
      nearBy: {
        type: String,
        trim: true,
        maxlength: [100, 'Near by must not exceed 100 characters'],
        validate: {
          validator: function (v) {
            if (!v) return true; // Optional field
            return /^[a-zA-Z0-9\s\-_&().,]+$/.test(v);
          },
          message:
            'Near by can only contain letters, numbers, spaces, hyphens, underscores, ampersands, parentheses, periods, and commas',
        },
      },
      country: {
        type: String,
        trim: true,
        maxlength: [100, 'Country must not exceed 100 characters'],
        validate: {
          validator: function (v) {
            if (!v) return true; // Optional field
            return /^[a-zA-Z\s\-'()]+$/.test(v);
          },
          message:
            'Country can only contain letters, spaces, hyphens, apostrophes, and parentheses',
        },
      },
      state: {
        type: String,
        trim: true,
        maxlength: [100, 'State must not exceed 100 characters'],
        validate: {
          validator: function (v) {
            if (!v) return true; // Optional field
            return /^[a-zA-Z\s\-'()]+$/.test(v);
          },
          message:
            'State can only contain letters, spaces, hyphens, apostrophes, and parentheses',
        },
      },
      city: {
        type: String,
        trim: true,
        maxlength: [100, 'City must not exceed 100 characters'],
        validate: {
          validator: function (v) {
            if (!v) return true; // Optional field
            return /^[a-zA-Z\s\-'()]+$/.test(v);
          },
          message:
            'City can only contain letters, spaces, hyphens, apostrophes, and parentheses',
        },
      },
      postalCode: {
        type: String,
        trim: true,
        maxlength: [20, 'Postal code must not exceed 20 characters'],
        match: [
          /^[a-zA-Z0-9\s\-]{3,20}$/,
          'Postal code must be 3-20 characters and contain only letters, numbers, spaces, and hyphens',
        ],
        validate: {
          validator: function (v) {
            if (!v) return true; // Optional field
            return /^[a-zA-Z0-9\s\-]{3,20}$/.test(v);
          },
          message:
            'Postal code must be 3-20 characters and contain only letters, numbers, spaces, and hyphens',
        },
      },
      latitude: {
        type: Number,
        default: 0,
        min: [-90, 'Latitude must be between -90 and 90 degrees'],
        max: [90, 'Latitude must be between -90 and 90 degrees'],
        validate: {
          validator: function (v) {
            return v >= -90 && v <= 90;
          },
          message: 'Latitude must be between -90 and 90 degrees',
        },
      },
      longitude: {
        type: Number,
        default: 0,
        min: [-180, 'Longitude must be between -180 and 180 degrees'],
        max: [180, 'Longitude must be between -180 and 180 degrees'],
        validate: {
          validator: function (v) {
            return v >= -180 && v <= 180;
          },
          message: 'Longitude must be between -180 and 180 degrees',
        },
      },
      mapUrl: {
        type: String,
        trim: true,
        default: '',
      },
    },

    // Logo URLs
    logos: {
      darkLogo: {
        url: {
          type: String,
          trim: true,
          validate: {
            validator: function (v) {
              if (!v) return true; // Optional field
              return /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|svg|ico)$/i.test(v);
            },
            message:
              'Dark logo URL must be a valid image URL (jpg, jpeg, png, gif, webp, svg, ico)',
          },
        },
        publicId: {
          type: String,
          trim: true,
          validate: {
            validator: function (v) {
              if (!v) return true; // Optional field
              return /^[a-zA-Z0-9_\-/]+$/.test(v);
            },
            message:
              'Public ID can only contain letters, numbers, underscores, hyphens, and forward slashes',
          },
        },
      },
      lightLogo: {
        url: {
          type: String,
          trim: true,
          validate: {
            validator: function (v) {
              if (!v) return true; // Optional field
              return /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|svg|ico)$/i.test(v);
            },
            message:
              'Light logo URL must be a valid image URL (jpg, jpeg, png, gif, webp, svg, ico)',
          },
        },
        publicId: {
          type: String,
          trim: true,
          validate: {
            validator: function (v) {
              if (!v) return true; // Optional field
              return /^[a-zA-Z0-9_\-/]+$/.test(v);
            },
            message:
              'Public ID can only contain letters, numbers, underscores, hyphens, and forward slashes',
          },
        },
      },
      favicon: {
        url: {
          type: String,
          trim: true,
          validate: {
            validator: function (v) {
              if (!v) return true; // Optional field
              return /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|svg|ico)$/i.test(v);
            },
            message:
              'Favicon URL must be a valid image URL (jpg, jpeg, png, gif, webp, svg, ico)',
          },
        },
        publicId: {
          type: String,
          trim: true,
          validate: {
            validator: function (v) {
              if (!v) return true; // Optional field
              return /^[a-zA-Z0-9_\-/]+$/.test(v);
            },
            message:
              'Public ID can only contain letters, numbers, underscores, hyphens, and forward slashes',
          },
        },
      },
      collapsDarkLogo: {
        url: {
          type: String,
          trim: true,
          validate: {
            validator: function (v) {
              if (!v) return true; // Optional field
              return /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|svg|ico)$/i.test(v);
            },
            message:
              'Collapsible dark logo URL must be a valid image URL (jpg, jpeg, png, gif, webp, svg, ico)',
          },
        },
        publicId: {
          type: String,
          trim: true,
          validate: {
            validator: function (v) {
              if (!v) return true; // Optional field
              return /^[a-zA-Z0-9_\-/]+$/i.test(v);
            },
            message:
              'Public ID can only contain letters, numbers, underscores, hyphens, and forward slashes',
          },
        },
      },
      collapsLightLogo: {
        url: {
          type: String,
          trim: true,
          validate: {
            validator: function (v) {
              if (!v) return true; // Optional field
              return /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|svg|ico)$/i.test(v);
            },
            message:
              'Collapsible light logo URL must be a valid image URL (jpg, jpeg, png, gif, webp, svg, ico)',
          },
        },
        publicId: {
          type: String,
          trim: true,
          validate: {
            validator: function (v) {
              if (!v) return true; // Optional field
              return /^[a-zA-Z0-9_\-/]+$/i.test(v);
            },
            message:
              'Public ID can only contain letters, numbers, underscores, hyphens, and forward slashes',
          },
        },
      },
    },

    // Additional Settings
    isActive: {
      type: Boolean,
      default: true,
    },

    // Cache settings
    lastCachePurge: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Ensure only one general settings document exists
GeneralSettingsSchema.index({}, { unique: true });

// Custom validation methods
GeneralSettingsSchema.methods.validateContactNumber = function () {
  const phoneRegex = /^\+?[0-9\s\-()]{7,20}$/;
  if (!phoneRegex.test(this.contactNumber)) {
    throw new Error('Invalid contact number format');
  }
  return true;
};

GeneralSettingsSchema.methods.validateEmail = function () {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(this.inquiryEmail)) {
    throw new Error('Invalid email format');
  }
  return true;
};

GeneralSettingsSchema.methods.validateCoordinates = function () {
  const { latitude, longitude } = this.businessAddress;
  if (latitude < -90 || latitude > 90) {
    throw new Error('Latitude must be between -90 and 90 degrees');
  }
  if (longitude < -180 || longitude > 180) {
    throw new Error('Longitude must be between -180 and 180 degrees');
  }
  return true;
};

// Pre-save middleware for additional validation
GeneralSettingsSchema.pre('save', function (next) {
  try {
    // Validate contact number
    this.validateContactNumber();

    // Validate email
    this.validateEmail();

    // Validate coordinates if provided
    if (
      this.businessAddress &&
      (this.businessAddress.latitude !== 0 ||
        this.businessAddress.longitude !== 0)
    ) {
      this.validateCoordinates();
    }

    // Ensure at least one logo is provided if logos object exists
    if (this.logos && !this.logos.darkLogo?.url && !this.logos.lightLogo?.url) {
      // No logos provided - validation will handle this
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Pre-update middleware for validation
GeneralSettingsSchema.pre(
  ['findOneAndUpdate', 'updateOne', 'updateMany'],
  function (next) {
    const update = this.getUpdate();

    try {
      // Validate contact number if being updated
      if (update.contactNumber) {
        const phoneRegex = /^\+?[0-9\s\-()]{7,20}$/;
        if (!phoneRegex.test(update.contactNumber)) {
          throw new Error('Invalid contact number format');
        }
      }

      // Validate email if being updated
      if (update.inquiryEmail) {
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        if (!emailRegex.test(update.inquiryEmail)) {
          throw new Error('Invalid email format');
        }
      }

      // Validate coordinates if being updated
      if (update.businessAddress) {
        const { latitude, longitude } = update.businessAddress;
        if (latitude !== undefined && (latitude < -90 || latitude > 90)) {
          throw new Error('Latitude must be between -90 and 90 degrees');
        }
        if (longitude !== undefined && (longitude < -180 || longitude > 180)) {
          throw new Error('Longitude must be between -180 and 180 degrees');
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  },
);

// Add virtual for full address
GeneralSettingsSchema.virtual('fullAddress').get(function () {
  const addr = this.businessAddress;
  if (!addr) return '';

  const parts = [
    addr.shopNumber,
    addr.buildingName,
    addr.area,
    addr.landmark,
    addr.nearBy,
    addr.city,
    addr.state,
    addr.country,
    addr.postalCode,
  ].filter(Boolean);

  return parts.join(', ');
});

// Add virtual for validation status
GeneralSettingsSchema.virtual('isValid').get(function () {
  try {
    this.validateContactNumber();
    this.validateEmail();
    if (
      this.businessAddress &&
      (this.businessAddress.latitude !== 0 ||
        this.businessAddress.longitude !== 0)
    ) {
      this.validateCoordinates();
    }
    return true;
  } catch (error) {
    return false;
  }
});

// Add virtual for required fields completion
GeneralSettingsSchema.virtual('requiredFieldsComplete').get(function () {
  const requiredFields = [
    'appName',
    'contactNumber',
    'inquiryEmail',
    'siteDescription',
  ];
  return requiredFields.every(
    (field) => this[field] && this[field].trim().length > 0,
  );
});

// Ensure virtual fields are serialized
GeneralSettingsSchema.set('toJSON', { virtuals: true });
GeneralSettingsSchema.set('toObject', { virtuals: true });

const GeneralSettings = mongoose.model(
  'GeneralSettings',
  GeneralSettingsSchema,
);

export default GeneralSettings;
