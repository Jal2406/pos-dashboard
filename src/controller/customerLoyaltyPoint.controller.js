import { StatusCodes } from 'http-status-codes';
import { ResponseService } from '../utils/index.js';
import { CustomerLoyaltyPointService } from '../services/index.js';

/**
 * Customer Loyalty Point Controller
 *
 * Controller for managing customer loyalty point transactions.
 * Handles HTTP requests and delegates business logic to CustomerLoyaltyPointServices.
 *
 * @class CustomerLoyaltyPointController
 */
class CustomerLoyaltyPointController {

    /**
     * Get loyalty point history
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Promise<void>}
     */
    static async getHistory(req, res) {
        try {
            const businessId = req.user?.businessId || req.businessId;
            const customerLoyaltyPointService = new CustomerLoyaltyPointService(businessId);

            const {
                limit,
                skip,
                search,
                transactionType,
                startDate,
                endDate
            } = req.query;

            const history = await customerLoyaltyPointService.getLoyaltyPointHistory({
                limit,
                skip,
                search,
                transactionType,
                startDate,
                endDate
            });

            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Loyalty point history retrieved successfully',
                history
            );
        } catch (error) {
            console.error('Loyalty point history retrieval error:', error);
            return ResponseService.send(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                error.message || 'Failed to retrieve loyalty point history'
            );
        }
    }
}

export default CustomerLoyaltyPointController;
