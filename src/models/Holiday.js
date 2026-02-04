import mongoose from 'mongoose';

const holidaySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Holiday name is required'],
      trim: true,
      maxlength: [100, 'Holiday name cannot exceed 100 characters'],
    },
    startDate: {
      type: Date,
      required: [true, 'Holiday start date is required'],
    },
    endDate: {
      type: Date,
      required: [true, 'Holiday end date is required'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    isRecurring: {
      type: Boolean,
      default: false,
    },
    status: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Performance indexes
holidaySchema.index({ status: 1 });
holidaySchema.index({ isRecurring: 1 });
holidaySchema.index({ startDate: 1 });
holidaySchema.index({ endDate: 1 });
holidaySchema.index({ startDate: 1, endDate: 1 });

// Virtual for status display
holidaySchema.virtual('statusDisplay').get(function () {
  return this.status ? 'Active' : 'Inactive';
});

// Virtual for recurring status display
holidaySchema.virtual('recurringDisplay').get(function () {
  return this.isRecurring ? 'Yes' : 'No';
});

// Virtual to check if holiday is single-day
holidaySchema.virtual('isSingleDay').get(function () {
  if (!this.startDate || !this.endDate) return false;
  const start = new Date(this.startDate);
  const end = new Date(this.endDate);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return start.getTime() === end.getTime();
});

// Static method to find active holidays
holidaySchema.statics.findActive = function () {
  return this.find({ status: true }).sort({ startDate: 1 });
};

// Static method to find holidays with options
holidaySchema.statics.findWithOptions = function (options = {}) {
  const query = {};

  if (options.status !== undefined) {
    query.status = options.status;
  }

  if (options.isRecurring !== undefined) {
    query.isRecurring = options.isRecurring;
  }

  if (options.year) {
    const startOfYear = new Date(options.year, 0, 1);
    const endOfYear = new Date(options.year, 11, 31, 23, 59, 59, 999);
    // Find holidays that overlap with the year
    query.$or = [
      {
        startDate: { $lte: endOfYear },
        endDate: { $gte: startOfYear },
      },
    ];
  }

  return this.find(query).sort({ startDate: 1 });
};

// Static method to find holidays by date range
holidaySchema.statics.findByDateRange = function (startDate, endDate) {
  return this.find({
    status: true,
    $or: [
      {
        startDate: { $lte: endDate },
        endDate: { $gte: startDate },
      },
    ],
  }).sort({ startDate: 1 });
};

// Static method to find recurring holidays
holidaySchema.statics.findRecurring = function () {
  return this.find({ isRecurring: true, status: true }).sort({
    startDate: 1,
  });
};

// Pre-save middleware to validate date range
holidaySchema.pre('save', function (next) {
  // Validate that endDate is not before startDate
  if (this.startDate && this.endDate) {
    const start = new Date(this.startDate);
    const end = new Date(this.endDate);

    if (end < start) {
      return next(new Error('End date cannot be before start date'));
    }
  }

  // Warn if creating a holiday with past dates (unless recurring)
  if (this.isNew && this.startDate && this.endDate) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const start = new Date(this.startDate);
    start.setHours(0, 0, 0, 0);

    if (start < now && !this.isRecurring) {
      console.warn('Warning: Creating a holiday with a past start date');
    }
  }
  next();
});

export { holidaySchema as HolidaySchema };
