import mongoose from 'mongoose';
import { User } from './index.js';

export const employeeSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User is required'],
      validate: {
        async validator(userId) {
          if (!mongoose.isValidObjectId(userId)) {
            return false;
          }
          const userExists = await User.findById(userId).populate('roleId');
          return !!userExists;
        },
        message: 'User does not exist',
      },
    },
    store: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Store',
      required: false,
    },
    designation: {
      type: String,
      required: [true, 'Designation is required'],
      trim: true,
      maxlength: [100, 'Designation cannot exceed 100 characters'],
      enum: {
        values: [
          'manager',
          'cashier',
          'salesperson',
          'inventory_manager',
          'accountant',
          'other',
        ],
        message:
          'Designation must be one of: manager, cashier, salesperson, inventory_manager, accountant, other',
      },
    },
    joinDate: {
      type: Date,
      required: [true, 'Join date is required'],
    },
    salary: {
      type: Number,
      required: false,
      min: [0, 'Salary cannot be negative'],
      validate: {
        validator: function (value) {
          // Allow null/undefined, but if provided, must be >= 0
          return value === null || value === undefined || value >= 0;
        },
        message: 'Salary must be a non-negative number',
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Track who created this employee record
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Track who last updated this employee record
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Compound index to ensure an employee is unique per store (only when store is present)
// For unassigned employees (store: null), we allow multiple records per user
employeeSchema.index(
  { user: 1, store: 1 },
  {
    unique: true,
    partialFilterExpression: { store: { $ne: null } },
  },
);

// Performance indexes for common lookups
employeeSchema.index({ store: 1 });
employeeSchema.index({ user: 1 });
employeeSchema.index({ createdBy: 1 });
employeeSchema.index({ updatedBy: 1 });

// Pre-save middleware to validate user, store existence and business rules
employeeSchema.pre('save', async function (next) {
  try {
    // Check if user exists and is valid
    const user = await User.findById(this.user).populate('roleId').lean();
    if (!user) {
      return next(new Error('User does not exist'));
    }

    // Check if store exists and is valid (only if store is provided)
    if (this.store) {
      // Use the tenant-bound Store model from the same connection as Employee
      const StoreModel = this.model('Store');
      const store = await StoreModel.findById(this.store).lean();
      if (!store) {
        return next(new Error('Store does not exist'));
      }
    }

    // Business Rule 1: Only managers and admins can be assigned as managers
    if (this.designation === 'manager') {
      const userRole = user.roleId?.name;
      if (userRole !== 'admin' && userRole !== 'manager') {
        return next(
          new Error(
            'Only admin users or existing managers can be assigned as store managers',
          ),
        );
      }
    }

    // Note: Multi-store support enabled. We rely on the compound unique index
    // { user, store } to prevent duplicates for the same store, but allow the
    // same user to be assigned to multiple stores.

    // Business Rule 3: Validate that the person creating/updating has permission
    if (
      this.isNew ||
      this.isModified('store') ||
      this.isModified('designation')
    ) {
      const creator = await User.findById(this.createdBy || this.updatedBy)
        .populate('roleId')
        .lean();
      if (!creator) {
        return next(new Error('Invalid creator/updater information'));
      }

      const creatorRole = creator.roleId?.name;
      if (creatorRole !== 'admin' && creatorRole !== 'manager') {
        return next(
          new Error(
            'Only admins and managers can create or modify employee records',
          ),
        );
      }

      // If creator is a manager, they can only manage their own store (only if store is provided)
      if (creatorRole === 'manager' && this.store) {
        // Use the tenant-bound Employee model from the same connection
        const EmployeeModel = this.model('Employee');
        const managerEmployee = await EmployeeModel.findOne({
          user: creator._id,
          store: this.store,
          designation: 'manager',
          isActive: true,
        }).lean();

        if (!managerEmployee) {
          return next(
            new Error(
              'Managers can only manage employees in stores where they are assigned as managers',
            ),
          );
        }
      }
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Virtual for employee's full name from user model
employeeSchema.virtual('fullName').get(function () {
  // Fall back to user.name if firstName/lastName not present
  if (!this.user) {
    return '';
  }
  if (this.user.firstName || this.user.lastName) {
    return `${this.user.firstName || ''} ${this.user.lastName || ''}`.trim();
  }
  return this.user.name || '';
});

// Method to check if employee has specific permission
employeeSchema.methods.hasPermission = function (permission) {
  return this.permissions && this.permissions[permission] === true;
};

// Static method to find active employees by store
employeeSchema.statics.findActiveByStore = function (storeId) {
  return this.find({ store: storeId, isActive: true })
    .populate('user', 'firstName lastName email phone profilePicture')
    .sort({ joinDate: -1 });
};

// Static method to find managers by store
employeeSchema.statics.findManagersByStore = function (storeId) {
  return this.find({
    store: storeId,
    designation: 'manager',
    isActive: true,
  }).populate('user', 'firstName lastName email phone profilePicture');
};

// Static method to check if store has a manager
employeeSchema.statics.hasStoreManager = async function (storeId) {
  const manager = await this.findOne({
    store: storeId,
    designation: 'manager',
    isActive: true,
  });
  return !!manager;
};

