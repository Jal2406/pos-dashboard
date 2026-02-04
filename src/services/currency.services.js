import mongoose from 'mongoose';
import { Currency } from '../models/index.js';
import { BaseService } from '../utils/index.js';

class CurrencyService extends BaseService {
  constructor() {
    super(Currency);
  }

  async getAllCurrencies(queryParams = {}) {
    const { isPrimary, includeDeleted, ...otherParams } = queryParams;

    const shouldIncludeDeleted =
      includeDeleted === true || includeDeleted === 'true';

    // Define search fields for Currency
    const searchFields = ['currencyName', 'currencyCode', 'currencySymbol'];

    // Build filters object
    const filters = shouldIncludeDeleted ? {} : { isDeleted: false };

    if (isPrimary !== undefined) {
      filters.isPrimary = isPrimary === 'true' || isPrimary === true;
    }

    // Use BaseService list method with Currency specific configuration
    return await super.list({
      ...otherParams,
      searchFields,
      filters,
    });
  }

  async getPrimaryCurrency() {
    try {
      const primaryCurrency = await this.model.findOne({
        isPrimary: true,
        isDeleted: false,
      });
      return primaryCurrency;
    } catch (error) {
      throw new Error(`Error retrieving primary currency: ${error.message}`);
    }
  }

  async setAsPrimary(currencyId) {
    try {
      this.validateObjectId(currencyId);

      const currency = await this.model.findOne({
        _id: currencyId,
        isDeleted: false,
      });
      if (!currency) {
        throw new Error(`Currency with id ${currencyId} not found`);
      }

      // First, unset all other primary currencies
      await this.model.updateMany(
        { _id: { $ne: currencyId }, isDeleted: false },
        { isPrimary: false },
      );

      // Set the specified currency as primary using save() to trigger middleware
      currency.isPrimary = true;
      const updatedCurrency = await currency.save();

      return updatedCurrency;
    } catch (error) {
      throw new Error(`Error setting currency as primary: ${error.message}`);
    }
  }

  async validateCurrencyCode(currencyCode, excludeId = null) {
    try {
      const query = {
        currencyCode: currencyCode.toUpperCase(),
        isDeleted: false,
      };
      if (excludeId) {
        query._id = { $ne: excludeId };
      }

      const existingCurrency = await this.model.findOne(query);
      return !existingCurrency; // Return true if code is available
    } catch (error) {
      throw new Error(`Error validating currency code: ${error.message}`);
    }
  }
  async getById(id) {
    this.validateObjectId(id);

    const currency = await Currency.findOne({
      _id: id,
      isDeleted: false,
    });

    if (!currency) {
      throw new Error(`Currency with id ${id} not found`);
    }

    return currency;
  }

  async updateById(id, data) {
    this.validateObjectId(id);

    const updatedCurrency = await Currency.findOneAndUpdate(
      { _id: id, isDeleted: false },
      data,
      {
        new: true,
        runValidators: true,
      },
    );

    if (!updatedCurrency) {
      throw new Error(`Currency with id ${id} not found`);
    }

    return updatedCurrency;
  }

  async deleteById(id) {
    this.validateObjectId(id);

    const existingCurrency = await Currency.findOne({
      _id: id,
      isDeleted: false,
    });

    if (!existingCurrency) {
      throw new Error(`Currency with id ${id} not found`);
    }

    if (existingCurrency.isPrimary) {
      throw new Error(
        'Cannot delete primary currency. Set another currency as primary first.',
      );
    }

    const deletedCurrency = await Currency.findOneAndUpdate(
      { _id: id, isDeleted: false },
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
          isPrimary: false,
        },
      },
      { new: true },
    );

    // deletedCurrency will always exist here, but add guard to be safe
    if (!deletedCurrency) {
      throw new Error(`Currency with id ${id} not found`);
    }

    return deletedCurrency;
  }
}

export default CurrencyService;
