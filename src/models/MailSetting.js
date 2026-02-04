import mongoose from 'mongoose';

const mailSettingSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
      validate: {
        validator(v) {
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
        },
        message: (props) => `${props.value} is not a valid email address!`,
      },
    },
    host: {
      type: String,
      required: [true, 'SMTP host is required'],
      trim: true,
    },
    port: {
      type: Number,
      default: 587,
      required: [true, 'SMTP port is required'],
      min: [1, 'Port must be greater than 0'],
      max: [65535, 'Port must be less than 65536'],
    },
    encryption: {
      type: String,
      enum: {
        values: ['ssl', 'tls', 'none'],
        message: 'Encryption must be one of: ssl, tls, none',
      },
      default: 'tls',
    },
    password: {
      type: String,
      required: [true, 'SMTP password is required'],
      minlength: [1, 'Password cannot be empty'],
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
mailSettingSchema.virtual('isComplete').get(function () {
  return !!(this.host && this.port && this.email && this.password);
});

// Pre-save middleware to delete existing settings and create new one
mailSettingSchema.pre('save', async function (next) {
  if (this.isNew) {
    // Delete all existing mail settings before creating new one
    await this.constructor.deleteMany({});
  }
  next();
});

// Pre-update middleware to reset verification when critical fields change
mailSettingSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate();
  const criticalFields = ['host', 'port', 'email', 'password', 'encryption'];

  const hasCriticalChanges = criticalFields.some((field) =>
    update.hasOwnProperty(field),
  );

  if (hasCriticalChanges) {
    update.isVerified = false;
    update.lastVerifiedAt = null;
  }

  next();
});

const MailSetting = mongoose.model('MailSetting', mailSettingSchema);
export default MailSetting;
