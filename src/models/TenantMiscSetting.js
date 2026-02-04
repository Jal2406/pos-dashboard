import mongoose from 'mongoose';

/**
 * Tenant Miscellaneous Settings Schema
 * Manages tenant-specific settings for timezone, date format, and time format.
 * This is a SINGLETON collection per tenant - only one document should exist per tenant DB.
 */
const tenantMiscSettingSchema = new mongoose.Schema(
  {
    timeZone: {
      type: String,
      required: [true, 'Timezone is required'],
      trim: true,
      default: 'UTC',
    },
    darkMode:{
      type: Boolean,
      default: false,
    },
    UTC: {
      type: String,
      required: [true, 'UTC offset is required'],
      trim: true,
      default: '+00:00',
      validate: {
        validator: function (v) {
          // Validates format like +05:30, -08:00, +00:00, etc.
          return /^[+-]\d{2}:\d{2}$/.test(v);
        },
        message: (props) =>
          `${props.value} is not a valid UTC offset format. Use format like +05:30 or -08:00`,
      },
    },
    dateFormat: {
      type: String,
      required: [true, 'Date format is required'],
      enum: {
        values: [
          'DD-MM-YYYY',
          'MM-DD-YYYY',
          'YYYY-MM-DD',
          'DD/MM/YYYY',
          'MM/DD/YYYY',
          'YYYY/MM/DD',
          'DD.MM.YYYY',
          'MM.DD.YYYY',
          'YYYY.MM.DD',
        ],
        message: '{VALUE} is not a valid date format',
      },
      default: 'DD-MM-YYYY',
      trim: true,
    },
    timeFormat: {
      type: String,
      required: [true, 'Time format is required'],
      enum: {
        values: ['12', '24'],
        message:
          '{VALUE} is not a valid time format. Use "12" for 12-hour or "24" for 24-hour format',
      },
      default: '24',
      trim: true,
    },
    dataTableRow:{
      type: Number,
      default: 10,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'tenantmiscsettings',
    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform(doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  },
);

// Index for singleton pattern enforcement
tenantMiscSettingSchema.index({}, { unique: true });

// Pre-save middleware for singleton enforcement
tenantMiscSettingSchema.pre('save', async function enforceSingleton(next) {
  if (this.isNew) {
    // Delete any existing documents to maintain singleton
    await this.constructor.deleteMany({});
  }
  next();
});

// Static method to get or create default settings
tenantMiscSettingSchema.statics.getOrCreateDefault = async function (
  userContext = {},
) {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({
      timeZone: 'UTC',
      UTC: '+00:00',
      dateFormat: 'DD-MM-YYYY',
      timeFormat: '24',
      createdBy: userContext?.userId || null,
    });
  }
  return settings;
};

// Static method to update settings with validation
tenantMiscSettingSchema.statics.updateSettings = async function (
  updates,
  userContext = {},
) {
  const settings = await this.getOrCreateDefault(userContext);

  const allowedUpdates = ['timeZone', 'UTC', 'dateFormat', 'timeFormat'];
  const updateKeys = Object.keys(updates);
  const isValidOperation = updateKeys.every((key) =>
    allowedUpdates.includes(key),
  );

  if (!isValidOperation) {
    throw new Error(
      'Invalid updates. Only timeZone, UTC, dateFormat, and timeFormat can be updated',
    );
  }

  Object.assign(settings, updates);
  settings.updatedBy = userContext?.userId || null;
  await settings.save();
  return settings;
};

// Instance method for safe JSON serialization
tenantMiscSettingSchema.methods.toSafeObject = function () {
  return this.toObject();
};

export const TenantMiscSettingSchema = tenantMiscSettingSchema;
