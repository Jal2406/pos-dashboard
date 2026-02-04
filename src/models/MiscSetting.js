import mongoose from 'mongoose';

const miscSettingSchema = new mongoose.Schema(
    {
        darkMode: {
            type: Boolean,
            default: false,
            required: [true, 'Dark mode setting is required'],
            index: true,
        },
        timeZone: {
            type: String,
            required: [true, 'Timezone setting is required'],
            trim: true,
            index: true,
        },
        UTC: {
            type: String,
            required: [true, 'UTC offset is required'],
            trim: true,
            validate: {
                validator: function (v) {
                    // Validates format like +05:30, -08:00, +00:00, etc.
                    return /^[+-]\d{2}:\d{2}$/.test(v);
                },
                message: props => `${props.value} is not a valid UTC offset format. Use format like +05:30 or -08:00`
            },
            index: true,
        },
        isMaintenanceMode: {
            type: Boolean,
            default: false,
            required: [true, 'Maintenance mode setting is required'],
            index: true,
        },
        dateFormat: {
            type: String,
            required: [true, 'Date format is required'],
            enum: {
                values: [
                    'DD-MM-YYYY',
                    'MM-DD-YYYY',
                    'YYYY-MM-DD',
                    'DD/MM/YYYY',
                    'MM/DD/YYYY',
                    'YYYY/MM/DD',
                    'DD.MM.YYYY',
                    'MM.DD.YYYY',
                    'YYYY.MM.DD',
                ],
                message: '{VALUE} is not a valid date format',
            },
            default: 'DD-MM-YYYY',
            trim: true,
        },
        timeFormat: {
            type: String,
            required: [true, 'Time format is required'],
            enum: {
                values: ['12', '24'],
                message: '{VALUE} is not a valid time format. Use "12" for 12-hour or "24" for 24-hour format',
            },
            default: '24',
            trim: true,
        },
        dataTableRow: {
            type: Number,
            required: [true, 'Data table row setting is required'],
            min: [1, 'Data table row must be at least 1'],
            default: 10,
        },
        subscriptionExpiryAlerts: {
            type: Number,
            required: [true, 'Subscription expiry alerts setting is required'],
            min: [0, 'Subscription expiry alerts cannot be negative'],
            default: 14,
        },
    },
    {
        timestamps: true,
        versionKey: false,
        collection: 'miscsettings',
    },
);

// Indexes for performance optimization
miscSettingSchema.index({ darkMode: 1, isMaintenanceMode: 1 });

// Instance methods
miscSettingSchema.methods.toJSON = function () {
    const obj = this.toObject();
    return obj;
};

// Static methods
/**
 * Get or create default settings (Singleton pattern)
 * @returns {Promise<Object>} The settings document
 */
miscSettingSchema.statics.getOrCreateDefault = async function () {
    let settings = await this.findOne();
    if (!settings) {
        settings = await this.create({
            darkMode: false,
            isMaintenanceMode: false,
            timeZone: 'UTC',
            UTC: '+00:00',
            dateFormat: 'DD-MM-YYYY',
            timeFormat: '24',
            dataTableRow: 10,
            subscriptionExpiryAlerts: 14,
        });
    }
    return settings;
};

/**
 * Update settings with validation (Singleton pattern)
 * @param {Object} updates - The updates to apply
 * @returns {Promise<Object>} The updated settings document
 */
miscSettingSchema.statics.updateSettings = async function (updates) {
    const settings = await this.getOrCreateDefault();

    // Validate updates
    const allowedUpdates = [
        'darkMode',
        'isMaintenanceMode',
        'timeZone',
        'UTC',
        'dateFormat',
        'timeFormat',
        'dataTableRow',
        'subscriptionExpiryAlerts',
    ];

    const updateKeys = Object.keys(updates);
    const isValidOperation = updateKeys.every((key) => allowedUpdates.includes(key));

    if (!isValidOperation) {
        throw new Error('Invalid updates. Only darkMode, isMaintenanceMode, timeZone, UTC, dateFormat, timeFormat, dataTableRow, and subscriptionExpiryAlerts can be updated');
    }

    Object.assign(settings, updates);
    await settings.save();
    return settings;
};

// Pre-save middleware for additional validation and singleton enforcement
miscSettingSchema.pre('save', async function (next) {
    // Ensure boolean fields are actually booleans
    if (typeof this.darkMode !== 'boolean') {
        this.darkMode = Boolean(this.darkMode);
    }
    if (typeof this.isMaintenanceMode !== 'boolean') {
        this.isMaintenanceMode = Boolean(this.isMaintenanceMode);
    }

    // Enforce singleton pattern - only one document should exist
    if (this.isNew) {
        const count = await this.constructor.countDocuments();
        if (count > 0) {
            const error = new Error('Only one MiscSetting document is allowed. Use updateSettings() instead of create().');
            return next(error);
        }
    }

    next();
});

const MiscSetting = mongoose.model('MiscSetting', miscSettingSchema);

export default MiscSetting;