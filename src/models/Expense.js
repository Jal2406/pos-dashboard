import mongoose from 'mongoose';

const expenseSchema = new mongoose.Schema(
  {
    expenseDate: {
      type: Date,
      required: [true, 'Expense date is required'],
      index: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ExpenseCategory',
      required: [true, 'Category is required'],
      index: true,
    },
    store: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Store',
      required: [true, 'Store is required'],
      index: true,
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      minlength: [5, 'Description must be at least 5 characters'],
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0.01, 'Amount must be greater than 0'],
      index: true,
    },
    paymentMethod: {
      type: String,
      required: [true, 'Payment method is required'],
      enum: [
        'Cash',
        'Credit Card',
        'Debit Card',
        'Bank Transfer',
        'Check',
        'Digital Wallet',
        'Other',
        'Cheque',
      ],
      index: true,
    },
    reference: {
      type: String,
      trim: true,
      maxlength: [100, 'Reference cannot exceed 100 characters'],
      index: true,
    },
    status: {
      type: String,
      enum: ['approved', 'pending', 'rejected'],
      default: 'pending',
      required: true,
    },
    // Payment Details - Bank Transfer
    bankName: {
      type: String,
      trim: true,
    },
    branchName: {
      type: String,
      trim: true,
    },
    accountNumber: {
      type: String,
      trim: true,
    },
    ifscCode: {
      type: String,
      trim: true,
    },
    // Payment Details - Cheque
    chequeNumber: {
      type: String,
      trim: true,
    },
    // Payment Details - Card (Credit/Debit)
    cardNumber: {
      type: String,
      trim: true,
    },
    cardHolderName: {
      type: String,
      trim: true,
    },
    cardType: {
      type: String,
      trim: true,
    },
    expiryMonth: {
      type: String,
      trim: true,
    },
    expiryYear: {
      type: String,
      trim: true,
    },
    // Additional fields for better tracking
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    rejectionReason: {
      type: String,
      trim: true,
      maxlength: [500, 'Rejection reason cannot exceed 500 characters'],
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for performance
expenseSchema.index({ category: 1, expenseDate: -1 }); // for category-based reports
expenseSchema.index({ createdBy: 1, expenseDate: -1 }); // for user-specific expenses

// Virtual for formatted amount
expenseSchema.virtual('formattedAmount').get(function () {
  return this.amount ? this.amount.toFixed(2) : '0.00';
});

// Virtual for expense status color (for UI purposes)
expenseSchema.virtual('statusColor').get(function () {
  switch (this.status) {
    case 'approved':
      return 'green';
    case 'pending':
      return 'orange';
    case 'rejected':
      return 'red';
    default:
      return 'gray';
  }
});

// Ensure virtuals are included when converting to JSON/Object
expenseSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    return ret;
  },
});

expenseSchema.set('toObject', {
  virtuals: true,
  transform(doc, ret) {
    return ret;
  },
});

// Pre-save middleware to set approvedAt when status changes to 'Approved'
expenseSchema.pre('save', function (next) {
  if (
    this.isModified('status') &&
    this.status === 'approved' &&
    !this.approvedAt
  ) {
    this.approvedAt = new Date();
  }
  next();
});

export { expenseSchema as ExpenseSchema };
