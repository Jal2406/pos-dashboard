import mongoose from 'mongoose';

const NotificationExecutionSchema = new mongoose.Schema(
  {
    jobKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    jobName: {
      type: String,
      required: true,
      index: true,
    },
    notificationType: {
      type: String,
      required: true,
    },
    scheduleRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'NotificationSchedule',
      default: null,
    },
    targetUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    channels: {
      type: [String],
      enum: ['in-app', 'email'],
      default: [],
    },
    channelStatuses: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    status: {
      type: String,
      enum: [
        'pending',
        'processing',
        'completed',
        'partial_failure',
        'failed',
        'skipped',
      ],
      default: 'pending',
      index: true,
    },
    scheduledFor: {
      type: Date,
      default: null,
    },
    dispatchedAt: {
      type: Date,
      default: null,
    },
    attempts: {
      type: Number,
      default: 0,
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

NotificationExecutionSchema.index(
  { notificationType: 1, targetUser: 1, scheduledFor: 1 },
  { name: 'notify_execution_lookup_idx' },
);

const NotificationExecution = mongoose.model(
  'NotificationExecution',
  NotificationExecutionSchema,
);

export default NotificationExecution;
