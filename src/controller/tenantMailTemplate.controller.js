import { StatusCodes } from 'http-status-codes';
import { ResponseService } from '../utils/index.js';
import TenantEmailTemplateService from '../services/tenantNotification/emailTemplate.service.js';

class TenantMailTemplateController {
    

    static async list(req, res) {
        try {
            const businessId = req.businessId || req.user?.businessId;
            if (!businessId) {
                throw new Error('Business context is required');
            }
            const service = new TenantEmailTemplateService(businessId);
            const result = await service.listTemplates(req.query || {});
            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Tenant email templates fetched successfully',
                result,
            );
        } catch (error) {
            const status =
                error.message === 'Business context is required'
                    ? StatusCodes.BAD_REQUEST
                    : StatusCodes.INTERNAL_SERVER_ERROR;
            return ResponseService.send(res, status, error.message);
        }
    }

    static async getById(req, res) {
        try {
            const businessId = req.businessId || req.user?.businessId;
            if (!businessId) {
                throw new Error('Business context is required');
            }
            const service = new TenantEmailTemplateService(businessId);
            const template = await service.getTemplateById(req.params.id);
            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Tenant email template fetched successfully',
                template,
            );
        } catch (error) {
            let status = StatusCodes.BAD_REQUEST;
            if (error.message?.includes('not found')) {
                status = StatusCodes.NOT_FOUND;
            } else if (error.message !== 'Business context is required') {
                status = StatusCodes.INTERNAL_SERVER_ERROR;
            }
            return ResponseService.send(res, status, error.message);
        }
    }

    static async create(req, res) {
        try {
            const businessId = req.businessId || req.user?.businessId;
            if (!businessId) {
                throw new Error('Business context is required');
            }
            const service = new TenantEmailTemplateService(businessId);
            const payload = req.body || {};
            const result = await service.createOrUpdateByLabel(payload);
            const status = result.created ? StatusCodes.CREATED : StatusCodes.OK;
            const message = result.created
                ? 'Tenant email template created successfully'
                : 'Tenant email template updated successfully';
            return ResponseService.send(res, status, message, result.template);
        } catch (error) {
            console.log(error);
            let status = StatusCodes.BAD_REQUEST;
            if (error.message !== 'Business context is required') {
                status = StatusCodes.BAD_REQUEST;
            }
            return ResponseService.send(res, status, error.message);
        }
    }

    static async update(req, res) {
        try {
            const businessId = req.businessId || req.user?.businessId;
            if (!businessId) {
                throw new Error('Business context is required');
            }
            const payload = req.body || {};
            if (!payload.label) {
                throw new Error('label is required to update a template');
            }
            const service = new TenantEmailTemplateService(businessId);
            const result = await service.createOrUpdateByLabel(payload);
            const status = result.created ? StatusCodes.CREATED : StatusCodes.OK;
            const message = result.created
                ? 'Tenant email template created successfully'
                : 'Tenant email template updated successfully';
            return ResponseService.send(res, status, message, result.template);
        } catch (error) {
            let status = StatusCodes.BAD_REQUEST;
            if (error.message !== 'Business context is required') {
                status = StatusCodes.BAD_REQUEST;
            }
            return ResponseService.send(res, status, error.message);
        }
    }

    static async delete(req, res) {
        try {
            const businessId = req.businessId || req.user?.businessId;
            if (!businessId) {
                throw new Error('Business context is required');
            }
            const service = new TenantEmailTemplateService(businessId);
            await service.deleteTemplateById(req.params.id);
            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Tenant email template deleted successfully',
            );
        } catch (error) {
            let status = StatusCodes.BAD_REQUEST;
            if (error.message?.includes('not found')) {
                status = StatusCodes.NOT_FOUND;
            } else if (error.message !== 'Business context is required') {
                status = StatusCodes.INTERNAL_SERVER_ERROR;
            }
            return ResponseService.send(res, status, error.message);
        }
    }

    static async toggleStatus(req, res) {
        try {
            const businessId = req.businessId || req.user?.businessId;
            if (!businessId) {
                throw new Error('Business context is required');
            }
            const service = new TenantEmailTemplateService(businessId);
            const template = await service.toggleTemplateStatus(req.params.id);
            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Tenant email template status updated successfully',
                template,
            );
        } catch (error) {
            console.log(error);
            let status = StatusCodes.BAD_REQUEST;
            if (error.message?.includes('not found')) {
                status = StatusCodes.NOT_FOUND;
            } else if (error.message !== 'Business context is required') {
                status = StatusCodes.INTERNAL_SERVER_ERROR;
            }
            return ResponseService.send(res, status, error.message);
        }
    }
}

export default TenantMailTemplateController;
