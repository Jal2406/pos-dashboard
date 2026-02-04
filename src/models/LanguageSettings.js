import mongoose from 'mongoose';

const LanguageSettingsSchema = new mongoose.Schema(
  {
    // Language Selection
    selectedLanguage: {
      type: String,
      required: [true, 'Selected language is required'],
      trim: true,
      enum: {
        values: ['ar', 'en', 'es', 'fr', 'de'],
        message: 'Selected language must be one of: ar, en, es, fr, de',
      },
    },

    // File Selection for Translation
    selectedFile: {
      type: String,
      required: [true, 'Selected file is required'],
      trim: true,
      enum: {
        values: ['auth', 'backup', 'constant', 'currency'],
        message:
          'Selected file must be one of: auth, backup, constant, currency',
      },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Indexes for better performance
LanguageSettingsSchema.index({ selectedLanguage: 1, selectedFile: 1 });

const LanguageSettings = mongoose.model(
  'LanguageSettings',
  LanguageSettingsSchema,
);

export default LanguageSettings;
