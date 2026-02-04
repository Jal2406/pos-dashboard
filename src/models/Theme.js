import mongoose from 'mongoose';

const themeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxLength: 100,
    },
    themeBanner: {
      type: String,
      required: true,
    },
    status: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

const Theme = mongoose.model('Theme', themeSchema);
export default Theme;
