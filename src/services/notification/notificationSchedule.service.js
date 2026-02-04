import { BaseService, mapRoleNamesToIds } from '../../utils/index.js';
import { NotificationSchedule } from '../../models/index.js';

class NotificationScheduleService extends BaseService {
  constructor() {
    super(NotificationSchedule);
  }

  /**
   * Atomically claim the next due schedule.
   * @param {number} lockDurationMs
   * @returns {Promise<Object|null>}
   */
  async claimNextDueSchedule(lockDurationMs = 10 * 60 * 1000) {
    const now = new Date();
    const lockUntil = new Date(now.getTime() + lockDurationMs);
    return this.model
      .findOneAndUpdate(
        {
          isActive: true,
          status: 'pending',
          scheduledFor: { $lte: now },
          $or: [{ lockUntil: null }, { lockUntil: { $lte: now } }],
        },
        {
          status: 'processing',
          lockUntil,
        },
        { sort: { scheduledFor: 1 }, new: true },
      )
      .lean();
  }

  /**
   * Persist the result for a processed schedule.
   * @param {string} scheduleId
   * @param {Object} result
   * @returns {Promise<Object|null>}
   */
  async markRunResult(scheduleId, result = {}) {
    const update = {
      ...result,
      lastRunAt: new Date(),
      lockUntil: null,
    };

    if (result.nextScheduledFor) {
      update.scheduledFor = result.nextScheduledFor;
      update.status = 'pending';
      update.isActive = true;
    }

    if (!result?.nextScheduledFor) {
      update.isActive =
        typeof result?.isActive === 'boolean'
          ? result.isActive
          : result.status !== 'failed';
    }

    return this.model
      .findByIdAndUpdate(scheduleId, update, { new: true })
      .lean();
  }

  /**
   * Convert role names stored on schedules into numeric Role IDs.
   * @param {string[]} roles
   * @returns {number[]}
   */
  static mapRoles(roles = []) {
    return mapRoleNamesToIds(roles);
  }
}

export default NotificationScheduleService;

