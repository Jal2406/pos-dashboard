import {
  BaseService,
  EmailService,
  PasswordUtils,
  TokenUtils,
  deleteImage,
  TransactionUtils,
} from '../utils/index.js';
import { User, Role, Business, Subscription } from '../models/index.js';

import { SubscriptionService } from './index.js';

class AuthServices extends BaseService {
  constructor() {
    super(User);
    // Store OTPs per user to prevent overlapping
    this.otpStore = new Map();
  }

  // ---------- Internal helpers (centralized to remove redundancy) ----------
  getRoleName(roleId) {
    const roleMap = { 1: 'superadmin', 2: 'admin', 3: 'manager', 4: 'cashier' };
    return roleMap[roleId] || 'manager';
  }

  _sanitizeUser(userLike) {
    const obj = userLike?.toObject?.() || { ...userLike };
    if (obj && obj.password) delete obj.password;
    return obj;
  }

  _buildTokenPayload(userLike) {
    // Works with lean objects or documents
    const user = userLike?.toObject?.() ?? userLike;
    const numericRoleId =
      typeof user.roleId === 'number'
        ? user.roleId
        : (user.roleId?._id ?? user.roleId);
    const roleName = this.getRoleName(numericRoleId);

    return [
      {
        parentId: user.parentId ?? null,
        _id: user._id,
        name: user.name,
        email: user.email,
        gender: user.gender,
        phone: user.phone,
        roleId: { _id: numericRoleId, __v: 0, name: roleName },
        isActive: user.isActive,
        profilePicture: user.profilePicture,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        __v: user.__v || 0,
        lastLoginAt: user.lastLoginAt,
        emailVerified: user.emailVerified,
        provider: user.provider,
        role: roleName,
        isAdmin: numericRoleId === 1 || numericRoleId === 2,
        id: user._id,
      },
      roleName,
    ];
  }

  async _issueTokens(userLike, req) {
    const [payload, roleName] = this._buildTokenPayload(userLike);
    const accessToken = TokenUtils.generateAccessToken(payload, roleName);
    const refreshTokenData = TokenUtils.generateRefreshToken(payload._id, req);
    return { accessToken, refreshTokenData };
  }

  // Method to check subscription status for any user
  async checkSubscriptionStatus(userId) {
    try {
      const activeSubscription = await Subscription.findOne({
        user: userId,
        status: true,
      }).populate('planName');

      if (!activeSubscription) {
        return {
          isActive: false,
          message: 'No active subscription found',
        };
      }

      const duration = activeSubscription.planName.duration;
      const planType = activeSubscription.planName.type;
      const subscriptionDetails =
        await SubscriptionService.calculateSubscriptionDetails(
          activeSubscription.purchaseDate,
          duration,
          planType,
        );

      if (subscriptionDetails.isExpired) {
        // Update subscription status to expired
        await Subscription.findByIdAndUpdate(activeSubscription._id, {
          status: false,
        });
        return {
          isActive: false,
          message: 'Subscription has expired',
          expiredAt: subscriptionDetails.expiryDate,
        };
      }

      return {
        isActive: true,
        subscription: {
          id: activeSubscription._id,
          planName: activeSubscription.planName.name,
          purchaseDate: activeSubscription.purchaseDate,
          expiryDate: subscriptionDetails.expiryDate,
          duration: duration,
          remainingDays: subscriptionDetails.remainingDays,
          amount: activeSubscription.amount,
          totalAmount: activeSubscription.totalAmount,
        },
      };
    } catch (error) {
      throw new Error(`Error checking subscription status: ${error.message}`);
    }
  }

  // Method to get subscription expiry information for dashboard
  async getSubscriptionExpiryInfo(userId) {
    try {
      const activeSubscription = await Subscription.findOne({
        user: userId,
        status: true,
      }).populate('planName');

      if (!activeSubscription) {
        return {
          hasActiveSubscription: false,
          message: 'No active subscription',
        };
      }

      const duration = activeSubscription.planName.duration;
      const planType = activeSubscription.planName.type;
      const subscriptionDetails =
        await SubscriptionService.calculateSubscriptionDetails(
          activeSubscription.purchaseDate,
          duration,
          planType,
        );

      if (subscriptionDetails.isExpired) {
        // Update subscription status to expired
        await Subscription.findByIdAndUpdate(activeSubscription._id, {
          status: false,
        });
        return {
          hasActiveSubscription: false,
          message: 'Subscription expired',
          expiredAt: subscriptionDetails.expiryDate,
        };
      }

      // Calculate percentage of subscription used
      const totalDurationMs =
        subscriptionDetails.expiryDate -
        new Date(activeSubscription.purchaseDate);
      const usedDurationMs =
        Date.now() - new Date(activeSubscription.purchaseDate).getTime();
      const usagePercentage = Math.min(
        (usedDurationMs / totalDurationMs) * 100,
        100,
      );

      return {
        hasActiveSubscription: true,
        subscription: {
          planName: activeSubscription.planName.name,
          purchaseDate: activeSubscription.purchaseDate,
          expiryDate: subscriptionDetails.expiryDate,
          duration: duration,
          remainingDays: subscriptionDetails.remainingDays,
          usagePercentage: Math.round(usagePercentage * 100) / 100, // Round to 2 decimal places
          isExpiringSoon: subscriptionDetails.remainingDays <= 7, // Flag if expiring within 7 days
        },
      };
    } catch (error) {
      throw new Error(
        `Error getting subscription expiry info: ${error.message}`,
      );
    }
  }

  async register(data, req) {
    try {
      const {
        name,
        email,
        password,
        phone,
        roleName,
        roleId,
        profilePicture,
        businessName,
        businessCategory,
      } = data;

      if (!email) {
        throw new Error('Email is required.');
      }

      // Parallel validation and role resolution
      const [existing, role] = await Promise.all([
        this.model.findOne({ email }).select('_id'),
        this.resolveRole(roleId, roleName),
      ]);

      if (existing) {
        throw new Error('User with this email already exists.');
      }

      // Hash password in parallel with other operations
      const hashedPassword = await PasswordUtils.hashPassword(password);

      const userData = {
        name,
        email,
        password: hashedPassword,
        phone,
        roleId: role,
        profilePicture,
      };

      // Use TransactionUtils for atomic user and business creation
      const result = await TransactionUtils.executeTransaction(
        async (session) => {
          const createdUser = await this.create(userData, {
            session,
            allowUnauthenticatedCreate: true, // Public registration has no request context
          });

          const business = await Business.create(
            [
              {
                businessName,
                businessCategoryId: businessCategory,
                owner: createdUser._id,
              },
            ],
            { session },
          );

          return { createdUser, business: business[0] };
        },
        TransactionUtils.getRetryConfig('default'),
      );

      const { createdUser } = result;

      // Load fresh user (with role) and issue tokens
      const user = await this.getByIdQuery(createdUser._id).populate('roleId');
      const { accessToken, refreshTokenData } = await this._issueTokens(
        user,
        req,
      );

      // Create user session alongside JWT for immediate session access
      if (req) {
        await TokenUtils.createUserSession(req, user).catch((err) =>
          console.error('Session creation failed during registration (non-critical):', err),
        );
      }

      // Remove password from user object
      const userObj = user.toObject();
      delete userObj.password;

      return {
        user: userObj,
        accessToken,
        refreshToken: refreshTokenData.token,
        refreshTokenExpiry: refreshTokenData.expiresAt,
      };
    } catch (error) {
      console.log(error);
      throw new Error(error.message);
    }
  }

  // Helper method to resolve role ID
  async resolveRole(roleId, roleName) {
    if (roleId) {
      return typeof roleId === 'string' ? Number.parseInt(roleId, 10) : roleId;
    } else if (roleName) {
      const role = await Role.findOne({ name: roleName }).select('_id');
      if (!role) {
        throw new Error('Invalid role name');
      }
      return role._id;
    }
    return 2; // Default role
  }

  async login(email, password, req) {
    try {
      // Ultra-fast query with minimal fields and lean()
      const user = await this.model
        .findOne({ email })
        .select(
          '_id name email password roleId isActive profilePicture gender phone createdAt updatedAt lastLoginAt emailVerified provider parentId',
        )
        .lean(); // Use lean() for maximum speed

      if (!user) {
        const error = new Error('User not found');
        error.statusCode = 404;
        throw error;
      }

      const isMatch = await PasswordUtils.comparePassword(
        password,
        user.password,
      );
      if (!isMatch) {
        const error = new Error('Invalid password');
        error.statusCode = 401;
        throw error;
      }

      // Build token payload and issue tokens via shared helper
      const [tokenUserPayload, roleName] = this._buildTokenPayload(user);
      const accessToken = TokenUtils.generateAccessToken(
        tokenUserPayload,
        roleName,
      );
      // Only fetch subscription for actual admin users (roleId === 2)
      const isAdmin = tokenUserPayload.isAdmin && user.roleId === 2;
      const subscriptionPromise = isAdmin
        ? this.getUserSubscriptionData(user._id).catch((err) => {
          console.error('Subscription fetch error:', err);
          return null;
        })
        : Promise.resolve(null);

      const [{ refreshTokenData }, subscriptionData] = await Promise.all([
        this._issueTokens(user, req),
        subscriptionPromise,
      ]);

      // Build minimal user response
      const userResponse = { ...tokenUserPayload, isSubscription: false };

      // Apply subscription data if present (admin-only fetch handled above)
      if (subscriptionData) {
        userResponse.isSubscription = Boolean(
          subscriptionData.isSubscription ??
          (subscriptionData.planName && subscriptionData.subscriptionDetails),
        );
        if (subscriptionData.planName) {
          // Ensure planName is only the string name, not the full object
          userResponse.planName =
            typeof subscriptionData.planName === 'string'
              ? subscriptionData.planName
              : subscriptionData.planName?.name || null;
        }
        if (subscriptionData.subscriptionDetails) {
          userResponse.subscriptionDetails =
            subscriptionData.subscriptionDetails;
        }
      }

      // Background operations (non-blocking)
      setImmediate(() => {
        // Update login time only (refresh token is handled by TokenUtils)
        this.model
          .findByIdAndUpdate(user._id, { lastLoginAt: new Date() })
          .catch((err) => console.error('Login time update error:', err));
      });

      // Create user session alongside JWT
      // This enables session-based features while maintaining stateless JWT auth
      if (req) {
        await TokenUtils.createUserSession(req, user).catch((err) =>
          console.error('Session creation failed (non-critical):', err),
        );
      }

      return {
        user: userResponse,
        accessToken,
        refreshToken: refreshTokenData.token,
        refreshTokenExpiry: refreshTokenData.expiresAt,
      };
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }

  // Ultra-optimized subscription data fetching
  async getUserSubscriptionData(userId) {
    try {
      // Single optimized query with aggregation for maximum speed
      const result = await Subscription.aggregate([
        {
          $match: { user: userId },
        },
        {
          $lookup: {
            from: 'plans',
            localField: 'planName',
            foreignField: '_id',
            as: 'planName',
            pipeline: [{ $project: { name: 1, duration: 1, type: 1 } }],
          },
        },
        {
          $unwind: { path: '$planName', preserveNullAndEmptyArrays: true },
        },
        {
          $sort: {
            status: -1, // Active subscriptions first
            purchaseDate: -1,
          },
        },
        {
          $limit: 1,
        },
      ]);

      if (!result || result.length === 0) {
        return { isSubscription: false };
      }

      const subscription = result[0];

      // Quick expiry check
      const now = new Date();
      const purchaseDate = new Date(subscription.purchaseDate);
      const duration = subscription.planName?.duration;
      const planType = subscription.planName?.type;

      let expiryDate = new Date(purchaseDate);
      if (planType === 'yearly') {
        expiryDate.setFullYear(expiryDate.getFullYear() + duration);
      } else if (planType === 'monthly') {
        expiryDate.setMonth(expiryDate.getMonth() + duration);
      } else if (planType === 'daily') {
        expiryDate.setDate(expiryDate.getDate() + duration);
      } else if (planType === 'weekly') {
        expiryDate.setDate(expiryDate.getDate() + duration * 7);
      }

      const isExpired = now > expiryDate;
      const isActive = subscription.status === true && !isExpired;

      // Update subscription status asynchronously if needed
      if (isExpired && subscription.status === true) {
        setImmediate(() => {
          Subscription.findByIdAndUpdate(subscription._id, {
            status: false,
          }).catch((err) =>
            console.error('Failed to update expired subscription:', err),
          );
        });
      } else if (!isExpired && subscription.status !== true) {
        setImmediate(() => {
          Subscription.findByIdAndUpdate(subscription._id, {
            status: true,
          }).catch(() => { });
        });
      }

      if (!isActive) {
        return { isSubscription: false };
      }

      // Calculate remaining time
      const remainingMs = expiryDate.getTime() - now.getTime();
      const remainingDays = Math.floor(remainingMs / (1000 * 60 * 60 * 24));

      return {
        isSubscription: true,
        planName: subscription?.planName?.name || null,
        subscriptionDetails: {
          purchaseDate: subscription.purchaseDate,
          expiryDate: expiryDate,
          duration: duration,
          remaining: {
            days: remainingDays,
            hours: Math.floor(
              (remainingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
            ),
            minutes: Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60)),
          },
        },
      };
    } catch (error) {
      console.error('Error fetching subscription data:', error);
      return { isSubscription: false };
    }
  }

  async editProfile(userId, data) {
    try {
      const user = await this.getById(userId);
      const verifiedEmail = await this.model.findOne({ email: data.email });
      if (verifiedEmail && verifiedEmail._id.toString() !== userId.toString()) {
        throw new Error('Email already exists');
      }
      if (!user) {
        throw new Error('User not found');
      }
      if (data.profilePicture && data.profilePicture !== user.profilePicture) {
        await deleteImage(user.profilePicture, 'profileImages');
        user.profilePicture = data.profilePicture;
      }
      // Update user fields
      Object.assign(user, data);
      const updatedUser = await this.updateById(user._id, user);
      const result = await this.getByIdQuery(updatedUser._id).populate(
        'roleId',
      );
      return result;
    } catch (error) {
      throw new Error(error.message);
    }
  }

  async forgotPassword(email) {
    try {
      const user = await this.model.findOne({ email });
      if (!user) {
        throw new Error('User not found');
      }

      // Check if mail settings are verified before proceeding
      const isMailConfigured = await EmailService.isMailConfigured();
      if (!isMailConfigured) {
        throw new Error(
          'Email service is not configured or verified. Please contact administrator.',
        );
      }

      // Generate unique OTP for this specific user
      const otp = Math.floor(100000 + Math.random() * 900000);
      const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Store OTP with user's email as key
      this.otpStore.set(email, {
        otp: otp.toString(),
        expiresAt: otpExpiresAt,
        userId: user._id,
      });

      const emailHtml = EmailService.otptamplate(user.name, user.email, otp);
      await EmailService.sendEmail(
        user.email,
        'Forgot Password OTP ✔',
        emailHtml,
      );

      return {
        message: 'OTP sent to your email',
        otp,
        otpExpiresAt,
      };
    } catch (error) {
      throw new Error(error.message);
    }
  }

  async verifyOtp(email, otp) {
    try {
      const storedOtpData = this.otpStore.get(email);

      if (!storedOtpData) {
        throw new Error('OTP not found or expired');
      }

      // Check if OTP has expired
      if (new Date() > storedOtpData.expiresAt) {
        // Remove expired OTP
        this.otpStore.delete(email);
        throw new Error('OTP has expired');
      }

      // Verify OTP
      if (storedOtpData.otp === otp.toString()) {
        // For password reset, we keep the OTP data for the reset password step
        // It will be removed after password reset is completed
        return {
          message: 'OTP verified successfully',
          userId: storedOtpData.userId,
          verified: true,
        };
      } else {
        throw new Error('Invalid OTP');
      }
    } catch (error) {
      throw new Error(error.message);
    }
  }

  // Cleanup expired OTPs periodically (optional)
  cleanupExpiredOtps() {
    const now = new Date();
    for (const [email, otpData] of this.otpStore.entries()) {
      if (now > otpData.expiresAt) {
        this.otpStore.delete(email);
      }
    }
  }

  /**
   * Refresh access token using refresh token
   * @param {String} refreshToken - Refresh token
   * @returns {Promise<Object>} New access token and user data
   */
  /**
   * Refresh access token using refresh token
   * @param {String} refreshToken - Refresh token
   * @param {Object} req - Express request object (optional)
   * @returns {Promise<Object>} New access token and user data
   */
  async refreshToken(refreshToken, req = null) {
    try {
      // Verify refresh token and get user ID
      const userId = await TokenUtils.verifyRefreshToken(refreshToken);

      // Get user data
      const user = await this.getByIdQuery(userId).populate('roleId');
      if (!user) {
        throw new Error('User not found');
      }

      // Generate new access token
      const accessToken = TokenUtils.generateAccessToken(
        user,
        user.roleId?.name,
      );

      // // Update session if request object is provided
      if (req?.session) {
        // If using Passport's login function and user is not already logged in
        if (req.login && (!req.isAuthenticated || !req.isAuthenticated?.())) {
          await new Promise((resolve, reject) => {
            req.login(user, (err) => {
              if (err) {
                return reject(err);
              }
              resolve();
            });
          });
        }
      }

      return { user, accessToken };
    } catch (error) {
      throw new Error(`Token refresh failed: ${error.message}`);
    }
  }

  /**
   * Logout user from all devices
   * @param {String} userId - User ID
   * @returns {Promise<Object>} Success message and count of revoked tokens
   */
  async logoutAllDevices(userId) {
    try {
      const count = await TokenUtils.revokeAllUserTokens(userId);
      return {
        success: true,
        message: 'Logged out from all devices successfully',
        revokedTokensCount: count,
      };
    } catch (error) {
      throw new Error(`Logout from all devices failed: ${error.message}`);
    }
  }

  /**
   * Reset password using OTP verification
   * @param {Object} data - Contains email, otp, and new password
   * @returns {Promise<Object>} Success message
   */
  async resetPassword(data) {
    try {
      const { email, otp, newPassword } = data;

      // Verify OTP is valid and not expired
      const storedOtpData = this.otpStore.get(email);

      if (!storedOtpData) {
        throw new Error(
          'Password reset session expired or invalid. Please request a new OTP.',
        );
      }

      // Check if OTP has expired
      if (new Date() > storedOtpData.expiresAt) {
        // Remove expired OTP
        this.otpStore.delete(email);
        throw new Error(
          'Password reset session expired. Please request a new OTP.',
        );
      }

      // Verify OTP
      if (storedOtpData.otp !== otp.toString()) {
        throw new Error('Invalid OTP. Please try again.');
      }

      // Get user directly from model to use save() method
      const user = await this.model.findById(storedOtpData.userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Hash new password
      const hashedPassword = await PasswordUtils.hashPassword(newPassword);

      // Update password directly
      user.password = hashedPassword;

      // Save user with save() method to ensure proper handling of password field
      await user.save();

      // Remove OTP after successful password reset
      this.otpStore.delete(email);

      // Revoke all refresh tokens for this user for security
      await TokenUtils.revokeAllUserTokens(user._id);

      return {
        success: true,
        message: 'Password reset successfully',
      };
    } catch (error) {
      throw new Error(error.message);
    }
  }

  /**
   * Change password for authenticated user
   * @param {string} userId - User ID
   * @param {Object} data - Contains current password and new password
   * @returns {Promise<Object>} Success message
   */
  async changePassword(userId, data) {
    try {
      const { currentPassword, newPassword } = data;

      if (currentPassword === newPassword) {
        throw new Error('New password must be different from current password');
      }

      // Get user with password
      const user = await this.model.findById(userId).select('+password');
      if (!user) {
        throw new Error('User not found');
      }

      // Verify current password
      const isMatch = await PasswordUtils.comparePassword(
        currentPassword,
        user.password,
      );
      if (!isMatch) {
        throw new Error('Current password is incorrect');
      }

      // Hash new password
      const hashedPassword = await PasswordUtils.hashPassword(newPassword);

      // Update password
      user.password = hashedPassword;

      // Save user with save() method to ensure proper handling of password field
      await user.save();

      // Revoke all refresh tokens for this user for security
      await TokenUtils.revokeAllUserTokens(user._id);

      return {
        success: true,
        message: 'Password changed successfully',
      };
    } catch (error) {
      throw new Error(error.message);
    }
  }

  /**
   * Handle OAuth login token issuance and session creation
   * @param {Object} oauthUser - User document (populated with roleId)
   * @param {Object} req - Express request object
   * @returns {Promise<Object>} user, accessToken, refreshToken, refreshTokenExpiry
   */
  async handleOAuthLogin(oauthUser, req) {
    try {
      // Ensure user is loaded and populated
      let user = oauthUser;
      if (!user.roleId?.name) {
        user = await this.model.findById(oauthUser._id).populate('roleId');
      }

      if (!user) {
        throw new Error('User not found');
      }

      // Update last login timestamp
      user.lastLoginAt = new Date();
      await user.save();

      const { accessToken, refreshTokenData } = await this._issueTokens(
        user,
        req,
      );
      const userObj = this._sanitizeUser(user);

      return {
        user: userObj,
        accessToken,
        refreshToken: refreshTokenData.token,
        refreshTokenExpiry: refreshTokenData.expiresAt,
      };
    } catch (error) {
      throw new Error(error.message);
    }
  }

  /**
   * Logout user - invalidate token by adding to blacklist
   * @param {string} token - JWT token to invalidate
   * @returns {Promise<Object>} Success message
   */
  /**
   * Logout user - invalidate token and handle session logout
   * @param {string} refreshToken - JWT refresh token to invalidate
   * @param {Object} req - Express request object (optional)
   * @returns {Promise<Object>} Success message
   */
  async logout(refreshToken, req = null) {
    try {
      // Track results for comprehensive logging
      const results = {
        tokenRevoked: false,
        sessionDestroyed: false,
      };

      // Revoke refresh token if provided
      if (refreshToken) {
        try {
          results.tokenRevoked =
            await TokenUtils.revokeRefreshToken(refreshToken);
        } catch (tokenError) {
          console.error(`Logout token revocation error: ${tokenError.message}`);
        }
      }

      // Handle session logout if request object is provided
      if (req?.logout) {
        try {
          // Modern Passport requires callback
          await new Promise((resolve) => {
            req.logout(function (err) {
              if (err) {
                console.error('Session logout error:', err);
              }
              resolve();
            });
          });
          results.sessionDestroyed = true;
        } catch (sessionError) {
          console.error(`Session logout error: ${sessionError.message}`);
        }
      }

      return {
        success: true,
        message: 'Logged out successfully',
        results,
      };
    } catch (error) {
      // Log error but don't throw it - allow logout to succeed
      console.error(`Logout error: ${error.message}`);
      return { success: true, message: 'Logged out successfully' };
    }
  }
}

export default AuthServices;
