import mongoose from 'mongoose';

export const BusinessSchema = new mongoose.Schema(
  {
    businessName: { type: String, required: true, trim: true },
    businessCategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BusinessCategory',
      required: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    isActive: {
      type: Boolean,
      default: false,
    },
    subdomain: {
      type: String,
      required: false,
      trim: true,
    },
  },
  { timestamps: true },
);

//PRODUCTION: UNIQUE INDEX FOR DATA CONSISTENCY
// BuisnessSchema.index({ businessName: 1, ownerName: 1 }, { unique: true })

const Business = mongoose.model('Business', BusinessSchema);
export default Business;
