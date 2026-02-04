import { BaseService } from '../../utils/index.js';
import { Notification } from '../../models/index.js';

/**
 * Lightweight repository that encapsulates notification persistence logic.
 * Using BaseService keeps model access consistent with the rest of the codebase
 * and allows consumers (dispatcher, controllers, schedulers) to share behavior.
 */
class NotificationRepository extends BaseService {
  constructor() {
    super(Notification);
  }

  /**
   * Build a reusable user-scoped query with optional filters.
   * @private
   */
  _buildUserQuery(userId, filters = {}) {
    const query = { userId };

    if (filters.channel) {
      query.channel = filters.channel;
    }

    if (filters.type) {
      query.type = filters.type;
    }

    if (filters.unreadOnly) {
      query.isRead = false;
    }

    if (typeof filters.readOnly === 'boolean') {
      query.isRead = filters.readOnly;
    }

    return query;
  }

  async fetchUserNotifications(userId, options = {}) {
    const { page = 1, limit = 20, channel, type, unreadOnly = false } = options;

    const query = this._buildUserQuery(userId, {
      channel,
      type,
      unreadOnly,
    });

    const skip = (page - 1) * limit;

    const [notifications, total] = await Promise.all([
      this.model
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.model.countDocuments(query),
    ]);

    return {
      notifications,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async countUnread(userId, { channel, type } = {}) {
    const query = this._buildUserQuery(userId, {
      channel,
      type,
      unreadOnly: true,
    });

    return this.model.countDocuments(query);
  }

  async markOneAsRead(notificationId, userId) {
    const notification = await this.model.findOneAndUpdate(
      {
        _id: notificationId,
        userId,
        isRead: false,
      },
      {
        isRead: true,
        readAt: new Date(),
      },
      { new: true },
    );

    if (!notification) {
      throw new Error('Notification not found or already marked as read');
    }

    return notification;
  }

  async markManyAsRead(userId, { channel, type } = {}) {
    const query = this._buildUserQuery(userId, {
      channel,
      type,
      unreadOnly: true,
    });

    const result = await this.model.updateMany(query, {
      isRead: true,
      readAt: new Date(),
    });

    return {
      success: true,
      modifiedCount: result.modifiedCount,
    };
  }

  async deleteOne(notificationId, userId) {
    const result = await this.model.deleteOne({
      _id: notificationId,
      userId,
    });

    if (result.deletedCount === 0) {
      throw new Error('Notification not found');
    }

    return {
      success: true,
      message: 'Notification deleted successfully',
    };
  }

  async deleteMany(userId, { readOnly = false } = {}) {
    const query = this._buildUserQuery(userId, {
      readOnly,
    });

    const result = await this.model.deleteMany(query);
    return {
      success: true,
      deletedCount: result.deletedCount,
    };
  }

  async getStats(userId) {
    const [total, unread, byChannel, byType] = await Promise.all([
      this.model.countDocuments({ userId }),
      this.model.countDocuments({ userId, isRead: false }),
      this.model.aggregate([
        { $match: { userId } },
        { $group: { _id: '$channel', count: { $sum: 1 } } },
      ]),
      this.model.aggregate([
        { $match: { userId } },
        { $group: { _id: '$type', count: { $sum: 1 } } },
      ]),
    ]);

    return {
      total,
      unread,
      read: total - unread,
      byChannel: byChannel.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      byType: byType.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
    };
  }

  async createNotification({
    userId,
    type,
    channel = 'in-app',
    subject = '',
    content = '',
    meta = {},
  }) {
    return this.model.create({
      userId,
      type,
      channel,
      subject,
      content,
      meta,
      isRead: false,
    });
  }
}

const repository = new NotificationRepository();

/**
 * Facade used by controllers/dispatchers to avoid passing repository instances
 * around the codebase. Static methods delegate to the shared repository,
 * providing a clear boundary for notification data access.
 */
class NotificationService {
  static async getUserNotifications(userId, options = {}) {
    return repository.fetchUserNotifications(userId, options);
  }

  static async getUnreadCount(userId, options = {}) {
    return repository.countUnread(userId, options);
  }

  static async markAsRead(notificationId, userId) {
    return repository.markOneAsRead(notificationId, userId);
  }

  static async markAllAsRead(userId, options = {}) {
    return repository.markManyAsRead(userId, options);
  }

  static async deleteNotification(notificationId, userId) {
    return repository.deleteOne(notificationId, userId);
  }

  static async deleteAllNotifications(userId, options = {}) {
    return repository.deleteMany(userId, options);
  }

  static async getStatistics(userId) {
    return repository.getStats(userId);
  }

  /**
   * Exposed for the dispatcher so that all notification persistence
   * flows through the same repository and auditing logic.
   */
  static async createNotification(payload) {
    return repository.createNotification(payload);
  }
}

export default NotificationService;
