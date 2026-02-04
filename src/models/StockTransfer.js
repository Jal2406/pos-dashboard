import mongoose from 'mongoose';

const stockTransferSchema = new mongoose.Schema(
  {
    // Business/tenant isolation
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: [true, 'Business ID is required'],
      index: true,
    },

    fromStoreId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Store',
      required: [true, 'Source store is required'],
      index: true,
    },

    toStoreId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Store',
      required: [true, 'Destination store is required'],
      index: true,
    },

    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProductCategory',
      required: [true, 'Category ID is required'],
      index: true,
    },

    subCategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SubCategory',
      required: [true, 'Sub Category ID is required'],
      index: true,
    },

    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product ID is required'],
      index: true,
    },

    SKU: {
      type: String,
      required: [true, 'SKU is required'],
      trim: true,
      uppercase: true,
      index: true,
    },

    quantity: {
      type: Number,
      required: [true, 'Transfer quantity is required'],
      min: [1, 'Transfer quantity must be at least 1'],
    },

    reason: {
      type: String,
      required: [true, 'Transfer reason is required'],
      trim: true,
      maxlength: [500, 'Reason cannot exceed 500 characters'],
    },

    // Status and workflow
    status: {
      type: String,
      enum: ['pending', 'approved', 'completed', 'cancelled'],
      default: 'pending',
      index: true,
    },

    // Approval workflow
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Requested by is required'],
    },

    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    approvedAt: {
      type: Date,
    },

    // Transfer execution (removed transferredBy and transferredAt)

    receivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    receivedAt: {
      type: Date,
    },

    // Additional details
    notes: {
      type: String,
      trim: true,
      maxlength: [1000, 'Notes cannot exceed 1000 characters'],
    },

    rejectionReason: {
      type: String,
      trim: true,
      maxlength: [500, 'Rejection reason cannot exceed 500 characters'],
    },

    // Transfer dates
    requestedDate: {
      type: Date,
      default: Date.now,
    },

    expectedTransferDate: {
      type: Date,
    },

    actualTransferDate: {
      type: Date,
    },
  },
  { timestamps: true },
);

// Compound indexes for performance optimization
stockTransferSchema.index({ businessId: 1, status: 1 }); // Business status queries
stockTransferSchema.index({ businessId: 1, fromStoreId: 1, status: 1 }); // Outgoing transfers
stockTransferSchema.index({ businessId: 1, toStoreId: 1, status: 1 }); // Incoming transfers
stockTransferSchema.index({ businessId: 1, productId: 1 }); // Product transfers
stockTransferSchema.index({ businessId: 1, requestedBy: 1 }); // User requests
stockTransferSchema.index({ businessId: 1, approvedBy: 1 }); // User approvals
stockTransferSchema.index({ businessId: 1, requestedDate: -1 }); // Recent requests
stockTransferSchema.index({ businessId: 1, status: 1, requestedDate: -1 }); // Status with date

// Virtual for transfer status description
stockTransferSchema.virtual('statusDescription').get(function () {
  const statusMap = {
    pending: 'Awaiting Approval',
    approved: 'Approved - Ready for Transfer',
    completed: 'Transfer Completed',
    cancelled: 'Transfer Cancelled',
  };
  return statusMap[this.status] || this.status;
});

// Virtual for business name
stockTransferSchema.virtual('businessName', {
  ref: 'Business',
  localField: 'businessId',
  foreignField: '_id',
  justOne: true,
  options: { select: 'businessName' },
});

// Virtual for source store name
stockTransferSchema.virtual('fromStoreName', {
  ref: 'Store',
  localField: 'fromStoreId',
  foreignField: '_id',
  justOne: true,
  options: { select: 'name' },
});

// Virtual for destination store name
stockTransferSchema.virtual('toStoreName', {
  ref: 'Store',
  localField: 'toStoreId',
  foreignField: '_id',
  justOne: true,
  options: { select: 'name' },
});

// Virtual for product name
stockTransferSchema.virtual('productName', {
  ref: 'Product',
  localField: 'productId',
  foreignField: '_id',
  justOne: true,
  options: { select: 'productName' },
});

// Virtual for requester name
stockTransferSchema.virtual('requesterName', {
  ref: 'User',
  localField: 'requestedBy',
  foreignField: '_id',
  justOne: true,
  options: { select: 'firstName lastName' },
});

// Pre-save middleware to generate transfer number and validate
stockTransferSchema.pre('save', async function (next) {
  try {
    // Validate that fromStoreId and toStoreId are different
    if (this.fromStoreId.toString() === this.toStoreId.toString()) {
      return next(
        new Error('Source and destination stores cannot be the same'),
      );
    }

    // Validate business existence
    if (this.businessId) {
      const Business = mongoose.model('Business');
      const business = await Business.findById(this.businessId).lean();
      if (!business) {
        return next(new Error('Business does not exist'));
      }
    }

    // Set approval timestamp when status changes to approved
    if (
      this.isModified('status') &&
      this.status === 'approved' &&
      !this.approvedAt
    ) {
      this.approvedAt = new Date();
    }

    // Set completion timestamp when status changes to completed
    if (
      this.isModified('status') &&
      this.status === 'completed' &&
      !this.actualTransferDate
    ) {
      this.actualTransferDate = new Date();
      this.receivedAt = new Date();
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Static method to find transfers by business
stockTransferSchema.statics.findByBusiness = function (
  businessId,
  options = {},
) {
  const query = { businessId };

  if (options.status) {
    query.status = options.status;
  }

  if (options.fromStoreId) {
    query.fromStoreId = options.fromStoreId;
  }

  if (options.toStoreId) {
    query.toStoreId = options.toStoreId;
  }

  if (options.productId) {
    query.productId = options.productId;
  }

  if (options.requestedBy) {
    query.requestedBy = options.requestedBy;
  }

  return this.find(query)
    .populate(
      'fromStoreId toStoreId productId categoryId subCategoryId',
    )
    .sort({ requestedDate: -1 });
};

// Static method to find pending transfers
stockTransferSchema.statics.findPending = function (
  businessId,
  storeId = null,
) {
  const query = { businessId, status: 'pending' };

  if (storeId) {
    query.$or = [{ fromStoreId: storeId }, { toStoreId: storeId }];
  }

  return this.find(query)
    .populate(
      'fromStoreId toStoreId productId categoryId subCategoryId',
    )
    .sort({ requestedDate: -1 });
};

// Static method to find transfers requiring approval
stockTransferSchema.statics.findRequiringApproval = function (
  businessId,
  storeId = null,
) {
  const query = { businessId, status: 'pending' };

  if (storeId) {
    query.$or = [{ fromStoreId: storeId }, { toStoreId: storeId }];
  }

  return this.find(query)
    .populate(
      'fromStoreId toStoreId productId categoryId subCategoryId',
    )
    .sort({ requestedDate: -1 });
};

export { stockTransferSchema as StockTransferSchema };
