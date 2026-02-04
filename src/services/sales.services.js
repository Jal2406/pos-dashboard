import {
  StockSchema,
  ProductCategorySchema,
  SubCategorySchema,
  UnitSchema,
  SalesSchema,
  tenantTaxSchema as TenantTaxSchema,
  ProductSchema,
  StockBatchSchema,
  User as GlobalUserModel,
  CustomerSchema,
  StoreSchema,
} from '../models/index.js';
import { BaseService } from '../utils/index.js';
import {
  TenantCouponServices,
  LoyaltyPointServices,
  StockBatchServices,
  CustomerLoyaltyPointService,
  LoyaltyRedemptionRuleServices,
  GiftCardService,
} from './index.js';
/**
 * @class SalesService
 * @extends BaseService
 */
class SalesService extends BaseService {
  /**
   * Initialize Sales Service with tenant-specific database support
   * @param {String} businessId - Business/tenant ID for multi-tenant isolation
   * @param {Object} options - Optional configuration
   */
  constructor(businessId, options = {}) {
    if (!businessId) {
      throw new Error('SalesService initialized without businessId');
    }
    super({
      modelName: 'Sales',
      schema: SalesSchema,
      collection: 'sales',
      businessId,
    });

    // RBAC: Allow cashiers to create sales (their primary function)
    // Store scoping still enforced via store field validation
    this.rbacConfig.allowCashierCreate = true;
    this.rbacConfig.storeScoped = true;
    this.rbacConfig.storeIdField = 'store'; // Sales use 'store' field, not 'storeId'

    // Cache the model reference to avoid repeated resolution
    this._modelRef = null;
    this.tenantCouponService = businessId
      ? new TenantCouponServices(businessId)
      : null;
    this.loyaltyPointService = businessId
      ? new LoyaltyPointServices(businessId)
      : null;
    this.stockBatchService = businessId
      ? new StockBatchServices(businessId)
      : null;
    this.customerLoyaltyPointService = businessId
      ? new CustomerLoyaltyPointService(businessId)
      : null;
    this.loyaltyRedemptionRuleService = businessId
      ? new LoyaltyRedemptionRuleServices(businessId)
      : null;
    this.giftCardService = businessId
      ? new GiftCardService(businessId)
      : null;
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
   * Calculate payment status based on billing summary
   * @param {Object} billingSummary - Billing summary object
   * @returns {String} Payment status ('completed' or 'pending')
   */
  calculatePaymentStatus(billingSummary) {
    if (!billingSummary) {
      return 'pending';
    }

    const { amountPaid = 0, grandTotal = 0 } = billingSummary;
    return amountPaid >= grandTotal ? 'completed' : 'pending';
  }

  /**
   * Create customer snapshot for walk-in customers
   * @param {Object} storeData - Store data for default snapshot
   * @returns {Object} Customer snapshot
   */
  createWalkInCustomerSnapshot(storeData = {}) {
    return {
      customerCode: 'WALK-IN',
      customerName: 'Walk-in Customer',
      phone: '',
      email: '',
    };
  }

  /**
   * Fetch and create customer snapshot
   * @param {String} customerId - Customer ID
   * @returns {Promise<Object>} Customer snapshot
   */
  async createCustomerSnapshot(customerId) {
    try {
      // Get Customer model from tenant database
      const customerModelFactory = await this.getModel(
        'Customer',
        null,
        'customers',
      );
      const customer = await customerModelFactory.findById(customerId).lean();

      if (!customer) {
        throw new Error(`Customer with id ${customerId} not found`);
      }

      return {
        customerCode: customer.customerCode || '',
        customerName: customer.customerName || '',
        phone: customer.phone || '',
        email: customer.email || '',
      };
    } catch (error) {
      throw new Error(`Failed to create customer snapshot: ${error.message}`);
    }
  }

  /**
   * Fetch and create store snapshot
   * @param {String} storeId - Store ID
   * @returns {Promise<Object>} Store snapshot
   */
  async createStoreSnapshot(storeId) {
    try {
      // Get Store model from tenant database
      const storeModelFactory = await this.getModel('Store', null, 'stores');
      const store = await storeModelFactory.findById(storeId).lean();

      if (!store) {
        throw new Error(`Store with id ${storeId} not found`);
      }

      return {
        name: store.storeName || store.name || '',
        location: {
          address: store.address?.street || store.address?.address || '',
          city: store.address?.city || '',
          state: store.address?.state || '',
          country: store.address?.country || '',
        },
      };
    } catch (error) {
      throw new Error(`Failed to create store snapshot: ${error.message}`);
    }
  }

  /**
   * Create user audit snapshot
   * @param {String} userId - User ID
   * @returns {Promise<Object>} User snapshot { userId, name, email, roleId }
   */
  async _createAuditSnapshot(userId) {
    try {
      if (!userId) return null;
      const UserModel = await this.getModel('User', null, 'users');
      const user = await UserModel.findById(userId).lean();

      if (!user) return null;

      return {
        userId: user._id,
        name: user.name || '',
        email: user.email || '',
        roleId: user.roleId,
      };
    } catch (error) {
      console.error(`Failed to create audit snapshot: ${error.message}`);
      return null;
    }
  }

  /**
   * Enrich products with static snapshots of referenced data (categories, units, taxes, etc.)
   * @param {Array} products - products array to enrich
   */
  async _enrichProductsWithSnapshots(products = []) {
    if (!Array.isArray(products) || products.length === 0) return;

    const categoryIds = new Set();
    const subCategoryIds = new Set();
    const unitIds = new Set();
    const taxIds = new Set();

    for (const item of products) {
      if (item.category) categoryIds.add(item.category.toString());
      if (item.subCategory) subCategoryIds.add(item.subCategory.toString());
      if (item.unit) unitIds.add(item.unit.toString());

      // Collect all tax IDs from various sources (support multiple taxes)
      // Prioritize tenantTaxes array (new format)
      if (Array.isArray(item.tenantTaxes)) {
        item.tenantTaxes.forEach((t) => {
          if (t) taxIds.add(t.toString());
        });
      }
      // Also check legacy tenantTax field
      if (item.tenantTax) {
        if (Array.isArray(item.tenantTax)) {
          item.tenantTax.forEach((t) => {
            if (t) taxIds.add(t.toString());
          });
        } else {
          taxIds.add(item.tenantTax.toString());
        }
      }
      // Also check legacy tax field from payload
      if (item.tax) {
        if (Array.isArray(item.tax)) {
          item.tax.forEach((t) => {
            if (t) taxIds.add(t.toString());
          });
        } else {
          taxIds.add(item.tax.toString());
        }
      }
    }

    const categoryMap = new Map();
    const subCategoryMap = new Map();
    const unitMap = new Map();
    const taxMap = new Map();

    // Fetch Categories
    if (categoryIds.size > 0) {
      try {
        const CatModel = await this.getModel(
          'ProductCategory',
          ProductCategorySchema,
          'productcategories',
        );
        const cats = await CatModel.find({
          _id: { $in: [...categoryIds] },
        }).lean();
        for (const cat of cats) {
          categoryMap.set(cat._id.toString(), cat.categoryName);
        }
      } catch (e) {
        console.error('Failed to fetch categories for snapshot', e);
      }
    }

    // Fetch SubCategories
    if (subCategoryIds.size > 0) {
      try {
        const SubCatModel = await this.getModel(
          'SubCategory',
          SubCategorySchema,
          'subcategories',
        );
        const subs = await SubCatModel.find({
          _id: { $in: [...subCategoryIds] },
        }).lean();
        for (const sub of subs) {
          subCategoryMap.set(sub._id.toString(), sub.subcategory);
        }
      } catch (e) {
        console.error('Failed to fetch subcategories for snapshot', e);
      }
    }

    // Fetch Units
    if (unitIds.size > 0) {
      try {
        const UnitModel = await this.getModel('Unit', UnitSchema, 'units');
        const units = await UnitModel.find({
          _id: { $in: [...unitIds] },
        }).lean();
        for (const u of units) {
          unitMap.set(u._id.toString(), u);
        }
      } catch (e) {
        console.error('Failed to fetch units for snapshot', e);
      }
    }

    // Fetch Taxes
    if (taxIds.size > 0) {
      try {
        const TaxModel = await this.getModel(
          'TenantTax',
          TenantTaxSchema,
          'taxes',
        );
        const taxes = await TaxModel.find({
          _id: { $in: [...taxIds] },
        }).lean();
        for (const t of taxes) {
          taxMap.set(t._id.toString(), t);
        }
      } catch (e) {
        console.error('Failed to fetch taxes for snapshot', e);
      }
    }

    // Apply snapshots
    for (const item of products) {
      // Category Snapshot
      if (item.category && categoryMap.has(item.category.toString())) {
        item.categoryName = categoryMap.get(item.category.toString());
      }
      // SubCategory Snapshot
      if (item.subCategory && subCategoryMap.has(item.subCategory.toString())) {
        item.subCategoryName = subCategoryMap.get(item.subCategory.toString());
      }
      // Unit Snapshot
      if (item.unit && unitMap.has(item.unit.toString())) {
        const u = unitMap.get(item.unit.toString());
        item.unitSnapshot = {
          unitId: u._id,
          unit: u.unit,
          shortName: u.shortName,
          value: u.value,
        };
      }
      // Tax Snapshot - Skip if already calculated by calculateBillingSummary
      // Only process if taxSnapshots doesn't exist yet (for backward compatibility)
      if (!item.taxSnapshots || item.taxSnapshots.length === 0) {
        // Collect all tax IDs from various sources
        const itemTaxIds = new Set();

        if (Array.isArray(item.tenantTaxes)) {
          item.tenantTaxes.forEach(t => {
            if (t) itemTaxIds.add(t.toString());
          });
        }
        if (item.tenantTax) {
          if (Array.isArray(item.tenantTax)) {
            item.tenantTax.forEach(t => {
              if (t) itemTaxIds.add(t.toString());
            });
          } else {
            itemTaxIds.add(item.tenantTax.toString());
          }
        }
        if (item.tax) {
          if (Array.isArray(item.tax)) {
            item.tax.forEach(t => {
              if (t) itemTaxIds.add(t.toString());
            });
          } else {
            itemTaxIds.add(item.tax.toString());
          }
          delete item.tax;
        }

        // Resolve tax IDs to tax objects
        const applicableTaxes = [];
        for (const taxIdStr of itemTaxIds) {
          if (taxMap.has(taxIdStr)) {
            applicableTaxes.push(taxMap.get(taxIdStr));
          }
        }

        if (applicableTaxes.length > 0) {
          // Update tenantTaxes array
          item.tenantTaxes = applicableTaxes.map(t => t._id);
          // Set legacy tenantTax for backward compatibility
          item.tenantTax = applicableTaxes[0]._id;

          // Create taxSnapshots array (new format)
          item.taxSnapshots = applicableTaxes.map(t => ({
            taxId: t._id,
            taxName: t.taxName,
            percentage: t.valueType === 'Percentage' ? this._toNumber(t.value) : 0,
            fixedAmount: t.valueType === 'Fixed' ? this._toNumber(t.value) : 0,
            taxType: t.taxType,
            valueType: t.valueType,
            calculatedAmount: 0, // Will be calculated during billing
          }));

          // Also create legacy taxSnapshot for backward compatibility
          if (applicableTaxes.length === 1) {
            const t = applicableTaxes[0];
            item.taxSnapshot = {
              taxName: t.taxName,
              percentage: t.valueType === 'Percentage' ? t.value : 0,
              amount: t.valueType === 'Fixed' ? t.value : 0,
              taxType: t.taxType,
              valueType: t.valueType,
            };
          } else {
            // Multiple taxes - create combined snapshot
            const inclusiveTaxes = applicableTaxes.filter(t => t.taxType === 'Inclusive');
            const exclusiveTaxes = applicableTaxes.filter(t => t.taxType === 'Exclusive');

            const taxNames = [];
            if (inclusiveTaxes.length > 0) {
              taxNames.push(inclusiveTaxes.map(t => t.taxName).join(' + ') + ' (Incl)');
            }
            if (exclusiveTaxes.length > 0) {
              taxNames.push(exclusiveTaxes.map(t => t.taxName).join(' + ') + ' (Excl)');
            }

            item.taxSnapshot = {
              taxName: taxNames.join(', '),
              percentage: applicableTaxes
                .filter((t) => t.valueType === 'Percentage')
                .reduce((sum, t) => sum + t.value, 0),
              amount: applicableTaxes
                .filter((t) => t.valueType === 'Fixed')
                .reduce((sum, t) => sum + t.value, 0),
              taxType: inclusiveTaxes.length > 0 && exclusiveTaxes.length > 0
                ? 'Mixed'
                : (inclusiveTaxes.length > 0 ? 'Inclusive' : 'Exclusive'),
              valueType: applicableTaxes[0].valueType,
            };
          }
        }
      }
    }
  }

  /**
   * Normalize numeric input
   * @param {Number|String} value - Any numeric-like input
   * @param {Number|null} precision - Decimal precision, null to skip rounding
   * @returns {Number} Normalized number
   */
  _toNumber(value = 0, precision = 2) {
    const numeric = Number(value ?? 0);
    const safeNumber = Number.isFinite(numeric) ? numeric : 0;

    if (precision === null) {
      return safeNumber;
    }

    if (typeof precision === 'number') {
      return Number(safeNumber.toFixed(precision));
    }

    return safeNumber;
  }

  /**
   * Calculate tax amount based on tax type (Inclusive/Exclusive) and value type (Percentage/Fixed)
   * 
   * Standard Tax Calculation:
   * - EXCLUSIVE TAX: Tax is added ON TOP of the base price
   *   Formula: taxAmount = basePrice * (percentage / 100) OR taxAmount = fixedAmount
   *   Total = basePrice + taxAmount
   * 
   * - INCLUSIVE TAX: Tax is already INCLUDED in the price
   *   Formula: basePrice = totalPrice / (1 + percentage/100), taxAmount = totalPrice - basePrice
   *   OR for fixed: taxAmount = fixedAmount, basePrice = totalPrice - fixedAmount
   * 
   * @param {Number} amount - The amount to calculate tax on
   * @param {Object} tax - Tax configuration object with taxType, valueType, value
   * @returns {Object} { taxAmount, baseAmount, totalAmount }
   */
  calculateTaxAmount(amount, tax) {
    if (!tax || !amount) {
      return {
        taxAmount: 0,
        baseAmount: this._toNumber(amount),
        totalAmount: this._toNumber(amount),
      };
    }

    const { taxType, valueType, value } = tax;
    const taxValue = this._toNumber(value);
    const inputAmount = this._toNumber(amount);

    let taxAmount = 0;
    let baseAmount = inputAmount;
    let totalAmount = inputAmount;

    if (taxType === 'Exclusive') {
      // EXCLUSIVE: Tax is added on top of the base price
      // Input amount IS the base price
      baseAmount = inputAmount;

      if (valueType === 'Percentage') {
        // Tax = Base × (Rate / 100)
        taxAmount = this._toNumber(baseAmount * (taxValue / 100));
      } else if (valueType === 'Fixed') {
        // Tax = Fixed amount
        taxAmount = taxValue;
      }

      // Total = Base + Tax
      totalAmount = this._toNumber(baseAmount + taxAmount);
    } else if (taxType === 'Inclusive') {
      // INCLUSIVE: Tax is already included in the price
      // Input amount IS the total price (includes tax)
      totalAmount = inputAmount;

      if (valueType === 'Percentage') {
        // Base = Total / (1 + Rate/100)
        // Tax = Total - Base
        baseAmount = this._toNumber(totalAmount / (1 + taxValue / 100));
        taxAmount = this._toNumber(totalAmount - baseAmount);
      } else if (valueType === 'Fixed') {
        // Tax = Fixed amount
        // Base = Total - Fixed
        taxAmount = taxValue;
        baseAmount = this._toNumber(totalAmount - taxAmount);
      }
    }

    return {
      taxAmount: Math.max(taxAmount, 0),
      baseAmount: Math.max(baseAmount, 0),
      totalAmount: Math.max(totalAmount, 0),
    };
  }

  /**
   * Calculate tax for multiple taxes on a single amount
   * Handles array of taxes and returns combined tax calculation
   * 
   * @param {Number} amount - The amount to calculate tax on
   * @param {Array} taxes - Array of tax objects
   * @param {String} calculationMode - 'sequential' (compound) or 'parallel' (simple addition)
   * @returns {Object} { taxAmount, baseAmount, totalAmount, taxBreakdown }
   */
  calculateMultipleTaxes(amount, taxes = [], calculationMode = 'parallel') {
    if (!Array.isArray(taxes) || taxes.length === 0) {
      return {
        taxAmount: 0,
        baseAmount: this._toNumber(amount),
        totalAmount: this._toNumber(amount),
        taxBreakdown: [],
      };
    }

    const inputAmount = this._toNumber(amount);
    const taxBreakdown = [];
    let totalTaxAmount = 0;

    if (calculationMode === 'parallel') {
      // Parallel: All taxes calculated on the same base amount
      // Common for multiple tax rates on same item (e.g., CGST + SGST in India)
      for (const tax of taxes) {
        const result = this.calculateTaxAmount(inputAmount, tax);
        taxBreakdown.push({
          taxId: tax._id,
          taxName: tax.taxName,
          taxType: tax.taxType,
          valueType: tax.valueType,
          value: tax.value,
          calculatedTax: result.taxAmount,
        });
        totalTaxAmount += result.taxAmount;
      }

      // For inclusive taxes in parallel mode, we need to recalculate
      // Check if all taxes are inclusive
      const allInclusive = taxes.every((t) => t.taxType === 'Inclusive');
      const allExclusive = taxes.every((t) => t.taxType === 'Exclusive');

      if (allInclusive) {
        // For parallel inclusive taxes, calculate combined rate first
        const totalPercentage = taxes
          .filter((t) => t.valueType === 'Percentage')
          .reduce((sum, t) => sum + this._toNumber(t.value), 0);
        const totalFixed = taxes
          .filter((t) => t.valueType === 'Fixed')
          .reduce((sum, t) => sum + this._toNumber(t.value), 0);

        const baseFromPercentage =
          totalPercentage > 0
            ? this._toNumber(inputAmount / (1 + totalPercentage / 100))
            : inputAmount;
        const taxFromPercentage = inputAmount - baseFromPercentage;

        return {
          taxAmount: this._toNumber(taxFromPercentage + totalFixed),
          baseAmount: this._toNumber(baseFromPercentage - totalFixed),
          totalAmount: inputAmount,
          taxBreakdown,
        };
      } else if (allExclusive) {
        return {
          taxAmount: this._toNumber(totalTaxAmount),
          baseAmount: inputAmount,
          totalAmount: this._toNumber(inputAmount + totalTaxAmount),
          taxBreakdown,
        };
      }
    }

    // Mixed or sequential: Calculate tax on running total
    let runningAmount = inputAmount;
    for (const tax of taxes) {
      const result = this.calculateTaxAmount(runningAmount, tax);
      taxBreakdown.push({
        taxId: tax._id,
        taxName: tax.taxName,
        taxType: tax.taxType,
        valueType: tax.valueType,
        value: tax.value,
        calculatedTax: result.taxAmount,
      });
      totalTaxAmount += result.taxAmount;
      if (tax.taxType === 'Exclusive') {
        runningAmount = result.totalAmount;
      }
    }

    // Determine final base and total
    const firstTax = taxes[0];
    const baseResult = this.calculateTaxAmount(inputAmount, firstTax);

    return {
      taxAmount: this._toNumber(totalTaxAmount),
      baseAmount: baseResult.baseAmount,
      totalAmount: this._toNumber(inputAmount + totalTaxAmount),
      taxBreakdown,
    };
  }

  /**
   * Server-side billing calculation
   * Fetches tax details from DB and calculates all amounts correctly
   * Handles: Inclusive/Exclusive taxes, discounts, coupons, loyalty points, gift cards
   * 
   * NEW ORDER OF CALCULATION (Discounts before taxes):
   * 1. Calculate line item totals (quantity × price, may include inclusive tax)
   * 2. Apply line item discounts
   * 3. Apply coupon discount (to discounted selling price)
   * 4. Recalculate inclusive taxes from discounted price (reverse calculation)
   * 5. Calculate exclusive taxes on discounted selling price (not on net-of-inclusive base)
   * 6. Apply rounding adjustment
   * 7. Loyalty points and gift cards are applied as payment instruments (handled separately, don't affect tax)
   * 
   * @param {Object} data - Sale payload with products
   * @returns {Promise<Object>} Calculated billing summary and updated products
   */
  async calculateBillingSummary(data) {
    if (!data || !Array.isArray(data.products) || data.products.length === 0) {
      throw new Error('Products array is required for billing calculation');
    }

    // Step 1: Collect all tax IDs from products (support multiple taxes per product)
    const taxIds = new Set();
    for (const item of data.products) {
      // Prioritize tenantTaxes array (new format)
      const taxArray = item.tenantTaxes || [];
      for (const taxId of taxArray) {
        if (taxId) taxIds.add(taxId.toString());
      }

      // Also check legacy tenantTax field
      if (item.tenantTax) {
        if (Array.isArray(item.tenantTax)) {
          item.tenantTax.forEach((t) => {
            if (t) taxIds.add(t.toString());
          });
        } else {
          taxIds.add(item.tenantTax.toString());
        }
      }

      // Also check legacy tax field
      if (item.tax) {
        if (Array.isArray(item.tax)) {
          item.tax.forEach((t) => {
            if (t) taxIds.add(t.toString());
          });
        } else {
          taxIds.add(item.tax.toString());
        }
      }
    }

    // Step 2: Fetch all taxes from database
    const taxMap = new Map();
    if (taxIds.size > 0) {
      try {
        const TaxModel = await this.getModel(
          'TenantTax',
          TenantTaxSchema,
          'taxes',
        );
        const taxes = await TaxModel.find({
          _id: { $in: [...taxIds] },
        }).lean();
        for (const t of taxes) {
          taxMap.set(t._id.toString(), t);
        }
      } catch (e) {
        console.error('Failed to fetch taxes for billing calculation', e);
      }
    }

    // Step 3: Calculate line items - get listed prices (may include inclusive tax)
    // Store original prices and tax info for later recalculation
    const lineItemData = [];
    let subTotalBeforeDiscounts = 0; // Sum of listed prices (selling price × quantity)
    let productDiscountTotal = 0; // Total product/variant discount (percentage-based)
    let lineItemDiscountTotal = 0; // Total line item discounts (fixed amounts)

    for (const item of data.products) {
      const quantity = this._toNumber(item.quantity || 1);
      // sellingPrice: Use item.sellingPrice, fallback to unitPrice, then price
      const sellingPrice = this._toNumber(item.sellingPrice || item.unitPrice || item.price || 0);

      // Calculate gross line amount (selling price × quantity)
      const grossLineAmount = this._toNumber(quantity * sellingPrice);

      // Apply PRODUCT/VARIANT DISCOUNT (percentage-based from Product model)
      // This discount is defined at the product or variant level (e.g., 10% off)
      const productDiscountPercent = this._toNumber(item.productDiscountPercent || 0);
      const productDiscountAmount = productDiscountPercent > 0
        ? this._toNumber(grossLineAmount * (productDiscountPercent / 100))
        : 0;

      // Price after product discount
      const priceAfterProductDiscount = this._toNumber(Math.max(0, grossLineAmount - productDiscountAmount));

      // Apply LINE ITEM DISCOUNT (fixed amount, if any additional discount is applied at sale time)
      const lineItemDiscount = this._toNumber(item.discountAmount || 0);

      // Final discounted line amount (after both product discount and line item discount)
      const discountedLineAmount = this._toNumber(Math.max(0, priceAfterProductDiscount - lineItemDiscount));

      // Total discount for this line = product discount + line item discount
      const totalLineDiscount = this._toNumber(productDiscountAmount + lineItemDiscount);

      // Get applicable taxes for this item (support multiple taxes)
      const applicableTaxes = [];

      // Collect all tax IDs from various sources
      const itemTaxIds = new Set();

      // Prioritize tenantTaxes array (new format)
      if (Array.isArray(item.tenantTaxes)) {
        item.tenantTaxes.forEach(t => {
          if (t) itemTaxIds.add(t.toString());
        });
      }

      // Also check legacy tenantTax field
      if (item.tenantTax) {
        if (Array.isArray(item.tenantTax)) {
          item.tenantTax.forEach(t => {
            if (t) itemTaxIds.add(t.toString());
          });
        } else {
          itemTaxIds.add(item.tenantTax.toString());
        }
      }

      // Also check legacy tax field
      if (item.tax) {
        if (Array.isArray(item.tax)) {
          item.tax.forEach(t => {
            if (t) itemTaxIds.add(t.toString());
          });
        } else {
          itemTaxIds.add(item.tax.toString());
        }
        delete item.tax; // Remove legacy field
      }

      // Resolve tax IDs to tax objects
      for (const taxIdStr of itemTaxIds) {
        if (taxMap.has(taxIdStr)) {
          applicableTaxes.push(taxMap.get(taxIdStr));
        }
      }

      // Update item with resolved tax IDs
      item.tenantTaxes = applicableTaxes.map(t => t._id);
      // Set legacy tenantTax to first tax for backward compatibility
      if (applicableTaxes.length > 0) {
        item.tenantTax = applicableTaxes[0]._id;
      }

      // Store line item data for tax calculation after discounts
      lineItemData.push({
        item,
        sellingPrice,
        grossLineAmount,
        productDiscountPercent,
        productDiscountAmount,
        lineItemDiscount,
        discountedLineAmount,
        totalLineDiscount,
        applicableTaxes,
      });

      subTotalBeforeDiscounts = this._toNumber(subTotalBeforeDiscounts + grossLineAmount);
      productDiscountTotal = this._toNumber(productDiscountTotal + productDiscountAmount);
      lineItemDiscountTotal = this._toNumber(lineItemDiscountTotal + lineItemDiscount);
    }

    // Total discount before coupon = product discounts + line item discounts
    let discountTotal = this._toNumber(productDiscountTotal + lineItemDiscountTotal);

    // Step 4: Apply coupon discount (if present) to the discounted selling price
    let couponDiscount = this._toNumber(data.billingSummary?.couponDiscount || 0);
    let discountedSubTotal = this._toNumber(subTotalBeforeDiscounts - discountTotal); // After product + line item discounts

    // Apply coupon discount proportionally to line items
    if (couponDiscount > 0 && discountedSubTotal > 0) {
      const couponDiscountRatio = couponDiscount / discountedSubTotal;
      for (const lineData of lineItemData) {
        const itemCouponDiscount = this._toNumber(lineData.discountedLineAmount * couponDiscountRatio);
        lineData.discountedLineAmount = this._toNumber(Math.max(0, lineData.discountedLineAmount - itemCouponDiscount));
        lineData.couponDiscount = itemCouponDiscount;
      }
      // Recalculate discounted subtotal after coupon discount
      discountedSubTotal = this._toNumber(lineItemData.reduce((sum, ld) => sum + ld.discountedLineAmount, 0));
    }

    // Total all discounts: product + line item + coupon
    const totalAllDiscounts = this._toNumber(discountTotal + couponDiscount);

    // Note: Loyalty points are now applied as payment instrument AFTER tax calculation
    // They do not affect the taxable base or tax calculation

    // Step 6: Calculate taxes on the discounted selling price
    let inclusiveTaxTotal = 0; // Track inclusive tax separately (already in discounted price)
    let exclusiveTaxTotal = 0; // Track exclusive tax separately (needs to be added)
    let finalSubTotal = 0; // Base amount after extracting inclusive taxes
    const appliedTaxes = new Map(); // Aggregate taxes by ID

    for (const lineData of lineItemData) {
      const { item, discountedLineAmount, applicableTaxes } = lineData;

      // Separate inclusive and exclusive taxes
      const inclusiveTaxes = applicableTaxes.filter(t => t.taxType === 'Inclusive');
      const exclusiveTaxes = applicableTaxes.filter(t => t.taxType === 'Exclusive');

      let lineInclusiveTax = 0;
      let lineExclusiveTax = 0;
      let lineBaseAmount = discountedLineAmount; // Start with discounted price

      // Step 6a: Recalculate INCLUSIVE taxes from discounted price (reverse calculation)
      // Note: Inclusive tax is already included in discountedLineAmount, we just extract it for reporting
      if (inclusiveTaxes.length > 0) {
        const inclusivePercentageRate = inclusiveTaxes
          .filter(t => t.valueType === 'Percentage')
          .reduce((sum, t) => sum + this._toNumber(t.value), 0);

        const inclusiveFixedAmount = inclusiveTaxes
          .filter(t => t.valueType === 'Fixed')
          .reduce((sum, t) => sum + this._toNumber(t.value), 0);

        // Reverse calculate: Base = Total / (1 + Rate/100)
        if (inclusivePercentageRate > 0) {
          lineBaseAmount = this._toNumber(discountedLineAmount / (1 + inclusivePercentageRate / 100));
          const inclusiveTaxFromPercentage = this._toNumber(discountedLineAmount - lineBaseAmount);
          lineInclusiveTax = this._toNumber(lineInclusiveTax + inclusiveTaxFromPercentage);

          // Distribute tax among inclusive percentage taxes
          for (const tax of inclusiveTaxes.filter(t => t.valueType === 'Percentage')) {
            const proportion = this._toNumber(tax.value) / inclusivePercentageRate;
            const taxAmount = this._toNumber(inclusiveTaxFromPercentage * proportion);

            const taxIdStr = tax._id.toString();
            if (appliedTaxes.has(taxIdStr)) {
              const existing = appliedTaxes.get(taxIdStr);
              existing.amount = this._toNumber(existing.amount + taxAmount);
            } else {
              appliedTaxes.set(taxIdStr, {
                tax: tax._id,
                taxName: tax.taxName,
                taxType: tax.taxType,
                percentage: tax.value,
                amount: taxAmount,
              });
            }
          }
        }

        // Handle inclusive fixed taxes
        if (inclusiveFixedAmount > 0) {
          lineBaseAmount = this._toNumber(Math.max(0, lineBaseAmount - inclusiveFixedAmount));
          lineInclusiveTax = this._toNumber(lineInclusiveTax + inclusiveFixedAmount);

          for (const tax of inclusiveTaxes.filter(t => t.valueType === 'Fixed')) {
            const taxIdStr = tax._id.toString();
            const taxAmount = this._toNumber(tax.value);

            if (appliedTaxes.has(taxIdStr)) {
              const existing = appliedTaxes.get(taxIdStr);
              existing.amount = this._toNumber(existing.amount + taxAmount);
            } else {
              appliedTaxes.set(taxIdStr, {
                tax: tax._id,
                taxName: tax.taxName,
                taxType: tax.taxType,
                percentage: 0,
                amount: taxAmount,
              });
            }
          }
        }
      }

      // Step 6b: Calculate EXCLUSIVE taxes on the taxable base (after extracting inclusive tax)
      // Per global GST/VAT standards: Exclusive tax is calculated on the pure base value
      // NOT on the amount that still includes inclusive tax
      const exclusiveTaxBase = lineBaseAmount; // Use base after extracting inclusive tax

      if (exclusiveTaxes.length > 0) {
        for (const tax of exclusiveTaxes) {
          let taxAmount = 0;

          if (tax.valueType === 'Percentage') {
            taxAmount = this._toNumber(exclusiveTaxBase * (this._toNumber(tax.value) / 100));
          } else if (tax.valueType === 'Fixed') {
            taxAmount = this._toNumber(tax.value);
          }

          lineExclusiveTax = this._toNumber(lineExclusiveTax + taxAmount);

          const taxIdStr = tax._id.toString();
          if (appliedTaxes.has(taxIdStr)) {
            const existing = appliedTaxes.get(taxIdStr);
            existing.amount = this._toNumber(existing.amount + taxAmount);
          } else {
            appliedTaxes.set(taxIdStr, {
              tax: tax._id,
              taxName: tax.taxName,
              taxType: tax.taxType,
              percentage: tax.valueType === 'Percentage' ? tax.value : 0,
              amount: taxAmount,
            });
          }
        }
      }

      // Update item with calculated values
      // Store grossAmount (selling price × quantity, before any discounts)
      item.grossAmount = this._toNumber(lineData.grossLineAmount);
      // Store sellingPrice for reference
      item.sellingPrice = this._toNumber(lineData.sellingPrice || 0);
      item.netAmount = this._toNumber(lineBaseAmount);
      item.taxAmount = this._toNumber(lineInclusiveTax + lineExclusiveTax); // Total tax for item
      // taxableValue: Pure base value after discounts, excluding any taxes (inclusive or exclusive)
      // This is the value used for tax calculation purposes
      item.taxableValue = this._toNumber(lineBaseAmount);
      // discountAmount includes both product discount and line item discount
      item.discountAmount = this._toNumber(lineData.totalLineDiscount || 0);
      // Also store the product discount percentage for reference
      item.productDiscountPercent = this._toNumber(lineData.productDiscountPercent || 0);
      item.productDiscountAmount = this._toNumber(lineData.productDiscountAmount || 0);

      // Create tax snapshots for the item (support multiple taxes)
      // Store both detailed taxSnapshots array AND legacy taxSnapshot object
      item.taxSnapshots = [];
      item.inclusiveTaxAmount = this._toNumber(lineInclusiveTax);
      item.exclusiveTaxAmount = this._toNumber(lineExclusiveTax);

      // Create individual tax snapshot for each applicable tax
      for (const tax of applicableTaxes) {
        const taxIdStr = tax._id.toString();
        // Get the calculated amount for this specific tax from appliedTaxes map
        const appliedTax = appliedTaxes.get(taxIdStr);
        const calculatedAmount = appliedTax ? appliedTax.amount : 0;

        item.taxSnapshots.push({
          taxId: tax._id,
          taxName: tax.taxName,
          percentage: tax.valueType === 'Percentage' ? this._toNumber(tax.value) : 0,
          fixedAmount: tax.valueType === 'Fixed' ? this._toNumber(tax.value) : 0,
          taxType: tax.taxType,
          valueType: tax.valueType,
          calculatedAmount: this._toNumber(calculatedAmount),
        });
      }

      // Also create legacy taxSnapshot for backward compatibility
      if (applicableTaxes.length === 1) {
        const t = applicableTaxes[0];
        item.taxSnapshot = {
          taxName: t.taxName,
          percentage: t.valueType === 'Percentage' ? this._toNumber(t.value) : 0,
          amount: t.valueType === 'Fixed' ? this._toNumber(t.value) : 0,
          taxType: t.taxType,
          valueType: t.valueType,
        };
      } else if (applicableTaxes.length > 1) {
        // Multiple taxes - create combined snapshot for legacy compatibility
        const inclusiveTaxes = applicableTaxes.filter(t => t.taxType === 'Inclusive');
        const exclusiveTaxes = applicableTaxes.filter(t => t.taxType === 'Exclusive');

        // Build descriptive name showing both tax types
        const taxNames = [];
        if (inclusiveTaxes.length > 0) {
          taxNames.push(inclusiveTaxes.map(t => t.taxName).join(' + ') + ' (Incl)');
        }
        if (exclusiveTaxes.length > 0) {
          taxNames.push(exclusiveTaxes.map(t => t.taxName).join(' + ') + ' (Excl)');
        }

        item.taxSnapshot = {
          taxName: taxNames.join(', '),
          percentage: this._toNumber(applicableTaxes
            .filter(t => t.valueType === 'Percentage')
            .reduce((sum, t) => sum + t.value, 0)),
          amount: this._toNumber(applicableTaxes
            .filter(t => t.valueType === 'Fixed')
            .reduce((sum, t) => sum + t.value, 0)),
          taxType: inclusiveTaxes.length > 0 && exclusiveTaxes.length > 0
            ? 'Mixed'
            : (inclusiveTaxes.length > 0 ? 'Inclusive' : 'Exclusive'),
          valueType: applicableTaxes[0].valueType,
        };
      }

      // Accumulate totals with proper decimal precision
      finalSubTotal = this._toNumber(finalSubTotal + lineBaseAmount);
      inclusiveTaxTotal = this._toNumber(inclusiveTaxTotal + lineInclusiveTax); // Inclusive tax (already in discounted price)
      exclusiveTaxTotal = this._toNumber(exclusiveTaxTotal + lineExclusiveTax); // Exclusive tax (needs to be added)
    }

    // Step 7: Calculate grand total BEFORE rounding
    // Grand total = discounted subTotal (includes inclusive tax) + exclusive taxes only
    // Note: Inclusive taxes are already included in discountedSubTotal, so we don't add them again
    // Only exclusive taxes need to be added on top
    const grandTotalBeforeRounding = this._toNumber(discountedSubTotal + exclusiveTaxTotal);

    // Step 8: Calculate rounding adjustment to round grand total to nearest whole number
    // This ensures the final payable amount is always a round figure
    const roundedGrandTotal = Math.round(grandTotalBeforeRounding);
    const roundingAdjustment = this._toNumber(roundedGrandTotal - grandTotalBeforeRounding);

    // Grand total after rounding (payment instruments applied later)
    const grandTotalAfterRounding = this._toNumber(roundedGrandTotal);

    // Total tax for reporting (inclusive + exclusive)
    const totalTaxForReporting = this._toNumber(inclusiveTaxTotal + exclusiveTaxTotal);

    // Initialize billing summary
    const billingSummary = {
      subTotal: this._toNumber(finalSubTotal), // Base amount after extracting inclusive taxes
      discountTotal: this._toNumber(discountTotal),
      couponDiscount: this._toNumber(couponDiscount),
      loyaltyDiscount: 0, // Loyalty points are applied as payment, not discount
      giftCardDiscount: 0, // Gift card is applied as payment, not discount
      taxableAmount: this._toNumber(discountedSubTotal), // Discounted selling price (includes inclusive tax)
      taxTotal: this._toNumber(totalTaxForReporting), // Total tax for reporting (inclusive + exclusive)
      roundingAdjustment: this._toNumber(roundingAdjustment), // Adjustment to make grandTotal a whole number
      grandTotal: this._toNumber(grandTotalBeforeRounding), // Grand total before rounding (actual calculated value)
      roundedGrandTotal: this._toNumber(roundedGrandTotal), // Final payable amount (rounded to whole number)
      amountPaid: this._toNumber(data.billingSummary?.amountPaid || 0),
      balanceDue: 0,
    };

    // Balance due is calculated after payment instruments are applied (in processLoyaltyRedemption/applyGiftCardIfPresent)
    // Use roundedGrandTotal as the final payable amount
    billingSummary.balanceDue = this._toNumber(Math.max(
      billingSummary.roundedGrandTotal - billingSummary.amountPaid,
      0
    ));

    // Convert appliedTaxes map to array
    const appliedTaxesArray = Array.from(appliedTaxes.values()).map(tax => ({
      ...tax,
      amount: this._toNumber(tax.amount),
    }));

    // Streamlined step-by-step logging
    console.log('\n📊 === SERVER-SIDE BILLING CALCULATION ===');
    console.log('\n📦 STEP 1: Line Items Calculation');
    console.log(`   Gross SubTotal (selling price × qty): ${subTotalBeforeDiscounts.toFixed(2)}`);
    console.log(`   Product/Variant Discount: ${productDiscountTotal.toFixed(2)}`);
    console.log(`   Line Item Discounts: ${lineItemDiscountTotal.toFixed(2)}`);
    console.log(`   Total Discounts (product + line): ${discountTotal.toFixed(2)}`);
    console.log(`   After All Line Discounts: ${(subTotalBeforeDiscounts - discountTotal).toFixed(2)}`);

    console.log('\n🎫 STEP 2: Coupon Discount Application');
    console.log(`   Coupon Discount: ${billingSummary.couponDiscount.toFixed(2)}`);
    console.log(`   Discounted SubTotal (after coupon): ${billingSummary.taxableAmount.toFixed(2)}`);
    console.log(`   Total All Discounts: ${totalAllDiscounts.toFixed(2)}`);
    console.log(`   Note: This amount already includes inclusive taxes`);

    console.log('\n💰 STEP 3: Tax Calculation');
    console.log(`   Base Amount (after extracting inclusive tax): ${billingSummary.subTotal.toFixed(2)}`);
    console.log(`   Tax Breakdown:`);
    appliedTaxesArray.forEach((tax, idx) => {
      const taxTypeLabel = tax.taxType === 'Inclusive' ? '(Inclusive - already in price)' : '(Exclusive - added on top)';
      console.log(`     ${idx + 1}. ${tax.taxName} ${taxTypeLabel} - ${tax.percentage > 0 ? `${tax.percentage}%` : 'Fixed'}: ${tax.amount.toFixed(2)}`);
    });
    console.log(`   Inclusive Tax Total: ${inclusiveTaxTotal.toFixed(2)} (already included in discounted price)`);
    console.log(`   Exclusive Tax Total: ${exclusiveTaxTotal.toFixed(2)} (added to grand total)`);
    console.log(`   Total Tax (for reporting): ${billingSummary.taxTotal.toFixed(2)}`);

    console.log('\n🔢 STEP 4: Final Calculation');
    console.log(`   Discounted SubTotal (includes inclusive tax): ${billingSummary.taxableAmount.toFixed(2)}`);
    console.log(`   + Exclusive Tax: ${exclusiveTaxTotal.toFixed(2)}`);
    console.log(`   = Grand Total (before rounding): ${billingSummary.grandTotal.toFixed(2)}`);
    console.log(`   Rounding Adjustment: ${billingSummary.roundingAdjustment.toFixed(2)}`);
    console.log(`   = Final Payable (roundedGrandTotal): ${billingSummary.roundedGrandTotal.toFixed(2)}`);
    console.log('\n==========================================\n');

    return {
      billingSummary,
      appliedTaxes: appliedTaxesArray,
      products: data.products,
    };
  }

  /**
   * Apply gift card as payment instrument (not a discount affecting tax)
   * Gift cards are applied AFTER all taxes are calculated
   * They reduce the payable amount but do not affect the taxable base
   * @param {Object} data - Sale payload
   * @returns {Promise<Object|null>} Gift card context or null
   */
  async applyGiftCardIfPresent(data) {
    if (!data || !data.billingSummary) {
      return null;
    }

    const giftCardPayload = data.giftCard || {};
    const giftCardNumber = giftCardPayload.number || data.giftCardNumber;

    if (!giftCardNumber) {
      // Gift card is a payment instrument, not a discount field
      // We don't set giftCardDiscount anymore
      return null;
    }

    if (!this.giftCardService) {
      throw new Error('Gift card service is not configured for this tenant');
    }

    // Get customerId for validation (if customer exists and not walk-in)
    const customerId = data.customer && !data.isWalkInCustomer
      ? data.customer.toString()
      : null;

    // Validate gift card against the grand total (after all taxes)
    const grandTotal = this._toNumber(data.billingSummary.grandTotal);

    const validation = await this.giftCardService.validateAndCheckUsage({
      number: giftCardNumber,
      customerId,
      purchaseAmount: grandTotal,
    });

    if (!validation.valid) {
      throw new Error(`Gift card validation failed: ${validation.reasons.join(', ')}`);
    }

    const giftCard = validation.giftCard;

    // Calculate payment amount (gift card value, but not more than grandTotal)
    // This is a payment, not a discount - it doesn't affect tax calculation
    const paymentAmount = Math.min(
      this._toNumber(giftCard.value),
      grandTotal
    );

    // Apply gift card as payment - reduce balance due
    // Grand total remains the same (taxes are not affected)
    const currentAmountPaid = this._toNumber(data.billingSummary.amountPaid || 0);
    const newAmountPaid = currentAmountPaid + paymentAmount;
    const newBalanceDue = Math.max(0, grandTotal - newAmountPaid);

    // Update billing summary
    data.billingSummary.amountPaid = this._toNumber(newAmountPaid);
    data.billingSummary.balanceDue = this._toNumber(newBalanceDue);

    // Store gift card payment amount (for reference, not as discount)
    // Keep giftCardDiscount as 0 to maintain backward compatibility
    data.billingSummary.giftCardDiscount = 0;

    // Log gift card application
    console.log('\n💳 === GIFT CARD APPLICATION (Payment Instrument) ===');
    console.log(`   Gift Card Number: ${giftCard.number}`);
    console.log(`   Gift Card Value: ${giftCard.value.toFixed(2)}`);
    console.log(`   Payment Amount Applied: ${paymentAmount.toFixed(2)}`);
    console.log(`   Grand Total (unchanged): ${grandTotal.toFixed(2)}`);
    console.log(`   Amount Paid (before): ${currentAmountPaid.toFixed(2)}`);
    console.log(`   Amount Paid (after): ${newAmountPaid.toFixed(2)}`);
    console.log(`   Balance Due: ${newBalanceDue.toFixed(2)}`);
    console.log('====================================================\n');

    // Set gift card info on sale
    data.giftCard = {
      giftCardId: giftCard._id,
      number: giftCard.number,
      discountAmount: paymentAmount, // Keep field name for backward compatibility
      paymentAmount: paymentAmount, // New field name to clarify it's a payment
    };

    // Remove loose giftCardNumber field
    if (data.giftCardNumber) {
      delete data.giftCardNumber;
    }

    return { giftCardId: giftCard._id, discount: paymentAmount };
  }

  /**
   * Validate and verify sale payload data consistency
   * Logs warnings for mismatches and optionally recalculates values
   * 
   * @param {Object} data - Sale payload from frontend
   * @param {Object} options - { autoFix: boolean, logWarnings: boolean }
   * @returns {Object} { warnings: Array, recalculated: Object }
   */
  validateSalePayload(data, options = { autoFix: false, logWarnings: true }) {
    const warnings = [];
    const recalculated = {};

    if (!data) {
      warnings.push({ field: 'data', message: 'Sale payload is empty', severity: 'error' });
      return { warnings, recalculated };
    }

    // 1. Validate products array
    if (!Array.isArray(data.products) || data.products.length === 0) {
      warnings.push({ field: 'products', message: 'Products array is empty or missing', severity: 'error' });
    } else {
      // Calculate totals from products
      let calculatedSubTotal = 0;
      let calculatedTaxTotal = 0;
      let calculatedDiscountTotal = 0;

      for (let i = 0; i < data.products.length; i++) {
        const item = data.products[i];
        const itemPrefix = `products[${i}]`;

        // Check field name mismatch: 'tax' vs 'tenantTax'
        if (item.tax && !item.tenantTax) {
          warnings.push({
            field: `${itemPrefix}.tax`,
            message: `Field 'tax' should be 'tenantTax' (schema expects tenantTax as single ObjectId)`,
            severity: 'warning',
            frontendValue: Array.isArray(item.tax) ? `Array[${item.tax.length}]` : item.tax,
          });
        }

        // Check if tax is array (schema expects single ObjectId)
        if (Array.isArray(item.tax) || Array.isArray(item.tenantTax)) {
          const taxField = item.tax || item.tenantTax;
          warnings.push({
            field: `${itemPrefix}.tenantTax`,
            message: `Tax field is an array but schema expects single ObjectId. Using first tax.`,
            severity: 'info',
            frontendValue: `Array with ${taxField.length} tax(es)`,
          });
        }

        // Accumulate totals
        const netAmount = this._toNumber(item.netAmount || 0);
        const taxAmount = this._toNumber(item.taxAmount || 0);
        const discountAmount = this._toNumber(item.discountAmount || 0);

        calculatedSubTotal += netAmount;
        calculatedTaxTotal += taxAmount;
        calculatedDiscountTotal += discountAmount;
      }

      recalculated.fromProducts = {
        subTotal: this._toNumber(calculatedSubTotal),
        taxTotal: this._toNumber(calculatedTaxTotal),
        discountTotal: this._toNumber(calculatedDiscountTotal),
      };

      // 2. Validate billingSummary against calculated values
      if (data.billingSummary) {
        const bs = data.billingSummary;

        // Check subTotal
        if (Math.abs(this._toNumber(bs.subTotal) - calculatedSubTotal) > 0.01) {
          warnings.push({
            field: 'billingSummary.subTotal',
            message: `subTotal mismatch: frontend=${bs.subTotal}, calculated from products=${calculatedSubTotal}`,
            severity: 'warning',
            frontendValue: bs.subTotal,
            calculatedValue: calculatedSubTotal,
          });
        }

        // Check taxTotal vs sum of product taxAmounts
        if (Math.abs(this._toNumber(bs.taxTotal) - calculatedTaxTotal) > 0.01) {
          warnings.push({
            field: 'billingSummary.taxTotal',
            message: `taxTotal mismatch: frontend=${bs.taxTotal}, sum of products.taxAmount=${calculatedTaxTotal}`,
            severity: 'warning',
            frontendValue: bs.taxTotal,
            calculatedValue: calculatedTaxTotal,
          });
        }

        // Check discountTotal vs sum of product discountAmounts
        if (Math.abs(this._toNumber(bs.discountTotal) - calculatedDiscountTotal) > 0.01) {
          warnings.push({
            field: 'billingSummary.discountTotal',
            message: `discountTotal mismatch: frontend=${bs.discountTotal}, sum of products.discountAmount=${calculatedDiscountTotal}`,
            severity: 'warning',
            frontendValue: bs.discountTotal,
            calculatedValue: calculatedDiscountTotal,
          });
        }

        // Check taxableAmount (should be subTotal - discountTotal)
        const expectedTaxableAmount = this._toNumber(bs.subTotal) - this._toNumber(bs.discountTotal);
        if (Math.abs(this._toNumber(bs.taxableAmount) - expectedTaxableAmount) > 0.01) {
          warnings.push({
            field: 'billingSummary.taxableAmount',
            message: `taxableAmount mismatch: frontend=${bs.taxableAmount}, expected (subTotal-discountTotal)=${expectedTaxableAmount}`,
            severity: 'warning',
            frontendValue: bs.taxableAmount,
            calculatedValue: expectedTaxableAmount,
          });
        }

        // Check grandTotal calculation
        // Standard: grandTotal = discountedSubTotal + taxTotal + roundingAdjustment
        // Note: Loyalty points and gift cards are payment instruments, not discounts
        const discountedSubTotal = this._toNumber(bs.subTotal) + this._toNumber(bs.discountTotal) - this._toNumber(bs.couponDiscount || 0);
        const expectedGrandTotal = this._toNumber(
          discountedSubTotal +
          this._toNumber(bs.taxTotal) +
          this._toNumber(bs.roundingAdjustment || 0),
        );

        if (Math.abs(this._toNumber(bs.grandTotal) - expectedGrandTotal) > 0.01) {
          warnings.push({
            field: 'billingSummary.grandTotal',
            message: `grandTotal mismatch: frontend=${bs.grandTotal}, expected=${expectedGrandTotal}`,
            severity: 'warning',
            frontendValue: bs.grandTotal,
            calculatedValue: expectedGrandTotal,
            formula: '(subTotal + discountTotal - couponDiscount) + taxTotal + roundingAdjustment',
          });
        }

        // Check balanceDue
        const expectedBalanceDue = Math.max(this._toNumber(bs.grandTotal) - this._toNumber(bs.amountPaid), 0);
        if (Math.abs(this._toNumber(bs.balanceDue) - expectedBalanceDue) > 0.01) {
          warnings.push({
            field: 'billingSummary.balanceDue',
            message: `balanceDue mismatch: frontend=${bs.balanceDue}, expected=${expectedBalanceDue}`,
            severity: 'warning',
            frontendValue: bs.balanceDue,
            calculatedValue: expectedBalanceDue,
          });
        }

        recalculated.billingSummary = {
          subTotal: calculatedSubTotal,
          discountTotal: calculatedDiscountTotal,
          taxableAmount: expectedTaxableAmount,
          taxTotal: calculatedTaxTotal,
          grandTotal: expectedGrandTotal,
          balanceDue: expectedBalanceDue,
        };
      }
    }

    // 3. Log warnings if enabled
    if (options.logWarnings && warnings.length > 0) {
      console.warn('\n⚠️  === SALE PAYLOAD VALIDATION WARNINGS ===');
      warnings.forEach((w, idx) => {
        console.warn(`\n[${idx + 1}] ${w.severity.toUpperCase()}: ${w.field}`);
        console.warn(`   Message: ${w.message}`);
        if (w.frontendValue !== undefined) console.warn(`   Frontend Value: ${w.frontendValue}`);
        if (w.calculatedValue !== undefined) console.warn(`   Calculated Value: ${w.calculatedValue}`);
        if (w.formula) console.warn(`   Formula: ${w.formula}`);
      });
      console.warn('\n=========================================\n');
    }

    // 4. Auto-fix if enabled (updates data in place)
    if (options.autoFix && recalculated.billingSummary) {
      // Only fix tax-related values if there's a mismatch
      // Don't override frontend values completely - just ensure consistency
      if (data.billingSummary) {
        // If product taxAmounts are 0 but billingSummary.taxTotal is not,
        // distribute tax back to products proportionally
        if (recalculated.fromProducts.taxTotal === 0 && this._toNumber(data.billingSummary.taxTotal) > 0) {
          const totalTax = this._toNumber(data.billingSummary.taxTotal);
          const totalNetAmount = recalculated.fromProducts.subTotal;

          if (totalNetAmount > 0) {
            for (const item of data.products) {
              const proportion = this._toNumber(item.netAmount || 0) / totalNetAmount;
              item.taxAmount = this._toNumber(totalTax * proportion);
            }
            console.log('Auto-fixed: Distributed taxTotal to product taxAmounts proportionally');
          }
        }
      }
    }

    return { warnings, recalculated };
  }

  /**
   * Prepare sale payload by populating missing product details and normalizing structure
   * @param {Object} data - Sale data
   */
  async _prepareSalePayload(data) {
    // 1. Normalize Payment Details
    if (data.paymentDetails && Array.isArray(data.paymentDetails)) {
      data.paymentDetails = data.paymentDetails.map((pd) => {
        if (pd.paymentMethod && !pd.method) {
          pd.method = pd.paymentMethod;
          delete pd.paymentMethod;
        }

        // Calculate cashReceived and changeReturned for cash payments
        if (pd.method === 'cash') {
          const amount = this._toNumber(pd.amount || 0);
          const cashReceived = this._toNumber(pd.cashReceived || 0);

          // If cashReceived is provided, calculate changeReturned
          if (cashReceived > 0) {
            pd.cashReceived = cashReceived;
            pd.changeReturned = Math.max(0, cashReceived - amount);
          } else {
            // If cashReceived is not provided, assume no change (cashReceived = amount)
            pd.cashReceived = amount;
            pd.changeReturned = 0;
          }
        } else {
          // For non-cash payments, ensure these fields are 0 or undefined
          pd.cashReceived = 0;
          pd.changeReturned = 0;
        }

        return pd;
      });
    }

    // Also handle root level method/paymentMethod if paymentDetails is missing or constructed from root
    // But schema expects paymentDetails array. 
    // If payload has root level 'method' and 'amount' but no paymentDetails, maybe we should construct it?
    // The current payload has paymentDetails, so just fixing the key is enough.

    // 2. Populate Missing Product Details
    if (data.products && Array.isArray(data.products) && data.products.length > 0) {
      const productIds = new Set();
      data.products.forEach(p => {
        if (p.product) productIds.add(p.product);
      });

      if (productIds.size > 0) {
        try {
          const ProductModel = await this.getModel('Product', ProductSchema, 'products');
          const products = await ProductModel.find({
            _id: { $in: [...productIds] },
          }).lean();
          const productMap = new Map();
          products.forEach((p) => productMap.set(p._id.toString(), p));

          // Handle cases where product ID is actually a variant subdocument ID
          const foundIds = new Set(products.map((p) => p._id.toString()));
          const missingIds = [...productIds].filter(
            (id) => !foundIds.has(id.toString()),
          );

          if (missingIds.length > 0) {
            const parentProducts = await ProductModel.find({
              'variantData._id': { $in: missingIds },
            }).lean();

            parentProducts.forEach((p) => {
              if (p.variantData) {
                p.variantData.forEach((v) => {
                  if (v._id && missingIds.includes(v._id.toString())) {
                    // Map variant subdoc ID to parent product
                    productMap.set(v._id.toString(), p);
                  }
                });
              }
            });
          }

          for (const item of data.products) {
            // ===== NORMALIZE TAX FIELDS TO tenantTaxes ARRAY =====
            // Support multiple taxes per product (like Product model)
            // Consolidate all tax sources into tenantTaxes array

            // Initialize tenantTaxes array if not exists
            if (!item.tenantTaxes) {
              item.tenantTaxes = [];
            }

            // If tenantTaxes is provided as array, use it
            if (Array.isArray(item.tenantTaxes) && item.tenantTaxes.length > 0) {
              // Already have tenantTaxes, filter out empty values
              item.tenantTaxes = item.tenantTaxes.filter(t => t);
            }

            // If tenantTax (single) is provided, add to tenantTaxes array
            if (item.tenantTax && !Array.isArray(item.tenantTax)) {
              if (!item.tenantTaxes.some(t => t?.toString() === item.tenantTax?.toString())) {
                item.tenantTaxes.push(item.tenantTax);
              }
            } else if (Array.isArray(item.tenantTax) && item.tenantTax.length > 0) {
              // If tenantTax is an array (legacy), merge into tenantTaxes
              for (const taxId of item.tenantTax) {
                if (taxId && !item.tenantTaxes.some(t => t?.toString() === taxId?.toString())) {
                  item.tenantTaxes.push(taxId);
                }
              }
            }

            // Also handle legacy 'tax' field from frontend payload
            if (item.tax) {
              if (Array.isArray(item.tax)) {
                for (const taxId of item.tax) {
                  if (taxId && !item.tenantTaxes.some(t => t?.toString() === taxId?.toString())) {
                    item.tenantTaxes.push(taxId);
                  }
                }
              } else if (!item.tenantTaxes.some(t => t?.toString() === item.tax?.toString())) {
                item.tenantTaxes.push(item.tax);
              }
              delete item.tax; // Remove legacy tax field
            }

            const product = productMap.get(item.product?.toString());
            if (product) {
              // Ensure item.product points to the main Product ID
              if (item.product.toString() !== product._id.toString()) {
                item.product = product._id;
              }
              // Populate strictly required fields if missing
              if (!item.category) item.category = product.category;
              if (!item.subCategory && product.subCategory) item.subCategory = product.subCategory;

              // ===== POPULATE TAXES FROM PRODUCT =====
              // If no taxes yet, get from product (which stores array of tax IDs)
              if (item.tenantTaxes.length === 0 && product.tax) {
                if (Array.isArray(product.tax) && product.tax.length > 0) {
                  item.tenantTaxes = [...product.tax];
                } else if (!Array.isArray(product.tax)) {
                  item.tenantTaxes = [product.tax];
                }
              }

              // Unit in Product is nested { unit: ObjectId, value: Number }
              // Sales item.unit is ObjectId
              if (!item.unit && product.unit?.unit) item.unit = product.unit.unit;

              // Ensure hasVariation flag is set correctly
              if (item.hasVariation === undefined) item.hasVariation = product.hasVariation;

              // ===== POPULATE PRODUCT/VARIANT DISCOUNT AND PRICES =====
              // For variant products, find the matching variant data
              if (product.hasVariation && Array.isArray(product.variantData)) {
                // Match by SKU or variant subdoc ID
                const variantData = product.variantData.find(
                  (v) => v.SKU === item.SKU || v._id?.toString() === item.product?.toString()
                );

                if (variantData) {
                  // Populate selling price if not provided or is 0
                  // sellingPrice should come from variant's sellingPrice
                  if (!item.sellingPrice) {
                    item.sellingPrice = this._toNumber(variantData.sellingPrice);
                  }
                  // Populate cost price if not provided
                  if (item.costPrice === undefined || item.costPrice === null) {
                    item.costPrice = this._toNumber(variantData.costPrice);
                  }
                  // IMPORTANT: Populate product discount percentage
                  if (item.productDiscountPercent === undefined || item.productDiscountPercent === null) {
                    item.productDiscountPercent = this._toNumber(variantData.discount || 0);
                  }
                  // Populate variant taxes if no taxes yet
                  if (item.tenantTaxes.length === 0 && variantData.tax) {
                    if (Array.isArray(variantData.tax) && variantData.tax.length > 0) {
                      item.tenantTaxes = [...variantData.tax];
                    } else if (!Array.isArray(variantData.tax)) {
                      item.tenantTaxes = [variantData.tax];
                    }
                  }
                }
              } else {
                // Non-variant product: use main product's sellingPrice
                // If sellingPrice is not provided or is 0, use product.sellingPrice
                if (!item.sellingPrice) {
                  item.sellingPrice = this._toNumber(product.sellingPrice);
                }
                if (item.costPrice === undefined || item.costPrice === null) {
                  item.costPrice = this._toNumber(product.costPrice);
                }
                // IMPORTANT: Populate product discount percentage
                if (item.productDiscountPercent === undefined || item.productDiscountPercent === null) {
                  item.productDiscountPercent = this._toNumber(product.discount || 0);
                }
              }

              // Set legacy tenantTax field for backward compatibility (first tax)
              if (item.tenantTaxes.length > 0 && !item.tenantTax) {
                item.tenantTax = item.tenantTaxes[0];
              }
            }

            // Ensure netAmount is present
            // If item has totalPrice, use that as netAmount (assuming exclusive tax or simple calculation)
            // If netAmount is missing, we MUST set it.
            if (item.netAmount === undefined || item.netAmount === null) {
              if (item.totalPrice !== undefined) {
                item.netAmount = this._toNumber(item.totalPrice);
              } else {
                const qty = this._toNumber(item.quantity || 1);
                const price = this._toNumber(item.unitPrice || 0);
                item.netAmount = this._toNumber(qty * price);
              }
            }
          }
        } catch (error) {
          console.error('Failed to hydrate product details', error);
          // throw error? or let validation fail later?
          // If we fail here, we can't create the sale.
          throw new Error(`Failed to prepare sale payload: ${error.message}`);
        }
      }
    }
    // 3. Recalculate billing summary fields to ensure consistency
    if (data.billingSummary) {
      const grandTotal = this._toNumber(data.billingSummary.grandTotal);
      const amountPaid = this._toNumber(data.billingSummary.amountPaid);

      // Ensure balance due is correct (Debt)
      // If amountPaid > grandTotal, balanceDue should be 0.
      data.billingSummary.balanceDue = Math.max(grandTotal - amountPaid, 0);

      // Optional: Calculate change amount if needed, but schema dependence applies.
      // For now, primary fix is preventing false debt.
    }
  }

  /**
   * Derive the discounted selling price (before taxes) for coupon calculation
   * Coupon should be applied to the discounted selling price (subTotal + line item discounts)
   * This is the amount after line item discounts but before any taxes
   * @param {Object} data - Full sale data (includes products array and billingSummary)
   * @returns {Number}
   */
  _calculateCouponBaseAmount(data = {}) {
    const billingSummary = data.billingSummary || {};
    let baseAmount = 0;

    // Primary approach: Calculate from products array (most reliable)
    if (Array.isArray(data.products) && data.products.length > 0) {
      for (const item of data.products) {
        const quantity = this._toNumber(item.quantity || 1);
        const unitPrice = this._toNumber(item.unitPrice || item.price || 0);
        const lineTotal = item.netAmount !== undefined
          ? this._toNumber(item.netAmount)
          : this._toNumber(quantity * unitPrice);
        const lineDiscount = this._toNumber(item.discountAmount || 0);

        baseAmount += Math.max(0, lineTotal - lineDiscount);
      }
    }

    // Fallback: Use billingSummary subTotal + discountTotal
    if (baseAmount <= 0) {
      const subTotal = this._toNumber(billingSummary.subTotal);
      const discountTotal = this._toNumber(billingSummary.discountTotal || 0);
      baseAmount = subTotal + discountTotal;
    }

    // Fallback: If subTotal is missing, try to use taxableAmount
    if (baseAmount <= 0) {
      baseAmount = this._toNumber(billingSummary.taxableAmount || 0);
    }

    // Fallback: Try to reverse-engineer from grandTotal (less accurate)
    if (baseAmount <= 0) {
      const grandTotal = this._toNumber(billingSummary.grandTotal || 0);
      const taxTotal = this._toNumber(billingSummary.taxTotal || 0);
      const couponDiscount = this._toNumber(billingSummary.couponDiscount || 0);
      const loyaltyDiscount = this._toNumber(billingSummary.loyaltyDiscount || 0);
      const rounding = this._toNumber(billingSummary.roundingAdjustment || 0);

      // Approximate: grandTotal = baseAmount - discounts + taxes + rounding
      // So: baseAmount ≈ grandTotal - taxes - rounding + discounts
      baseAmount = grandTotal - taxTotal - rounding + couponDiscount + loyaltyDiscount;
    }

    return Math.max(baseAmount, 0);
  }

  /**
   * Ensure coupon satisfies all usage constraints
   * @param {Object} coupon
   */
  _assertCouponIsUsable(coupon) {
    if (!coupon) {
      throw new Error('Coupon not found');
    }

    const now = new Date();

    if (coupon.isDeleted) {
      throw new Error('Coupon is inactive');
    }

    if (!coupon.status) {
      throw new Error('Coupon is inactive');
    }

    if (coupon.start_date && now < coupon.start_date) {
      throw new Error('Coupon has not started yet');
    }

    if (coupon.end_date && now > coupon.end_date) {
      throw new Error('Coupon has expired');
    }

    if (
      typeof coupon.limit === 'number' &&
      typeof coupon.usageCount === 'number' &&
      coupon.usageCount >= coupon.limit
    ) {
      throw new Error('Coupon usage limit has been reached');
    }
  }

  /**
   * Preview billing summary with coupon applied (without creating sale)
   * Useful for frontend to show real-time calculations
   * 
   * @param {Object|String} data - Either:
   *   - Full sale payload object with structure:
   *     {
   *       products: [{
   *         product: ObjectId,
   *         quantity: Number,
   *         unitPrice: Number,
   *         productDiscountPercent: Number (optional),
   *         discountAmount: Number (optional),
   *         tenantTax: ObjectId (optional),
   *         SKU: String (optional),
   *         ...other product fields
   *       }],
   *       billingSummary: {
   *         subTotal: Number (optional, will be calculated),
   *         couponDiscount: Number (optional),
   *         roundingAdjustment: Number (optional, default: 0),
   *         ...other billing fields
   *       },
   *       coupon: { code: String } or { couponId: ObjectId } (optional),
   *       loyalty: { pointsRedeemed: Number } (optional),
   *       giftCard: { number: String } (optional),
   *       paymentDetails: [{ method: String, amount: Number, cashReceived: Number }] (optional),
   *       customer: ObjectId (optional),
   *       store: ObjectId (optional),
   *       isWalkInCustomer: Boolean (optional)
   *     }
   *   - OR a saleId (String) - will fetch the sale and generate preview
   * 
   * @returns {Promise<Object>} Preview billing summary with all fields from receipt
   */
  async previewBillingSummary(data) {
    // If data is a string (saleId), fetch the sale first
    if (typeof data === 'string') {
      return this.previewBillingSummaryBySaleId(data);
    }
    try {
      // Clone data to avoid mutating original
      const previewData = JSON.parse(JSON.stringify(data));

      // Prepare payload (populate product details, etc.)
      await this._prepareSalePayload(previewData);

      // Apply coupon if present (sets couponDiscount in billingSummary)
      await this.applyCouponIfPresent(previewData);

      // Calculate full billing summary with tax breakdown
      const billingResult = await this.calculateBillingSummary(previewData);
      previewData.products = billingResult.products;
      previewData.billingSummary = billingResult.billingSummary;
      previewData.appliedTaxes = billingResult.appliedTaxes;

      // Apply loyalty redemption if eligible (as payment instrument)
      let loyaltyRedemption = null;
      if (previewData.loyalty !== undefined && previewData.loyalty !== null) {
        try {
          loyaltyRedemption = await this.processLoyaltyRedemption(previewData);
        } catch (error) {
          // Log but don't fail preview for loyalty errors
          console.log('Loyalty preview error:', error.message);
        }
      }

      // Apply gift card if present (as payment instrument)
      let giftCardContext = null;
      if (previewData.giftCard?.number || previewData.giftCardNumber) {
        try {
          giftCardContext = await this.applyGiftCardIfPresent(previewData);
        } catch (error) {
          // Log but don't fail preview for gift card errors
          console.log('Gift card preview error:', error.message);
        }
      }

      // Calculate tax breakdown by type (Inclusive vs Exclusive)
      const taxBreakdown = {
        inclusive: [],
        exclusive: [],
        inclusiveTotal: 0,
        exclusiveTotal: 0,
      };

      if (Array.isArray(previewData.appliedTaxes)) {
        for (const tax of previewData.appliedTaxes) {
          const taxEntry = {
            taxName: tax.taxName,
            taxType: tax.taxType,
            percentage: tax.percentage || 0,
            amount: this._toNumber(tax.amount),
          };

          if (tax.taxType === 'Inclusive') {
            taxBreakdown.inclusive.push(taxEntry);
            taxBreakdown.inclusiveTotal += taxEntry.amount;
          } else {
            taxBreakdown.exclusive.push(taxEntry);
            taxBreakdown.exclusiveTotal += taxEntry.amount;
          }
        }
      }

      // Build line items with calculated values (including multiple taxes)
      const lineItems = (previewData.products || []).map((item) => {
        const quantity = this._toNumber(item.quantity || 1);
        // sellingPrice: Use item.sellingPrice, fallback to unitPrice, then price
        const sellingPrice = this._toNumber(
          item.sellingPrice || item.unitPrice || item.price || 0
        );

        // grossAmount: selling price × quantity (before any discounts)
        // Calculate from sellingPrice if available, otherwise reconstruct from net + discounts + tax
        let grossAmount = this._toNumber(quantity * sellingPrice);

        const productDiscountAmount = this._toNumber(item.productDiscountAmount || 0);
        const totalDiscountStored = this._toNumber(item.discountAmount || 0);
        const lineItemDiscount = Math.max(0, totalDiscountStored - productDiscountAmount);
        const netAmount = this._toNumber(item.netAmount || 0);
        const taxAmount = this._toNumber(item.taxAmount || 0);
        const inclusiveTaxAmount = this._toNumber(item.inclusiveTaxAmount || 0);
        const exclusiveTaxAmount = this._toNumber(item.exclusiveTaxAmount || 0);

        // taxableValue: Pure base value after discounts, excluding any taxes
        // This comes from calculateBillingSummary which sets item.taxableValue
        const taxableValue = this._toNumber(item.taxableValue || netAmount);

        // If grossAmount is 0 but we have other values, try to reconstruct it
        // grossAmount = netAmount + inclusiveTax + totalDiscount (before any deductions)
        if (grossAmount === 0 && (netAmount > 0 || taxableValue > 0)) {
          // Reconstruct: grossAmount = taxableValue + inclusiveTax + totalDiscount
          // OR if we have the item's stored grossAmount, use that
          grossAmount = this._toNumber(
            item.grossAmount ||
            (taxableValue + inclusiveTaxAmount + totalDiscountStored)
          );
        }

        return {
          product: item.product,
          productName: item.productName || item.name || '',
          SKU: item.SKU || '',
          variantName: item.variantName || '',
          quantity,
          sellingPrice,
          grossAmount,
          productDiscountPercent: this._toNumber(item.productDiscountPercent || 0),
          productDiscountAmount,
          lineItemDiscount,
          totalDiscount: totalDiscountStored,
          netAmount,
          // taxableValue: Pure value after discounts, excluding any taxes (inclusive or exclusive)
          taxableValue,
          taxAmount,
          inclusiveTaxAmount,
          exclusiveTaxAmount,
          // New: Array of tax snapshots for multiple taxes
          taxSnapshots: item.taxSnapshots || [],
          // Legacy: Single tax snapshot for backward compatibility
          taxSnapshot: item.taxSnapshot || null,
          // Tax IDs for reference
          tenantTaxes: item.tenantTaxes || [],
        };
      });

      // Calculate gross subtotal (before any discounts)
      const grossSubTotal = lineItems.reduce((sum, item) => sum + item.grossAmount, 0);

      // Calculate total product/variant discount
      const productDiscountTotal = lineItems.reduce((sum, item) => sum + item.productDiscountAmount, 0);

      // Calculate total line item discount
      const lineItemDiscountTotal = lineItems.reduce((sum, item) => sum + item.lineItemDiscount, 0);

      // Calculate total taxable value (pure base value excluding any taxes)
      const taxableValueTotal = lineItems.reduce((sum, item) => sum + item.taxableValue, 0);

      // Get coupon discount
      const couponDiscount = this._toNumber(previewData.billingSummary?.couponDiscount || 0);

      // Get loyalty redemption amount (payment instrument)
      const loyaltyRedeemed = loyaltyRedemption
        ? this._toNumber(loyaltyRedemption.redemptionValue || 0)
        : 0;

      // Get gift card payment amount
      const giftCardApplied = giftCardContext
        ? this._toNumber(giftCardContext.discount || 0)
        : 0;

      // Calculate discounted price (after all discounts, before exclusive tax)
      const discountedPrice = this._toNumber(previewData.billingSummary?.taxableAmount || 0);

      // Calculate payment details
      const paymentDetails = previewData.paymentDetails || [];
      let cashReceived = 0;
      let changeReturned = 0;
      let paymentMode = 'N/A';

      if (paymentDetails.length > 0) {
        // Get primary payment method
        paymentMode = paymentDetails.map(pd => pd.method || pd.paymentMethod).filter(Boolean).join(', ') || 'N/A';

        // Calculate cash details
        for (const pd of paymentDetails) {
          if (pd.method === 'cash' || pd.paymentMethod === 'cash') {
            cashReceived += this._toNumber(pd.cashReceived || pd.amount || 0);
            changeReturned += this._toNumber(pd.changeReturned || 0);
          }
        }
      }

      // Build comprehensive preview response
      const preview = {
        // Line items breakdown
        lineItems,

        // Subtotals and discounts
        grossSubTotal: this._toNumber(grossSubTotal),
        productDiscount: this._toNumber(productDiscountTotal),
        lineItemDiscount: this._toNumber(lineItemDiscountTotal),
        couponDiscount: this._toNumber(couponDiscount),
        totalDiscounts: this._toNumber(productDiscountTotal + lineItemDiscountTotal + couponDiscount),

        // Taxable value total (pure base value excluding any taxes)
        taxableValueTotal: this._toNumber(taxableValueTotal),

        // Discounted price (after all discounts, includes inclusive tax)
        discountedPrice: this._toNumber(discountedPrice),

        // Tax breakdown
        taxBreakdown: {
          inclusive: taxBreakdown.inclusive,
          exclusive: taxBreakdown.exclusive,
          inclusiveTotal: this._toNumber(taxBreakdown.inclusiveTotal),
          exclusiveTotal: this._toNumber(taxBreakdown.exclusiveTotal),
          taxTotal: this._toNumber(previewData.billingSummary?.taxTotal || 0),
        },

        // Rounding adjustment
        roundingAdjustment: this._toNumber(previewData.billingSummary?.roundingAdjustment || 0),

        // Grand total (total payable)
        grandTotal: this._toNumber(previewData.billingSummary?.grandTotal || 0),
        totalPayable: this._toNumber(previewData.billingSummary?.grandTotal || 0),

        // Payment instruments (applied after tax calculation)
        paymentInstruments: {
          loyaltyRedeemed: this._toNumber(loyaltyRedeemed),
          giftCardApplied: this._toNumber(giftCardApplied),
          totalInstruments: this._toNumber(loyaltyRedeemed + giftCardApplied),
        },

        // Payment summary
        amountPaid: this._toNumber(previewData.billingSummary?.amountPaid || 0),
        balanceDue: this._toNumber(previewData.billingSummary?.balanceDue || 0),

        // Payment details
        paymentMode: paymentMode.toUpperCase(),
        cashReceived: this._toNumber(cashReceived),
        changeReturned: this._toNumber(changeReturned),

        // Full billing summary for reference
        billingSummary: {
          subTotal: this._toNumber(previewData.billingSummary?.subTotal || 0),
          discountTotal: this._toNumber(previewData.billingSummary?.discountTotal || 0),
          couponDiscount: this._toNumber(couponDiscount),
          loyaltyDiscount: this._toNumber(previewData.billingSummary?.loyaltyDiscount || 0),
          giftCardDiscount: this._toNumber(previewData.billingSummary?.giftCardDiscount || 0),
          taxableAmount: this._toNumber(discountedPrice),
          taxTotal: this._toNumber(previewData.billingSummary?.taxTotal || 0),
          roundingAdjustment: this._toNumber(previewData.billingSummary?.roundingAdjustment || 0),
          grandTotal: this._toNumber(previewData.billingSummary?.grandTotal || 0),
          amountPaid: this._toNumber(previewData.billingSummary?.amountPaid || 0),
          balanceDue: this._toNumber(previewData.billingSummary?.balanceDue || 0),
        },

        // Applied taxes array
        appliedTaxes: previewData.appliedTaxes || [],

        // Coupon info
        coupon: previewData.coupon || null,

        // Loyalty info
        loyalty: previewData.loyalty || null,
        loyaltyRedemption: loyaltyRedemption || null,

        // Gift card info
        giftCard: previewData.giftCard || null,

        // Metadata
        preview: true,
        previewGeneratedAt: new Date(),
      };

      // Log final billing summary
      console.log('\n✅ === FINAL BILLING SUMMARY ===');
      console.log(`   SubTotal: ${preview.billingSummary.subTotal.toFixed(2)}`);
      console.log(`   Discounts: ${preview.productDiscount.toFixed(2)}`);
      console.log(`   Coupon Discount: ${preview.couponDiscount.toFixed(2)}`);
      console.log(`   Tax Total: ${preview.taxBreakdown.taxTotal.toFixed(2)}`);
      console.log(`   Rounding: ${preview.roundingAdjustment.toFixed(2)}`);
      console.log(`   Grand Total: ${preview.grandTotal.toFixed(2)}`);
      console.log(`   Amount Paid: ${preview.amountPaid.toFixed(2)}`);
      console.log(`   Balance Due: ${preview.balanceDue.toFixed(2)}`);
      console.log(`   Payment Status: ${preview.balanceDue === 0 ? 'completed' : 'pending'}`);
      if (loyaltyRedeemed > 0) {
        console.log(`   Loyalty Redeemed: ${preview.paymentInstruments.loyaltyRedeemed.toFixed(2)}`);
      }
      if (giftCardApplied > 0) {
        console.log(`   Gift Card Applied: ${preview.paymentInstruments.giftCardApplied.toFixed(2)}`);
      }
      console.log('================================\n');

      return preview;
    } catch (error) {
      throw new Error(`Failed to preview billing summary: ${error.message}`);
    }
  }

  /**
   * Preview billing summary by sale ID
   * Fetches an existing sale and generates a comprehensive billing preview
   * 
   * @param {String} saleId - Sale ID to fetch and preview
   * @returns {Promise<Object>} Preview billing summary with all fields from receipt
   */
  async previewBillingSummaryBySaleId(saleId) {
    try {
      this.validateObjectId(saleId);
      const sale = await this.getSaleById(saleId);

      // Convert sale document to plain object
      const saleData = sale.toObject ? sale.toObject() : sale;

      // ===== Populate missing sellingPrice and productDiscountPercent from Product data =====
      // For sales created before proper field population, fetch from Product collection
      const productsNeedingData = (saleData.products || []).filter(
        (item) => !item.sellingPrice || item.productDiscountPercent === undefined || item.productDiscountPercent === null
      );

      if (productsNeedingData.length > 0) {
        const productIds = productsNeedingData.map((p) => p.product);
        try {
          const ProductModel = await this.getModel('Product', ProductSchema, 'products');
          const products = await ProductModel.find({
            _id: { $in: productIds },
          })
            .select('_id sellingPrice discount hasVariation variantData')
            .lean();

          // Create a map of product ID to product data
          const productMap = new Map();
          for (const product of products) {
            productMap.set(product._id.toString(), {
              sellingPrice: product.sellingPrice,
              discount: product.discount || 0,
              hasVariation: product.hasVariation,
              variantData: product.variantData,
            });
          }

          // Also check for variant products where the item.product is a variant subdoc ID
          const foundIds = new Set(products.map((p) => p._id.toString()));
          const missingProductIds = productIds.filter(
            (id) => !foundIds.has(id?.toString())
          );
          if (missingProductIds.length > 0) {
            const parentProducts = await ProductModel.find({
              'variantData._id': { $in: missingProductIds },
            })
              .select('_id variantData')
              .lean();

            for (const parent of parentProducts) {
              if (parent.variantData) {
                for (const v of parent.variantData) {
                  if (v._id && missingProductIds.some(id => id?.toString() === v._id.toString())) {
                    productMap.set(v._id.toString(), {
                      sellingPrice: v.sellingPrice,
                      discount: v.discount || 0,
                      hasVariation: true,
                      variantData: null,
                    });
                  }
                }
              }
            }
          }

          // Update sale products with fetched data
          for (const item of saleData.products) {
            const productData = productMap.get(item.product?.toString());
            if (productData) {
              // Populate sellingPrice if missing
              if (!item.sellingPrice && !item.unitPrice) {
                // Check if this is a variant product by SKU
                if (productData.hasVariation && productData.variantData) {
                  const variant = productData.variantData.find(
                    (v) => v.SKU === item.SKU
                  );
                  if (variant) {
                    item.sellingPrice = this._toNumber(variant.sellingPrice);
                    // Also set productDiscountPercent from variant discount if not set
                    if (item.productDiscountPercent === undefined || item.productDiscountPercent === null) {
                      item.productDiscountPercent = this._toNumber(variant.discount || 0);
                    }
                  }
                }
                // Use main product price if not a variant or variant not found
                if (!item.sellingPrice) {
                  item.sellingPrice = this._toNumber(productData.sellingPrice);
                }
              }

              // Populate productDiscountPercent if missing (and not already set by variant)
              if (item.productDiscountPercent === undefined || item.productDiscountPercent === null) {
                item.productDiscountPercent = this._toNumber(productData.discount || 0);
              }
            }
          }
        } catch (error) {
          console.error('Failed to fetch product data for preview:', error);
          // Continue with stored values if fetch fails
        }
      }

      // Build payload structure expected by previewBillingSummary
      const previewPayload = {
        // Products array (already in correct format)
        products: saleData.products || [],

        // Billing summary (will be recalculated, but include existing values as fallback)
        billingSummary: {
          subTotal: saleData.billingSummary?.subTotal || 0,
          discountTotal: saleData.billingSummary?.discountTotal || 0,
          couponDiscount: saleData.billingSummary?.couponDiscount || 0,
          loyaltyDiscount: saleData.billingSummary?.loyaltyDiscount || 0,
          giftCardDiscount: saleData.billingSummary?.giftCardDiscount || 0,
          taxableAmount: saleData.billingSummary?.taxableAmount || 0,
          taxTotal: saleData.billingSummary?.taxTotal || 0,
          roundingAdjustment: saleData.billingSummary?.roundingAdjustment || 0,
          grandTotal: saleData.billingSummary?.grandTotal || 0,
          amountPaid: saleData.billingSummary?.amountPaid || 0,
          balanceDue: saleData.billingSummary?.balanceDue || 0,
        },

        // Coupon information (if applied)
        coupon: saleData.coupon ? {
          couponId: saleData.coupon.couponId,
          code: saleData.coupon.code,
          discountAmount: saleData.coupon.discountAmount,
        } : null,

        // Loyalty information (if applied)
        loyalty: saleData.loyalty ? {
          pointsRedeemed: saleData.loyalty.pointsRedeemed || 0,
          redemptionValue: saleData.loyalty.redemptionValue || 0,
          redemptionRule: saleData.loyalty.redemptionRule,
        } : null,

        // Gift card information (if applied)
        giftCard: saleData.giftCard ? {
          giftCardId: saleData.giftCard.giftCardId,
          number: saleData.giftCard.number,
          discountAmount: saleData.giftCard.discountAmount || saleData.giftCard.paymentAmount,
          paymentAmount: saleData.giftCard.paymentAmount || saleData.giftCard.discountAmount,
        } : null,

        // Payment details
        paymentDetails: saleData.paymentDetails || [],

        // Customer and store
        customer: saleData.customer || null,
        store: saleData.store || null,
        isWalkInCustomer: saleData.isWalkInCustomer || false,

        // Additional metadata
        saleDate: saleData.saleDate,
        invoiceNumber: saleData.invoiceNumber,
      };

      // ===== Build preview directly from persisted sale snapshot (no recalculation) =====

      const bs = saleData.billingSummary || {};

      // Get coupon discount to distribute proportionally to line items
      const couponDiscountTotal = this._toNumber(
        saleData.coupon?.discountAmount ||
        bs.couponDiscount ||
        0
      );

      // ===== FIRST PASS: Calculate base discounted amounts for each line item (before coupon) =====
      const lineItemsPreCoupon = (saleData.products || []).map((item) => {
        const quantity = this._toNumber(item.quantity || 1);

        // Get selling price: prefer sellingPrice (from product fetch), then stored values
        const sellingPrice = this._toNumber(
          item.sellingPrice ??
          item.unitPrice ??
          item.price ??
          0,
        );

        // grossAmount: selling price × quantity (before any discounts)
        let grossAmount;
        if (sellingPrice > 0) {
          grossAmount = this._toNumber(quantity * sellingPrice);
        } else {
          grossAmount = this._toNumber(item.grossAmount ?? 0);
        }

        // Get product discount percent (from product fetch if available)
        const productDiscountPercent = this._toNumber(item.productDiscountPercent || 0);

        // Calculate product discount amount from percentage (if we have grossAmount)
        let productDiscountAmount;
        if (productDiscountPercent > 0 && grossAmount > 0) {
          productDiscountAmount = this._toNumber(grossAmount * (productDiscountPercent / 100));
        } else {
          productDiscountAmount = this._toNumber(item.productDiscountAmount ?? 0);
        }

        // Line item discount calculation
        const storedDiscountAmount = this._toNumber(item.discountAmount || 0);
        let lineItemDiscount;
        let totalDiscount;

        if (productDiscountPercent > 0 && grossAmount > 0) {
          if (storedDiscountAmount >= productDiscountAmount) {
            lineItemDiscount = this._toNumber(storedDiscountAmount - productDiscountAmount);
            totalDiscount = storedDiscountAmount;
          } else {
            lineItemDiscount = storedDiscountAmount;
            totalDiscount = this._toNumber(productDiscountAmount + lineItemDiscount);
          }
        } else {
          lineItemDiscount = Math.max(0, storedDiscountAmount - productDiscountAmount);
          totalDiscount = storedDiscountAmount;
        }

        // Calculate discounted amount BEFORE coupon (for proportional distribution)
        const priceAfterProductDiscount = Math.max(0, grossAmount - productDiscountAmount);
        const discountedLineAmountPreCoupon = Math.max(0, priceAfterProductDiscount - lineItemDiscount);

        return {
          item,
          quantity,
          sellingPrice,
          grossAmount,
          productDiscountPercent,
          productDiscountAmount,
          lineItemDiscount,
          totalDiscount,
          discountedLineAmountPreCoupon,
        };
      });

      // Calculate total discounted amount (before coupon) for proportional distribution
      const totalDiscountedPreCoupon = lineItemsPreCoupon.reduce(
        (sum, li) => sum + li.discountedLineAmountPreCoupon,
        0
      );

      // ===== SECOND PASS: Calculate taxes with coupon discount distributed proportionally =====
      const lineItems = lineItemsPreCoupon.map((preCoupon) => {
        const {
          item,
          quantity,
          sellingPrice,
          grossAmount,
          productDiscountPercent,
          productDiscountAmount,
          lineItemDiscount,
          totalDiscount,
          discountedLineAmountPreCoupon
        } = preCoupon;

        // Calculate this line item's proportional share of coupon discount
        let couponShareForLineItem = 0;
        if (couponDiscountTotal > 0 && totalDiscountedPreCoupon > 0) {
          const proportion = discountedLineAmountPreCoupon / totalDiscountedPreCoupon;
          couponShareForLineItem = this._toNumber(couponDiscountTotal * proportion);
        }

        // Final discounted amount for tax calculation (includes coupon share)
        const discountedLineAmount = Math.max(0, discountedLineAmountPreCoupon - couponShareForLineItem);

        // Get stored tax values
        const storedTaxAmount = this._toNumber(item.taxAmount || 0);
        const storedInclusiveTax = this._toNumber(item.inclusiveTaxAmount || 0);
        const storedExclusiveTax = this._toNumber(item.exclusiveTaxAmount || 0);

        // Calculate netAmount and taxableValue
        // If we have sellingPrice, recalculate based on the correct formula
        let netAmount;
        let taxableValue;
        let inclusiveTaxAmount;
        let exclusiveTaxAmount;
        let taxAmount;

        // Recalculated tax snapshots for this line item
        let recalculatedTaxSnapshots = [];

        if (sellingPrice > 0 && item.taxSnapshots && item.taxSnapshots.length > 0) {
          // Recalculate tax from discountedLineAmount based on tax snapshots
          const inclusiveTaxes = item.taxSnapshots.filter(t => t.taxType === 'Inclusive');
          const exclusiveTaxes = item.taxSnapshots.filter(t => t.taxType === 'Exclusive');

          const inclusiveRate = inclusiveTaxes.reduce((sum, t) => sum + this._toNumber(t.percentage || 0), 0);
          const exclusiveRate = exclusiveTaxes.reduce((sum, t) => sum + this._toNumber(t.percentage || 0), 0);

          // Inclusive tax: Extract from discountedLineAmount
          // Base = discountedLineAmount / (1 + inclusiveRate/100)
          let baseAmount = discountedLineAmount;
          if (inclusiveRate > 0) {
            baseAmount = this._toNumber(discountedLineAmount / (1 + inclusiveRate / 100));
            inclusiveTaxAmount = this._toNumber(discountedLineAmount - baseAmount);
          } else {
            inclusiveTaxAmount = 0;
          }

          // taxableValue and netAmount are the base after extracting inclusive tax
          taxableValue = baseAmount;
          netAmount = baseAmount;

          // Exclusive tax: calculated on base amount
          if (exclusiveRate > 0) {
            exclusiveTaxAmount = this._toNumber(baseAmount * (exclusiveRate / 100));
          } else {
            exclusiveTaxAmount = 0;
          }

          taxAmount = this._toNumber(inclusiveTaxAmount + exclusiveTaxAmount);

          // Recalculate individual tax calculatedAmount proportionally
          recalculatedTaxSnapshots = item.taxSnapshots.map(taxSnap => {
            const snapPercentage = this._toNumber(taxSnap.percentage || 0);
            let recalculatedAmount = 0;

            if (taxSnap.taxType === 'Inclusive' && inclusiveRate > 0 && snapPercentage > 0) {
              // Proportional share of inclusive tax based on this tax's percentage
              recalculatedAmount = this._toNumber(inclusiveTaxAmount * (snapPercentage / inclusiveRate));
            } else if (taxSnap.taxType === 'Exclusive' && exclusiveRate > 0 && snapPercentage > 0) {
              // Proportional share of exclusive tax based on this tax's percentage
              recalculatedAmount = this._toNumber(exclusiveTaxAmount * (snapPercentage / exclusiveRate));
            }

            return {
              ...taxSnap,
              calculatedAmount: recalculatedAmount,
            };
          });
        } else {
          // Use stored values if no sellingPrice or no tax snapshots
          netAmount = this._toNumber(item.netAmount ?? (grossAmount - totalDiscount));
          taxableValue = this._toNumber(item.taxableValue ?? netAmount);
          inclusiveTaxAmount = storedInclusiveTax;
          exclusiveTaxAmount = storedExclusiveTax;
          taxAmount = storedTaxAmount;
        }

        // If grossAmount is 0 but we have other values, try to reconstruct it
        // grossAmount = taxableValue + inclusiveTax + totalDiscount (before any deductions)
        if (grossAmount === 0 && (netAmount > 0 || taxableValue > 0)) {
          grossAmount = this._toNumber(
            taxableValue + inclusiveTaxAmount + totalDiscount
          );
        }

        return {
          product: item.product,
          productName: item.productName || item.name || '',
          SKU: item.SKU || '',
          variantName: item.variantName || '',
          quantity,
          sellingPrice,
          grossAmount,
          productDiscountPercent,
          productDiscountAmount,
          lineItemDiscount,
          totalDiscount,
          couponShareForLineItem,
          // discountedGrossAmount: grossAmount - totalDiscount (no tax logic)
          discountedGrossAmount: this._toNumber(grossAmount - totalDiscount),
          // taxableValue: Pure value after discounts, excluding any taxes (inclusive or exclusive)
          taxableValue,
          taxAmount,
          inclusiveTaxAmount,
          exclusiveTaxAmount,
          // New: Array of tax snapshots for multiple taxes (use recalculated if available)
          taxSnapshots: recalculatedTaxSnapshots.length > 0 ? recalculatedTaxSnapshots : (item.taxSnapshots || []),
          // Legacy: Single tax snapshot for backward compatibility
          taxSnapshot: item.taxSnapshot || null,
          // Tax IDs for reference
          tenantTaxes: item.tenantTaxes || [],
        };
      });

      // Aggregate subtotals and discounts from line items
      const grossSubTotal = lineItems.reduce(
        (sum, item) => sum + item.grossAmount,
        0,
      );
      const productDiscountTotal = lineItems.reduce(
        (sum, item) => sum + item.productDiscountAmount,
        0,
      );
      const lineItemDiscountTotal = lineItems.reduce(
        (sum, item) => sum + item.lineItemDiscount,
        0,
      );
      // Sum of all taxable values (pure base value excluding any taxes)
      const taxableValueTotal = lineItems.reduce(
        (sum, item) => sum + item.taxableValue,
        0,
      );

      const couponDiscount = this._toNumber(bs.couponDiscount || 0);

      // Derive discounted price; prefer stored taxableAmount
      const discountedPrice = this._toNumber(
        bs.taxableAmount ??
        (grossSubTotal -
          productDiscountTotal -
          lineItemDiscountTotal -
          couponDiscount),
      );

      // Tax breakdown - rebuilt from RECALCULATED lineItems (not from stored appliedTaxes)
      // This ensures the taxBreakdown totals match the sum of line item taxes
      const appliedTaxesArray = Array.isArray(saleData.appliedTaxes)
        ? saleData.appliedTaxes
        : [];

      const taxBreakdown = {
        inclusive: [],
        exclusive: [],
        inclusiveTotal: 0,
        exclusiveTotal: 0,
      };

      // Build tax breakdown from recalculated lineItems (not from original saleData.products)
      const taxMap = new Map(); // Key: taxId or taxName + taxType, Value: aggregated tax entry

      for (const lineItem of lineItems) {
        // Prefer recalculated taxSnapshots array (has updated calculatedAmount)
        if (Array.isArray(lineItem.taxSnapshots) && lineItem.taxSnapshots.length > 0) {
          for (const taxSnap of lineItem.taxSnapshots) {
            if (taxSnap && taxSnap.taxType) {
              // Use taxId as key if available, otherwise use taxName + taxType
              const taxKey = taxSnap.taxId
                ? taxSnap.taxId.toString()
                : `${taxSnap.taxName || 'Tax'}_${taxSnap.taxType}`;

              const calculatedAmount = this._toNumber(taxSnap.calculatedAmount || 0);

              if (taxMap.has(taxKey)) {
                const existing = taxMap.get(taxKey);
                existing.amount += calculatedAmount;
              } else {
                taxMap.set(taxKey, {
                  taxId: taxSnap.taxId,
                  taxName: taxSnap.taxName || 'Tax',
                  taxType: taxSnap.taxType,
                  percentage: this._toNumber(taxSnap.percentage || 0),
                  fixedAmount: this._toNumber(taxSnap.fixedAmount || 0),
                  valueType: taxSnap.valueType,
                  amount: calculatedAmount,
                });
              }
            }
          }
        } else {
          // Fallback: Use recalculated inclusiveTaxAmount and exclusiveTaxAmount from lineItem
          const inclusiveTax = this._toNumber(lineItem.inclusiveTaxAmount || 0);
          const exclusiveTax = this._toNumber(lineItem.exclusiveTaxAmount || 0);

          if (inclusiveTax > 0) {
            const taxKey = 'Tax_Inclusive';
            if (taxMap.has(taxKey)) {
              taxMap.get(taxKey).amount += inclusiveTax;
            } else {
              taxMap.set(taxKey, {
                taxName: 'Tax',
                taxType: 'Inclusive',
                percentage: 0,
                amount: inclusiveTax,
              });
            }
          }

          if (exclusiveTax > 0) {
            const taxKey = 'Tax_Exclusive';
            if (taxMap.has(taxKey)) {
              taxMap.get(taxKey).amount += exclusiveTax;
            } else {
              taxMap.set(taxKey, {
                taxName: 'Tax',
                taxType: 'Exclusive',
                percentage: 0,
                amount: exclusiveTax,
              });
            }
          }
        }
      }

      // Convert map to arrays
      for (const taxEntry of taxMap.values()) {
        if (taxEntry.taxType === 'Inclusive') {
          taxBreakdown.inclusive.push(taxEntry);
          taxBreakdown.inclusiveTotal += taxEntry.amount;
        } else {
          taxBreakdown.exclusive.push(taxEntry);
          taxBreakdown.exclusiveTotal += taxEntry.amount;
        }
      }

      // If still no taxes found but billingSummary has taxTotal, create a generic entry
      if (taxBreakdown.inclusiveTotal === 0 && taxBreakdown.exclusiveTotal === 0 && bs.taxTotal > 0) {
        // Try to infer from billingSummary.taxTotal
        // Since we don't know the breakdown, we'll add it as exclusive (most common case)
        taxBreakdown.exclusive.push({
          taxName: 'Tax',
          taxType: 'Exclusive',
          percentage: 0,
          amount: this._toNumber(bs.taxTotal),
        });
        taxBreakdown.exclusiveTotal = this._toNumber(bs.taxTotal);
      }

      // Payment instruments from stored loyalty / gift card
      const loyaltyRedeemed = this._toNumber(
        previewPayload.loyalty?.redemptionValue ||
        bs.loyaltyDiscount ||
        0,
      );
      const giftCardApplied = this._toNumber(
        previewPayload.giftCard?.paymentAmount ||
        previewPayload.giftCard?.discountAmount ||
        bs.giftCardDiscount ||
        0,
      );

      // Payment details
      const paymentDetails = previewPayload.paymentDetails || [];
      let cashReceived = 0;
      let changeReturned = 0;
      let paymentMode = 'N/A';

      if (paymentDetails.length > 0) {
        paymentMode =
          paymentDetails
            .map((pd) => pd.method || pd.paymentMethod)
            .filter(Boolean)
            .join(', ') || 'N/A';

        for (const pd of paymentDetails) {
          if (pd.method === 'cash' || pd.paymentMethod === 'cash') {
            cashReceived += this._toNumber(
              pd.cashReceived || pd.amount || 0,
            );
            changeReturned += this._toNumber(pd.changeReturned || 0);
          }
        }
      }

      // Calculate the actual loyalty and gift card amounts from the objects (not just stored billingSummary)
      // These are payment instruments, but we want to show them in billingSummary for clarity
      const loyaltyPaymentAmount = this._toNumber(
        previewPayload.loyalty?.redemptionValue ||
        bs.loyaltyDiscount ||
        0,
      );
      const giftCardPaymentAmount = this._toNumber(
        previewPayload.giftCard?.paymentAmount ||
        previewPayload.giftCard?.discountAmount ||
        bs.giftCardDiscount ||
        0,
      );

      // Calculate grand total and rounding
      const grandTotalBeforeRounding = this._toNumber(bs.grandTotal || 0);

      // Calculate rounding adjustment to round grand total to nearest whole number
      const roundedGrandTotal = Math.round(grandTotalBeforeRounding);
      const calculatedRoundingAdjustment = this._toNumber(roundedGrandTotal - grandTotalBeforeRounding);

      // Use stored rounding adjustment if available, otherwise use calculated
      const roundingAdjustment = bs.roundingAdjustment !== undefined && bs.roundingAdjustment !== null
        ? this._toNumber(bs.roundingAdjustment)
        : calculatedRoundingAdjustment;

      // Final grand total is the rounded value
      const grandTotal = roundedGrandTotal;

      // Calculate net payable (what customer needs to pay after payment instruments)
      const totalPaymentInstruments = this._toNumber(loyaltyRedeemed + giftCardApplied);
      const netPayable = Math.max(0, grandTotal - totalPaymentInstruments);

      // Calculate actual cash payment needed (grandTotal - payment instruments)
      // If cashReceived from payment details is 0, use netPayable as the expected cash
      const actualCashReceived = cashReceived > 0 ? cashReceived : netPayable;

      // Change calculation: if customer paid more cash than netPayable
      const actualChangeReturned = changeReturned > 0
        ? changeReturned
        : Math.max(0, actualCashReceived - netPayable);

      const preview = {
        // Line items breakdown
        lineItems,

        // Subtotals and discounts
        grossSubTotal: this._toNumber(grossSubTotal),
        productDiscount: this._toNumber(productDiscountTotal),
        lineItemDiscount: this._toNumber(lineItemDiscountTotal),
        couponDiscount: this._toNumber(couponDiscount),
        totalDiscounts: this._toNumber(
          productDiscountTotal + lineItemDiscountTotal + couponDiscount,
        ),

        // Discounted price (after all discounts, includes inclusive tax)
        discountedPrice: this._toNumber(discountedPrice),

        // Taxable value total (sum of all line item taxable values, excludes any taxes)
        taxableValueTotal: this._toNumber(taxableValueTotal),

        // Tax breakdown
        taxBreakdown: {
          inclusive: taxBreakdown.inclusive,
          exclusive: taxBreakdown.exclusive,
          inclusiveTotal: this._toNumber(taxBreakdown.inclusiveTotal),
          exclusiveTotal: this._toNumber(taxBreakdown.exclusiveTotal),
          taxTotal: this._toNumber(bs.taxTotal || 0),
        },

        // Rounding adjustment
        roundingAdjustment: this._toNumber(roundingAdjustment),

        // Grand total (actual calculated value before rounding)
        grandTotal: this._toNumber(grandTotalBeforeRounding),

        // Rounded grand total (final payable amount, rounded to whole number)
        roundedGrandTotal: this._toNumber(roundedGrandTotal),

        // Net payable (what customer actually needs to pay after payment instruments)
        netPayable: this._toNumber(netPayable),

        // Total payable (same as roundedGrandTotal for backward compatibility)
        totalPayable: this._toNumber(roundedGrandTotal),

        // Payment instruments (applied AFTER grand total calculation)
        paymentInstruments: {
          loyaltyRedeemed: this._toNumber(loyaltyRedeemed),
          giftCardApplied: this._toNumber(giftCardApplied),
          totalInstruments: this._toNumber(totalPaymentInstruments),
        },

        // Payment summary
        amountPaid: this._toNumber(bs.amountPaid || grandTotal),
        balanceDue: this._toNumber(bs.balanceDue || 0),

        // Payment details
        paymentMode: paymentMode.toUpperCase(),
        cashReceived: this._toNumber(actualCashReceived),
        changeReturned: this._toNumber(actualChangeReturned),

        // Full billing summary snapshot
        // NOTE: loyaltyDiscount and giftCardDiscount represent payment instruments (not tax-affecting discounts)
        // They are shown here for display purposes to show the complete payment breakdown
        billingSummary: {
          subTotal: this._toNumber(bs.subTotal || 0),
          discountTotal: this._toNumber(bs.discountTotal || 0),
          couponDiscount: this._toNumber(bs.couponDiscount || 0),
          // Show loyalty and gift card amounts (as payment instruments, not discounts)
          loyaltyDiscount: this._toNumber(loyaltyPaymentAmount),
          giftCardDiscount: this._toNumber(giftCardPaymentAmount),
          taxableAmount: this._toNumber(bs.taxableAmount || 0),
          taxTotal: this._toNumber(bs.taxTotal || 0),
          roundingAdjustment: this._toNumber(roundingAdjustment),
          grandTotal: this._toNumber(grandTotalBeforeRounding),
          roundedGrandTotal: this._toNumber(roundedGrandTotal),
          // Net payable after payment instruments
          netPayable: this._toNumber(netPayable),
          amountPaid: this._toNumber(bs.amountPaid || roundedGrandTotal),
          balanceDue: this._toNumber(bs.balanceDue || 0),
        },

        // Applied taxes
        appliedTaxes: appliedTaxesArray.map((t) => ({
          ...t,
          amount: this._toNumber(t.amount),
        })),

        // Coupon / loyalty / gift card info
        coupon: previewPayload.coupon || null,
        loyalty: previewPayload.loyalty || null,
        loyaltyRedemption: null, // already baked into snapshot
        giftCard: previewPayload.giftCard || null,

        // Payment flow summary (for clear understanding)
        paymentFlow: {
          step1_grandTotal: this._toNumber(roundedGrandTotal), // Final payable amount (rounded)
          step2_loyaltyApplied: this._toNumber(loyaltyRedeemed),
          step3_giftCardApplied: this._toNumber(giftCardApplied),
          step4_netPayable: this._toNumber(netPayable),
          step5_cashReceived: this._toNumber(actualCashReceived),
          step6_changeReturned: this._toNumber(actualChangeReturned),
        },

        // Metadata
        preview: true,
        previewGeneratedAt: new Date(),

        // Sale-level metadata
        saleId,
        invoiceNumber: saleData.invoiceNumber,
        saleDate: saleData.saleDate,
        storeSnapshot: saleData.storeSnapshot || null,
        customerSnapshot: saleData.customerSnapshot || null,
      };

      return preview;
    } catch (error) {
      throw new Error(`Failed to preview billing summary by sale ID: ${error.message}`);
    }
  }

  /**
   * Apply coupon (if provided) to sale payload
   * Coupon discount is applied to the discounted selling price (after line item discounts)
   * Taxes will be recalculated after coupon is applied
   * @param {Object} data - Sale payload
   * @returns {Promise<{couponId: String}|null>}
   */
  async applyCouponIfPresent(data) {
    if (!data || !data.billingSummary) {
      return null;
    }

    const couponPayload = data.coupon || {};
    const couponCode = couponPayload.code || data.couponCode;
    const couponId = couponPayload.couponId;

    if (!couponCode && !couponId) {
      if (data.billingSummary.couponDiscount === undefined) {
        data.billingSummary.couponDiscount = 0;
      }
      return null;
    }

    if (!this.tenantCouponService) {
      throw new Error('Coupon service is not configured for this tenant');
    }

    // Get customerId for validation (if customer exists and not walk-in)
    const customerId = data.customer && !data.isWalkInCustomer
      ? data.customer.toString()
      : null;

    let coupon;
    if (couponCode) {
      // Validate coupon with customerId to check customer-specific eligibility
      coupon = await this.tenantCouponService.validateCoupon(couponCode, customerId);
    } else {
      // When using couponId, fetch and validate manually
      coupon = await this.tenantCouponService.getById(couponId);
      this._assertCouponIsUsable(coupon);

      // Check customer eligibility if customerId is provided
      if (customerId && !coupon.canBeUsedByCustomer(customerId)) {
        throw new Error('This coupon is not valid for this customer');
      }
    }

    const billingSummary = data.billingSummary;

    // Calculate coupon base: discounted selling price from products array
    // This is needed because applyCouponIfPresent is called BEFORE calculateBillingSummary
    // So billingSummary.subTotal may not be populated yet
    // 
    // IMPORTANT: Coupon is applied AFTER product/variant discounts
    // So we need to calculate: grossPrice - productDiscount - lineItemDiscount
    let discountedSellingPrice = 0;

    // Calculate from products array (most reliable at this stage)
    if (Array.isArray(data.products) && data.products.length > 0) {
      for (const item of data.products) {
        const quantity = this._toNumber(item.quantity || 1);
        const unitPrice = this._toNumber(item.unitPrice || item.price || 0);

        // Calculate gross line amount
        const grossLineAmount = this._toNumber(quantity * unitPrice);

        // Apply product/variant discount (percentage-based)
        const productDiscountPercent = this._toNumber(item.productDiscountPercent || 0);
        const productDiscountAmount = productDiscountPercent > 0
          ? this._toNumber(grossLineAmount * (productDiscountPercent / 100))
          : 0;

        // Price after product discount
        const priceAfterProductDiscount = Math.max(0, grossLineAmount - productDiscountAmount);

        // Apply line item discount (fixed amount)
        const lineItemDiscount = this._toNumber(item.discountAmount || 0);

        // Final discounted line amount (coupon base)
        const discountedLineAmount = Math.max(0, priceAfterProductDiscount - lineItemDiscount);

        discountedSellingPrice += discountedLineAmount;
      }
    }

    // Fallback to billingSummary if products calculation yields 0
    if (discountedSellingPrice <= 0) {
      discountedSellingPrice = this._toNumber(
        billingSummary.subTotal + billingSummary.discountTotal
      );
    }

    // Final fallback: use taxableAmount or grandTotal
    if (discountedSellingPrice <= 0) {
      discountedSellingPrice = this._toNumber(billingSummary.taxableAmount || billingSummary.grandTotal || 0);
    }

    const discount = Math.min(
      coupon.calculateDiscount(discountedSellingPrice),
      discountedSellingPrice
    );

    // Store coupon discount - taxes will be recalculated in calculateBillingSummary
    billingSummary.couponDiscount = this._toNumber(discount);

    data.coupon = {
      couponId: coupon._id,
      code: coupon.code,
      discountAmount: billingSummary.couponDiscount,
    };

    // Remove loose couponCode field to avoid persisting raw input
    if (data.couponCode) {
      delete data.couponCode;
    }

    // Log coupon application
    console.log('\n🎟️  === COUPON APPLICATION ===');
    console.log(`   Coupon Code: ${coupon.code}`);
    console.log(`   Coupon Type: ${coupon.type}`);
    console.log(`   Discount Rate: ${coupon.type === 'Percentage' ? `${coupon.discount_amount}%` : `$${coupon.discount_amount}`}`);
    console.log(`   Base Amount: ${discountedSellingPrice.toFixed(2)}`);
    console.log(`   Discount Applied: ${billingSummary.couponDiscount.toFixed(2)}`);
    console.log('==============================\n');

    return { couponId: coupon._id };
  }

  /**
   * Determine if loyalty should be awarded
   * @param {Object} data
   * @returns {Boolean}
   */
  _shouldAwardLoyalty(data) {
    return Boolean(data?.customer) && data?.isWalkInCustomer !== true;
  }

  /**
   * Inject loyalty payload when applicable
   * @param {Object} data - Sale payload
   * @returns {Promise<void>}
   */
  async applyLoyaltyIfEligible(data) {
    if (!data || !data.billingSummary) {
      return;
    }

    if (!this._shouldAwardLoyalty(data)) {
      delete data.loyalty;
      return;
    }

    if (!this.loyaltyPointService) {
      return;
    }

    const loyaltyConfig = await this.loyaltyPointService.getActive();

    if (!loyaltyConfig) {
      return;
    }

    const purchaseAmount = this._toNumber(data.billingSummary.grandTotal);
    const minimumSpend = this._toNumber(loyaltyConfig.minimumAmount);
    const pointsAwarded =
      purchaseAmount >= minimumSpend
        ? this._toNumber(loyaltyConfig.loyaltyPoints, 0)
        : 0;

    const existingLoyalty = data.loyalty || {};

    data.loyalty = {
      accrualRule: loyaltyConfig._id,
      redemptionRule: existingLoyalty.redemptionRule || null,
      pointsRedeemed: this._toNumber(existingLoyalty.pointsRedeemed, 0),
      redemptionValue: this._toNumber(existingLoyalty.redemptionValue),
      pointsAwarded,
    };
  }

  /**
   * Find the best redemption rule that uses maximum available points
   * Returns the rule that provides the best value for the customer's available points
   * @param {Number} availablePoints - Customer's available points
   * @returns {Promise<Object|null>} Best redemption rule or null
   */
  async _findBestRedemptionRuleForMaxPoints(availablePoints) {
    if (!this.loyaltyRedemptionRuleService) {
      return null;
    }

    try {
      // Get all active redemption rules
      const allRules = await this.loyaltyRedemptionRuleService.getActiveRules();

      if (!allRules || allRules.length === 0) {
        return null;
      }

      // Filter rules where customer has at least the minimum required points
      // Customer can use any rule where their availablePoints >= pointFrom
      const applicableRules = allRules.filter(
        (rule) => rule.pointFrom <= availablePoints
      );

      if (applicableRules.length === 0) {
        return null;
      }

      // For each applicable rule, calculate:
      // 1. The actual points the customer can redeem (min of availablePoints and pointTo)
      // 2. The discount amount they would receive
      // Then select the rule that gives the best discount
      const rulesWithRedemption = applicableRules.map((rule) => {
        // Customer can redeem up to their available points, but not more than rule's pointTo
        const pointsToRedeem = Math.min(availablePoints, rule.pointTo);
        return {
          rule,
          pointsToRedeem,
          discountAmount: this._toNumber(rule.amount, 0),
        };
      });

      // Sort by discount amount descending (best value first)
      // If same discount, prefer the one that uses fewer points
      rulesWithRedemption.sort((a, b) => {
        if (b.discountAmount !== a.discountAmount) {
          return b.discountAmount - a.discountAmount;
        }
        return a.pointsToRedeem - b.pointsToRedeem;
      });

      // Return the rule that provides best value
      const bestOption = rulesWithRedemption[0];

      return {
        rule: bestOption.rule,
        pointsToRedeem: bestOption.pointsToRedeem,
      };
    } catch (error) {
      console.error('Error finding best redemption rule:', error);
      return null;
    }
  }

  /**
   * Process loyalty point redemption as payment instrument (not a discount affecting tax)
   * Loyalty points are applied AFTER all taxes are calculated
   * They reduce the payable amount but do not affect the taxable base
   * @param {Object} data - Sale payload
   * @returns {Promise<Object|null>} Redemption context or null if no redemption
   */
  async processLoyaltyRedemption(data) {
    // Check if loyalty redemption is explicitly disabled
    // If pointsRedeemed is explicitly set to 0, skip redemption
    if (data.loyalty && data.loyalty.pointsRedeemed === 0) {
      return null;
    }

    // If loyalty object doesn't exist or is null, skip redemption
    if (!data.loyalty || data.loyalty === null) {
      return null;
    }

    // Redemption requires a registered customer (not walk-in)
    if (!data.customer || data.isWalkInCustomer) {
      // If loyalty object exists but customer is walk-in, silently skip (don't throw error)
      if (data.loyalty && data.loyalty.pointsRedeemed > 0) {
        throw new Error('Loyalty point redemption requires a registered customer');
      }
      return null;
    }

    // Check if required services are available
    if (!this.customerLoyaltyPointService || !this.loyaltyRedemptionRuleService) {
      throw new Error('Loyalty services not available');
    }

    // Get customer's available points
    const availablePoints = await this.customerLoyaltyPointService.getAvailablePoints(
      data.customer,
    );

    // If customer has no points, skip redemption
    if (availablePoints <= 0) {
      return null;
    }

    // Find the best redemption rule that uses maximum available points
    const bestRuleResult = await this._findBestRedemptionRuleForMaxPoints(availablePoints);

    if (!bestRuleResult || !bestRuleResult.rule) {
      // No applicable rule found - skip redemption silently
      return null;
    }

    const redemptionRule = bestRuleResult.rule;
    const pointsToRedeem = bestRuleResult.pointsToRedeem;

    // Validate points to redeem doesn't exceed available points
    if (pointsToRedeem > availablePoints) {
      throw new Error(
        `Insufficient loyalty points. Available: ${availablePoints}, Required for best rule: ${pointsToRedeem}`,
      );
    }

    // Get the payment amount from the rule
    const redemptionValue = this._toNumber(redemptionRule.amount, 0);

    if (redemptionValue <= 0) {
      throw new Error('Redemption rule has invalid payment amount');
    }

    // Apply loyalty points as payment - reduce balance due
    // Grand total remains the same (taxes are not affected)
    const billingSummary = data.billingSummary;
    const grandTotal = this._toNumber(billingSummary.grandTotal);

    // Calculate payment amount (redemption value, but not more than grandTotal)
    // This is a payment, not a discount - it doesn't affect tax calculation
    const paymentAmount = Math.min(redemptionValue, grandTotal);

    // Apply loyalty points as payment - reduce balance due
    // Grand total remains the same (taxes are not affected)
    const currentAmountPaid = this._toNumber(billingSummary.amountPaid || 0);
    const newAmountPaid = currentAmountPaid + paymentAmount;
    const newBalanceDue = Math.max(0, grandTotal - newAmountPaid);

    // Update billing summary
    billingSummary.amountPaid = this._toNumber(newAmountPaid);
    billingSummary.balanceDue = this._toNumber(newBalanceDue);

    // Store loyalty payment amount (for reference, not as discount)
    // Keep loyaltyDiscount as 0 to maintain backward compatibility
    billingSummary.loyaltyDiscount = 0;

    // Log loyalty points application
    const requestedPoints = data.loyalty?.pointsRedeemed || 0;
    const isAutoMax = requestedPoints === 0 || pointsToRedeem !== requestedPoints;

    console.log('\n🎁 === LOYALTY POINTS REDEMPTION (Payment Instrument) ===');
    if (isAutoMax && requestedPoints > 0) {
      console.log(`   Points Requested: ${requestedPoints} (auto-adjusted to max available)`);
    } else if (isAutoMax) {
      console.log(`   Points Requested: Auto (maximum available)`);
    } else {
      console.log(`   Points Requested: ${requestedPoints}`);
    }
    console.log(`   Points Redeemed: ${pointsToRedeem}`);
    console.log(`   Available Points: ${availablePoints}`);
    console.log(`   Redemption Value: ${redemptionValue.toFixed(2)}`);
    console.log(`   Payment Amount Applied: ${paymentAmount.toFixed(2)}`);
    console.log(`   Grand Total (unchanged): ${grandTotal.toFixed(2)}`);
    console.log(`   Amount Paid (before loyalty): ${currentAmountPaid.toFixed(2)}`);
    console.log(`   Amount Paid (after loyalty): ${newAmountPaid.toFixed(2)}`);
    console.log(`   Balance Due: ${newBalanceDue.toFixed(2)}`);
    console.log('========================================================\n');

    // Update loyalty data
    data.loyalty = {
      ...data.loyalty,
      pointsRedeemed: pointsToRedeem,
      redemptionValue: redemptionValue,
      redemptionRule: redemptionRule._id,
    };

    return {
      pointsToRedeem,
      redemptionValue: redemptionValue,
      redemptionRuleId: redemptionRule._id,
      redemptionRuleName: redemptionRule.ruleName,
    };
  }

  /**
   * Get the best redemption rule for a customer (uses maximum available points)
   * @param {String} customerId - Customer ID
   * @returns {Promise<Object|null>} Best redemption rule result or null
   */
  async getBestRedemptionRuleForCustomer(customerId) {
    try {
      if (!customerId) {
        throw new Error('Customer ID is required');
      }
      this.validateObjectId(customerId);

      // Check if required services are available
      if (!this.customerLoyaltyPointService || !this.loyaltyRedemptionRuleService) {
        throw new Error('Loyalty services not available');
      }

      // Get available points
      const availablePoints = await this.customerLoyaltyPointService.getAvailablePoints(
        customerId,
      );

      if (availablePoints <= 0) {
        return null;
      }

      // Find best rule for maximum points
      const bestRuleResult = await this._findBestRedemptionRuleForMaxPoints(availablePoints);

      if (!bestRuleResult || !bestRuleResult.rule) {
        return null;
      }

      return {
        availablePoints,
        pointsToRedeem: bestRuleResult.pointsToRedeem,
        rule: {
          _id: bestRuleResult.rule._id,
          ruleName: bestRuleResult.rule.ruleName,
          pointFrom: bestRuleResult.rule.pointFrom,
          pointTo: bestRuleResult.rule.pointTo,
          amount: this._toNumber(bestRuleResult.rule.amount, 0),
        },
        discountAmount: this._toNumber(bestRuleResult.rule.amount, 0),
      };
    } catch (error) {
      throw new Error(`Failed to get best redemption rule: ${error.message}`);
    }
  }

  /**
   * Validate loyalty point redemption before sale creation
   * If pointsToRedeem is not provided or 0, automatically finds best rule using maximum points
   * @param {String} customerId - Customer ID
   * @param {Number} pointsToRedeem - Number of points customer wants to redeem (optional, if not provided uses max)
   * @param {Object} options - Optional options { includeAvailableRules: boolean, autoFindMax: boolean }
   * @returns {Promise<Object>} Validation result with rule details and discount amount
   */
  async validateLoyaltyRedemption(customerId, pointsToRedeem, options = {}) {
    try {
      // Validate inputs
      if (!customerId) {
        throw new Error('Customer ID is required');
      }
      this.validateObjectId(customerId);

      // Check if required services are available
      if (!this.customerLoyaltyPointService || !this.loyaltyRedemptionRuleService) {
        throw new Error('Loyalty services not available');
      }

      // Validate customer exists and is registered (not walk-in)
      try {
        const CustomerModel = await this.getModel('Customer', null, 'customers');
        const customer = await CustomerModel.findById(customerId).lean();

        if (!customer) {
          throw new Error('Customer not found');
        }
      } catch (error) {
        if (error.message.includes('not found')) {
          throw error;
        }
        throw new Error(`Failed to validate customer: ${error.message}`);
      }

      // Get available points
      const availablePoints = await this.customerLoyaltyPointService.getAvailablePoints(
        customerId,
      );

      // Build validation result
      const result = {
        valid: false,
        customerId,
        pointsToRedeem: 0,
        availablePoints,
        errors: [],
        warnings: [],
        rule: null,
        discountAmount: 0,
        autoSelected: false, // Flag to indicate if rule was auto-selected
      };

      // If pointsToRedeem is not provided or 0, automatically find best rule
      const points = this._toNumber(pointsToRedeem, 0);
      let redemptionRule = null;
      let actualPointsToRedeem = points;

      if (points <= 0 || options.autoFindMax) {
        // Auto-find best rule using maximum points
        const bestRuleResult = await this._findBestRedemptionRuleForMaxPoints(availablePoints);

        if (bestRuleResult && bestRuleResult.rule) {
          redemptionRule = bestRuleResult.rule;
          actualPointsToRedeem = bestRuleResult.pointsToRedeem;
          result.autoSelected = true;
          result.pointsToRedeem = actualPointsToRedeem;
        } else {
          result.errors.push({
            code: 'NO_RULE_FOUND',
            message: `No applicable redemption rule found for available points (${availablePoints}).`,
          });
          return result;
        }
      } else {
        // Use specified points
        result.pointsToRedeem = points;
        actualPointsToRedeem = points;

        // Check available points
        if (availablePoints < points) {
          result.errors.push({
            code: 'INSUFFICIENT_POINTS',
            message: `Insufficient loyalty points. Available: ${availablePoints}, Requested: ${points}`,
          });
          return result;
        }

        // Find applicable redemption rule
        redemptionRule = await this.loyaltyRedemptionRuleService.findRuleByPoints(points);

        if (!redemptionRule) {
          result.errors.push({
            code: 'NO_RULE_FOUND',
            message: `No applicable redemption rule found for ${points} points. Points must fall within a configured redemption range.`,
          });
          return result;
        }
      }

      // Validate rule has valid discount amount
      const redemptionValue = this._toNumber(redemptionRule.amount, 0);

      if (redemptionValue <= 0) {
        result.errors.push({
          code: 'INVALID_RULE',
          message: 'Redemption rule has invalid discount amount',
        });
        return result;
      }

      // All validations passed
      result.valid = true;
      result.rule = {
        _id: redemptionRule._id,
        ruleName: redemptionRule.ruleName,
        pointFrom: redemptionRule.pointFrom,
        pointTo: redemptionRule.pointTo,
        amount: redemptionValue,
      };
      result.discountAmount = redemptionValue;
      result.pointsToRedeem = actualPointsToRedeem;

      // Optionally include all available redemption rules
      if (options.includeAvailableRules) {
        try {
          const availableRules = await this.loyaltyRedemptionRuleService.getActiveRules();
          result.availableRules = availableRules.map((rule) => ({
            _id: rule._id,
            ruleName: rule.ruleName,
            pointFrom: rule.pointFrom,
            pointTo: rule.pointTo,
            amount: rule.amount,
          }));
        } catch (error) {
          result.warnings.push({
            code: 'RULES_FETCH_FAILED',
            message: `Failed to fetch available rules: ${error.message}`,
          });
        }
      }

      return result;
    } catch (error) {
      throw new Error(`Failed to validate loyalty redemption: ${error.message}`);
    }
  }

  /**
   * Increment coupon usage but do not break sale flow if it fails
   * @param {String} couponId
   */
  async _incrementCouponUsageSafely(couponId) {
    if (!couponId || !this.tenantCouponService) {
      return;
    }

    try {
      await this.tenantCouponService.incrementUsage(couponId);
    } catch (error) {
      console.error('Failed to increment coupon usage', {
        couponId,
        error: error.message,
      });
    }
  }

  /**
   * Create a new sale
   * @param {Object} data - Sale data
   * @param {Object} options - Optional options { session }
   * @returns {Promise<Object>} Created sale document
   */
  async createSale(data, options = {}) {
    // Wrap entire logic in executeTenantTransaction
    // If external session provided via options, use it directly (skip new transaction)
    if (options.session) {
      return this._createSaleInternal(data, options.session, options);
    }

    return this.executeTenantTransaction(async (session) => {
      return this._createSaleInternal(data, session, options);
    });
  }

  /**
   * Internal create sale logic to be called within a transaction session
   * @param {Object} data 
   * @param {Object} session 
   * @param {Object} options 
   */
  async _createSaleInternal(data, session, options) {
    try {
      // TEMP FIX: Generate unique invoice number if missing or duplicate
      const Model = await this.getCachedModel();
      // NOTE: Reading for validation before write. To be safe in transaction,
      // we should pass session, but findOne is a read.
      if (data.invoiceNumber) {
        const existingProof = await Model.findOne({
          invoiceNumber: data.invoiceNumber,
        })
          .select('_id')
          .session(session);
        if (existingProof) {
          data.invoiceNumber = `INV-${Date.now()}-${Math.floor(
            Math.random() * 1000,
          )}`;
        }
      } else {
        data.invoiceNumber = `INV-${Date.now()}-${Math.floor(
          Math.random() * 1000,
        )}`;
      }

      // Validate required fields
      const requiredFields = [
        'store',
        'products',
        'billingSummary',
        'createdBy',
        'invoiceNumber',
      ];
      this.validateRequiredFields(data, requiredFields);

      // Validate store ID
      this.validateObjectId(data.store);
      this.validateObjectId(data.createdBy);

      // Validate products array
      if (!Array.isArray(data.products) || data.products.length === 0) {
        throw new Error('At least one product is required');
      }

      if (typeof data.customer === 'string' && data.customer.trim() === '') {
        delete data.customer;
      }

      // Initial log
      console.log('\n🛒 === SALE CREATION STARTED ===');
      console.log(`   Invoice Number: ${data.invoiceNumber || 'AUTO-GENERATE'}`);
      console.log(`   Store ID: ${data.store}`);
      console.log(`   Customer: ${data.customer || 'Walk-in'}`);
      console.log(`   Products Count: ${data.products?.length || 0}`);
      if (data.coupon?.code || data.couponCode) {
        console.log(`   Coupon: ${data.coupon?.code || data.couponCode}`);
      }
      if (data.loyalty) {
        console.log(`   Loyalty Redemption: ${data.loyalty.pointsRedeemed > 0 ? `${data.loyalty.pointsRedeemed} points` : 'Auto (max points)'}`);
      }
      if (data.giftCard?.number || data.giftCardNumber) {
        console.log(`   Gift Card: ${data.giftCard?.number || data.giftCardNumber}`);
      }
      console.log('================================\n');

      // Validate and log any data mismatches from frontend (for debugging)
      const validation = this.validateSalePayload(data, {
        autoFix: false,  // Don't auto-fix, we'll recalculate server-side
        logWarnings: true
      });

      // Pre-process payload (normalize payment details, hydrate product info)
      await this._prepareSalePayload(data);

      // Handle walk-in customer logic
      if (!data.customer && !data.isWalkInCustomer) {
        data.isWalkInCustomer = true;
      }

      // Create store snapshot
      data.storeSnapshot = await this.createStoreSnapshot(data.store);

      // Create customer snapshot
      if (data.isWalkInCustomer) {
        data.customerSnapshot = this.createWalkInCustomerSnapshot(
          data.storeSnapshot,
        );
      } else if (data.customer) {
        this.validateObjectId(data.customer);
        data.customerSnapshot = await this.createCustomerSnapshot(
          data.customer,
        );
      }

      // ====== NEW FLOW: Apply discounts BEFORE tax calculation ======
      // Initialize billing summary for discount calculations
      if (!data.billingSummary) {
        data.billingSummary = {
          subTotal: 0,
          discountTotal: 0,
          couponDiscount: 0,
          loyaltyDiscount: 0,
          giftCardDiscount: 0,
          taxableAmount: 0,
          taxTotal: 0,
          roundingAdjustment: this._toNumber(data.billingSummary?.roundingAdjustment || 0),
          grandTotal: 0,
          amountPaid: this._toNumber(data.billingSummary?.amountPaid || 0),
          balanceDue: 0,
        };
      }

      // Step 1: Apply coupon discount (if present) - set discount amount
      // This discount will be applied before tax calculation
      const couponContext = await this.applyCouponIfPresent(data);

      // Step 2: Apply loyalty points accrual (determines points to award)
      await this.applyLoyaltyIfEligible(data);

      // ====== SERVER-SIDE BILLING CALCULATION ======
      // This fetches taxes from DB and calculates everything correctly
      // NEW: Only coupon discount is applied BEFORE tax calculation
      // Handles: Inclusive/Exclusive taxes, line discounts, coupon discounts
      const billingResult = await this.calculateBillingSummary(data);
      data.products = billingResult.products;
      data.billingSummary = billingResult.billingSummary;
      data.appliedTaxes = billingResult.appliedTaxes;

      // Enrich products with additional snapshots (Category, SubCategory, Unit)
      // Tax snapshots are already created in calculateBillingSummary
      await this._enrichProductsWithSnapshots(data.products);

      // Create Audit Snapshot for Creator
      data.createdBySnapshot = await this._createAuditSnapshot(data.createdBy);

      // Step 3: Apply loyalty point redemption as payment instrument (AFTER all taxes are calculated)
      // Loyalty points do not affect tax calculation - they are payment instruments
      let redemptionContext = null;
      if (data.loyalty !== undefined && data.loyalty !== null) {
        try {
          redemptionContext = await this.processLoyaltyRedemption(data);
        } catch (error) {
          throw new Error(`Loyalty redemption failed: ${error.message}`);
        }
      }

      // Step 4: Apply gift card as payment instrument (AFTER all taxes are calculated)
      // Gift cards do not affect tax calculation - they are payment instruments
      let giftCardContext = null;
      if (data.giftCard?.number || data.giftCardNumber) {
        try {
          giftCardContext = await this.applyGiftCardIfPresent(data);
        } catch (error) {
          throw new Error(`Gift card application failed: ${error.message}`);
        }
      }

      // Calculate payment status if not provided
      if (!data.paymentStatus) {
        data.paymentStatus = this.calculatePaymentStatus(data.billingSummary);
      }

      // Final summary log
      console.log('\n✅ === FINAL BILLING SUMMARY ===');
      console.log(`   SubTotal: ${data.billingSummary.subTotal.toFixed(2)}`);
      console.log(`   Discounts: ${data.billingSummary.discountTotal.toFixed(2)}`);
      console.log(`   Coupon Discount: ${data.billingSummary.couponDiscount.toFixed(2)}`);
      console.log(`   Tax Total: ${data.billingSummary.taxTotal.toFixed(2)}`);
      console.log(`   Rounding: ${data.billingSummary.roundingAdjustment.toFixed(2)}`);
      console.log(`   Grand Total: ${data.billingSummary.grandTotal.toFixed(2)}`);
      console.log(`   Amount Paid: ${data.billingSummary.amountPaid.toFixed(2)}`);
      console.log(`   Balance Due: ${data.billingSummary.balanceDue.toFixed(2)}`);
      console.log(`   Payment Status: ${data.paymentStatus}`);
      if (redemptionContext) {
        console.log(`   Loyalty Points Applied: ${redemptionContext.pointsToRedeem} points (${redemptionContext.redemptionValue.toFixed(2)})`);
      }
      if (giftCardContext) {
        console.log(`   Gift Card Applied: ${giftCardContext.discount.toFixed(2)}`);
      }
      console.log('================================\n');

      // Create sale using base service - PASS SESSION
      const sale = await this.create(data, { ...options, session });

      // Update stock ONLY if sale is completed (not draft)
      if (sale.saleStatus === 'completed') {
        // Here we let error bubble up to abort transaction
        const Stock = await this.getModel('Stock', StockSchema, 'stocks');

        for (const item of data.products) {
          // Decrement stock using the Stock model's increment method with negative quantity
          // PASS SESSION via options
          await Stock.increment(
            item.product,
            data.store,
            item.SKU,
            -item.quantity,
            !!item.hasVariation,
            data.createdBy,
            { session }, // Pass session options
          );

          // Synchronize with StockBatch using FIFO
          if (this.stockBatchService) {
            await this.stockBatchService.decrementStockFIFO(
              item.product,
              data.store,
              item.SKU,
              item.quantity,
              data.createdBy,
              { session }, // Pass session options
            );
          }
        }
      }

      // Increment coupon usage within transaction (global + per-customer)
      // If this fails, the entire transaction should rollback to maintain data consistency
      if (couponContext?.couponId) {
        if (this.tenantCouponService) {
          try {
            await this.tenantCouponService.incrementUsage(
              couponContext.couponId,
              {
                session,
                customerId: data.customer && !data.isWalkInCustomer ? data.customer : null,
              },
            );
          } catch (error) {
            // In a transaction context, we should let the error propagate
            // to ensure atomicity: either the sale and coupon increment both succeed, or both fail
            console.error('Failed to increment coupon usage', {
              couponId: couponContext.couponId,
              customerId: data.customer,
              error: error.message,
            });
            throw new Error(
              `Failed to increment coupon usage: ${error.message}. Sale transaction aborted.`,
            );
          }
        }
      }

      // Record gift card usage within transaction
      // Gift card can only be used once per customer (no partial usage)
      if (giftCardContext?.giftCardId) {
        if (this.giftCardService) {
          try {
            await this.giftCardService.recordUsage(
              giftCardContext.giftCardId,
              data.customer && !data.isWalkInCustomer ? data.customer : null,
              sale._id,
              giftCardContext.discount,
              { session },
            );
          } catch (error) {
            // In a transaction context, we should let the error propagate
            console.error('Failed to record gift card usage', {
              giftCardId: giftCardContext.giftCardId,
              customerId: data.customer,
              error: error.message,
            });
            throw new Error(
              `Failed to record gift card usage: ${error.message}. Sale transaction aborted.`,
            );
          }
        }
      }

      // Process loyalty point redemption within transaction
      // Deduct points from CustomerLoyaltyPoint if redemption was requested
      if (
        sale.saleStatus === 'completed' &&
        redemptionContext &&
        this.customerLoyaltyPointService
      ) {
        try {
          const redemptionResult = await this.customerLoyaltyPointService.redeemPoints({
            customerId: data.customer,
            pointsToRedeem: redemptionContext.pointsToRedeem,
            sourceId: sale._id,
            sourceModel: 'Sales',
            redemptionValue: redemptionContext.redemptionValue,
            redemptionRuleId: redemptionContext.redemptionRuleId,
            createdBy: data.createdBy,
            description: `Redeemed ${redemptionContext.pointsToRedeem} points for sale ${sale.invoiceNumber}`,
            options: { session },
          });

          // Update sale with redemption transaction reference
          if (redemptionResult?.redemptionTransaction) {
            sale.loyalty = {
              ...sale.loyalty,
              redemptionTransactionId: redemptionResult.redemptionTransaction._id,
            };
            await sale.save({ session });
          }
        } catch (error) {
          // In a transaction context, we should let the error propagate
          // to ensure atomicity: either the sale and point redemption both succeed, or both fail
          console.error('Failed to redeem loyalty points', {
            customerId: data.customer,
            saleId: sale._id,
            pointsToRedeem: redemptionContext.pointsToRedeem,
            error: error.message,
          });
          throw new Error(
            `Failed to redeem loyalty points: ${error.message}. Sale transaction aborted.`,
          );
        }
      }

      // Award loyalty points to customer within transaction
      // Only award points for completed sales with a registered customer (not walk-in)
      if (
        sale.saleStatus === 'completed' &&
        data.customer &&
        !data.isWalkInCustomer &&
        this.customerLoyaltyPointService
      ) {
        try {
          const purchaseAmount = this._toNumber(data.billingSummary?.grandTotal);

          if (purchaseAmount > 0) {
            const loyaltyTransaction = await this.customerLoyaltyPointService.awardPoints({
              customerId: data.customer,
              purchaseAmount,
              sourceId: sale._id,
              sourceModel: 'Sales',
              createdBy: data.createdBy,
              description: `Earned loyalty points for sale ${sale.invoiceNumber}`,
              options: { session },
            });

            // Update sale with loyalty points awarded info if points were awarded
            if (loyaltyTransaction) {
              sale.loyalty = {
                ...sale.loyalty,
                pointsAwarded: loyaltyTransaction.points,
                accrualRule: loyaltyTransaction.loyaltyPointConfigId,
                loyaltyTransactionId: loyaltyTransaction._id,
              };
              await sale.save({ session });
            }
          }
        } catch (error) {
          // In a transaction context, we should let the error propagate
          // to ensure atomicity: either the sale and loyalty points both succeed, or both fail
          console.error('Failed to award loyalty points', {
            customerId: data.customer,
            saleId: sale._id,
            error: error.message,
          });
          throw new Error(
            `Failed to award loyalty points: ${error.message}. Sale transaction aborted.`,
          );
        }
      }

      return sale;
    } catch (error) {
      throw new Error(`Failed to create sale: ${error.message}`);
    }
  }

  /**
   * Get sale by ID
   * @param {String} id - Sale ID
   * @param {Object} options - Optional options { populate }
   * @returns {Promise<Object>} Sale document
   */
  async getSaleById(id, options = {}) {
    try {
      this.validateObjectId(id);

      const Model = await this.getCachedModel();
      let query = Model.findById(id);

      // Exclude soft-deleted sales
      query = query.where({ isDeleted: false });

      // Populate if specified
      if (options.populate) {
        query = query.populate(options.populate);
      }

      const sale = await query.exec();

      if (!sale) {
        throw new Error(`Sale with id ${id} not found`);
      }

      return sale;
    } catch (error) {
      throw new Error(`Failed to retrieve sale: ${error.message}`);
    }
  }

  /**
   * Get sale by invoice number
   * @param {String} invoiceNumber - Invoice number
   * @param {Object} options - Optional options { populate }
   * @returns {Promise<Object>} Sale document
   */
  async getSaleByInvoiceNumber(invoiceNumber, options = {}) {
    try {
      if (!invoiceNumber || typeof invoiceNumber !== 'string') {
        throw new Error('Invoice number must be a valid string');
      }

      const Model = await this.getCachedModel();
      let query = Model.findOne({
        invoiceNumber: invoiceNumber.toUpperCase().trim(),
        isDeleted: false,
      });

      // Populate if specified
      if (options.populate) {
        query = query.populate(options.populate);
      }

      const sale = await query.exec();

      if (!sale) {
        throw new Error(`Sale with invoice number ${invoiceNumber} not found`);
      }

      return sale;
    } catch (error) {
      throw new Error(
        `Failed to retrieve sale by invoice number: ${error.message}`,
      );
    }
  }

  /**
   * Update sale by ID
   * @param {String} id - Sale ID
   * @param {Object} data - Update data
   * @param {Object} options - Optional options { session }
   * @returns {Promise<Object>} Updated sale document
   */
  async updateSale(id, data, options = {}) {
    try {
      this.validateObjectId(id);

      if (!data || typeof data !== 'object') {
        throw new Error('Update data must be a valid object');
      }

      // Ensure updatedBy is set
      if (!data.updatedBy) {
        throw new Error('updatedBy is required for sale updates');
      }
      this.validateObjectId(data.updatedBy);

      // Check if sale exists and is not deleted
      const existingSale = await this.getSaleById(id);
      if (!existingSale) {
        throw new Error(`Sale with id ${id} not found`);
      }

      // Prevent updating invoice number
      if (
        data.invoiceNumber &&
        data.invoiceNumber !== existingSale.invoiceNumber
      ) {
        throw new Error('Invoice number cannot be changed after creation');
      }

      // Recalculate payment status if billing summary is updated
      if (data.billingSummary) {
        data.paymentStatus = this.calculatePaymentStatus(data.billingSummary);
      }

      // Pre-process payload to populate missing fields (netAmount, method, etc.)
      await this._prepareSalePayload(data);


      // --- Snapshot updates ---

      // If customer is changing, update customer snapshot
      if (data.customer) {
        this.validateObjectId(data.customer);
        // If switching to valid customer ID
        data.customerSnapshot = await this.createCustomerSnapshot(
          data.customer,
        );
        data.isWalkInCustomer = false;
      } else if (data.isWalkInCustomer === true) {
        // If switching to walk-in, and store is either in data or existing
        const storeId = data.store || existingSale.store;
        const storeSnapshot = data.store
          ? await this.createStoreSnapshot(data.store) // if store changed
          : existingSale.storeSnapshot || (await this.createStoreSnapshot(storeId));

        data.customerSnapshot = this.createWalkInCustomerSnapshot(storeSnapshot);
        data.customer = null; // Clear customer ref
      }

      // If store is changing, update store snapshot
      if (data.store) {
        this.validateObjectId(data.store);
        data.storeSnapshot = await this.createStoreSnapshot(data.store);
      }

      // If products are changing, enrich with snapshots
      if (Array.isArray(data.products) && data.products.length > 0) {
        await this._enrichProductsWithSnapshots(data.products);
      }

      // Update Audit Snapshot for Updater
      if (data.updatedBy) {
        data.updatedBySnapshot = await this._createAuditSnapshot(data.updatedBy);
      }

      // If createdBy is somehow changing (e.g. admin fix), update its snapshot too
      if (data.createdBy) {
        data.createdBySnapshot = await this._createAuditSnapshot(data.createdBy);
      }

      // Update sale using base service
      const updatedSale = await this.updateById(id, data);
      return updatedSale;
    } catch (error) {
      throw new Error(`Failed to update sale: ${error.message}`);
    }
  }

  /**
   * Delete sale by ID (hard delete)
   * @param {String} id - Sale ID
   * @param {Object} options - Optional options { session }
   * @returns {Promise<Object>} Deleted sale document
   */
  async deleteSale(id, options = {}) {
    try {
      this.validateObjectId(id);

      // Check if sale exists
      const sale = await this.getSaleById(id);
      if (!sale) {
        throw new Error(`Sale with id ${id} not found`);
      }

      // Perform hard delete using base service
      const deletedSale = await this.deleteById(id);
      return deletedSale;
    } catch (error) {
      throw new Error(`Failed to delete sale: ${error.message}`);
    }
  }

  /**
   * Approve payment and complete sale (for draft sales)
   * @param {String} saleId - Sale ID
   * @param {Object} paymentData - Payment details { method, amount, referenceNumber, provider, metadata }
   * @param {String} userId - User approving the payment
   * @returns {Promise<Object>} Updated sale
   */
  async approveSalePayment(saleId, paymentData, userId) {
    try {
      this.validateObjectId(saleId);
      this.validateObjectId(userId);

      const Model = await this.getCachedModel();
      const sale = await Model.findById(saleId);

      if (!sale) {
        throw new Error('Sale not found');
      }

      if (sale.saleStatus !== 'draft') {
        throw new Error(
          'Only draft sales can be approved. Current status: ' +
          sale.saleStatus,
        );
      }

      // Validate payment data
      if (!paymentData.method) {
        throw new Error('Payment method is required');
      }

      if (!paymentData.amount || paymentData.amount <= 0) {
        throw new Error('Payment amount must be greater than 0');
      }

      // Add payment details
      if (!sale.paymentDetails) {
        sale.paymentDetails = [];
      }

      const paymentDetail = {
        method: paymentData.method,
        amount: paymentData.amount,
        referenceNumber: paymentData.referenceNumber || null,
        provider: paymentData.provider || null,
        status: 'completed',
        paidAt: new Date(),
        metadata: paymentData.metadata || null,
      };

      // Calculate cashReceived and changeReturned for cash payments
      if (paymentData.method === 'cash') {
        const amount = this._toNumber(paymentData.amount || 0);
        const cashReceived = this._toNumber(paymentData.cashReceived || 0);

        if (cashReceived > 0) {
          paymentDetail.cashReceived = cashReceived;
          paymentDetail.changeReturned = Math.max(0, cashReceived - amount);
        } else {
          // If cashReceived is not provided, assume no change (cashReceived = amount)
          paymentDetail.cashReceived = amount;
          paymentDetail.changeReturned = 0;
        }
      } else {
        // For non-cash payments, set to 0
        paymentDetail.cashReceived = 0;
        paymentDetail.changeReturned = 0;
      }

      sale.paymentDetails.push(paymentDetail);

      // Update billing summary
      sale.billingSummary.amountPaid =
        (sale.billingSummary.amountPaid || 0) + paymentData.amount;
      sale.billingSummary.balanceDue =
        sale.billingSummary.grandTotal - sale.billingSummary.amountPaid;

      // Update payment status
      if (sale.billingSummary.balanceDue <= 0) {
        sale.paymentStatus = 'completed';
        sale.billingSummary.balanceDue = 0; // Ensure no negative balance
      } else {
        sale.paymentStatus = 'pending';
      }

      // Change sale status to completed
      sale.saleStatus = 'completed';
      sale.fulfillmentStatus = 'fulfilled';
      sale.updatedBy = userId;

      await sale.save();

      // NOW decrement stock (this is the key change!)
      try {
        const Stock = await this.getModel('Stock', null, 'stocks');

        for (const item of sale.products) {
          await Stock.increment(
            item.product,
            sale.store,
            item.SKU,
            -item.quantity,
            !!item.hasVariation,
            userId,
          );

          // Synchronize with StockBatch using FIFO
          if (this.stockBatchService) {
            await this.stockBatchService.decrementStockFIFO(
              item.product,
              sale.store,
              item.SKU,
              item.quantity,
              userId,
            );
          }
        }
      } catch (stockError) {
        console.error(
          'Stock update failed for sale:',
          sale._id,
          'Error:',
          stockError.message,
        );
        // Consider reverting sale status or flagging for manual review
        throw new Error(
          `Sale approved but stock update failed: ${stockError.message}`,
        );
      }

      return sale;
    } catch (error) {
      throw new Error(`Failed to approve payment: ${error.message}`);
    }
  }

  /**
   * Soft delete sale by ID
   * @param {String} id - Sale ID
   * @param {Object} options - Optional options { session }
   * @returns {Promise<Object>} Updated sale document
   */
  async softDeleteSale(id, options = {}) {
    try {
      this.validateObjectId(id);

      // Check if sale exists
      const sale = await this.getSaleById(id);
      if (!sale) {
        throw new Error(`Sale with id ${id} not found`);
      }

      // Perform soft delete using base service
      const deletedSale = await this.softDeleteById(id);
      return deletedSale;
    } catch (error) {
      throw new Error(`Failed to soft delete sale: ${error.message}`);
    }
  }

  /**
   * Restore soft-deleted sale
   * @param {String} id - Sale ID
   * @param {Object} options - Optional options { session }
   * @returns {Promise<Object>} Restored sale document
   */
  async restoreSale(id, options = {}) {
    try {
      this.validateObjectId(id);

      const Model = await this.getCachedModel();
      const sale = await Model.findById(id);

      if (!sale) {
        throw new Error(`Sale with id ${id} not found`);
      }

      if (!sale.isDeleted) {
        throw new Error(`Sale with id ${id} is not deleted`);
      }

      // Restore using base service
      const restoredSale = await this.restoreById(id);
      return restoredSale;
    } catch (error) {
      throw new Error(`Failed to restore sale: ${error.message}`);
    }
  }

  /**
   * List sales with pagination, filtering, and search
   * @param {Object} queryParams - Query parameters
   * @param {boolean|string} [queryParams.all] - If true, fetch all matching records without pagination; returns { data, total }
   * @returns {Promise<Object>} When all=false: { data, pagination }. When all=true: { data, total }
   */
  async listSales(queryParams = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        search = '',
        paymentStatus,
        saleStatus,
        fulfillmentStatus,
        storeId,
        customerId,
        isWalkInCustomer,
        startDate,
        endDate,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        populate = null,
        all = false,
        ...rest
      } = queryParams;

      // Build filter object
      const filters = {
        isDeleted: false,
        ...rest,
      };

      // Apply payment status filter
      if (paymentStatus) {
        filters.paymentStatus = paymentStatus;
      }

      // Apply sale status filter
      if (saleStatus) {
        filters.saleStatus = saleStatus;
      }

      // Apply fulfillment status filter
      if (fulfillmentStatus) {
        filters.fulfillmentStatus = fulfillmentStatus;
      }

      // Apply store filter
      if (storeId) {
        this.validateObjectId(storeId);
        filters.store = storeId;
      }

      // Apply customer filter
      if (customerId) {
        this.validateObjectId(customerId);
        filters.customer = customerId;
      }

      // Apply walk-in customer filter
      if (isWalkInCustomer !== undefined) {
        filters.isWalkInCustomer =
          isWalkInCustomer === 'true' || isWalkInCustomer === true;
      }

      // Apply date range filter
      if (startDate || endDate) {
        filters.saleDate = {};
        if (startDate) {
          filters.saleDate.$gte = new Date(startDate);
        }
        if (endDate) {
          filters.saleDate.$lte = new Date(endDate);
        }
      }

      const shouldFetchAll = all === true || all === 'true';

      // Use base service list method with search fields
      const result = await super.list({
        page: shouldFetchAll ? 1 : page,
        limit: shouldFetchAll ? 100000 : limit,
        search,
        searchFields: [
          'invoiceNumber',
          'customerSnapshot.customerName',
          'customerSnapshot.phone',
        ],
        sortBy,
        sortOrder,
        filters,
        populate,
      });

      if (shouldFetchAll) {
        return {
          data: result.data,
          total: result.pagination?.totalItems ?? result.data?.length ?? 0,
        };
      }

      return result;
    } catch (error) {
      throw new Error(`Failed to list sales: ${error.message}`);
    }
  }

  /**
   * Get sales by store
   * @param {String} storeId - Store ID
   * @param {Object} options - Optional options { sort, populate, limit }
   * @returns {Promise<Array>} Array of sale documents
   */
  async getSalesByStore(storeId, options = {}) {
    try {
      this.validateObjectId(storeId);

      const Model = await this.getCachedModel();
      const query = Model.find({
        store: storeId,
        isDeleted: false,
      });

      // Apply sorting
      if (options.sort) {
        query.sort(options.sort);
      } else {
        query.sort({ saleDate: -1 });
      }

      // Apply limit
      if (options.limit) {
        query.limit(parseInt(options.limit));
      }

      // Apply populate
      if (options.populate) {
        query.populate(options.populate);
      }

      const sales = await query.exec();
      return sales;
    } catch (error) {
      throw new Error(`Failed to retrieve sales by store: ${error.message}`);
    }
  }

  /**
   * Get sales by customer
   * @param {String} customerId - Customer ID
   * @param {Object} options - Optional options { sort, populate, limit }
   * @returns {Promise<Array>} Array of sale documents
   */
  async getSalesByCustomer(customerId, options = {}) {
    try {
      this.validateObjectId(customerId);

      const Model = await this.getCachedModel();
      const query = Model.find({
        customer: customerId,
        isDeleted: false,
      });

      // Apply sorting
      if (options.sort) {
        query.sort(options.sort);
      } else {
        query.sort({ saleDate: -1 });
      }

      // Apply limit
      if (options.limit) {
        query.limit(parseInt(options.limit));
      }

      // Apply populate
      if (options.populate) {
        query.populate(options.populate);
      }

      const sales = await query.exec();
      return sales;
    } catch (error) {
      throw new Error(`Failed to retrieve sales by customer: ${error.message}`);
    }
  }

  /**
   * Get sales by date range
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @param {Object} options - Optional options { sort, populate }
   * @returns {Promise<Array>} Array of sale documents
   */
  async getSalesByDateRange(startDate, endDate, options = {}) {
    try {
      if (!startDate || !endDate) {
        throw new Error('Start date and end date are required');
      }

      const Model = await this.getCachedModel();
      const query = Model.find({
        saleDate: {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        },
        isDeleted: false,
      });

      // Apply sorting
      if (options.sort) {
        query.sort(options.sort);
      } else {
        query.sort({ saleDate: -1 });
      }

      // Apply populate
      if (options.populate) {
        query.populate(options.populate);
      }

      const sales = await query.exec();
      return sales;
    } catch (error) {
      throw new Error(
        `Failed to retrieve sales by date range: ${error.message}`,
      );
    }
  }

  /**
   * Get sales by payment status
   * @param {String} status - Payment status
   * @param {Object} options - Optional options { sort, populate }
   * @returns {Promise<Array>} Array of sale documents
   */
  async getSalesByPaymentStatus(status, options = {}) {
    try {
      if (!['pending', 'completed'].includes(status)) {
        throw new Error('Payment status must be either pending or completed');
      }

      const Model = await this.getCachedModel();
      const query = Model.find({
        paymentStatus: status,
        isDeleted: false,
      });

      // Apply sorting
      if (options.sort) {
        query.sort(options.sort);
      } else {
        query.sort({ saleDate: -1 });
      }

      // Apply populate
      if (options.populate) {
        query.populate(options.populate);
      }

      const sales = await query.exec();
      return sales;
    } catch (error) {
      throw new Error(
        `Failed to retrieve sales by payment status: ${error.message}`,
      );
    }
  }

  /**
   * Get sales by fulfillment status
   * @param {String} status - Fulfillment status
   * @param {Object} options - Optional options { sort, populate }
   * @returns {Promise<Array>} Array of sale documents
   */
  async getSalesByFulfillmentStatus(status, options = {}) {
    try {
      if (!['pending', 'fulfilled', 'returned'].includes(status)) {
        throw new Error(
          'Fulfillment status must be pending, fulfilled, or returned',
        );
      }

      const Model = await this.getCachedModel();
      const query = Model.find({
        fulfillmentStatus: status,
        isDeleted: false,
      });

      // Apply sorting
      if (options.sort) {
        query.sort(options.sort);
      } else {
        query.sort({ saleDate: -1 });
      }

      // Apply populate
      if (options.populate) {
        query.populate(options.populate);
      }

      const sales = await query.exec();
      return sales;
    } catch (error) {
      throw new Error(
        `Failed to retrieve sales by fulfillment status: ${error.message}`,
      );
    }
  }

  /**
   * Update payment status
   * @param {String} id - Sale ID
   * @param {Object} paymentData - Payment data
   * @param {String} updatedBy - User ID who updated
   * @returns {Promise<Object>} Updated sale document
   */
  async updatePaymentStatus(id, paymentData, updatedBy) {
    try {
      this.validateObjectId(id);
      this.validateObjectId(updatedBy);

      const sale = await this.getSaleById(id);
      if (!sale) {
        throw new Error(`Sale with id ${id} not found`);
      }

      const updateData = {
        updatedBy,
      };

      if (paymentData.paymentStatus) {
        updateData.paymentStatus = paymentData.paymentStatus;
      }

      if (paymentData.billingSummary) {
        updateData.billingSummary = {
          ...sale.billingSummary,
          ...paymentData.billingSummary,
        };
        updateData.paymentStatus = this.calculatePaymentStatus(
          updateData.billingSummary,
        );
      }

      const updatedSale = await this.updateById(id, updateData);
      return updatedSale;
    } catch (error) {
      throw new Error(`Failed to update payment status: ${error.message}`);
    }
  }

  /**
   * Add payment detail
   * @param {String} id - Sale ID
   * @param {Object} paymentDetail - Payment detail object
   * @param {String} updatedBy - User ID who updated
   * @returns {Promise<Object>} Updated sale document
   */
  async addPaymentDetail(id, paymentDetail, updatedBy) {
    try {
      this.validateObjectId(id);
      this.validateObjectId(updatedBy);

      const sale = await this.getSaleById(id);
      if (!sale) {
        throw new Error(`Sale with id ${id} not found`);
      }

      // Validate payment method
      const validMethods = [
        'cash',
        'card',
        'upi',
        'wallet',
        'bank_transfer',
        'split',
        'other',
      ];
      if (!validMethods.includes(paymentDetail.method)) {
        throw new Error(`Invalid payment method: ${paymentDetail.method}`);
      }

      // Add payment detail
      const paymentDetails = sale.paymentDetails || [];

      // Prepare payment detail object
      const newPaymentDetail = {
        ...paymentDetail,
        paidAt: paymentDetail.paidAt || new Date(),
      };

      // Calculate cashReceived and changeReturned for cash payments
      if (paymentDetail.method === 'cash') {
        const amount = this._toNumber(paymentDetail.amount || 0);
        const cashReceived = this._toNumber(paymentDetail.cashReceived || 0);

        if (cashReceived > 0) {
          newPaymentDetail.cashReceived = cashReceived;
          newPaymentDetail.changeReturned = Math.max(0, cashReceived - amount);
        } else {
          // If cashReceived is not provided, assume no change (cashReceived = amount)
          newPaymentDetail.cashReceived = amount;
          newPaymentDetail.changeReturned = 0;
        }
      } else {
        // For non-cash payments, set to 0
        newPaymentDetail.cashReceived = 0;
        newPaymentDetail.changeReturned = 0;
      }

      paymentDetails.push(newPaymentDetail);

      // Update amount paid
      const totalPaid = paymentDetails.reduce(
        (sum, p) => sum + (p.amount || 0),
        0,
      );
      const billingSummary = {
        ...sale.billingSummary,
        amountPaid: totalPaid,
        balanceDue: sale.billingSummary.grandTotal - totalPaid,
      };

      const updateData = {
        paymentDetails,
        billingSummary,
        paymentStatus: this.calculatePaymentStatus(billingSummary),
        updatedBy,
      };

      const updatedSale = await this.updateById(id, updateData);
      return updatedSale;
    } catch (error) {
      throw new Error(`Failed to add payment detail: ${error.message}`);
    }
  }

  /**
   * Update fulfillment status
   * @param {String} id - Sale ID
   * @param {String} status - Fulfillment status
   * @param {String} updatedBy - User ID who updated
   * @returns {Promise<Object>} Updated sale document
   */
  async updateFulfillmentStatus(id, status, updatedBy) {
    try {
      this.validateObjectId(id);
      this.validateObjectId(updatedBy);

      if (!['pending', 'fulfilled', 'returned'].includes(status)) {
        throw new Error(
          'Fulfillment status must be pending, fulfilled, or returned',
        );
      }

      const sale = await this.getSaleById(id);
      if (!sale) {
        throw new Error(`Sale with id ${id} not found`);
      }

      const updateData = {
        fulfillmentStatus: status,
        updatedBy,
      };

      const updatedSale = await this.updateById(id, updateData);
      return updatedSale;
    } catch (error) {
      throw new Error(`Failed to update fulfillment status: ${error.message}`);
    }
  }

  /**
   * Get sales statistics
   * @param {Object} filters - Optional filters
   * @returns {Promise<Object>} Sales statistics
   */
  async getSalesStatistics(filters = {}) {
    try {
      const Model = await this.getCachedModel();

      const baseQuery = { isDeleted: false, ...filters };

      const [
        totalSales,
        completedSales,
        pendingSales,
        fulfilledSales,
        pendingFulfillment,
        walkInSales,
        totalRevenue,
      ] = await Promise.all([
        Model.countDocuments(baseQuery),
        Model.countDocuments({ ...baseQuery, saleStatus: 'completed' }),
        Model.countDocuments({ ...baseQuery, paymentStatus: 'pending' }),
        Model.countDocuments({ ...baseQuery, fulfillmentStatus: 'fulfilled' }),
        Model.countDocuments({ ...baseQuery, fulfillmentStatus: 'pending' }),
        Model.countDocuments({ ...baseQuery, isWalkInCustomer: true }),
        Model.aggregate([
          { $match: baseQuery },
          {
            $group: {
              _id: null,
              total: { $sum: '$billingSummary.grandTotal' },
            },
          },
        ]),
      ]);

      return {
        total: totalSales,
        completed: completedSales,
        paymentPending: pendingSales,
        fulfilled: fulfilledSales,
        fulfillmentPending: pendingFulfillment,
        walkInCustomers: walkInSales,
        totalRevenue: totalRevenue[0]?.total || 0,
      };
    } catch (error) {
      throw new Error(`Failed to get sales statistics: ${error.message}`);
    }
  }

  /**
   * Get revenue by period
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @param {String} groupBy - Group by period (day, week, month)
   * @returns {Promise<Array>} Revenue data grouped by period
   */
  async getRevenueByPeriod(startDate, endDate, groupBy = 'day') {
    try {
      if (!startDate || !endDate) {
        throw new Error('Start date and end date are required');
      }

      const Model = await this.getCachedModel();

      let groupFormat;
      switch (groupBy) {
        case 'day':
          groupFormat = {
            $dateToString: { format: '%Y-%m-%d', date: '$saleDate' },
          };
          break;
        case 'week':
          groupFormat = { $week: '$saleDate' };
          break;
        case 'month':
          groupFormat = {
            $dateToString: { format: '%Y-%m', date: '$saleDate' },
          };
          break;
        default:
          groupFormat = {
            $dateToString: { format: '%Y-%m-%d', date: '$saleDate' },
          };
      }

      const revenue = await Model.aggregate([
        {
          $match: {
            saleDate: {
              $gte: new Date(startDate),
              $lte: new Date(endDate),
            },
            isDeleted: false,
          },
        },
        {
          $group: {
            _id: groupFormat,
            totalRevenue: { $sum: '$billingSummary.grandTotal' },
            totalSales: { $sum: 1 },
            averageOrderValue: { $avg: '$billingSummary.grandTotal' },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      return revenue;
    } catch (error) {
      throw new Error(`Failed to get revenue by period: ${error.message}`);
    }
  }

  /**
   * Bulk update sale status
   * @param {Array<String>} ids - Array of sale IDs
   * @param {String} status - Status value to set
   * @param {String} updatedBy - User ID who updated
   * @param {Object} options - Optional options { session }
   * @returns {Promise<Object>} Result summary
   */
  async bulkUpdateStatus(ids = [], status, updatedBy, options = {}) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('ids must be a non-empty array');
      }
      if (!status) {
        throw new Error('status is required');
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
          saleStatus: status,
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
      throw new Error(`Failed to bulk update sale status: ${error.message}`);
    }
  }

  /**
   * Bulk soft delete sales
   * @param {Array<String>} ids - Array of sale IDs
   * @param {Object} options - Optional options { session }
   * @returns {Promise<Object>} Result summary
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
      throw new Error(`Failed to bulk soft delete sales: ${error.message}`);
    }
  }

  /**
   * Bulk get sales by IDs (excludes soft-deleted)
   * @param {Array<String>} ids - Array of sale IDs
   * @param {Object} options - Optional options { populate, lean, throwOnNotFound }
   * @returns {Promise<Object>} { data, found, notFound, totalRequested }
   */
  async bulkGetSales(ids = [], options = {}) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('ids must be a non-empty array');
      }

      for (const id of ids) {
        this.validateObjectId(id);
      }

      const { populate = null, lean = true, throwOnNotFound = false } = options;

      const Model = await this.getCachedModel();
      let query = Model.find({
        _id: { $in: ids },
        isDeleted: false,
      });

      if (populate) {
        const populateList = Array.isArray(populate) ? populate : [populate];
        const paths = populateList.map((item) =>
          typeof item === 'string' ? item : item?.path,
        );
        const needsTenantModels =
          paths.includes('store') ||
          paths.includes('customer') ||
          paths.includes('products.product');
        let TenantStoreModel;
        let TenantCustomerModel;
        let TenantProductModel;
        if (needsTenantModels) {
          [TenantStoreModel, TenantCustomerModel, TenantProductModel] =
            await Promise.all([
              this.getModel('Store', StoreSchema, 'stores'),
              this.getModel('Customer', CustomerSchema, 'customers'),
              this.getModel('Product', ProductSchema, 'products'),
            ]);
        }
        const normalizedPopulate = populateList.map((item) => {
          const path = typeof item === 'string' ? item : item?.path;
          const base =
            typeof item === 'object' && item !== null ? { ...item } : {};
          if (path === 'createdBy' || path === 'updatedBy') {
            return { ...base, path, model: GlobalUserModel };
          }
          if (path === 'store' && TenantStoreModel) {
            return { ...base, path, model: TenantStoreModel };
          }
          if (path === 'customer' && TenantCustomerModel) {
            return { ...base, path, model: TenantCustomerModel };
          }
          if (path === 'products.product' && TenantProductModel) {
            return { ...base, path, model: TenantProductModel };
          }
          return item;
        });
        query = query.populate(normalizedPopulate);
      }

      if (lean) {
        query = query.lean();
      }

      const documents = await query.exec();

      const foundIds = new Set(
        documents.map((doc) => (doc._id || doc.id).toString()),
      );
      const notFound = ids.filter((id) => !foundIds.has(id.toString()));

      if (throwOnNotFound && notFound.length > 0) {
        throw new Error(
          `${notFound.length} sale(s) not found: ${notFound.join(', ')}`,
        );
      }

      return {
        data: documents,
        found: documents.length,
        notFound,
        totalRequested: ids.length,
      };
    } catch (error) {
      throw new Error(`Bulk get sales failed: ${error.message}`);
    }
  }

  /**
   * Get sale count
   * @param {Object} filters - Optional filters
   * @returns {Promise<Number>} Count of sales
   */
  async getSaleCount(filters = {}) {
    try {
      const Model = await this.getCachedModel();
      const query = { isDeleted: false, ...filters };
      const count = await Model.countDocuments(query);
      return count;
    } catch (error) {
      throw new Error(`Failed to get sale count: ${error.message}`);
    }
  }

  /**
   * Check if sale exists
   * @param {String} id - Sale ID
   * @returns {Promise<Boolean>} True if sale exists and is not deleted
   */
  async saleExists(id) {
    try {
      this.validateObjectId(id);

      const Model = await this.getCachedModel();
      const count = await Model.countDocuments({
        _id: id,
        isDeleted: false,
      });
      return count > 0;
    } catch (error) {
      throw new Error(`Failed to check sale existence: ${error.message}`);
    }
  }
  /**
   * Get sales report data with detailed line items and current stock
   * @param {Object} filters - Query filters
   * @returns {Promise<Array>} Formatted report data
   */
  async getSalesReportData(params = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        storeId,
        fromDate,
        toDate,
        minAmount,
        maxAmount,
        minQty,
        maxQty,
        search,
        paymentStatus,
        category,
        product,
        all,
      } = params;

      const {
        page: validatedPage,
        limit: validatedLimit,
        skip,
      } = this.validatePagination(page, all === 'true' ? 1000000 : limit);

      const SalesModel = await this.getCachedModel();

      // 1. Build Aggregation Pipeline
      const pipeline = [
        {
          $match: {
            isDeleted: { $ne: true }
          }
        }
      ];

      // Match Filters (Sale Level)
      if (storeId) {
        pipeline[0].$match.store = this._toObjectId(storeId);
      }

      if (fromDate || toDate) {
        pipeline[0].$match.saleDate = {};
        if (fromDate) pipeline[0].$match.saleDate.$gte = new Date(fromDate);
        if (toDate) pipeline[0].$match.saleDate.$lte = new Date(toDate);
        if (Object.keys(pipeline[0].$match.saleDate).length === 0) delete pipeline[0].$match.saleDate;
      }

      if (paymentStatus) {
        pipeline[0].$match.paymentStatus = paymentStatus;
      }

      // Unwind products BEFORE filtering by product attributes
      pipeline.push({ $unwind: '$products' });

      // Match Filters (Product Level)
      const productMatch = {};

      if (category) {
        productMatch['products.categoryName'] = { $regex: category, $options: 'i' };
      }

      if (product) {
        productMatch['products.productName'] = { $regex: product, $options: 'i' };
      }

      if (minQty || maxQty) {
        productMatch['products.quantity'] = {};
        if (minQty) productMatch['products.quantity'].$gte = Number(minQty);
        if (maxQty) productMatch['products.quantity'].$lte = Number(maxQty);
      }

      if (minAmount || maxAmount) {
        productMatch['products.netAmount'] = {};
        if (minAmount) productMatch['products.netAmount'].$gte = Number(minAmount);
        if (maxAmount) productMatch['products.netAmount'].$lte = Number(maxAmount);
      }

      // Global Search
      if (search) {
        pipeline.push({
          $match: {
            $or: [
              { invoiceNumber: { $regex: search, $options: 'i' } },
              { 'customerSnapshot.customerName': { $regex: search, $options: 'i' } },
              { 'products.productName': { $regex: search, $options: 'i' } },
              { 'products.categoryName': { $regex: search, $options: 'i' } },
              { 'products.SKU': { $regex: search, $options: 'i' } },
            ]
          }
        });
      }

      if (Object.keys(productMatch).length > 0) {
        pipeline.push({ $match: productMatch });
      }

      // Project fields needed
      pipeline.push({
        $project: {
          invoiceNumber: 1,
          date: '$saleDate',
          storeId: '$store',
          storeName: '$storeSnapshot.name',
          sku: '$products.SKU',
          productName: '$products.productName',
          category: '$products.categoryName',
          qty: '$products.quantity',
          amount: '$products.grossAmount',
          netAmount: '$products.netAmount',
          paymentStatus: '$paymentStatus',
          paymentDetails: 1,
          saleDate: 1 // for sorting
        }
      });

      // Pagination with Facet
      pipeline.push({
        $facet: {
          metadata: [{ $count: 'total' }],
          data: [
            { $sort: { saleDate: -1 } },
            { $skip: skip },
            { $limit: validatedLimit }
          ]
        }
      });

      const [result] = await SalesModel.aggregate(pipeline);

      const reportRows = result.data || [];
      const total = result.metadata[0] ? result.metadata[0].total : 0;

      // Extract keys for Stock Lookup
      const involvedStoreIds = new Set();
      const involvedSKUs = new Set();

      // Post-process rows for paymentMethod extraction and stock prep
      reportRows.forEach(row => {
        if (row.storeId) involvedStoreIds.add(row.storeId.toString());
        if (row.sku) involvedSKUs.add(row.sku);
        row.stockKey = row.storeId && row.sku ? `${row.storeId.toString()}:${row.sku}` : null;

        // Manual payment method extraction since $reduce can be tricky with complex schemas
        let methods = [];
        if (row.paymentDetails && row.paymentDetails.length > 0) {
          methods = row.paymentDetails.map(p => p.method);
        } else if (row.paymentStatus) {
          methods = [row.paymentStatus];
        }
        row.paymentMethod = methods.join(', ');
        delete row.paymentDetails; // clean up
      });

      // Bulk Fetch Stock Data (Stock and StockBatch)
      if (reportRows.length > 0 && involvedStoreIds.size > 0 && involvedSKUs.size > 0) {
        try {
          const [StockModel, StockBatchModel] = await Promise.all([
            this.getModel('Stock', StockSchema, 'stocks'),
            this.getModel('StockBatch', StockBatchSchema, 'stockbatches')
          ]);

          const [stocks, batches] = await Promise.all([
            StockModel.find({
              storeId: { $in: [...involvedStoreIds] },
              SKU: { $in: [...involvedSKUs] },
              status: true
            }).select('storeId SKU quantity').lean(),
            StockBatchModel.find({
              storeId: { $in: [...involvedStoreIds] },
              SKU: { $in: [...involvedSKUs] },
              status: true,
              lifecycleStatus: 'active'
            }).select('storeId SKU quantity').lean()
          ]);

          const stockMap = new Map();

          for (const s of stocks) {
            if (s.storeId && s.SKU) {
              stockMap.set(`${s.storeId.toString()}:${s.SKU}`, s.quantity);
            }
          }

          for (const b of batches) {
            if (b.storeId && b.SKU) {
              const key = `${b.storeId.toString()}:${b.SKU}`;
              if (!stockMap.has(key)) {
                stockMap.set(key, 0); // Init if missing in Stock model
              }
              // Add up if missing in Stock model
              if (!stocks.find(s => s.storeId.toString() === b.storeId.toString() && s.SKU === b.SKU)) {
                const current = stockMap.get(key);
                stockMap.set(key, current + b.quantity);
              }
            }
          }

          for (const row of reportRows) {
            if (row.stockKey && stockMap.has(row.stockKey)) {
              row.availableQty = stockMap.get(row.stockKey);
            } else {
              row.availableQty = 0;
            }
            delete row.stockKey;
          }
        } catch (stockError) {
          console.error('Failed to fetch stock data for sales report', stockError);
          reportRows.forEach(r => { r.availableQty = 0; delete r.stockKey; });
        }
      } else {
        reportRows.forEach(r => delete r.stockKey);
      }

      return {
        data: reportRows,
        pagination: {
          currentPage: validatedPage,
          totalPages: Math.ceil(total / validatedLimit),
          totalItems: total,
          itemsPerPage: validatedLimit,
          hasNext: validatedPage * validatedLimit < total,
          hasPrev: validatedPage > 1,
        },
      };

    } catch (error) {
      throw new Error(`Failed to get sales report data: ${error.message}`);
    }
  }

  _toObjectId(id) {
    if (!id) return null;
    try {
      return new mongoose.Types.ObjectId(id);
    } catch (e) {
      return null;
    }
  }

}

export default SalesService;
