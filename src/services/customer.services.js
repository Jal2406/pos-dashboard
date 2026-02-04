import BaseService from '../utils/base.services.js';
import { CustomerSchema } from '../models/Customer.js';
import { giftCardSchema } from '../models/GiftCard.js';
import { CustomerLoyaltyPointSchema } from '../models/CustomerLoyaltyPoint.js';

/**
 * Customer Service
 *
 * Enterprise-grade service for managing customer operations with tenant-specific database support.
 * Extends BaseService to provide comprehensive CRUD operations and additional business logic.
 *
 * @class CustomerService
 * @extends BaseService
 */
class CustomerService extends BaseService {
  /**
   * Initialize Customer Service with tenant-specific database support
   * @param {String} businessId - Business/tenant ID for multi-tenant isolation
   * @param {Object} options - Optional configuration
   */
  constructor(businessId, options = {}) {
    if (!businessId) {
      throw new Error('CustomerService initialized without businessId');
    }
    super({
      modelName: 'Customer',
      schema: CustomerSchema,
      collection: 'customers',
      businessId,
    });

    // Cache the model reference to avoid repeated resolution
    this._modelRef = null;
  }

  /**
   * Get cached model reference for better performance
   * @returns {Promise<Model>} Cached model reference
   */
  async getCachedModel() {
    if (!this._modelRef) {
      this._modelRef = await this.getModelRef();
    }
    return this._modelRef;
  }

  /**
   * Generate customer code in series (CUST001, CUST002, ..., CUST999, CUST1000, etc.)
   * 
   * CRITICAL INVARIANT: Requires unique index on { customerCode: 1 } for correctness.
   * Uniqueness is ultimately enforced by MongoDB at insertion time (E11000 duplicate key error).
   * 
   * Strategy:
   * 1. First attempts to fill gaps efficiently (binary search approach for large ranges)
   * 2. If no gaps found or gap search is too expensive, continues from max + 1
   * 3. Ensures existing codes are never recreated (e.g., CUST003 won't be recreated if it exists)
   * 
   * Gap-filling logic:
   * - For small ranges (< 100), checks sequentially for gaps
   * - For large ranges, uses binary search to find gaps efficiently
   * - Limits gap search to prevent performance degradation
   * 
   * Concurrency Safety:
   * - Uses bounded retry loop (max 5 attempts) instead of recursion
   * - Derives max number from all existing codes, not lexicographic sort
   * - Retries only on actual duplicate detection
   * - Performance: O(log n) gap search, O(1) with index for existence checks
   * 
   * @returns {Promise<String>} Generated customer code
   * @throws {Error} If unable to generate unique code after bounded retries
   */
  async generateCustomerCode() {
    const Model = await this.getCachedModel();
    const MAX_RETRIES = 5;
    const MAX_GAP_SEARCH = 1000; // Maximum range to search for gaps
    const GAP_SEARCH_BATCH_SIZE = 50; // Batch size for efficient gap checking
    
    // Format number according to business rules: < 1000 → 3-digit padding, >= 1000 → natural
    const formatCode = (num) => {
      const paddedNumber = num < 1000 
        ? num.toString().padStart(3, '0')
        : num.toString();
      return `CUST${paddedNumber}`;
    };

    // Extract numeric value from CUST code, return null if invalid format
    const extractNumber = (code) => {
      if (!code || typeof code !== 'string') return null;
      const match = code.match(/^CUST(\d+)$/i);
      return match ? parseInt(match[1], 10) : null;
    };

    // Get all existing CUST numbers to find gaps and max
    let existingNumbers = new Set();
    let maxNumber = 0;
    let minNumber = Infinity;
    try {
      // Find all customers with CUST prefix
      const customers = await Model.find(
        { customerCode: { $regex: /^CUST\d+$/i } },
        { customerCode: 1 }
      )
        .limit(1000) // Reasonable bound to prevent full collection scan
        .lean();

      // Extract all numeric values and find min/max
      for (const customer of customers) {
        const num = extractNumber(customer.customerCode);
        if (num !== null) {
          existingNumbers.add(num);
          if (num > maxNumber) {
            maxNumber = num;
          }
          if (num < minNumber) {
            minNumber = num;
          }
        }
      }
    } catch (error) {
      // If query fails, start from 1 (safe fallback)
      maxNumber = 0;
      minNumber = Infinity;
    }

    // Helper function to check if a number exists (with caching)
    const checkExists = async (num) => {
      if (existingNumbers.has(num)) {
        return true;
      }
      // Double-check with database (race condition protection)
      const code = formatCode(num);
      const existing = await Model.findOne(
        { customerCode: code },
        { _id: 1 }
      ).lean();
      if (existing) {
        existingNumbers.add(num); // Cache it
        return true;
      }
      return false;
    };

    // Efficient gap-finding strategy
    let candidateNumber = null;
    
    // Only search for gaps if the range is reasonable (prevents performance issues)
    if (maxNumber > 0 && maxNumber <= MAX_GAP_SEARCH) {
      // Strategy 1: For small ranges (< 200), check sequentially for first gap
      if (maxNumber < 200) {
        for (let i = 1; i <= maxNumber; i++) {
          if (!existingNumbers.has(i)) {
            candidateNumber = i;
            break;
          }
        }
      }
      // Strategy 2: For larger ranges, check in batches for efficiency
      // This handles scenarios like: CUST001-CUST100 exist, then CUST200 exists
      // We'll find the gap at CUST101 without checking all 200 numbers individually
      else {
        let foundGap = false;
        // Check in batches, starting from 1
        for (let start = 1; start <= maxNumber && !foundGap; start += GAP_SEARCH_BATCH_SIZE) {
          const end = Math.min(start + GAP_SEARCH_BATCH_SIZE - 1, maxNumber);
          
          // First, check the Set for quick lookup (no DB call)
          for (let i = start; i <= end && !foundGap; i++) {
            if (!existingNumbers.has(i)) {
              // Found a potential gap, verify with DB (race condition check)
              const exists = await checkExists(i);
              if (!exists) {
                candidateNumber = i;
                foundGap = true;
                break;
              }
            }
          }
        }
      }
    }

    // Strategy 3: If no gap found or range is too large, continue from max + 1
    if (candidateNumber === null) {
      candidateNumber = maxNumber + 1;
    }

    // Bounded retry loop (not recursion) to handle race conditions
    let attempts = 0;
    while (attempts < MAX_RETRIES) {
      const candidateCode = formatCode(candidateNumber);

      // Check for existence (optimistic check, not atomic guarantee)
      // Actual uniqueness enforced by MongoDB unique index at insertion
      const existing = await Model.findOne(
        { customerCode: candidateCode },
        { _id: 1 }
      ).lean();

      if (!existing) {
        // Code appears available, return it
        // Note: Final uniqueness guaranteed by MongoDB unique index on customerCode
        // If duplicate key error occurs during customer creation, caller must handle E11000
        return candidateCode;
      }

      // Collision detected (race condition or gap was filled), increment and retry
      candidateNumber++;
      attempts++;
    }

    // Exhausted retries - explicit failure, not silent
    throw new Error(
      `Failed to generate unique customer code after ${MAX_RETRIES} attempts. ` +
      `Last candidate: ${formatCode(candidateNumber)}. ` +
      `This may indicate high concurrency or database contention.`
    );
  }

  /**
   * Create a new customer
   * @param {Object} data - Customer data
   * @param {String} data.customerName - Customer name
   * @param {String} [data.customerCode] - Customer code (optional, auto-generated if not provided)
   * @param {String} data.email - Customer email (unique)
   * @param {String} data.phone - Customer phone (unique)
   * @param {String} data.gender - Customer gender (Male, Female, Other)
   * @param {Object} data.address - Customer address object
   * @param {String} data.createdBy - User ID who created the customer
   * @param {Object} options - Optional options { session }
   * @returns {Promise<Object>} Created customer document
   */
  async createCustomer(data, options = {}) {
    const MAX_CODE_RETRIES = 3;
    let codeRetries = 0;
    let normalizedData = { ...data };

    // Validate required fields
    const requiredFields = ['customerName', 'phone', 'createdBy'];
    this.validateRequiredFields(data, requiredFields);

    // Validate createdBy is a valid ObjectId
    this.validateObjectId(data.createdBy);

    // Generate customer code automatically if not provided
    const shouldAutoGenerateCode = !normalizedData.customerCode || normalizedData.customerCode.trim() === '';

    while (codeRetries <= MAX_CODE_RETRIES) {
      try {
        // Generate customer code if needed (or retry with new code on duplicate)
        if (shouldAutoGenerateCode || codeRetries > 0) {
          normalizedData.customerCode = await this.generateCustomerCode();
        }

        // Handle email: only include if valid, otherwise remove completely
        if (
          normalizedData.email &&
          typeof normalizedData.email === 'string' &&
          normalizedData.email.trim() !== ''
        ) {
          // Valid email: normalize and check for duplicates
          normalizedData.email = normalizedData.email.trim().toLowerCase();
          const existingEmail = await this.findByEmail(normalizedData.email);
          if (existingEmail) {
            throw new Error('Customer with this email already exists');
          }
        } else {
          // Remove email completely if empty/null/undefined
          // This is critical: sparse index allows multiple null/undefined but NOT multiple empty strings
          delete normalizedData.email;
          
          // Double-check: ensure email is not in the object at all
          if ('email' in normalizedData) {
            delete normalizedData.email;
          }
        }

        // Check for duplicate phone
        const existingPhone = await this.findByPhone(data.phone);
        if (existingPhone) {
          throw new Error('Customer with this phone number already exists');
        }

        // Create customer - email field will be omitted if not provided
        // Uniqueness enforced by MongoDB unique index on customerCode
        const customer = await this.create(normalizedData, options);
        return customer;
      } catch (error) {
        // Handle duplicate key errors (E11000)
        if (error.code === 11000) {
          const field = error.keyPattern ? Object.keys(error.keyPattern)[0] : 'field';
          
          // If customerCode duplicate and we can retry, generate new code and retry
          if (field === 'customerCode' && codeRetries < MAX_CODE_RETRIES) {
            codeRetries++;
            // Continue loop to retry with new code
            continue;
          }
          
          // Other duplicate key errors or exhausted retries
          if (field === 'email') {
            throw new Error('Customer with this email already exists');
          }
          if (field === 'customerCode') {
            throw new Error(
              `Failed to create customer: customer code collision after ${MAX_CODE_RETRIES} retries. ` +
              `This may indicate high concurrency.`
            );
          }
          throw new Error(`${field} already exists`);
        }
        
        // Re-throw existing "already exists" errors
        if (error.message.includes('already exists')) {
          throw error;
        }
        
        throw new Error(`Failed to create customer: ${error.message}`);
      }
    }

    // Should never reach here, but safety check
    throw new Error('Failed to create customer: exhausted code generation retries');
  }

  /**
   * Get customer by ID
   * @param {String} id - Customer ID
   * @param {Object} options - Optional options { populate }
   * @returns {Promise<Object>} Customer document
   */
  async getCustomerById(id, options = {}) {
    try {
      this.validateObjectId(id);

      const Model = await this.getCachedModel();
      let query = Model.findById(id);

      // Exclude soft-deleted customers
      query = query.where({ isDeleted: false });

      // Populate if specified
      if (options.populate) {
        query = query.populate(options.populate);
      }

      const customer = await query.exec();

      if (!customer) {
        throw new Error(`Customer with id ${id} not found`);
      }

      return customer;
    } catch (error) {
      throw new Error(`Failed to retrieve customer: ${error.message}`);
    }
  }

  /**
   * Update customer by ID
   * @param {String} id - Customer ID
   * @param {Object} data - Update data
   * @param {String} data.updatedBy - User ID who updated the customer
   * @param {Object} options - Optional options { session }
   * @returns {Promise<Object>} Updated customer document
   */
  async updateCustomer(id, data, options = {}) {
    try {
      this.validateObjectId(id);

      if (!data || typeof data !== 'object') {
        throw new Error('Update data must be a valid object');
      }

      // Ensure updatedBy is set
      if (!data.updatedBy) {
        throw new Error('updatedBy is required for customer updates');
      }
      this.validateObjectId(data.updatedBy);

      // Check if customer exists and is not deleted
      const existingCustomer = await this.getCustomerById(id);
      if (!existingCustomer) {
        throw new Error(`Customer with id ${id} not found`);
      }

      // Prepare normalized data
      const normalizedData = { ...data };
      const unsetFields = {};

      // Handle email: only include if provided and valid, otherwise remove it
      if ('email' in normalizedData) {
        if (
          normalizedData.email &&
          typeof normalizedData.email === 'string' &&
          normalizedData.email.trim() !== ''
        ) {
          // Normalize email: trim and lowercase
          normalizedData.email = normalizedData.email.trim().toLowerCase();
          
          // Check for duplicate email if email is being changed
          if (normalizedData.email !== existingCustomer.email) {
            const emailExists = await this.findByEmail(normalizedData.email);
            if (emailExists && emailExists._id.toString() !== id) {
              throw new Error('Customer with this email already exists');
            }
          }
        } else {
          // If email is being set to empty/null, remove it completely
          // Use $unset to remove the field from the document
          unsetFields.email = '';
          delete normalizedData.email;
        }
      }

      // Add $unset if there are fields to remove
      if (Object.keys(unsetFields).length > 0) {
        normalizedData.$unset = unsetFields;
      }

      // Check for duplicate phone if phone is being updated
      if (data.phone && data.phone !== existingCustomer.phone) {
        const phoneExists = await this.findByPhone(data.phone);
        if (phoneExists && phoneExists._id.toString() !== id) {
          throw new Error('Customer with this phone number already exists');
        }
      }

      // Update customer using base service with normalized data
      const updatedCustomer = await this.updateById(id, normalizedData);
      return updatedCustomer;
    } catch (error) {
      throw new Error(`Failed to update customer: ${error.message}`);
    }
  }

  /**
   * Delete customer by ID (hard delete)
   * @param {String} id - Customer ID
   * @param {Object} options - Optional options { session }
   * @returns {Promise<Object>} Deleted customer document
   */
  async deleteCustomer(id, options = {}) {
    try {
      this.validateObjectId(id);

      // Check if customer exists
      const customer = await this.getCustomerById(id);
      if (!customer) {
        throw new Error(`Customer with id ${id} not found`);
      }

      // Perform hard delete using base service
      const deletedCustomer = await this.deleteById(id);
      return deletedCustomer;
    } catch (error) {
      throw new Error(`Failed to delete customer: ${error.message}`);
    }
  }

  /**
   * Soft delete customer by ID
   * @param {String} id - Customer ID
   * @param {Object} options - Optional options { session }
   * @returns {Promise<Object>} Updated customer document
   */
  async softDeleteCustomer(id, options = {}) {
    try {
      this.validateObjectId(id);

      // Check if customer exists
      const customer = await this.getCustomerById(id);
      if (!customer) {
        throw new Error(`Customer with id ${id} not found`);
      }

      // Perform soft delete using base service
      const deletedCustomer = await this.softDeleteById(id);
      return deletedCustomer;
    } catch (error) {
      throw new Error(`Failed to soft delete customer: ${error.message}`);
    }
  }

  /**
   * Restore soft-deleted customer
   * @param {String} id - Customer ID
   * @param {Object} options - Optional options { session }
   * @returns {Promise<Object>} Restored customer document
   */
  async restoreCustomer(id, options = {}) {
    try {
      this.validateObjectId(id);

      const Model = await this.getCachedModel();
      const customer = await Model.findById(id);

      if (!customer) {
        throw new Error(`Customer with id ${id} not found`);
      }

      if (!customer.isDeleted) {
        throw new Error(`Customer with id ${id} is not deleted`);
      }

      // Restore using base service
      const restoredCustomer = await this.restoreById(id);
      return restoredCustomer;
    } catch (error) {
      throw new Error(`Failed to restore customer: ${error.message}`);
    }
  }

  /**
   * Find customer by email
   * @param {String} email - Customer email
   * @param {Object} options - Optional options { includeDeleted }
   * @returns {Promise<Object|null>} Customer document or null
   */
  async findByEmail(email, options = {}) {
    try {
      if (!email || typeof email !== 'string') {
        throw new Error('Email must be a valid string');
      }

      const Model = await this.getCachedModel();
      const query = { email: email.toLowerCase().trim() };

      if (!options.includeDeleted) {
        query.isDeleted = false;
      }

      const customer = await Model.findOne(query);
      return customer;
    } catch (error) {
      throw new Error(`Failed to find customer by email: ${error.message}`);
    }
  }

  /**
   * Find customer by phone
   * @param {String} phone - Customer phone number
   * @param {Object} options - Optional options { includeDeleted }
   * @returns {Promise<Object|null>} Customer document or null
   */
  async findByPhone(phone, options = {}) {
    try {
      if (!phone || typeof phone !== 'string') {
        throw new Error('Phone must be a valid string');
      }

      const Model = await this.getCachedModel();
      const query = { phone: phone.replace(/\s+/g, '') };

      if (!options.includeDeleted) {
        query.isDeleted = false;
      }

      const customer = await Model.findOne(query);
      return customer;
    } catch (error) {
      throw new Error(`Failed to find customer by phone: ${error.message}`);
    }
  }

  /**
   * Get all active customers
   * @param {Object} options - Optional options { sort, populate, includeGiftCards, includeLoyaltyPoints }
   * @param {Boolean} options.includeGiftCards - Whether to include assigned gift cards (default: true)
   * @param {Boolean} options.includeLoyaltyPoints - Whether to include loyalty points data (default: true)
   * @returns {Promise<Array>} Array of active customer documents with assigned gift cards and loyalty points
   */
  async getActiveCustomers(options = {}) {
    try {
      const Model = await this.getCachedModel();
      const query = Model.find({
        isActive: true,
        isDeleted: false,
      });

      // Apply sorting
      if (options.sort) {
        query.sort(options.sort);
      } else {
        query.sort({ customerName: 1 });
      }

      // Apply populate
      if (options.populate) {
        query.populate(options.populate);
      }

      const customers = await query.exec();

      // Check if we need to include additional data
      const includeGiftCards = options.includeGiftCards !== false;
      const includeLoyaltyPoints = options.includeLoyaltyPoints !== false;

      if ((includeGiftCards || includeLoyaltyPoints) && customers.length > 0) {
        // Get models for gift cards and loyalty points
        const [GiftCardModel, CustomerLoyaltyPointModel] = await Promise.all([
          includeGiftCards
            ? this.getModel('GiftCard', giftCardSchema, 'giftcards')
            : null,
          includeLoyaltyPoints
            ? this.getModel(
                'CustomerLoyaltyPoint',
                CustomerLoyaltyPointSchema,
                'customerLoyaltyPoints',
              )
            : null,
        ]);

        // Fetch data for all customers in parallel
        const customerPromises = customers.map(async (customer) => {
          const customerObj = customer.toObject
            ? customer.toObject()
            : customer;

          try {
            const [giftCards, loyaltyData] = await Promise.all([
              // Fetch gift cards if requested (exclude deleted)
              includeGiftCards && GiftCardModel
                ? GiftCardModel.find({
                    $or: [
                      { customerScope: 'All' },
                      { assignedCustomerIds: customer._id },
                    ],
                    status: 'Active',
                    validity: { $gt: new Date() },
                    isDeleted: { $ne: true },
                  })
                    .select(
                      'name number value thresholdAmount validity customerScope terms giftCardImage',
                    )
                    .lean()
                : [],
              // Fetch loyalty points summary if requested
              includeLoyaltyPoints && CustomerLoyaltyPointModel
                ? this._getCustomerLoyaltySummary(
                    CustomerLoyaltyPointModel,
                    customer._id,
                  )
                : null,
            ]);

            return {
              ...customerObj,
              assignedGiftCards: giftCards || [],
              loyaltyPoints: loyaltyData,
            };
          } catch (error) {
            // If data fetch fails for a customer, still return the customer with defaults
            return {
              ...customerObj,
              assignedGiftCards: [],
              loyaltyPoints: null,
            };
          }
        });

        return Promise.all(customerPromises);
      }

      return customers;
    } catch (error) {
      throw new Error(`Failed to retrieve active customers: ${error.message}`);
    }
  }

  /**
   * Get loyalty points summary for a customer
   * @param {Model} CustomerLoyaltyPointModel - The model reference
   * @param {ObjectId} customerId - Customer ID
   * @returns {Promise<Object>} Loyalty points summary
   * @private
   */
  async _getCustomerLoyaltySummary(CustomerLoyaltyPointModel, customerId) {
    try {
      // Get points summary using aggregation
      const [summary] = await CustomerLoyaltyPointModel.aggregate([
        {
          $match: {
            customerId: customerId,
            isDeleted: { $ne: true },
          },
        },
        {
          $group: {
            _id: null,
            totalEarned: {
              $sum: {
                $cond: [{ $eq: ['$transactionType', 'accrual'] }, '$points', 0],
              },
            },
            totalRedeemed: {
              $sum: {
                $cond: [
                  { $eq: ['$transactionType', 'redemption'] },
                  { $abs: '$points' },
                  0,
                ],
              },
            },
            totalExpired: {
              $sum: {
                $cond: [{ $eq: ['$status', 'expired'] }, '$remainingPoints', 0],
              },
            },
            currentBalance: { $sum: '$points' },
          },
        },
      ]);

      // Get available points (non-expired, active accruals)
      const [availableResult] = await CustomerLoyaltyPointModel.aggregate([
        {
          $match: {
            customerId: customerId,
            isDeleted: { $ne: true },
            status: 'active',
            transactionType: 'accrual',
            remainingPoints: { $gt: 0 },
            $or: [{ expiryDate: null }, { expiryDate: { $gt: new Date() } }],
          },
        },
        {
          $group: {
            _id: null,
            availablePoints: { $sum: '$remainingPoints' },
          },
        },
      ]);

      return {
        totalEarned: summary?.totalEarned || 0,
        totalRedeemed: summary?.totalRedeemed || 0,
        totalExpired: summary?.totalExpired || 0,
        currentBalance: summary?.currentBalance || 0,
        availablePoints: availableResult?.availablePoints || 0,
      };
    } catch (error) {
      return {
        totalEarned: 0,
        totalRedeemed: 0,
        totalExpired: 0,
        currentBalance: 0,
        availablePoints: 0,
      };
    }
  }

  /**
   * Get customers by status
   * @param {Boolean} isActive - Customer status (true for active, false for inactive)
   * @param {Object} options - Optional options { sort, populate }
   * @returns {Promise<Array>} Array of customer documents
   */
  async getCustomersByStatus(isActive, options = {}) {
    try {
      if (typeof isActive !== 'boolean') {
        throw new Error('isActive must be a boolean value');
      }

      const Model = await this.getCachedModel();
      const query = Model.find({
        isActive,
        isDeleted: false,
      });

      // Apply sorting
      if (options.sort) {
        query.sort(options.sort);
      } else {
        query.sort({ customerName: 1 });
      }

      // Apply populate
      if (options.populate) {
        query.populate(options.populate);
      }

      const customers = await query.exec();
      return customers;
    } catch (error) {
      throw new Error(
        `Failed to retrieve customers by status: ${error.message}`,
      );
    }
  }

  /**
   * Get customers by gender
   * @param {String} gender - Customer gender (Male, Female, Other)
   * @param {Object} options - Optional options { sort, populate }
   * @returns {Promise<Array>} Array of customer documents
   */
  async getCustomersByGender(gender, options = {}) {
    try {
      if (!['Male', 'Female', 'Other'].includes(gender)) {
        throw new Error('Gender must be one of: Male, Female, Other');
      }

      const Model = await this.getCachedModel();
      const query = Model.find({
        gender,
        isDeleted: false,
      });

      // Apply sorting
      if (options.sort) {
        query.sort(options.sort);
      } else {
        query.sort({ customerName: 1 });
      }

      // Apply populate
      if (options.populate) {
        query.populate(options.populate);
      }

      const customers = await query.exec();
      return customers;
    } catch (error) {
      throw new Error(
        `Failed to retrieve customers by gender: ${error.message}`,
      );
    }
  }

  /**
   * Get customers by location
   * @param {String} city - City name
   * @param {String} state - State name
   * @param {Object} options - Optional options { sort, populate }
   * @returns {Promise<Array>} Array of customer documents
   */
  async getCustomersByLocation(city, state, options = {}) {
    try {
      if (!city || !state) {
        throw new Error('City and state are required');
      }

      const Model = await this.getCachedModel();
      const query = Model.find({
        'address.city': new RegExp(city, 'i'),
        'address.state': new RegExp(state, 'i'),
        isDeleted: false,
      });

      // Apply sorting
      if (options.sort) {
        query.sort(options.sort);
      } else {
        query.sort({ customerName: 1 });
      }

      // Apply populate
      if (options.populate) {
        query.populate(options.populate);
      }

      const customers = await query.exec();
      return customers;
    } catch (error) {
      throw new Error(
        `Failed to retrieve customers by location: ${error.message}`,
      );
    }
  }

  /**
   * Search customers using text search
   * @param {String} searchTerm - Search term
   * @param {Object} options - Optional options { limit, populate }
   * @returns {Promise<Array>} Array of customer documents
   */
  async searchCustomers(searchTerm, options = {}) {
    try {
      if (!searchTerm || typeof searchTerm !== 'string') {
        throw new Error('Search term must be a valid string');
      }

      const Model = await this.getCachedModel();

      // Use text search if available, otherwise fallback to regex search
      const query = {
        isDeleted: false,
        $text: { $search: searchTerm },
      };

      let searchQuery = Model.find(query, { score: { $meta: 'textScore' } })
        .sort({ score: { $meta: 'textScore' } })
        .where({ isDeleted: false });

      // Apply limit if specified
      if (options.limit) {
        searchQuery = searchQuery.limit(parseInt(options.limit));
      }

      // Apply populate
      if (options.populate) {
        searchQuery = searchQuery.populate(options.populate);
      }

      const customers = await searchQuery.exec();
      return customers;
    } catch (error) {
      // Fallback to regex search if text search fails
      return this._fallbackSearch(searchTerm, options);
    }
  }

  /**
   * Fallback search using regex when text search is not available
   * @private
   * @param {String} searchTerm - Search term
   * @param {Object} options - Optional options
   * @returns {Promise<Array>} Array of customer documents
   */
  async _fallbackSearch(searchTerm, options = {}) {
    try {
      const Model = await this.getCachedModel();
      const regex = new RegExp(searchTerm, 'i');

      const query = Model.find({
        isDeleted: false,
        $or: [
          { customerName: regex },
          { email: regex },
          { phone: regex },
          { 'address.city': regex },
          { 'address.state': regex },
        ],
      });

      // Apply sorting
      query.sort({ customerName: 1 });

      // Apply limit if specified
      if (options.limit) {
        query.limit(parseInt(options.limit));
      }

      // Apply populate
      if (options.populate) {
        query.populate(options.populate);
      }

      const customers = await query.exec();
      return customers;
    } catch (error) {
      throw new Error(`Failed to search customers: ${error.message}`);
    }
  }

  /**
   * List customers with pagination, filtering, and search
   * @param {Object} queryParams - Query parameters
   * @param {Number} queryParams.page - Page number (default: 1)
   * @param {Number} queryParams.limit - Items per page (default: 10)
   * @param {String} queryParams.search - Search term
   * @param {Boolean|String} queryParams.all - If true, fetch all records without pagination
   * @param {Boolean|String} queryParams.isActive - Filter by status (true/false)
   * @param {String} queryParams.gender - Filter by gender
   * @param {String} queryParams.city - Filter by city
   * @param {String} queryParams.state - Filter by state
   * @param {String} queryParams.sortBy - Field to sort by (default: 'createdAt')
   * @param {String} queryParams.sortOrder - Sort order 'asc' or 'desc' (default: 'desc')
   * @param {String|Object} queryParams.populate - Populate fields
   * @returns {Promise<Object>} Paginated results with data and pagination info
   */
  async listCustomers(queryParams = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        search = '',
        all,
        isActive,
        gender,
        city,
        state,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        populate = null,
        ...rest
      } = queryParams;

      const fetchAll = all === 'true' || all === true;

      // Build filter object
      const filters = {
        isDeleted: false,
        ...rest,
      };

      // Apply status filter
      if (isActive !== undefined) {
        filters.isActive =
          typeof isActive === 'string'
            ? isActive.toLowerCase() === 'true'
            : Boolean(isActive);
      }

      // Apply gender filter
      if (gender) {
        if (!['Male', 'Female', 'Other'].includes(gender)) {
          throw new Error('Gender must be one of: Male, Female, Other');
        }
        filters.gender = gender;
      }

      // Apply location filters
      if (city) {
        filters['address.city'] = new RegExp(city, 'i');
      }
      if (state) {
        filters['address.state'] = new RegExp(state, 'i');
      }

      // Check if non-paginated mode is requested
      if (fetchAll) {
        // Non-paginated mode: return all data with filters and search
        const Model = await this.getCachedModel();

        // Build filter object for search
        const filter = { ...filters };

        // Add search functionality
        if (search) {
          filter.$or = [
            { customerName: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
            { phone: { $regex: search, $options: 'i' } },
          ];
        }

        // Build sort object
        const sort = {};
        sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

        // Build query
        let query = Model.find(filter).sort(sort);

        // Apply populate if specified
        if (populate) {
          query = query.populate(populate);
        }

        const customers = await query.exec();

        return {
          data: customers,
          total: customers.length,
        };
      }

      // Paginated mode: use base service list method with search fields
      return await super.list({
        page,
        limit,
        search,
        searchFields: ['customerName', 'email', 'phone'],
        sortBy,
        sortOrder,
        filters,
        populate,
      });
    } catch (error) {
      throw new Error(`Failed to list customers: ${error.message}`);
    }
  }

  /**
   * Bulk update customer status
   * @param {Array<String>} ids - Array of customer IDs
   * @param {Boolean} isActive - Status value to set
   * @param {String} updatedBy - User ID who updated the customers
   * @param {Object} options - Optional options { session }
   * @returns {Promise<Object>} Result summary with matchedCount and modifiedCount
   */
  async bulkUpdateStatus(ids = [], isActive, updatedBy, options = {}) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('ids must be a non-empty array');
      }
      if (typeof isActive !== 'boolean') {
        throw new Error('isActive must be a boolean');
      }
      if (!updatedBy) {
        throw new Error('updatedBy is required');
      }

      // Validate all IDs
      for (const id of ids) {
        this.validateObjectId(id);
      }
      this.validateObjectId(updatedBy);

      const Model = await this.getCachedModel();
      const update = {
        $set: {
          isActive,
          updatedBy,
          updatedAt: new Date(),
        },
      };
      const filter = {
        _id: { $in: ids },
        isDeleted: false,
      };

      const result = await Model.updateMany(filter, update, {
        session: options.session || undefined,
        runValidators: true,
      });

      return {
        matchedCount: result.matchedCount || 0,
        modifiedCount: result.modifiedCount || 0,
      };
    } catch (error) {
      throw new Error(
        `Failed to bulk update customer status: ${error.message}`,
      );
    }
  }

  /**
   * Bulk soft delete customers
   * @param {Array<String>} ids - Array of customer IDs
   * @param {Object} options - Optional options { session }
   * @returns {Promise<Object>} Result summary with deletedCount
   */
  async bulkSoftDelete(ids = [], options = {}) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('ids must be a non-empty array');
      }

      // Validate all IDs
      for (const id of ids) {
        this.validateObjectId(id);
      }

      const Model = await this.getCachedModel();
      const update = {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
        },
      };
      const filter = {
        _id: { $in: ids },
        isDeleted: false,
      };

      const result = await Model.updateMany(filter, update, {
        session: options.session || undefined,
      });

      return {
        matchedCount: result.matchedCount || 0,
        modifiedCount: result.modifiedCount || 0,
      };
    } catch (error) {
      throw new Error(`Failed to bulk soft delete customers: ${error.message}`);
    }
  }

  /**
   * Get customer count by status
   * @param {Boolean} isActive - Customer status (optional)
   * @returns {Promise<Number>} Count of customers
   */
  async getCustomerCount(isActive = null) {
    try {
      const Model = await this.getCachedModel();
      const query = { isDeleted: false };

      if (isActive !== null) {
        query.isActive = isActive;
      }

      const count = await Model.countDocuments(query);
      return count;
    } catch (error) {
      throw new Error(`Failed to get customer count: ${error.message}`);
    }
  }

  /**
   * Check if customer exists
   * @param {String} id - Customer ID
   * @returns {Promise<Boolean>} True if customer exists and is not deleted
   */
  async customerExists(id) {
    try {
      this.validateObjectId(id);

      const Model = await this.getCachedModel();
      const count = await Model.countDocuments({
        _id: id,
        isDeleted: false,
      });
      return count > 0;
    } catch (error) {
      throw new Error(`Failed to check customer existence: ${error.message}`);
    }
  }

  /**
   * Get customer statistics
   * @returns {Promise<Object>} Customer statistics
   */
  async getCustomerStatistics() {
    try {
      const Model = await this.getCachedModel();

      const [
        totalCustomers,
        activeCustomers,
        inactiveCustomers,
        maleCustomers,
        femaleCustomers,
        otherGenderCustomers,
      ] = await Promise.all([
        Model.countDocuments({ isDeleted: false }),
        Model.countDocuments({ isActive: true, isDeleted: false }),
        Model.countDocuments({ isActive: false, isDeleted: false }),
        Model.countDocuments({ gender: 'Male', isDeleted: false }),
        Model.countDocuments({ gender: 'Female', isDeleted: false }),
        Model.countDocuments({ gender: 'Other', isDeleted: false }),
      ]);

      return {
        total: totalCustomers,
        active: activeCustomers,
        inactive: inactiveCustomers,
        byGender: {
          male: maleCustomers,
          female: femaleCustomers,
          other: otherGenderCustomers,
        },
      };
    } catch (error) {
      throw new Error(`Failed to get customer statistics: ${error.message}`);
    }
  }

  /**
   * Bulk get customers by IDs
   * @param {Array<String>} ids - Array of customer IDs
   * @param {Object} options - Optional options { populate, lean, throwOnNotFound }
   * @returns {Promise<Object>} Result with documents, found, notFound, and totalRequested
   */
  async bulkGetCustomers(ids, options = {}) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('Customer IDs array is required and must not be empty');
      }

      const normalizedIds = ids.map((id) => {
        const normalized =
          typeof id === 'string' ? id.trim() : id?.toString?.();
        if (!normalized) {
          throw new Error('Invalid customer ID format');
        }
        this.validateObjectId(normalized);
        return normalized;
      });

      const { populate = null, lean = true, throwOnNotFound = false } = options;

      const result = await this.bulkGetByIds(normalizedIds, {
        populate,
        lean,
        throwOnNotFound,
      });

      return {
        data: result.documents,
        found: result.found,
        notFound: result.notFound,
        totalRequested: result.totalRequested,
      };
    } catch (error) {
      throw new Error(`Failed to bulk get customers: ${error.message}`);
    }
  }
}

export default CustomerService;
