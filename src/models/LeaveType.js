import mongoose from 'mongoose';

const leaveTypeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Leave type name is required'],
      
      trim: true,
      maxlength: [100, 'Leave type name cannot exceed 100 characters'],
      unique: true,
    },
    description: {
      type: String,
      trim: true,
      required: [true, 'Description is required'],
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    type: {
      type: String,
      enum: {
        values: ['Paid', 'Unpaid'],
        message: 'Leave type must be either Paid or Unpaid',
      },
      required: [true, 'Leave type (Paid/Unpaid) is required'],
    },
    paidCount: {
      type: Number,
      min: [0, 'Paid count cannot be negative'],
      validate: {
        validator: function (value) {
          // Only require paidCount if type is 'Paid'
          if (this.type === 'Paid') {
            return value !== undefined && value !== null;
          }
          return true;
        },
        message: 'Paid count is required when leave type is Paid',
      },
    },
    status: {
      type: Boolean,
      default: true,
    },
    // Business/tenant isolation
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: [true, 'Business ID is required'],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Compound index for business isolation and uniqueness
leaveTypeSchema.index({ businessId: 1, name: 1 }, { unique: true });

// Performance indexes
leaveTypeSchema.index({ businessId: 1, status: 1 });
leaveTypeSchema.index({ businessId: 1, type: 1 });

// Virtual for status display
leaveTypeSchema.virtual('statusDisplay').get(function () {
  return this.status ? 'Active' : 'Inactive';
});

// Static method to find active leave types by business
leaveTypeSchema.statics.findActiveByBusiness = function (businessId) {
  return this.find({ businessId, status: true }).sort({ name: 1 });
};

// Static method to find leave types by business
leaveTypeSchema.statics.findByBusiness = function (businessId, options = {}) {
  const query = { businessId };

  if (options.status !== undefined) {
    query.status = options.status;
  }

  if (options.type) {
    query.type = options.type;
  }

  return this.find(query).sort({ name: 1 });
};

export { leaveTypeSchema as LeaveTypeSchema };
