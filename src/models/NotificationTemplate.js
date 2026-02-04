import mongoose from 'mongoose';

const NotificationTemplateSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: [true, 'Notification type is required'],
      trim: true,
    },
    label: {
      type: String,
      required: [true, 'Label is required'],
      trim: true,
    },
    to: [
      {
        type: String,
        enum: ['superadmin', 'admin', 'manager', 'cashier'],
        required: true,
      },
    ],
    status: {
      type: Boolean,
      default: true,
    },
    templates: [
      {
        userType: {
          type: String,
          required: true,
        },
        notification: {
          subject: {
            type: String,
            trim: true,
            default: '',
          },
          content: {
            type: String,
            trim: true,
            default: '',
          },
        },
        email: {
          subject: {
            type: String,
            trim: true,
            default: '',
          },
          content: {
            type: String,
            trim: true,
            default: '',
          },
        },
      },
    ],
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Index on type
NotificationTemplateSchema.index({ type: 1 }, { unique: true });

const NotificationTemplate = mongoose.model(
  'NotificationTemplate',
  NotificationTemplateSchema,
);

export default NotificationTemplate;
