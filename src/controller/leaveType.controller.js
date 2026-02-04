import { LeaveTypeServices } from '../services/index.js';
import { ResponseService } from '../utils/index.js';
import { StatusCodes } from 'http-status-codes';
class LeaveTypeController {
  static async create(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;
      const leaveTypeServices = new LeaveTypeServices(businessId);
      const payload = { ...req.body };

      // Ensure businessId is set automatically
      payload.businessId = businessId;

      const created = await leaveTypeServices.create(payload);
      return ResponseService.send(
        res,
        StatusCodes.CREATED,
        'Leave type created successfully',
        created,
      );
    } catch (error) {
      console.log(error);
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  static async getActive(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;
      const leaveTypeServices = new LeaveTypeServices(businessId);
      const items = await leaveTypeServices.list({
        filters: { status: true },
        includeCount: false,
        page: 1,
        limit: 100,
      });
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Active leave types retrieved successfully',
        items?.data || [],
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  static async list(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;
      const leaveTypeServices = new LeaveTypeServices(businessId);
      const payload = {
        ...req.query,
        ...req.body,
        filters: { ...(req.query?.filters || req.body?.filters || {}) },
      };
      const created = await leaveTypeServices.list(payload);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Leave type list successfully',
        created,
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  static async update(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;
      const leaveTypeServices = new LeaveTypeServices(businessId);
      const payload = { ...req.body };

      // Prevent changing tenant accidentally
      delete payload.businessId;

      const updated = await leaveTypeServices.updateById(
        req.params.id,
        payload,
      );
      return ResponseService.send(
        res,
        StatusCodes.CREATED,
        'Leave type updated successfully',
        updated,
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  static async delete(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;
      const leaveTypeServices = new LeaveTypeServices(businessId);
      const payload = { ...req.body };
      const deleted = await leaveTypeServices.deleteById(req.params.id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Leave type deleted successfully',
        deleted,
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  static async toggleStatus(req, res) {
    try {
      const { id } = req.params;
      const businessId = req.user?.businessId || req.businessId;
      const leaveTypeService = new LeaveTypeServices(businessId);
      const { message, data } = await leaveTypeService.toggleStatus(
        id,
        businessId,
      );
      return ResponseService.send(res, StatusCodes.OK, message, data);
    } catch (error) {
      console.log(error);
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }
}

export default LeaveTypeController;
