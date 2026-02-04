import mongoose from 'mongoose';

const widgetSettingsSchema = new mongoose.Schema(
  {
    position: { type: String, enum: ['left', 'right'], default: 'right' },
    primaryColor: { type: String, default: '#000000' },
    accentColor: { type: String, default: '#000000' },
    launcherSize: { type: Number, default: 56 },
    borderRadius: { type: Number, default: 12 },
    chatWidth: { type: Number, default: 320 },
    chatHeight: { type: Number, default: 420 },
    shadow: { type: Boolean, default: true },
    // fontFamily/customCss removed
  },
  { timestamps: true }
);

// Singleton collection - we will use the first document
const WidgetSettings = mongoose.model('WidgetSettings', widgetSettingsSchema);

export default WidgetSettings;


