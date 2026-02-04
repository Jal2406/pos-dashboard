import mongoose from 'mongoose';

const brandSchema = new mongoose.Schema(
  {
    brand: {
      type: String,
      required: [true, 'Brand name is required'],
      trim: true,
      unique: true,
      minlength: [2, 'Brand name must be at least 2 characters long'],
      maxlength: [50, 'Brand name cannot exceed 50 characters'],
    },
    brandImage: {
      type: String,
      required: [true, 'Brand image is required'],
      trim: true,
    },
    status: {
      type: Boolean,
      default: true,
      index: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Text index for search functionality
brandSchema.index({ brand: 'text' });

/**
 * Find active (non-deleted and status true) brands
 * @returns {Query} Mongoose query
 */
brandSchema.statics.findActive = function () {
  return this.find({ isDeleted: false, status: true });
};

/**
 * Find brands by status (active/inactive)
 * @param {Boolean} status - Status to filter by
 * @returns {Query} Mongoose query
 */
brandSchema.statics.findByStatus = function (status) {
  return this.find({ isDeleted: false, status });
};

/**
 * Check if a brand is active
 * @param {String} brandId - Brand ID to check
 * @returns {Promise<Boolean>} True if brand is active and not deleted
 */
brandSchema.statics.isActiveBrand = async function (brandId) {
  const brand = await this.findOne({
    _id: brandId,
    isDeleted: false,
    status: true
  });
  return !!brand;
};

/**
 * Search brands with text search
 * @param {String} searchTerm - Term to search for in brand names
 * @returns {Query} Mongoose query with text search results
 */
brandSchema.statics.searchBrand = function (searchTerm) {
  const query = {
    isDeleted: false,
    $text: { $search: searchTerm }
  };

  return this.find(query, { score: { $meta: 'textScore' } })
    .sort({ score: { $meta: 'textScore' } });
};

/**
 * Soft delete a brand by setting isDeleted to true
 * @param {String} brandId - ID of the brand to soft delete
 * @returns {Promise<Object>} Updated brand document
 */
brandSchema.statics.softDeleteById = async function (brandId) {
  return this.findByIdAndUpdate(
    brandId,
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
 * Restore a soft-deleted brand
 * @param {String} brandId - ID of the brand to restore
 * @returns {Promise<Object>} Updated brand document
 */
brandSchema.statics.restoreBrand = async function (brandId) {
  return this.findByIdAndUpdate(
    brandId,
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
brandSchema.pre('find', function () {
  if (this.getFilter().isDeleted === undefined) {
    this.where({ isDeleted: false });
  }
});

brandSchema.pre('findOne', function () {
  if (this.getFilter().isDeleted === undefined) {
    this.where({ isDeleted: false });
  }
});

brandSchema.pre('countDocuments', function () {
  if (this.getFilter().isDeleted === undefined) {
    this.where({ isDeleted: false });
  }
});

export { brandSchema as BrandSchema };