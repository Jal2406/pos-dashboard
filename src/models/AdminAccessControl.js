import mongoose from 'mongoose';

/**
 * AdminAccessControl
 *
 * New, tab-centric schema for controlling what each role can do on
 * high-level UI tabs (sidebar items such as Products, Staff Management, etc).
 *
 * - One document per role per tenant (tenant isolation is handled by
 *   the tenant DB manager, so we do not store businessId here).
 * - Each document contains an array of tabs.
 * - Each tab has a stable `id` (used by frontend + backend) and optional
 *   display label, plus simple CRUD booleans.
 *
 * Example document:
 * {
 *   role: 'manager',
 *   tabs: [
 *     {
 *       id: 'inventory.products',
 *       label: 'Products',
 *       permissions: { create: true, read: true, update: true, delete: false }
 *     },
 *     {
 *       id: 'hrm.staff',
 *       label: 'Staff Management',
 *       permissions: { create: false, read: true, update: false, delete: false }
 *     }
 *   ]
 * }
 */
const TabPermissionSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: [true, 'Tab ID is required'],
      trim: true,
      lowercase: true,
    },
    label: {
      type: String,
      trim: true,
    },
    permissions: {
      create: {
        type: Boolean,
        default: false,
      },
      read: {
        type: Boolean,
        default: false,
      },
      update: {
        type: Boolean,
        default: false,
      },
      delete: {
        type: Boolean,
        default: false,
      },
    },
  },
  {
    _id: false,
  },
);

const AdminAccessControlSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      required: [true, 'Role name is required'],
      trim: true,
      lowercase: true,
      enum: {
        values: ['superadmin', 'admin', 'manager', 'cashier'],
        message:
          'Role name must be one of: superadmin, admin, manager, cashier',
      },
    },
    tabs: {
      type: [TabPermissionSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// One document per role per tenant
AdminAccessControlSchema.index({ role: 1 }, { unique: true });
// Fast lookup by tab id inside a role document
AdminAccessControlSchema.index({ 'tabs.id': 1 });

// Ensure no duplicate tab IDs within a single document
AdminAccessControlSchema.pre('save', function validateUniqueTabs(next) {
  try {
    if (!Array.isArray(this.tabs)) {
      this.tabs = [];
      return next();
    }

    const ids = this.tabs.map((t) => t.id);
    const unique = new Set(ids);

    if (ids.length !== unique.size) {
      return next(new Error('Duplicate tab IDs are not allowed for a role'));
    }

    next();
  } catch (error) {
    next(error);
  }
});

const AdminAccessControl = mongoose.model(
  'AdminAccessControl',
  AdminAccessControlSchema,
);

// Export both schema and model for tenant-aware usage
export { AdminAccessControlSchema };
export default AdminAccessControl;