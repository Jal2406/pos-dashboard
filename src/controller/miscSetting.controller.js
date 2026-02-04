import { StatusCodes } from 'http-status-codes';
import { MiscSettingService } from '../services/index.js';
import { ResponseService } from '../utils/index.js';

const miscSettingService = new MiscSettingService();

/**
 * MiscSettingController
 * Handles HTTP requests for miscellaneous settings
 */
class MiscSettingController {
    /**
     * Get current miscellaneous settings
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async getCurrentSettings(req, res) {
        try {
            const settings = await miscSettingService.getCurrentSettings();

            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Settings retrieved successfully',
                settings,
            );
        } catch (error) {
            console.error('Get Current Settings Error:', error);
            return ResponseService.send(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                error.message,
            );
        }
    }

    /**
     * Update miscellaneous settings
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async updateSettings(req, res) {
        try {
            if (!req.body || Object.keys(req.body).length === 0) {
                return ResponseService.send(
                    res,
                    StatusCodes.BAD_REQUEST,
                    'Request body is missing or empty. Please provide settings to update.',
                );
            }

            // Extract only the allowed fields from request body
            const updates = {};
            const allowedFields = [
                'darkMode',
                'isMaintenanceMode',
                'timeZone',
                'UTC',
                'dateFormat',
                'timeFormat',
                'dataTableRow',
                'subscriptionExpiryAlerts',
            ];

            allowedFields.forEach((field) => {
                if (field in req.body) {
                    updates[field] = req.body[field];
                }
            });

            if (Object.keys(updates).length === 0) {
                return ResponseService.send(
                    res,
                    StatusCodes.BAD_REQUEST,
                    `No valid fields to update. Allowed fields: ${allowedFields.join(', ')}`,
                );
            }

            // Validate settings data
            miscSettingService.validateSettingsData(updates);

            const updatedSettings = await miscSettingService.updateSettings(updates);

            // Invalidate maintenance mode cache if maintenance mode was updated
            if ('isMaintenanceMode' in updates) {
                const { default: MaintenanceModeMiddleware } = await import('../middleware/maintenanceMode.middleware.js');
                MaintenanceModeMiddleware.invalidateCache();
            }

            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Settings updated successfully',
                updatedSettings,
            );
        } catch (error) {
            console.error('Update Settings Error:', error);
            return ResponseService.send(
                res,
                StatusCodes.BAD_REQUEST,
                error.message,
            );
        }
    }

    /**
     * Reset settings to default values
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async resetToDefaults(req, res) {
        try {
            const resetSettings = await miscSettingService.resetToDefaults();

            // Invalidate maintenance mode cache (default is false)
            const { default: MaintenanceModeMiddleware } = await import('../middleware/maintenanceMode.middleware.js');
            MaintenanceModeMiddleware.invalidateCache();

            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Settings reset to defaults successfully',
                resetSettings,
            );
        } catch (error) {
            console.error('Reset Settings Error:', error);
            return ResponseService.send(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                error.message,
            );
        }
    }

    /**
     * Toggle dark mode
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async toggleDarkMode(req, res) {
        try {
            const updatedSettings = await miscSettingService.toggleDarkMode();

            return ResponseService.send(
                res,
                StatusCodes.OK,
                `Dark mode ${updatedSettings.darkMode ? 'enabled' : 'disabled'} successfully`,
                updatedSettings,
            );
        } catch (error) {
            console.error('Toggle Dark Mode Error:', error);
            return ResponseService.send(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                error.message,
            );
        }
    }

    /**
     * Toggle maintenance mode
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async toggleMaintenanceMode(req, res) {
        try {
            const updatedSettings =
                await miscSettingService.toggleMaintenanceMode();

            // Invalidate maintenance mode cache immediately
            const { default: MaintenanceModeMiddleware } = await import('../middleware/maintenanceMode.middleware.js');
            MaintenanceModeMiddleware.invalidateCache();

            return ResponseService.send(
                res,
                StatusCodes.OK,
                `Maintenance mode ${updatedSettings.isMaintenanceMode ? 'enabled' : 'disabled'} successfully`,
                updatedSettings,
            );
        } catch (error) {
            console.error('Toggle Maintenance Mode Error:', error);
            return ResponseService.send(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                error.message,
            );
        }
    }

    /**
     * Get available format options
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async getFormatOptions(req, res) {
        try {
            const options = {
                dateFormats: miscSettingService.getAvailableDateFormats(),
                timeFormats: miscSettingService.getAvailableTimeFormats(),
            };

            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Format options retrieved successfully',
                options,
            );
        } catch (error) {
            console.error('Get Format Options Error:', error);
            return ResponseService.send(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                error.message,
            );
        }
    }
}

export default MiscSettingController;
