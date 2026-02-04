import { BaseService } from '../utils/index.js';
import { User, Role, Business, LoginHistory } from "../models/index.js"

class LoginHistoryServices extends BaseService {
    constructor(businessId = null) {
        // if (!businessId) {
        //     throw new Error('LoginHistory Services initialized without businessId');
        // }
        super({
            modelName: 'Login History',
            schema: LoginHistory,
            collection: 'loginHistories',
            businessId,
        });
        this._referenceModelsReady = false;
    }


    /**
     * Override base list method to provide specific filtering and population
     */
    async list(queryParams = {}, businessId) {
        try {
            // REMOVED: Strict check for businessId. 
            // SuperAdmins might list all, or we list strictly for the requesting admin.
            // if (!businessId) { throw new Error('Business ID is required'); }

            const {
                page = 1,
                limit = 10,
                search = '',
                role,
                fromDate,
                toDate,
                store
            } = queryParams;

            // Base query
            const query = {};

            // Business/Store Filter
            // If explicit 'store' param provided (and not "All" or "undefined"), use it. 
            // Otherwise fall back to the context businessId (e.g. generic tenant middleware).
            if (store && store !== 'All' && store !== 'undefined') {
                query.businessId = store;
            } else if (businessId && businessId !== 'undefined') {
                query.businessId = businessId;
            }

            // Date Range Filter
            const start = fromDate;
            const end = toDate;

            if (start || end) {
                query.loginTime = {};
                if (start) query.loginTime.$gte = new Date(start);
                if (end) query.loginTime.$lte = new Date(end);
            }

            // Role Filter
            if (role) {
                query.role = { $regex: role, $options: 'i', $ne: 'superadmin' };
            } else {
                query.role = { $ne: 'superadmin' };
            }

            // Populate options
            const populate = [
                { path: 'userId', select: 'name email roleId' },
                { path: 'businessId', select: 'businessName' }
            ];

            // Handle Search (Username or Email)
            if (search) {
                const users = await User.find({
                    $or: [
                        { name: { $regex: search, $options: 'i' } },
                        { email: { $regex: search, $options: 'i' } }
                    ]
                }).select('_id');

                const userIds = users.map(u => u._id);

                // Add to query
                query.$or = [
                    { userId: { $in: userIds } },
                    { ipAddress: { $regex: search, $options: 'i' } }
                ];
            }

            const Model = LoginHistory;

            const pageNum = Math.max(1, Number(page));
            const limitNum = Math.max(1, Number(limit));
            const skip = (pageNum - 1) * limitNum;

            const [data, total] = await Promise.all([
                Model.find(query)
                    .sort({ loginTime: -1 })
                    .skip(skip)
                    .limit(limitNum)
                    .populate(populate)
                    .lean(),
                Model.countDocuments(query)
            ]);

            const processedData = data.map(entry => {
                const user = entry.userId;

                // Calculate duration if active
                let durationStr = entry.duration;
                if (!entry.logoutTime) {
                    const now = new Date();
                    const start = new Date(entry.loginTime);
                    const diff = now - start;
                    const hours = Math.floor(diff / (1000 * 60 * 60));
                    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                    durationStr = `${hours}h ${minutes}m`;
                }

                return {
                    store: entry.businessId ? entry.businessId.businessName : '',
                    user: user ? user.name : 'Unknown',
                    role: entry.role || (user && user.roleId && user.roleId.name ? user.roleId.name : 'Unknown'),
                    ipAddress: entry.ipAddress || 'N/A',
                    device: entry.deviceInfo || 'Unknown',
                    loginTime: entry.loginTime,
                    logoutTime: entry.logoutTime || null,
                    duration: durationStr // Shows calculated time for active sessions too
                };
            });

            // --- Calculate Summary Metrics ---
            const activeLoginsCount = await Model.countDocuments({ ...query, logoutTime: { $exists: false } });

            // Calculate average duration (only for completed sessions)
            const avgDurationAgg = await Model.aggregate([
                { $match: { ...query, logoutTime: { $exists: true } } },
                {
                    $project: {
                        durationMs: { $subtract: ["$logoutTime", "$loginTime"] }
                    }
                },
                {
                    $group: {
                        _id: null,
                        avgDuration: { $avg: "$durationMs" }
                    }
                }
            ]);

            let avgDurationStr = "0h 0m";
            if (avgDurationAgg.length > 0 && avgDurationAgg[0].avgDuration) {
                const avgMs = avgDurationAgg[0].avgDuration;
                const hrs = Math.floor(avgMs / (1000 * 60 * 60));
                const mins = Math.floor((avgMs % (1000 * 60 * 60)) / (1000 * 60));
                avgDurationStr = `${hrs}h ${mins}m`;
            }
            // ---------------------------------

            return {
                summary: {
                    totalLogins: total,
                    activeLogins: activeLoginsCount,
                    averageSessionDuration: avgDurationStr
                },
                data: processedData,
                pagination: {
                    currentPage: pageNum,
                    totalPages: Math.ceil(total / limitNum),
                    totalItems: total,
                    itemsPerPage: limitNum,
                    hasNext: pageNum * limitNum < total,
                    hasPrev: pageNum > 1
                }
            };

        } catch (error) {
            throw new Error(`Error listing login history: ${error.message}`);
        }
    }

    /**
     * Record a new login event
     */
    async recordLogin(userId, businessId, ipAddress, macAddress, deviceInfo, sessionId) {
        try {
            const user = await User.findById(userId).populate('roleId');
            let roleName = 'Unknown';
            let finalBusinessId = businessId;

            // Resolve Role Name
            if (user && user.roleId) {
                if (typeof user.roleId === 'object' && user.roleId.name) {
                    roleName = user.roleId.name;
                }
                else if (user.roleId === 2) roleName = 'admin';
                else if (user.roleId === 3) roleName = 'manager';
                else if (user.roleId === 4) roleName = 'cashier';

                if (typeof user.roleId === 'number') {
                    try {
                        const r = await Role.findById(user.roleId);
                        if (r) roleName = r.name;
                    } catch (e) { /* ignore */
                        console.log(e);
                    }
                }
            }

            // Attempt to resolve Business ID if missing (e.g. for Tenant Admins)
            if (!finalBusinessId) {
                const rNameLower = roleName.toLowerCase();

                // For Cashier/Manager: Find business via parentId (Owner)
                if ((rNameLower === 'cashier' || rNameLower === 'manager') && user.parentId) {
                    try {
                        const business = await Business.findOne({ owner: user.parentId }).select('_id');
                        if (business) {
                            finalBusinessId = business._id;
                        }
                    } catch (e) { /* ignore */ }
                }

                // If user is Owner/Admin, find their business
                try {
                    const business = await Business.findOne({ owner: userId }).select('_id');
                    if (business) {
                        finalBusinessId = business._id;
                    }
                } catch (e) {
                    console.log(e);
                    /* ignore */
                }
            }

            // --- AUTO-CLOSE PREVIOUS SESSIONS ---
            // Find all active sessions for this user and close them to prevent dangling "Active" records.
            const activeSessions = await LoginHistory.find({
                userId,
                logoutTime: { $exists: false }
            });

            const now = new Date();
            for (const session of activeSessions) {
                session.logoutTime = now;
                const durationMs = now - new Date(session.loginTime);
                const hours = Math.floor(durationMs / (1000 * 60 * 60));
                const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
                session.duration = `${hours}h ${minutes}m`;
                await session.save();
            }
            // ------------------------------------

            const entry = await LoginHistory.create({
                userId,
                businessId: finalBusinessId,
                role: roleName,
                loginTime: new Date(),
                ipAddress,
                deviceInfo,
                sessionId
            });


            return entry;
        } catch (error) {
            console.error('Failed to record login:', error);
        }
    }

    /**
     * Record logout and calculate duration
     */
    async recordLogout(userId, sessionId) {
        const now = new Date();
        try {
            const Model = LoginHistory;
            let query = { userId: userId, logoutTime: { $exists: false } };

            // If sessionId is provided, use it for precise matching
            if (sessionId) {
                query.sessionId = sessionId;
            }

            const latestSession = await Model.findOne(query).sort({ loginTime: -1 });

            if (latestSession) {
                const durationMs = now - new Date(latestSession.loginTime);

                // Format Duration
                const hours = Math.floor(durationMs / (1000 * 60 * 60));
                const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));

                const durationStr = `${hours}h ${minutes}m`;

                latestSession.logoutTime = now;
                latestSession.duration = durationStr;
                await latestSession.save();
            }
        } catch (error) {
            console.error('Failed to record logout:', error);
        }
    }
}

export default LoginHistoryServices;
