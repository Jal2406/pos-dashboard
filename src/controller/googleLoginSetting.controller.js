import { StatusCodes } from 'http-status-codes';
import { ResponseService } from '../utils/index.js';
import { GoogleLoginSettingService } from '../services/index.js';

const googleLoginSettingServices = new GoogleLoginSettingService();

class GoogleLoginSettingController {
  // Get the single Google login setting
  static async get(req, res) {
    try {
      const setting = await googleLoginSettingServices.getGoogleLoginSetting();
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Google login setting fetched successfully',
        setting,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch Google login setting',
      );
    }
  }

  // Update Google login setting
  static async update(req, res) {
    try {
      const result = await googleLoginSettingServices.update(req.body);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Google login setting updated successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to update Google login setting',
      );
    }
  }

  // Toggle Google login enabled/disabled status
  static async toggle(req, res) {
    try {
      const result = await googleLoginSettingServices.toggle();
      return ResponseService.send(
        res,
        StatusCodes.OK,
        `Google login ${
          result.isEnabled ? 'enabled' : 'disabled'
        } successfully`,
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to toggle Google login status',
      );
    }
  }

  // Verify Google login setting
  static async verify(req, res) {
    try {
      const verified = await googleLoginSettingServices.verify();
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Google login setting verified successfully',
        verified,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to verify Google login setting',
      );
    }
  }

  // Get Google login status (for debugging/admin purposes)
  static async getStatus(req, res) {
    try {
      const status = await googleLoginSettingServices.getGoogleLoginStatus();
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Google login status retrieved successfully',
        status,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to get Google login status',
      );
    }
  }
}

export default GoogleLoginSettingController;
