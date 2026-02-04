import mongoose from 'mongoose';
import { getTenantModel } from '../config/dbManager.js';

// Tenant-specific Tax schema
export const tenantTaxSchema = new mongoose.Schema(
  {
    taxName: {
      type: String,
      required: true,
      trim: true,
      maxLength: 100,
    },
    taxType: {
      type: String,
      enum: ['Inclusive', 'Exclusive'],
      required: true,
    },
    valueType: {
      type: String,
      enum: ['Percentage', 'Fixed'],
      required: true,
    },
    value: {
      type: Number,
      required: true,
      min: [0, 'Value must be a positive number'],
      validate: {
        validator(value) {
          return this.valueType === 'Percentage'
            ? value >= 0 && value <= 100
            : value >= 0;
        },
        message: () =>
          'Value must be 0-100 for Percentage, or positive for Fixed.',
      },
    },
    status: {
      type: Boolean,
      default: true,
    },
    description: {
      type: String,
      trim: true,
      maxLength: 1000,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

// Performance indexes for common queries
tenantTaxSchema.index({ status: 1 }); // Primary filter for active taxes
tenantTaxSchema.index({ status: 1, createdAt: -1 }); // Compound index for active taxes with sorting
tenantTaxSchema.index({ status: 1, taxType: 1 }); // Filter by status and tax type
tenantTaxSchema.index({ status: 1, valueType: 1 }); // Filter by status and value type
tenantTaxSchema.index({ taxName: 1 }); // For search functionality

tenantTaxSchema.index({ tax: 'text' });

/**
 * Find active (non-deleted and status true) tax
 * @returns {Query} Mongoose query
 */
tenantTaxSchema.statics.findActive = function () {
  return this.find({ isDeleted: false, status: true });
};

/**
 * Find taxes by status (active/inactive)
 * @param {Boolean} status - Status to filter by
 * @returns {Query} Mongoose query
 */
tenantTaxSchema.statics.findByStatus = function (status) {
  return this.find({ isDeleted: false, status });
};

/**
 * Check if a tax is active
 * @param {String} taxId - Tax ID to check
 * @returns {Promise<Boolean>} True if tax is active and not deleted
 */
tenantTaxSchema.statics.isActiveTax = async function (taxId) {
  const tax = await this.findOne({
    _id: taxId,
    isDeleted: false,
    status: true
  });
  return !!tax;
};

/**
 * Search taxes with text search
 * @param {String} searchTerm - Term to search for in tax names
 * @returns {Query} Mongoose query with text search results
 */
tenantTaxSchema.statics.searchTax = function (searchTerm) {
  const query = {
    isDeleted: false,
    $text: { $search: searchTerm }
  };

  return this.find(query, { score: { $meta: 'textScore' } })
    .sort({ score: { $meta: 'textScore' } });
};

/**
 * Soft delete a tax by setting isDeleted to true
 * @param {String} taxId - ID of the tax to soft delete
 * @returns {Promise<Object>} Updated tax document
 */
tenantTaxSchema.statics.softDeleteById = async function (taxId) {
  return this.findByIdAndUpdate(
    taxId,
    {
      $set: {
        isDeleted: true,
        status: false
      }
    },
    { new: true }
  );
};

/**
 * Restore a soft-deleted tax
 * @param {String} taxId - ID of the tax to restore
 * @returns {Promise<Object>} Updated tax document
 */
tenantTaxSchema.statics.restoreTax = async function (taxId) {
  return this.findByIdAndUpdate(
    taxId,
    {
      $set: {
        isDeleted: false,
        status: true
      }
    },
    { new: true }
  );
};

// Pre-find hooks to exclude deleted documents by default
tenantTaxSchema.pre('find', function () {
  if (this.getFilter().isDeleted === undefined) {
    this.where({ isDeleted: false });
  }
});

tenantTaxSchema.pre('findOne', function () {
  if (this.getFilter().isDeleted === undefined) {
    this.where({ isDeleted: false });
  }
});

tenantTaxSchema.pre('countDocuments', function () {
  if (this.getFilter().isDeleted === undefined) {
    this.where({ isDeleted: false });
  }
});
