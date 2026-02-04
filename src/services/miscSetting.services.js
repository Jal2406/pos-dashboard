import { MiscSetting } from '../models/index.js';
import { BaseService } from '../utils/index.js';

/**
 * MiscSettingService
 * Handles business logic for miscellaneous application settings
 */
class MiscSettingService extends BaseService {
    constructor() {
        super(MiscSetting);
    }

    /**
     * Get or create default miscellaneous settings
     * Ensures settings always exist (singleton pattern)
     * @returns {Promise<Object>} The settings document
     */
    async getOrCreateSettings() {
        try {
            const Model = await this.getModelRef();
            let settings = await Model.findOne();

            if (!settings) {
                settings = await Model.create({
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
        } catch (error) {
            throw new Error(`Failed to get or create settings: ${error.message}`);
        }
    }

    /**
     * Get current miscellaneous settings
     * @returns {Promise<Object>} Current settings
     */
    async getCurrentSettings() {
        try {
            const settings = await this.getOrCreateSettings();
            return settings;
        } catch (error) {
            throw new Error(`Failed to retrieve settings: ${error.message}`);
        }
    }

    /**
     * Update miscellaneous settings with validation
     * @param {Object} updates - The updates to apply
     * @returns {Promise<Object>} Updated settings document
     */
    async updateSettings(updates) {
        try {
            // Validate that updates is an object
            if (!updates || typeof updates !== 'object') {
                throw new Error('Update data must be a valid object');
            }

            // Validate updates contain only allowed fields
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

            if (updateKeys.length === 0) {
                throw new Error('No update fields provided');
            }

            const isValidOperation = updateKeys.every((key) =>
                allowedUpdates.includes(key),
            );

            if (!isValidOperation) {
                const invalidFields = updateKeys.filter(
                    (key) => !allowedUpdates.includes(key),
                );
                throw new Error(
                    `Invalid update fields: ${invalidFields.join(', ')}. Only ${allowedUpdates.join(', ')} can be updated`,
                );
            }

            // Additional validation for specific fields
            if ('darkMode' in updates && typeof updates.darkMode !== 'boolean') {
                throw new Error('darkMode must be a boolean value');
            }

            if (
                'isMaintenanceMode' in updates &&
                typeof updates.isMaintenanceMode !== 'boolean'
            ) {
                throw new Error('isMaintenanceMode must be a boolean value');
            }

            if ('timeFormat' in updates) {
                const validTimeFormats = ['12', '24'];
                if (!validTimeFormats.includes(updates.timeFormat)) {
                    throw new Error(
                        `timeFormat must be one of: ${validTimeFormats.join(', ')}`,
                    );
                }
            }

            if ('dateFormat' in updates) {
                const validDateFormats = [
                    'DD-MM-YYYY',
                    'MM-DD-YYYY',
                    'YYYY-MM-DD',
                    'DD/MM/YYYY',
                    'MM/DD/YYYY',
                    'YYYY/MM/DD',
                    'DD.MM.YYYY',
                    'MM.DD.YYYY',
                    'YYYY.MM.DD',
                ];
                if (!validDateFormats.includes(updates.dateFormat)) {
                    throw new Error(
                        `dateFormat must be one of: ${validDateFormats.join(', ')}`,
                    );
                }
            }

            if ('timeZone' in updates) {
                if (typeof updates.timeZone !== 'string' || updates.timeZone.trim() === '') {
                    throw new Error('timeZone must be a non-empty string');
                }
            }

            if ('UTC' in updates) {
                const utcOffsetRegex = /^[+-]\d{2}:\d{2}$/;
                if (typeof updates.UTC !== 'string' || !utcOffsetRegex.test(updates.UTC)) {
                    throw new Error('UTC must be in format +HH:MM or -HH:MM (e.g., +05:30, -08:00)');
                }
            }

            if ('dataTableRow' in updates) {
                if (
                    typeof updates.dataTableRow !== 'number' ||
                    !Number.isInteger(updates.dataTableRow) ||
                    updates.dataTableRow < 1
                ) {
                    throw new Error('dataTableRow must be an integer greater than or equal to 1');
                }
            }

            if ('subscriptionExpiryAlerts' in updates) {
                if (
                    typeof updates.subscriptionExpiryAlerts !== 'number' ||
                    !Number.isInteger(updates.subscriptionExpiryAlerts) ||
                    updates.subscriptionExpiryAlerts < 0
                ) {
                    throw new Error('subscriptionExpiryAlerts must be a non-negative integer');
                }
            }

            const Model = await this.getModelRef();
            const settings = await this.getOrCreateSettings();

            // Apply updates
            Object.assign(settings, updates);
            await settings.save();

            return settings;
        } catch (error) {
            throw new Error(`Failed to update settings: ${error.message}`);
        }
    }

    /**
     * Reset settings to default values
     * @returns {Promise<Object>} Reset settings document
     */
    async resetToDefaults() {
        try {
            const defaultSettings = {
                darkMode: false,
                isMaintenanceMode: false,
                timeZone: 'UTC',
                UTC: '+00:00',
                dateFormat: 'DD-MM-YYYY',
                timeFormat: '24',
                dataTableRow: 10,
                subscriptionExpiryAlerts: 14,
            };

            return await this.updateSettings(defaultSettings);
        } catch (error) {
            throw new Error(`Failed to reset settings: ${error.message}`);
        }
    }

    /**
     * Toggle dark mode
     * @returns {Promise<Object>} Updated settings
     */
    async toggleDarkMode() {
        try {
            const settings = await this.getOrCreateSettings();
            return await this.updateSettings({ darkMode: !settings.darkMode });
        } catch (error) {
            throw new Error(`Failed to toggle dark mode: ${error.message}`);
        }
    }

    /**
     * Toggle maintenance mode
     * @returns {Promise<Object>} Updated settings
     */
    async toggleMaintenanceMode() {
        try {
            const settings = await this.getOrCreateSettings();
            return await this.updateSettings({
                isMaintenanceMode: !settings.isMaintenanceMode,
            });
        } catch (error) {
            throw new Error(`Failed to toggle maintenance mode: ${error.message}`);
        }
    }

    /**
     * Check if maintenance mode is currently active
     * Optimized for middleware usage with minimal overhead
     * @returns {Promise<boolean>} True if maintenance mode is enabled
     */
    async isMaintenanceModeActive() {
        try {
            const Model = await this.getModelRef();
            const settings = await Model.findOne()
                .select('isMaintenanceMode')
                .lean();

            return settings?.isMaintenanceMode || false;
        } catch (error) {
            // Fail-safe: if we can't check, assume not in maintenance
            console.error('Failed to check maintenance mode:', error);
            return false;
        }
    }

    /**
     * Get available date format options
     * @returns {Array<string>} List of valid date formats
     */
    getAvailableDateFormats() {
        return [
            'DD-MM-YYYY',
            'MM-DD-YYYY',
            'YYYY-MM-DD',
            'DD/MM/YYYY',
            'MM/DD/YYYY',
            'YYYY/MM/DD',
            'DD.MM.YYYY',
            'MM.DD.YYYY',
            'YYYY.MM.DD',
        ];
    }

    /**
     * Get available time format options
     * @returns {Array<string>} List of valid time formats
     */
    getAvailableTimeFormats() {
        return ['12', '24'];
    }

    /**
     * Validate settings data
     * @param {Object} data - Settings data to validate
     * @throws {Error} If validation fails
     */
    validateSettingsData(data) {
        if (!data || typeof data !== 'object') {
            throw new Error('Settings data must be a valid object');
        }

        if ('darkMode' in data && typeof data.darkMode !== 'boolean') {
            throw new Error('darkMode must be a boolean');
        }

        if (
            'isMaintenanceMode' in data &&
            typeof data.isMaintenanceMode !== 'boolean'
        ) {
            throw new Error('isMaintenanceMode must be a boolean');
        }

        if ('dateFormat' in data) {
            const validDateFormats = this.getAvailableDateFormats();
            if (!validDateFormats.includes(data.dateFormat)) {
                throw new Error(
                    `Invalid dateFormat. Must be one of: ${validDateFormats.join(', ')}`,
                );
            }
        }

        if ('timeFormat' in data) {
            const validTimeFormats = this.getAvailableTimeFormats();
            if (!validTimeFormats.includes(data.timeFormat)) {
                throw new Error(
                    `Invalid timeFormat. Must be one of: ${validTimeFormats.join(', ')}`,
                );
            }
        }

        if ('dataTableRow' in data) {
            if (
                typeof data.dataTableRow !== 'number' ||
                !Number.isInteger(data.dataTableRow) ||
                data.dataTableRow < 1
            ) {
                throw new Error('dataTableRow must be an integer greater than or equal to 1');
            }
        }

        if ('subscriptionExpiryAlerts' in data) {
            if (
                typeof data.subscriptionExpiryAlerts !== 'number' ||
                !Number.isInteger(data.subscriptionExpiryAlerts) ||
                data.subscriptionExpiryAlerts < 0
            ) {
                throw new Error('subscriptionExpiryAlerts must be a non-negative integer');
            }
        }
    }
}

export default MiscSettingService;
