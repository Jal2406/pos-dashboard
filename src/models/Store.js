import mongoose from 'mongoose';

const storeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Store name is required'],
      trim: true,
      minlength: [2, 'Store name must be at least 2 characters'],
      maxlength: [100, 'Store name must not exceed 100 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description should not exceed 1000 characters'],
    },

    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      sparse: true, // Allows multiple docs without email
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        'Please provide a valid email address',
      ],
    },

    contactNumber: {
      type: String,
      trim: true,
      match: [/^\+?[0-9]{7,15}$/, 'Please provide a valid contact number'],
    },

    location: {
      address: { type: String, trim: true },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      country: { type: String, trim: true },
      postalCode: {
        type: String,
        trim: true,
        match: [/^\d{4,10}$/, 'Invalid postal code'],
      },
    },

    geoLocation: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: [true, 'GeoLocation coordinates are required'],
        validate: {
          validator(val) {
            return val && val.length === 2;
          },
          message: 'Coordinates must be [longitude, latitude]',
        },
      },
    },

    storeImage: {
      type: String,
      // required: true,
      trim: true,
    },
    status: {
      type: Boolean,
      default: true,
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

storeSchema.index({ owner: 1, isDeleted: 1 });
storeSchema.index({ owner: 1 });

// Optimized indexes for common queries and sorting
// Compound index to speed up filtering by owner and sorting by createdAt
storeSchema.index({ owner: 1, createdAt: -1 });

// Additional compound indexes for common query patterns
storeSchema.index({ owner: 1, status: 1, createdAt: -1 }); // For active stores by owner
storeSchema.index({ owner: 1, 'location.city': 1 }); // For city filtering by owner
storeSchema.index({ owner: 1, 'location.state': 1 }); // For state filtering by owner
storeSchema.index({ owner: 1, 'location.country': 1 }); // For country filtering by owner

// Indexes on location fields used in filters
storeSchema.index({ 'location.city': 1 });
storeSchema.index({ 'location.state': 1 });
storeSchema.index({ 'location.country': 1 });

// Sort index on createdAt
storeSchema.index({ createdAt: -1 });

// Text index for faster multi-field search
// Note: $text search in listStores relies on this
storeSchema.index({
  name: 'text',
  'location.address': 'text',
  'location.city': 'text',
  'location.state': 'text',
});


export { storeSchema };

