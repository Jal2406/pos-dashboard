import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    provider: {
      type: String,
      enum: ['local', 'google'],
      default: 'local',
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      validate: {
        validator(value) {
          return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value);
        },
        message: 'Invalid email address',
      },
    },
    password: {
      type: String,
      required() {
        return this.provider === 'local';
      },
      minlength: 8,
      select: false,
    },
    // gender: {
    //   type: String,
    //   enum: ["Male", "Female", "Other"],
    //   required: true,
    // },
    phone: {
      type: String,
      trim: true,
      required() {
        return this.provider === 'local';
      },
    },
    roleId: {
      type: Number,
      ref: 'Role',
      required: true,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: false,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    profilePicture: {
      type: String,
      trim: true,
      default: null,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Login + unique email
userSchema.index({ email: 1 }, { unique: true });

// Fast list filtering (admin tables)
userSchema.index({ isActive: 1, roleId: 1 });

// Activity / dashboard views (last active users)
userSchema.index({ isActive: 1, lastLoginAt: -1 });

// Pagination friendly sort
userSchema.index({ createdAt: -1 });

// Optional (only if you search by phone frequently)
userSchema.index({ phone: 1 }, { sparse: true });


// If roleId is 1 (superadmin), set status to 'Active'
userSchema.pre('save', function (next) {
  if (this.roleId == 1) {
    this.isActive = true;
  }
  next();
});

// Virtual for getting role name
userSchema.virtual('role').get(function () {
  return this.roleId ? this.roleId.name : null;
});

// Virtual to check if user has admin privileges
userSchema.virtual('isAdmin').get(function () {
  if (!this.roleId) {
    return false;
  }

  // Handle both populated and non-populated roleId
  if (
    typeof this.roleId === 'object' &&
    this.roleId !== null &&
    this.roleId.name
  ) {
    // Populated roleId object
    return this.roleId.name === 'admin' || this.roleId.name === 'superadmin';
  } else if (typeof this.roleId === 'number') {
    // Non-populated roleId number (1=superadmin, 2=admin)
    return this.roleId === 1 || this.roleId === 2;
  } else if (this.roleId && this.roleId._id) {
    // Handle case where roleId is a populated document with _id
    return this.roleId._id === 1 || this.roleId._id === 2;
  }

  return false;
});

// Ensure virtuals are included and password is removed when converting to JSON/Object
userSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    delete ret.password;
    return ret;
  },
});
userSchema.set('toObject', {
  virtuals: true,
  transform(doc, ret) {
    delete ret.password;
    return ret;
  },
});

userSchema.virtual('businesses', {
  ref: 'Business',
  localField: '_id',
  foreignField: 'owner',
});

const User = mongoose.model('User', userSchema);
export default User;
