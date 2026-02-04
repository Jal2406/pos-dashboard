import { BaseService } from '../utils/index.js';
import { PricingSection } from '../models/index.js';

class PricingSectionService extends BaseService {
  constructor() {
    super(PricingSection);
  }

  /**
   * Create a new Pricing section (replace old one)
   * @param {Object} data
   */
  async createPricingSection(data) {
    try {
      const requiredFields = ['sectionTitle', 'sectionSubtitle'];
      this.validateRequiredFields(data, requiredFields);

      // single-record -> delete old
      await this.model.deleteMany({});
      const created = await this.create(data);
      return created;
    } catch (error) {
      throw new Error(`Error creating pricing section: ${error.message}`);
    }
  }

  /**
   * Get current pricing section
   */
  async getCurrentPricingSection() {
    try {
      const section = await this.model.findOne({});
      if (!section) {
        throw new Error('No pricing section found');
      }
      return section;
    } catch (error) {
      throw new Error(
        `Error getting current pricing section: ${error.message}`,
      );
    }
  }

  /**
   * Update pricing section
   */
  async updatePricingSection(id, data) {
    try {
      this.validateObjectId(id);
      const existing = await this.getById(id);
      if (!existing) {
        throw new Error('Pricing section not found');
      }

      const updated = await this.updateById(id, data);
      return updated;
    } catch (error) {
      throw new Error(`Error updating pricing section: ${error.message}`);
    }
  }

  /**
   * Get all pricing sections with pagination/search
   */
  async getPricingSections(queryParams = {}) {
    try {
      const searchFields = ['sectionTitle', 'sectionSubtitle'];
      return await this.list({
        ...queryParams,
        searchFields,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });
    } catch (error) {
      throw new Error(`Error getting pricing sections: ${error.message}`);
    }
  }

  /**
   * Get stats
   */
  async getPricingSectionStats() {
    try {
      const total = await this.count();
      const exists = total > 0;
      return { total, exists, lastUpdated: new Date() };
    } catch (error) {
      throw new Error(`Error getting pricing section stats: ${error.message}`);
    }
  }

  /**
   * Preview without saving
   */
  async previewPricingSection(data) {
    try {
      const requiredFields = ['sectionTitle', 'sectionSubtitle'];
      this.validateRequiredFields(data, requiredFields);

      return { ...data, preview: true, previewGeneratedAt: new Date() };
    } catch (error) {
      throw new Error(`Error previewing pricing section: ${error.message}`);
    }
  }
}

export default PricingSectionService;
