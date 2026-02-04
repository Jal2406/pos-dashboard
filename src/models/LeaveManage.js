import mongoose from 'mongoose';

const leaveManageSchema = new mongoose.Schema(
  {
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Store',
      required: [true, 'Store ID is required'],
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: [true, 'Employee ID is required'],
    },
    leaveTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LeaveType',
      required: [true, 'Leave Type ID is required'],
    },
    startDate: {
      type: Date,
      required: [true, 'Start date is required'],
    },
    endDate: {
      type: Date,
      required: [true, 'End date is required'],
    },
    isHalfDay: {
      type: Boolean,
      default: false,
    },
    reason: {
      type: String,
      required: [true, 'Reason for leave is required'],
      trim: true,
      minlength: [10, 'Reason must be at least 10 characters'],
      maxlength: [500, 'Reason cannot exceed 500 characters'],
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'cancelled'],
      default: 'pending',
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    rejectionReason: {
      type: String,
      trim: true,
      maxlength: [500, 'Rejection reason cannot exceed 500 characters'],
      default: null,
    },
    // Track who created this leave request
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Track who last updated this leave request
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    // Business/tenant isolation for multi-tenancy
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: [true, 'Business ID is required'],
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Custom validation for half-day leave constraint
leaveManageSchema.pre('validate', function (next) {
  if (this.isHalfDay) {
    // For half-day leave, start date and end date must be the same
    const startDate = new Date(this.startDate);
    const endDate = new Date(this.endDate);

    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);

    if (startDate.getTime() !== endDate.getTime()) {
      return next(
        new Error(
          'For half-day leave, start date and end date must be the same',
        ),
      );
    }
  } else {
    // For full-day leave, end date should be greater than or equal to start date
    if (this.endDate < this.startDate) {
      return next(new Error('End date cannot be before start date'));
    }
  }
  next();
});

// Note: Business rule validations are handled in the service layer
// to maintain proper tenant isolation and avoid circular dependencies

// Compound index to ensure unique leave requests per employee per date range
leaveManageSchema.index(
  { employeeId: 1, startDate: 1, endDate: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['pending', 'approved'] } },
  },
);

// Enterprise-grade performance indexes for large datasets
leaveManageSchema.index({ businessId: 1, storeId: 1, status: 1 }); // Multi-tenant store queries
leaveManageSchema.index({ businessId: 1, employeeId: 1, status: 1 }); // Employee queries
leaveManageSchema.index({ businessId: 1, leaveTypeId: 1 }); // Leave type queries
leaveManageSchema.index({ businessId: 1, startDate: 1, endDate: 1 }); // Date range queries
leaveManageSchema.index({ businessId: 1, createdBy: 1 }); // Creator queries
leaveManageSchema.index({ businessId: 1, approvedBy: 1 }); // Approver queries
leaveManageSchema.index({ businessId: 1, createdAt: -1 }); // Recent queries
leaveManageSchema.index({ businessId: 1, status: 1, createdAt: -1 }); // Status with recency
leaveManageSchema.index({
  businessId: 1,
  storeId: 1,
  status: 1,
  createdAt: -1,
}); // Store status queries
leaveManageSchema.index({
  businessId: 1,
  employeeId: 1,
  startDate: 1,
  endDate: 1,
}); // Overlap detection
leaveManageSchema.index({ businessId: 1, isHalfDay: 1 }); // Half-day queries
leaveManageSchema.index({ businessId: 1, approvedAt: -1 }); // Approval timeline

// Virtual for leave duration in days
leaveManageSchema.virtual('duration').get(function () {
  if (this.isHalfDay) {
    return 0.5;
  }

  const start = new Date(this.startDate);
  const end = new Date(this.endDate);
  const timeDiff = end.getTime() - start.getTime();
  const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1; // +1 to include both start and end dates

  return daysDiff;
});

// Virtual for leave status display
leaveManageSchema.virtual('statusDisplay').get(function () {
  const statusMap = {
    pending: 'Pending Approval',
    approved: 'Approved',
    rejected: 'Rejected',
    cancelled: 'Cancelled',
  };
  return statusMap[this.status] || this.status;
});

// Method to check if leave can be cancelled
leaveManageSchema.methods.canBeCancelled = function () {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    this.status === 'pending' ||
    (this.status === 'approved' && this.startDate > today)
  );
};

// Method to check if leave can be approved
leaveManageSchema.methods.canBeApproved = function () {
  return this.status === 'pending';
};

// Method to check if leave can be rejected
leaveManageSchema.methods.canBeRejected = function () {
  return this.status === 'pending';
};

// Static method to find leaves by store with full population
leaveManageSchema.statics.findByStore = function (storeId, options = {}) {
  const query = { storeId };

  if (options.status) {
    query.status = options.status;
  }

  if (options.startDate && options.endDate) {
    query.startDate = { $gte: options.startDate };
    query.endDate = { $lte: options.endDate };
  }

  return (
    this.find(query)
      .populate({
        path: 'employeeId',
        select: 'user designation joinDate isActive',
        populate: {
          path: 'user',
          select: 'name email phone profilePicture',
          // Ensure global User model is used (User is not tenant-specific)
          model: mongoose.model('User'),
        },
      })
      .populate('leaveTypeId', 'name type paidCount status')
      // Populate createdBy/approvedBy using global User model
      .populate({
        path: 'createdBy',
        select: 'name email',
        model: mongoose.model('User'),
      })
      .populate({
        path: 'approvedBy',
        select: 'name email',
        model: mongoose.model('User'),
      })
      .sort({ createdAt: -1 })
  );
};

// Static method to find leaves by employee with full population
leaveManageSchema.statics.findByEmployee = function (employeeId, options = {}) {
  const query = { employeeId };

  if (options.status) {
    query.status = options.status;
  }

  if (options.startDate && options.endDate) {
    query.startDate = { $gte: options.startDate };
    query.endDate = { $lte: options.endDate };
  }

  return this.find(query)
    .populate('storeId', 'name address phone')
    .populate('leaveTypeId', 'name type paidCount status')
    .populate({
      path: 'createdBy',
      select: 'name email',
      model: mongoose.model('User'),
    })
    .populate({
      path: 'approvedBy',
      select: 'name email',
      model: mongoose.model('User'),
    })
    .sort({ createdAt: -1 });
};

// Static method to find leave by ID with full population
leaveManageSchema.statics.findByIdWithPopulation = function (leaveId) {
  return this.findById(leaveId)
    .populate('storeId', 'name address phone')
    .populate({
      path: 'employeeId',
      select: 'user designation joinDate isActive',
      populate: {
        path: 'user',
        select: 'name email phone profilePicture',
        model: mongoose.model('User'),
      },
    })
    .populate('leaveTypeId', 'name type paidCount status description')
    .populate({
      path: 'createdBy',
      select: 'name email',
      model: mongoose.model('User'),
    })
    .populate({
      path: 'approvedBy',
      select: 'name email',
      model: mongoose.model('User'),
    });
};

// Static method to get leave statistics
leaveManageSchema.statics.getLeaveStats = async function (
  storeId,
  startDate,
  endDate,
) {
  const pipeline = [
    {
      $match: {
        storeId: new mongoose.Types.ObjectId(storeId),
        startDate: { $gte: startDate },
        endDate: { $lte: endDate },
      },
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalDays: {
          $sum: {
            $cond: [
              { $eq: ['$isHalfDay', true] },
              0.5,
              {
                $add: [
                  {
                    $divide: [
                      { $subtract: ['$endDate', '$startDate'] },
                      1000 * 60 * 60 * 24,
                    ],
                  },
                  1,
                ],
              },
            ],
          },
        },
      },
    },
  ];

  return this.aggregate(pipeline);
};

export { leaveManageSchema as LeaveManageSchema };
