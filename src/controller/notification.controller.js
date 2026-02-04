import NotificationService from '../services/notification/notification.service.js';

/**
 * Notification Controller
 * Orchestration layer for notification endpoints
 * No business logic - delegates to NotificationService
 */
class NotificationController {
    /**
     * Get user notifications (paginated)
     * GET /notifications
     */
    static async getNotifications(req, res) {
        try {
            const userId = req.user._id;
            const {
                page = 1,
                limit = 20,
                channel,
                type,
                unreadOnly,
            } = req.query;

            const result = await NotificationService.getUserNotifications(
                userId,
                {
                    page: Number(page),
                    limit: Number(limit),
                    channel,
                    type,
                    unreadOnly: unreadOnly === 'true',
                }
            );

            res.status(200).json({
                success: true,
                data: result.notifications,
                pagination: result.pagination,
            });
        } catch (error) {
            console.error('Get notifications error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch notifications',
                error: error.message,
            });
        }
    }

    /**
     * Get unread notification count
     * GET /notifications/unread-count
     */
    static async getUnreadCount(req, res) {
        try {
            const userId = req.user._id;
            const { channel, type } = req.query;

            const count = await NotificationService.getUnreadCount(userId, {
                channel,
                type,
            });

            res.status(200).json({
                success: true,
                data: { count },
            });
        } catch (error) {
            console.error('Get unread count error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch unread count',
                error: error.message,
            });
        }
    }

    /**
     * Mark a notification as read
     * PATCH /notifications/:id/read
     */
    static async markAsRead(req, res) {
        try {
            const userId = req.user._id;
            const { id } = req.params;

            const notification = await NotificationService.markAsRead(
                id,
                userId
            );

            res.status(200).json({
                success: true,
                message: 'Notification marked as read',
                data: notification,
            });
        } catch (error) {
            console.error('Mark as read error:', error);
            const statusCode = error.message.includes('not found') ? 404 : 500;
            res.status(statusCode).json({
                success: false,
                message: error.message,
            });
        }
    }

    /**
     * Mark all notifications as read
     * PATCH /notifications/read-all
     */
    static async markAllAsRead(req, res) {
        try {
            const userId = req.user._id;
            const { channel, type } = req.query;

            const result = await NotificationService.markAllAsRead(userId, {
                channel,
                type,
            });

            res.status(200).json({
                success: true,
                message: 'All notifications marked as read',
                data: result,
            });
        } catch (error) {
            console.error('Mark all as read error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to mark notifications as read',
                error: error.message,
            });
        }
    }

    /**
     * Delete a notification
     * DELETE /notifications/:id
     */
    static async deleteNotification(req, res) {
        try {
            const userId = req.user._id;
            const { id } = req.params;

            const result = await NotificationService.deleteNotification(
                id,
                userId
            );

            res.status(200).json({
                success: true,
                message: result.message,
            });
        } catch (error) {
            console.error('Delete notification error:', error);
            const statusCode = error.message.includes('not found') ? 404 : 500;
            res.status(statusCode).json({
                success: false,
                message: error.message,
            });
        }
    }

    /**
     * Delete all notifications
     * DELETE /notifications/all
     */
    static async deleteAllNotifications(req, res) {
        try {
            const userId = req.user._id;
            const { readOnly } = req.query;

            const result = await NotificationService.deleteAllNotifications(
                userId,
                {
                    readOnly: readOnly === 'true',
                }
            );

            res.status(200).json({
                success: true,
                message: 'Notifications deleted successfully',
                data: result,
            });
        } catch (error) {
            console.error('Delete all notifications error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to delete notifications',
                error: error.message,
            });
        }
    }

    /**
     * Get notification statistics
     * GET /notifications/statistics
     */
    static async getStatistics(req, res) {
        try {
            const userId = req.user._id;

            const stats = await NotificationService.getStatistics(userId);

            res.status(200).json({
                success: true,
                data: stats,
            });
        } catch (error) {
            console.error('Get statistics error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch statistics',
                error: error.message,
            });
        }
    }
}

export default NotificationController;
