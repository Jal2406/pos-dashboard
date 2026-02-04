import NotificationCronLock from '../../models/NotificationCronLock.js';

class NotificationCronLockService {
  async ensure(jobName) {
    await NotificationCronLock.updateOne(
      { jobName },
      { $setOnInsert: { jobName } },
      { upsert: true },
    );
  }

  async acquire(jobName, ttlMs = 60 * 1000) {
    const now = new Date();
    const lockExpiresAt = new Date(now.getTime() + ttlMs);

    const lock = await NotificationCronLock.findOneAndUpdate(
      {
        jobName,
        $or: [
          { lockExpiresAt: { $lte: now } },
          { lockExpiresAt: null },
        ],
      },
      {
        lockedAt: now,
        lockExpiresAt,
      },
      { new: true },
    );

    return Boolean(lock);
  }

  async release(jobName) {
    await NotificationCronLock.updateOne(
      { jobName },
      {
        lockedAt: null,
        lockExpiresAt: null,
      },
    );
  }
}

export default NotificationCronLockService;

