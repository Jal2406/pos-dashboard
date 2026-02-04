import mongoose from 'mongoose';

const suggestedQuestionSchema = new mongoose.Schema(
  {
    question: {
      type: String,
      required: true,
      trim: true,
    },
    answer: {
      type: String,
      required: true,
      trim: true,
    },
    order: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for sorting
suggestedQuestionSchema.index({ order: 1 });

const SuggestedQuestion = mongoose.model('SuggestedQuestion', suggestedQuestionSchema);

export default SuggestedQuestion;

