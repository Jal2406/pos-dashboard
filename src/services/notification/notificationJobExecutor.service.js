import crypto from 'node:crypto';
import {NotificationExecution} from '../../models/index.js';
import NotificationDispatcher from './notificationDispatcher.service.js';
import { resolveRoleName } from '../../utils/index.js';

class NotificationJobExecutor {
  constructor(logger = console) {
    this.logger = logger;
  }

  static buildJobKey({ jobName, userId, notificationType, scheduledAt }) {
    return crypto
      .createHash('sha256')
      .update(
        `${jobName}:${userId.toString()}:${notificationType}:${
          scheduledAt.toISOString().split('.')[0]
        }`,
      )
      .digest('hex');
  }

  static normalizeUser(userDoc) {
    if (!userDoc) {
      throw new Error('User is required for notification dispatch');
    }

    const user =
      typeof userDoc.toObject === 'function'
        ? userDoc.toObject()
        : { ...userDoc };

    user.role = resolveRoleName(user);

    if (!user.role) {
      throw new Error(
        `Unable to resolve notification role for user ${user._id?.toString?.()}`,
      );
    }

    return user;
  }

  async dispatch({
    jobName,
    notificationType,
    user,
    context = {},
    channels = ['in-app'],
    scheduleId = null,
    scheduledFor = new Date(),
  }) {
    if (!user?._id) {
      throw new Error('User with _id is required');
    }

    const jobKey = NotificationJobExecutor.buildJobKey({
      jobName,
      userId: user._id,
      notificationType,
      scheduledAt: scheduledFor,
    });

    let execution = await NotificationExecution.findOne({ jobKey });
    if (execution && execution.status === 'completed') {
      return execution;
    }

    if (!execution) {
      try {
        execution = await NotificationExecution.create({
          jobKey,
          jobName,
          notificationType,
          scheduleRef: scheduleId,
          targetUser: user._id,
          channels,
          scheduledFor,
        });
      } catch (error) {
        if (error.code === 11000) {
          execution = await NotificationExecution.findOne({ jobKey });
        } else {
          throw error;
        }
      }
    }

    if (!execution) {
      throw new Error('Failed to create notification execution record');
    }

    execution.status = 'processing';
    execution.attempts += 1;
    await execution.save();

    try {
      const normalizedUser = NotificationJobExecutor.normalizeUser(user);
      const dispatchResult = await NotificationDispatcher.dispatch({
        type: notificationType,
        user: normalizedUser,
        context,
        channels,
      });

      execution.channelStatuses = dispatchResult.channels;
      execution.dispatchedAt = new Date();
      execution.status = dispatchResult.success
        ? 'completed'
        : 'partial_failure';
      execution.lastError = dispatchResult.errors
        ?.map((err) => err.error)
        ?.join('; ');
      await execution.save();

      if (!dispatchResult.success) {
        throw new Error(
          execution.lastError || 'Notification dispatch partially failed',
        );
      }

      return execution;
    } catch (error) {
      execution.status = 'failed';
      execution.lastError = error.message;
      await execution.save();
      this.logger.error('[NotificationJobExecutor] Dispatch failed', {
        jobName,
        userId: user._id,
        error: error.message,
      });
      throw error;
    }
  }
}

export default NotificationJobExecutor;

