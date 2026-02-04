import mongoose from 'mongoose';

const NotificationScheduleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    notificationType: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    channels: {
      type: [String],
      enum: ['in-app', 'email'],
      default: ['in-app'],
    },
    timezone: {
      type: String,
      default: 'UTC',
    },
    scheduledFor: {
      type: Date,
      required: true,
      index: true,
    },
    recurrence: {
      cronExpression: {
        type: String,
        default: null,
      },
      timezone: {
        type: String,
        default: null,
      },
      stopAfter: {
        type: Date,
        default: null,
      },
    },
    context: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    targetUserIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    targetRoles: [
      {
        type: String,
        enum: ['superadmin', 'admin', 'manager', 'cashier'],
      },
    ],
    audienceFilter: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
      default: 'pending',
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    lockUntil: {
      type: Date,
      default: null,
    },
    lastRunAt: {
      type: Date,
      default: null,
    },
    lastRunStatus: {
      type: String,
      enum: ['success', 'partial', 'failed', null],
      default: null,
    },
    lastError: {
      type: String,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  },
);

NotificationScheduleSchema.index(
  { scheduledFor: 1, status: 1, isActive: 1 },
  { name: 'notification_schedule_due_idx' },
);

const NotificationSchedule = mongoose.model(
  'NotificationSchedule',
  NotificationScheduleSchema,
);

export default NotificationSchedule;
