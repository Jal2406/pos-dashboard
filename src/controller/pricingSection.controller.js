import { StatusCodes } from 'http-status-codes';
import { PricingSectionService } from '../services/index.js';
import { ResponseService } from '../utils/index.js';

class PricingSectionController {
  static async createPricingSection(req, res) {
    try {
      const data = {
        sectionTitle: req.body.sectionTitle,
        sectionSubtitle: req.body.sectionSubtitle,
      };

      const service = new PricingSectionService();
      const created = await service.createPricingSection(data);

      return ResponseService.send(
        res,
        StatusCodes.CREATED,
        'Pricing section created successfully',
        created,
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  static async getPricingSections(req, res) {
    try {
      const { page, limit, search, sortBy, sortOrder } = req.query;
      const queryParams = {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 10,
        search: search || '',
        sortBy: sortBy || 'createdAt',
        sortOrder: sortOrder || 'desc',
      };

      const service = new PricingSectionService();
      const result = await service.getPricingSections(queryParams);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Pricing sections retrieved successfully',
        { data: result.data, pagination: result.pagination },
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  static async getCurrentPricingSection(req, res) {
    try {
      const service = new PricingSectionService();
      const section = await service.getCurrentPricingSection();

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Current pricing section retrieved successfully',
        section,
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.NOT_FOUND, error.message);
    }
  }

  static async updatePricingSection(req, res) {
    try {
      const { id } = req.params;
      const data = {
        sectionTitle: req.body.sectionTitle,
        sectionSubtitle: req.body.sectionSubtitle,
      };

      const service = new PricingSectionService();
      const updated = await service.updatePricingSection(id, data);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Pricing section updated successfully',
        updated,
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  static async getPricingSectionStats(req, res) {
    try {
      const service = new PricingSectionService();
      const stats = await service.getPricingSectionStats();

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Pricing section statistics retrieved successfully',
        stats,
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  static async previewPricingSection(req, res) {
    try {
      const data = {
        sectionTitle: req.body.sectionTitle,
        sectionSubtitle: req.body.sectionSubtitle,
      };

      const service = new PricingSectionService();
      const preview = await service.previewPricingSection(data);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Pricing section preview generated successfully',
        preview,
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }
}

export default PricingSectionController;
