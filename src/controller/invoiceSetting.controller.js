import { StatusCodes } from 'http-status-codes';
import { ResponseService } from '../utils/index.js';
import { InvoiceSettingServices } from '../services/index.js';

const invoiceSettingServices = new InvoiceSettingServices();

class InvoiceSettingController {
  static async list(req, res) {
    try {
      const result = await invoiceSettingServices.list(req.query);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Invoice settings fetched successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch invoice settings',
      );
    }
  }

  static async getNextOrderNumber(req, res) {
    try {
      const result = await invoiceSettingServices.getNextOrderNumber();
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Next order number generated successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.NOT_FOUND,
        error.message || 'Failed to generate next order number',
      );
    }
  }

  static async incrementOrderStart(req, res) {
    try {
      const result = await invoiceSettingServices.incrementOrderStart();
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Order start number incremented successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to increment order start number',
      );
    }
  }

  static async createOrUpdate(req, res) {
    try {
      const result = await invoiceSettingServices.createOrUpdate(req.body);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Invoice settings saved successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to save invoice settings',
      );
    }
  }
}

export default InvoiceSettingController;
