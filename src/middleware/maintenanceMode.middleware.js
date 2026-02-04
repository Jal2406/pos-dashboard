import { StatusCodes } from 'http-status-codes';
import {MiscSettingService} from '../services/index.js';
import AuthMiddleware from './auth.middleware.js';

/**
 * Maintenance Mode Middleware
 * Blocks all routes except whitelisted ones when maintenance mode is active
 * Only superadmin can access protected routes during maintenance
 */
class MaintenanceModeMiddleware {
    // Cache for maintenance mode status to avoid database hits on every request
    static maintenanceCache = {
        isActive: false,
        lastChecked: 0,
        ttl: 30000, // 30 seconds cache TTL
    };

    /**
     * Routes that should remain accessible during maintenance mode
     * These are typically public routes and essential authentication endpoints
     */
    static whitelistedRoutes = [
        // Authentication routes
        '/api/v2/auth/login', // Allow login attempts (will be validated in controller)
        '/api/v2/auth/session-status',
        '/api/v2/auth/logout',

        // Public settings routes (for frontend to check maintenance status)
        '/api/v2/misc-settings',
        '/api/v2/general-settings',

        '/api/v2/footer-section',
        '/api/v2//socialMedia'
    
    ];

    /**
     * Check if a route is whitelisted
     * @param {string} path - Request path
     * @returns {boolean} True if route is whitelisted
     */
    static isWhitelistedRoute(path) {
        return this.whitelistedRoutes.some((route) => {
            // Exact match or starts with the route (for nested paths)
            return path === route || path.startsWith(`${route}/`);
        });
    }

    /**
     * Get maintenance mode status with caching
     * @returns {Promise<boolean>} True if maintenance mode is active
     */
    static async getMaintenanceStatus() {
        const now = Date.now();

        // Return cached value if still valid
        if (now - this.maintenanceCache.lastChecked < this.maintenanceCache.ttl) {
            return this.maintenanceCache.isActive;
        }

        // Fetch fresh status from database
        try {
            const miscSettingService = new MiscSettingService();
            const isActive = await miscSettingService.isMaintenanceModeActive();

            // Update cache
            this.maintenanceCache.isActive = isActive;
            this.maintenanceCache.lastChecked = now;

            return isActive;
        } catch (error) {
            console.error('Failed to check maintenance mode status:', error);
            // Fail-safe: if we can't check, assume not in maintenance
            return false;
        }
    }

    /**
     * Invalidate maintenance mode cache
     * Should be called when maintenance mode settings are updated
     */
    static invalidateCache() {
        this.maintenanceCache.lastChecked = 0;
    }

    /**
     * Main middleware function to check maintenance mode
     * @returns {Function} Express middleware function
     */
    static checkMaintenanceMode() {
        return async (req, res, next) => {
            try {
                // Check if route is whitelisted
                if (this.isWhitelistedRoute(req.path)) {
                    return next();
                }

                // Check if maintenance mode is active
                const isMaintenanceMode = await this.getMaintenanceStatus();

                if (!isMaintenanceMode) {
                    // Not in maintenance mode, allow all requests
                    return next();
                }

                // Maintenance mode is active - check if user is superadmin
                // First check session authentication
                let user = null;

                if (req.isAuthenticated && req.isAuthenticated() && req.user) {
                    user = req.user;
                } else {
                    // Try to get user from JWT token
                    const authResult = await AuthMiddleware._authenticateUser(req, ['jwt']);
                    if (authResult.success) {
                        user = authResult.user;
                    }
                }

                // If user is superadmin, allow access
                if (user && AuthMiddleware.isSuperadmin(user)) {
                    return next();
                }

                // Block all other requests during maintenance mode
                return res.status(StatusCodes.SERVICE_UNAVAILABLE).json({
                    success: false,
                    message: 'System is currently under maintenance. Please try again later.',
                    statusCode: StatusCodes.SERVICE_UNAVAILABLE,
                    data: null,
                });
            } catch (error) {
                console.error('Maintenance mode middleware error:', error);
                // Fail-safe: allow request to proceed if middleware fails
                return next();
            }
        };
    }
}

export default MaintenanceModeMiddleware;
