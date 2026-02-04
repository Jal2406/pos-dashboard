/**
 * RAG Configuration Fallback/Defaults
 * 
 * This file contains default/fallback configuration values for the RAG system.
 * These values are used when:
 * - Initializing the system for the first time
 * - Database doesn't have configuration yet
 * - As fallback values in RagService constructor
 * 
 * NOTE: 
 * - API keys should NEVER be hardcoded here. Users input their own API keys
 *   which are encrypted and stored in the database (RagConfig model).
 * - Widget settings are NOT stored here. They are stored in the separate
 *   WidgetSettings model/table. This keeps concerns separated:
 *   - RagConfig = AI configuration (provider, API keys, models)
 *   - WidgetSettings = UI configuration (position, colors, sizes, etc.)
 */
export const RagConfig = {
  "enabled": true,
  "ai": {
    "provider": "gemini",
    "openai": {
      "apiKey": "",
      "embeddingModel": "text-embedding-ada-002",
      "chatModel": "gpt-5-chat-latest"
    },
    "gemini": {
      "apiKey": "",
      "embeddingModel": "text-embedding-004",
      "chatModel": "gemini-2.5-flash"
    }
  },
  // Widget settings are stored in WidgetSettings model, not here
  "widget": {
    // These defaults are only used when creating initial WidgetSettings document
    "position": "left",
    "primaryColor": "#aa7d7d",
    "accentColor": "#000000",
    "launcherShape": "circle",
    "launcherSize": 56,
    "chatWidth": 320,
    "chatHeight": 420,
    "borderRadius": 12,
    "shadow": true,
    "fontFamily": "sans-serif",
    "zIndex": 50,
    "customCss": ""
  }
};
