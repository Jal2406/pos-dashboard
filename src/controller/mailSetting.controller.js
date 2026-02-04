import { StatusCodes } from 'http-status-codes';
import { ResponseService } from '../utils/index.js';
import { MailSettingServices } from '../services/index.js';

const mailSettingServices = new MailSettingServices();

class MailSettingController {
  // Get the single mail setting
  static async get(req, res) {
    try {
      const setting = await mailSettingServices.getMailSetting();
      if (!setting) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'No mail setting found',
          null,
        );
      }
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Mail setting fetched successfully',
        setting,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch mail setting',
      );
    }
  }

  // Create or update mail setting
  static async createOrUpdate(req, res) {
    try {
      const result = await mailSettingServices.createOrUpdate(req.body);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Mail setting saved successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to save mail setting',
      );
    }
  }

  // Verify mail setting
  static async verify(req, res) {
    try {
      const verified = await mailSettingServices.verify();
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Mail setting verified successfully',
        verified,
      );
    } catch (error) {
      console.log(error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to verify mail setting',
      );
    }
  }

  // Delete mail setting
  static async delete(req, res) {
    try {
      await mailSettingServices.delete();
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Mail setting deleted successfully',
        null,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to delete mail setting',
      );
    }
  }

  // Get mail status (for debugging/admin purposes)
  static async getStatus(req, res) {
    try {
      const status = await mailSettingServices.getMailStatus();
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Mail status retrieved successfully',
        status,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to get mail status',
      );
    }
  }
}

export default MailSettingController;
