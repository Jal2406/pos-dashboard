const parseInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return parsed;
};

const DEFAULT_TIMEZONE = process.env.CRON_DEFAULT_TZ || 'UTC';

const cronConfig = {
  timezone: DEFAULT_TIMEZONE,
  jobs: {
    subscriptionExpiryReminder: {
      expression: process.env.CRON_SUBSCRIPTION_EXPIRY || '0 9 * * *',
      timezone: process.env.CRON_SUBSCRIPTION_EXPIRY_TZ || DEFAULT_TIMEZONE,
      lockTTL: parseInteger(
        process.env.CRON_SUBSCRIPTION_EXPIRY_LOCK_MS,
        5 * 60 * 1000,
      ),
      notificationType:
        process.env.SUBSCRIPTION_EXPIRY_TEMPLATE || 'subscription_expiring',
      channels: ['in-app', 'email'],
      options: {
        windowInDays: parseInteger(
          process.env.SUBSCRIPTION_EXPIRY_WINDOW_DAYS,
          3,
        ),
        includeTrials:
          (process.env.SUBSCRIPTION_EXPIRY_INCLUDE_TRIALS || 'false') ===
          'true',
        pageSize: parseInteger(process.env.SUBSCRIPTION_EXPIRY_PAGE_SIZE, 100),
      },
    },
    scheduledNotificationSweep: {
      expression:
        process.env.CRON_SCHEDULED_NOTIFICATION_SWEEP || '*/1 * * * *',
      timezone:
        process.env.CRON_SCHEDULED_NOTIFICATION_SWEEP_TZ || DEFAULT_TIMEZONE,
      lockTTL: parseInteger(
        process.env.CRON_SCHEDULED_NOTIFICATION_LOCK_MS,
        60 * 1000,
      ),
      options: {
        batchSize: parseInteger(
          process.env.SCHEDULED_NOTIFICATION_BATCH_SIZE,
          25,
        ),
        claimLockMs: parseInteger(
          process.env.SCHEDULED_NOTIFICATION_CLAIM_LOCK_MS,
          10 * 60 * 1000,
        ),
      },
    },
  },
};

export default cronConfig;
