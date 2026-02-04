import mongoose from 'mongoose';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Minimal tenant mail setting schema – one document per tenant DB.
 */
const tenantMailSettingSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
      validate: {
        validator: (value) => emailRegex.test(value),
        message: (props) => `${props.value} is not a valid email address`,
      },
    },
    host: {
      type: String,
      required: [true, 'SMTP host is required'],
      trim: true,
    },
    port: {
      type: Number,
      required: [true, 'SMTP port is required'],
      min: [1, 'Port must be greater than 0'],
      max: [65535, 'Port must be less than 65536'],
    },
    encryption: {
      type: String,
      enum: ['ssl', 'tls', 'none'],
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
    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        delete ret.password;
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform(doc, ret) {
        delete ret.password;
        delete ret.__v;
        return ret;
      },
    },
  },
);

tenantMailSettingSchema.index({ email: 1 }, { unique: false });

tenantMailSettingSchema.pre('save', async function enforceSingleton(next) {
  if (this.isNew) {
    await this.constructor.deleteMany({});
  }
  next();
});

tenantMailSettingSchema.pre(
  'findOneAndUpdate',
  function resetVerification(next) {
    const update = this.getUpdate() || {};
    const criticalFields = ['email', 'host', 'port', 'password', 'encryption'];

    const changed = criticalFields.some((field) =>
      Object.prototype.hasOwnProperty.call(update, field),
    );

    if (changed) {
      update.isVerified = false;
      update.lastVerifiedAt = null;
    }

    next();
  },
);

tenantMailSettingSchema.methods.toSafeObject = function toSafeObject() {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

export const TenantMailSettingSchema = tenantMailSettingSchema;
