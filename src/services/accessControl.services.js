import { getTenantModel } from '../config/tenantDbManager.js';
import { AdminAccessControlSchema } from '../models/AdminAccessControl.js';
import { DEFAULT_TAB_PERMISSIONS } from '../config/tabPermissions.defaults.js';

// Valid roles - immutable, cannot be modified
const VALID_ROLES = Object.freeze(['superadmin', 'admin', 'manager', 'cashier']);
const BYPASS_ROLES = Object.freeze(['superadmin', 'admin']);

/**
 * Get AdminAccessControl model for tenant
 * @private
 */
async function getAccessControlModel(businessId) {
  if (!businessId) {
    throw new Error('Business ID is required for tenant operations');
  }
  return getTenantModel(
    businessId,
    'AdminAccessControl',
    AdminAccessControlSchema,
    'adminaccesscontrols',
  );
}

/**
 * Validate that a role exists and is valid
 * Roles are immutable - this only validates against the predefined set
 * @param {string} roleName - Role name to validate
 * @returns {boolean}
 */
function validateRole(roleName) {
  return VALID_ROLES.includes(String(roleName).toLowerCase());
}

/**
 * Normalise a raw tab definition payload into the internal shape
 * @param {Array} tabs
 * @returns {Array}
 */
function normalizeTabs(tabs) {
  if (!Array.isArray(tabs)) return [];

  return tabs
    .filter((t) => t && typeof t.id === 'string' && t.id.trim() !== '')
    .map((t) => {
      const id = String(t.id).trim().toLowerCase();
      const label = t.label ? String(t.label).trim() : undefined;
      const perms = t.permissions || {};

      return {
        id,
        label,
        permissions: {
          create: Boolean(perms.create),
          read: Boolean(perms.read),
          update: Boolean(perms.update),
          delete: Boolean(perms.delete),
        },
      };
    });
}

// ============================================================================
// TAB PERMISSION CRUD OPERATIONS
// ============================================================================

/**
 * Get all role → tab permission documents for a tenant
 * @param {string} businessId - Tenant business ID
 * @returns {Promise<Array>}
 */
async function getAllRoleTabs(businessId) {
  const AdminAccessControl = await getAccessControlModel(businessId);
  return AdminAccessControl.find().sort({ role: 1 }).lean();
}

/**
 * Get tab permissions for a specific role
 * @param {string} businessId - Tenant business ID
 * @param {string} roleName - Role name
 * @returns {Promise<Object|null>}
 */
async function getRoleTabs(businessId, roleName) {
  const role = String(roleName).toLowerCase();

  if (!validateRole(role)) {
    throw new Error(`Invalid role name: ${roleName}`);
  }

  const AdminAccessControl = await getAccessControlModel(businessId);
  return AdminAccessControl.findOne({ role }).lean();
}

/**
 * Upsert tab permissions for a specific role.
 * This replaces the full tab list for that role with the provided one.
 *
 * @param {string} businessId - Tenant business ID
 * @param {string} roleName - Role name
 * @param {Array} tabs - Array of { id, label?, permissions: { create, read, update, delete } }
 * @returns {Promise<Object>} Updated document
 */
async function upsertRoleTabs(businessId, roleName, tabs) {
  const role = String(roleName).toLowerCase();

  if (!validateRole(role)) {
    throw new Error(`Invalid role name: ${roleName}`);
  }

  const normalizedTabs = normalizeTabs(tabs);

  const AdminAccessControl = await getAccessControlModel(businessId);

  const updated = await AdminAccessControl.findOneAndUpdate(
    { role },
    {
      $set: {
        role,
        tabs: normalizedTabs,
      },
    },
    {
      upsert: true,
      new: true,
    },
  ).lean();

  return updated;
}

// ============================================================================
// TAB PERMISSION RESOLUTION - For frontend + optional backend enforcement
// ============================================================================

/**
 * Get effective tab permissions for a user role.
 * This is intended for frontend menu rendering.
 *
 * For bypass roles (superadmin, admin) we mark `isBypassRole=true` and return
 * an empty `tabs` map – the frontend can treat this as "all tabs allowed".
 *
 * For manager/cashier we return a map of tabId -> { create, read, update, delete }.
 *
 * @param {string} businessId - Tenant business ID
 * @param {string} roleName - User's role name
 * @returns {Promise<Object>}
 */
async function getMyTabPermissions(businessId, roleName) {
  const role = String(roleName).toLowerCase();

  if (BYPASS_ROLES.includes(role)) {
    return {
      role,
      isBypassRole: true,
      tabs: {},
    };
  }

  if (!validateRole(role)) {
    throw new Error(`Invalid role name: ${roleName}`);
  }

  const AdminAccessControl = await getAccessControlModel(businessId);
  const record = await AdminAccessControl.findOne({ role }).lean();

  const tabs = {};

  if (record?.tabs && Array.isArray(record.tabs)) {
    for (const tab of record.tabs) {
      if (!tab?.id) continue;
      tabs[tab.id] = {
        create: Boolean(tab.permissions?.create),
        read: Boolean(tab.permissions?.read),
        update: Boolean(tab.permissions?.update),
        delete: Boolean(tab.permissions?.delete),
      };
    }
  }

  return {
    role,
    isBypassRole: false,
    tabs,
  };
}

/**
 * Check whether a role has a given CRUD permission on a tab.
 * This can be used by future route/service guards.
 *
 * @param {string} businessId
 * @param {string} roleName
 * @param {string} tabId
 * @param {'create'|'read'|'update'|'delete'} action
 * @returns {Promise<boolean>}
 */
async function hasTabPermission(businessId, roleName, tabId, action) {
  const role = String(roleName).toLowerCase();

  if (!['create', 'read', 'update', 'delete'].includes(action)) {
    throw new Error(`Invalid tab permission action: ${action}`);
  }

  // Bypass roles always allowed
  if (BYPASS_ROLES.includes(role)) {
    return true;
  }

  if (!validateRole(role)) {
    return false;
  }

  const AdminAccessControl = await getAccessControlModel(businessId);
  const record = await AdminAccessControl.findOne({
    role,
    'tabs.id': String(tabId).trim().toLowerCase(),
  })
    .select({ tabs: 1 })
    .lean();

  if (!record) return false;

  const tab = (record.tabs || []).find(
    (t) => t.id === String(tabId).trim().toLowerCase(),
  );
  if (!tab) return false;

  return Boolean(tab.permissions?.[action]);
}

// ============================================================================
// SYNC DEFAULTS - seed pre-defined tab data into tenant DB
// ============================================================================

/**
 * Sync pre-defined tab permissions into AdminAccessControl for a tenant.
 *
 * Strategy:
 * - For each role in DEFAULT_TAB_PERMISSIONS:
 *   - If forceReset = true: always overwrite with defaults.
 *   - If forceReset = false: only create if the role document does not exist.
 *
 * This is intended to be called from an admin-only endpoint, e.g. when a new
 * business is provisioned or when you want to reset role tab configs to the
 * shipped defaults.
 *
 * @param {string} businessId - Tenant business ID
 * @param {{ forceReset?: boolean }} options
 * @returns {Promise<{ created: number, updated: number, skipped: number }>}
 */
async function syncDefaultTabs(businessId, options = {}) {
  const { forceReset = false } = options;

  const AdminAccessControl = await getAccessControlModel(businessId);
  const result = {
    created: 0,
    updated: 0,
    skipped: 0,
  };

  const roleEntries = Object.entries(DEFAULT_TAB_PERMISSIONS || {});

  for (const [roleName, tabs] of roleEntries) {
    const role = String(roleName).toLowerCase();

    if (!validateRole(role)) {
      // Ignore unknown roles in defaults so config can be extended safely.
      // eslint-disable-next-line no-console
      console.warn('[AccessControl] Ignoring unknown role in defaults', {
        roleName,
      });
      continue;
    }

    const existing = await AdminAccessControl.findOne({ role }).lean();

    if (existing && !forceReset) {
      result.skipped += 1;
      continue;
    }

    const normalizedTabs = normalizeTabs(tabs);

    const updated = await AdminAccessControl.findOneAndUpdate(
      { role },
      {
        $set: {
          role,
          tabs: normalizedTabs,
        },
      },
      {
        upsert: true,
        new: true,
      },
    ).lean();

    if (existing) {
      result.updated += 1;
    } else if (updated) {
      result.created += 1;
    }
  }

  return result;
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  getAllRoleTabs,
  getRoleTabs,
  upsertRoleTabs,
  getMyTabPermissions,
  hasTabPermission,
  syncDefaultTabs,
  validateRole,
  VALID_ROLES,
  BYPASS_ROLES,
};

export default {
  getAllRoleTabs,
  getRoleTabs,
  upsertRoleTabs,
  getMyTabPermissions,
  hasTabPermission,
  syncDefaultTabs,
  validateRole,
  VALID_ROLES,
  BYPASS_ROLES,
};
