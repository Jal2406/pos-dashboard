import mongoose from 'mongoose';

const BlogSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    overview: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    tags: [
      {
        type: String,
        trim: true,
        lowercase: true,
      },
    ],
    createdBy: {
      type: String,
      required: true,
    },
    readTime: {
      type: Number,
      required: true,
      min: 1,
      max: 60,
      default: 5, // Default 5 minutes
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
    blogImage: {
      type: String,
      trim: true,
      default: null,
    },
    slug: {
      type: String,
      unique: true,
      trim: true,
      lowercase: true,
    },
    views: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  },
);

// Generate slug from title before saving
BlogSchema.pre('save', function (next) {
  if (this.isModified('title')) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9 -]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim('-');
  }
  next();
});

// Calculate read time based on description length
BlogSchema.pre('save', function (next) {
  if (this.isModified('description')) {
    const wordsPerMinute = 200; // Average reading speed
    const wordCount = this.description.split(/\s+/).length;
    this.readTime = Math.ceil(wordCount / wordsPerMinute);
  }
  next();
});

// Index for better query performance
BlogSchema.index({ title: 'text', overview: 'text', description: 'text' });
BlogSchema.index({ tags: 1 });
BlogSchema.index({ createdBy: 1 });
BlogSchema.index({ isPublished: 1, isActive: 1 });

// Virtual for getting author details
BlogSchema.virtual('author', {
  ref: 'User',
  localField: 'createdBy',
  foreignField: '_id',
  justOne: true,
});

// Ensure virtuals are included when converting to JSON/Object
BlogSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    return ret;
  },
});

BlogSchema.set('toObject', {
  virtuals: true,
  transform(doc, ret) {
    return ret;
  },
});

const Blog = mongoose.model('Blog', BlogSchema);

export default Blog;
