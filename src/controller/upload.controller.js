import { StatusCodes } from 'http-status-codes';
import { ResponseService } from '../utils/index.js';

class UploadController {
  /**
   * Get folder name based on fieldname
   * Matches the logic in multer.services.js
   */
  static getFolderFromFieldname(fieldname = '') {
    const normalizedField = String(fieldname || '').trim();
    const baseField = normalizedField.split('_')[0];
    const folderMap = {
      profilePicture: 'profileImages',
      businessImage: 'businessImages',
      businessLogo: 'businessLogos',
      businessBanner: 'businessBanners',
      themeBanner: 'themeBanners',
      storeImage: 'storeImages',
      productImage: 'productImages',
      image: 'productImages',
      brandImage: 'brandImages',
      blogImage: 'blogImages',
      heroImage: 'heroImages',
      subCategoryImage: 'subCategoryImages',
      overviewImage: 'dashboardImages',
      invoicePdf: 'invoices',
      invoiceDocument: 'invoicesDocuments',
      darkLogo: 'generalSettings/logos',
      lightLogo: 'generalSettings/logos',
      favicon: 'generalSettings/logos',
      collapsDarkLogo: 'generalSettings/logos',
      collapsLightLogo: 'generalSettings/logos',
      seoImage: 'seoSettings/images',
      url: 'seoSettings/images',
      mediaFile: 'ad',
      supplierImage: 'supplierImages',
      ragDocument: 'ragDocuments',
      giftCardImage: 'giftCardImages',
      variantImage: 'productImages',
      file: 'others', // Default for generic 'file' fieldname
    };

    return folderMap[normalizedField] || folderMap[baseField] || 'others';
  }

  /**
   * Get resource type based on fieldname
   * Matches the logic in multer.services.js
   */
  static getResourceTypeFromFieldname(fieldname = '') {
    const normalizedField = String(fieldname || '').trim();
    const baseField = normalizedField.split('_')[0];
    const rawTypes = ['invoicePdf', 'invoiceDocument', 'ragDocument'];
    const imageTypes = [
      'profilePicture',
      'businessImage',
      'businessLogo',
      'businessBanner',
      'themeBanner',
      'storeImage',
      'productImage',
      'image',
      'brandImage',
      'blogImage',
      'subCategoryImage',
      'overviewImage',
      'darkLogo',
      'lightLogo',
      'favicon',
      'collapsDarkLogo',
      'collapsLightLogo',
      'seoImage',
      'url',
      'supplierImage',
      'giftCardImage',
      'variantImage',
    ];

    if (rawTypes.includes(normalizedField) || rawTypes.includes(baseField)) {
      return 'raw';
    }
    if (
      imageTypes.includes(normalizedField) ||
      imageTypes.includes(baseField)
    ) {
      return 'image';
    }
    return 'auto';
  }

  /**
   * Single file upload
   * Automatically identifies the right Cloudinary folder based on fieldname
   * Accessible by admin and superadmin
   *
   * @description
   * Upload a single file using multipart/form-data.
   * The fieldname determines which Cloudinary folder the file is uploaded to.
   *
   * @payload
   * Content-Type: multipart/form-data
   * Body: Form data with a single file field
   *
   * @example
   * // Upload a product image
   * POST /admin/upload
   * Content-Type: multipart/form-data
   * Form field: productImage (file)
   *
   * // Upload a store image
   * POST /admin/upload
   * Content-Type: multipart/form-data
   * Form field: storeImage (file)
   *
   * // Upload a profile picture
   * POST /admin/upload
   * Content-Type: multipart/form-data
   * Form field: profilePicture (file)
   *
   * // Upload an invoice PDF
   * POST /admin/upload
   * Content-Type: multipart/form-data
   * Form field: invoicePdf (file)
   *
   * @response
   * {
   *   "success": true,
   *   "message": "File uploaded successfully",
   *   "data": {
   *     "url": "https://res.cloudinary.com/...",
   *     "publicId": "1234567890-filename",
   *     "secureUrl": "https://res.cloudinary.com/...",
   *     "originalName": "image.jpg",
   *     "fieldname": "productImage",
   *     "mimetype": "image/jpeg",
   *     "size": 123456,
   *     "resourceType": "image",
   *     "folder": "productImages"
   *   }
   * }
   *
   * @supportedFieldnames
   * - productImage, image, variantImage, variantImage_* → productImages folder
   * - storeImage → storeImages folder
   * - profilePicture → profileImages folder
   * - businessImage → businessImages folder
   * - businessLogo → businessLogos folder
   * - businessBanner → businessBanners folder
   * - brandImage → brandImages folder
   * - blogImage → blogImages folder
   * - subCategoryImage → subCategoryImages folder
   * - supplierImage → supplierImages folder
   * - invoicePdf → invoices folder
   * - invoiceDocument → invoicesDocuments folder
   * - ragDocument → ragDocuments folder
   * - mediaFile  ad folder
   * - heroImage → heroImages folder
   * - overviewImage → dashboardImages folder
   * - darkLogo, lightLogo, favicon, collapsDarkLogo, collapsLightLogo → generalSettings/logos folder
   * - seoImage, url → seoSettings/images folder
   * - file → others folder (default)
   * - Any other fieldname → others folder
   */
  static async uploadSingle(req, res) {
    try {
      // Handle both req.file (from upload.single) and req.files (from upload.any)
      let file;

      if (req.file) {
        file = req.file;
        console.log('Single file uploaded:', file);
      } else if (req.files && req.files.length > 0) {
        // If multiple files uploaded, take the first one
        if (req.files.length > 1) {
          return ResponseService.send(
            res,
            StatusCodes.BAD_REQUEST,
            'Multiple files detected. Use /upload/multiple endpoint for multiple file uploads.',
          );
        }
        file = Array.isArray(req.files)
          ? req.files[0]
          : req.files[Object.keys(req.files)[0]];
      } else if (req.files && Object.keys(req.files).length > 0) {
        // Handle object format from upload.any()
        const fieldnames = Object.keys(req.files);
        if (fieldnames.length > 1) {
          return ResponseService.send(
            res,
            StatusCodes.BAD_REQUEST,
            'Multiple file fields detected. Use /upload/multiple endpoint for multiple file uploads.',
          );
        }
        const files = req.files[fieldnames[0]];
        file = Array.isArray(files) ? files[0] : files;
      } else {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'No file uploaded',
        );
      }

      if (!file) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'No file uploaded',
        );
      }
      const folder = UploadController.getFolderFromFieldname(file.fieldname);
      const resourceType = UploadController.getResourceTypeFromFieldname(
        file.fieldname,
      );

      // CloudinaryStorage provides public_id and secure_url, not filename
      const result = {
        url: file.path || file.secure_url,
        publicId: file.public_id || file.filename,
        secureUrl: file.secure_url || file.path,
        originalName: file.originalname,
        fieldname: file.fieldname,
        mimetype: file.mimetype,
        size: file.size,
        resourceType,
        folder,
      };

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'File uploaded successfully',
        result,
      );
    } catch (error) {
      console.error('Upload error:', error.message || error);
      console.error('Stack trace:', error.stack);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to upload file',
      );
    }
  }

  /**
   * Multiple files upload
   * Automatically identifies the right Cloudinary folder based on fieldname
   * Accessible by admin and superadmin
   */
  static async uploadMultiple(req, res) {
    try {
      if (!req.files || Object.keys(req.files).length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'No files uploaded',
        );
      }

      const results = {};
      const fileFields = req.files;

      // Process each field
      for (const [fieldname, files] of Object.entries(fileFields)) {
        // Handle both single file and array of files
        const fileArray = Array.isArray(files) ? files : [files];
        const folder = UploadController.getFolderFromFieldname(fieldname);
        const resourceType =
          UploadController.getResourceTypeFromFieldname(fieldname);

        results[fieldname] = fileArray.map((file) => ({
          url: file.path || file.secure_url,
          publicId: file.public_id || file.filename,
          secureUrl: file.secure_url || file.path,
          originalName: file.originalname,
          fieldname: file.fieldname,
          mimetype: file.mimetype,
          size: file.size,
          resourceType,
          folder,
        }));
      }

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Files uploaded successfully',
        results,
      );
    } catch (error) {
      console.error('Upload error:', error.message || error);
      console.error('Stack trace:', error.stack);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to upload files',
      );
    }
  }
}

export default UploadController;
