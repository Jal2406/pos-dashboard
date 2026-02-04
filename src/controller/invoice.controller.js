import { StatusCodes } from 'http-status-codes';
import { ResponseService } from '../utils/index.js';
import { InvoiceService } from '../services/index.js';

const invoiceService = new InvoiceService();

class InvoiceController {
  /**
   * Generate invoice for subscription
   */
  static async generateForSubscription(req, res) {
    try {
      const { subscriptionId, paymentId } = req.body;

      if (!subscriptionId) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Subscription ID is required',
        );
      }

      // Get subscription data with populated fields
      const { Subscription } = await import('../models/index.js');
      const subscription = await Subscription.findById(subscriptionId)
        .populate('planName')
        .populate('user');

      if (!subscription) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Subscription not found',
        );
      }

      // Get payment data if provided
      let paymentData = null;
      if (paymentId) {
        const { Payment } = await import('../models/index.js');
        paymentData = await Payment.findById(paymentId);
      }

      const invoiceData = await invoiceService.generateAndUploadInvoice(
        subscription,
        paymentData,
      );

      return ResponseService.send(
        res,
        StatusCodes.CREATED,
        'Invoice generated successfully',
        invoiceData,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to generate invoice',
      );
    }
  }

  /**
   * Get invoice data (without PDF generation)
   */
  static async getInvoiceData(req, res) {
    try {
      const { subscriptionId, paymentId } = req.body;

      if (!subscriptionId) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Subscription ID is required',
        );
      }

      // Get subscription data with populated fields
      const { Subscription } = await import('../models/index.js');
      const subscription = await Subscription.findById(subscriptionId)
        .populate('planName')
        .populate('user');

      if (!subscription) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Subscription not found',
        );
      }

      // Get payment data if provided
      let paymentData = null;
      if (paymentId) {
        const { Payment } = await import('../models/index.js');
        paymentData = await Payment.findById(paymentId);
      }

      const invoiceData = await invoiceService.generateInvoiceData(
        subscription,
        paymentData,
      );

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Invoice data generated successfully',
        invoiceData,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to generate invoice data',
      );
    }
  }

  /**
   * Generate invoice PDF only
   */
  static async generatePDF(req, res) {
    try {
      const { subscriptionId, paymentId } = req.body;

      if (!subscriptionId) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Subscription ID is required',
        );
      }

      // Get subscription data with populated fields
      const { Subscription } = await import('../models/index.js');
      const subscription = await Subscription.findById(subscriptionId)
        .populate('planName')
        .populate('user');

      if (!subscription) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Subscription not found',
        );
      }

      // Get payment data if provided
      let paymentData = null;
      if (paymentId) {
        const { Payment } = await import('../models/index.js');
        paymentData = await Payment.findById(paymentId);
      }

      const invoiceData = await invoiceService.generateInvoiceData(
        subscription,
        paymentData,
      );
      const pdfBuffer = await invoiceService.generateInvoicePDF(invoiceData);

      // Set headers for PDF download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="invoice_${invoiceData.invoiceNumber}.pdf"`,
      );
      res.setHeader('Content-Length', pdfBuffer.length);

      return res.send(pdfBuffer);
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to generate PDF',
      );
    }
  }

  /**
   * Upload invoice PDF to Cloudinary
   */
  static async uploadToCloudinary(req, res) {
    try {
      const { subscriptionId, paymentId } = req.body;

      if (!subscriptionId) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Subscription ID is required',
        );
      }

      // Get subscription data with populated fields
      const { Subscription } = await import('../models/index.js');
      const subscription = await Subscription.findById(subscriptionId)
        .populate('planName')
        .populate('user');

      if (!subscription) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Subscription not found',
        );
      }

      // Get payment data if provided
      let paymentData = null;
      if (paymentId) {
        const { Payment } = await import('../models/index.js');
        paymentData = await Payment.findById(paymentId);
      }

      const result = await invoiceService.generateAndUploadInvoice(
        subscription,
        paymentData,
      );

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Invoice uploaded to Cloudinary successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to upload invoice',
      );
    }
  }

  /**
   * Get invoice settings
   */
  static async getSettings(req, res) {
    try {
      const settings = await invoiceService.getInvoiceSettings();

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Invoice settings fetched successfully',
        settings,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch invoice settings',
      );
    }
  }

  /**
   * Upload PDF file to Cloudinary
   */
  static async uploadPDF(req, res) {
    try {

      if (!req.file) {
        const errorDetails = {
          message: 'No PDF file uploaded',
          details: {
            contentType: req.headers['content-type'],
            bodyKeys: Object.keys(req.body || {}),
            hasFile: !!req.file,
            hasFiles: !!req.files,
            multerError: req.multerError,
          },
          instructions: {
            fieldName: 'Use "invoicePdf" or "invoiceDocument" as field name',
            contentType: 'Use multipart/form-data',
            example:
              'POST /api/v2/super-admin/invoices/upload with form-data field "invoicePdf"',
          },
        };

        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'No PDF file uploaded. Please use field name "invoicePdf" or "invoiceDocument"',
          errorDetails,
        );
      }

      const uploadResult = {
        success: true,
        message: 'PDF uploaded successfully',
        data: {
          fieldname: req.file.fieldname,
          originalname: req.file.originalname,
          filename: req.file.filename,
          path: req.file.path,
          size: req.file.size,
          mimetype: req.file.mimetype,
          cloudinaryUrl: req.file.path,
          folder: 'invoices',
        },
      };

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'PDF uploaded successfully',
        uploadResult,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        `PDF upload failed: ${error.message}`,
        null,
      );
    }
  }

  /**
   * Get all PDFs from Cloudinary invoices folder
   */
  static async getAllPDFs(req, res) {
    try {
      const cloudinary = (await import('../config/cloudinaryConfig.js'))
        .default;

      // List all resources in the invoices folder
      const result = await cloudinary.api.resources({
        type: 'upload',
        prefix: 'invoices/',
        resource_type: 'raw',
        max_results: 100,
      });

      const pdfs = result.resources.map((resource) => ({
        publicId: resource.public_id,
        url: resource.secure_url,
        filename: resource.public_id.split('/').pop(),
        size: resource.bytes,
        format: resource.format,
        createdAt: resource.created_at,
        folder: 'invoices',
      }));

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'PDFs retrieved successfully',
        {
          count: pdfs.length,
          pdfs: pdfs,
        },
      );
    } catch (error) {
      console.error('Error retrieving PDFs:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        `Failed to retrieve PDFs: ${error.message}`,
        null,
      );
    }
  }

  /**
   * Get specific PDF by public ID
   */
  static async getPDFById(req, res) {
    try {
      const { publicId } = req.params;
      const cloudinary = (await import('../config/cloudinaryConfig.js'))
        .default;

      // Get resource details
      const result = await cloudinary.api.resource(publicId, {
        resource_type: 'raw',
      });

      const pdfInfo = {
        publicId: result.public_id,
        url: result.secure_url,
        filename: result.public_id.split('/').pop(),
        size: result.bytes,
        format: result.format,
        createdAt: result.created_at,
        folder: 'invoices',
        downloadUrl: result.secure_url,
      };

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'PDF retrieved successfully',
        pdfInfo,
      );
    } catch (error) {
      console.error('Error retrieving PDF:', error);
      return ResponseService.send(
        res,
        StatusCodes.NOT_FOUND,
        `PDF not found: ${error.message}`,
        null,
      );
    }
  }

  /**
   * Download PDF by public ID
   */
  static async downloadPDF(req, res) {
    try {
      const { publicId } = req.params;
      const cloudinary = (await import('../config/cloudinaryConfig.js'))
        .default;

      // Generate download URL
      const downloadUrl = cloudinary.url(publicId, {
        resource_type: 'raw',
        flags: 'attachment',
      });

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Download URL generated successfully',
        {
          downloadUrl: downloadUrl,
          publicId: publicId,
          message: 'Use this URL to download the PDF',
        },
      );
    } catch (error) {
      console.error('Error generating download URL:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        `Failed to generate download URL: ${error.message}`,
        null,
      );
    }
  }

  /**
   * View PDF directly in browser
   */
  static async viewPDF(req, res) {
    try {
      const { publicId } = req.params;
      const cloudinary = (await import('../config/cloudinaryConfig.js'))
        .default;

      // Generate a URL that's optimized for viewing
      const viewUrl = cloudinary.url(publicId, {
        resource_type: 'raw',
        flags: 'attachment:false', // Don't force download
        secure: true,
      });

      // Redirect to the PDF URL
      res.redirect(viewUrl);
    } catch (error) {
      console.error('Error generating PDF view URL:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        `Failed to generate PDF view URL: ${error.message}`,
        null,
      );
    }
  }

  /**
   * Serve PDF with proper headers
   */
  static async servePDF(req, res) {
    try {
      const { publicId } = req.params;
      const cloudinary = (await import('../config/cloudinaryConfig.js'))
        .default;

      // Get resource details first
      const resource = await cloudinary.api.resource(publicId, {
        resource_type: 'raw',
      });

      // Generate optimized URL
      const pdfUrl = cloudinary.url(publicId, {
        resource_type: 'raw',
        secure: true,
        flags: 'attachment:false',
      });

      // Set proper headers for PDF viewing
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${resource.public_id.split('/').pop()}"`,
      );
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      // Fetch PDF from Cloudinary and stream it
      const fetch = (await import('node-fetch')).default;
      const response = await fetch(pdfUrl);

      if (!response.ok) {
        throw new Error(
          `Failed to fetch PDF from Cloudinary: ${response.statusText}`,
        );
      }

      // Stream the PDF content
      response.body.pipe(res);
    } catch (error) {
      console.error('Error serving PDF:', error);
      return ResponseService.send(
        res,
        StatusCodes.NOT_FOUND,
        `PDF not found: ${error.message}`,
        null,
      );
    }
  }

  /**
   * Get PDF URL for embedding
   */
  static async getPDFEmbedUrl(req, res) {
    try {
      const { publicId } = req.params;
      const cloudinary = (await import('../config/cloudinaryConfig.js'))
        .default;

      // Generate URL optimized for embedding
      const embedUrl = cloudinary.url(publicId, {
        resource_type: 'raw',
        secure: true,
        flags: 'attachment:false',
      });

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'PDF embed URL generated successfully',
        {
          publicId: publicId,
          embedUrl: embedUrl,
          iframeUrl: embedUrl, // Same URL for iframe embedding
          directUrl: embedUrl, // Direct access URL
          usage: {
            iframe: `<iframe src="${embedUrl}" width="100%" height="600px"></iframe>`,
            direct: `Open in new tab: <a href="${embedUrl}" target="_blank">View PDF</a>`,
            embed: `Embed in page: <embed src="${embedUrl}" type="application/pdf" width="100%" height="600px">`,
          },
        },
      );
    } catch (error) {
      console.error('Error generating embed URL:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        `Failed to generate embed URL: ${error.message}`,
        null,
      );
    }
  }

  /**
   * Delete PDF from Cloudinary
   */
  static async deletePDF(req, res) {
    try {
      const { publicId } = req.params;
      const cloudinary = (await import('../config/cloudinaryConfig.js'))
        .default;

      // Delete the resource
      const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: 'raw',
      });

      if (result.result === 'ok') {
        return ResponseService.send(
          res,
          StatusCodes.OK,
          'PDF deleted successfully',
          {
            publicId: publicId,
            deleted: true,
          },
        );
      } else {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Failed to delete PDF',
          {
            publicId: publicId,
            deleted: false,
            result: result.result,
          },
        );
      }
    } catch (error) {
      console.error('Error deleting PDF:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        `Failed to delete PDF: ${error.message}`,
        null,
      );
    }
  }

  /**
   * Generate and view PDF directly (for testing)
   */
  static async generateAndViewPDF(req, res) {
    try {
      const { subscriptionId, paymentId } = req.body;

      if (!subscriptionId) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Subscription ID is required',
          null,
        );
      }

      const { Subscription } = await import('../models/index.js');
      const subscription = await Subscription.findById(subscriptionId)
        .populate('planName')
        .populate('user');

      if (!subscription) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Subscription not found',
          null,
        );
      }

      let paymentData = null;
      if (paymentId) {
        const { Payment } = await import('../models/index.js');
        paymentData = await Payment.findById(paymentId);
      }

      const invoiceData = await invoiceService.generateInvoiceData(
        subscription,
        paymentData,
      );
      const pdfBuffer = await invoiceService.generateInvoicePDF(invoiceData);

      // Set headers for PDF viewing
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="invoice_${invoiceData.invoiceNumber}.pdf"`,
      );
      res.setHeader('Content-Length', pdfBuffer.length);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Access-Control-Allow-Origin', '*');

      return res.send(pdfBuffer);
    } catch (error) {
      console.error('Error generating PDF:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        `Error generating PDF: ${error.message}`,
        null,
      );
    }
  }
}

export default InvoiceController;
