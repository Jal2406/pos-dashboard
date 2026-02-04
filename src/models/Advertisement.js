import mongoose from 'mongoose';

const AdvertisementSchema = new mongoose.Schema(
  {
    // Advertisement Information
    adName: {
      type: String,
      required: true,
      trim: true,
    },

    // Select Type: Video or Image
    selectType: {
      type: String,
      required: true,
      enum: ['Video', 'Image'],
    },

    // URL Type: Local or URL
    urlType: {
      type: String,
      required: true,
      enum: ['Local', 'Url'],
    },

    // Placement: Hero Section or Pricing
    placement: {
      type: String,
      required: true,
      enum: ['Hero Section', 'Pricing', 'Home Page'],
    },

    // Position: Center, Left, Right
    position: {
      type: String,
      required: true,
      enum: ['Center', 'Left', 'Right'],
    },

    // Redirect URL
    redirectUrl: {
      type: String,
      required: true,
      trim: true,
    },

    // Start Date
    startDate: {
      type: Date,
      required: true,
    },

    // End Date
    endDate: {
      type: Date,
      required: true,
    },

    // Status - Boolean (true = active, false = inactive)
    status: {
      type: Boolean,
      default: true,
    },

    // Click tracking
    clickCount: {
      type: Number,
      default: 0,
    },

    // View tracking
    viewCount: {
      type: Number,
      default: 0,
    },

    // Cache settings
    lastCachePurge: {
      type: Date,
      default: Date.now,
    },

    // Media content - simplified for performance
    mediaContent: {
      url: {
        type: String,
        trim: true,
      },
      fileDetails: {
        url: {
          type: String,
          trim: true,
        },
        originalName: {
          type: String,
          trim: true,
        },
        fileSize: {
          type: Number,
        },
        mimeType: {
          type: String,
          trim: true,
        },
      },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Performance-optimized indexes for better query performance
AdvertisementSchema.index({ placement: 1, position: 1 }, { unique: true }); // Unique compound index to prevent slot conflicts
AdvertisementSchema.index({ status: 1 }); // Status filtering
AdvertisementSchema.index({ startDate: 1, endDate: 1 }); // Date range queries
AdvertisementSchema.index({
  placement: 1,
  status: 1,
  startDate: 1,
  endDate: 1,
}); // Active ads by placement
AdvertisementSchema.index({ adName: 'text', redirectUrl: 'text' }); // Text search
AdvertisementSchema.index({ createdAt: -1 }); // Sorting by creation date
AdvertisementSchema.index({ selectType: 1 }); // Filter by select type
AdvertisementSchema.index({ urlType: 1 }); // Filter by URL type
AdvertisementSchema.index({ position: 1 }); // Filter by position

// Removed all middleware for maximum performance
// Validation is now handled in the service layer only

const Advertisement = mongoose.model('Advertisement', AdvertisementSchema);

export default Advertisement;
