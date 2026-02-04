import mongoose from 'mongoose';

const heroSectionSchema = new mongoose.Schema(
  {
    title1: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      validate: {
        validator(v) {
          return v.split(/\s+/).length <= 3; // max 3 words
        },
        message: 'Title cannot exceed 50 words',
      },
    },
    title2: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      validate: {
        validator(v) {
          return v.split(/\s+/).length <= 3; // max 3 words
        },
        message: 'Title cannot exceed 3 words',
      },
    },
    subtitle: {
      type: String,
      trim: true,
      maxlength: 300,
    },
    heroImage: {
      type: String,
      required: [true, 'Hero image is required'],
    },
  },
  { timestamps: true },
);

const HeroSection = mongoose.model('HeroSection', heroSectionSchema);
export default HeroSection;
