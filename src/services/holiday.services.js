import mongoose from 'mongoose';
import { BaseService } from '../utils/index.js';
import { HolidaySchema } from '../models/index.js';

class HolidayService extends BaseService {
  constructor(businessId) {
    if (!businessId) {
      throw new Error('HolidayService initialized without businessId');
    }
    super({
      modelName: 'Holiday',
      schema: HolidaySchema,
      collection: 'holidays',
      businessId,
    });
  }

  // ========================================
  // VALIDATION AND HELPER METHODS
  // ========================================

  /**
   * Validate holiday data before creation/update
   * @param {Object} holidayData - Holiday data to validate
   * @param {Boolean} isUpdate - Whether this is an update operation
   * @throws {Error} If validation fails
   */
  _validateHolidayData(holidayData, isUpdate = false) {
    const { name, startDate, endDate, description, isRecurring, status } =
      holidayData;

    // Validate required fields for creation
    if (!isUpdate) {
      if (!name || !name.trim()) {
        throw new Error('Holiday name is required');
      }
      if (!startDate) {
        throw new Error('Holiday start date is required');
      }
      if (!endDate) {
        throw new Error('Holiday end date is required');
      }
    }

    // Validate name length
    if (name && name.length > 100) {
      throw new Error('Holiday name cannot exceed 100 characters');
    }

    // Validate description length
    if (description && description.length > 500) {
      throw new Error('Description cannot exceed 500 characters');
    }

    // Validate date format and range
    if (startDate || endDate) {
      // If updating, both dates should be provided together or not at all
      if (isUpdate && (startDate || endDate) && (!startDate || !endDate)) {
        throw new Error(
          'Both start date and end date must be provided together',
        );
      }

      if (startDate) {
        const holidayStartDate = new Date(startDate);
        if (isNaN(holidayStartDate.getTime())) {
          throw new Error('Invalid start date format');
        }
      }

      if (endDate) {
        const holidayEndDate = new Date(endDate);
        if (isNaN(holidayEndDate.getTime())) {
          throw new Error('Invalid end date format');
        }
      }

      // Validate that endDate is not before startDate
      if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);

        if (end < start) {
          throw new Error('End date cannot be before start date');
        }

        // For new holidays, warn if start date is in the past (unless recurring)
        if (!isUpdate && start < new Date() && !isRecurring) {
          console.warn('Warning: Creating a holiday with a past start date');
        }
      }
    }

    // Validate boolean fields
    if (isRecurring !== undefined && typeof isRecurring !== 'boolean') {
      throw new Error('isRecurring must be a boolean value');
    }

    if (status !== undefined && typeof status !== 'boolean') {
      throw new Error('status must be a boolean value');
    }
  }

  /**
   * Check if holiday with overlapping date range already exists
   * @param {Date} startDate - Holiday start date
   * @param {Date} endDate - Holiday end date
   * @param {String} excludeId - Holiday ID to exclude from check (for updates)
   * @param {Model} HolidayModel - Holiday model
   * @throws {Error} If overlapping holiday exists
   */
  async _checkOverlappingHoliday(
    startDate,
    endDate,
    excludeId = null,
    HolidayModel,
  ) {
    // Normalize input dates to start/end of day for consistent comparison
    // This handles cases where dates are passed as strings or have time components
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Check for overlapping date ranges
    // Two date ranges overlap if: start1 <= end2 && end1 >= start2
    // This means: existingStart <= newEnd AND existingEnd >= newStart
    // We need to account for dates in the database that might have time components
    // So we check if the existing holiday's range overlaps with our normalized range
    const query = {
      $and: [
        {
          // Existing holiday starts before or on our end date
          startDate: { $lte: end },
        },
        {
          // Existing holiday ends on or after our start date
          endDate: { $gte: start },
        },
      ],
    };

    if (excludeId) {
      query._id = { $ne: excludeId };
    }

    const existingHoliday = await HolidayModel.findOne(query);
    if (existingHoliday) {
      throw new Error(
        'A holiday already exists that overlaps with this date range',
      );
    }
  }

  /**
   * Format holiday data for response
   * @param {Object} holiday - Holiday document
   * @returns {Object} Formatted holiday data
   */
  _formatHolidayResponse(holiday) {
    if (!holiday) return null;

    const formatted = holiday.toObject ? holiday.toObject() : holiday;

    // Add virtual fields
    formatted.statusDisplay = formatted.status ? 'Active' : 'Inactive';
    formatted.recurringDisplay = formatted.isRecurring ? 'Yes' : 'No';

    // Add isSingleDay field
    if (formatted.startDate && formatted.endDate) {
      const start = new Date(formatted.startDate);
      const end = new Date(formatted.endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);
      formatted.isSingleDay = start.getTime() === end.getTime();
    }

    return formatted;
  }

  /**
   * Build match query for filtering holidays
   * @param {Object} filters - Filter criteria
   * @returns {Object} Match query object
   */
  _buildMatchQuery(filters = {}) {
    const matchQuery = {};

    if (filters.status !== undefined) {
      matchQuery.status = filters.status === 'true' || filters.status === true;
    }

    if (filters.isRecurring !== undefined) {
      matchQuery.isRecurring =
        filters.isRecurring === 'true' || filters.isRecurring === true;
    }

    if (filters.year) {
      const year = parseInt(filters.year);
      if (isNaN(year)) {
        throw new Error('Invalid year format');
      }
      const startOfYear = new Date(year, 0, 1);
      const endOfYear = new Date(year, 11, 31, 23, 59, 59, 999);
      // Find holidays that overlap with the year
      matchQuery.$or = [
        {
          startDate: { $lte: endOfYear },
          endDate: { $gte: startOfYear },
        },
      ];
    }

    if (filters.startDate && filters.endDate) {
      const startDate = new Date(filters.startDate);
      const endDate = new Date(filters.endDate);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new Error('Invalid date range format');
      }

      // Find holidays that overlap with the date range
      matchQuery.$or = [
        {
          startDate: { $lte: endDate },
          endDate: { $gte: startDate },
        },
      ];
    }

    if (filters.search) {
      const searchConditions = [
        { name: { $regex: filters.search, $options: 'i' } },
        { description: { $regex: filters.search, $options: 'i' } },
      ];

      // If there's already an $or for date range, combine with $and
      if (matchQuery.$or) {
        matchQuery.$and = [{ $or: matchQuery.$or }, { $or: searchConditions }];
        delete matchQuery.$or;
      } else {
        matchQuery.$or = searchConditions;
      }
    }

    return matchQuery;
  }

  // ========================================
  // CRUD OPERATIONS
  // ========================================

  /**
   * Create a new holiday
   * @param {Object} holidayData - Holiday data
   * @param {Object} currentUser - Current authenticated user
   * @param {String} businessId - Business ID for tenant isolation
   * @returns {Promise<Object>} Created holiday
   */
  async createHoliday(holidayData, currentUser, businessId) {
    try {
      // Get tenant-aware Holiday model
      const HolidayModel = await this.getModelRef();

      // Validate holiday data
      this._validateHolidayData(holidayData, false);

      // Check for overlapping date range
      await this._checkOverlappingHoliday(
        holidayData.startDate,
        holidayData.endDate,
        null,
        HolidayModel,
      );

      // Add creator information
      holidayData.createdBy = currentUser._id;

      // Create holiday using tenant model
      let holiday;
      try {
        holiday = await HolidayModel.create(holidayData);
      } catch (err) {
        console.log(err);
        if (err && err.code === 11000) {
          throw new Error(
            'A holiday already exists that overlaps with this date range',
          );
        }
        throw err;
      }

      // Return formatted holiday
      return this._formatHolidayResponse(holiday);
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  /**
   * Get holiday by ID
   * @param {String} id - Holiday ID
   * @param {Object} currentUser - Current authenticated user
   * @param {String} businessId - Business ID for tenant isolation
   * @returns {Promise<Object>} Holiday
   */
  async getHolidayById(id, currentUser, businessId) {
    try {
      if (!mongoose.isValidObjectId(id)) {
        throw new Error('Invalid holiday ID');
      }

      // Get tenant-aware Holiday model
      const HolidayModel = await this.getModelRef();

      // Find holiday
      const holiday = await HolidayModel.findById(id);
      if (!holiday) {
        throw new Error('Holiday not found');
      }

      // Return formatted holiday
      return this._formatHolidayResponse(holiday);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Update holiday
   * @param {String} id - Holiday ID
   * @param {Object} updateData - Data to update
   * @param {Object} currentUser - Current authenticated user
   * @param {String} businessId - Business ID for tenant isolation
   * @returns {Promise<Object>} Updated holiday
   */
  async updateHoliday(id, updateData, currentUser, businessId) {
    try {
      if (!mongoose.isValidObjectId(id)) {
        throw new Error('Invalid holiday ID');
      }

      // Get tenant-aware Holiday model
      const HolidayModel = await this.getModelRef();

      // Validate update data
      this._validateHolidayData(updateData, true);

      // Check for overlapping date range if dates are being updated
      if (updateData.startDate || updateData.endDate) {
        // Get current holiday to use existing dates if not provided
        const currentHoliday = await HolidayModel.findById(id);
        if (!currentHoliday) {
          throw new Error('Holiday not found');
        }

        const startDate = updateData.startDate || currentHoliday.startDate;
        const endDate = updateData.endDate || currentHoliday.endDate;

        await this._checkOverlappingHoliday(
          startDate,
          endDate,
          id,
          HolidayModel,
        );
      }

      // Add updater information
      updateData.updatedBy = currentUser._id;

      // Update using tenant model
      const holiday = await HolidayModel.findByIdAndUpdate(id, updateData, {
        new: true,
        runValidators: true,
      });

      if (!holiday) {
        throw new Error('Holiday not found');
      }

      // Return formatted holiday
      return this._formatHolidayResponse(holiday);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Delete holiday
   * @param {String} id - Holiday ID
   * @param {Object} currentUser - Current authenticated user
   * @param {String} businessId - Business ID for tenant isolation
   * @returns {Promise<Boolean>} Success status
   */
  async deleteHoliday(id, currentUser, businessId) {
    try {
      if (!mongoose.isValidObjectId(id)) {
        throw new Error('Invalid holiday ID');
      }

      // Get tenant-aware Holiday model
      const HolidayModel = await this.getModelRef();

      // Find and delete holiday
      const holiday = await HolidayModel.findByIdAndDelete(id);
      if (!holiday) {
        throw new Error('Holiday not found');
      }

      return true;
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  /**
   * Toggle holiday status
   * @param {String} id - Holiday ID
   * @param {Object} currentUser - Current authenticated user
   * @param {String} businessId - Business ID for tenant isolation
   * @returns {Promise<Object>} Updated holiday
   */
  async toggleHolidayStatus(id, currentUser, businessId) {
    try {
      if (!mongoose.isValidObjectId(id)) {
        throw new Error('Invalid holiday ID');
      }

      // Get tenant-aware Holiday model
      const HolidayModel = await this.getModelRef();

      // Find current holiday
      const holiday = await HolidayModel.findById(id);
      if (!holiday) {
        throw new Error('Holiday not found');
      }

      // Update status using tenant model
      const updatedHoliday = await HolidayModel.findByIdAndUpdate(
        id,
        {
          status: !holiday.status,
          updatedBy: currentUser._id,
        },
        {
          new: true,
          runValidators: true,
        },
      );

      // Return formatted holiday
      return this._formatHolidayResponse(updatedHoliday);
    } catch (error) {
      throw error;
    }
  }

  // ========================================
  // QUERY AND SEARCH METHODS
  // ========================================

  /**
   * Get holidays with flexible filtering and pagination
   * @param {Object} filters - Filter criteria
   * @param {Object} queryParams - Query parameters (pagination, search)
   * @param {Object} currentUser - Current authenticated user
   * @param {String} businessId - Business ID for tenant isolation
   * @returns {Promise<Object>} Holidays with pagination
   */
  async getHolidays(filters = {}, queryParams = {}, currentUser, businessId) {
    try {
      const {
        page = 1,
        limit = 10,
        search,
        sortBy = 'startDate',
        sortOrder = 'asc',
      } = queryParams;

      // Build match query
      const matchQuery = this._buildMatchQuery(filters);

      // Add search to filters if provided
      if (search) {
        filters.search = search;
        Object.assign(matchQuery, this._buildMatchQuery(filters));
      }

      // Build sort object
      const sortObj = {};
      sortObj[sortBy] = sortOrder === 'desc' ? -1 : 1;

      // Use BaseService pagination
      const result = await this.findWithPagination(
        matchQuery,
        page,
        limit,
        sortObj,
      );

      // Format holidays
      const formattedHolidays = result.data.map((holiday) =>
        this._formatHolidayResponse(holiday),
      );

      return {
        holidays: formattedHolidays,
        pagination: result.pagination,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get active holidays
   * @param {Object} currentUser - Current authenticated user
   * @param {String} businessId - Business ID for tenant isolation
   * @returns {Promise<Array>} Active holidays
   */
  async getActiveHolidays(currentUser, businessId) {
    try {
      // Get tenant-aware Holiday model
      const HolidayModel = await this.getModelRef();

      // Find active holidays
      const holidays = await HolidayModel.find({ status: true })
        .sort({ startDate: 1 })
        .lean();

      // Format holidays
      return holidays.map((holiday) => this._formatHolidayResponse(holiday));
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get holidays by date range
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @param {Object} currentUser - Current authenticated user
   * @param {String} businessId - Business ID for tenant isolation
   * @returns {Promise<Array>} Holidays in date range
   */
  async getHolidaysByDateRange(startDate, endDate, currentUser, businessId) {
    try {
      if (!startDate || !endDate) {
        throw new Error('Start date and end date are required');
      }

      const start = new Date(startDate);
      const end = new Date(endDate);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new Error('Invalid date format');
      }

      if (start > end) {
        throw new Error('Start date cannot be after end date');
      }

      // Get tenant-aware Holiday model
      const HolidayModel = await this.getModelRef();

      // Find holidays that overlap with the date range
      const holidays = await HolidayModel.find({
        status: true,
        $or: [
          {
            startDate: { $lte: end },
            endDate: { $gte: start },
          },
        ],
      })
        .sort({ startDate: 1 })
        .lean();

      // Format holidays
      return holidays.map((holiday) => this._formatHolidayResponse(holiday));
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get recurring holidays
   * @param {Object} currentUser - Current authenticated user
   * @param {String} businessId - Business ID for tenant isolation
   * @returns {Promise<Array>} Recurring holidays
   */
  async getRecurringHolidays(currentUser, businessId) {
    try {
      // Get tenant-aware Holiday model
      const HolidayModel = await this.getModelRef();

      // Find recurring holidays
      const holidays = await HolidayModel.find({
        isRecurring: true,
        status: true,
      })
        .sort({ startDate: 1 })
        .lean();

      // Format holidays
      return holidays.map((holiday) => this._formatHolidayResponse(holiday));
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get holidays by year
   * @param {Number} year - Year to filter by
   * @param {Object} currentUser - Current authenticated user
   * @param {String} businessId - Business ID for tenant isolation
   * @returns {Promise<Array>} Holidays in the specified year
   */
  async getHolidaysByYear(year, currentUser, businessId) {
    try {
      if (!year || isNaN(year)) {
        throw new Error('Valid year is required');
      }

      // Get tenant-aware Holiday model
      const HolidayModel = await this.getModelRef();

      // Find holidays that overlap with the year
      const startOfYear = new Date(year, 0, 1);
      const endOfYear = new Date(year, 11, 31, 23, 59, 59, 999);

      const holidays = await HolidayModel.find({
        $or: [
          {
            startDate: { $lte: endOfYear },
            endDate: { $gte: startOfYear },
          },
        ],
      })
        .sort({ startDate: 1 })
        .lean();

      // Format holidays
      return holidays.map((holiday) => this._formatHolidayResponse(holiday));
    } catch (error) {
      throw error;
    }
  }

  // ========================================
  // STATISTICS AND ANALYTICS METHODS
  // ========================================

  /**
   * Get holiday statistics
   * @param {Object} currentUser - Current authenticated user
   * @param {String} businessId - Business ID for tenant isolation
   * @returns {Promise<Object>} Holiday statistics
   */
  async getHolidayStatistics(currentUser, businessId) {
    try {
      // Get tenant-aware Holiday model
      const HolidayModel = await this.getModelRef();

      // Get statistics using aggregation
      const stats = await HolidayModel.aggregate([
        {
          $group: {
            _id: null,
            totalHolidays: { $sum: 1 },
            activeHolidays: {
              $sum: { $cond: [{ $eq: ['$status', true] }, 1, 0] },
            },
            inactiveHolidays: {
              $sum: { $cond: [{ $eq: ['$status', false] }, 1, 0] },
            },
            recurringHolidays: {
              $sum: { $cond: [{ $eq: ['$isRecurring', true] }, 1, 0] },
            },
            nonRecurringHolidays: {
              $sum: { $cond: [{ $eq: ['$isRecurring', false] }, 1, 0] },
            },
          },
        },
      ]);

      return (
        stats[0] || {
          totalHolidays: 0,
          activeHolidays: 0,
          inactiveHolidays: 0,
          recurringHolidays: 0,
          nonRecurringHolidays: 0,
        }
      );
    } catch (error) {
      throw error;
    }
  }
}

export default HolidayService;
