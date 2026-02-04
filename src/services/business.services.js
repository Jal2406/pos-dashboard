import { BaseService } from '../utils/index.js';
import Business from '../models/Business.js';

class BusinessService extends BaseService {
    constructor() {
        super(Business);
    }

    /**
     * Assign or update subdomain for a business
     * @param {String} userId - ID of the user (owner)
     * @param {String} subdomain - Subdomain to assign
     * @returns {Object} Updated business
     */
    async assignSubdomain(userId, subdomain) {
        try {
            if (!subdomain) {
                throw new Error('Subdomain is required');
            }

            // Validate subdomain format (alphanumeric, hyphens)
            const subdomainRegex = /^[a-z0-9-]+$/;
            if (!subdomainRegex.test(subdomain)) {
                throw new Error('Subdomain must contain only lowercase letters, numbers, and hyphens');
            }

            // Check if subdomain is already taken
            const existingBusiness = await this.model.findOne({ subdomain });
            if (existingBusiness && existingBusiness.owner.toString() !== userId.toString()) {
                throw new Error('Subdomain is already taken');
            }

            // Find user's business
            const business = await this.model.findOne({ owner: userId });
            if (!business) {
                throw new Error('Business not found for this user');
            }

            // Update subdomain
            business.subdomain = subdomain;
            await business.save();

            return business;
        } catch (error) {
            throw new Error(error.message);
        }
    }

    /**
     * Get business by owner ID
     * @param {String} userId - ID of the user (owner)
     * @returns {Object} Business
     */
    async getBusinessByOwner(userId) {
        try {
            const business = await this.model.findOne({ owner: userId });
            if (!business) {
                throw new Error('Business not found');
            }
            return business;
        } catch (error) {
            throw new Error(error.message);
        }
    }
}

export default BusinessService;
