import mongoose from 'mongoose';

const loyaltyPointSchema = new mongoose.Schema(
  {
    loyaltyPoints: {
      type: Number,
      required: [true, 'Loyalty points is required'],
      min: [0, 'Loyalty points cannot be negative'],
    },
    minimumAmount: {
      type: Number,
      required: [true, 'Minimum amount purchase is required'],
      min: [0, 'Minimum amount purchase cannot be negative'],
    },
    maximumAmount: {
      type: Number,
      required: [true, 'Maximum amount purchase is required'],
      min: [0, 'Maximum amount purchase cannot be negative'],
    },
    expiryDuration: {
      type: Number,
      required: [true, 'Expiry duration is required'],
      min: [0, 'Expiry duration cannot be negative'],
    },
    // Audit fields
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    status: {
      type: Boolean,
      default: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

const MIN_MAX_ERROR_MESSAGE =
  'Minimum amount purchase cannot be greater than maximum amount purchase';
const RANGE_OVERLAP_ERROR_MESSAGE =
  'Another loyalty point configuration already covers this purchase amount range';

const buildBusinessScopeFilter = (businessId) => {
  if (!businessId) {
    return {};
  }

  return {
    $or: [{ businessId }, { businessId: { $exists: false } }],
  };
};

const validateMinAndMax = (minimumAmount, maximumAmount) => {
  if (
    minimumAmount !== undefined &&
    maximumAmount !== undefined &&
    minimumAmount > maximumAmount
  ) {
    throw new Error(MIN_MAX_ERROR_MESSAGE);
  }
};

const findOverlappingRange = async ({
  Model,
  minimumAmount,
  maximumAmount,
  businessId,
  excludeId = null,
}) => {
  if (minimumAmount === undefined || maximumAmount === undefined) {
    return null;
  }

  const query = {
    ...buildBusinessScopeFilter(businessId),
    isDeleted: { $ne: true },
    minimumAmount: { $lte: maximumAmount },
    maximumAmount: { $gte: minimumAmount },
  };

  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  return Model.findOne(query).lean();
};

const shouldValidateRange = (doc) =>
  doc.isNew ||
  doc.isModified('minimumAmount') ||
  doc.isModified('maximumAmount');

loyaltyPointSchema.pre('validate', function (next) {
  try {
    validateMinAndMax(this.minimumAmount, this.maximumAmount);
    next();
  } catch (error) {
    next(error);
  }
});

loyaltyPointSchema.pre('save', async function () {
  if (!shouldValidateRange(this) || this.isDeleted === true) {
    return;
  }

  validateMinAndMax(this.minimumAmount, this.maximumAmount);

  const Model = this.constructor;
  const overlappingDocument = await findOverlappingRange({
    Model,
    minimumAmount: this.minimumAmount,
    maximumAmount: this.maximumAmount,
    businessId: this.businessId,
    excludeId: this.isNew ? null : this._id,
  });

  if (overlappingDocument) {
    throw new Error(RANGE_OVERLAP_ERROR_MESSAGE);
  }
});

loyaltyPointSchema.pre('findOneAndUpdate', async function () {
  const update = this.getUpdate() || {};
  const normalizedUpdate = { ...update, ...(update.$set || {}) };

  const hasRangeMutation =
    Object.prototype.hasOwnProperty.call(normalizedUpdate, 'minimumAmount') ||
    Object.prototype.hasOwnProperty.call(normalizedUpdate, 'maximumAmount');

  if (!hasRangeMutation) {
    return;
  }

  const docToUpdate = await this.model.findOne(this.getQuery()).lean();
  if (!docToUpdate) {
    return;
  }

  const nextMinimum =
    normalizedUpdate.minimumAmount !== undefined
      ? normalizedUpdate.minimumAmount
      : docToUpdate.minimumAmount;
  const nextMaximum =
    normalizedUpdate.maximumAmount !== undefined
      ? normalizedUpdate.maximumAmount
      : docToUpdate.maximumAmount;

  validateMinAndMax(nextMinimum, nextMaximum);

  const overlappingDocument = await findOverlappingRange({
    Model: this.model,
    minimumAmount: nextMinimum,
    maximumAmount: nextMaximum,
    businessId: docToUpdate.businessId,
    excludeId: docToUpdate._id,
  });

  if (overlappingDocument) {
    throw new Error(RANGE_OVERLAP_ERROR_MESSAGE);
  }
});

// Indexes for better performance
loyaltyPointSchema.index({ isDeleted: 1 });
loyaltyPointSchema.index({ minimumAmount: 1 });

export { loyaltyPointSchema as LoyaltyPointSchema };
