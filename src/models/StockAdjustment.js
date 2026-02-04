import mongoose from 'mongoose';
import { storeSchema as StoreSchema } from './Store.js';
import { ProductSchema } from './Product.js';

const resolveModelForDocument = (doc, modelName, schema, collectionName) => {
    if (!doc || !doc.constructor) return null;

    try {
        return doc.constructor.model(modelName);
    } catch (error) {
        if (error.name === 'MissingSchemaError' && schema && doc.constructor?.db) {
            return doc.constructor.db.model(modelName, schema, collectionName);
        }
        throw error;
    }
};

/**
 * StockAdjustment Model
 * Tracks all stock adjustments made to inventory across stores
 * Aligned with frontend TypeScript interfaces
 */
const stockAdjustmentSchema = new mongoose.Schema(
    {
        // Store reference
        storeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Store',
            required: [true, 'Store ID is required'],
            index: true,
            validate: {
                validator: async function (storeId) {
                    if (!this.isNew && !this.isModified('storeId')) return true;
                    const Store = resolveModelForDocument(this, 'Store', StoreSchema, 'stores');
                    if (!Store) {
                        throw new Error('Store model is not registered for this connection');
                    }
                    const store = await Store.findById(storeId).select({ _id: 1 }).lean();
                    return !!store;
                },
                message: 'Store does not exist',
            },
        },

        // Product reference
        productId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: [true, 'Product ID is required'],
            index: true,
            validate: {
                validator: async function (productId) {
                    if (!this.isNew && !this.isModified('productId')) return true;
                    const Product = resolveModelForDocument(
                        this,
                        'Product',
                        ProductSchema,
                        'products',
                    );
                    if (!Product) {
                        throw new Error('Product model is not registered for this connection');
                    }
                    const product = await Product.findById(productId)
                        .select({ _id: 1 })
                        .lean();
                    return !!product;
                },
                message: 'Product does not exist',
            },
        },

        // Category and subcategory references (for filtering and organization)
        categoryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'ProductCategory',
            required: [true, 'Category ID is required'],
            index: true,
        },

        subCategoryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'SubCategory',
            index: true,
        },

        // SKU for variant or non-variant products
        SKU: {
            type: String,
            required: [true, 'SKU is required'],
            trim: true,
            uppercase: true,
            index: true,
            validate: {
                validator: (v) => /^[A-Z0-9-_]+$/.test(v),
                message: 'SKU must contain only uppercase letters, numbers, hyphens, and underscores',
            },
        },

        // Adjustment type (matches frontend interface: "increase" | "decrease" | "no_change")
        adjustmentType: {
            type: String,
            required: [true, 'Adjustment type is required'],
            enum: {
                values: ['increase', 'decrease', 'no_change'],
                message: '{VALUE} is not a valid adjustment type. Must be: increase, decrease, or no_change',
            },
            lowercase: true,
            index: true,
        },

        // Actual counted stock after verification (always non-negative)
        actualStock: {
            type: Number,
            required: [true, 'Actual stock value is required'],
            validate: {
                validator: function (v) {
                    return Number.isFinite(v) && v >= 0;
                },
                message: 'Actual stock value must be a non-negative number',
            },
        },

        // Stock before adjustment
        previousStock: {
            type: Number,
            required: [true, 'Previous stock value is required'],
            min: [0, 'Previous stock cannot be negative'],
            default: 0,
        },

        // Stock after adjustment (calculated, mirrors actualStock)
        adjustedValue: {
            type: Number,
            required: [true, 'Adjusted value is required'],
            default: function () {
                return this.actualStock;
            },
            min: [0, 'Adjusted stock value cannot be negative'],
            validate: {
                validator: function (v) {
                    return Number.isFinite(v) && v >= 0;
                },
                message: 'Adjusted value must be a non-negative number',
            },
        },

        // Reason for adjustment (max 250 characters)
        reason: {
            type: String,
            required: [true, 'Reason for adjustment is required'],
            trim: true,
            minlength: [10, 'Reason must be at least 10 characters'],
            maxlength: [250, 'Reason cannot exceed 250 characters'],
            validate: {
                validator: function (v) {
                    return v && v.trim().length >= 10 && v.trim().length <= 250;
                },
                message: 'Reason must be between 10 and 250 characters',
            },
        },

        // Status tracking
        status: {
            type: String,
            enum: {
                values: ['pending', 'approved', 'completed', 'cancelled'],
                message: '{VALUE} is not a valid status',
            },
            default: 'pending',
            index: true,
        },

        // Audit fields
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'Created by user is required'],
            index: true,
        },

        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            validate: {
                validator: function (v) {
                    // approvedBy is required only when status is approved or completed
                    if (['approved', 'completed'].includes(this.status)) {
                        return !!v;
                    }
                    return true;
                },
                message: 'Approved by user is required for approved/completed adjustments',
            },
        },

        approvedAt: {
            type: Date,
            validate: {
                validator: function (v) {
                    // approvedAt should be set when status is approved or completed
                    if (['approved', 'completed'].includes(this.status)) {
                        return !!v;
                    }
                    return true;
                },
                message: 'Approval date is required for approved/completed adjustments',
            },
        },

        cancelledBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },

        cancelledAt: {
            type: Date,
        },

        rejectionReason: {
            type: String,
            trim: true,
            maxlength: [500, 'Rejection/Cancellation reason cannot exceed 500 characters'],
            validate: {
                validator: function (v) {
                    // rejectionReason is required when status is cancelled
                    if (this.status === 'cancelled') {
                        return !!v && v.trim().length > 0;
                    }
                    return true;
                },
                message: 'Reason is required for cancelled adjustments',
            },
        },

        completedAt: {
            type: Date,
        },

        // Additional metadata
        notes: {
            type: String,
            trim: true,
            maxlength: [1000, 'Notes cannot exceed 1000 characters'],
        },

        // Reference to related documents (optional)
        referenceType: {
            type: String,
            enum: {
                values: ['purchase_order', 'sale', 'transfer', 'manual', 'system'],
                message: '{VALUE} is not a valid reference type',
            },
            default: 'manual',
        },

        referenceId: {
            type: mongoose.Schema.Types.ObjectId,
            validate: {
                validator: function (v) {
                    // If referenceType is not manual or system, referenceId should be provided
                    if (this.referenceType && !['manual', 'system'].includes(this.referenceType)) {
                        return !!v;
                    }
                    return true;
                },
                message: 'Reference ID is required for non-manual adjustments',
            },
        },

        // Business/tenant isolation (for multi-tenant support)
        businessId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Business',
            index: true,
        },

        // Soft delete flag
        isDeleted: {
            type: Boolean,
            default: false,
            index: true,
        },

        deletedAt: {
            type: Date,
        },

        deletedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
    },
    {
        timestamps: true,
        versionKey: false,
    },
);

// ============================================================================
// INDEXES FOR PERFORMANCE OPTIMIZATION
// ============================================================================

// Compound indexes for common query patterns
stockAdjustmentSchema.index({ storeId: 1, status: 1, createdAt: -1 }); // Store adjustments by status
stockAdjustmentSchema.index({ productId: 1, storeId: 1, createdAt: -1 }); // Product adjustments per store
stockAdjustmentSchema.index({ storeId: 1, SKU: 1, createdAt: -1 }); // SKU adjustments per store
stockAdjustmentSchema.index({ categoryId: 1, subCategoryId: 1 }); // Category filtering
stockAdjustmentSchema.index({ businessId: 1, status: 1, createdAt: -1 }); // Business adjustments
stockAdjustmentSchema.index({ createdBy: 1, status: 1 }); // User's adjustments
stockAdjustmentSchema.index({ adjustmentType: 1, status: 1 }); // Adjustment type filtering
stockAdjustmentSchema.index({ status: 1, createdAt: -1 }); // Status-based queries
stockAdjustmentSchema.index({ isDeleted: 1, createdAt: -1 }); // Active adjustments

// ============================================================================
// PRE-SAVE MIDDLEWARE
// ============================================================================

stockAdjustmentSchema.pre('save', async function (next) {
    try {
        // Normalize SKU
        if (typeof this.SKU === 'string') {
            this.SKU = this.SKU.trim().toUpperCase();
        }

        // Validate store exists (if modified)
        if (this.isModified('storeId')) {
            const Store = resolveModelForDocument(this, 'Store', StoreSchema, 'stores');
            if (!Store) {
                return next(new Error('Store model is not registered for this connection'));
            }
            const store = await Store.findById(this.storeId).select({ _id: 1 }).lean();
            if (!store) {
                return next(new Error('Store not found'));
            }
        }

        // Validate product and SKU relationship (if modified)
        if (this.isModified('productId') || this.isModified('SKU')) {
            const Product = resolveModelForDocument(this, 'Product', ProductSchema, 'products');
            if (!Product) {
                return next(new Error('Product model is not registered for this connection'));
            }
            const product = await Product.findById(this.productId)
                .select({
                    hasVariation: 1,
                    SKU: 1,
                    category: 1,
                    subCategory: 1,
                    variantData: { $elemMatch: { SKU: this.SKU } },
                })
                .lean();

            if (!product) {
                return next(new Error('Product not found'));
            }

            // Validate SKU belongs to product
            if (product.hasVariation === true) {
                if (!Array.isArray(product.variantData) || product.variantData.length === 0) {
                    return next(new Error('SKU not found in product variants'));
                }
            } else {
                if (product.SKU !== this.SKU) {
                    return next(new Error('SKU does not match product SKU'));
                }
            }

            // Validate category and subcategory match product (if provided)
            if (this.categoryId && String(product.category) !== String(this.categoryId)) {
                return next(new Error('Category does not match product category'));
            }
            if (this.subCategoryId && product.subCategory && String(product.subCategory) !== String(this.subCategoryId)) {
                return next(new Error('Subcategory does not match product subcategory'));
            }
        }

        // Calculate adjusted value if counts changed or not yet set
        if (
            this.isModified('actualStock') ||
            this.isModified('previousStock') ||
            !this.adjustedValue
        ) {
            if (!Number.isFinite(this.actualStock) || this.actualStock < 0) {
                return next(new Error('Actual stock value must be a non-negative number'));
            }

            this.adjustedValue = this.actualStock;
        }

        // Set approval timestamp when status changes to approved
        if (this.isModified('status') && this.status === 'approved' && !this.approvedAt) {
            this.approvedAt = new Date();
        }

        // Set rejection timestamp when status changes to cancelled
        if (this.isModified('status') && this.status === 'cancelled' && !this.cancelledAt) {
            this.cancelledAt = new Date();
        }

        // Set completion timestamp when status changes to completed
        if (this.isModified('status') && this.status === 'completed' && !this.completedAt) {
            this.completedAt = new Date();
        }

        // Validate that approved adjustments have approver
        if (['approved', 'completed'].includes(this.status) && !this.approvedBy) {
            return next(new Error('Approved/completed adjustments must have an approver'));
        }

        // Validate that cancelled adjustments have rejection reason
        if (this.status === 'cancelled' && !this.rejectionReason) {
            return next(new Error('Cancelled adjustments must have a reason'));
        }

        next();
    } catch (error) {
        next(error);
    }
});

// ============================================================================
// PRE-UPDATE MIDDLEWARE
// ============================================================================

stockAdjustmentSchema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function (next) {
    const update = this.getUpdate();

    try {
        // Prevent modification of completed or cancelled adjustments
        const filter = this.getFilter();
        if (update.$set && (update.$set.status === 'completed' || update.$set.status === 'cancelled')) {
            // Allow status changes to completed/cancelled
        } else if (filter.status && ['completed', 'cancelled'].includes(filter.status)) {
            return next(new Error('Cannot modify completed or cancelled adjustments'));
        }

        // Set timestamps for status changes
        if (update.$set) {
            if (update.$set.status === 'approved' && !update.$set.approvedAt) {
                update.$set.approvedAt = new Date();
            }
            if (update.$set.status === 'cancelled' && !update.$set.cancelledAt) {
                update.$set.cancelledAt = new Date();
            }
            if (update.$set.status === 'completed' && !update.$set.completedAt) {
                update.$set.completedAt = new Date();
            }
        }

        next();
    } catch (error) {
        next(error);
    }
});

// ============================================================================
// VIRTUAL FIELDS
// ============================================================================

// Virtual for store name (populated)
stockAdjustmentSchema.virtual('storeName', {
    ref: 'Store',
    localField: 'storeId',
    foreignField: '_id',
    justOne: true,
});

// Virtual for product name (populated)
stockAdjustmentSchema.virtual('productName', {
    ref: 'Product',
    localField: 'productId',
    foreignField: '_id',
    justOne: true,
});

// Virtual field aliases for frontend compatibility
stockAdjustmentSchema.virtual('previousQty').get(function () {
    return this.previousStock;
});

stockAdjustmentSchema.virtual('actualQty').get(function () {
    return this.adjustedValue;
});

stockAdjustmentSchema.virtual('difference').get(function () {
    return this.actualStock - this.previousStock;
});

stockAdjustmentSchema.virtual('sku').get(function () {
    return this.SKU;
});

stockAdjustmentSchema.virtual('adjustedBy').get(function () {
    return this.createdBy;
});

// Virtual for reference display
stockAdjustmentSchema.virtual('reference').get(function () {
    if (this.referenceType === 'manual' || this.referenceType === 'system') {
        return this.referenceType;
    }
    return this.referenceId ? `${this.referenceType}:${this.referenceId}` : this.referenceType;
});

// Virtual for absolute adjustment value
stockAdjustmentSchema.virtual('absoluteValue').get(function () {
    return Math.abs(this.actualStock - this.previousStock);
});

// Virtual for status description
stockAdjustmentSchema.virtual('statusDescription').get(function () {
    const statusMap = {
        pending: 'Pending Approval',
        approved: 'Approved',
        cancelled: 'Cancelled',
        completed: 'Completed',
    };
    return statusMap[this.status] || this.status;
});

// ============================================================================
// STATIC METHODS
// ============================================================================

/**
 * Find adjustments by store with optional filters
 */
stockAdjustmentSchema.statics.findByStore = function (storeId, options = {}) {
    const query = { storeId, isDeleted: false };

    if (options.status) {
        query.status = options.status;
    }

    if (options.adjustmentType) {
        query.adjustmentType = options.adjustmentType;
    }

    if (options.productId) {
        query.productId = options.productId;
    }

    if (options.SKU) {
        query.SKU = options.SKU.trim().toUpperCase();
    }

    if (options.startDate || options.endDate) {
        query.createdAt = {};
        if (options.startDate) {
            query.createdAt.$gte = new Date(options.startDate);
        }
        if (options.endDate) {
            query.createdAt.$lte = new Date(options.endDate);
        }
    }

    return this.find(query)
        .populate('storeId productId')
        .sort({ createdAt: -1 });
};

/**
 * Find pending adjustments requiring approval
 */
stockAdjustmentSchema.statics.findPendingApprovals = function (storeId = null) {
    const query = { status: 'pending', isDeleted: false };

    if (storeId) {
        query.storeId = storeId;
    }

    return this.find(query)
        .populate('storeId productId')
        .sort({ createdAt: 1 }); // Oldest first
};

/**
 * Get adjustment summary for a product in a store
 */
stockAdjustmentSchema.statics.getProductSummary = async function (productId, storeId, SKU) {
    const result = await this.aggregate([
        {
            $match: {
                productId: mongoose.Types.ObjectId(productId),
                storeId: mongoose.Types.ObjectId(storeId),
                SKU: SKU.trim().toUpperCase(),
                status: 'completed',
                isDeleted: false,
            },
        },
        {
            $group: {
                _id: '$adjustmentType',
                totalAdjustments: { $sum: 1 },
                totalValue: { $sum: { $subtract: ['$actualStock', '$previousStock'] } },
                totalIncrease: {
                    $sum: {
                        $cond: [
                            { $gt: [{ $subtract: ['$actualStock', '$previousStock'] }, 0] },
                            { $subtract: ['$actualStock', '$previousStock'] },
                            0,
                        ],
                    },
                },
                totalDecrease: {
                    $sum: {
                        $cond: [
                            { $lt: [{ $subtract: ['$actualStock', '$previousStock'] }, 0] },
                            {
                                $abs: {
                                    $subtract: ['$actualStock', '$previousStock'],
                                },
                            },
                            0,
                        ],
                    },
                },
            },
        },
        {
            $sort: { totalAdjustments: -1 },
        },
    ]);

    return result;
};

/**
 * Get adjustment statistics for a store
 */
stockAdjustmentSchema.statics.getStoreStatistics = async function (storeId, startDate, endDate) {
    const matchQuery = {
        storeId: mongoose.Types.ObjectId(storeId),
        isDeleted: false,
    };

    if (startDate || endDate) {
        matchQuery.createdAt = {};
        if (startDate) {
            matchQuery.createdAt.$gte = new Date(startDate);
        }
        if (endDate) {
            matchQuery.createdAt.$lte = new Date(endDate);
        }
    }

    const result = await this.aggregate([
        { $match: matchQuery },
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 },
                totalIncrease: {
                    $sum: {
                        $cond: [
                            { $gt: [{ $subtract: ['$actualStock', '$previousStock'] }, 0] },
                            { $subtract: ['$actualStock', '$previousStock'] },
                            0,
                        ],
                    },
                },
                totalDecrease: {
                    $sum: {
                        $cond: [
                            { $lt: [{ $subtract: ['$actualStock', '$previousStock'] }, 0] },
                            {
                                $abs: {
                                    $subtract: ['$actualStock', '$previousStock'],
                                },
                            },
                            0,
                        ],
                    },
                },
            },
        },
    ]);

    return result;
};

/**
 * Soft delete an adjustment
 */
stockAdjustmentSchema.statics.softDelete = async function (adjustmentId, deletedBy) {
    return this.findByIdAndUpdate(
        adjustmentId,
        {
            $set: {
                isDeleted: true,
                deletedAt: new Date(),
                deletedBy,
            },
        },
        { new: true },
    );
};

// ============================================================================
// INSTANCE METHODS
// ============================================================================

/**
 * Approve an adjustment
 */
stockAdjustmentSchema.methods.approve = async function (approvedBy) {
    this.status = 'approved';
    this.approvedBy = approvedBy;
    this.approvedAt = new Date();
    return this.save();
};

/**
 * Cancel an adjustment
 */
stockAdjustmentSchema.methods.cancel = async function (cancelledBy, rejectionReason) {
    if (!rejectionReason || rejectionReason.trim().length === 0) {
        throw new Error('Cancellation reason is required');
    }
    this.status = 'cancelled';
    this.cancelledBy = cancelledBy;
    this.cancelledAt = new Date();
    this.rejectionReason = rejectionReason;
    return this.save();
};

/**
 * Complete an adjustment (apply to stock)
 */
stockAdjustmentSchema.methods.complete = async function () {
    this.status = 'completed';
    this.completedAt = new Date();
    return this.save();
};

// Enable virtuals in JSON and Object outputs
stockAdjustmentSchema.set('toJSON', { virtuals: true });
stockAdjustmentSchema.set('toObject', { virtuals: true });

export { stockAdjustmentSchema as StockAdjustmentSchema };
