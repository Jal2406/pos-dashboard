import mongoose from 'mongoose';

export const payrollSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: [true, 'Employee reference is required'],
    },
    baseSalary: {
      type: Number,
      required: [true, 'Base salary is required'],
      min: [0, 'Base salary cannot be negative'],
    },
    deduction: {
      type: Number,
      default: 0,
      min: [0, 'Deduction cannot be negative'],
    },
    totalSalary: {
      type: Number,
      required: true,
      min: [0, 'Total salary cannot be negative'],
    },
    month: {
      type: Number,
      required: [true, 'Payroll month is required'],
      min: [1, 'Month must be between 1 and 12'],
      max: [12, 'Month must be between 1 and 12'],
    },
    year: {
      type: Number,
      required: [true, 'Payroll year is required'],
      min: [2000, 'Year must be 2000 or later'],
      max: [2100, 'Year must be 2100 or earlier'],
    },
  },
  { timestamps: true },
);

// Calculate total salary before saving
payrollSchema.pre('save', function (next) {
  this.totalSalary = this.baseSalary - this.deduction;
  next();
});

// Prevent duplicate payroll entry for the same employee, month & year
payrollSchema.index({ employee: 1, month: 1, year: 1 }, { unique: true });


