import { StatusCodes } from 'http-status-codes';
import { ResponseService } from '../utils/index.js';
import TenantMailSettingServices from '../services/tenantMailSetting.services.js';

class TenantMailSettingController {
  static async get(req, res) {
    try {
      const businessId = req.businessId || req.user?.businessId;
      if (!businessId) {
        return ResponseService.send(res, StatusCodes.BAD_REQUEST, 'Business context is required');
      }
      const service = new TenantMailSettingServices(businessId);
      const setting = await service.getMailSetting();
      if (!setting) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'No tenant mail settings configured',
          null,
        );
      }
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Tenant mail settings fetched successfully',
        setting,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to fetch tenant mail settings',
      );
    }
  }

  static async createOrUpdate(req, res) {
    try {
      const businessId = req.businessId || req.user?.businessId;
      if (!businessId) {
        console.log('Business context is required');
        return ResponseService.send(res, StatusCodes.BAD_REQUEST, 'Business context is required');
      }
      const service = new TenantMailSettingServices(businessId);
      const userId = req.user?._id || req.user?.id || null;
      const result = await service.createOrUpdate(req.body, { userId });
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Tenant mail settings saved successfully',
        result,
      );
    } catch (error) {
      console.log(error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to save tenant mail settings',
      );
    }
  }

  static async verify(req, res) {
    try {
      const businessId = req.businessId || req.user?.businessId;
      if (!businessId) {
        return ResponseService.send(res, StatusCodes.BAD_REQUEST, 'Business context is required');
      }
      const service = new TenantMailSettingServices(businessId);
      const userId = req.user?._id || req.user?.id || null;
      const verified = await service.verify({ userId });
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Tenant mail settings verified successfully',
        verified,
      );
    } catch (error) {
      console.log(error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to verify tenant mail settings',
      );
    }
  }

  static async delete(req, res) {
    try {
      const businessId = req.businessId || req.user?.businessId;
      if (!businessId) {
        return ResponseService.send(res, StatusCodes.BAD_REQUEST, 'Business context is required');
      }
      const service = new TenantMailSettingServices(businessId);
      await service.delete();
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Tenant mail settings deleted successfully',
        null,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to delete tenant mail settings',
      );
    }
  }

  static async getStatus(req, res) {
    try {
      const businessId = req.businessId || req.user?.businessId;
      if (!businessId) {
        return ResponseService.send(res, StatusCodes.BAD_REQUEST, 'Business context is required');
      }
      const service = new TenantMailSettingServices(businessId);
      const status = await service.getMailStatus();
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Tenant mail status fetched successfully',
        status,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to fetch tenant mail status',
      );
    }
  }
}

export default TenantMailSettingController;
