import WidgetSettings from '../models/WidgetSettings.js';
import { RagConfig } from '../config/rag-config.fallback.js';

class WidgetSettingsController {
  static async ensureExists() {
    // Return existing or create from RagConfig defaults
    let doc = await WidgetSettings.findOne();
    if (!doc) {
      doc = await WidgetSettings.create({ ...(RagConfig?.widget || {}) });
    }
    return doc;
  }

  // Public GET for widget
  static async get(req, res) {
    try {
      const doc = await WidgetSettingsController.ensureExists();
      return res.status(200).json({ success: true, data: doc.toObject() });
    } catch (e) {
      return res.status(500).json({ success: false, message: 'Failed to fetch widget settings' });
    }
  }

  // Admin PUT to update
  static async update(req, res) {
    try {
      const doc = await WidgetSettingsController.ensureExists();
      const updates = req.body || {};
      Object.assign(doc, updates);
      await doc.save();
      return res.status(200).json({ success: true, data: doc.toObject() });
    } catch (e) {
      return res.status(500).json({ success: false, message: 'Failed to update widget settings' });
    }
  }
}

export default WidgetSettingsController;


