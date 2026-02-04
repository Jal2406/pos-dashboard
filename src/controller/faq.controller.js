import { StatusCodes } from 'http-status-codes';
import { ResponseService } from '../utils/index.js';
import { FaqServices } from '../services/index.js';

const faqServices = new FaqServices();

class FaqController {
  static async create(req, res) {
    try {
      const created = await faqServices.create(req.body);
      return ResponseService.send(
        res,
        StatusCodes.CREATED,
        'FAQ created successfully',
        created,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to create FAQ',
      );
    }
  }

  static async list(req, res) {
    try {
      const result = await faqServices.list(req.query);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'FAQs fetched successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch FAQs',
      );
    }
  }

  static async get(req, res) {
    try {
      const items = await faqServices.getActiveFaqsFromActiveCategories();
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Active FAQs fetched successfully',
        items,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.NOT_FOUND,
        error.message || 'FAQ not found',
      );
    }
  }

  static async getBySlug(req, res) {
    try {
      const item = await faqServices.getBySlug(req.params.slug);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'FAQ fetched successfully',
        item,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.NOT_FOUND,
        error.message || 'FAQ not found',
      );
    }
  }

  static async update(req, res) {
    try {
      // Check if request body is empty
      if (!req.body || Object.keys(req.body).length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Request body is empty. Please provide data to update.',
        );
      }

      const updated = await faqServices.updateById(req.params.id, req.body);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'FAQ updated successfully',
        updated,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to update FAQ',
      );
    }
  }

  static async remove(req, res) {
    try {
      const removed = await faqServices.deleteById(req.params.id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'FAQ deleted successfully',
        removed,
      );
    } catch (error) {
      console.log(error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to delete FAQ',
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

      const result = await faqServices.bulkUpdateStatus(ids, status);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'FAQs status updated successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error?.message || 'Error updating FAQs status',
      );
    }
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

      const result = await faqServices.bulkDelete(ids);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'FAQs deleted successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error?.message || 'Error deleting FAQs',
      );
    }
  }
}

export default FaqController;
