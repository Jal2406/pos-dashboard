import { StatusCodes } from 'http-status-codes';
import {
  ResponseService,
  TokenUtils,
  PasswordValidator,
} from '../utils/index.js';
import { AuthServices } from '../services/index.js';
import Subscription from '../models/Subscription.js';
import { randomUUID } from 'crypto';

const authServices = new AuthServices();

class AuthController {
  static async Login(req, res) {
    try {
      const { email, password, rememberMe = false } = req.body;
      if (!email || !password) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Email and password are required',
        );
      }

      // Pass request to login for IP and user agent info
      const { user, accessToken, refreshToken, refreshTokenExpiry } =
        await authServices.login(email, password, req);

      // Check if maintenance mode is active and block non-superadmin logins
      const { MiscSettingService } = await import('../services/index.js');
      const miscSettingService = new MiscSettingService();
      const isMaintenanceMode = await miscSettingService.isMaintenanceModeActive();

      if (isMaintenanceMode) {
        const userRole = user.roleId?.name || user.role;
        if (userRole !== 'superadmin') {
          return ResponseService.send(
            res,
            StatusCodes.SERVICE_UNAVAILABLE,
            'System is currently under maintenance. Please try again later.',
          );
        }
      }

      const userResponse = { ...user }; // or ...user.toObject() if not using .lean()

      // Set cookies for authentication with remember me option
      TokenUtils.setAuthCookies(
        res,
        accessToken,
        refreshToken,
        refreshTokenExpiry,
        rememberMe,
      );

      // Create session for the user (await to ensure it's saved before response)
      await TokenUtils.createUserSession(req, user).catch((err) => {
        console.error('[AUTH] Session creation failed during login (non-critical):', err.message);
      });

      // --- RECORD LOGIN HISTORY ---
      try {
        const LoginHistoryServices = (await import('../services/loginHistory.services.js')).default;
        // User businessId availability: 
        // 1. If user has a 'activeBusinessId' or similar field on their profile (often available for multi-tenant users)
        // 2. Or if 'req.businessId' is populated by middleware (might not be for /login if public)
        // 3. Or pass null if it's a platform-level login until they pick a business

        // For now, let's try to get businessId from user.businesses if user is an owner, or just pass user._id as placeholder or null. 
        // Checking your User model, there isn't a direct activeBusinessId, but let's assume if they have one business, we log it.
        // Actually, LoginHistory schema supports purely user-based logs too (businessId is optional ref).

        const ipAddress =
          req.headers['x-forwarded-for']?.split(',')[0] ||
          req.socket.remoteAddress ||
          req.ip;

        const deviceInfo = req.headers['user-agent'] || 'Unknown';
        const sessionId = randomUUID();
        const macAddress = req.body.macAddress || null;

        // Determine businessId context if possible. 
        // Usually, a user logs in to the *platform*, then selects a business. 
        // If your app enforces 1 user = 1 business, we might find it.
        // Let's pass null for businessId if not strictly known at login time, or user.ownerId/businessId if exists.
        // Based on previous files, businessId is often passed in headers/middleware. 
        // If not available, we just log the user event.

        const loginService = new LoginHistoryServices(null);
        // We can pass null as businessId to constructor if we don't have it generally, 
        // but recordLogin might accept it as arg.

        // Check if user object has businessId (some implementations attach it)
        const targetBusinessId = user.businessId || user.activeBusinessId || null;

        await loginService.recordLogin(
          user._id,
          targetBusinessId,
          ipAddress,
          macAddress,
          deviceInfo,
          sessionId
        );
      } catch (logError) {
        console.error('Login History Error:', logError);
      }
      // -----------------------------

      // Also include tokens in response for API clients
      return res.status(200).json({
        token: accessToken,
        user: userResponse,
      });
    } catch (error) {
      const statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
      ResponseService.send(res, statusCode, error.message);
    }
  }
  static async Register(req, res) {
    try {
      if (
        req.files &&
        req.files.profilePicture &&
        req.files.profilePicture.path
      ) {
        req.body.profilePicture = req.files.profilePicture.path;
      }

      // Pass request to register for IP and user agent info
      const { user, accessToken, refreshToken, refreshTokenExpiry } =
        await authServices.register({ ...req.body }, req);

      // Set cookies for authentication
      TokenUtils.setAuthCookies(
        res,
        accessToken,
        refreshToken,
        refreshTokenExpiry,
      );

      // Create session for the user (await to ensure it's saved before response)
      await TokenUtils.createUserSession(req, user).catch((err) => {
        console.error('[AUTH] Session creation failed during registration (non-critical):', err.message);
      });

      // Also include tokens in response for API clients
      const data = {
        user,
        token: accessToken, // Keep for backward compatibility
        accessToken,
        refreshToken,
      };

      ResponseService.send(
        res,
        StatusCodes.OK,
        'User registered successfully',
        data,
      );
    } catch (error) {
      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message,
      );
    }
  }

  static async EditProfile(req, res) {
    try {
      if (req.file && req.file.path) {
        req.body.profilePicture = req.file.path;
      }
      const matched = req.user.id === req.params.id;
      if (!matched) {
        return ResponseService.send(
          res,
          StatusCodes.FORBIDDEN,
          'You are not authorized to edit this profile',
        );
      }
      const updatedUser = await authServices.editProfile(req.user.id, req.body);
      if (updatedUser) {
        ResponseService.send(
          res,
          StatusCodes.OK,
          'Profile updated successfully',
          updatedUser,
        );
      } else {
        ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Something went wrong',
        );
      }
    } catch (error) {
      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message,
      );
    }
  }

  static async ForgotPassword(req, res) {
    try {
      const { email } = req.body;
      const { message } = await authServices.forgotPassword(email);
      if (message) {
        ResponseService.send(res, StatusCodes.OK, message);
      } else {
        ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Something went wrong',
        );
      }
    } catch (error) {
      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message,
      );
    }
  }

  static async VerifyOtp(req, res) {
    try {
      const { otp, email } = req.body;
      const { message } = await authServices.verifyOtp(email, otp);
      if (message) {
        ResponseService.send(res, StatusCodes.OK, message);
      } else {
        ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Something went wrong',
        );
      }
    } catch (error) {
      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message,
      );
    }
  }

  /**
   * Logout user by invalidating token and destroying session
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async Logout(req, res) {
    try {
      // Get refresh token from signed cookie, regular cookie, or request body
      const refreshToken =
        req.signedCookies?.refreshToken ||
        req.cookies?.refreshToken ||
        req.body?.refreshToken;

      // Get access token from cookie or authorization header
      const accessToken = TokenUtils.getTokenFromRequest(req);

      // If we have a refresh token, revoke it
      if (refreshToken) {
        try {
          await authServices.logout(refreshToken);
        } catch (tokenError) {
          // Continue even if token revocation fails
          console.log('Token revocation error:', tokenError.message);
        }
      }

      // Clear auth cookies regardless of whether we had a token
      TokenUtils.clearAuthCookies(res);

      // Destroy session properly
      await TokenUtils.destroyUserSession(req);

      // Clear other cookies if they exist
      res.clearCookie('token');
      res.clearCookie(process.env.SESSION_NAME || 'pos.sid');

      // --- RECORD LOGOUT HISTORY ---

      try {
        let userId = req.user?.id || req.user?._id;

        // If userId not found in req.user (e.g. public logout endpoint), try to extract from token
        if (!userId && accessToken) {
          try {
            // Dynamic import to avoid top-level dependency if not used elsewhere
            const jwt = (await import('jsonwebtoken')).default;
            const decoded = jwt.decode(accessToken);
            if (decoded) {
              // Payload structure is usually { user: { _id: ..., ... }, role: ... }
              userId = decoded.user?._id || decoded.user?.id || decoded.id || decoded._id;
            }
          } catch (e) {
            console.error('Token decode error:', e.message);
          }
        }

        if (userId) {
          const LoginHistoryServices = (await import('../services/loginHistory.services.js')).default;
          const loginService = new LoginHistoryServices(null);
          // Pass a dummy token or session ID if you were tracking strictly by token, 
          // but our service currently finds the "latest open session" for the user.
          await loginService.recordLogout(userId);
        }
      } catch (logError) {
        console.error('Logout History Error:', logError);
      }
      // -----------------------------

      ResponseService.send(res, StatusCodes.OK, 'Logged out successfully');
    } catch (error) {
      // Still return OK status even if there's an error
      // This ensures the frontend can continue with logout flow
      console.error('Logout error:', error.message);
      ResponseService.send(res, StatusCodes.OK, 'Logged out successfully');
    }
  }

  /**
   * Refresh access token using refresh token
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async RefreshToken(req, res) {
    try {
      // Get refresh token from signed cookie, regular cookie, or request body
      const refreshToken =
        req.signedCookies?.refreshToken ||
        req.cookies?.refreshToken ||
        req.body?.refreshToken;

      if (!refreshToken) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'No refresh token provided',
        );
      }

      // Refresh the token
      const { user, accessToken } =
        await authServices.refreshToken(refreshToken);

      // Set new access token cookie with proper security settings
      res.cookie('accessToken', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 60 * 60 * 1000, // 1 hour
        path: '/',
        signed: true,
      });

      // Update session if it exists
      await TokenUtils.createUserSession(req, user).catch((err) => {
        console.error('[AUTH] Session creation failed during token refresh (non-critical):', err.message);
      });

      // Return new access token for API clients
      ResponseService.send(
        res,
        StatusCodes.OK,
        'Token refreshed successfully',
        { user, token: accessToken },
      );
    } catch (error) {
      // Clear cookies on error
      TokenUtils.clearAuthCookies(res);
      ResponseService.send(res, StatusCodes.UNAUTHORIZED, error.message);
    }
  }

  /**
   * Logout user from all devices by revoking all refresh tokens
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async LogoutAllDevices(req, res) {
    try {
      // Get user ID from authenticated user
      const userId = req.user?.id || req.user?._id;

      if (!userId) {
        return ResponseService.send(
          res,
          StatusCodes.UNAUTHORIZED,
          'Authentication required',
        );
      }

      // Revoke all refresh tokens for this user
      const result = await authServices.logoutAllDevices(userId);

      // Clear auth cookies for current device
      TokenUtils.clearAuthCookies(res);

      // Clear session if it exists
      if (req.session) {
        req.session.destroy();
      }

      // Clear other cookies if they exist
      res.clearCookie('token');
      res.clearCookie(process.env.SESSION_NAME || 'pos.sid');

      ResponseService.send(
        res,
        StatusCodes.OK,
        'Logged out from all devices successfully',
        { revokedTokensCount: result.revokedTokensCount },
      );
    } catch (error) {
      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message,
      );
    }
  }

  /**
   * Reset password using OTP verification
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async ResetPassword(req, res) {
    try {
      const { email, otp, newPassword, confirmPassword } = req.body;

      // Basic validation
      if (!email || !otp || !newPassword || !confirmPassword) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Email, OTP, new password and confirm password are required',
        );
      }

      // Check if passwords match
      const passwordsMatchResult = PasswordValidator.passwordsMatch(
        newPassword,
        confirmPassword,
      );
      if (!passwordsMatchResult.isValid) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          passwordsMatchResult.message,
        );
      }

      // Validate password strength with enterprise-grade rules
      const passwordValidationResult = PasswordValidator.validate(newPassword, {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true,
        disallowCommonPasswords: true,
      });

      if (!passwordValidationResult.isValid) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          passwordValidationResult.message,
        );
      }

      // Reset password
      const result = await authServices.resetPassword({
        email,
        otp,
        newPassword,
      });

      ResponseService.send(res, StatusCodes.OK, result.message);
    } catch (error) {
      ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  /**
   * Change password for authenticated user
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async ChangePassword(req, res) {
    try {
      // Get user ID from authenticated user
      const userId = req.user?.id || req.user?._id;

      if (!userId) {
        return ResponseService.send(
          res,
          StatusCodes.UNAUTHORIZED,
          'Authentication required',
        );
      }

      const { currentPassword, newPassword, confirmPassword } = req.body;

      // Basic validation
      if (!currentPassword || !newPassword || !confirmPassword) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Current password, new password and confirm password are required',
        );
      }

      // Prevent using the same password
      if (currentPassword === newPassword) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'New password must be different from current password',
        );
      }

      // Check if passwords match
      const passwordsMatchResult = PasswordValidator.passwordsMatch(
        newPassword,
        confirmPassword,
      );
      if (!passwordsMatchResult.isValid) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          passwordsMatchResult.message,
        );
      }

      // Validate password strength with enterprise-grade rules
      const passwordValidationResult = PasswordValidator.validate(newPassword, {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true,
        disallowCommonPasswords: true,
      });

      if (!passwordValidationResult.isValid) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          passwordValidationResult.message,
        );
      }

      // Change password
      const result = await authServices.changePassword(userId, {
        currentPassword,
        newPassword,
      });

      // Clear auth cookies and session
      TokenUtils.clearAuthCookies(res);

      if (req.session) {
        req.session.destroy();
      }

      ResponseService.send(res, StatusCodes.OK, result.message);
    } catch (error) {
      ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  /**
   * Get current authenticated user
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async GetCurrentUser(req, res) {
    try {
      if (!req.user) {
        return ResponseService.send(
          res,
          StatusCodes.UNAUTHORIZED,
          'Not authenticated',
        );
      }

      // Return user data without sensitive information
      const userData = req.user.toObject ? req.user.toObject() : req.user;

      // Remove sensitive fields
      if (userData.password) {
        delete userData.password;
      }

      ResponseService.send(
        res,
        StatusCodes.OK,
        'User data retrieved successfully',
        { user: userData },
      );
    } catch (error) {
      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message,
      );
    }
  }

  /**
   * Check session status
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async SessionStatus(req, res) {
    try {
      // Check if user is authenticated via session
      const isAuthenticated = req.isAuthenticated && req.isAuthenticated();

      // Check if we have a valid token in cookies
      const hasToken = !!TokenUtils.getTokenFromRequest(req);

      ResponseService.send(res, StatusCodes.OK, 'Session status retrieved', {
        authenticated: isAuthenticated || hasToken,
        sessionActive: isAuthenticated,
        tokenActive: hasToken,
      });
    } catch (error) {
      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message,
      );
    }
  }

  /**
   * Google OAuth callback handler
   * Uses AuthServices to issue tokens, set cookies, and redirect
   */
  static async GoogleOAuthCallback(req, res) {
    try {
      if (!req.user) {
        const redirectUrl =
          process.env.GOOGLE_FAILURE_REDIRECT ||
          'http://localhost:3000/auth/failure';
        return res.redirect(`${redirectUrl}`);
      }

      const { user, accessToken, refreshToken, refreshTokenExpiry } =
        await authServices.handleOAuthLogin(req.user, req);

      const userResponse = { ...user }; // or ...user.toObject() if not using .lean()

      // Only for admin (not superadmin)
      if (
        (user.roleId && user.roleId._id === 2) ||
        (user.roleId && user.roleId.name === 'admin') ||
        user.role === 'admin'
      ) {
        // Find active subscription and populate plan
        const activeSubscription = await Subscription.findOne({
          user: user._id,
          status: true, // Boolean true for active
        }).populate('planName'); // Make sure your Subscription model has a 'plan' ref

        if (activeSubscription) {
          userResponse.isSubscription = true;
          userResponse.planName = activeSubscription.planName; // Only plan data, not full subscription
        } else {
          userResponse.isSubscription = false;
        }
      }

      // Set cookies for authentication
      TokenUtils.setAuthCookies(
        res,
        accessToken,
        refreshToken,
        refreshTokenExpiry,
        true,
      );

      // Create session for the user (await to ensure it's saved before response/redirect)
      await TokenUtils.createUserSession(req, user).catch((err) => {
        console.error('[AUTH] Session creation failed during OAuth login (non-critical):', err.message);
      });

      // Check if this is an API request (has Accept: application/json header)
      const isApiRequest =
        req.headers.accept && req.headers.accept.includes('application/json');

      if (isApiRequest) {
        // Return JSON response for API clients
        return res.status(200).json({
          token: accessToken,
          user: userResponse,
        });
      } else {
        // Redirect for web clients
        const redirectUrl =
          process.env.GOOGLE_SUCCESS_REDIRECT ||
          'http://localhost:3000/auth/success';
        return res.redirect(`${redirectUrl}`);
      }
    } catch (error) {
      // Check if this is an API request
      const isApiRequest =
        req.headers.accept && req.headers.accept.includes('application/json');

      if (isApiRequest) {
        const statusCode =
          error.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;
        return ResponseService.send(res, statusCode, error.message);
      } else {
        const redirectUrl =
          process.env.GOOGLE_FAILURE_REDIRECT ||
          'http://localhost:3000/auth/failure';
        return res.redirect(`${redirectUrl}`);
      }
    }
  }
}

export default AuthController;
