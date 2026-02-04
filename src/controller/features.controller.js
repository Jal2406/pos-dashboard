import { StatusCodes } from 'http-status-codes';
import { ResponseService } from '../utils/index.js';
import { FeaturesServices } from '../services/index.js';

const featuresService = new FeaturesServices();

class FeaturesController {
  static async create(req, res) {
    try {
      const payload = { ...req.body };
      const created = await featuresService.create(payload);
      return ResponseService.send(
        res,
        StatusCodes.CREATED,
        'Feature created successfully',
        created,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to create Feature',
      );
    }
  }

  static async list(req, res) {
    try {
      const result = await featuresService.list(req.query);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Features fetched successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch Features',
      );
    }
  }

  static async listPublic(req, res) {
    try {
      const result = await featuresService.listPublic();
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Features (public) fetched successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch public Features',
      );
    }
  }

  static async get(req, res) {
    try {
      const item = await featuresService.getById(req.params.id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Feature fetched successfully',
        item,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.NOT_FOUND,
        error.message || 'Feature not found',
      );
    }
  }

  static async update(req, res) {
    try {
      const payload = { ...req.body };
      const updated = await featuresService.updateById(req.params.id, payload);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Feature updated successfully',
        updated,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to update Feature',
      );
    }
  }

  static async remove(req, res) {
    try {
      const removed = await featuresService.deleteById(req.params.id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Feature deleted successfully',
        removed,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to delete Feature',
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

      const result = await featuresService.bulkUpdateStatus(ids, status);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Features status updated successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error?.message || 'Error updating features status',
      );
    }
  }

  static async bulkUpdate(req, res) {
    return ResponseService.send(
      res,
      StatusCodes.BAD_REQUEST,
      'bulkUpdate is not supported for Features',
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

      const result = await featuresService.bulkDelete(ids);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Features deleted successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error?.message || 'Error deleting features',
      );
    }
  }
}

export default FeaturesController;
