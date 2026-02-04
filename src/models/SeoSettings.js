import mongoose from 'mongoose';

const SeoSettingsSchema = new mongoose.Schema(
  {
    // SEO Basic Information
    seoSlug: {
      type: String,
      required: [true, 'SEO slug is required'],
      trim: true,
      unique: true,
      minlength: [2, 'SEO slug must be at least 2 characters'],
      maxlength: [100, 'SEO slug must not exceed 100 characters'],
      validate: {
        validator: function (v) {
          return /^[a-z0-9\-]+$/.test(v);
        },
        message:
          'SEO slug can only contain lowercase letters, numbers, and hyphens',
      },
    },
    metaTitle: {
      type: String,
      required: [true, 'Meta title is required'],
      trim: true,
      minlength: [10, 'Meta title must be at least 10 characters'],
      maxlength: [60, 'Meta title must not exceed 60 characters'],
      validate: {
        validator: function (v) {
          return v.trim().length >= 10 && v.trim().length <= 60;
        },
        message: 'Meta title must be between 10 and 60 characters',
      },
    },
    metaDescription: {
      type: String,
      required: [true, 'Meta description is required'],
      trim: true,
      minlength: [50, 'Meta description must be at least 50 characters'],
      maxlength: [160, 'Meta description must not exceed 160 characters'],
      validate: {
        validator: function (v) {
          return v.trim().length >= 50 && v.trim().length <= 160;
        },
        message: 'Meta description must be between 50 and 160 characters',
      },
    },
    metaKeywords: {
      type: [String],
      required: [true, 'Meta keywords are required'],
      set: function (v) {
        // Ensure it's an array and trim each element
        if (Array.isArray(v)) {
          const trimmed = v
            .map((keyword) => {
              if (typeof keyword === 'string') {
                return keyword.trim();
              }
              return String(keyword).trim();
            })
            .filter((keyword) => keyword.length > 0);
          return trimmed;
        }
        return v;
      },
      validate: {
        validator: function (v) {
          if (!v || !Array.isArray(v)) return false;
          return v.length >= 1 && v.length <= 10;
        },
        message: 'Meta keywords must contain 1-10 keywords',
      },
    },

    // SEO Image
    seoImage: {
      url: {
        type: String,
        trim: true,
        validate: {
          validator: function (v) {
            if (!v) return true; // Optional field
            return /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|svg)$/i.test(v);
          },
          message:
            'SEO image URL must be a valid image URL (jpg, jpeg, png, gif, webp, svg)',
        },
      },
      publicId: {
        type: String,
        trim: true,
        validate: {
          validator: function (v) {
            if (!v) return true; // Optional field
            // Allow letters, numbers, underscores, hyphens, forward slashes, and dots
            return /^[a-zA-Z0-9_\-/\.]+$/.test(v);
          },
          message:
            'Public ID can only contain letters, numbers, underscores, hyphens, forward slashes, and dots',
        },
      },
    },

    // Google Site Verification
    googleSiteVerification: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          if (!v) return true; // Optional field
          return /^[a-zA-Z0-9\-_]+$/.test(v);
        },
        message:
          'Google site verification code can only contain letters, numbers, hyphens, and underscores',
      },
    },

    // Canonical URL
    canonicalUrl: {
      type: String,
      required: [true, 'Canonical URL is required'],
      trim: true,
      validate: {
        validator: function (v) {
          return /^https?:\/\/.+/.test(v);
        },
        message:
          'Canonical URL must be a valid URL starting with http:// or https://',
      },
    },

    // Status and Settings
    isActive: {
      type: Boolean,
      default: true,
    },
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

// Ensure only one SEO settings document exists
SeoSettingsSchema.index({}, { unique: true });

// Custom validation methods
SeoSettingsSchema.methods.validateSeoSlug = function () {
  const slugRegex = /^[a-z0-9\-]+$/;
  if (!slugRegex.test(this.seoSlug)) {
    throw new Error('Invalid SEO slug format');
  }
  return true;
};

SeoSettingsSchema.methods.validateCanonicalUrl = function () {
  const urlRegex = /^https?:\/\/.+/;
  if (!urlRegex.test(this.canonicalUrl)) {
    throw new Error('Invalid canonical URL format');
  }
  return true;
};

SeoSettingsSchema.methods.validateMetaTitle = function () {
  if (this.metaTitle.length < 10 || this.metaTitle.length > 60) {
    throw new Error('Meta title must be between 10 and 60 characters');
  }
  return true;
};

SeoSettingsSchema.methods.validateMetaDescription = function () {
  if (this.metaDescription.length < 50 || this.metaDescription.length > 160) {
    throw new Error('Meta description must be between 50 and 160 characters');
  }
  return true;
};

// Pre-save middleware for additional validation
SeoSettingsSchema.pre('save', function (next) {
  try {
    // Validate SEO slug
    this.validateSeoSlug();

    // Validate canonical URL
    this.validateCanonicalUrl();

    // Validate meta title
    this.validateMetaTitle();

    // Validate meta description
    this.validateMetaDescription();

    next();
  } catch (error) {
    next(error);
  }
});

// Pre-update middleware for validation
SeoSettingsSchema.pre(
  ['findOneAndUpdate', 'updateOne', 'updateMany'],
  function (next) {
    const update = this.getUpdate();

    try {
      // Validate SEO slug if being updated
      if (update.seoSlug) {
        const slugRegex = /^[a-z0-9\-]+$/;
        if (!slugRegex.test(update.seoSlug)) {
          throw new Error('Invalid SEO slug format');
        }
      }

      // Validate canonical URL if being updated
      if (update.canonicalUrl) {
        const urlRegex = /^https?:\/\/.+/;
        if (!urlRegex.test(update.canonicalUrl)) {
          throw new Error('Invalid canonical URL format');
        }
      }

      // Validate meta title if being updated
      if (update.metaTitle) {
        if (update.metaTitle.length < 10 || update.metaTitle.length > 60) {
          throw new Error('Meta title must be between 10 and 60 characters');
        }
      }

      // Validate meta description if being updated
      if (update.metaDescription) {
        if (
          update.metaDescription.length < 50 ||
          update.metaDescription.length > 160
        ) {
          throw new Error(
            'Meta description must be between 50 and 160 characters',
          );
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  },
);

// Add virtual for SEO completeness
SeoSettingsSchema.virtual('seoCompleteness').get(function () {
  const requiredFields = [
    'seoSlug',
    'metaTitle',
    'metaDescription',
    'metaKeywords',
    'canonicalUrl',
  ];
  const completedFields = requiredFields.filter((field) => {
    if (field === 'metaKeywords') {
      return (
        this[field] && Array.isArray(this[field]) && this[field].length > 0
      );
    }
    return this[field] && this[field].trim().length > 0;
  });
  return Math.round((completedFields.length / requiredFields.length) * 100);
});

// Add virtual for validation status
SeoSettingsSchema.virtual('isValid').get(function () {
  try {
    this.validateSeoSlug();
    this.validateCanonicalUrl();
    this.validateMetaTitle();
    this.validateMetaDescription();
    return true;
  } catch (error) {
    return false;
  }
});

// Add virtual for required fields completion
SeoSettingsSchema.virtual('requiredFieldsComplete').get(function () {
  const requiredFields = [
    'seoSlug',
    'metaTitle',
    'metaDescription',
    'metaKeywords',
    'canonicalUrl',
  ];
  return requiredFields.every((field) => {
    if (field === 'metaKeywords') {
      return (
        this[field] && Array.isArray(this[field]) && this[field].length > 0
      );
    }
    return this[field] && this[field].trim().length > 0;
  });
});

// Ensure virtual fields are serialized
SeoSettingsSchema.set('toJSON', { virtuals: true });
SeoSettingsSchema.set('toObject', { virtuals: true });

const SeoSettings = mongoose.model('SeoSettings', SeoSettingsSchema);

export default SeoSettings;
