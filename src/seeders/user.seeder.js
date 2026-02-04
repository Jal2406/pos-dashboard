import { Role, User } from '../models/index.js';
import PasswordUtils from '../utils/passwordUtils.js';

export const seedDemoUsers = async function seedDemoUsers() {
  try {
    const roles = await Role.find({}).lean();
    if (!roles || roles.length === 0) {
      // Roles should be seeded first; nothing to do if absent
      return;
    }

    // Map role name to a readable display name
    const displayNameByRole = {
      superadmin: 'superadmin',
      admin: 'admin',
      manager: 'manager',
      cashier: 'cashier',
    };

    for (const role of roles) {
      const existingForRole = await User.exists({ roleId: role._id });
      if (existingForRole) {
        continue;
      }

      const roleName = role.name;
      const name = displayNameByRole[roleName] || `Demo ${roleName}`;
      const email = `${roleName}@admin.com`;
      const phone = '9999999999';
      const plainPassword = '12345678';
      const hashedPassword = await PasswordUtils.hashPassword(plainPassword);

      await User.create({
        name,
        email,
        password: hashedPassword,
        phone,
        roleId: role._id,
        isActive: role._id === 1 ? true : false,
      });
    }
  } catch (error) {
    console.error('Error seeding demo users:', error);
  }
};
