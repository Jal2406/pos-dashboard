import { StatusCodes } from 'http-status-codes';
import { ResponseService } from '../utils/index.js';
import LoginHistoryServices from '../services/loginHistory.services.js';

class LoginHistoryController {

    static _getService(req) {
        // Ensure businessId is present if it's a tenant-scoped feature
        // Depending on auth middleware, req.businessId might be populated
        return new LoginHistoryServices(req.businessId);
    }

    static async list(req, res) {
        try {
            const service = LoginHistoryController._getService(req);
            // If the user wants to see their own history vs admin seeing all, 
            // logic could be added here. Assuming Admin view for now based on image.
            const result = await service.list(req.query, req.businessId);

            return ResponseService.send(
                res,
                StatusCodes.OK,
                'Login history fetched successfully',
                result
            );
        } catch (error) {
            console.log(error);
            return ResponseService.send(
                res,
                StatusCodes.BAD_REQUEST,
                error.message || 'Failed to fetch login history'
            );
        }
    }

    // Not typically exposed as public API, but if needed for manual testing or external trigger:
    /*
    static async create(req, res) { ... }
    */
}

export default LoginHistoryController;
