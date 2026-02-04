import { BaseService } from '../utils/index.js';
import {
  StoreSchema,
  EmployeeSchema,
  User,
} from '../models/index.js';
import StoreService from './store.services.js';
import ProductCategoryServices from './productCategory.services.js';
import TenantCouponServices from './tenantCoupon.services.js';
import CustomerService from './customer.services.js';
import LoyaltyRedemptionRuleServices from './loyaltyRedemptionRule.services.js';
import GiftCardService from './giftCard.services.js';

/**
 * POS Service
 *
 * Enterprise-grade service for Point of Sale operations.
 * Provides methods to retrieve active data based on user role and store assignments.
 * Uses respective services for optimized data fetching.
 *
 * @class POSService
 * @extends BaseService
 */
class POSService extends BaseService {
  /**
   * Initialize POS Service with tenant-specific database support
   * @param {String} businessId - Business/tenant ID for multi-tenant isolation
   */
  constructor(businessId) {
    if (!businessId) {
      throw new Error('POSService initialized without businessId');
    }
    super({
      modelName: 'Store',
      schema: StoreSchema,
      collection: 'stores',
      businessId,
    });

    // Initialize service instances
    this._storeService = null;
    this._categoryService = null;
    this._couponService = null;
    this._customerService = null;
    this._redemptionRuleService = null;
    this._giftCardService = null;

    // Cache model references for store-related queries
    this._storeModel = null;
    this._employeeModel = null;
  }

  /**
   * Get Store service instance
   * @returns {StoreService} Store service
   */
  getStoreService() {
    if (!this._storeService) {
      this._storeService = new StoreService(this.businessId);
    }
    return this._storeService;
  }

  /**
   * Get ProductCategory service instance
   * @returns {ProductCategoryServices} ProductCategory service
   */
  getCategoryService() {
    if (!this._categoryService) {
      this._categoryService = new ProductCategoryServices(this.businessId);
    }
    return this._categoryService;
  }

  /**
   * Get TenantCoupon service instance
   * @returns {TenantCouponServices} TenantCoupon service
   */
  getCouponService() {
    if (!this._couponService) {
      this._couponService = new TenantCouponServices(this.businessId);
    }
    return this._couponService;
  }

  /**
   * Get Customer service instance
   * @returns {CustomerService} Customer service
   */
  getCustomerService() {
    if (!this._customerService) {
      this._customerService = new CustomerService(this.businessId);
    }
    return this._customerService;
  }

  /**
   * Get LoyaltyRedemptionRule service instance
   * @returns {LoyaltyRedemptionRuleServices} LoyaltyRedemptionRule service
   */
  getRedemptionRuleService() {
    if (!this._redemptionRuleService) {
      this._redemptionRuleService = new LoyaltyRedemptionRuleServices(
        this.businessId,
      );
    }
    return this._redemptionRuleService;
  }

  /**
   * Get GiftCard service instance
   * @returns {GiftCardService} GiftCard service
   */
  getGiftCardService() {
    if (!this._giftCardService) {
      this._giftCardService = new GiftCardService(this.businessId);
    }
    return this._giftCardService;
  }

  /**
   * Get cached Store model reference
   * @returns {Promise<Model>} Store model
   */
  async getStoreModel() {
    if (!this._storeModel) {
      this._storeModel = await this.getModel('Store', StoreSchema, 'stores');
    }
    return this._storeModel;
  }

  /**
   * Get cached Employee model reference
   * @returns {Promise<Model>} Employee model
   */
  async getEmployeeModel() {
    if (!this._employeeModel) {
      this._employeeModel = await this.getModel(
        'Employee',
        EmployeeSchema,
        'employees',
      );
    }
    return this._employeeModel;
  }

  /**
   * Get stores based on user role
   * - Admin: All active stores
   * - Manager/Cashier: Only assigned stores
   * @param {Object} user - User object with role information
   * @returns {Promise<Array>} Array of active stores
   */
  async getStoresByUserRole(user) {
    try {
      const storeService = this.getStoreService();
      const userRole = user.roleId?.name || user.role;

      // Admin gets all active stores using store service
      if (userRole === 'admin' || userRole === 'superadmin') {
        const result = await storeService.listStores({
          isActive: true,
          all: true,
        });
        return result.data || [];
      }

      // Manager/Cashier gets only assigned stores
      const EmployeeModel = await this.getEmployeeModel();
      const employeeRecords = await EmployeeModel.find({
        user: user._id,
        isActive: true,
      })
        .select('store')
        .lean();

      if (!employeeRecords || employeeRecords.length === 0) {
        return [];
      }

      // Get unique store IDs from employee records
      const storeIds = [
        ...new Set(
          employeeRecords
            .filter((emp) => emp.store)
            .map((emp) => emp.store.toString()),
        ),
      ];

      if (storeIds.length === 0) {
        return [];
      }

      // Bulk get stores using store service
      const bulkResult = await storeService.bulkGetStores(storeIds, {
        lean: true,
      });

      // Filter only active stores
      const activeStores = (bulkResult.data || []).filter(
        (store) => store.status === true && store.isDeleted === false,
      );

      return activeStores;
    } catch (error) {
      throw new Error(`Error retrieving stores by user role: ${error.message}`);
    }
  }

  /**
   * Get active product categories using ProductCategoryService
   * @returns {Promise<Array>} Array of active categories
   */
  async getActiveCategories() {
    try {
      const categoryService = this.getCategoryService();
      const categories = await categoryService.getActiveCategories();
      return categories || [];
    } catch (error) {
      throw new Error(`Error retrieving active categories: ${error.message}`);
    }
  }

  /**
   * Get active coupons using TenantCouponService
   * @returns {Promise<Array>} Array of active coupons
   */
  async getActiveCoupons() {
    try {
      const couponService = this.getCouponService();
      const coupons = await couponService.getActiveCoupons();
      return coupons || [];
    } catch (error) {
      throw new Error(`Error retrieving active coupons: ${error.message}`);
    }
  }

  /**
   * Get active customers with gift cards and loyalty points using CustomerService
   * This mirrors the getActiveCustomers method from customer.services.js
   * @param {Object} options - Options for data fetching
   * @param {Boolean} options.includeGiftCards - Include assigned gift cards (default: true)
   * @param {Boolean} options.includeLoyaltyPoints - Include loyalty points data (default: true)
   * @returns {Promise<Array>} Array of active customers with related data
   */
  async getActiveCustomers(options = {}) {
    try {
      const customerService = this.getCustomerService();
      const customers = await customerService.getActiveCustomers({
        includeGiftCards: options.includeGiftCards !== false,
        includeLoyaltyPoints: options.includeLoyaltyPoints !== false,
      });
      return customers || [];
    } catch (error) {
      throw new Error(`Error retrieving active customers: ${error.message}`);
    }
  }

  /**
   * Get active loyalty redemption rules using LoyaltyRedemptionRuleService
   * @returns {Promise<Array>} Array of active redemption rules
   */
  async getActiveRedemptionRules() {
    try {
      const redemptionRuleService = this.getRedemptionRuleService();
      const rules = await redemptionRuleService.getActiveRules();
      return rules || [];
    } catch (error) {
      throw new Error(
        `Error retrieving active redemption rules: ${error.message}`,
      );
    }
  }

  /**
   * Get active gift cards using GiftCardService
   * @returns {Promise<Array>} Array of active gift cards
   */
  async getActiveGiftCards() {
    try {
      const giftCardService = this.getGiftCardService();
      const result = await giftCardService.getActiveGiftCards({
        limit: 10000, // Get all active gift cards
      });
      return result.data || [];
    } catch (error) {
      throw new Error(`Error retrieving active gift cards: ${error.message}`);
    }
  }

  /**
   * Get POS initialization data based on user role
   * Returns active stores (based on role), categories, coupons, customers (with gift cards & loyalty points), and redemption rules
   * @param {Object} user - User object with role and ID information
   * @param {Object} options - Options for data fetching
   * @param {Boolean} options.includeGiftCards - Include gift cards with customers (default: true)
   * @param {Boolean} options.includeLoyaltyPoints - Include loyalty points with customers (default: true)
   * @param {Boolean} options.includeGiftCardsList - Include separate gift cards list (default: false)
   * @returns {Promise<Object>} POS initialization data
   */
  async getPOSInitData(user, options = {}) {
    try {
      if (!user?._id) {
        throw new Error('User information is required');
      }

      // Fetch user with populated role if not already populated
      let userWithRole = user;
      if (!user.roleId?.name && !user.role) {
        userWithRole = await User.findById(user._id).populate('roleId').lean();
        if (!userWithRole) {
          throw new Error('User not found');
        }
      }

      // Build parallel query array
      const queries = [
        this.getStoresByUserRole(userWithRole),
        this.getActiveCategories(),
        this.getActiveCoupons(),
        this.getActiveCustomers({
          includeGiftCards: options.includeGiftCards !== false,
          includeLoyaltyPoints: options.includeLoyaltyPoints !== false,
        }),
        this.getActiveRedemptionRules(),
      ];

      // Optionally include separate gift cards list
      if (options.includeGiftCardsList === true) {
        queries.push(this.getActiveGiftCards());
      }

      // Execute all queries in parallel for better performance
      const results = await Promise.all(queries);

      const [stores, categories, coupons, customers, redemptionRules] = results;
      const giftCards = options.includeGiftCardsList === true ? results[5] : [];

      const userRole = userWithRole.roleId?.name || userWithRole.role;

      const response = {
        stores,
        categories,
        coupons,
        customers,
        redemptionRules,
        meta: {
          userRole,
          userId: userWithRole._id,
          storeCount: stores.length,
          categoryCount: categories.length,
          couponCount: coupons.length,
          customerCount: customers.length,
          redemptionRuleCount: redemptionRules.length,
          fetchedAt: new Date().toISOString(),
        },
      };

      // Include gift cards in response if requested
      if (options.includeGiftCardsList === true) {
        response.giftCards = giftCards;
        response.meta.giftCardCount = giftCards.length;
      }

      return response;
    } catch (error) {
      throw new Error(`Error retrieving POS init data: ${error.message}`, {
        cause: error,
      });
    }
  }
}

export default POSService;
