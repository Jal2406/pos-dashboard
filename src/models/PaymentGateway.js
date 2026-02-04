import mongoose from 'mongoose';

const paymentGatewaySchema = new mongoose.Schema(
  {
    tanentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
      default: null,
    },
    provider: {
      type: String,
      enum: [
        'razorpay',
        'paypal',
        'cinet',
        'sadad',
        'airtelMoney',
        'phonePe',
        'midtrans',
        'paystack',
        'flutterwave',
        'stripe'
      ],
      required: true,
    },
    enabled: {
      type: Boolean,
      default: false,
    },
    credentials: {
      type: Map, // flexible key-value store for encrypted credentials
      of: String,
      required: true,
    },
    publicCredentials: {
      type: Map, // store public keys separately for payment operations
      of: String,
      default: new Map(),
    },
  },
  { timestamps: true },
);

export default mongoose.model('PaymentGateway', paymentGatewaySchema);
