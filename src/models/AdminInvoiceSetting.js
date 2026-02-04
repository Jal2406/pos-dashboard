import mongoose from 'mongoose';

const AdminInvoiceSettingSchema = new mongoose.Schema(
    {
        // Order prefix (e.g., 'INV-', 'ORD-', 'PO-')
        orderPrefix: {
            type: String,
            required: [true, 'Order prefix is required'],
            trim: true,
            maxlength: [20, 'Order prefix must not exceed 20 characters'],
            default: 'INV-',
        },

        // Order start number (starting number for order/invoice numbering)
        orderStart: {
            type: Number,
            required: [true, 'Order start is required'],
            min: [1, 'Order start must be at least 1'],
            max: [999999999, 'Order start must not exceed 999999999'],
            validate: {
                validator: function (v) {
                    return Number.isInteger(v) && v >= 1;
                },
                message: 'Order start must be a positive integer',
            },
            default: 1,
        },

        // Special notes (additional notes to appear on invoices)
        specialNotes: {
            type: String,
            trim: true,
            maxlength: [1000, 'Special notes must not exceed 1000 characters'],
        },

        // Template selection for invoice
        template: {
            type: String,
            enum: ['template1', 'template2', 'template3', 'template4'],
            default: 'template1',
        },
    },
    {
        timestamps: true,
        versionKey: false,
    },
);

// Ensure only one admin invoice settings document exists
AdminInvoiceSettingSchema.index({}, { unique: true });

// Custom validation methods
AdminInvoiceSettingSchema.methods.validateOrderStart = function () {
    if (
        !Number.isInteger(this.orderStart) ||
        this.orderStart < 1 ||
        this.orderStart > 999999999
    ) {
        throw new Error('Order start must be a positive integer between 1 and 999999999');
    }
    return true;
};

// Pre-save middleware for additional validation
AdminInvoiceSettingSchema.pre('save', function (next) {
    try {
        this.validateOrderStart();
        next();
    } catch (error) {
        next(error);
    }
});

// Pre-update middleware for validation
AdminInvoiceSettingSchema.pre(
    ['findOneAndUpdate', 'updateOne', 'updateMany'],
    function (next) {
        const update = this.getUpdate();

        try {
            // Validate order start if being updated
            if (update.orderStart !== undefined) {
                if (
                    !Number.isInteger(update.orderStart) ||
                    update.orderStart < 1 ||
                    update.orderStart > 999999999
                ) {
                    throw new Error(
                        'Order start must be a positive integer between 1 and 999999999',
                    );
                }
            }

            next();
        } catch (error) {
            next(error);
        }
    },
);


export {AdminInvoiceSettingSchema};