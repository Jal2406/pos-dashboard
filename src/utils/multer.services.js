import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import path from 'node:path';
import { PassThrough } from 'node:stream';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const allowedFileTypes = [
  '.jpg', '.png', '.gif', '.jpeg', '.webp', '.svg', '.ico',
  '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm',
  '.mp3', '.wav', '.ogg', '.flac',
  '.pdf', '.txt', '.doc', '.docx', '.csv', '.json',
];


const getUploadParams = (fieldname) => {
  switch (fieldname) {
    case 'profilePicture':
      return { folder: 'profileImages', resource_type: 'image' };
    case 'businessImage':
      return { folder: 'businessImages', resource_type: 'image' };
    case 'businessLogo':
      return { folder: 'businessLogos', resource_type: 'image' };
    case 'businessBanner':
      return { folder: 'businessBanners', resource_type: 'image' };
    case 'themeBanner':
      return { folder: 'themeBanners', resource_type: 'image' };
    case 'storeImage':
      return { folder: 'storeImages', resource_type: 'image' };
    case 'productImage':
    case 'image':
      return { folder: 'productImages', resource_type: 'image' };
    case 'brandImage':
      return { folder: 'brandImages', resource_type: 'image' };
    case 'blogImage':
      return { folder: 'blogImages', resource_type: 'image' };
    case 'heroImage':
      return { folder: 'heroImages', resource_type: 'auto' };
    case 'subCategoryImage':
      return { folder: 'subCategoryImages', resource_type: 'image' };
    case 'overviewImage':
      return { folder: 'dashboardImages', resource_type: 'image' };
    case 'invoicePdf':
      return { folder: 'invoices', resource_type: 'raw' };
    case 'invoiceDocument':
      return { folder: 'invoicesDocuments', resource_type: 'raw' };
    case 'darkLogo':
    case 'lightLogo':
    case 'favicon':
    case 'collapsDarkLogo':
    case 'collapsLightLogo':
      return { folder: 'generalSettings/logos', resource_type: 'image' };
    case 'seoImage':
    case 'url':
      return { folder: 'seoSettings/images', resource_type: 'image' };
    case 'mediaFile':
      return { folder: 'advertisements/media', resource_type: 'auto' };
    case 'supplierImage':
      return { folder: 'supplierImages', resource_type: 'image' };
    case 'ragDocument':
      return { folder: 'ragDocuments', resource_type: 'raw' };
    case 'giftCardImage':
      return { folder: 'giftCardImages', resource_type: 'image' };
    default:
      return { folder: 'others', resource_type: 'auto' };
  }
};


const cloudinaryStorage = () => ({
  _handleFile(req, file, cb) {
    const { folder, resource_type } = getUploadParams(file.fieldname);

    const publicId = `${Date.now()}-${file.originalname
      .replace(/\.[^/.]+$/, '')
      .replace(/\s+/g, '_')}`;

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type,
        public_id: publicId,
      },
      (err, result) => {
        if (err) return cb(err);

        cb(null, {
          fieldname: file.fieldname,
          originalname: file.originalname,
          encoding: file.encoding,
          mimetype: file.mimetype,
          size: result.bytes,
          path: result.secure_url || result.url,
          secure_url: result.secure_url,
          url: result.url,
          public_id: result.public_id,
          filename: result.public_id,
          format: result.format,
          width: result.width,
          height: result.height,
          bytes: result.bytes,
          resource_type: result.resource_type,
          created_at: result.created_at,
          etag: result.etag,
          version: result.version,
          signature: result.signature,
        });
      },
    );

    const pass = new PassThrough();
    file.stream.pipe(pass).pipe(uploadStream);
  },

  _removeFile(req, file, cb) {
    cb(null);
  },
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!allowedFileTypes.includes(ext)) {
    return cb(new Error(`Invalid file type: ${ext}`));
  }
  cb(null, true);
};


const upload = multer({
  storage: cloudinaryStorage(),
  fileFilter,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB
});

export default upload;
