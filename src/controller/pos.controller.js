import POSService from '../services/pos.services.js';
import { ResponseService } from '../utils/index.js';
import { StatusCodes } from 'http-status-codes';

/**
 * POS Controller
 *
 * Handles Point of Sale related endpoints.
 * Provides initialization data based on user role and store assignments.
 */
class POSController {
  /**
   * Get POS initialization data
   * Returns active stores (based on user role), categories, coupons, customers (with gift cards & loyalty points), and redemption rules
   *
   * @route GET /api/admin/pos/init
   * @query {Boolean} includeGiftCards - Include gift cards with customers (default: true)
   * @query {Boolean} includeLoyaltyPoints - Include loyalty points with customers (default: true)
   * @query {Boolean} includeGiftCardsList - Include separate gift cards list (default: false)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Object} POS initialization data
   */
  static async getInitData(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;

      if (!businessId) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Business ID is required',
        );
      }

      // Parse query options
      const options = {
        includeGiftCards: req.query.includeGiftCards !== 'false',
        includeLoyaltyPoints: req.query.includeLoyaltyPoints !== 'false',
        includeGiftCardsList: req.query.includeGiftCardsList === 'true',
      };

      const posService = new POSService(businessId);
      const initData = await posService.getPOSInitData(req.user, options);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'POS initialization data retrieved successfully',
        initData,
      );
    } catch (error) {
      console.error('POS Init Data Error:', error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to retrieve POS initialization data',
      );
    }
  }

  /**
   * Get active stores based on user role
   * - Admin: All active stores
   * - Manager/Cashier: Only assigned stores
   *
   * @route GET /api/admin/pos/stores
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Array} Active stores
   */
  static async getStores(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;

      if (!businessId) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Business ID is required',
        );
      }

      const posService = new POSService(businessId);
      const stores = await posService.getStoresByUserRole(req.user);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Stores retrieved successfully',
        stores,
      );
    } catch (error) {
      console.error('POS Get Stores Error:', error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to retrieve stores',
      );
    }
  }

  /**
   * Get active product categories
   *
   * @route GET /api/admin/pos/categories
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Array} Active categories
   */
  static async getCategories(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;

      if (!businessId) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Business ID is required',
        );
      }

      const posService = new POSService(businessId);
      const categories = await posService.getActiveCategories();

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Categories retrieved successfully',
        categories,
      );
    } catch (error) {
      console.error('POS Get Categories Error:', error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to retrieve categories',
      );
    }
  }

  /**
   * Get active coupons
   *
   * @route GET /api/admin/pos/coupons
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Array} Active coupons
   */
  static async getCoupons(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;

      if (!businessId) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Business ID is required',
        );
      }

      const posService = new POSService(businessId);
      const coupons = await posService.getActiveCoupons();

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Coupons retrieved successfully',
        coupons,
      );
    } catch (error) {
      console.error('POS Get Coupons Error:', error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to retrieve coupons',
      );
    }
  }

  /**
   * Get active customers with gift cards and loyalty points
   *
   * @route GET /api/admin/pos/customers
   * @query {Boolean} includeGiftCards - Include assigned gift cards (default: true)
   * @query {Boolean} includeLoyaltyPoints - Include loyalty points data (default: true)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Array} Active customers with related data
   */
  static async getCustomers(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;

      if (!businessId) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Business ID is required',
        );
      }

      // Parse query options
      const options = {
        includeGiftCards: req.query.includeGiftCards !== 'false',
        includeLoyaltyPoints: req.query.includeLoyaltyPoints !== 'false',
      };

      const posService = new POSService(businessId);
      const customers = await posService.getActiveCustomers(options);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Customers retrieved successfully',
        customers,
      );
    } catch (error) {
      console.error('POS Get Customers Error:', error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to retrieve customers',
      );
    }
  }

  /**
   * Get active loyalty redemption rules
   *
   * @route GET /api/admin/pos/redemption-rules
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Array} Active redemption rules
   */
  static async getRedemptionRules(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;

      if (!businessId) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Business ID is required',
        );
      }

      const posService = new POSService(businessId);
      const rules = await posService.getActiveRedemptionRules();

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Redemption rules retrieved successfully',
        rules,
      );
    } catch (error) {
      console.error('POS Get Redemption Rules Error:', error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to retrieve redemption rules',
      );
    }
  }

  /**
   * Get active gift cards
   *
   * @route GET /api/admin/pos/gift-cards
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Array} Active gift cards
   */
  static async getGiftCards(req, res) {
    try {
      const businessId = req.user?.businessId || req.businessId;

      if (!businessId) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Business ID is required',
        );
      }

      const posService = new POSService(businessId);
      const giftCards = await posService.getActiveGiftCards();

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Gift cards retrieved successfully',
        giftCards,
      );
    } catch (error) {
      console.error('POS Get Gift Cards Error:', error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to retrieve gift cards',
      );
    }
  }
}

export default POSController;
