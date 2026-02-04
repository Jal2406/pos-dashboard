import { StatusCodes } from 'http-status-codes';
import { HeroSectionService } from '../services/index.js';
import { ResponseService } from '../utils/index.js';
const heroSectionService = new HeroSectionService();

class HeroSectionController {
  /**
   * Create a new hero section
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  /**
   * Create or update hero section
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async createOrUpdateHeroSection(req, res) {
    try {
      const heroSectionData = {
        title1: req.body.title1,
        title2: req.body.title2,
        subtitle: req.body.subtitle,
      };

      if (req.body.heroImage) {
        heroSectionData.heroImage = req.body.heroImage;
      }

      // Validate data
      heroSectionService.validateHeroSectionData(heroSectionData);

      const heroSection =
        await heroSectionService.createOrUpdateHeroSection(heroSectionData, req.files);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Hero section saved successfully',
        heroSection,
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  /**
   * Get all hero sections with pagination and search
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getHeroSections(req, res) {
    try {
      const { page, limit, search, sortBy, sortOrder } = req.query;

      const queryParams = {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 10,
        search: search || '',
        sortBy: sortBy || 'createdAt',
        sortOrder: sortOrder || 'desc',
      };

      const result = await heroSectionService.getHeroSections(queryParams);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Hero sections retrieved successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  /**
   * Get the current hero section
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getCurrentHeroSection(req, res) {
    try {
      const heroSection = await heroSectionService.getCurrentHeroSection();

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Current hero section retrieved successfully',
        heroSection,
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.NOT_FOUND, error.message);
    }
  }



  /**
   * Get hero section statistics
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getHeroSectionStats(req, res) {
    try {
      const stats = await heroSectionService.getHeroSectionStats();

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Hero section statistics retrieved successfully',
        stats,
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  /**
   * Preview hero section changes
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async previewHeroSection(req, res) {
    try {
      const heroSectionData = {
        title1: req.body.title1,
        title2: req.body.title2,
        subtitle: req.body.subtitle,
        heroImage: req.body.heroImage,
      };

      const preview =
        await heroSectionService.previewHeroSection(heroSectionData);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Hero section preview generated successfully',
        preview,
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }
}

export default HeroSectionController;
