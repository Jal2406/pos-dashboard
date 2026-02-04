import jwt from 'jsonwebtoken';
import { RefreshToken, User } from '../models/index.js';
import crypto from 'crypto';

class TokenUtils {
  /**
   * Generate access token for user
   * @param {Object} user - User object
   * @param {String} role - User role
   * @returns {String} JWT access token
   */
  static generateAccessToken(user, role) {
    const secret =
      role === 'admin'
        ? process.env.JWT_SECRET_ADMIN
        : role === 'superadmin'
          ? process.env.JWT_SECRET_SUPERADMIN
          : role === 'cashier'
            ? process.env.JWT_SECRET_CASHIER
            : process.env.JWT_SECRET_MANAGER;

    // Ensure we don't pass Mongoose Documents or circular structures
    const safeUser =
      user && typeof user === 'object'
        ? user.toObject
          ? user.toObject()
          : { ...user }
        : user;

    return jwt.sign({ user: safeUser, role }, secret, {
      expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || '1h',
    });
  }

  /**
   * Generate refresh token for user (optimized for performance)
   * @param {String} userId - User ID
   * @param {Object} req - Express request object for IP and user agent
   * @returns {Object} Refresh token object with token string and expiry
   */
  static async generateRefreshToken(userId, req = {}) {
    // Generate a secure random token
    const refreshToken = crypto.randomBytes(40).toString('hex');

    // Calculate expiry (default 30 days)
    const expiresInDays = parseInt(
      process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS || '30',
      10,
    );
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    // Get IP and user agent if available
    const ipAddress = req.ip || req.headers?.['x-forwarded-for'] || '';
    const userAgent = req.headers?.['user-agent'] || '';

    // Save refresh token to database asynchronously (non-blocking)
    setImmediate(async () => {
      try {
        await RefreshToken.create({
          userId,
          token: refreshToken,
          expiresAt,
          ipAddress,
          userAgent,
        });
      } catch (err) {
        console.error('RefreshToken creation error:', err);
      }
    });

    return {
      token: refreshToken,
      expiresAt,
    };
  }

  /**
   * Verify refresh token and return user ID if valid
   * @param {String} refreshToken - Refresh token to verify
   * @returns {Promise<String>} User ID if token is valid
   * @throws {Error} If token is invalid or expired
   */
  static async verifyRefreshToken(refreshToken) {
    const tokenDoc = await RefreshToken.findOne({
      token: refreshToken,
      isRevoked: false,
      expiresAt: { $gt: new Date() },
    });

    if (!tokenDoc) {
      throw new Error('Invalid or expired refresh token');
    }

    return tokenDoc.userId;
  }

  /**
   * Revoke a specific refresh token
   * @param {String} refreshToken - Token to revoke
   * @returns {Promise<Boolean>} True if token was revoked or already revoked
   */
  static async revokeRefreshToken(refreshToken) {
    if (!refreshToken) {
      return false;
    }

    try {
      // First check if token exists
      const tokenExists = await RefreshToken.findOne({ token: refreshToken });

      // If token doesn't exist, return true (consider it "revoked")
      if (!tokenExists) {
        return true;
      }

      // If token exists but is already revoked, return true
      if (tokenExists.isRevoked) {
        return true;
      }

      // Otherwise, revoke the token
      const result = await RefreshToken.updateOne(
        { token: refreshToken },
        { isRevoked: true },
      );

      return true; // Consider operation successful even if no document was modified
    } catch (error) {
      console.error('Error revoking token:', error);
      return false;
    }
  }

  /**
   * Revoke all refresh tokens for a user
   * @param {String} userId - User ID
   * @returns {Promise<Number>} Number of tokens revoked
   */
  static async revokeAllUserTokens(userId) {
    const result = await RefreshToken.updateMany(
      { userId },
      { isRevoked: true },
    );

    return result.modifiedCount;
  }

  /**
   * Set authentication cookies
   * @param {Object} res - Express response object
   * @param {String} accessToken - JWT access token
   * @param {String} refreshToken - Refresh token
   * @param {Date} refreshTokenExpiry - Refresh token expiry date
   * @param {Boolean} rememberMe - Whether to set long-lived cookies
   */
  static setAuthCookies(
    res,
    accessToken,
    refreshToken,
    refreshTokenExpiry,
    rememberMe = false,
  ) {
    // Set HTTP-only cookie for refresh token (long-lived)
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      expires: refreshTokenExpiry,
      path: '/', // Make available on all paths
      signed: true, // Sign the cookie for additional security
    });

    // Set HTTP-only cookie for access token (short-lived)
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: rememberMe ? 7 * 24 * 60 * 60 * 1000 : 60 * 60 * 1000, // 7 days if remember me, else 1 hour
      path: '/', // Make available on all paths
      signed: true, // Sign the cookie for additional security
    });
  }

  /**
   * Clear authentication cookies
   * @param {Object} res - Express response object
   */
  static clearAuthCookies(res) {
    res.clearCookie('refreshToken', {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      signed: true,
    });

    res.clearCookie('accessToken', {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      signed: true,
    });
  }

  /**
   * Create a secure session for user
   * Properly integrates with Passport by calling req.login()
   * This makes req.isAuthenticated() return true for session-based auth
   * @param {Object} req - Express request object
   * @param {Object} user - User object
   * @returns {Promise<Object>} Session creation result
   */
  static async createUserSession(req, user) {
    return new Promise((resolve, reject) => {
      if (!req.session) {
        console.error('[SESSION] Session object not available on request');
        return reject(new Error('Session not available'));
      }

      // First regenerate the session for security (prevents session fixation)
      req.session.regenerate((regenerateErr) => {
        if (regenerateErr) {
          console.error('[SESSION] Failed to regenerate session:', regenerateErr);
          return reject(regenerateErr);
        }

        // Prepare user object for serialization (ensure it's a plain object)
        const userForSession = user.toObject ? user.toObject() : { ...user };

        // Call Passport's req.login() - THIS IS THE KEY FIX
        // This serializes the user into the session and makes isAuthenticated() return true
        if (req.login) {
          req.login(userForSession, (loginErr) => {
            if (loginErr) {
              console.error('[SESSION] Passport req.login() failed:', loginErr);
              return reject(loginErr);
            }

            // Also store custom session properties for additional tracking
            req.session.userId = user._id || user.id;
            req.session.userRole = user.roleId?.name || user.role;
            req.session.email = user.email;
            req.session.lastActivity = new Date();
            req.session.loginTime = new Date();

            // Save the session explicitly to ensure it persists
            req.session.save((saveErr) => {
              if (saveErr) {
                console.error('[SESSION] Failed to save session:', saveErr);
                return reject(saveErr);
              }

              resolve({
                success: true,
                sessionId: req.sessionID,
                message: 'Session created with Passport integration'
              });
            });
          });
        } else {
          // Fallback if req.login is not available (shouldn't happen with proper Passport setup)
          console.warn('[SESSION] ⚠️ req.login not available - falling back to manual session storage');

          req.session.userId = user._id || user.id;
          req.session.userRole = user.roleId?.name || user.role;
          req.session.email = user.email;
          req.session.lastActivity = new Date();
          req.session.loginTime = new Date();

          // Manually set user on request for this request cycle
          req.user = userForSession;

          req.session.save((saveErr) => {
            if (saveErr) {
              console.error('[SESSION] Failed to save session:', saveErr);
              return reject(saveErr);
            }

            resolve({
              success: true,
              sessionId: req.sessionID,
              message: 'Session created without Passport (manual mode)'
            });
          });
        }
      });
    });
  }

  /**
   * Destroy user session
   * @param {Object} req - Express request object
   * @returns {Promise<Object>} Session destruction result
   */
  static async destroyUserSession(req) {
    return new Promise((resolve) => {
      if (!req.session) {
        return resolve({ success: true });
      }

      req.session.destroy((err) => {
        if (err) {
          console.error('Session destruction error:', err);
        }
        resolve({ success: true });
      });
    });
  }

  /**
   * Get token from request (cookie or header)
   * @param {Object} req - Express request object
   * @returns {String|null} Token if found, null otherwise
   */
  static getTokenFromRequest(req) {
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
   * Validate and refresh session user data
   * @param {Object} req - Express request object
   * @returns {Promise<Object|null>} Updated user object or null if invalid
   */
  static async validateSession(req) {
    if (!req.session || !req.session.userId) {
      return null;
    }

    try {
      // Check if session has expired based on last activity
      const sessionTimeout =
        parseInt(process.env.SESSION_TIMEOUT_MINUTES || '30') * 60 * 1000; // 30 minutes default
      const lastActivity = req.session.lastActivity;

      if (
        lastActivity &&
        Date.now() - new Date(lastActivity).getTime() > sessionTimeout
      ) {
        // Session expired, destroy it
        await this.destroyUserSession(req);
        return null;
      }

      // Fetch fresh user data from database
      const user = await User.findById(req.session.userId)
        .populate('roleId')
        .select('-password')
        .lean();

      if (!user || !user.isActive) {
        // User no longer exists or is inactive, destroy session
        await this.destroyUserSession(req);
        return null;
      }

      // Update session with fresh data
      req.session.userRole = user.roleId?.name;
      req.session.email = user.email;
      req.session.lastActivity = new Date();

      return user;
    } catch (error) {
      console.error('Session validation error:', error);
      await this.destroyUserSession(req);
      return null;
    }
  }

  /**
   * Check if session is valid and not expired
   * @param {Object} req - Express request object
   * @returns {Boolean} True if session is valid
   */
  static isSessionValid(req) {
    if (!req.session || !req.session.userId) {
      return false;
    }

    // Check session timeout
    const sessionTimeout =
      parseInt(process.env.SESSION_TIMEOUT_MINUTES || '30') * 60 * 1000;
    const lastActivity = req.session.lastActivity;

    if (
      lastActivity &&
      Date.now() - new Date(lastActivity).getTime() > sessionTimeout
    ) {
      return false;
    }

    return true;
  }

  /**
   * Get session information
   * @param {Object} req - Express request object
   * @returns {Object} Session information
   */
  static getSessionInfo(req) {
    if (!req.session) {
      return { exists: false };
    }

    return {
      exists: true,
      userId: req.session.userId,
      userRole: req.session.userRole,
      email: req.session.email,
      loginTime: req.session.loginTime,
      lastActivity: req.session.lastActivity,
      sessionId: req.sessionID,
      sessionName: process.env.SESSION_NAME || 'pos.sid',
    };
  }

  /**
   * Update session activity timestamp
   * @param {Object} req - Express request object
   */
  static updateActivity(req) {
    if (req.session && req.session.userId) {
      req.session.lastActivity = new Date();
    }
  }

  /**
   * Middleware to automatically validate and refresh sessions
   */
  static sessionValidationMiddleware() {
    return async (req, res, next) => {
      try {
        if (req.session && req.session.userId) {
          const user = await this.validateSession(req);
          if (user) {
            req.user = user;
            req.isAuthenticated = () => true;
          } else {
            req.isAuthenticated = () => false;
          }
        }
        next();
      } catch (error) {
        console.error('Session validation middleware error:', error);
        next();
      }
    };
  }

  /**
   * Clean up expired sessions (utility for periodic cleanup)
   * @param {Object} sessionStore - Session store instance
   * @returns {Promise<Number>} Number of sessions cleaned up
   */
  static async cleanupExpiredSessions(_sessionStore) {
    try {
      return 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Get active sessions for a user (if supported by session store)
   * @param {String} userId - User ID
   * @param {Object} sessionStore - Session store instance
   * @returns {Promise<Array>} Array of active sessions
   */
  static async getUserActiveSessions(_userId, _sessionStore) {
    try {
      return [];
    } catch (error) {
      return [];
    }
  }
}

export default TokenUtils;
