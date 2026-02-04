import mongoose from 'mongoose';

const transactionLogSchema = new mongoose.Schema(
  {
    entityId: {
      type: String,
      required: true,
      trim: true,
    },
    entityType: {
      type: String,
      required: true,
      enum: ['payment', 'subscription', 'webhook', 'coupon_usage', 'user'],
    },
    action: {
      type: String,
      required: true,
      enum: [
        'order_created',
        'payment_finalized',
        'activated',
        'activated_via_webhook',
        'webhook_processed',
        'pending_created',
        'webhook_payment_failed',
        'webhook_already_captured',
        'webhook_orphan_payment_captured',
        'webhook_orphan_payment_failed',
        'webhook_unhandled_event',
        'activation_noop_already_active',
        'order_reused',
        'coupon_applied',
        'coupon_consumed',
        'coupon_released',
        'coupon_cancelled',
        'trial_created',
        'invoice_generated',
        'invoice_generation_failed',
        'deactivated',
        'created_active',
        'activation_failed',
      ],
    },
    details: {
      type: Object,
      default: {},
    },
    correlationId: {
      type: String,
      default: null,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { versionKey: false },
);

transactionLogSchema.index({ entityId: 1, entityType: 1, action: 1 });

const TransactionLog = mongoose.model('TransactionLog', transactionLogSchema);
export default TransactionLog;
