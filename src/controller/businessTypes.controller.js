import { StatusCodes } from 'http-status-codes';
import { ResponseService } from '../utils/index.js';
import { BusinessTypesServices } from '../services/index.js';

const businessTypesServices = new BusinessTypesServices();

class BusinessTypesController {
  static async create(req, res) {
    try {
      const payload = { ...req.body };
      const created = await businessTypesServices.create(payload);
      return ResponseService.send(
        res,
        StatusCodes.CREATED,
        'Business type created successfully',
        created,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to create business type',
      );
    }
  }

  static async list(req, res) {
    try {
      const result = await businessTypesServices.list(req.query);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Business types fetched successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch business types',
      );
    }
  }

  static async listPublic(req, res) {
    try {
      const result = await businessTypesServices.listPublic();
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Business types (public) fetched successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch public business types',
      );
    }
  }

  static async get(req, res) {
    try {
      const item = await businessTypesServices.getById(req.params.id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Business type fetched successfully',
        item,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.NOT_FOUND,
        error.message || 'Business type not found',
      );
    }
  }

  static async update(req, res) {
    try {
      const payload = { ...req.body };
      const updated = await businessTypesServices.updateById(
        req.params.id,
        payload,
      );
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Business type updated successfully',
        updated,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to update business type',
      );
    }
  }

  static async remove(req, res) {
    try {
      const removed = await businessTypesServices.deleteById(req.params.id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Business type deleted successfully',
        removed,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to delete business type',
      );
    }
  }

  static async bulkUpdateStatus(req, res) {
    try {
      const { ids, status } = req.body || {};

      if (!Array.isArray(ids) || ids.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'ids must be a non-empty array',
        );
      }
      if (typeof status !== 'boolean') {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'status must be a boolean',
        );
      }

      const result = await businessTypesServices.bulkUpdateStatus(ids, status);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Business types status updated successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error?.message || 'Error updating business types status',
      );
    }
  }

  static async bulkUpdate(req, res) {
    return ResponseService.send(
      res,
      StatusCodes.BAD_REQUEST,
      'bulkUpdate is not supported for Business types',
    );
  }

  static async bulkDelete(req, res) {
    try {
      const { ids } = req.body || {};

      if (!Array.isArray(ids) || ids.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'ids must be a non-empty array',
        );
      }

      const result = await businessTypesServices.bulkDelete(ids);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Business types deleted successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error?.message || 'Error deleting business types',
      );
    }
  }
}

export default BusinessTypesController;
