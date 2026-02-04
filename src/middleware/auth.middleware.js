import passport from 'passport';
import { StatusCodes } from 'http-status-codes';
import { ResponseService } from '../utils/index.js';
import { User } from '../models/index.js';

/**
 * Production-grade unified authentication middleware
 * Supports both session-based and JWT authentication
 * Prioritizes session auth for web clients, falls back to JWT for API clients
 */
class AuthMiddleware {
  /**
   * Universal authentication middleware that supports both session and JWT
   * @param {Array|String} strategies - Passport strategies to try
   * @param {Object} options - Authentication options
   * @returns {Function} Express middleware function
   */
  static authenticate(
    strategies = ['jwt', 'admin', 'manager', 'cashier'],
    options = {},
  ) {
    return async (req, res, next) => {
      try {
        // Check session authentication first
        const hasSession = req.isAuthenticated && req.isAuthenticated() && req.user;

        if (hasSession) {
          const sessionUser = await this._validateSessionUser(req.user);
          if (sessionUser) {
            req.user = sessionUser;
            console.log(`[AUTH] ✅ ${req.method} ${req.path} → SESSION`);
            return next();
          }
        }

        // Fallback to JWT authentication
        const jwtResult = await this._tryJwtAuthentication(req, strategies);
        if (jwtResult.success) {
          req.user = jwtResult.user;
          console.log(`[AUTH] ✅ ${req.method} ${req.path} → JWT (${jwtResult.tokenSource})`);
          return next();
        }

        console.log(`[AUTH] ❌ ${req.method} ${req.path} → UNAUTHORIZED`);
        return ResponseService.send(
          res,
          StatusCodes.UNAUTHORIZED,
          'Authentication required',
          0,
        );
      } catch (error) {
        console.error(`[AUTH] ❌ ${req.method} ${req.path} → ERROR:`, error.message);
        return ResponseService.send(
          res,
          StatusCodes.INTERNAL_SERVER_ERROR,
          'Authentication error',
          0,
        );
      }
    };
  }

  /**
   * Role-based authentication middleware
   * @param {Array|String} allowedRoles - Roles that can access the route
   * @param {Array|String} strategies - Passport strategies to try
   * @returns {Function} Express middleware function
   */
  static requireRole(
    allowedRoles = [],
    strategies = ['jwt', 'admin', 'manager', 'cashier'],
  ) {
    return async (req, res, next) => {
      try {
        // First authenticate the user
        const authResult = await this._authenticateUser(req, strategies);

        if (!authResult.success) {
          return ResponseService.send(
            res,
            StatusCodes.UNAUTHORIZED,
            'Authentication required',
            0,
          );
        }

        req.user = authResult.user;

        // Check if user has required role
        const userRole = authResult.user.roleId?.name || authResult.user.role;
        const rolesArray = Array.isArray(allowedRoles)
          ? allowedRoles
          : [allowedRoles];

        if (!rolesArray.includes(userRole)) {
          return ResponseService.send(
            res,
            StatusCodes.FORBIDDEN,
            'Insufficient permissions',
            0,
          );
        }

        return next();
      } catch (error) {
        console.error('Role-based authentication error:', error);
        return ResponseService.send(
          res,
          StatusCodes.INTERNAL_SERVER_ERROR,
          'Authentication error',
          0,
        );
      }
    };
  }

  /**
   * Superadmin-only authentication
   */
  static requireSuperadmin() {
    return this.requireRole(['superadmin'], ['jwt']);
  }

  /**
   * Admin-only authentication (includes superadmin)
   */
  static requireAdmin() {
    return this.requireRole(
      ['superadmin', 'admin', 'manager', 'cashier'],
      ['jwt', 'admin', 'manager', 'cashier'],
    );
  }

  /**
   * Manager authentication (includes admin and superadmin)
   */
  static requireManager() {
    return this.requireRole(
      ['superadmin', 'admin', 'manager'],
      ['jwt', 'admin', 'manager'],
    );
  }

  /**
   * Cashier authentication (includes all roles)
   */
  static requireCashier() {
    return this.requireRole(
      ['superadmin', 'admin', 'manager', 'cashier'],
      ['jwt', 'admin', 'manager', 'cashier'],
    );
  }

  /**
   * Optional authentication - doesn't fail if no auth, but sets req.user if authenticated
   */
  static optionalAuth(strategies = ['jwt', 'admin', 'manager', 'cashier']) {
    return async (req, res, next) => {
      try {
        // Try to authenticate, but don't fail if unsuccessful
        const authResult = await this._authenticateUser(req, strategies);
        if (authResult.success) {
          req.user = authResult.user;
        }
        return next();
      } catch (error) {
        console.error('Optional authentication error:', error);
        // Continue without authentication
        return next();
      }
    };
  }

  /**
   * Internal method to authenticate user using session or JWT
   * @private
   */
  static async _authenticateUser(req, strategies) {
    const hasSession = req.isAuthenticated && req.isAuthenticated() && req.user;

    // First, check session authentication
    if (hasSession) {
      const sessionUser = await this._validateSessionUser(req.user);
      if (sessionUser) {
        return { success: true, user: sessionUser, authMethod: 'session' };
      }
    }

    // Try JWT authentication
    return await this._tryJwtAuthentication(req, strategies);
  }

  /**
   * Internal method to validate session user
   * @private
   */
  static async _validateSessionUser(sessionUser) {
    try {
      const sessionUserId = sessionUser._id || sessionUser.id;

      // Check if user still exists and is active
      const user = await User.findById(sessionUserId)
        .populate('roleId')
        .select('-password')
        .lean();

      if (!user || !user.isActive) {
        return null;
      }

      return user;
    } catch (error) {
      console.error('Session user validation error:', error);
      return null;
    }
  }

  /**
   * Internal method to try JWT authentication
   * @private
   */
  static async _tryJwtAuthentication(req, strategies) {
    return new Promise((resolve) => {
      const strategiesArray = Array.isArray(strategies)
        ? strategies
        : [strategies];

      // Determine token source for logging
      let tokenSource = 'none';
      if (req.signedCookies?.accessToken) {
        tokenSource = 'signed-cookie';
      } else if (req.cookies?.accessToken) {
        tokenSource = 'cookie';
      } else if (req.headers.authorization?.startsWith('Bearer ')) {
        tokenSource = 'header';
      }

      // Create a custom passport authenticate function
      const authenticate = passport.authenticate(
        strategiesArray,
        { session: false },
        (err, user) => {
          if (err) {
            console.error(`[AUTH] ❌ JWT error:`, err.message);
            return resolve({ success: false, user: null, tokenSource });
          }

          if (!user) {
            return resolve({ success: false, user: null, tokenSource });
          }

          resolve({ success: true, user, tokenSource });
        },
      );

      // Execute the authentication
      authenticate(req, null, (err) => {
        if (err) {
          return resolve({ success: false, user: null });
        }
        // This callback is called when authentication completes
      });
    });
  }

  /**
   * Middleware to ensure user is authenticated (any method)
   */
  static ensureAuthenticated() {
    return (req, res, next) => {
      if (req.isAuthenticated && req.isAuthenticated() && req.user) {
        return next();
      }

      // Check for JWT token
      const token = this._getTokenFromRequest(req);
      if (token) {
        // Let JWT middleware handle it
        return next();
      }

      return ResponseService.send(
        res,
        StatusCodes.UNAUTHORIZED,
        'Authentication required',
        0,
      );
    };
  }

  /**
   * Get token from request (cookie or header)
   * @private
   */
  static _getTokenFromRequest(req) {
    // Check signed cookies first
    if (req.signedCookies && req.signedCookies.accessToken) {
      return req.signedCookies.accessToken;
    }

    // Then check regular cookies
    if (req.cookies && req.cookies.accessToken) {
      return req.cookies.accessToken;
    }

    // Finally check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.split(' ')[1];
    }

    return null;
  }

  /**
   * Check if user is superadmin
   * @param {Object} user - User object
   * @returns {boolean} True if user is superadmin
   */
  static isSuperadmin(user) {
    if (!user) return false;

    // Check populated role
    if (user.roleId?.name === 'superadmin') return true;

    // Check role ID (1 = superadmin)
    if (user.roleId === 1) return true;

    // Check virtual role property
    if (user.role === 'superadmin') return true;

    return false;
  }

  /**
   * Middleware to log authentication attempts (for security monitoring)
   */
  static logAuthAttempts() {
    return (req, res, next) => {
      const originalSend = res.send;

      res.send = function (data) {
        // Log authentication attempts
        if (res.statusCode === 401 || res.statusCode === 403) {
          console.log(
            `Auth attempt failed: ${req.method} ${req.path} - IP: ${req.ip} - User-Agent: ${req.headers['user-agent']}`,
          );
        }

        return originalSend.call(this, data);
      };

      next();
    };
  }
}

export default AuthMiddleware;
