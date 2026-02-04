import mongoose from 'mongoose';

const loginHistorySchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        // Captured at the time of login in case role changes later
        role: {
            type: String,
            trim: true,
        },
        loginTime: {
            type: Date,
            required: true,
            default: Date.now,
            index: true,
        },
        logoutTime: {
            type: Date,
        },
        duration: {
            type: String, // Calculated string like "2h 15m"
        },
        ipAddress: {
            type: String,
            trim: true,
        },
        macAddress: {
            type: String,
            trim: true,
        },
        deviceInfo: {
            type: String, // User agent or specific device name
            trim: true,
        },
        businessId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Business',
            index: true, // Important for tenant isolation
        },
        sessionId: {
            type: String,
            trim: true,
            index: true
        }
    },
    {
        timestamps: true, // adds createdAt and updatedAt
    }
);

// Index for sorting by loginTime (descending) is common
loginHistorySchema.index({ loginTime: -1 });

// Index for fetching a specific user's login history
loginHistorySchema.index({ userId: 1, loginTime: -1 });

// Index for quick IP lookups (security audits)
loginHistorySchema.index({ ipAddress: 1 });

const LoginHistory = mongoose.model('LoginHistory', loginHistorySchema);
export default LoginHistory;
