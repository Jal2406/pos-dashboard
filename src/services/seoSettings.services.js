import { SeoSettings } from '../models/index.js';
import { deleteImage, BaseService } from '../utils/index.js';

class SeoSettingsService extends BaseService {
  constructor() {
    super(SeoSettings);
  }

  /**
   * Create or update SEO settings
   * @param {Object} data - SEO settings data
   * @returns {Object} Created/updated SEO settings
   */
  async createOrUpdateSettings(data) {
    try {
      // Validate required fields
      const requiredFields = [
        'seoSlug',
        'metaTitle',
        'metaDescription',
        'metaKeywords',
        'canonicalUrl',
      ];
      this.validateRequiredFields(data, requiredFields);

      // Check if settings already exist
      const existingSettings = await this.model.findOne({});

      if (existingSettings) {
        // Delete old images from Cloudinary before updating
        if (existingSettings.seoImage?.url) {
          await deleteImage(
            existingSettings.seoImage.url,
            'seoSettings/images',
          );
        }

        // Update existing settings with proper nested object handling
        const updatedSettings = await this.model.findByIdAndUpdate(
          existingSettings._id,
          { $set: data },
          { new: true, runValidators: true },
        );
        return updatedSettings;
      } else {
        // Create new settings
        const settings = await this.create(data);
        return settings;
      }
    } catch (error) {
      throw new Error(`Error creating/updating SEO settings: ${error.message}`);
    }
  }

  /**
   * Update SEO settings with image handling
   * @param {Object} data - Update data
   * @param {Object} files - Uploaded files
   * @returns {Object} Updated SEO settings
   */
  async updateSeoSettings(data, files = {}) {
    try {
      // Find existing settings (since we have single database schema)
      const existingSettings = await this.model.findOne({});
      if (!existingSettings) {
        throw new Error('SEO settings not found');
      }

      // Handle image updates
      const updateData = { ...data };

      // Handle SEO image update
      if (files.seoImage) {
        // Delete old SEO image if it exists
        if (existingSettings.seoImage?.url) {
          await deleteImage(
            existingSettings.seoImage.url,
            'seoSettings/images',
          );
        }
        updateData['seoImage.url'] = files.seoImage.secure_url;
        updateData['seoImage.publicId'] = files.seoImage.public_id;
      }

      // Update the SEO settings
      const updatedSettings = await this.model.findByIdAndUpdate(
        existingSettings._id,
        { $set: updateData },
        { new: true, runValidators: true },
      );
      return updatedSettings;
    } catch (error) {
      throw new Error(`Error updating SEO settings: ${error.message}`);
    }
  }

  /**
   * Get SEO settings with pagination and search
   * @param {Object} queryParams - Query parameters
   * @returns {Object} Paginated SEO settings
   */
  async getSeoSettings(queryParams = {}) {
    try {
      const searchFields = [
        'seoSlug',
        'metaTitle',
        'metaDescription',
        'metaKeywords',
        'canonicalUrl',
      ];
      return await this.list({
        ...queryParams,
        searchFields,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });
    } catch (error) {
      throw new Error(`Error getting SEO settings: ${error.message}`);
    }
  }

  /**
   * Validate SEO settings data
   * @param {Object} data - SEO settings data
   * @returns {Boolean} Validation result
   */
  validateSeoSettingsData(data) {
    try {
      if (!data || typeof data !== 'object') {
        throw new Error('Data must be a valid object');
      }

      // Validate SEO slug
      if (data.seoSlug) {
        const slugRegex = /^[a-z0-9\-]+$/;
        if (!slugRegex.test(data.seoSlug)) {
          throw new Error(
            'SEO slug can only contain lowercase letters, numbers, and hyphens',
          );
        }
        if (data.seoSlug.length < 2 || data.seoSlug.length > 100) {
          throw new Error('SEO slug must be between 2 and 100 characters');
        }
      }

      // Validate meta title
      if (data.metaTitle) {
        if (data.metaTitle.length < 10 || data.metaTitle.length > 60) {
          throw new Error('Meta title must be between 10 and 60 characters');
        }
      }

      // Validate meta description
      if (data.metaDescription) {
        if (
          data.metaDescription.length < 50 ||
          data.metaDescription.length > 160
        ) {
          throw new Error(
            'Meta description must be between 50 and 160 characters',
          );
        }
      }

      // Validate meta keywords
      if (data.metaKeywords) {
        if (Array.isArray(data.metaKeywords)) {
          if (data.metaKeywords.length < 1 || data.metaKeywords.length > 10) {
            throw new Error('Meta keywords must contain 1-10 keywords');
          }
        } else {
          throw new Error('Meta keywords must be an array');
        }
      }

      // Validate canonical URL
      if (data.canonicalUrl) {
        const urlRegex = /^https?:\/\/.+/;
        if (!urlRegex.test(data.canonicalUrl)) {
          throw new Error(
            'Canonical URL must be a valid URL starting with http:// or https://',
          );
        }
      }

      // Validate Google site verification
      if (data.googleSiteVerification) {
        const verificationRegex = /^[a-zA-Z0-9\-_]+$/;
        if (!verificationRegex.test(data.googleSiteVerification)) {
          throw new Error(
            'Google site verification code can only contain letters, numbers, hyphens, and underscores',
          );
        }
      }

      // Validate SEO image
      if (data.seoImage && data.seoImage.url) {
        const imageRegex = /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|svg)$/i;
        if (!imageRegex.test(data.seoImage.url)) {
          throw new Error('SEO image URL must be a valid image URL');
        }
      }

      return true;
    } catch (error) {
      throw new Error(`Validation failed: ${error.message}`);
    }
  }

  /**
   * Delete SEO image
   * @returns {Object} Deletion result
   */
  async deleteSeoImage() {
    try {
      const settings = await this.model.findOne({});
      if (!settings) {
        throw new Error('No SEO settings found');
      }

      // Delete from Cloudinary if image exists
      if (settings.seoImage && settings.seoImage.url) {
        await deleteImage(settings.seoImage.url, 'seoSettings/images');
      }

      // Clear the SEO image from database
      const updateData = {
        'seoImage.url': '',
        'seoImage.publicId': '',
        'seoImage.alt': '',
      };

      const updatedSettings = await this.model.findByIdAndUpdate(
        settings._id,
        { $set: updateData },
        { new: true, runValidators: true },
      );

      return {
        result: 'success',
        message: 'SEO image deleted successfully',
        settings: updatedSettings,
      };
    } catch (error) {
      throw new Error(`Error deleting SEO image: ${error.message}`);
    }
  }
}

export default SeoSettingsService;
