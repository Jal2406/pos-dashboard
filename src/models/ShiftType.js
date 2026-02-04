import mongoose from 'mongoose';

const shiftTypeSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Shift type title is required'],
      trim: true,
      maxlength: [100, 'Shift type title cannot exceed 100 characters'],
    },
    startTime: {
      type: String,
      required: [true, 'Start time is required'],
      match: [
        /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
        'Please provide a valid time format (HH:MM)',
      ],
    },
    endTime: {
      type: String,
      required: [true, 'End time is required'],
      match: [
        /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
        'Please provide a valid time format (HH:MM)',
      ],
      validate: {
        validator(value) {
          // Time range validation - allow both same-day and overnight shifts
          const update = typeof this.getUpdate === 'function' ? this.getUpdate() : null;
          const startTime =
            this.startTime ||
            (update?.$set && update.$set.startTime) ||
            update?.startTime;

          if (!startTime || !value) {
            return true;
          }

          const [startHour, startMinute] = startTime.split(':').map(Number);
          const [endHour, endMinute] = value.split(':').map(Number);

          const startMinutes = startHour * 60 + startMinute;
          const endMinutes = endHour * 60 + endMinute;

          let durationMinutes;
          if (endMinutes < startMinutes) {
            // Crosses midnight (overnight shift)
            durationMinutes = 24 * 60 - startMinutes + endMinutes;
          } else {
            // Same day shift
            durationMinutes = endMinutes - startMinutes;
          }

          // Valid shift duration: 1-24 hours (60-1440 minutes)
          return durationMinutes >= 60 && durationMinutes <= 1440;
        },
        message: 'Invalid time range - shift must be between 1-24 hours',
      },
    },
    breakDuration: {
      type: Number,
      default: 0,
    },
    status: {
      type: Boolean,
      default: true,
    },
    weekOff: [
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
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Creator reference is required'],
    },
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: [true, 'Business reference is required'],
    },
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Store',
      default: null, // null means business-wide, specific storeId means store-specific
    },
  },
  { timestamps: true },
);

// ===== ESSENTIAL INDEXES FOR OPTIMAL PERFORMANCE =====

// Primary business context filtering - most common query pattern
shiftTypeSchema.index({ businessId: 1 });

// Store-specific shift types - for manager access
shiftTypeSchema.index({ storeId: 1 });

// Business context with store filtering - for manager operations
shiftTypeSchema.index({ businessId: 1, storeId: 1 });

// Status indexes for filtering
shiftTypeSchema.index({ status: 1 });
shiftTypeSchema.index({ businessId: 1, status: 1 });
shiftTypeSchema.index({ storeId: 1, status: 1 });

// Creator tracking - for audit and access control
shiftTypeSchema.index({ createdBy: 1 });

// Title search - for finding shift types by title
shiftTypeSchema.index({ title: 1 });

// Business context with title - for business-specific title searches
shiftTypeSchema.index({ businessId: 1, title: 1 });

// Timestamp indexes for audit and sorting
shiftTypeSchema.index({ createdAt: -1 });
shiftTypeSchema.index({ updatedAt: -1 });

// Compound index for business-wide shift types (storeId is null)
shiftTypeSchema.index({ businessId: 1, storeId: 1, status: 1 });

// ===== SCHEMA-LEVEL VALIDATIONS =====

// Validate weekOff array for duplicates
shiftTypeSchema.pre('save', function (next) {
  if (this.weekOff && Array.isArray(this.weekOff)) {
    const uniqueDays = new Set(this.weekOff);
    if (uniqueDays.size !== this.weekOff.length) {
      return next(new Error('Week off days must be unique'));
    }
  }
  next();
});

// Validate weekOff array for duplicates on update
shiftTypeSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate();
  if (update.weekOff && Array.isArray(update.weekOff)) {
    const uniqueDays = new Set(update.weekOff);
    if (uniqueDays.size !== update.weekOff.length) {
      return next(new Error('Week off days must be unique'));
    }
  }
  next();
});

// ===== INSTANCE METHODS FOR WEEK OFF HANDLING =====

/**
 * Check if a specific day is a week off day
 * @param {string} dayName - Day name (e.g., 'Monday', 'Tuesday')
 * @returns {boolean} - True if the day is a week off day
 */
shiftTypeSchema.methods.isWeekOffDay = function (dayName) {
  if (!this.weekOff || !Array.isArray(this.weekOff)) {
    return false;
  }
  return this.weekOff.includes(dayName);
};

/**
 * Get all week off days as an array
 * @returns {Array<string>} - Array of week off day names
 */
shiftTypeSchema.methods.getWeekOffDays = function () {
  return this.weekOff || [];
};

/**
 * Add a week off day
 * @param {string} dayName - Day name to add
 * @returns {boolean} - True if added successfully, false if already exists
 */
shiftTypeSchema.methods.addWeekOffDay = function (dayName) {
  if (!this.weekOff) {
    this.weekOff = [];
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

  if (!this.weekOff.includes(dayName)) {
    this.weekOff.push(dayName);
    return true;
  }
  return false;
};

/**
 * Remove a week off day
 * @param {string} dayName - Day name to remove
 * @returns {boolean} - True if removed successfully, false if not found
 */
shiftTypeSchema.methods.removeWeekOffDay = function (dayName) {
  if (!this.weekOff || !Array.isArray(this.weekOff)) {
    return false;
  }

  const index = this.weekOff.indexOf(dayName);
  if (index > -1) {
    this.weekOff.splice(index, 1);
    return true;
  }
  return false;
};

/**
 * Get working days (days that are not week off)
 * @returns {Array<string>} - Array of working day names
 */
shiftTypeSchema.methods.getWorkingDays = function () {
  const allDays = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];
  const weekOffDays = this.getWeekOffDays();
  return allDays.filter((day) => !weekOffDays.includes(day));
};

/**
 * Check if shift is applicable on a specific day
 * @param {string} dayName - Day name to check
 * @returns {boolean} - True if shift is applicable (not a week off day)
 */
shiftTypeSchema.methods.isApplicableOnDay = function (dayName) {
  return !this.isWeekOffDay(dayName);
};

/**
 * Toggle the active status of the shift type
 * @returns {boolean} - The updated status flag
 */
shiftTypeSchema.methods.toggleStatus = function () {
  this.status = !this.status;
  return this.status;
};

// ===== STATIC METHODS FOR WEEK OFF HANDLING =====

/**
 * Find shift types that are applicable on a specific day
 * @param {string} dayName - Day name to check
 * @param {Object} filter - Additional filter criteria
 * @returns {Promise<Array>} - Array of applicable shift types
 */
shiftTypeSchema.statics.findApplicableOnDay = function (dayName, filter = {}) {
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

  return this.find({
    ...filter,
    $or: [
      { weekOff: { $exists: false } },
      { weekOff: { $size: 0 } },
      { weekOff: { $nin: [dayName] } },
    ],
  });
};

/**
 * Get shift types with their week off information
 * @param {Object} filter - Filter criteria
 * @returns {Promise<Array>} - Array of shift types with week off data
 */
shiftTypeSchema.statics.findWithWeekOffInfo = function (filter = {}) {
  return this.find(filter).select(
    'title startTime endTime weekOff status businessId storeId',
  );
};

// ===== VIRTUAL FIELDS =====

/**
 * Virtual field to get the number of week off days
 */
shiftTypeSchema.virtual('weekOffCount').get(function () {
  return this.weekOff ? this.weekOff.length : 0;
});

/**
 * Virtual field to get working days count
 */
shiftTypeSchema.virtual('workingDaysCount').get(function () {
  return 7 - this.weekOffCount;
});

/**
 * Virtual field to check if it's a full week off (all 7 days)
 */
shiftTypeSchema.virtual('isFullWeekOff').get(function () {
  return this.weekOffCount === 7;
});

/**
 * Virtual field to check if it's a regular shift (no week off days)
 */
shiftTypeSchema.virtual('isRegularShift').get(function () {
  return this.weekOffCount === 0;
});

// Ensure virtual fields are included in JSON output
shiftTypeSchema.set('toJSON', { virtuals: true });
shiftTypeSchema.set('toObject', { virtuals: true });

export { shiftTypeSchema as ShiftTypeSchema };
