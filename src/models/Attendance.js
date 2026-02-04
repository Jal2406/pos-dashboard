import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema(
  {
    // Employee reference
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: [true, 'Employee reference is required'],
    },

    // Reference to the shift assignment
    shiftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shift',
      required: [true, 'Shift reference is required'],
    },

    // Date of attendance
    attendanceDate: {
      type: Date,
      required: [true, 'Attendance date is required'],
    },

    // Actual clock-in time
    clockInTime: {
      type: Date,
      default: null,
    },

    // Actual clock-out time
    clockOutTime: {
      type: Date,
      default: null,
    },

    // Clock-in status
    clockInStatus: {
      type: String,
      enum: ['on_time', 'late'],
      default: null,
    },

    // Clock-out status
    clockOutStatus: {
      type: String,
      enum: ['completed', 'early_out'],
      default: null,
    },

    // Overall attendance status
    status: {
      type: String,
      enum: ['present', 'absent', 'leave', 'no_show'],
      required: [true, 'Attendance status is required'],
      default: 'absent',
    },

    // Breaks taken during the shift
    breaks: [
      {
        breakStart: {
          type: Date,
          required: true,
        },
        breakEnd: {
          type: Date,
          required: true,
        },
        breakType: {
          type: String,
          enum: ['lunch', 'short', 'other'],
          default: 'lunch',
        },
        duration: {
          type: Number,
          required: true,
          min: [0, 'Break duration cannot be negative'],
        },
        notes: {
          type: String,
          maxlength: [200, 'Break notes cannot exceed 200 characters'],
        },
      },
    ],

    // Total break time in minutes
    totalBreakTime: {
      type: Number,
      default: 0,
      min: [0, 'Total break time cannot be negative'],
    },

    // Total working hours (excluding breaks)
    totalHours: {
      type: Number,
      default: 0,
      min: [0, 'Total hours cannot be negative'],
    },

    // Overtime hours if applicable
    overtimeHours: {
      type: Number,
      default: 0,
      min: [0, 'Overtime hours cannot be negative'],
    },

    // Regular hours (before overtime)
    regularHours: {
      type: Number,
      default: 0,
      min: [0, 'Regular hours cannot be negative'],
    },

    // Notes for this attendance record
    notes: {
      type: String,
      maxlength: [500, 'Notes cannot exceed 500 characters'],
      trim: true,
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
      required: [true, 'Store reference is required'],
    },

    // Who created/updated this attendance record
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Recorded by reference is required'],
    },

    // Whether this record has been corrected
    isCorrected: {
      type: Boolean,
      default: false,
    },

    // Correction details if applicable
    correction: {
      correctedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      correctedAt: Date,
      reason: String,
      originalData: {
        clockInTime: Date,
        clockOutTime: Date,
        totalHours: Number,
        overtimeHours: Number,
        status: String,
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ===== OPTIMIZED INDEXES FOR PERFORMANCE =====

// Unique constraint: Prevent duplicate attendance for same employee, shift, and date
attendanceSchema.index(
  { employeeId: 1, shiftId: 1, attendanceDate: 1 },
  { unique: true },
);

// Primary business queries (most common access pattern)
attendanceSchema.index({ businessId: 1, attendanceDate: -1 });
attendanceSchema.index({ businessId: 1, storeId: 1, attendanceDate: -1 });
attendanceSchema.index({ businessId: 1, status: 1, attendanceDate: -1 });

// Employee-specific queries (for employee attendance history)
attendanceSchema.index({ employeeId: 1, attendanceDate: -1 });
attendanceSchema.index({ employeeId: 1, status: 1 });

// Store-specific queries (for store attendance reports)
attendanceSchema.index({ storeId: 1, attendanceDate: -1 });
attendanceSchema.index({ storeId: 1, status: 1 });

// Shift lookup (for clock in/out operations)
attendanceSchema.index({ shiftId: 1 });

// Timestamp queries (for recent records, corrections tracking)
attendanceSchema.index({ createdAt: -1 });
attendanceSchema.index({ isCorrected: 1, updatedAt: -1 });

// Recorded by tracking (for audit trails)
attendanceSchema.index({ recordedBy: 1, createdAt: -1 });

// ===== VIRTUAL FIELDS =====

// Virtual for formatted attendance date
attendanceSchema.virtual('formattedDate').get(function () {
  return this.attendanceDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
});

// Virtual for attendance status display
attendanceSchema.virtual('statusDisplay').get(function () {
  const statusMap = {
    present: 'Present',
    absent: 'Absent',
    leave: 'On Leave',
    no_show: 'No Show',
  };
  return statusMap[this.status] || this.status;
});

// Virtual for clock-in status display
attendanceSchema.virtual('clockInStatusDisplay').get(function () {
  const statusMap = {
    on_time: 'On Time',
    late: 'Late',
  };
  return statusMap[this.clockInStatus] || this.clockInStatus;
});

// Virtual for clock-out status display
attendanceSchema.virtual('clockOutStatusDisplay').get(function () {
  const statusMap = {
    completed: 'Completed',
    early_out: 'Early Out',
  };
  return statusMap[this.clockOutStatus] || this.clockOutStatus;
});

// ===== PRE-SAVE MIDDLEWARE =====

attendanceSchema.pre('save', async function (next) {
  try {
    // Calculate total break time
    if (this.breaks && this.breaks.length > 0) {
      this.totalBreakTime = this.breaks.reduce((total, breakItem) => {
        return total + (breakItem.duration || 0);
      }, 0);
    }

    // Calculate total working hours
    if (this.clockInTime && this.clockOutTime) {
      const workDurationMs = this.clockOutTime - this.clockInTime;
      const workDurationMinutes = workDurationMs / (1000 * 60);
      this.totalHours =
        Math.round(((workDurationMinutes - this.totalBreakTime) / 60) * 100) /
        100;

      // Calculate regular and overtime hours (assuming 8 hours is regular)
      this.regularHours = Math.min(this.totalHours, 8);
      this.overtimeHours = Math.max(0, this.totalHours - 8);
    }

    next();
  } catch (error) {
    next(error);
  }
});

// ===== STATIC METHODS =====

// Find attendance by employee and date range
attendanceSchema.statics.findByEmployeeAndDateRange = function (
  employeeId,
  startDate,
  endDate,
) {
  return this.find({
    employeeId,
    attendanceDate: {
      $gte: startDate,
      $lte: endDate,
    },
  }).sort({ attendanceDate: 1, clockInTime: 1 });
};

// Find attendance by store and date
attendanceSchema.statics.findByStoreAndDate = function (storeId, date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  return this.find({
    storeId,
    attendanceDate: {
      $gte: startOfDay,
      $lte: endOfDay,
    },
  }).sort({ clockInTime: 1 });
};

// Find attendance by shift
attendanceSchema.statics.findByShift = function (shiftId) {
  return this.find({ shiftId }).sort({ attendanceDate: 1 });
};

// Find no-show attendance records
attendanceSchema.statics.findNoShows = function (businessId, date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  return this.find({
    businessId,
    attendanceDate: {
      $gte: startOfDay,
      $lte: endOfDay,
    },
    status: 'no_show',
  });
};

// ===== INSTANCE METHODS =====

// Clock in method
attendanceSchema.methods.clockIn = function (clockInTime = new Date()) {
  if (this.clockInTime) {
    throw new Error('Employee has already clocked in');
  }

  this.clockInTime = clockInTime;
  this.status = 'present';

  // Determine if clock-in is late (compare with planned start time)
  // This would require fetching the shift data, so we'll handle it in the service
  return this.save();
};

// Clock out method
attendanceSchema.methods.clockOut = function (clockOutTime = new Date()) {
  if (!this.clockInTime) {
    throw new Error('Employee must clock in before clocking out');
  }

  if (this.clockOutTime) {
    throw new Error('Employee has already clocked out');
  }

  this.clockOutTime = clockOutTime;

  // Determine if clock-out is early (compare with planned end time)
  // This would require fetching the shift data, so we'll handle it in the service
  return this.save();
};

// Add break method
attendanceSchema.methods.addBreak = function (
  breakType = 'lunch',
  duration = 30,
  notes = '',
) {
  if (!this.clockInTime) {
    throw new Error('Employee must clock in before taking a break');
  }

  if (this.clockOutTime) {
    throw new Error('Cannot add break after clocking out');
  }

  const breakStart = new Date();
  const breakEnd = new Date(breakStart.getTime() + duration * 60000);

  this.breaks.push({
    breakStart,
    breakEnd,
    breakType,
    duration,
    notes,
  });

  return this.save();
};

// Mark as no-show method
attendanceSchema.methods.markAsNoShow = function (recordedBy) {
  this.status = 'no_show';
  this.recordedBy = recordedBy;
  return this.save();
};

// Mark as leave method
attendanceSchema.methods.markAsLeave = function (recordedBy, notes = '') {
  this.status = 'leave';
  this.recordedBy = recordedBy;
  if (notes) {
    this.notes = notes;
  }
  return this.save();
};

// Correct attendance method
attendanceSchema.methods.correctAttendance = function (
  correctionData,
  correctedBy,
) {
  // Store original data
  this.correction = {
    correctedBy,
    correctedAt: new Date(),
    reason: correctionData.reason,
    originalData: {
      clockInTime: this.clockInTime,
      clockOutTime: this.clockOutTime,
      totalHours: this.totalHours,
      overtimeHours: this.overtimeHours,
      status: this.status,
    },
  };

  // Apply corrections
  if (correctionData.clockInTime !== undefined) {
    this.clockInTime = correctionData.clockInTime;
  }
  if (correctionData.clockOutTime !== undefined) {
    this.clockOutTime = correctionData.clockOutTime;
  }
  if (correctionData.status !== undefined) {
    this.status = correctionData.status;
  }
  if (correctionData.notes !== undefined) {
    this.notes = correctionData.notes;
  }

  this.isCorrected = true;
  this.recordedBy = correctedBy;

  return this.save();
};


export { attendanceSchema as AttendanceSchema };
