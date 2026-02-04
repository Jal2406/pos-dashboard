/**
 * Unified Payment Controller
 * Handles multi-provider payment operations for subscription system
 */

import { StatusCodes } from 'http-status-codes';
import { ResponseService } from '../utils/index.js';
import { UnifiedPaymentService } from '../services/payment/UnifiedPaymentService.js';
import { Payment } from '../models/index.js';

const unifiedPaymentService = new UnifiedPaymentService();

class UnifiedPaymentController {
  /**
   * Create a payment for subscription
   * POST /api/payment/create
   */
  static async createPayment(req, res) {
    try {
      const { subscriptionId, paymentProvider, currencyId } = req.body;
      const userId = req.user.id;

      if (!subscriptionId) {
        console.log('Subscription ID is required');
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Subscription ID is required',
        );
      }

      if (!paymentProvider) {
        console.log('Payment provider is required');
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Payment provider is required',
        );
      }

      // Normalize payment provider to lowercase
      const normalizedProvider = paymentProvider.toLowerCase();

      // Check if provider is supported
      const supportedProviders = [
        'razorpay',
        'paypal',
        'cinet',
        'sadad',
        'airtelmoney',
        'phonepe',
        'midtrans',
        'paystack',
        'flutterwave',
      ];
      if (!supportedProviders.includes(normalizedProvider)) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          `Unsupported payment provider: ${paymentProvider}. Supported providers: ${supportedProviders.join(
            ', ',
          )}`,
        );
      }

      const result = await unifiedPaymentService.createPayment(
        subscriptionId,
        userId,
        normalizedProvider,
        currencyId,
      );

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Payment created successfully',
        result,
      );
    } catch (err) {
      console.log('Payment creation error:', err);
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, err.message);
    }
  }

  /**
   * Finalize payment after user interaction
   * POST /api/payment/finalize
   */
  static async finalizePayment(req, res) {
    try {
      const { paymentId, ...finalizeData } = req.body;
      const correlationId = req.header('X-Correlation-Id') || null;

      if (!paymentId) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Payment ID is required',
        );
      }

      // Fetch payment to get actual provider for logging
      const paymentForLog = await Payment.findById(paymentId)
        .select('provider')
        .lean();
      console.log(`Starting payment finalization for paymentId: ${paymentId}`, {
        correlationId,
        provider: paymentForLog?.provider || 'unknown',
      });

      const result = await unifiedPaymentService.finalizePayment(
        paymentId,
        finalizeData,
        correlationId,
      );

      console.log(
        `Payment finalization completed successfully for paymentId: ${paymentId}`,
        {
          correlationId,
          paymentStatus: result.payment?.status,
          subscriptionStatus: result.subscription?.status,
        },
      );

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Payment finalized successfully',
        result,
      );
    } catch (err) {
      console.error(
        `Payment finalization failed for paymentId: ${req.body.paymentId}`,
        {
          error: err.message,
          code: err.code,
          codeName: err.codeName,
          correlationId: req.header('X-Correlation-Id'),
          stack: err.stack,
        },
      );

      // Handle specific MongoDB transaction errors
      if (err.code === 251 || err.codeName === 'NoSuchTransaction') {
        return ResponseService.send(
          res,
          StatusCodes.CONFLICT,
          'Transaction conflict occurred. Please try again.',
        );
      }

      if (err.code === 112 || err.codeName === 'WriteConflict') {
        return ResponseService.send(
          res,
          StatusCodes.CONFLICT,
          'Write conflict occurred. Please try again.',
        );
      }

      // Handle validation errors
      if (
        err.name === 'ValidationError' ||
        err.message?.includes('validation')
      ) {
        return ResponseService.send(res, StatusCodes.BAD_REQUEST, err.message);
      }

      // Handle payment-specific errors
      if (
        err.message?.includes('Payment') ||
        err.message?.includes('payment')
      ) {
        return ResponseService.send(res, StatusCodes.BAD_REQUEST, err.message);
      }

      // Generic error handling
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'An error occurred while finalizing the payment. Please try again.',
      );
    }
  }

  /**
   * Process webhook from payment provider
   * POST /api/payment/webhook/:provider
   */
  static async processWebhook(req, res) {
    try {
      const { provider } = req.params;
      const signature =
        req.header('X-Razorpay-Signature') ||
        req.header('PayPal-Transmission-Id');
      const rawBody = req.rawBody || req.body;
      const payload = Buffer.isBuffer(req.body)
        ? JSON.parse(req.body.toString())
        : req.body;

      if (!provider) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Provider is required',
        );
      }

      if (!signature) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Webhook signature is required',
        );
      }

      const result = await unifiedPaymentService.processWebhook(
        payload,
        rawBody,
        signature,
        provider,
      );

      return res.status(200).json({
        ok: true,
        data: result,
      });
    } catch (err) {
      return res.status(400).json({
        ok: false,
        message: err.message,
      });
    }
  }

  /**
   * Get payment by ID
   * GET /api/payment/:id
   */
  static async getPaymentById(req, res) {
    try {
      const { id } = req.params;

      if (!id) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Payment ID is required',
        );
      }

      const payment = await unifiedPaymentService.getPaymentById(id);

      if (!payment) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Payment not found',
        );
      }

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Payment retrieved successfully',
        payment,
      );
    } catch (err) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, err.message);
    }
  }

  /**
   * List payments by user
   * GET /api/payment/user/:userId
   */
  static async listPaymentsByUser(req, res) {
    try {
      const { userId } = req.params;
      const { limit = 50, skip = 0 } = req.query;

      if (!userId) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'User ID is required',
        );
      }

      const payments = await unifiedPaymentService.listPaymentsByUser(userId, {
        limit: parseInt(limit),
        skip: parseInt(skip),
      });

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Payments retrieved successfully',
        payments,
      );
    } catch (err) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, err.message);
    }
  }

  /**
   * Get available payment providers
   * GET /api/payment/providers
   */
  static async getAvailableProviders(req, res) {
    try {
      const providers = await unifiedPaymentService.getAvailableProviders();

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Available providers retrieved successfully',
        providers,
      );
    } catch (err) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        err.message,
      );
    }
  }

  /**
   * Get payment provider public credentials
   * GET /api/payment/providers/:provider/credentials
   */
  static async getProviderCredentials(req, res) {
    try {
      const { provider } = req.params;

      if (!provider) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Provider is required',
        );
      }

      const providers = await unifiedPaymentService.getAvailableProviders();
      const providerData = providers.find((p) => p.name === provider);

      if (!providerData) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Provider not found or not configured',
        );
      }

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Provider credentials retrieved successfully',
        {
          provider: providerData.name,
          displayName: providerData.displayName,
          publicCredentials: providerData.publicCredentials,
        },
      );
    } catch (err) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        err.message,
      );
    }
  }
}

export default UnifiedPaymentController;
