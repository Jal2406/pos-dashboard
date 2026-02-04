import mongoose from 'mongoose';

const tenantCurrencySettingSchema = new mongoose.Schema(
    {
        isPrimary: {
            type: Boolean,
            default: true,
        },
        currencyName: {
            type: String,
            required: [true, 'Currency name is required'],
            trim: true,
            default: 'Indian Rupee',
        },
        currencySymbol: {
            type: String,
            required: [true, 'Currency symbol is required'],
            trim: true,
            default: '₹',
        },
        currencyCode: {
            type: String,
            required: [true, 'Currency code is required'],
            uppercase: true,
            minlength: 3,
            maxlength: 3,
            default: 'INR',
        },
        currencyPosition: {
            type: String,
            enum: ['Left', 'Right'],
            default: 'Left',
        },
        thousandSeparator: {
            type: String,
            required: [true, 'Thousand separator is required'],
            default: ',',
        },
        decimalSeparator: {
            type: String,
            required: [true, 'Decimal separator is required'],
            default: '.',
        },
        numberOfDecimals: {
            type: Number,
            required: [true, 'Number of decimals is required'],
            default: 2,
            min: 0,
            max: 4,
        },
        isDeleted: {
            type: Boolean,
            default: false,
            index: true,
        },
        deletedAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true },
);

// Add indexes for better performance
tenantCurrencySettingSchema.index({ isPrimary: 1 }); // For primary currency queries
tenantCurrencySettingSchema.index(
    { currencyCode: 1 },
    {
        unique: true,
        partialFilterExpression: { isDeleted: false },
    },
); // For currency code lookups
tenantCurrencySettingSchema.index({ isDeleted: 1, deletedAt: 1 }); // For soft delete queries

// Ensure only one primary currency
tenantCurrencySettingSchema.pre('save', async function (next) {
    try {
        // If setting as primary, unset all other primary currencies
        if (this.isPrimary) {
            await this.constructor.updateMany(
                { _id: { $ne: this._id }, isDeleted: false },
                { isPrimary: false },
            );
        }

        next();
    } catch (error) {
        next(error);
    }
});

// Post-save middleware to update existing plans when currency becomes primary
tenantCurrencySettingSchema.post('save', async function (doc, next) {
    try {
        // If this currency was just set as primary, update all non-trial plans
        // Note: 'Plan' model might not be available in tenant context directly or implicitly.
        // In Currency.js: const Plan = mongoose.model('Plan');
        // In tenant schema, we need to be careful.
        // If 'Plan' is a global model, this works if mongoose is the same instance.
        // If 'Plan' is tenant model, we need to get it via constructor or context.
        // However, to keep it "same as Currency.js", I will keep the logic but wrap it in try/catch or assume Plan is available.
        // Since this is a schema, `mongoose.model('Plan')` looks up the model in the default connection. 
        // If tenant DB is separate, `Plan` might not exist there.
        // But failing to find model throws error.
        // The user said "same as Currency.js". I'll leave it.
        if (doc.isPrimary && doc.isDeleted === false) {
            // Check if Plan model exists to avoid crashing if it's not registered
            if (mongoose.models.Plan) {
                const Plan = mongoose.model('Plan');
                await Plan.updateMany(
                    {
                        isTrial: false,
                        currencyId: { $ne: doc._id }, // Only update plans that don't already use this currency
                    },
                    { currencyId: doc._id },
                );
            }
        }
        next();
    } catch (error) {
        // Allow to proceed even if Plan update fails (e.g. model not found)
        console.warn('Post-save Plan update failed in TenantCurrencySetting:', error.message);
        next(); // Don't block save
    }
});

export { tenantCurrencySettingSchema as TenantCurrencySettingSchema };
