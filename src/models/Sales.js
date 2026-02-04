import mongoose from 'mongoose';

const paymentMethods = [
    'cash',
    'card',
    'upi',
    'wallet',
    'bank_transfer',
    'split',
    'other',
    'credit sale'
];

const paymentStatuses = ['pending', 'completed'];
const saleStatuses = ['draft', 'completed', 'cancelled'];
const fulfillmentStatuses = ['pending', 'fulfilled', 'returned'];

const salesSchema = new mongoose.Schema(
    {
        // Invoice Number
        invoiceNumber: {
            type: String,
            required: [true, 'Invoice number is required'],
            trim: true,
            uppercase: true,
            minlength: [5, 'Invoice number must be at least 5 characters long'],
            maxlength: [30, 'Invoice number cannot exceed 30 characters'],
        },

        // Store Information
        store: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Store',
            required: true,
        },
        storeSnapshot: {
            name: { type: String, trim: true },
            location: {
                address: { type: String, trim: true },
                city: { type: String, trim: true },
                state: { type: String, trim: true },
                country: { type: String, trim: true },
            },
        },

        // Customer Information (optional for walk-in customers)
        customer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Customer',
            required: false,
        },
        customerSnapshot: {
            customerCode: { type: String, uppercase: true, trim: true },
            customerName: { type: String, trim: true },
            phone: { type: String, trim: true },
            email: { type: String, lowercase: true, trim: true },
        },
        isWalkInCustomer: {
            type: Boolean,
            default: false,
        },

        // Sale Date
        saleDate: {
            type: Date,
            default: Date.now,
        },

        // Product Details
        products: [
            {
                product: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'Product',
                    required: true,
                },
                productName: {
                    type: String,
                    required: true,
                    trim: true,
                },
                SKU: {
                    type: String,
                    uppercase: true,
                    trim: true,
                },
                hasVariation: {
                    type: Boolean,
                    default: false,
                },
                variantCombination: [
                    {
                        variantId: {
                            type: mongoose.Schema.Types.ObjectId,
                            ref: 'Variant',
                        },
                        valueId: mongoose.Schema.Types.ObjectId,
                        valueLabel: String,
                    },
                ],
                category: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'ProductCategory',
                    required: true,
                },
                categoryName: {
                    type: String,
                    trim: true,
                },
                subCategory: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'SubCategory',
                },
                subCategoryName: {
                    type: String,
                    trim: true,
                },
                // Support for multiple taxes per product (like Product model)
                tenantTaxes: [{
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'TenantTax',
                }],
                // Legacy single tax field for backward compatibility
                tenantTax: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'TenantTax',
                },
                // Array of tax snapshots for multiple taxes
                taxSnapshots: [{
                    taxId: { type: mongoose.Schema.Types.ObjectId, ref: 'TenantTax' },
                    taxName: { type: String, trim: true },
                    percentage: { type: Number, min: 0, default: 0 },
                    fixedAmount: { type: Number, min: 0, default: 0 },
                    taxType: { type: String, enum: ['Inclusive', 'Exclusive'] },
                    valueType: { type: String, enum: ['Percentage', 'Fixed'] },
                    calculatedAmount: { type: Number, min: 0, default: 0 }, // Actual tax amount for this line item
                }],
                // Legacy single tax snapshot for backward compatibility
                taxSnapshot: {
                    taxName: { type: String, trim: true },
                    percentage: { type: Number, min: 0 },
                    amount: { type: Number, min: 0 },
                    taxType: { type: String }, // Inclusive/Exclusive
                    valueType: { type: String }, // Percentage/Fixed
                },
                // Breakdown of tax amounts by type
                inclusiveTaxAmount: {
                    type: Number,
                    min: 0,
                    default: 0,
                },
                exclusiveTaxAmount: {
                    type: Number,
                    min: 0,
                    default: 0,
                },
                unit: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'Unit',
                },
                unitSnapshot: {
                    unitId: mongoose.Schema.Types.ObjectId, // Original unit ID reference
                    unit: { type: String, trim: true }, // Full name "Kilogram"
                    shortName: { type: String, trim: true }, // Short name "kg"
                    value: { type: Number }, // Conversion value if relevant
                },
                quantity: {
                    type: Number,
                    min: [1, 'Quantity cannot be less than 1'],
                    required: true,
                },
                // Selling price per unit (from Product.sellingPrice)
                sellingPrice: {
                    type: Number,
                    min: [0, 'Selling price cannot be negative'],
                    default: 0,
                },
                // Gross amount = sellingPrice × quantity (before discounts)
                grossAmount: {
                    type: Number,
                    min: [0, 'Gross amount cannot be negative'],
                    default: 0,
                },
                // Product discount percentage (from Product.discount)
                productDiscountPercent: {
                    type: Number,
                    min: [0, 'Product discount percent cannot be negative'],
                    max: [100, 'Product discount percent cannot exceed 100'],
                    default: 0,
                },
                // Product discount amount = grossAmount × productDiscountPercent%
                productDiscountAmount: {
                    type: Number,
                    min: [0, 'Product discount amount cannot be negative'],
                    default: 0,
                },
                // Total discount amount (product discount + line item discount)
                discountAmount: {
                    type: Number,
                    min: [0, 'Discount amount cannot be negative'],
                    default: 0,
                },
                // Taxable value = base amount after discounts, before any taxes
                taxableValue: {
                    type: Number,
                    min: [0, 'Taxable value cannot be negative'],
                    default: 0,
                },
                netAmount: {
                    type: Number,
                    min: [0, 'Net amount cannot be negative'],
                    required: true,
                },
                taxAmount: {
                    type: Number,
                    min: [0, 'Tax amount cannot be negative'],
                    default: 0,
                },
                notes: {
                    type: String,
                    trim: true,
                    maxlength: [500, 'Line item notes cannot exceed 500 characters'],
                },
                // Return tracking fields
                returnedQuantity: {
                    type: Number,
                    min: [0, 'Returned quantity cannot be negative'],
                    default: 0,
                },
            },
        ],

        // Return tracking (audit fields for sales returns)
        returnLogs: [
            {
                returnedAt: {
                    type: Date,
                    required: true,
                },
                salesReturnId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'SalesReturn',
                    required: true,
                },
                returnedBy: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'User',
                    required: true,
                },
                totalReturnAmount: {
                    type: Number,
                    min: [0, 'Total return amount cannot be negative'],
                    default: 0,
                },
                items: [
                    {
                        productId: {
                            type: mongoose.Schema.Types.ObjectId,
                            ref: 'Product',
                        },
                        variantId: {
                            type: mongoose.Schema.Types.ObjectId,
                            ref: 'Variant',
                        },
                        SKU: { type: String, trim: true },
                        quantity: {
                            type: Number,
                            min: [0, 'Return quantity cannot be negative'],
                            default: 0,
                        },
                        returnAmount: {
                            type: Number,
                            min: [0, 'Return amount cannot be negative'],
                            default: 0,
                        },
                    },
                ],
                note: {
                    type: String,
                    trim: true,
                    maxlength: [1000, 'Return note cannot exceed 1000 characters'],
                },
            },
        ],

        // Billing Summary
        billingSummary: {
            subTotal: {
                type: Number,
                min: [0, 'Subtotal cannot be negative'],
                required: true,
            },
            discountTotal: {
                type: Number,
                min: [0, 'Discount total cannot be negative'],
                default: 0,
            },
            couponDiscount: {
                type: Number,
                min: [0, 'Coupon discount cannot be negative'],
                default: 0,
            },
            loyaltyDiscount: {
                type: Number,
                min: [0, 'Loyalty discount cannot be negative'],
                default: 0,
            },
            giftCardDiscount: {
                type: Number,
                min: [0, 'Gift card discount cannot be negative'],
                default: 0,
            },
            taxableAmount: {
                type: Number,
                min: [0, 'Taxable amount cannot be negative'],
                required: true,
            },
            taxTotal: {
                type: Number,
                min: [0, 'Tax total cannot be negative'],
                default: 0,
            },
            roundingAdjustment: {
                type: Number,
                default: 0,
            },
            grandTotal: {
                type: Number,
                min: [0, 'Grand total cannot be negative'],
                required: true,
            },
            // Final payable amount after rounding to whole number
            roundedGrandTotal: {
                type: Number,
                min: [0, 'Rounded grand total cannot be negative'],
                default: 0,
            },
            amountPaid: {
                type: Number,
                min: [0, 'Amount paid cannot be negative'],
                default: 0,
            },
            balanceDue: {
                type: Number,
                min: [0, 'Balance due cannot be negative'],
                default: 0,
            },
        },

        // Gift Card Information
        giftCard: {
            giftCardId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'GiftCard',
            },
            number: {
                type: String,
                trim: true,
                uppercase: true,
            },
            discountAmount: {
                type: Number,
                min: [0, 'Gift card discount amount cannot be negative'],
                default: 0,
            },
        },

        // Coupon Information
        coupon: {
            couponId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'TenantCoupon',
            },
            code: {
                type: String,
                trim: true,
                uppercase: true,
            },
            discountAmount: {
                type: Number,
                min: [0, 'Coupon discount amount cannot be negative'],
                default: 0,
            },
        },

        // Tax Details (Aggregate)
        appliedTaxes: [
            {
                tax: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'TenantTax',
                },
                taxName: { type: String, trim: true },
                percentage: { type: Number, min: 0 },
                amount: { type: Number, min: 0, default: 0 },
            },
        ],

        // Loyalty Information
        loyalty: {
            accrualRule: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'LoyaltyPoint',
            },
            redemptionRule: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'LoyaltyRedemptionRule',
            },
            pointsAwarded: {
                type: Number,
                min: [0, 'Points awarded cannot be negative'],
                default: 0,
            },
            pointsRedeemed: {
                type: Number,
                min: [0, 'Points redeemed cannot be negative'],
                default: 0,
            },
            redemptionValue: {
                type: Number,
                min: [0, 'Redemption value cannot be negative'],
                default: 0,
            },
            // Reference to the CustomerLoyaltyPoint transaction for accrual
            loyaltyTransactionId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'CustomerLoyaltyPoint',
            },
            // Reference to the CustomerLoyaltyPoint transaction for redemption
            redemptionTransactionId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'CustomerLoyaltyPoint',
            },
        },

        // Payment Method with Total Amount
        paymentStatus: {
            type: String,
            enum: paymentStatuses,
            default: 'completed',
        },
        paymentDetails: [
            {
                method: {
                    type: String,
                    enum: paymentMethods,
                    required: true,
                },
                amount: {
                    type: Number,
                    min: [0, 'Payment amount cannot be negative'],
                    required: true,
                },
                referenceNumber: {
                    type: String,
                    trim: true,
                },
                provider: {
                    type: String,
                    trim: true,
                },
                status: {
                    type: String,
                    enum: paymentStatuses,
                    default: 'completed',
                },
                paidAt: {
                    type: Date,
                    default: Date.now,
                },
                metadata: mongoose.Schema.Types.Mixed,
                // Cash payment specific fields
                cashReceived: {
                    type: Number,
                    min: [0, 'Cash received cannot be negative'],
                    default: 0,
                },
                changeReturned: {
                    type: Number,
                    min: [0, 'Change returned cannot be negative'],
                    default: 0,
                },
            },
        ],

        // Sale and Fulfillment Status
        saleStatus: {
            type: String,
            enum: saleStatuses,
            default: 'completed',
        },
        fulfillmentStatus: {
            type: String,
            enum: fulfillmentStatuses,
            default: 'fulfilled',
        },

        // Additional Information
        dueDate: {
            type: Date,
        },
        notes: {
            type: String,
            trim: true,
            maxlength: [1000, 'Notes cannot exceed 1000 characters'],
        },
        attachments: [
            {
                url: { type: String, trim: true },
                label: { type: String, trim: true },
            },
        ],

        // Audit Fields
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        createdBySnapshot: {
            userId: mongoose.Schema.Types.ObjectId,
            name: { type: String, trim: true },
            email: { type: String, trim: true },
            roleId: { type: Number },
        },
        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        updatedBySnapshot: {
            userId: mongoose.Schema.Types.ObjectId,
            name: { type: String, trim: true },
            email: { type: String, trim: true },
            roleId: { type: Number },
        },
        isDeleted: {
            type: Boolean,
            default: false,
        },
        deletedAt: {
            type: Date,
        },
    },
    { timestamps: true },
);

// Indexes
salesSchema.index({ invoiceNumber: 1 }, { unique: true });
salesSchema.index({ customer: 1, saleDate: -1 });
salesSchema.index({ store: 1, saleDate: -1 });
salesSchema.index({ saleStatus: 1, paymentStatus: 1 });
salesSchema.index({ 'products.product': 1 });
salesSchema.index({ 'products.category': 1, 'products.subCategory': 1 });
salesSchema.index({ 'coupon.code': 1 });
salesSchema.index({ 'loyalty.accrualRule': 1 });
salesSchema.index({ 'loyalty.redemptionRule': 1 });
salesSchema.index({ 'loyalty.loyaltyTransactionId': 1 });
salesSchema.index({ 'loyalty.redemptionTransactionId': 1 });
salesSchema.index({ isWalkInCustomer: 1 });

// Validation: Ensure either customer is provided or it's a walk-in sale
salesSchema.pre('validate', function validateCustomer(next) {
    if (!this.customer && !this.isWalkInCustomer) {
        this.invalidate('customer', 'Either customer must be provided or isWalkInCustomer must be true');
    }
    next();
});

// Validation: Ensure at least one product line item
salesSchema.pre('validate', function validateLineItems(next) {
    if (!this.products || this.products.length === 0) {
        this.invalidate('products', 'At least one product line item is required');
    }
    next();
});

export { salesSchema as SalesSchema };