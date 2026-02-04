import { StatusCodes } from 'http-status-codes';
import { SocialMediaLinksService } from '../services/index.js';
import { ResponseService } from '../utils/index.js';

const socialMediaLinksService = new SocialMediaLinksService();

class SocialMediaLinksController {
    /**
     * Create or update social media links
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async createOrUpdateSocialMediaLinks(req, res) {
        try {
            const socialMediaLinksData = {};

            // Only include fields that are actually provided in the request
            if (req.body.InstagramLink !== undefined || req.body.instagramLink !== undefined) {
                socialMediaLinksData.InstagramLink = req.body.InstagramLink || req.body.instagramLink || '';
            }
            if (req.body.FacebookLink !== undefined || req.body.facebookLink !== undefined) {
                socialMediaLinksData.FacebookLink = req.body.FacebookLink || req.body.facebookLink || '';
            }
            if (req.body.TwitterLink !== undefined || req.body.twitterLink !== undefined) {
                socialMediaLinksData.TwitterLink = req.body.TwitterLink || req.body.twitterLink || '';
            }
            if (req.body.LinkedInLink !== undefined || req.body.linkedInLink !== undefined) {
                socialMediaLinksData.LinkedInLink = req.body.LinkedInLink || req.body.linkedInLink || '';
            }
            if (req.body.YoutubeLink !== undefined || req.body.youtubeLink !== undefined) {
                socialMediaLinksData.YoutubeLink = req.body.YoutubeLink || req.body.youtubeLink || '';
            }

            // Validate data
            socialMediaLinksService.validateSocialMediaLinksData(socialMediaLinksData);

            const socialMediaLinks = await socialMediaLinksService.createOrUpdateSocialMediaLinks(socialMediaLinksData);

            // Check if this was an update or create based on whether document existed
            const statusCode = socialMediaLinks.createdAt === socialMediaLinks.updatedAt
                ? StatusCodes.CREATED
                : StatusCodes.OK;

            const message = statusCode === StatusCodes.CREATED
                ? 'Social media links created successfully'
                : 'Social media links updated successfully';

            return ResponseService.send(
                res,
                statusCode,
                message,
                socialMediaLinks,
            );
        } catch (error) {
            console.log(error);
            return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
        }
    }

    /**
     * Get social media links (no pagination, returns single document)
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async getSocialMediaLinks(req, res) {
        try {
            const result = await socialMediaLinksService.getSocialMediaLinks();

            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Social media links retrieved successfully',
                result,
            );
        } catch (error) {
            return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
        }
    }

    /**
     * Get the current social media links
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async getCurrentSocialMediaLinks(req, res) {
        try {
            const socialMediaLinks = await socialMediaLinksService.getCurrentSocialMediaLinks();

            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Current social media links retrieved successfully',
                socialMediaLinks,
            );
        } catch (error) {
            return ResponseService.send(res, StatusCodes.NOT_FOUND, error.message);
        }
    }

    /**
     * Get or create social media links
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async getOrCreateSocialMediaLinks(req, res) {
        try {
            const socialMediaLinks = await socialMediaLinksService.getOrCreateSocialMediaLinks();

            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Social media links retrieved successfully',
                socialMediaLinks,
            );
        } catch (error) {
            return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
        }
    }
}

export default SocialMediaLinksController;
