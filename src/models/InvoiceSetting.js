import mongoose from 'mongoose';

const invoiceSettingSchema = new mongoose.Schema(
  {
    invoicePrefix: {
      type: String,
      required: true,
      trim: true,
      default: 'INV',
    },
    invoiceNumberFormat: {
      type: String,
      required: true,
      trim: true,
      default: 'INV-{YEAR}-{NUMBER}',
    },
    invoiceFooterNotes: {
      type: String,
      default: '',
      trim: true,
    },
    includeTermsAndConditions: {
      type: Boolean,
      default: false,
    },
    orderStart: { type: Number, required: true, min: 0, default: 1 },
    template: {
      type: String,
      enum: ['template1', 'template2', 'template3', 'template4'],
      default: 'template1',
    },
  },
  { timestamps: true },
);

const InvoiceSetting = mongoose.model('InvoiceSetting', invoiceSettingSchema);
export default InvoiceSetting;
