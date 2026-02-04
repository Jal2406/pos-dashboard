import { StatusCodes } from 'http-status-codes';
import { ResponseService } from '../utils/index.js';
import BusinessService from '../services/business.services.js';

const businessService = new BusinessService();

class BusinessController {
    /**
     * Assign subdomain to business
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     */
    static async AssignSubdomain(req, res) {
        try {
            const { subdomain } = req.body;
            const userId = req.user.id; // Assuming auth middleware populates req.user

            const business = await businessService.assignSubdomain(userId, subdomain);

            ResponseService.send(
                res,
                StatusCodes.OK,
                'Subdomain assigned successfully',
                business,
            );
        } catch (error) {
            ResponseService.send(
                res,
                StatusCodes.BAD_REQUEST,
                error.message,
            );
        }
    }

    /**
     * Get current business details
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     */
    static async GetMyBusiness(req, res) {
        try {
            const userId = req.user.id || req.user._id;
            const business = await businessService.getBusinessByOwner(userId);

            ResponseService.send(
                res,
                StatusCodes.OK,
                'Business details retrieved successfully',
                business,
            );
        } catch (error) {
            ResponseService.send(
                res,
                StatusCodes.BAD_REQUEST,
                error.message,
            );
        }
    }
}

export default BusinessController;
