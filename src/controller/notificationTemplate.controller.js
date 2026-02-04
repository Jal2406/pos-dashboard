import { StatusCodes } from 'http-status-codes';
import { ResponseService } from '../utils/index.js';
import NotificationTemplateServices from '../services/notification/notificationTemplate.services.js';

const notificationTemplateServices = new NotificationTemplateServices();

class NotificationTemplateController {
    /**
     * List templates
     */
    static async list(req, res) {
        try {
            const { page, limit, search, sortBy, sortOrder, type, userType, isActive } =
                req.query;

            const queryParams = {
                page: parseInt(page) || 1,
                limit: parseInt(limit) || 10,
                search: search || '',
                sortBy: sortBy || 'createdAt',
                sortOrder: sortOrder || 'desc',
                status: isActive || '',
            };

            if (type) queryParams.type = type;
            if (userType) queryParams.userType = userType;

            const result = await notificationTemplateServices.getTemplates(queryParams);

            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Notification templates retrieved successfully',
                result,
            );
        } catch (error) {
            return ResponseService.send(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                error.message,
            );
        }
    }

    /**
     * Create template
     */
    static async create(req, res) {
        try {
            const result = await notificationTemplateServices.createTemplate(req.body);
            return ResponseService.send(
                res,
                StatusCodes.CREATED,
                'Notification template created successfully',
                result,
            );
        } catch (error) {
            return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
        }
    }

    /**
     * Get by ID
     */
    static async getById(req, res) {
        try {
            const result = await notificationTemplateServices.findById(req.params.id);
            if (!result) throw new Error('Template not found');
            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Notification template retrieved successfully',
                result,
            );
        } catch (error) {
            return ResponseService.send(res, StatusCodes.NOT_FOUND, error.message);
        }
    }

    /**
     * Update template
     */
    static async update(req, res) {
        try {
            const result = await notificationTemplateServices.updateTemplate(
                req.params.id,
                req.body,
            );
            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Notification template updated successfully',
                result,
            );
        } catch (error) {
            console.log(error);
            return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
        }
    }

    /**
     * Delete template
     */
    static async remove(req, res) {
        try {
            await notificationTemplateServices.deleteById(req.params.id);
            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Notification template deleted successfully',
            );
        } catch (error) {
            return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
        }
    }

    /**
     * Toggle status
     */
    static async toggleStatus(req, res) {
        try {
            const result = await notificationTemplateServices.toggleStatus(
                req.params.id,
            );
            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Status toggled successfully',
                result,
            );
        } catch (error) {
            return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
        }
    }
}

export default NotificationTemplateController;
