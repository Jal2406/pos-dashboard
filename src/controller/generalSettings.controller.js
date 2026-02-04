import { StatusCodes } from 'http-status-codes';
import { GeneralSettingsService } from '../services/index.js';
import { ResponseService } from '../utils/index.js';

const generalSettingsService = new GeneralSettingsService();

class GeneralSettingsController {
  /**
   * Create or update general settings
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async createOrUpdateSettings(req, res) {
    try {
      if (!req.body) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Request body is missing. Please send data as JSON.',
        );
      }

      // Handle both nested businessAddress object and flat structure
      const businessAddress = req.body.businessAddress || {};

      const settingsData = {
        appName: req.body.appName,
        contactNumber: req.body.contactNumber,
        inquiryEmail: req.body.inquiryEmail,
        siteDescription: req.body.siteDescription,
        footerText: req.body.footerText || '',
        businessAddress: {
          shopNumber: businessAddress.shopNumber || req.body.shopNumber,
          buildingName: businessAddress.buildingName || req.body.buildingName,
          area: businessAddress.area || req.body.area,
          landmark: businessAddress.landmark || req.body.landmark,
          nearBy: businessAddress.nearBy || req.body.nearBy,
          country: businessAddress.country || req.body.country,
          state: businessAddress.state || req.body.state,
          city: businessAddress.city || req.body.city,
          postalCode: businessAddress.postalCode || req.body.postalCode,
          latitude: parseFloat(businessAddress.latitude || req.body.latitude) || 0,
          longitude: parseFloat(businessAddress.longitude || req.body.longitude) || 0,
        },
      };

      // Handle logo URLs - support both darkLogo/lightLogo and darkLogoUrl/lightLogoUrl
      const darkLogoUrl = req.body.darkLogoUrl || req.body.darkLogo;
      const lightLogoUrl = req.body.lightLogoUrl || req.body.lightLogo;
      const faviconUrl = req.body.faviconUrl || req.body.favicon;
      const collapsDarkLogoUrl = req.body.collapsDarkLogoUrl || req.body.collapsDarkLogo;
      const collapsLightLogoUrl = req.body.collapsLightLogoUrl || req.body.collapsLightLogo;

      if (darkLogoUrl) {
        settingsData.logos = settingsData.logos || {};
        settingsData.logos.darkLogo = {
          url: darkLogoUrl,
          publicId: req.body.darkLogoPublicId || '',
        };
      }

      if (lightLogoUrl) {
        settingsData.logos = settingsData.logos || {};
        settingsData.logos.lightLogo = {
          url: lightLogoUrl,
          publicId: req.body.lightLogoPublicId || '',
        };
      }

      if (faviconUrl) {
        settingsData.logos = settingsData.logos || {};
        settingsData.logos.favicon = {
          url: faviconUrl,
          publicId: req.body.faviconPublicId || '',
        };
      }

      if (collapsDarkLogoUrl) {
        settingsData.logos = settingsData.logos || {};
        settingsData.logos.collapsDarkLogo = {
          url: collapsDarkLogoUrl,
          publicId: req.body.collapsDarkLogoPublicId || '',
        };
      }

      if (collapsLightLogoUrl) {
        settingsData.logos = settingsData.logos || {};
        settingsData.logos.collapsLightLogo = {
          url: collapsLightLogoUrl,
          publicId: req.body.collapsLightLogoPublicId || '',
        };
      }

      // Validate data
      generalSettingsService.validateGeneralSettingsData(settingsData);

      const settings = await generalSettingsService.createOrUpdateSettings(
        settingsData,
      );

      return ResponseService.send(
        res,
        StatusCodes.CREATED,
        'General settings created/updated successfully',
        settings,
      );
    } catch (error) {
      console.error('Create/Update General Settings Error:', error);
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  /**
   * Get the current general settings
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getCurrentSettings(req, res) {
    try {
      const settings = await generalSettingsService.getCurrentSettings();

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'General settings retrieved successfully',
        settings,
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.NOT_FOUND, error.message);
    }
  }

  /**
   * Update general settings
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async updateGeneralSettings(req, res) {
    try {
      // Handle both nested businessAddress object and flat structure
      const businessAddress = req.body.businessAddress || {};

      const updateData = {
        appName: req.body.appName,
        contactNumber: req.body.contactNumber,
        inquiryEmail: req.body.inquiryEmail,
        siteDescription: req.body.siteDescription,
        footerText: req.body.footerText || '',
        businessAddress: {
          shopNumber: businessAddress.shopNumber || req.body.shopNumber,
          buildingName: businessAddress.buildingName || req.body.buildingName,
          area: businessAddress.area || req.body.area,
          landmark: businessAddress.landmark || req.body.landmark,
          nearBy: businessAddress.nearBy || req.body.nearBy,
          country: businessAddress.country || req.body.country,
          state: businessAddress.state || req.body.state,
          city: businessAddress.city || req.body.city,
          postalCode: businessAddress.postalCode || req.body.postalCode,
          latitude: parseFloat(businessAddress.latitude || req.body.latitude) || 0,
          longitude: parseFloat(businessAddress.longitude || req.body.longitude) || 0,
        },
      };


      // Handle logo URLs - support both darkLogo/lightLogo and darkLogoUrl/lightLogoUrl
      const darkLogoUrl = req.body.darkLogoUrl || req.body.darkLogo;
      const lightLogoUrl = req.body.lightLogoUrl || req.body.lightLogo;
      const faviconUrl = req.body.faviconUrl || req.body.favicon;
      const collapsDarkLogoUrl = req.body.collapsDarkLogoUrl || req.body.collapsDarkLogo;
      const collapsLightLogoUrl = req.body.collapsLightLogoUrl || req.body.collapsLightLogo;

      if (darkLogoUrl) {
        updateData['logos.darkLogo.url'] = darkLogoUrl;
        updateData['logos.darkLogo.publicId'] = req.body.darkLogoPublicId || '';
      }

      if (lightLogoUrl) {
        updateData['logos.lightLogo.url'] = lightLogoUrl;
        updateData['logos.lightLogo.publicId'] = req.body.lightLogoPublicId || '';
      }

      if (faviconUrl) {
        updateData['logos.favicon.url'] = faviconUrl;
        updateData['logos.favicon.publicId'] = req.body.faviconPublicId || '';
      }

      if (collapsDarkLogoUrl) {
        updateData['logos.collapsDarkLogo.url'] = collapsDarkLogoUrl;
        updateData['logos.collapsDarkLogo.publicId'] = req.body.collapsDarkLogoPublicId || '';
      }

      if (collapsLightLogoUrl) {
        updateData['logos.collapsLightLogo.url'] = collapsLightLogoUrl;
        updateData['logos.collapsLightLogo.publicId'] = req.body.collapsLightLogoPublicId || '';
      }

      // Validate update data
      generalSettingsService.validateGeneralSettingsData(updateData);

      const updatedSettings =
        await generalSettingsService.updateGeneralSettings(updateData);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'General settings updated successfully',
        updatedSettings,
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }



  /**
   * Delete dark logo
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async deleteDarkLogo(req, res) {
    try {
      const result = await generalSettingsService.deleteLogo('darkLogo');

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Dark logo deleted successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  /**
   * Delete light logo
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async deleteLightLogo(req, res) {
    try {
      const result = await generalSettingsService.deleteLogo('lightLogo');

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Light logo deleted successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  /**
   * Delete favicon
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async deleteFavicon(req, res) {
    try {
      const result = await generalSettingsService.deleteLogo('favicon');

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Favicon deleted successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  /**
   * Delete collapsible dark logo
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async deleteCollapsDarkLogo(req, res) {
    try {
      const result = await generalSettingsService.deleteLogo('collapsDarkLogo');

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Collapsible dark logo deleted successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  /**
   * Delete collapsible light logo
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async deleteCollapsLightLogo(req, res) {
    try {
      const result = await generalSettingsService.deleteLogo('collapsLightLogo');

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Collapsible light logo deleted successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }
}

export default GeneralSettingsController;
