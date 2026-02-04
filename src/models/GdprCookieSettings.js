import mongoose from 'mongoose';

const GdprCookieSettingsSchema = new mongoose.Schema(
  {
    // Enable/Disable GDPR Cookie Notice
    enableGdprCookieNotice: {
      type: Boolean,
      default: false,
      required: [true, 'GDPR cookie notice status is required'],
    },

    // Custom Cookie Message
    cookieMessage: {
      type: String,
      default: 'We use cookies to enhance your experience.',
      trim: true,
      required: [true, 'Cookie message is required'],
      minlength: [10, 'Cookie message must be at least 10 characters'],
      maxlength: [500, 'Cookie message must not exceed 500 characters'],
      validate: {
        validator: function (v) {
          return v.trim().length >= 10;
        },
        message: 'Cookie message must be at least 10 characters long',
      },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Ensure only one GDPR cookie settings document exists
GdprCookieSettingsSchema.index({}, { unique: true });

// Custom validation methods
GdprCookieSettingsSchema.methods.validateCookieMessage = function () {
  const message = this.cookieMessage.trim();
  if (message.length < 10) {
    throw new Error('Cookie message must be at least 10 characters long');
  }
  if (message.length > 500) {
    throw new Error('Cookie message must not exceed 500 characters');
  }
  return true;
};

// Pre-save middleware for additional validation
GdprCookieSettingsSchema.pre('save', function (next) {
  try {
    // Validate cookie message
    this.validateCookieMessage();

    next();
  } catch (error) {
    next(error);
  }
});

// Pre-update middleware for validation
GdprCookieSettingsSchema.pre(
  ['findOneAndUpdate', 'updateOne', 'updateMany'],
  function (next) {
    const update = this.getUpdate();

    try {
      // Validate cookie message if being updated
      if (update.cookieMessage) {
        const message = update.cookieMessage.trim();
        if (message.length < 10) {
          throw new Error('Cookie message must be at least 10 characters long');
        }
        if (message.length > 500) {
          throw new Error('Cookie message must not exceed 500 characters');
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  },
);

// Add virtual for validation status
GdprCookieSettingsSchema.virtual('isValid').get(function () {
  try {
    this.validateCookieMessage();
    return true;
  } catch (error) {
    return false;
  }
});

// Add virtual for required fields completion
GdprCookieSettingsSchema.virtual('requiredFieldsComplete').get(function () {
  const requiredFields = ['enableGdprCookieNotice', 'cookieMessage'];
  return requiredFields.every(
    (field) => this[field] !== undefined && this[field] !== null,
  );
});

// Add virtual for banner configuration
GdprCookieSettingsSchema.virtual('bannerConfig').get(function () {
  return {
    enabled: this.enableGdprCookieNotice,
    message: this.cookieMessage,
  };
});

// Ensure virtual fields are serialized
GdprCookieSettingsSchema.set('toJSON', { virtuals: true });
GdprCookieSettingsSchema.set('toObject', { virtuals: true });

const GdprCookieSettings = mongoose.model(
  'GdprCookieSettings',
  GdprCookieSettingsSchema,
);

export default GdprCookieSettings;
