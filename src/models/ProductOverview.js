import mongoose from 'mongoose';

const productOverviewSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Business type title is required'],
      trim: true,
      maxlength: 150,
    },
    description: {
      type: String,
      required: [true, 'Business type description is required'],
      trim: true,
      maxlength: 300,
    },
    overviewImage: {
      type: String,
      required: [true, 'overviewImage is required'],
      trim: true,
    },
    status: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true },
);

const ProductOverview = mongoose.model(
  'ProductOverview',
  productOverviewSchema,
);
export default ProductOverview;
