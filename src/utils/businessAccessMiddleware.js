import { StatusCodes } from 'http-status-codes';
import { ResponseService } from './index.js';
import { Business, Subscription } from '../models/index.js';

/**
 * Middleware to validate admin subscription and set businessId
 */
export const validateAdminSubscription = async (req, res, next) => {
  try {
    const user = req.user;

    // Check if user is authenticated first
    if (!user) {
      return next(); // Skip validation if no user (let auth middleware handle it)
    }

    // Fast path: if tenant already attached upstream, skip extra work
    if (req.businessId) {
      return next();
    }

    const role = user.roleId?.name || user.role;

    // Superadmin has access to all businesses
    if (role === 'superadmin') {
      // For superadmin, businessId can come from query/body if needed
      const businessId = req.query.business || req.body.business;

      // Validate that the business exists before allowing access
      if (businessId) {
        try {
          const business = await Business.findById(businessId)
            .select('_id')
            .lean();
          if (!business) {
            return ResponseService.send(
              res,
              StatusCodes.NOT_FOUND,
              `Business with id ${businessId} not found`,
            );
          }
          req.businessId = businessId;
        } catch (error) {
          // Handle invalid ObjectId format
          if (error.name === 'CastError' || error.kind === 'ObjectId') {
            return ResponseService.send(
              res,
              StatusCodes.BAD_REQUEST,
              `Invalid business ID format: ${businessId}`,
            );
          }
          throw error;
        }
      }
      return next();
    }

    // For admin users, check if they have an active subscription
    if (role === 'admin') {
      // Run business and subscription checks in parallel with minimal fields
      const [business, activeSubscription] = await Promise.all([
        Business.findOne({ owner: user._id }).select('_id').lean(),
        Subscription.findOne({ user: user._id, status: true })
          .select('_id')
          .lean(),
      ]);

      if (!business) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'No business found for this admin',
        );
      }

      if (!activeSubscription) {
        return ResponseService.send(
          res,
          StatusCodes.FORBIDDEN,
          'Active subscription required',
        );
      }

      req.businessId = business._id;

      return next();
    }

    // For manager and cashier, derive business context
    if (role === 'manager' || role === 'cashier') {
      // 1) Prefer explicit businessId on the user (newly created users)
      if (user.businessId) {
        req.businessId = user.businessId;
        return next();
      }

      // 2) Fallback: resolve business from parent/admin owner for legacy users
      try {
        const ownerId = user.parentId || user._id;
        const business = await Business.findOne({ owner: ownerId })
          .select('_id')
          .lean();

        if (!business) {
          return ResponseService.send(
            res,
            StatusCodes.FORBIDDEN,
            'Access denied: Business context required for this user',
          );
        }

        req.businessId = business._id;
        return next();
      } catch (error) {
        console.error('Business resolution error for manager/cashier:', error);
        return ResponseService.send(
          res,
          StatusCodes.INTERNAL_SERVER_ERROR,
          'Error resolving business context',
        );
      }
    }

    return ResponseService.send(
      res,
      StatusCodes.FORBIDDEN,
      'Access denied: Unsupported role for admin routes',
    );
  } catch (error) {
    console.error('Business validation error:', error);
    return ResponseService.send(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      'Error validating subscription',
    );
  }
};
