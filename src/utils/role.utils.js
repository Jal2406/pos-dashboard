const ROLE_ID_TO_NAME = {
  1: 'superadmin',
  2: 'admin',
  3: 'manager',
  4: 'cashier',
};

const ROLE_NAME_TO_ID = Object.entries(ROLE_ID_TO_NAME).reduce(
  (acc, [id, name]) => {
    acc[name] = Number(id);
    return acc;
  },
  {},
);

/**
 * Resolve the role name for a user document or plain object.
 * Ensures NotificationDispatcher always receives a user.role value.
 * @param {Object} user
 * @returns {string|null}
 */
export const resolveRoleName = (user = {}) => {
  if (!user) {
    return null;
  }

  if (user.role) {
    return user.role;
  }

  const { roleId } = user;

  if (typeof roleId === 'number') {
    return ROLE_ID_TO_NAME[roleId] || null;
  }

  if (roleId && typeof roleId === 'object') {
    if (typeof roleId._id === 'number') {
      return ROLE_ID_TO_NAME[roleId._id] || null;
    }

    if (roleId.name) {
      return roleId.name;
    }
  }

  return null;
};

/**
 * Convert an array of role names to numeric Role IDs.
 * @param {string[]} roleNames
 * @returns {number[]}
 */
export const mapRoleNamesToIds = (roleNames = []) =>
  roleNames
    .map((role) => ROLE_NAME_TO_ID[role])
    .filter((value) => typeof value === 'number');

export const ROLE_MAPPINGS = {
  ROLE_ID_TO_NAME,
  ROLE_NAME_TO_ID,
};

export default {
  resolveRoleName,
  mapRoleNamesToIds,
  ROLE_MAPPINGS,
};
