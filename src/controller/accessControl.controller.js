/**
 * Access Control Controller (tab-based)
 *
 * This controller now exposes a much simpler API focused on sidebar tabs:
 * - Each role (manager/cashier) has a list of tabs with CRUD booleans.
 * - Admin and superadmin are treated as bypass roles (full access).
 *
 * Responsibilities:
 * - Request validation
 * - Service delegation
 * - Structured error handling
 * - No business logic
 */

import { ResponseService } from '../utils/index.js';
import AccessControlService from '../services/accessControl.services.js';

const ADMIN_ROLES = new Set(['admin', 'superadmin']);

/**
 * Get business ID from request
 * @private
 */
function getBusinessId(req) {
  return req.user?.businessId || req.businessId;
}

/**
 * Get normalized role name from request user (e.g. 'admin', 'manager')
 * @private
 */
function getUserRole(req) {
  const role =
    req.user?.roleId?.name ||
    req.user?.role ||
    (typeof req.user?.roleId === 'number'
      ? { 1: 'superadmin', 2: 'admin', 3: 'manager', 4: 'cashier' }[
      req.user.roleId
      ]
      : null);

  return role ? String(role).toLowerCase() : null;
}

/**
 * Get all role → tab permission definitions for the tenant.
 * GET /access-control
 */
async function getAllPermissions(req, res) {
  try {
    const role = getUserRole(req);
    if (!ADMIN_ROLES.has(role)) {
      return ResponseService.send(
        res,
        403,
        'Access denied: only admin can view all role permissions',
      );
    }

    const businessId = getBusinessId(req);
    if (!businessId) {
      return ResponseService.send(res, 400, 'Business ID is required');
    }

    const result = await AccessControlService.getAllRoleTabs(businessId);

    return ResponseService.send(
      res,
      200,
      'Role tab permissions retrieved successfully',
      result,
    );
  } catch (error) {
    console.error('[AccessControl] Get all failed:', error);
    return ResponseService.send(
      res,
      500,
      error.message || 'Failed to retrieve role tab permissions',
    );
  }
}

/**
 * Sync default tab permissions into AdminAccessControl for this tenant.
 * POST /access-control/sync
 *
 * Body (optional):
 * {
 *   "forceReset": false // if true, overwrite existing role configs
 * }
 */
async function syncDefaultTabs(req, res) {
  try {
    const role = getUserRole(req);
    if (!ADMIN_ROLES.has(role)) {
      return ResponseService.send(
        res,
        403,
        'Access denied: only admin can sync default permissions',
      );
    }

    const businessId = getBusinessId(req);
    if (!businessId) {
      return ResponseService.send(res, 400, 'Business ID is required');
    }

    const { forceReset = false } = req.body || {};

    const result = await AccessControlService.syncDefaultTabs(businessId, {
      forceReset: Boolean(forceReset),
    });

    return ResponseService.send(
      res,
      200,
      'Default tab permissions synchronized successfully',
      result,
    );
  } catch (error) {
    console.error('[AccessControl] Sync default tabs failed:', error);
    return ResponseService.send(
      res,
      500,
      error.message || 'Failed to sync default tab permissions',
    );
  }
}

/**
 * Get tab permissions for a specific role.
 * GET /access-control/role/:roleName
 */
async function getRolePermissions(req, res) {
  try {
    const currentRole = getUserRole(req);
    if (!ADMIN_ROLES.has(currentRole)) {
      return ResponseService.send(
        res,
        403,
        'Access denied: only admin can view role permissions',
      );
    }

    const businessId = getBusinessId(req);
    if (!businessId) {
      return ResponseService.send(res, 400, 'Business ID is required');
    }

    const { roleName } = req.params;
    if (!roleName) {
      return ResponseService.send(res, 400, 'Role name is required');
    }

    const result = await AccessControlService.getRoleTabs(businessId, roleName);

    if (!result) {
      return ResponseService.send(
        res,
        404,
        `No tab configuration found for role: ${roleName}`,
      );
    }

    return ResponseService.send(
      res,
      200,
      'Role tab permissions retrieved successfully',
      result,
    );
  } catch (error) {
    console.error('[AccessControl] Get role permissions failed:', error);
    return ResponseService.send(
      res,
      500,
      error.message || 'Failed to retrieve role tab permissions',
    );
  }
}

/**
 * Upsert tab permissions for a specific role.
 * PUT /access-control/role/:roleName
 *
 * Body:
 * {
 *   "tabs": [
 *     {
 *       "id": "inventory.products",
 *       "label": "Products",
 *       "permissions": { "create": true, "read": true, "update": true, "delete": false }
 *     },
 *     ...
 *   ]
 * }
 */
async function updateRolePermissions(req, res) {
  try {
    const role = getUserRole(req);
    if (!ADMIN_ROLES.has(role)) {
      return ResponseService.send(
        res,
        403,
        'Access denied: only admin can update role permissions',
      );
    }
    const businessId = getBusinessId(req);
    if (!businessId) {
      return ResponseService.send(res, 400, 'Business ID is required');
    }

    const { roleName } = req.params;
    if (!roleName) {
      return ResponseService.send(res, 400, 'Role name is required');
    }

    let { tabs } = req.body || {};

    // Support legacy/alternative payload key "pages"
    if (!tabs && req.body.pages) {
      tabs = req.body.pages;
    }

    if (!Array.isArray(tabs)) {
      return ResponseService.send(
        res,
        400,
        'tabs (or pages) must be an array of tab definitions',
      );
    }

    const result = await AccessControlService.upsertRoleTabs(
      businessId,
      roleName,
      tabs,
    );

    return ResponseService.send(
      res,
      200,
      'Role tab permissions updated successfully',
      result,
    );
  } catch (error) {
    console.error('[AccessControl] Update role permissions failed:', error);
    return ResponseService.send(
      res,
      500,
      error.message || 'Failed to update role tab permissions',
    );
  }
}

/**
 * Get effective tab permissions for the authenticated user.
 * This is what the frontend should call after login to build the sidebar.
 *
 * GET /access-control/me
 */
async function getMyPermissions(req, res) {
  try {
    const businessId = getBusinessId(req);
    if (!businessId) {
      return ResponseService.send(res, 400, 'Business ID is required');
    }

    const roleName = req.user?.roleId?.name || req.user?.role;
    if (!roleName) {
      return ResponseService.send(res, 400, 'User role not found');
    }

    const result = await AccessControlService.getMyTabPermissions(
      businessId,
      roleName,
    );

    return ResponseService.send(
      res,
      200,
      'Tab permissions retrieved successfully',
      result,
    );
  } catch (error) {
    console.error('[AccessControl] Get my permissions failed:', error);
    return ResponseService.send(
      res,
      500,
      error.message || 'Failed to retrieve tab permissions',
    );
  }
}

export { getAllPermissions, getRolePermissions, updateRolePermissions, getMyPermissions, syncDefaultTabs };

export default {
  getAllPermissions,
  getRolePermissions,
  updateRolePermissions,
  getMyPermissions,
  syncDefaultTabs,
};
