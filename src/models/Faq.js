import mongoose from 'mongoose';

const faqSchema = new mongoose.Schema(
  {
    question: {
      type: String,
      required: true,
      trim: true,
    },
    answer: {
      type: String,
      required: true,
    },
    slug: {
      type: String,
      unique: true,
      trim: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FaqCategory',
      required: [true, 'Category is required'],
      index: true,
    },
    // tags: [{
    //   type: String,
    //   trim: true,
    // }],
    isPublished: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

// No text index - using regex search instead

// Generate slug from question before saving
faqSchema.pre('save', function (next) {
  if (this.isModified('question') && !this.slug) {
    this.slug = this.question
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim('-');
  }
  next();
});

const Faq = mongoose.model('Faq', faqSchema);
export default Faq;
