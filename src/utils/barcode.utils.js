import bwipjs from 'bwip-js';
import cloudinary from '../config/cloudinaryConfig.js';
import { v4 as uuidv4 } from 'uuid';

// Pre-configured barcode options for performance & scannability
const BARCODE_OPTIONS = {
  bcid: 'code128',
  // Higher resolution & taller bars for better scanning
  scaleX: 3,
  scaleY: 3,
  height: 20, // module height in millimeters (bwip-js default units)
  // Ensure generous quiet zones around the symbol
  paddingwidth: 20,
  paddingheight: 20,
  includetext: true,
  textxalign: 'center',
  textsize: 14,
  textfont: 'monospace',
  // High-contrast, print-friendly colors
  backgroundcolor: 'FFFFFF',
  textcolor: '000000',
  barcolor: '000000',
};

// Pre-configured Cloudinary upload options
const CLOUDINARY_OPTIONS = {
  resource_type: 'image',
  folder: 'pos-barcodes',
  format: 'png',
  quality: 'auto',
  transformation: [
    // Preserve barcode proportions & quiet zones while limiting max size
    {
      width: 600,
      crop: 'limit',
      fetch_format: 'png',
    },
    { quality: 'auto:best' },
  ],
};

class BarcodeUtils {
  /**
   * Generate SKU with optimized string operations
   * @param {string} productName - The product name
   * @param {string} existingSKU - Existing SKU if provided
   * @returns {string} Generated or existing SKU
   */
  static generateSKU(productName, existingSKU = null) {
    if (existingSKU) return existingSKU.toUpperCase();

    // Handle undefined or null productName
    if (!productName || typeof productName !== 'string') {
      console.error('Invalid productName in generateSKU:', productName);
      productName = 'PROD'; // Fallback value
    }

    const timestamp = Date.now().toString().slice(-6);
    const namePrefix = productName
      .replace(/[^a-zA-Z0-9]/g, '')
      .substring(0, 4)
      .toUpperCase();
    const randomSuffix = Math.random()
      .toString(36)
      .substring(2, 6)
      .toUpperCase();

    return `${namePrefix}-${timestamp}-${randomSuffix}`;
  }

  /**
   * Generate variant SKU based on main product SKU with sequential suffix
   * @param {string} mainSKU - The main product SKU
   * @param {string} variantValue - The variant value (e.g., "Red", "Large")
   * @param {number} index - The sequential index (0-based)
   * @returns {string} Generated variant SKU
   */
  static generateVariantSKU(mainSKU, variantValue, index) {
    if (!mainSKU) {
      throw new Error('Main SKU is required to generate variant SKU');
    }

    // Clean the main SKU and create a base
    const cleanMainSKU = mainSKU.toUpperCase().trim();

    // Create a short variant prefix from variant value
    const variantPrefix = variantValue
      ? variantValue
        .replace(/[^a-zA-Z0-9]/g, '')
        .substring(0, 3)
        .toUpperCase()
      : 'VAR';

    // Generate sequential suffix (001, 002, 003, etc.)
    const sequentialSuffix = String(index + 1).padStart(3, '0');

    // Combine: MAIN-SKU-VAR-001
    return `${cleanMainSKU}-${variantPrefix}-${sequentialSuffix}`;
  }

  /**
   * Generate barcode number with optimized calculations
   * @param {string} sku - The product SKU
   * @param {string} existingBarcode - Existing barcode if provided
   * @returns {string} Generated or existing barcode
   */
  static generateBarcodeNumber(sku, existingBarcode = null) {
    if (existingBarcode) return existingBarcode;

    const timestamp = Date.now().toString().slice(-8);
    // Optimized hash calculation
    let skuHash = 0;
    for (let i = 0; i < sku.length; i++) {
      skuHash += sku.charCodeAt(i);
    }

    const baseNumber = (timestamp + skuHash.toString()).slice(0, 11);
    const barcode = baseNumber.padEnd(11, '0');

    return barcode + this.calculateCheckDigit(barcode);
  }

  /**
   * Optimized Luhn algorithm implementation
   * @param {string} barcode - The barcode without check digit
   * @returns {string} Check digit
   */
  static calculateCheckDigit(barcode) {
    let sum = 0;
    let isEven = false;

    // Process from right to left for better performance
    for (let i = barcode.length - 1; i >= 0; i--) {
      let digit = barcode.charCodeAt(i) - 48; // Direct ASCII conversion

      if (isEven) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }

      sum += digit;
      isEven = !isEven;
    }

    return ((10 - (sum % 10)) % 10).toString();
  }

  /**
   * Generate barcode image with pre-configured options
   * @param {string} barcodeNumber - The barcode number to encode
   * @returns {Promise<Buffer>} Barcode image buffer
   */
  static async generateBarcodeImage(barcodeNumber) {
    try {
      return await bwipjs.toBuffer({
        ...BARCODE_OPTIONS,
        text: barcodeNumber,
      });
    } catch (error) {
      throw new Error(`Failed to generate barcode image: ${error.message}`);
    }
  }

  /**
   * Upload barcode image to Cloudinary with optimized error handling
   * @param {Buffer} imageBuffer - The barcode image buffer
   * @param {string} sku - The product SKU for naming
   * @returns {Promise<string>} Cloudinary URL
   */
  static async uploadBarcodeToCloudinary(imageBuffer, sku) {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          ...CLOUDINARY_OPTIONS,
          public_id: `barcode-${sku}-${uuidv4()}`,
        },
        (error, result) => {
          if (error) {
            reject(
              new Error(
                `Failed to upload barcode to Cloudinary: ${error.message}`,
              ),
            );
          } else {
            resolve(result.secure_url);
          }
        },
      );

      uploadStream.end(imageBuffer);
    });
  }

  /**
   * Instant barcode generation - returns immediately with barcode number
   * Image generation and upload happens in background
   * @param {Object} productData - Product data
   * @returns {Object} Object containing barcode number and SKU (barcodeUrl will be null initially)
   */
  static generateBarcodeForProduct(productData) {
    try {
      // Check for any ClientSession objects and clean them
      const cleanedProductData = { ...productData };
      Object.keys(cleanedProductData).forEach((key) => {
        if (
          cleanedProductData[key] &&
          typeof cleanedProductData[key] === 'object' &&
          cleanedProductData[key].constructor &&
          cleanedProductData[key].constructor.name === 'ClientSession'
        ) {
          delete cleanedProductData[key];
        }
      });

      // Validate cleanedProductData
      if (!cleanedProductData || typeof cleanedProductData !== 'object') {
        throw new Error(
          'Invalid product data provided to generateBarcodeForProduct',
        );
      }

      // Clean the productData to remove any non-serializable objects
      const cleanProductData = { ...cleanedProductData };
      delete cleanProductData.session;
      delete cleanProductData._session;
      delete cleanProductData.$$session;

      // Remove any other potential non-serializable properties
      Object.keys(cleanProductData).forEach((key) => {
        if (
          typeof cleanProductData[key] === 'function' ||
          (cleanProductData[key] &&
            typeof cleanProductData[key] === 'object' &&
            cleanProductData[key].constructor &&
            cleanProductData[key].constructor.name === 'ClientSession')
        ) {
          delete cleanProductData[key];
        }
      });

      const sku = this.generateSKU(
        cleanProductData.productName,
        cleanProductData.SKU,
      );
      const barcodeNumber =
        cleanProductData.barcode || this.generateBarcodeNumber(sku);

      // Return immediately with barcode number, no image generation
      return { sku, barcode: barcodeNumber, barcodeUrl: null };
    } catch (error) {
      console.error('Error in generateBarcodeForProduct:', error);
      throw new Error(
        `Failed to generate barcode for product: ${error.message}`,
      );
    }
  }

  /**
   * Generate barcode image and upload in background
   * @param {string} barcodeNumber - The barcode number
   * @param {string} sku - The SKU for naming
   * @returns {Promise<string>} Cloudinary URL
   */
  static async generateBarcodeImageAsync(barcodeNumber, sku) {
    try {
      const barcodeImageBuffer = await this.generateBarcodeImage(barcodeNumber);
      const barcodeUrl = await this.uploadBarcodeToCloudinary(
        barcodeImageBuffer,
        sku,
      );
      return barcodeUrl;
    } catch (error) {
      console.error('Error in generateBarcodeImageAsync:', error);
      throw new Error(`Failed to generate barcode image: ${error.message}`);
    }
  }

  /**
   * Background barcode image generation with callback
   * @param {string} barcodeNumber - The barcode number
   * @param {string} sku - The SKU for naming
   * @param {Function} onComplete - Callback function when image is ready
   * @param {Function} onError - Callback function for errors
   */
  static generateBarcodeImageInBackground(
    barcodeNumber,
    sku,
    onComplete,
    onError,
  ) {
    // Start background process
    setImmediate(async () => {
      try {
        const barcodeUrl = await this.generateBarcodeImageAsync(
          barcodeNumber,
          sku,
        );
        if (onComplete) onComplete(barcodeUrl);
      } catch (error) {
        console.error(
          `Background barcode generation failed for ${sku}:`,
          error.message,
        );
        if (onError) onError(error);
      }
    });
  }

  /**
   * Optimized barcode generation with retry mechanism
   * @param {string} barcodeNumber - The barcode number to generate
   * @param {string} sku - The SKU for naming
   * @param {number} maxRetries - Maximum number of retries (default: 3)
   * @returns {Promise<Object>} Barcode data with URL
   */
  static async generateBarcodeWithRetry(barcodeNumber, sku, maxRetries = 3) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const imageBuffer = await this.generateBarcodeImage(barcodeNumber);
        const barcodeUrl = await this.uploadBarcodeToCloudinary(
          imageBuffer,
          sku,
        );

        return {
          barcode: barcodeNumber,
          barcodeUrl,
          sku,
        };
      } catch (error) {
        lastError = error;
        console.error(
          `Barcode generation attempt ${attempt} failed:`,
          error.message,
        );

        if (attempt < maxRetries) {
          // Exponential backoff
          await new Promise((resolve) =>
            setTimeout(resolve, Math.pow(2, attempt) * 1000),
          );
        }
      }
    }

    throw new Error(
      `Failed to generate barcode after ${maxRetries} attempts: ${lastError.message}`,
    );
  }

  /**
   * Optimized barcode deletion with URL parsing cache
   * @param {string} barcodeUrl - The Cloudinary URL to delete
   * @returns {Promise<boolean>} Success status
   */
  static async deleteBarcodeFromCloudinary(barcodeUrl) {
    if (!barcodeUrl) return true;

    try {
      // Optimized URL parsing
      const lastSlash = barcodeUrl.lastIndexOf('/');
      const filename = barcodeUrl.substring(lastSlash + 1);
      const publicId = `pos-barcodes/${filename.split('.')[0]}`;

      const result = await cloudinary.uploader.destroy(publicId);
      return result.result === 'ok';
    } catch (error) {
      console.error('Failed to delete barcode from Cloudinary:', error.message);
      return false;
    }
  }

  /**
   * Batch delete barcodes - enterprise optimization
   * @param {Array} barcodeUrls - Array of Cloudinary URLs to delete
   * @returns {Promise<Array>} Array of deletion results
   */
  static async deleteBarcodesBatch(barcodeUrls) {
    try {
      const promises = barcodeUrls.map((url) =>
        this.deleteBarcodeFromCloudinary(url),
      );
      return await Promise.all(promises);
    } catch (error) {
      console.error('Failed to delete barcodes batch:', error.message);
      return barcodeUrls.map(() => false);
    }
  }
}

export default BarcodeUtils;
