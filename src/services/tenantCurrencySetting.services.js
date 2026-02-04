import { BaseService } from '../utils/index.js';
import { TenantCurrencySettingSchema } from '../models/index.js';

class TenantCurrencySettingService extends BaseService {
    constructor(businessId) {
        if (!businessId) {
            throw new Error('TenantCurrencySettingService initialized without businessId');
        }
        super({
            modelName: 'Currency',
            schema: TenantCurrencySettingSchema,
            collection: 'currencies',
            businessId,
        });
    }

    async getAllCurrencies(queryParams = {}) {
        const { isPrimary, includeDeleted, ...otherParams } = queryParams;

        // Convert string boolean to boolean
        const shouldIncludeDeleted =
            includeDeleted === true || includeDeleted === 'true';

        // Define search fields
        const searchFields = ['currencyName', 'currencyCode', 'currencySymbol'];

        // Build filters object
        const filters = shouldIncludeDeleted ? {} : { isDeleted: false };

        if (isPrimary !== undefined) {
            filters.isPrimary = isPrimary === 'true' || isPrimary === true;
        }

        // Use BaseService list method
        return await super.list({
            ...otherParams,
            searchFields,
            filters,
        });
    }

    async getPrimaryCurrency() {
        try {
            const Model = await this.getModelRef();
            const primaryCurrency = await Model.findOne({
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
            const Model = await this.getModelRef();

            const currency = await Model.findOne({
                _id: currencyId,
                isDeleted: false,
            });
            if (!currency) {
                throw new Error(`Currency with id ${currencyId} not found`);
            }

            // First, unset all other primary currencies
            // Note: The schema pre-save hook also handles this if we save with isPrimary=true.
            // But doing it explicitly here or relying on hook is fine. 
            // CurrencyService does it explicitly too.
            await Model.updateMany(
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
            const Model = await this.getModelRef();
            const query = {
                currencyCode: currencyCode.toUpperCase(),
                isDeleted: false,
            };
            if (excludeId) {
                query._id = { $ne: excludeId };
            }

            const existingCurrency = await Model.findOne(query);
            return !existingCurrency; // Return true if code is available
        } catch (error) {
            throw new Error(`Error validating currency code: ${error.message}`);
        }
    }

    async getById(id) {
        this.validateObjectId(id);
        const Model = await this.getModelRef();

        const currency = await Model.findOne({
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
        const Model = await this.getModelRef();

        const updatedCurrency = await Model.findOneAndUpdate(
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
        const Model = await this.getModelRef();

        const existingCurrency = await Model.findOne({
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

        const deletedCurrency = await Model.findOneAndDelete({ _id: id });

        if (!deletedCurrency) {
            throw new Error(`Currency with id ${id} not found`);
        }

        return deletedCurrency;
    }
}

export default TenantCurrencySettingService;
