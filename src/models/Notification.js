import mongoose from 'mongoose';

const NotificationSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'User ID is required'],
        },
        type: {
            type: String,
            required: [true, 'Notification type is required'],
            trim: true,
        },
        channel: {
            type: String,
            enum: ['in-app', 'email'],
            required: [true, 'Channel is required'],
        },
        subject: {
            type: String,
            required: [true, 'Subject is required'],
            trim: true,
        },
        content: {
            type: String,
            required: [true, 'Content is required'],
        },
        meta: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
        isRead: {
            type: Boolean,
            default: false,
        },
        readAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    },
);

// Compound index for efficient unread queries (most common query pattern)
NotificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

// Index for channel-specific queries
NotificationSchema.index({ userId: 1, channel: 1, createdAt: -1 });

// Index for type-based filtering
NotificationSchema.index({ userId: 1, type: 1, createdAt: -1 });

// TTL Index: Automatically delete notifications older than 30 days
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

const Notification = mongoose.model('Notification', NotificationSchema);

export default Notification;
