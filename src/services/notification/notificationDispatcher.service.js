import { NotificationTemplate } from '../../models/index.js';
import TemplateRenderer from '../templateRenderer.service.js';
import EmailService from '../../utils/email.service.js';
import NotificationService from './notification.service.js';

/**
 * Notification Dispatcher Service
 * Single entry point for creating and dispatching notifications
 * Handles template fetching, rendering, and multi-channel delivery
 */
class NotificationDispatcher {
  /**
   * Dispatch a notification to a user across specified channels
   * @param {Object} params - Dispatch parameters
   * @param {string} params.type - Notification type (matches template type)
   * @param {Object} params.user - User object with _id, email, role
   * @param {Object} params.context - Template context for placeholder replacement
   * @param {string[]} params.channels - Delivery channels ['in-app', 'email']
   * @returns {Promise<Object>} Dispatch results
   */
  static async dispatch({
    type,
    user,
    context = {},
    channels = ['in-app', 'email'],
  }) {
    const results = {
      success: false,
      channels: {},
      errors: [],
    };

    try {
      // Validate required parameters
      if (!type) {
        throw new Error('Notification type is required');
      }

      if (!user?._id || !user?.role) {
        throw new Error('Valid user object with _id and role is required');
      }

      // Fetch the notification template
      const template = await NotificationTemplate.findOne({
        type,
        status: true,
      }).lean();

      if (!template) {
        throw new Error(`No active template found for type: ${type}`);
      }

      // Find the role-specific template block
      const roleTemplate = template.templates.find(
        (t) => t.userType === user.role,
      );

      if (!roleTemplate) {
        throw new Error(
          `No template block found for role: ${user.role} in type: ${type}`,
        );
      }

      // Dispatch to each requested channel
      for (const channel of channels) {
        try {
          if (channel === 'in-app') {
            await this._dispatchInApp({
              user,
              type,
              roleTemplate,
              context,
            });
            results.channels['in-app'] = {
              success: true,
              message: 'In-app notification created',
            };
          } else if (channel === 'email') {
            await this._dispatchEmail({
              user,
              type,
              roleTemplate,
              context,
            });
            results.channels.email = {
              success: true,
              message: 'Email sent successfully',
            };
          }
        } catch (channelError) {
          // Log channel-specific errors but don't fail entire dispatch
          console.error(
            `Failed to dispatch ${channel} for type ${type}:`,
            channelError.message,
          );
          results.channels[channel] = {
            success: false,
            error: channelError.message,
          };
          results.errors.push({
            channel,
            error: channelError.message,
          });
        }
      }

      // Mark as success if at least one channel succeeded
      results.success = Object.values(results.channels).some((c) => c.success);

      return results;
    } catch (error) {
      console.error('Notification dispatch failed:', error.message);
      results.errors.push({
        channel: 'all',
        error: error.message,
      });
      return results;
    }
  }

  /**
   * Dispatch in-app notification
   * @private
   */
  static async _dispatchInApp({ user, type, roleTemplate, context }) {
    // Render subject and content
    const subject = TemplateRenderer.render(
      roleTemplate.notification.subject,
      context,
    );
    const content = TemplateRenderer.render(
      roleTemplate.notification.content,
      context,
    );

    // Create notification document via the repository service
    const notification = await NotificationService.createNotification({
      userId: user._id,
      type,
      channel: 'in-app',
      subject,
      content,
      meta: context,
    });

    return notification;
  }

  /**
   * Dispatch email notification
   * @private
   */
  static async _dispatchEmail({ user, type, roleTemplate, context }) {
    if (!user.email) {
      throw new Error('User email is required for email notifications');
    }

    // Render subject and content
    const subject = TemplateRenderer.render(
      roleTemplate.email.subject,
      context,
    );
    const content = TemplateRenderer.render(
      roleTemplate.email.content,
      context,
    );

    // Send email via EmailService
    await EmailService.sendEmail(user.email, subject, content);

    // Optionally log email notification (not persisted as per requirements)
    // Could create a Notification record with channel: 'email' if logging is needed
    return { sent: true };
  }

  /**
   * Dispatch notification to multiple users
   * @param {Object} params - Dispatch parameters
   * @param {string} params.type - Notification type
   * @param {Object[]} params.users - Array of user objects
   * @param {Object} params.context - Template context
   * @param {string[]} params.channels - Delivery channels
   * @returns {Promise<Object[]>} Array of dispatch results
   */
  static async dispatchToMultiple({ type, users, context, channels }) {
    if (!Array.isArray(users) || users.length === 0) {
      throw new Error('Users array is required and must not be empty');
    }

    const results = [];

    for (const user of users) {
      const result = await this.dispatch({
        type,
        user,
        context,
        channels,
      });
      results.push({
        userId: user._id,
        ...result,
      });
    }

    return results;
  }
}

export default NotificationDispatcher;
