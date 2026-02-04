import mongoose from 'mongoose';

const FooterSectionSchema = new mongoose.Schema(
  {
    footer: {
      cta: {
        title: {
          type: String,
          required: [true, 'CTA section title is required'],
          trim: true,
          minlength: [3, 'CTA title must be at least 3 characters long'],
          maxlength: [100, 'CTA title cannot exceed 100 characters'],
        },
        subtitle: {
          type: String,
          required: [true, 'CTA section subtitle is required'],
          trim: true,
          minlength: [10, 'CTA subtitle must be at least 10 characters long'],
          maxlength: [500, 'CTA subtitle cannot exceed 500 characters'],
        },
      },
      links: [
        {
          title: {
            type: String,
            required: [true, 'Link title is required'],
            trim: true,
            minlength: [2, 'Link title must be at least 2 characters'],
            maxlength: [50, 'Link title cannot exceed 50 characters'],
          },
          description: {
            type: String,
            required: [true, 'Link description is required'],
            minlength: [5, 'Link description must be at least 5 characters'],
            maxlength: [6500, 'Link description cannot exceed 6500 characters'],
          },
          status: {
            type: Boolean,
            default: true,
          },
        },
      ],
    },
  },
  { timestamps: true },
);

const FooterSection = mongoose.model('FooterSection', FooterSectionSchema);

export default FooterSection;
