import mongoose from 'mongoose';

const roleSchema = new mongoose.Schema({
  _id: Number,
  name: {
    type: String,
    enum: ['superadmin', 'admin', 'manager', 'cashier'],
    required: true,
    unique: true,
  },
});

const Role = mongoose.model('Role', roleSchema);
export default Role;
