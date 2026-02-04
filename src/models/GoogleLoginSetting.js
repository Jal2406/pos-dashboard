import mongoose from 'mongoose';

const googleLoginSettingSchema = new mongoose.Schema(
  {
    clientId: {
      type: String,
      required: [true, 'Google OAuth client ID is required'],
      trim: true,
      minlength: [1, 'Client ID cannot be empty'],
    },
    clientSecret: {
      type: String,
      required: [true, 'Google OAuth client secret is required'],
      trim: true,
      minlength: [1, 'Client secret cannot be empty'],
    },
    redirectUri: {
      type: String,
      required: [true, 'Redirect URI is required'],
      trim: true,
      validate: {
        validator(v) {
          return /^https?:\/\/.+/.test(v);
        },
        message: (props) => `${props.value} is not a valid redirect URI!`,
      },
    },
    isEnabled: {
      type: Boolean,
      default: false,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    lastVerifiedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Virtual for checking if settings are complete
googleLoginSettingSchema.virtual('isComplete').get(function () {
  return !!(this.clientId && this.clientSecret && this.redirectUri);
});

// Pre-save middleware to delete existing settings and create new one
googleLoginSettingSchema.pre('save', async function (next) {
  if (this.isNew) {
    // Delete all existing Google login settings before creating new one
    await this.constructor.deleteMany({});
  }
  next();
});

// Pre-update middleware to reset verification when critical fields change
googleLoginSettingSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate();
  const criticalFields = ['clientId', 'clientSecret', 'redirectUri'];

  const hasCriticalChanges = criticalFields.some((field) =>
    update.hasOwnProperty(field),
  );

  if (hasCriticalChanges) {
    update.isVerified = false;
    update.lastVerifiedAt = null;
  }

  next();
});

// Static method to initialize default settings
googleLoginSettingSchema.statics.initializeDefaults = async function () {
  const existing = await this.findOne();
  if (!existing) {
    const defaultSettings = {
      clientId: 'your-google-client-id.apps.googleusercontent.com',
      clientSecret: 'your-google-client-secret',
      redirectUri: 'http://localhost:3000/auth/google/callback',
      isEnabled: false,
      isVerified: false,
    };
    return await this.create(defaultSettings);
  }
  return existing;
};

const GoogleLoginSetting = mongoose.model(
  'GoogleLoginSetting',
  googleLoginSettingSchema,
);

export default GoogleLoginSetting;
