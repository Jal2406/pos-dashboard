import { BaseService } from '../utils/index.js';
import { SocialMediaLinks } from '../models/index.js';

class SocialMediaLinksService extends BaseService {
    constructor() {
        super(SocialMediaLinks);
    }

    /**
     * Create or update social media links (singleton pattern)
     * @param {Object} data - Social media links data
     * @returns {Object} Created or updated social media links
     */
    async createOrUpdateSocialMediaLinks(data) {
        try {
            // Validate data
            this.validateSocialMediaLinksData(data);

            // Check if document already exists
            const existing = await this.model.findOne({});

            if (existing) {
                // Update existing document
                Object.assign(existing, data);

                // Sanitize URLs before saving
                existing.sanitizeUrls();

                await existing.save();
                return existing;
            } else {
                // Create new document
                const socialMediaLinks = new this.model(data);

                // Sanitize URLs before saving
                socialMediaLinks.sanitizeUrls();

                await socialMediaLinks.save();
                return socialMediaLinks;
            }
        } catch (error) {
            throw new Error(`Error creating/updating social media links: ${error.message}`);
        }
    }

    /**
     * Get the current social media links
     * @returns {Object} Current social media links
     */
    async getCurrentSocialMediaLinks() {
        try {
            const currentLinks = await this.model.findOne({});
            if (!currentLinks) {
                throw new Error('No social media links found');
            }
            return currentLinks;
        } catch (error) {
            throw new Error(`Error getting current social media links: ${error.message}`);
        }
    }

    /**
     * Get social media links (returns single document, no pagination needed)
     * @returns {Object} Social media links
     */
    async getSocialMediaLinks() {
        try {
            const links = await this.model.findOne({});
            if (!links) {
                // Return empty structure if not found
                return {
                    InstagramLink: '',
                    FacebookLink: '',
                    TwitterLink: '',
                    LinkedInLink: '',
                    YoutubeLink: '',
                };
            }
            return links;
        } catch (error) {
            throw new Error(`Error getting social media links: ${error.message}`);
        }
    }

    /**
     * Get or create social media links (ensures document exists)
     * @returns {Object} Social media links
     */
    async getOrCreateSocialMediaLinks() {
        try {
            return await this.model.getOrCreate();
        } catch (error) {
            throw new Error(`Error getting or creating social media links: ${error.message}`);
        }
    }

    /**
     * Validate social media links data
     * @param {Object} data - Social media links data
     * @returns {Boolean} Validation result
     */
    validateSocialMediaLinksData(data) {
        try {
            if (!data || typeof data !== 'object') {
                throw new Error('Data must be a valid object');
            }

            // Validate URL format for each platform if provided
            const urlFields = ['InstagramLink', 'FacebookLink', 'TwitterLink', 'LinkedInLink', 'YoutubeLink'];

            for (const field of urlFields) {
                if (data[field] !== undefined && data[field] !== null && data[field] !== '') {
                    const url = data[field].trim();

                    // Basic URL validation (more specific validation happens in the model)
                    if (url && url.length > 500) {
                        throw new Error(`${field} cannot exceed 500 characters`);
                    }
                }
            }

            return true;
        } catch (error) {
            throw new Error(`Validation failed: ${error.message}`);
        }
    }
}

export default SocialMediaLinksService;
