import cron from 'node-cron';
import cronConfig from '../../config/cron.config.js';
import NotificationScheduleService from './notificationSchedule.service.js';
import NotificationJobExecutor from './notificationJobExecutor.service.js';
import SubscriptionService from '../subscription.service.js';
import NotificationCronLockService from './notificationCronLock.service.js';
import SubscriptionExpiryJob from './jobs/subscriptionExpiry.job.js';
import NotificationSweepJob from './jobs/notificationSweep.job.js';

class NotificationSchedulerService {
  constructor({ logger = console, config = cronConfig, lockService } = {}) {
    // Check if scheduler is disabled via environment variable
    if (process.env.NOTIFICATION_SCHEDULER_DISABLED === 'true') {
      logger.info('[NotificationScheduler] Scheduler is disabled via NOTIFICATION_SCHEDULER_DISABLED flag');
      this.disabled = true;
      return;
    }

    this.logger = logger;
    this.config = config;
    this.subscriptionService = new SubscriptionService();
    this.notificationScheduleService = new NotificationScheduleService();
    this.jobExecutor = new NotificationJobExecutor(logger);
    this.lockService = lockService || new NotificationCronLockService();
    this.tasks = [];

    this.jobs = {
      subscriptionExpiryReminder: new SubscriptionExpiryJob({
        subscriptionService: this.subscriptionService,
        jobExecutor: this.jobExecutor,
        logger: this.logger,
      }),
      scheduledNotificationSweep: new NotificationSweepJob({
        notificationScheduleService: this.notificationScheduleService,
        jobExecutor: this.jobExecutor,
        logger: this.logger,
        defaultTimezone: this.config.timezone,
        mapRoles: NotificationScheduleService.mapRoles,
      }),
    };
  }

  async init() {
    if (this.disabled) {
      return;
    }

    for (const [jobName, jobConfig] of Object.entries(this.config.jobs)) {
      const job = this.jobs[jobName];
      if (!job) {
        this.logger.warn(
          `[NotificationScheduler] No job registered for ${jobName}, skipping`,
        );
        continue;
      }

      await this.lockService.ensure(jobName);

      if (!cron.validate(jobConfig.expression)) {
        throw new Error(`Invalid cron expression for job ${jobName}`);
      }

      const task = cron.schedule(
        jobConfig.expression,
        () => {
          this.executeJob(jobName, jobConfig).catch((error) => {
            this.logger.error(
              `[NotificationScheduler] Job ${jobName} failed`,
              error,
            );
          });
        },
        {
          timezone: jobConfig.timezone || this.config.timezone,
          scheduled: true,
        },
      );

      this.tasks.push({ jobName, task });
      this.logger.info(
        `[NotificationScheduler] Registered job ${jobName} (${jobConfig.expression})`,
      );
    }
  }

  async executeJob(jobName, jobConfig) {
    const job = this.jobs[jobName];
    if (!job) {
      this.logger.warn(
        `[NotificationScheduler] No handler implemented for job ${jobName}`,
      );
      return null;
    }

    const lockAcquired = await this.lockService.acquire(
      jobName,
      jobConfig.lockTTL || 60 * 1000,
    );

    if (!lockAcquired) {
      this.logger.warn(
        `[NotificationScheduler] Job ${jobName} skipped - lock held`,
      );
      return null;
    }

    try {
      return await job.run(jobConfig);
    } finally {
      await this.lockService.release(jobName);
    }
  }

  stop() {
    if (this.disabled) {
      return;
    }
    this.tasks.forEach(({ task }) => task.stop());
  }
}

export default NotificationSchedulerService;
