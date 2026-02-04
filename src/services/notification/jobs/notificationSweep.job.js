import cronParser from 'cron-parser';
import { User } from '../../../models/index.js';

/**
 * Executes due notification schedules in controlled batches.
 * Responsible for locking, recipient resolution, and dispatch orchestration.
 */
class NotificationSweepJob {
  constructor({
    notificationScheduleService,
    jobExecutor,
    logger = console,
    defaultTimezone = 'UTC',
    mapRoles,
  }) {
    this.notificationScheduleService = notificationScheduleService;
    this.jobExecutor = jobExecutor;
    this.logger = logger;
    this.defaultTimezone = defaultTimezone;
    this.mapRoles = mapRoles;
  }

  async run(jobConfig = {}) {
    const { batchSize = 25, claimLockMs = 10 * 60 * 1000 } =
      jobConfig.options || {};

    let processed = 0;
    while (processed < batchSize) {
      const schedule =
        await this.notificationScheduleService.claimNextDueSchedule(
          claimLockMs,
        );
      if (!schedule) {
        break;
      }

      try {
        await this._executeSchedule(schedule);
      } catch (error) {
        this.logger.error('[NotificationSweepJob] Failed to run schedule', {
          error,
        });
        await this.notificationScheduleService.markRunResult(schedule._id, {
          status: 'failed',
          lastRunStatus: 'failed',
          lastError: error.message,
        });
      }

      processed += 1;
    }

    if (processed > 0) {
      this.logger.info(
        `[NotificationSweepJob] Processed ${processed} scheduled notifications`,
      );
    }

    return processed;
  }

  async _executeSchedule(schedule) {
    const recipients = await this._resolveRecipients(schedule);
    const scheduledFor = schedule.scheduledFor
      ? new Date(schedule.scheduledFor)
      : new Date();

    if (!recipients.length) {
      await this.notificationScheduleService.markRunResult(schedule._id, {
        status: 'completed',
        lastRunStatus: 'success',
        metadata: {
          ...(schedule.metadata || {}),
          summary: {
            total: 0,
            success: 0,
            failures: 0,
          },
        },
      });
      return;
    }

    const jobName = `schedule:${schedule._id.toString()}`;
    const settled = await Promise.allSettled(
      recipients.map((user) =>
        this.jobExecutor.dispatch({
          jobName,
          notificationType: schedule.notificationType,
          user,
          context: schedule.context,
          channels: schedule.channels,
          scheduleId: schedule._id,
          scheduledFor,
        }),
      ),
    );

    const failures = settled.filter((res) => res.status === 'rejected');
    const summary = {
      total: recipients.length,
      success: recipients.length - failures.length,
      failures: failures.length,
    };

    let lastRunStatus = 'success';
    if (summary.failures > 0 && summary.success > 0) {
      lastRunStatus = 'partial';
    } else if (summary.failures === summary.total) {
      lastRunStatus = 'failed';
    }

    const nextScheduledFor = this._computeNextRun(schedule);

    await this.notificationScheduleService.markRunResult(schedule._id, {
      status:
        summary.failures === summary.total && !nextScheduledFor
          ? 'failed'
          : 'completed',
      lastRunStatus,
      lastError: failures[0]?.reason?.message || null,
      metadata: {
        ...(schedule.metadata || {}),
        summary,
      },
      nextScheduledFor,
      isActive: Boolean(nextScheduledFor),
    });
  }

  _computeNextRun(schedule) {
    if (
      !schedule.recurrence?.cronExpression ||
      schedule.status === 'cancelled'
    ) {
      return null;
    }

    try {
      const interval = cronParser.parseExpression(
        schedule.recurrence.cronExpression,
        {
          tz:
            schedule.recurrence.timezone ||
            schedule.timezone ||
            this.defaultTimezone,
        },
      );
      const next = interval.next().toDate();

      if (
        schedule.recurrence.stopAfter &&
        next > new Date(schedule.recurrence.stopAfter)
      ) {
        return null;
      }

      return next;
    } catch (error) {
      this.logger.error(
        '[NotificationSweepJob] Failed to compute next schedule run',
        {
          scheduleId: schedule._id,
          error: error.message,
        },
      );
      return null;
    }
  }

  async _resolveRecipients(schedule) {
    if (
      Array.isArray(schedule.targetUserIds) &&
      schedule.targetUserIds.length
    ) {
      return User.find({
        _id: { $in: schedule.targetUserIds },
        isActive: true,
      })
        .select('_id name email roleId isActive')
        .lean();
    }

    if (Array.isArray(schedule.targetRoles) && schedule.targetRoles.length) {
      const roleIds = this.mapRoles(schedule.targetRoles);
      if (!roleIds.length) {
        return [];
      }

      return User.find({
        roleId: { $in: roleIds },
        isActive: true,
      })
        .select('_id name email roleId isActive')
        .lean();
    }

    return [];
  }
}

export default NotificationSweepJob;
