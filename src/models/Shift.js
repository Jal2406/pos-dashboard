import mongoose from 'mongoose';

const shiftSchema = new mongoose.Schema(
  {
    // Employee assigned to this shift
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: [true, 'Employee assignment is required'],
    },

    // Shift type template this assignment is based on
    shiftTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ShiftType',
      required: [true, 'Shift type reference is required'],
    },

    // Specific date for this shift assignment
    assignmentDate: {
      type: Date,
      required: [true, 'Shift date is required'],
      validate: {
        validator(value) {
          // Shift date cannot be in the past (except for today)
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          return value >= today;
        },
        message: 'Shift date cannot be in the past',
      },
    },

    endDate: {
      type: Date,
    },

    // Planned start time for this specific shift (can override shift type default)
    plannedStartTime: {
      type: String,
      match: [
        /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
        'Please provide a valid time format (HH:MM)',
      ],
    },

    // Planned end time for this specific shift (can override shift type default)
    plannedEndTime: {
      type: String,
      match: [
        /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
        'Please provide a valid time format (HH:MM)',
      ],
    },

    // Shift assignment status (only for planning purposes)
    status: {
      type: String,
      enum: {
        values: ['scheduled', 'cancelled'],
        message: 'Status must be one of: scheduled, cancelled',
      },
      default: 'scheduled',
    },

    // Notes for this shift assignment
    notes: {
      type: String,
      maxlength: [500, 'Notes cannot exceed 500 characters'],
      trim: true,
    },

    // Who assigned this shift
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Assigned by reference is required'],
    },

    // Business context
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: [true, 'Business reference is required'],
    },

    // Store context
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Store',
    },

    // Custom week off days that override the shift type's week off
    customWeekOff: [
      {
        type: String,
        enum: [
          'Sunday',
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
        ],
      },
    ],

    // Whether this is a recurring shift
    isRecurring: {
      type: Boolean,
      default: false,
    },

    // Recurring pattern if applicable
    recurringPattern: {
      frequency: {
        type: String,
        enum: ['daily', 'weekly', 'biweekly', 'monthly'],
      },
      daysOfWeek: [
        {
          type: Number,
          min: 0,
          max: 6, // 0 = Sunday, 6 = Saturday
        },
      ],
      endDate: Date,
      occurrences: Number, // Total number of occurrences
    },

    // Parent shift ID for recurring shifts
    parentShiftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shift',
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ===== ESSENTIAL INDEXES FOR OPTIMAL PERFORMANCE =====

// Primary business context filtering
shiftSchema.index({ businessId: 1 });

// Store-specific shifts
shiftSchema.index({ storeId: 1 });

// Employee shifts lookup
shiftSchema.index({ employeeId: 1 });

// Shift date range queries
shiftSchema.index({ assignmentDate: 1 });
shiftSchema.index({ businessId: 1, assignmentDate: 1 });
shiftSchema.index({ storeId: 1, assignmentDate: 1 });
shiftSchema.index({ employeeId: 1, assignmentDate: 1 });

// Status filtering
shiftSchema.index({ status: 1 });
shiftSchema.index({ businessId: 1, status: 1 });
shiftSchema.index({ storeId: 1, status: 1 });

// Shift type filtering
shiftSchema.index({ shiftTypeId: 1 });

// Assigned by tracking
shiftSchema.index({ assignedBy: 1 });

// Recurring shifts
shiftSchema.index({ isRecurring: 1 });
shiftSchema.index({ parentShiftId: 1 });

// Compound indexes for common queries
shiftSchema.index({ businessId: 1, storeId: 1, assignmentDate: 1 });
shiftSchema.index({ employeeId: 1, status: 1 });
shiftSchema.index({ businessId: 1, assignmentDate: 1, status: 1 });

// Custom week off filtering
shiftSchema.index({ customWeekOff: 1 });

// Timestamp indexes
shiftSchema.index({ createdAt: -1 });
shiftSchema.index({ updatedAt: -1 });

// ===== VIRTUAL FIELDS =====

// Virtual for planned shift duration in hours
shiftSchema.virtual('plannedDuration').get(function () {
  if (this.plannedStartTime && this.plannedEndTime) {
    const [startHour, startMin] = this.plannedStartTime.split(':').map(Number);
    const [endHour, endMin] = this.plannedEndTime.split(':').map(Number);

    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    let durationMinutes;
    if (endMinutes < startMinutes) {
      // Crosses midnight
      durationMinutes = 24 * 60 - startMinutes + endMinutes;
    } else {
      durationMinutes = endMinutes - startMinutes;
    }

    return Math.round((durationMinutes / 60) * 100) / 100;
  }
  return 0;
});

// Virtual for formatted shift date
shiftSchema.virtual('formattedDate').get(function () {
  return this.assignmentDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
});

// Virtual for shift status display
shiftSchema.virtual('statusDisplay').get(function () {
  const statusMap = {
    scheduled: 'Scheduled',
    cancelled: 'Cancelled',
  };
  return statusMap[this.status] || this.status;
});

// Virtual for custom week off count
shiftSchema.virtual('customWeekOffCount').get(function () {
  return this.customWeekOff ? this.customWeekOff.length : 0;
});

// Virtual to check if shift has custom week off
shiftSchema.virtual('hasCustomWeekOff').get(function () {
  return this.customWeekOff && this.customWeekOff.length > 0;
});

// ===== PRE-SAVE MIDDLEWARE =====

// Validate custom week off array for duplicates
shiftSchema.pre('save', async function (next) {
  try {
    // Validate custom week off for duplicates
    if (this.customWeekOff && Array.isArray(this.customWeekOff)) {
      const uniqueDays = new Set(this.customWeekOff);
      if (uniqueDays.size !== this.customWeekOff.length) {
        return next(new Error('Custom week off days must be unique'));
      }
    }
    next();
  } catch (error) {
    next(error);
  }
});

// Validate custom week off array for duplicates on update
shiftSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate();
  if (update.customWeekOff && Array.isArray(update.customWeekOff)) {
    const uniqueDays = new Set(update.customWeekOff);
    if (uniqueDays.size !== update.customWeekOff.length) {
      return next(new Error('Custom week off days must be unique'));
    }
  }
  next();
});

// ===== STATIC METHODS =====

// Find shifts by employee and date range
shiftSchema.statics.findByEmployeeAndDateRange = function (
  employeeId,
  startDate,
  endDate,
) {
  return this.find({
    employeeId,
    assignmentDate: {
      $gte: startDate,
      $lte: endDate,
    },
  })
    .populate('shiftTypeId', 'title shiftType startTime endTime')
    .populate('assignedBy', 'firstName lastName')
    .sort({ assignmentDate: 1, plannedStartTime: 1 });
};

// Find shifts by store and date
shiftSchema.statics.findByStoreAndDate = function (storeId, date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  return this.find({
    storeId,
    assignmentDate: {
      $gte: startOfDay,
      $lte: endOfDay,
    },
  })
    .populate('employeeId', 'user designation')
    .populate('shiftTypeId', 'title shiftType startTime endTime')
    .populate('assignedBy', 'firstName lastName')
    .sort({ plannedStartTime: 1 });
};

// Find scheduled shifts (for attendance tracking)
shiftSchema.statics.findScheduledShifts = function (
  businessId,
  storeId = null,
) {
  const filter = {
    businessId,
    status: 'scheduled',
  };

  if (storeId) {
    filter.storeId = storeId;
  }

  return this.find(filter)
    .populate('employeeId', 'user designation')
    .populate('shiftTypeId', 'title shiftType weekOff')
    .populate('assignedBy', 'firstName lastName');
};

// Find shifts applicable on a specific day considering custom week off
shiftSchema.statics.findApplicableOnDay = function (
  dayName,
  businessId,
  storeId = null,
) {
  const validDays = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];

  if (!validDays.includes(dayName)) {
    throw new Error(
      `Invalid day name: ${dayName}. Must be one of: ${validDays.join(', ')}`,
    );
  }

  const filter = {
    businessId,
    status: 'scheduled',
    $or: [
      // Shifts with custom week off that don't include this day
      {
        customWeekOff: { $exists: true, $ne: [] },
        customWeekOff: { $nin: [dayName] },
      },
      // Shifts without custom week off (will use shift type week off)
      {
        $or: [
          { customWeekOff: { $exists: false } },
          { customWeekOff: { $size: 0 } },
        ],
      },
    ],
  };

  if (storeId) {
    filter.storeId = storeId;
  }

  return this.find(filter)
    .populate('employeeId', 'user designation')
    .populate('shiftTypeId', 'title shiftType weekOff')
    .populate('assignedBy', 'firstName lastName');
};

// Find shifts with custom week off information
shiftSchema.statics.findWithCustomWeekOffInfo = function (
  businessId,
  storeId = null,
) {
  const filter = { businessId };

  if (storeId) {
    filter.storeId = storeId;
  }

  return this.find(filter)
    .populate('employeeId', 'user designation')
    .populate('shiftTypeId', 'title shiftType weekOff')
    .populate('assignedBy', 'firstName lastName');
};

// ===== INSTANCE METHODS =====

// Cancel shift assignment method
shiftSchema.methods.cancel = function (reason = '') {
  if (this.status === 'cancelled') {
    throw new Error('Shift assignment is already cancelled');
  }

  this.status = 'cancelled';
  if (reason) {
    this.notes = (this.notes || '') + `\nCancelled: ${reason}`;
  }

  return this.save();
};

// ===== CUSTOM WEEK OFF METHODS =====

/**
 * Check if a specific day is a custom week off day
 * @param {string} dayName - Day name (e.g., 'Monday', 'Tuesday')
 * @returns {boolean} - True if the day is a custom week off day
 */
shiftSchema.methods.isCustomWeekOffDay = function (dayName) {
  if (!this.customWeekOff || !Array.isArray(this.customWeekOff)) {
    return false;
  }
  return this.customWeekOff.includes(dayName);
};

/**
 * Get all custom week off days as an array
 * @returns {Array<string>} - Array of custom week off day names
 */
shiftSchema.methods.getCustomWeekOffDays = function () {
  return this.customWeekOff || [];
};

/**
 * Add a custom week off day
 * @param {string} dayName - Day name to add
 * @returns {boolean} - True if added successfully, false if already exists
 */
shiftSchema.methods.addCustomWeekOffDay = function (dayName) {
  if (!this.customWeekOff) {
    this.customWeekOff = [];
  }

  const validDays = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];
  if (!validDays.includes(dayName)) {
    throw new Error(
      `Invalid day name: ${dayName}. Must be one of: ${validDays.join(', ')}`,
    );
  }

  if (!this.customWeekOff.includes(dayName)) {
    this.customWeekOff.push(dayName);
    return true;
  }
  return false;
};

/**
 * Remove a custom week off day
 * @param {string} dayName - Day name to remove
 * @returns {boolean} - True if removed successfully, false if not found
 */
shiftSchema.methods.removeCustomWeekOffDay = function (dayName) {
  if (!this.customWeekOff || !Array.isArray(this.customWeekOff)) {
    return false;
  }

  const index = this.customWeekOff.indexOf(dayName);
  if (index > -1) {
    this.customWeekOff.splice(index, 1);
    return true;
  }
  return false;
};

/**
 * Get effective week off days (custom week off overrides shift type week off)
 * @param {Object} shiftType - The shift type object with weekOff field
 * @returns {Array<string>} - Array of effective week off day names
 */
shiftSchema.methods.getEffectiveWeekOffDays = function (shiftType) {
  // If custom week off is defined, use it; otherwise use shift type week off
  if (this.hasCustomWeekOff) {
    return this.getCustomWeekOffDays();
  }
  return shiftType?.weekOff || [];
};

/**
 * Check if shift is applicable on a specific day considering both custom and shift type week off
 * @param {string} dayName - Day name to check
 * @param {Object} shiftType - The shift type object with weekOff field
 * @returns {boolean} - True if shift is applicable (not a week off day)
 */
shiftSchema.methods.isApplicableOnDay = function (dayName, shiftType) {
  const effectiveWeekOff = this.getEffectiveWeekOffDays(shiftType);
  return !effectiveWeekOff.includes(dayName);
};

/**
 * Clear custom week off (revert to shift type week off)
 */
shiftSchema.methods.clearCustomWeekOff = function () {
  this.customWeekOff = [];
};

export { shiftSchema as ShiftSchema };
