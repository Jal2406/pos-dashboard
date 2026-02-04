import { Role } from '../models/index.js';

export const seedRoles = async function seedRoles() {
  const count = await Role.countDocuments();
  if (count > 0) {
    return;
  }
  const roles = [
    { _id: 1, name: 'superadmin' },
    { _id: 2, name: 'admin' },
    { _id: 3, name: 'manager' },
    { _id: 4, name: 'cashier' },
  ];

  for (const role of roles) {
    await Role.updateOne({ _id: role._id }, role, { upsert: true });
  }
};
