import mongoose from 'mongoose';

const ragConfigSchema = new mongoose.Schema(
  {
    // Only one config document should exist
    configType: {
      type: String,
      enum: ['main'],
      default: 'main',
      unique: true,
    },
    // AI Configuration only - Widget settings are stored separately in WidgetSettings model
    ai: {
      provider: {
        type: String,
        enum: ['openai', 'gemini'],
        default: 'gemini',
      },
      openai: {
        // Store encrypted API key
        apiKey: {
          type: String,
          default: '',
        },
        embeddingModel: {
          type: String,
          default: 'text-embedding-ada-002',
        },
        chatModel: {
          type: String,
          default: 'gpt-5-chat-latest',
        },
      },
      gemini: {
        // Store encrypted API key
        apiKey: {
          type: String,
          default: '',
        },
        embeddingModel: {
          type: String,
          default: 'text-embedding-004',
        },
        chatModel: {
          type: String,
          default: 'gemini-2.5-flash',
        },
      },
    },
    // NOTE: Widget settings are NOT stored here.
    // Widget settings are stored in the separate WidgetSettings model/table.
    // This keeps concerns separated: RagConfig = AI config, WidgetSettings = UI config
  },
  {
    timestamps: true,
  },
);

// Ensure only one config document exists
ragConfigSchema.statics.getMainConfig = async function () {
  let config = await this.findOne({ configType: 'main' });
  if (!config) {
    config = await this.create({ configType: 'main' });
  }
  return config;
};

export default mongoose.model('RagConfig', ragConfigSchema);

