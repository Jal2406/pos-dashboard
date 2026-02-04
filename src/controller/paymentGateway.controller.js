import { StatusCodes } from 'http-status-codes';
import { ResponseService } from '../utils/index.js';
import { PaymentGatewayService } from '../services/index.js';

const paymentGatewayService = new PaymentGatewayService();

class PaymentGatewayController {
  /**
   * Determine response mode based on route context
   * @param {Object} req - Express request object
   * @returns {string} Response mode: 'full', 'masked', or 'public'
   */
  static getResponseMode(req) {
    // Check the original URL path which includes the full route
    const originalUrl = req.originalUrl || req.url;
    const routePath = req.route?.path || req.path;
    const baseUrl = req.baseUrl || '';

    // Check if this is a super admin route or user has super admin role
    if (
      originalUrl.includes('/super-admin') ||
      routePath.includes('/super-admin') ||
      baseUrl.includes('/super-admin') ||
      req.user?.role?.name === 'superadmin'
    ) {
      return 'full';
    } else if (
      originalUrl.includes('/admin') ||
      originalUrl.includes('/manager') ||
      originalUrl.includes('/cashier') ||
      routePath.includes('/admin') ||
      routePath.includes('/manager') ||
      routePath.includes('/cashier') ||
      baseUrl.includes('/admin') ||
      baseUrl.includes('/manager') ||
      baseUrl.includes('/cashier') ||
      ['admin', 'manager', 'cashier'].includes(req.user?.role?.name)
    ) {
      return 'public';
    }
    return 'masked';
  }

  /**
   * Generate response message based on mode and operation
   * @param {string} operation - Operation type (create, get, update, etc.)
   * @param {string} mode - Response mode
   * @param {boolean} isActive - Whether it's for active gateways
   * @returns {string} Formatted message
   */
  static getResponseMessage(operation, mode, isActive = false) {
    const baseMessages = {
      create: 'Payment gateway created successfully',
      get: isActive
        ? 'Active payment gateways retrieved successfully'
        : 'Payment gateways retrieved successfully',
      getById: 'Payment gateway retrieved successfully',
      update: 'Payment gateway updated successfully',
      updateCredentials: 'Credentials updated successfully',
      delete: 'Payment gateway deleted successfully',
      toggle: 'Gateway status toggled successfully',
      publicCredentials: 'Public credentials retrieved successfully',
    };

    const baseMessage =
      baseMessages[operation] || 'Operation completed successfully';

    if (mode === 'full') {
      return baseMessage.replace(
        'retrieved',
        'with decrypted credentials retrieved',
      );
    } else if (mode === 'public') {
      return baseMessage.replace(
        'retrieved',
        'with public credentials retrieved',
      );
    }

    return baseMessage;
  }

  /**
   * Handle common error responses
   * @param {Object} res - Express response object
   * @param {Error} error - Error object
   * @param {string} operation - Operation that failed
   */
  static handleError(res, error, operation) {
    const statusCode = error.message.includes('not found')
      ? StatusCodes.NOT_FOUND
      : StatusCodes.INTERNAL_SERVER_ERROR;
    const message = `Error ${operation
      .replace(/([A-Z])/g, ' $1')
      .toLowerCase()}`;

    ResponseService.send(res, statusCode, message, error.message);
  }

  /**
   * Format gateway response with appropriate mode
   * @param {Object} gateway - Gateway data
   * @param {string} mode - Response mode
   * @returns {Object} Formatted gateway
   */
  static formatGatewayResponse(gateway, mode) {
    if (!gateway) return gateway;

    const normalizedGateway = paymentGatewayService.normalizeGateway(gateway);
    return paymentGatewayService.formatGatewayResponse(normalizedGateway, mode);
  }
  static async createPaymentGateway(req, res) {
    try {
      const paymentGateway = await paymentGatewayService.create(req.body);
      const mode = PaymentGatewayController.getResponseMode(req);
      const formattedGateway = PaymentGatewayController.formatGatewayResponse(
        paymentGateway,
        mode,
      );

      ResponseService.send(
        res,
        StatusCodes.CREATED,
        PaymentGatewayController.getResponseMessage('create', mode),
        formattedGateway,
      );
    } catch (error) {
      PaymentGatewayController.handleError(
        res,
        error,
        'creating payment gateway',
      );
    }
  }

  static async getPaymentGateways(req, res) {
    try {
      const defaultMode = PaymentGatewayController.getResponseMode(req);
      const queryParams = {
        page: req.query.page,
        limit: req.query.limit,
        search: req.query.search,
        sortBy: req.query.sortBy,
        sortOrder: req.query.sortOrder,
        provider: req.query.provider,
        enabled: req.query.enabled,
        mode: req.query.mode || defaultMode,
      };

      const paymentGateways = await paymentGatewayService.getAll(queryParams);

      if (!paymentGateways?.data?.length) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'No payment gateways found',
          { data: [], pagination: paymentGateways?.pagination || {} },
        );
      }

      ResponseService.send(
        res,
        StatusCodes.OK,
        PaymentGatewayController.getResponseMessage('get', queryParams.mode),
        paymentGateways,
      );
    } catch (error) {
      PaymentGatewayController.handleError(
        res,
        error,
        'retrieving payment gateways',
      );
    }
  }

  static async getPaymentGateway(req, res) {
    try {
      const { id } = req.params;
      const mode =
        req.query.mode || PaymentGatewayController.getResponseMode(req);

      const rawGateway = await paymentGatewayService.getById(id);
      if (!rawGateway) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Payment gateway not found',
          null,
        );
      }

      const paymentGateway = PaymentGatewayController.formatGatewayResponse(
        rawGateway,
        mode,
      );
      ResponseService.send(
        res,
        StatusCodes.OK,
        PaymentGatewayController.getResponseMessage('getById', mode),
        paymentGateway,
      );
    } catch (error) {
      PaymentGatewayController.handleError(
        res,
        error,
        'retrieving payment gateway',
      );
    }
  }

  static async updatePaymentGateway(req, res) {
    try {
      const { id } = req.params;
      const paymentGateway = await paymentGatewayService.update(id, req.body);

      if (!paymentGateway) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Payment gateway not found',
          null,
        );
      }

      const mode = PaymentGatewayController.getResponseMode(req);
      const formattedGateway = PaymentGatewayController.formatGatewayResponse(
        paymentGateway,
        mode,
      );

      ResponseService.send(
        res,
        StatusCodes.OK,
        PaymentGatewayController.getResponseMessage('update', mode),
        formattedGateway,
      );
    } catch (error) {
      PaymentGatewayController.handleError(
        res,
        error,
        'updating payment gateway',
      );
    }
  }

  static async updateCredentials(req, res) {
    try {
      const { id } = req.params;
      const { credentials } = req.body;

      if (!credentials) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Credentials are required',
          null,
        );
      }

      const paymentGateway = await paymentGatewayService.updateCredentials(
        id,
        credentials,
      );

      if (!paymentGateway) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Payment gateway not found',
          null,
        );
      }

      const mode = PaymentGatewayController.getResponseMode(req);
      const formattedGateway = PaymentGatewayController.formatGatewayResponse(
        paymentGateway,
        mode,
      );

      ResponseService.send(
        res,
        StatusCodes.OK,
        PaymentGatewayController.getResponseMessage('updateCredentials', mode),
        formattedGateway,
      );
    } catch (error) {
      PaymentGatewayController.handleError(res, error, 'updating credentials');
    }
  }

  static async deletePaymentGateway(req, res) {
    try {
      const { id } = req.params;
      const paymentGateway = await paymentGatewayService.delete(id);

      if (!paymentGateway) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Payment gateway not found',
          null,
        );
      }

      const mode = PaymentGatewayController.getResponseMode(req);
      const formattedGateway = PaymentGatewayController.formatGatewayResponse(
        paymentGateway,
        mode,
      );

      ResponseService.send(
        res,
        StatusCodes.OK,
        PaymentGatewayController.getResponseMessage('delete', mode),
        formattedGateway,
      );
    } catch (error) {
      PaymentGatewayController.handleError(
        res,
        error,
        'deleting payment gateway',
      );
    }
  }

  static async toggleGatewayStatus(req, res) {
    try {
      const { id } = req.params;
      const paymentGateway =
        await paymentGatewayService.toggleGatewayStatus(id);

      if (!paymentGateway) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Payment gateway not found',
          null,
        );
      }

      const mode = PaymentGatewayController.getResponseMode(req);
      const formattedGateway = PaymentGatewayController.formatGatewayResponse(
        paymentGateway,
        mode,
      );

      ResponseService.send(
        res,
        StatusCodes.OK,
        PaymentGatewayController.getResponseMessage('toggle', mode),
        formattedGateway,
      );
    } catch (error) {
      PaymentGatewayController.handleError(
        res,
        error,
        'toggling gateway status',
      );
    }
  }

  static async getActiveGateways(req, res) {
    try {
      const mode =
        req.query.mode || PaymentGatewayController.getResponseMode(req);
      const rawGateways = await paymentGatewayService.getActiveGateways();

      const activeGateways = rawGateways.map((gateway) =>
        PaymentGatewayController.formatGatewayResponse(gateway, mode),
      );

      ResponseService.send(
        res,
        StatusCodes.OK,
        PaymentGatewayController.getResponseMessage('get', mode, true),
        activeGateways,
      );
    } catch (error) {
      PaymentGatewayController.handleError(
        res,
        error,
        'retrieving active payment gateways',
      );
    }
  }

  static async getPublicCredentialsForPayment(req, res) {
    try {
      const { provider } = req.params;

      if (!provider) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Provider is required',
          null,
        );
      }

      const publicCredentials =
        await paymentGatewayService.getPublicCredentialsForPayment(provider);

      ResponseService.send(
        res,
        StatusCodes.OK,
        PaymentGatewayController.getResponseMessage(
          'publicCredentials',
          'public',
        ),
        publicCredentials,
      );
    } catch (error) {
      PaymentGatewayController.handleError(
        res,
        error,
        'retrieving public credentials',
      );
    }
  }
}

export default PaymentGatewayController;
