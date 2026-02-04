import { BaseService, deleteImage } from '../utils/index.js';
import { HeroSection } from '../models/index.js';

class HeroSectionService extends BaseService {
  constructor() {
    super(HeroSection);
  }

  /**
   * Create a new hero section
   * @param {Object} data - Hero section data
   * @returns {Object} Created hero section
   */
  async createHeroSection(data) {
    try {
      // Validate required fields
      const requiredFields = ['title1', 'title2'];
      this.validateRequiredFields(data, requiredFields);

      // Ensure heroImage provided (can be image or video path)
      if (!data.heroImage) {
        throw new Error('heroImage is required');
      }

      // Delete any existing media from Cloudinary before clearing records
      const existing = await this.model.find({});
      if (existing && existing.length) {
        for (const doc of existing) {
          if (doc.heroImage) {
            try {
              await deleteImage(doc.heroImage, 'heroImages', 'image');
            } catch (_) {
              await deleteImage(doc.heroImage, 'heroImages', 'video');
            }
          }
        }
        await this.model.deleteMany({});
      }

      // Create new hero section
      const heroSection = await this.create(data);
      return heroSection;
    } catch (error) {
      throw new Error(`Error creating hero section: ${error.message}`);
    }
  }

  /**
   * Get the current hero section
   * @returns {Object} Current hero section
   */
  async getCurrentHeroSection() {
    try {
      const currentHero = await this.model.findOne({});
      if (!currentHero) {
        throw new Error('No hero section found');
      }
      return currentHero;
    } catch (error) {
      throw new Error(`Error getting current hero section: ${error.message}`);
    }
  }

  /**
   * Create or update hero section (ensures only one exists)
   * @param {Object} data - Hero section data
   * @param {Object} files - Uploaded files
   * @returns {Object} Created/Updated hero section
   */
  async createOrUpdateHeroSection(data, files = {}) {
    try {
      const existing = await this.model.findOne({});

      if (existing) {
        return await this.updateHeroSection(existing._id, data, files);
      } else {
        // Prepare data for create
        const createData = { ...data };
        if (files.heroImage && files.heroImage[0]) {
          createData.heroImage = files.heroImage[0].path;
        }
        return await this.createHeroSection(createData);
      }
    } catch (error) {
      throw new Error(`Error saving hero section: ${error.message}`);
    }
  }

  /**
   * Update hero section with image handling
   * @param {String} id - Hero section ID
   * @param {Object} data - Update data
   * @param {Object} files - Uploaded files
   * @returns {Object} Updated hero section
   */
  async updateHeroSection(id, data, files = {}) {
    try {
      this.validateObjectId(id);

      const existingHero = await this.getById(id);
      if (!existingHero) {
        throw new Error('Hero section not found');
      }

      // Handle media update: single heroImage path (image or video)
      const updateData = { ...data };

      if (files.heroImage) {
        const newPath = files.heroImage[0].path;
        if (existingHero.heroImage) {
          try {
            await deleteImage(existingHero.heroImage, 'heroImages', 'image');
          } catch (_) {
            await deleteImage(existingHero.heroImage, 'heroImages', 'video');
          }
        }
        updateData.heroImage = newPath;
      }

      // If heroImage is provided in body and changed, delete previous media
      if (
        !files.heroImage &&
        typeof data.heroImage === 'string' &&
        data.heroImage.trim()
      ) {
        const incoming = data.heroImage.trim();
        if (existingHero.heroImage && existingHero.heroImage !== incoming) {
          try {
            await deleteImage(existingHero.heroImage, 'heroImages', 'image');
          } catch (_) {
            await deleteImage(existingHero.heroImage, 'heroImages', 'video');
          }
          updateData.heroImage = incoming;
        }
      }

      // Update the hero section
      const updatedHero = await this.updateById(id, updateData);
      return updatedHero;
    } catch (error) {
      throw new Error(`Error updating hero section: ${error.message}`);
    }
  }

  /**
   * Get hero section with pagination and search
   * @param {Object} queryParams - Query parameters
   * @returns {Object} Paginated hero sections
   */
  async getHeroSections(queryParams = {}) {
    try {
      const searchFields = ['title1', 'title2', 'subtitle'];
      return await this.list({
        ...queryParams,
        searchFields,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });
    } catch (error) {
      throw new Error(`Error getting hero sections: ${error.message}`);
    }
  }

  /**
   * Get hero section statistics
   * @returns {Object} Hero section statistics
   */
  async getHeroSectionStats() {
    try {
      const total = await this.count();
      const exists = total > 0;

      return {
        total,
        exists,
        lastUpdated: new Date(),
      };
    } catch (error) {
      throw new Error(
        `Error getting hero section statistics: ${error.message}`,
      );
    }
  }

  /**
   * Preview hero section changes without saving
   * @param {Object} data - Hero section data
   * @returns {Object} Preview data
   */
  async previewHeroSection(data) {
    try {
      // Validate the data structure
      const requiredFields = ['title1', 'title2'];
      this.validateRequiredFields(data, requiredFields);

      // Ensure heroImage present for preview
      if (!data.heroImage) {
        throw new Error('heroImage is required');
      }

      // Return preview data
      return {
        ...data,
        preview: true,
        previewGeneratedAt: new Date(),
      };
    } catch (error) {
      throw new Error(`Error previewing hero section: ${error.message}`);
    }
  }

  /**
   * Validate hero section data
   * @param {Object} data - Hero section data
   * @returns {Boolean} Validation result
   */
  validateHeroSectionData(data) {
    try {
      if (!data || typeof data !== 'object') {
        throw new Error('Data must be a valid object');
      }

      // Validate title1/title2 word count similar to schema (<=3 words)
      if (data.title1) {
        const words = data.title1.trim().split(/\s+/);
        if (words.length > 3) {
          throw new Error('title1 cannot exceed 3 words');
        }
      }
      if (data.title2) {
        const words = data.title2.trim().split(/\s+/);
        if (words.length > 3) {
          throw new Error('title2 cannot exceed 3 words');
        }
      }

      // Validate subtitle length
      if (data.subtitle && data.subtitle.length > 300) {
        throw new Error('Subtitle must be less than 300 characters');
      }

      return true;
    } catch (error) {
      throw new Error(`Validation failed: ${error.message}`);
    }
  }
}

export default HeroSectionService;
