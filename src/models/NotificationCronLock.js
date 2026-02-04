import mongoose from 'mongoose';

const NotificationCronLockSchema = new mongoose.Schema(
  {
    jobName: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    lockedAt: {
      type: Date,
      default: null,
    },
    lockExpiresAt: {
      type: Date,
      default: null,
      index: true,
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

const NotificationCronLock = mongoose.model(
  'NotificationCronLock',
  NotificationCronLockSchema,
);

export default NotificationCronLock;

