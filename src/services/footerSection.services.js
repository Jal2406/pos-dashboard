import { BaseService } from '../utils/index.js';
import { FooterSection } from '../models/index.js';

class FooterSectionService extends BaseService {
  constructor() {
    super(FooterSection);
  }

  /**
   * Get the current footer section (helper method)
   * @returns {Object} Current footer section
   * @private
   */
  async _getCurrentFooterSection() {
    const existingFooter = await this.model.findOne({});
    if (!existingFooter) {
      throw new Error('Footer section not found');
    }
    return existingFooter;
  }

  /**
   * Create or update footer section (ensures only one exists)
   * @param {Object} data - Footer section data
   * @returns {Object} Created/Updated footer section
   */
  async createOrUpdateFooterSection(data) {
    // Validate required fields
    const requiredFields = ['footer'];
    this.validateRequiredFields(data, requiredFields);

    // Check if footer section already exists
    const existingFooter = await this.model.findOne({});

    if (existingFooter) {
      // Update existing footer section
      const updatedFooter = await this.updateById(existingFooter._id, data);
      return updatedFooter;
    } else {
      // Create new footer section
      const footerSection = await this.create(data);
      console.log('Footer section created successfully', footerSection);
      return footerSection;
    }
  }

  /**
   * Get the current footer section
   * @returns {Object} Current footer section
   */
  async getCurrentFooterSection() {
    const currentFooter = await this.model.findOne({}).lean();
    if (!currentFooter) {
      throw new Error('No footer section found');
    }
    return currentFooter;
  }

  /**
   * Get footer section (since only one exists in DB)
   * @returns {Object} Footer section
   */
  async getFooterSections() {
    // Since only one footer section exists, return it directly
    return await this.getCurrentFooterSection();
  }

  /**
   * Create or update CTA section (singleton: no id required).
   * Creates footer document with CTA if none exists; otherwise updates footer.cta.
   * @param {Object} ctaData - CTA section data { title, subtitle, benefits? }
   * @returns {Object} Created or updated footer section
   */
  async createOrUpdateCTASection(ctaData) {
    this.validateCTASectionData(ctaData);

    const existingFooter = await this.model.findOne({});

    if (existingFooter) {
      const updatedFooter = await this.updateById(existingFooter._id, {
        'footer.cta': ctaData,
      });
      return updatedFooter;
    }

    // No footer document exists: first-time CTA save — create new document with CTA and empty links
    const footerSection = await this.create({
      footer: {
        cta: ctaData,
        links: [],
      },
    });
    return footerSection;
  }

  /**
   * Append a new link to existing footer links
   * @param {String} id - Footer section ID
   * @param {Object} newLink - New link to append
   * @returns {Object} Updated footer section
   */
  async appendFooterLinks(id, newLink) {
    this.validateObjectId(id);

    // Validate new link data
    this.validateFooterLinkData(newLink);

    // Use atomic update with $push to add the new link
    const result = await this.model.findOneAndUpdate(
      { _id: id },
      {
        $push: {
          'footer.links': newLink,
        },
      },
      {
        new: true,
        runValidators: true,
      },
    );

    if (!result) {
      throw new Error('Footer section not found');
    }

    // Check for duplicate titles after the update
    const existingLinks = result.footer?.links || [];
    const existingTitles = existingLinks.map((link) =>
      link.title.toLowerCase().trim(),
    );
    const isDuplicate =
      existingTitles.filter(
        (title) => title === newLink.title.toLowerCase().trim(),
      ).length > 1;

    if (isDuplicate) {
      // Rollback the change if duplicate found
      await this.model.findOneAndUpdate(
        { _id: id },
        { $pull: { 'footer.links': { _id: newLink._id } } },
      );
      throw new Error(
        `Link with title "${newLink.title}" already exists. Links with same titles cannot be added.`,
      );
    }

    // Check total links limit
    if (existingLinks.length > 20) {
      // Rollback the change if limit exceeded
      await this.model.findOneAndUpdate(
        { _id: id },
        { $pull: { 'footer.links': { _id: newLink._id } } },
      );
      throw new Error(
        `Cannot add more links. Maximum limit of 20 links reached. Current: ${
          existingLinks.length - 1
        }`,
      );
    }

    return result;
  }

  /**
   * Remove a specific footer link by its ID
   * @param {String} linkId - Link ID to remove
   * @returns {Object} Updated footer section
   */
  async removeFooterLink(linkId) {
    if (!linkId || typeof linkId !== 'string') {
      throw new Error('Link ID is required and must be a valid string');
    }

    this.validateObjectId(linkId);

    // First check if the link exists and get current count
    const existingFooter = await this._getCurrentFooterSection();
    const existingLinks = existingFooter.footer?.links || [];

    // Check if the provided ID exists in the links
    const linkExists = existingLinks.some(
      (link) => link._id.toString() === linkId,
    );

    if (!linkExists) {
      throw new Error(`Link with ID ${linkId} not found in footer section`);
    }

    // Ensure at least one link remains
    if (existingLinks.length <= 1) {
      throw new Error(
        'Cannot remove all links. At least one link must remain in the footer.',
      );
    }

    // Use atomic update with $pull to remove the link
    const result = await this.model.findOneAndUpdate(
      { _id: existingFooter._id },
      {
        $pull: {
          'footer.links': { _id: linkId },
        },
      },
      {
        new: true,
        runValidators: true,
      },
    );

    return result;
  }

  /**
   * Update a specific footer link by its ID
   * @param {String} linkId - Link ID to update
   * @param {Object} linkData - Updated link data
   * @returns {Object} Updated footer section
   */
  async updateFooterLink(linkId, linkData) {
    // Validate link data
    this.validateFooterLinkData(linkData);

    // Get the footer section (since only one exists)
    const existingFooter = await this._getCurrentFooterSection();
    const existingLinks = existingFooter.footer?.links || [];

    // Find link by ID (handle both _id and tempId cases)
    const linkIndex = existingLinks.findIndex(
      (link) => link._id?.toString() === linkId || link.tempId === linkId,
    );

    if (linkIndex === -1) {
      throw new Error(`Link with ID ${linkId} not found in footer section`);
    }

    // Check for duplicate titles (excluding the current link being updated)
    const otherLinks = existingLinks.filter(
      (link, index) => index !== linkIndex,
    );
    const existingTitles = otherLinks.map((link) =>
      link.title.toLowerCase().trim(),
    );

    if (existingTitles.includes(linkData.title.toLowerCase().trim())) {
      throw new Error(
        `Link title "${linkData.title}" already exists. Link titles must be unique.`,
      );
    }

    // Use atomic update with $set to update the specific link
    const updateFields = {};
    Object.keys(linkData).forEach((key) => {
      updateFields[`footer.links.${linkIndex}.${key}`] = linkData[key];
    });

    const result = await this.model.findOneAndUpdate(
      { _id: existingFooter._id },
      { $set: updateFields },
      {
        new: true,
        runValidators: true,
      },
    );

    return result;
  }

  /**
   * Validate CTA section data
   * @param {Object} ctaData - CTA section data
   * @returns {Boolean} Validation result
   */
  validateCTASectionData(ctaData) {
    if (!ctaData || typeof ctaData !== 'object') {
      throw new Error('CTA data must be a valid object');
    }

    // Validate required fields
    if (!ctaData.title || typeof ctaData.title !== 'string') {
      throw new Error('CTA title is required and must be a string');
    }

    if (!ctaData.subtitle || typeof ctaData.subtitle !== 'string') {
      throw new Error('CTA subtitle is required and must be a string');
    }

    // Validate title length
    if (ctaData.title.trim().length < 3) {
      throw new Error('CTA title must be at least 3 characters long');
    }

    if (ctaData.title.length > 100) {
      throw new Error('CTA title must be less than 100 characters');
    }

    // Validate subtitle length
    if (ctaData.subtitle.trim().length < 10) {
      throw new Error('CTA subtitle must be at least 10 characters long');
    }

    if (ctaData.subtitle.length > 500) {
      throw new Error('CTA subtitle must be less than 500 characters');
    }

    // Validate benefits array if present
    if (ctaData.benefits && Array.isArray(ctaData.benefits)) {
      ctaData.benefits.forEach((benefit, index) => {
        if (!benefit || typeof benefit !== 'string') {
          throw new Error(`Benefit at index ${index} must be a valid string`);
        }

        if (benefit.trim().length < 3) {
          throw new Error(
            `Benefit at index ${index} must be at least 3 characters long`,
          );
        }

        if (benefit.length > 100) {
          throw new Error(
            `Benefit at index ${index} must be less than 100 characters`,
          );
        }
      });
    }

    return true;
  }

  /**
   * Validate footer links data
   * @param {Array} links - Footer links array
   * @returns {Boolean} Validation result
   */
  validateFooterLinkData(link) {
    if (!link || typeof link !== 'object') {
      throw new Error('Link must be a valid object');
    }

    // Validate title
    if (!link.title || typeof link.title !== 'string') {
      throw new Error('Link title is required and must be a string');
    }

    if (link.title.trim().length < 2) {
      throw new Error('Link title must be at least 2 characters long');
    }

    if (link.title.length > 50) {
      throw new Error('Link title must be less than 50 characters');
    }

    // Validate description field
    if (link.description !== undefined) {
      if (typeof link.description !== 'string') {
        throw new Error('Link description must be a string');
      }

      if (link.description.length > 6500) {
        throw new Error('Link description must be less than 6500 characters');
      }
    }

    // Validate status field if present
    if (link.status !== undefined && typeof link.status !== 'boolean') {
      throw new Error('Link status must be a boolean');
    }

    return true;
  }
}

export default FooterSectionService;
