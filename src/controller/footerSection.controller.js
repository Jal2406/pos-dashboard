import { StatusCodes } from 'http-status-codes';
import { FooterSectionService } from '../services/index.js';
import { ResponseService } from '../utils/index.js';
const footerSectionService = new FooterSectionService();

class FooterSectionController {
  /**
   * Create or update footer section (ensures only one exists)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async createOrUpdateFooterSection(req, res) {
    try {
      // Support both frontend payload shapes:
      // 1) { footer: { cta: {...}, links: [...] } }
      // 2) [ { cta: {...}, links: [...] } ]  (array where first item is footer object)
      const rawBody = Array.isArray(req.body) ? req.body[0] : req.body || {};
      const footerPayload = rawBody.footer ? rawBody.footer : rawBody;

      const footerData = {
        footer: {
          cta: footerPayload?.cta,
          links: footerPayload?.links || [],
        },
      };

      // Quick server-side validation to return clearer errors before Mongoose
      if (!footerData.footer || !footerData.footer.cta) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'CTA data is required',
        );
      }

      // Use service validation for detailed CTA rules (lengths, types)
      footerSectionService.validateCTASectionData(footerData.footer.cta);

      const footerSection =
        await footerSectionService.createOrUpdateFooterSection(footerData);
      

      return ResponseService.send(
        res,
        StatusCodes.CREATED,
        'Footer section created/updated successfully',
        footerSection.footer, // Return footer data directly instead of entire document
      );
    } catch (error) {
      console.log("Error is comming: ",error);
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  /**
   * Get footer section (since only one exists in DB)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getFooterSections(req, res) {
    try {
      // Since only one footer section exists, get it directly
      const footerSection =
        await footerSectionService.getCurrentFooterSection();

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Footer section retrieved successfully',
        { ...footerSection.footer, _id: footerSection._id.toString() }, // Return footer data directly instead of entire document
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.NOT_FOUND, error.message);
    }
  }

  /**
   * Get the current footer section
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getCurrentFooterSection(req, res) {
    try {
      const footerSection =
        await footerSectionService.getCurrentFooterSection();

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Current footer section retrieved successfully',
        { data: footerSection.footer, id: footerSection._id }, // Return footer data directly instead of entire document
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.NOT_FOUND, error.message);
    }
  }

  /**
   * Get footer section by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getFooterSectionById(req, res) {
    try {
      const { id } = req.params;

      const footerSection = await footerSectionService.getById(id);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Footer section retrieved successfully',
        { data: footerSection.footer, id: footerSection._id }, // Return footer data directly instead of entire document
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.NOT_FOUND, error.message);
    }
  }

  /**
   * Create or update CTA section (singleton: no section id required).
   * Creates footer with CTA if none exists; otherwise updates footer.cta.
   * @param {Object} req - Express request object (body: { cta: { title, subtitle, benefits? } } or direct cta object)
   * @param {Object} res - Express response object
   */
  static async createOrUpdateCTASection(req, res) {
    try {
      const ctaData = req.body.cta ?? req.body;

      if (!ctaData) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'CTA data is required',
        );
      }

      const result =
        await footerSectionService.createOrUpdateCTASection(ctaData);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        result.footer?.links?.length
          ? 'CTA section updated successfully'
          : 'Footer section with CTA created successfully',
        { data: result.footer, id: result._id },
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  /**
   * Append new links to existing footer links
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async appendFooterLinks(req, res) {
    try {
      const { sectionId } = req.params;
      const linkData = req.body;

      // Only check presence of body - detailed validation in service
      if (!linkData) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Link data is required',
        );
      }

      const updatedFooterSection = await footerSectionService.appendFooterLinks(
        sectionId,
        linkData,
      );

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Footer link added successfully',
        {
          data: updatedFooterSection.footer,
          id: updatedFooterSection._id,
          addedLink: linkData,
          totalLinks: updatedFooterSection.footer.links.length,
        },
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  /**
   * Remove a specific footer link by its ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async removeFooterLink(req, res) {
    try {
      const { linkId } = req.params;

      if (!linkId) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Link ID is required',
        );
      }

      const updatedFooterSection =
        await footerSectionService.removeFooterLink(linkId);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Footer link removed successfully',
        {
          data: updatedFooterSection.footer,
          id: updatedFooterSection._id,
          removedLinkId: linkId,
          remainingLinks: updatedFooterSection.footer.links.length,
        },
      );
    } catch (error) {
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }

  /**
   * Update a specific footer link by its ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async updateFooterLink(req, res) {
    try {
      const { linkId } = req.params;
      const linkData = req.body;

      // Only check presence of body - detailed validation in service
      if (!linkData) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Link data is required',
        );
      }

      const updatedFooterSection = await footerSectionService.updateFooterLink(
        linkId,
        linkData,
      );

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Footer link updated successfully',
        {
          data: updatedFooterSection.footer,
          id: updatedFooterSection._id,
          updatedLinkId: linkId,
        },
      );
    } catch (error) {
      console.log("Error in updating footer link: ", error);
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, error.message);
    }
  }
}

export default FooterSectionController;
