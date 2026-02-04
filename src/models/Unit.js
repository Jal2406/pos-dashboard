import mongoose from 'mongoose';

const unitSchema = new mongoose.Schema(
  {
    unit: {
      type: String,
      required: [true, 'Unit name is required'],
      trim: true,
      minlength: [2, 'Unit name must be at least 2 characters'],
      maxlength: [50, 'Unit name cannot exceed 50 characters'],
    },
    shortName: {
      type: String,
      required: [true, 'Short name is required'],
      trim: true,
      minlength: [1, 'Short name must be at least 1 character'],
      maxlength: [10, 'Short name cannot exceed 10 characters'],
    },
    status: {
      type: Boolean,
      required: [true, 'Status is required'],
      default: true, // true = Active, false = Inactive
    },
    //Soft Delete 
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Add validation for unit name format
unitSchema.path('unit').validate(function (v) {
  return /^[a-zA-Z0-9\s\-_]+$/.test(v);
}, 'Unit name can only contain letters, numbers, spaces, hyphens, and underscores');

// Add validation for short name format
unitSchema.path('shortName').validate(function (v) {
  return /^[a-zA-Z0-9\-_]+$/.test(v);
}, 'Short name can only contain letters, numbers, hyphens, and underscores');

// Virtual for display name (unit + shortName)
unitSchema.virtual('displayName').get(function () {
  return `${this.unit} (${this.shortName})`;
});

// Virtual for status text
unitSchema.virtual('statusText').get(function () {
  return this.status ? 'Active' : 'Inactive';
});

// Ensure virtual fields are serialized
unitSchema.set('toJSON', { virtuals: true });
unitSchema.set('toObject', { virtuals: true });

// Production-grade indexes for optimal performance
unitSchema.index({ status: 1 }); // Status filter
unitSchema.index({ createdAt: -1 }); // Creation date sort
unitSchema.index({ unit: 1 }); // Unit name for search
unitSchema.index({ shortName: 1 }); // Short name for search

// Compound text index for search
unitSchema.index(
  {
    unit: 'text',
    shortName: 'text',
  },
  {
    weights: {
      unit: 10,
      shortName: 5,
    },
    name: 'unit_text_search',
  },
);


// Add text index for search
unitSchema.index({ name: 'text', shortName: 'text' });

// Add query helpers
unitSchema.query.active = function () {
  return this.where({ isDeleted: false, status: true });
};

unitSchema.query.nonDeleted = function () {
  return this.where({ isDeleted: false });
};

// Static methods
unitSchema.statics.findActive = function (criteria = {}) {
  return this.find({ ...criteria, isDeleted: false, status: true });
};

unitSchema.statics.findByStatus = function (status, criteria = {}) {
  return this.find({ ...criteria, isDeleted: false, status });
};

unitSchema.statics.softDeleteById = async function (unitId) {
  return this.findByIdAndUpdate(
    unitId,
    {
      $set: {
        isDeleted: true,
        status: false,
        deletedAt: new Date()
      }
    },
    { new: true }
  );
};

unitSchema.statics.restoreUnit = async function (id) {
  return this.findByIdAndUpdate(
    id,
    {
      $set: {
        isDeleted: false,
        status: true,
        deletedAt: null
      }
    },
    { new: true }
  );
};

// Pre-find hooks to exclude deleted documents by default
unitSchema.pre('find', function () {
  if (this.getFilter().isDeleted === undefined) {
    this.where({ isDeleted: false });
  }
});

unitSchema.pre('findOne', function () {
  if (this.getFilter().isDeleted === undefined) {
    this.where({ isDeleted: false });
  }
});

unitSchema.pre('countDocuments', function () {
  if (this.getFilter().isDeleted === undefined) {
    this.where({ isDeleted: false });
  }
});

export { unitSchema as UnitSchema };
