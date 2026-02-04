import NotificationContextBuilder from '../notificationContextBuilder.service.js';

/**
 * Handles scheduling reminders for expiring subscriptions.
 * Encapsulates paging, context building, and dispatch coordination
 * so the scheduler only needs to trigger run().
 */
class SubscriptionExpiryJob {
  constructor({ subscriptionService, jobExecutor, logger = console }) {
    this.subscriptionService = subscriptionService;
    this.jobExecutor = jobExecutor;
    this.logger = logger;
  }

  async run(jobConfig = {}) {
    const {
      windowInDays = 3,
      includeTrials = false,
      pageSize = 100,
    } = jobConfig.options || {};

    let page = 1;
    let processed = 0;
    let hasMore = true;

    while (hasMore) {
      const result =
        (await this.subscriptionService.getSubscriptionsExpiringSoon({
          windowInDays,
          includeTrials,
          page,
          limit: pageSize,
        })) || {};

      const subscriptions = result.data || [];
      if (!subscriptions.length) {
        break;
      }

      const tasks = subscriptions.map((subscription) =>
        this._dispatchSubscriptionReminder(subscription, jobConfig),
      );
      await Promise.allSettled(tasks);

      processed += subscriptions.length;
      const totalPages = result.pagination?.totalPages || page;
      page += 1;
      hasMore =
        subscriptions.length === pageSize &&
        page <= totalPages &&
        totalPages > 0;
    }

    this.logger.info(
      `[SubscriptionExpiryJob] processed ${processed} expiring subscriptions`,
    );

    return processed;
  }

  async _dispatchSubscriptionReminder(subscription, jobConfig) {
    const user =
      subscription.user ||
      subscription.activeSubscription?.user ||
      subscription.pendingSubscription?.user;

    if (!user?._id) {
      this.logger.warn(
        '[SubscriptionExpiryJob] Subscription reminder skipped - missing user',
        {
          subscriptionId: subscription._id,
        },
      );
      return null;
    }

    const scheduledFor = subscription.expiryDate || new Date();

    const context = await NotificationContextBuilder.buildSubscriptionContext(
      subscription,
      user,
      {
        storeName:
          subscription.planSnapshot?.name ||
          subscription.planName?.name ||
          subscription.storeName,
        expiryDate: subscription.expiryDate,
        daysRemaining: subscription.expiresIn?.days,
      },
    );

    return this.jobExecutor.dispatch({
      jobName: 'subscriptionExpiryReminder',
      notificationType: jobConfig.notificationType,
      user,
      context,
      channels: jobConfig.channels,
      scheduledFor: scheduledFor ? new Date(scheduledFor) : new Date(),
    });
  }
}

export default SubscriptionExpiryJob;
