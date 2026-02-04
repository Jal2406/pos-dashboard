import { StatusCodes } from 'http-status-codes';
import { ResponseService } from '../utils/index.js';
import { ProductServices, SubCategoryServices, BrandServices, VariantServices, TenantTaxService, UnitServices, StoreService, ProductCategoryServices, WarrantyServices } from '../services/index.js';


const getImageValue = (value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (
      !trimmed ||
      trimmed.toLowerCase() === 'null' ||
      trimmed.toLowerCase() === 'undefined'
    ) {
      return null;
    }
    return trimmed;
  }
  return value || null;
};

const resolveVariantImageKey = (variant = {}) => {
  const { variantValue, variantTitle } = variant;

  if (typeof variantValue === 'string' && variantValue.trim()) {
    return variantValue.trim();
  }
  if (variantValue !== undefined && variantValue !== null) {
    const numericKey = String(variantValue).trim();
    if (numericKey) {
      return numericKey;
    }
  }

  if (typeof variantTitle === 'string' && variantTitle.trim()) {
    return variantTitle.trim();
  }
  if (variantTitle !== undefined && variantTitle !== null) {
    const titleKey = String(variantTitle).trim();
    if (titleKey) {
      return titleKey;
    }
  }

  if (
    Array.isArray(variant.variantValues) &&
    variant.variantValues.length > 0
  ) {
    const combined = variant.variantValues
      .map((entry) => entry?.value || entry?.valueId)
      .filter(Boolean)
      .join('-')
      .trim();
    if (combined) {
      return combined;
    }
  }

  return null;
};

const applyVariantImages = (
  variants,
  fallbackImage,
  variantImagesByValue = {},
  variantImagesSequential = [],
) => {
  if (!Array.isArray(variants) || variants.length === 0) {
    return variants;
  }

  const normalizedFallback = getImageValue(fallbackImage);
  let seqIndex = 0;

  return variants.map((variant) => {
    const nextVariant = { ...variant };

    const existingVariantImage = getImageValue(nextVariant.variantImage);
    if (existingVariantImage) {
      nextVariant.variantImage = existingVariantImage;
      return nextVariant;
    }

    const key = resolveVariantImageKey(nextVariant);
    const mappedImage = key ? getImageValue(variantImagesByValue[key]) : null;
    if (mappedImage) {
      nextVariant.variantImage = mappedImage;
      return nextVariant;
    }

    while (
      seqIndex < variantImagesSequential.length &&
      !getImageValue(nextVariant.variantImage)
    ) {
      const sequentialImage = getImageValue(variantImagesSequential[seqIndex]);
      seqIndex += 1;
      if (sequentialImage) {
        nextVariant.variantImage = sequentialImage;
      }
    }

    if (!getImageValue(nextVariant.variantImage)) {
      const inlineImage = getImageValue(nextVariant.image);
      if (inlineImage) {
        nextVariant.variantImage = inlineImage;
      } else if (normalizedFallback) {
        nextVariant.variantImage = normalizedFallback;
      }
    }

    return nextVariant;
  });
};

class ProductController {
  static async create(req, res) {
    try {
      // Handle array payload (take first item if array)
      let productData = req.body;
      console.log("Product data: ", productData);

      if (Array.isArray(req.body)) {
        if (req.body.length > 0) {
          productData = req.body[0];
        } else {
          return ResponseService.send(
            res,
            StatusCodes.BAD_REQUEST,
            'Product data array cannot be empty'
          );
        }
      }

      // Log incoming request body keys for debugging if needed
      if (productData) {
        // Fallback: check for common misnamed fields if main field missing
        if (!productData.productImage) {
          if (productData.image) {
            productData.productImage = productData.image;
          } else if (productData.url) {
            productData.productImage = productData.url;
          }
        }
      }


      const productServices = new ProductServices(req.businessId);

      // Prepare product data with uploaded file information
      const cleanedProductData = { ...productData };
      console.log(cleanedProductData);

      // Parse JSON fields if they come as strings (FormData support)
      ['variantStocks', 'variantData', 'variantInventory'].forEach((field) => {
        if (typeof cleanedProductData[field] === 'string') {
          try {
            cleanedProductData[field] = JSON.parse(cleanedProductData[field]);
          } catch (e) {
            console.warn(`[ProductController.create] Failed to parse ${field}:`, e.message);
          }
        }
      });

      const hasVariation =
        cleanedProductData.hasVariation === true ||
        cleanedProductData.hasVariation === 'true';
      const variantImagesByValue = Object.create(null);
      const variantImagesSequential = [];
      const shouldApplyVariantImages =
        hasVariation ||
        Array.isArray(cleanedProductData.variantInventory) ||
        Array.isArray(cleanedProductData.variantData);

      // Normalize possible barcode aliases from frontend
      cleanedProductData.barcode =
        cleanedProductData.barcode ||
        cleanedProductData.productBarcode ||
        cleanedProductData.barcodeNumber ||
        null;

      // Normalize possible SKU aliases from frontend
      cleanedProductData.SKU =
        cleanedProductData.SKU ||
        cleanedProductData.productSKU ||
        null;





      if (shouldApplyVariantImages) {
        const fallbackImage = cleanedProductData.productImage;
        if (Array.isArray(cleanedProductData.variantInventory)) {
          cleanedProductData.variantInventory = applyVariantImages(
            cleanedProductData.variantInventory,
            fallbackImage,
            variantImagesByValue,
            variantImagesSequential,
          );
        }
        if (Array.isArray(cleanedProductData.variantData)) {
          cleanedProductData.variantData = applyVariantImages(
            cleanedProductData.variantData,
            fallbackImage,
            variantImagesByValue,
            variantImagesSequential,
          );
        }
      }

      // No normalization: rely on Product schema validation entirely

      // Adapt unit/weight to new structure
      if (
        cleanedProductData.unit &&
        typeof cleanedProductData.unit === 'string'
      ) {
        cleanedProductData.unit = {
          unit: cleanedProductData.unit,
          value: Number(cleanedProductData.weight || 0),
        };
      }
      delete cleanedProductData.weight;

      const created =
        await productServices.createWithBarcode(cleanedProductData);
      return ResponseService.send(
        res,
        StatusCodes.CREATED,
        'Product created successfully with barcode',
        created,
      );
    } catch (error) {
      console.error('Product creation error:', error.message);
      let message = error.message || 'Failed to create product';
      if (message.includes('productImage: Product image is required')) {
        message +=
          '. Ensure "productImage" is sent in the body (JSON) or as a file (prop name: productImage).';
      }
      return ResponseService.send(res, StatusCodes.BAD_REQUEST, message);
    }
  }

  static async list(req, res) {
    try {
      const productServices = new ProductServices(req.businessId);
      const result = await productServices.list(req.query);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Products fetched successfully',
        result,
      );
    } catch (error) {
      console.error('Product list error:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch products',
      );
    }
  }

  static async get(req, res) {
    try {
      const productServices = new ProductServices(req.businessId);
      const item = await productServices.getByIdAndPopulate(req.params.id, [
        'store',
        'category',
        'subCategory',
        'unit.unit',
        'brand',
        'tax',
        'warrantyType',
        'variantId',
      ]);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Product fetched successfully',
        item,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.NOT_FOUND,
        error.message || 'Product not found',
      );
    }
  }

  /**
   * Find product by barcode - optimized for barcode scanning
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async findByBarcode(req, res) {
    try {
      const { barcode } = req.params;

      if (
        !barcode ||
        typeof barcode !== 'string' ||
        barcode.trim().length === 0
      ) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Valid barcode is required',
          null,
        );
      }

      const productServices = new ProductServices(req.businessId);
      const product = await productServices.findByBarcode(barcode.trim());

      if (!product) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Product not found for the given barcode',
          null,
        );
      }

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Product found successfully',
        product,
      );
    } catch (error) {
      console.error('Product barcode search error:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Failed to search product by barcode',
        null,
        error.message,
      );
    }
  }

  /**
   * Find active product by barcode - only returns products with barcodes and active status
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async findActiveBarcodeByBarcode(req, res) {
    try {
      const { barcode } = req.params;

      if (
        !barcode ||
        typeof barcode !== 'string' ||
        barcode.trim().length === 0
      ) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Valid barcode is required',
          null,
        );
      }

      const productServices = new ProductServices(req.businessId);
      const product = await productServices.findActiveBarcodeByBarcode(
        barcode.trim(),
      );

      if (!product) {
        return ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'Active product with barcode not found',
          null,
        );
      }

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Active product found successfully',
        product,
      );
    } catch (error) {
      console.error('Active product barcode search error:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Failed to search active product by barcode',
        null,
        error.message,
      );
    }
  }

  /**
   * Find multiple products by barcodes - batch operation
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async findByBarcodes(req, res) {
    try {
      const { barcodes } = req.body;

      if (!Array.isArray(barcodes) || barcodes.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Valid array of barcodes is required',
          null,
        );
      }

      // Limit batch size for performance
      if (barcodes.length > 50) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Maximum 50 barcodes allowed per batch request',
          null,
        );
      }

      const productServices = new ProductServices(req.businessId);
      const products = await productServices.findByBarcodes(barcodes);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        `Found ${products.length} products out of ${barcodes.length} barcodes`,
        {
          products,
          totalRequested: barcodes.length,
          totalFound: products.length,
          notFound: barcodes.length - products.length,
        },
      );
    } catch (error) {
      console.error('Product barcodes search error:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Failed to search products by barcodes',
        null,
        error.message,
      );
    }
  }

  static async update(req, res) {
    try {
      const productServices = new ProductServices(req.businessId);

      // Prepare update data with uploaded file information
      const updateData = { ...req.body };
      console.log("Actual body: ", req.body);
      console.log("Actual updateData: ", updateData);
      // Parse JSON fields
      // if they come as strings (FormData support)
      ['variantStocks', 'variantData', 'variantInventory'].forEach((field) => {
        if (typeof updateData[field] === 'string') {
          try {
            updateData[field] = JSON.parse(updateData[field]);
          } catch (e) {
            console.warn(`[ProductController.update] Failed to parse ${field}:`, e.message);
          }
        }
      });

      // Debug: Check variantStocks availability
      if (updateData.variantStocks) {
        console.log(
          '[ProductController.update] Variant stocks present:',
          Array.isArray(updateData.variantStocks)
            ? `Array(${updateData.variantStocks.length})`
            : typeof updateData.variantStocks,
        );
      } else {
        console.log('[ProductController.update] Variant stocks MISSING from payload');
      }
      const hasVariation =
        updateData.hasVariation === true || updateData.hasVariation === 'true';
      const variantImagesByValue = Object.create(null);
      const variantImagesSequential = [];
      const shouldApplyVariantImages =
        hasVariation ||
        Array.isArray(updateData.variantInventory) ||
        Array.isArray(updateData.variantData);

      // Normalize possible barcode aliases on update
      updateData.barcode =
        updateData.barcode ||
        updateData.productBarcode ||
        updateData.barcodeNumber ||
        null;

      // Normalize possible SKU aliases on update
      updateData.SKU =
        updateData.SKU ||
        updateData.productSKU ||
        null;

      // no barcode logs on update

      // Log file processing for error tracking
      if (req.files && Object.keys(req.files).length > 0) {
        // no logging in production
      }

      // Handle uploaded files (productImage or one image per variant when hasVariation)
      if (req.files && Object.keys(req.files).length > 0) {
        // Process productImage files
        if (req.files.productImage && req.files.productImage.length > 0) {
          updateData.productImage = req.files.productImage[0].path;
        }

        // Process variantImage files
        if (req.files.variantImage && req.files.variantImage.length > 0) {
          req.files.variantImage.forEach((file) => {
            if (file.fieldname.startsWith('variantImage_')) {
              const variantValue = file.fieldname
                .slice('variantImage_'.length)
                .trim();
              if (variantValue) {
                variantImagesByValue[variantValue] = file.path;
              } else {
                variantImagesSequential.push(file.path);
              }
            } else if (file.fieldname === 'variantImage') {
              variantImagesSequential.push(file.path);
            }
          });
        }
      }

      if (shouldApplyVariantImages) {
        const fallbackImage = updateData.productImage;
        if (Array.isArray(updateData.variantInventory)) {
          updateData.variantInventory = applyVariantImages(
            updateData.variantInventory,
            fallbackImage,
            variantImagesByValue,
            variantImagesSequential,
          );
        }
        if (Array.isArray(updateData.variantData)) {
          updateData.variantData = applyVariantImages(
            updateData.variantData,
            fallbackImage,
            variantImagesByValue,
            variantImagesSequential,
          );
        }
      }

      // No normalization/sanitization on update: rely on Product schema

      // Adapt unit/weight to new structure
      if (updateData.unit) {
        // Handle JSON stringified unit object
        if (typeof updateData.unit === 'string') {
          try {
            // Try to parse as JSON first (in case it's a stringified object)
            const parsed = JSON.parse(updateData.unit);
            if (parsed && typeof parsed === 'object' && parsed.unit) {
              console.log('parsed', parsed);
              updateData.unit = {
                unit: parsed.unit,
                value: Number(parsed.value || updateData.weight || 0),
              };
            } else {
              console.log('not parsed', updateData.unit);
              // It's a plain string (unit ID), transform to object structure
              updateData.unit = {
                unit: updateData.unit,
                value: Number(updateData.weight || 0),
              };
            }
          } catch (e) {
            // Not JSON, treat as plain string (unit ID)
            updateData.unit = {
              unit: updateData.unit,
              value: Number(updateData.weight || 0),
            };
          }
        }
        // If it's already an object, ensure it has the correct structure
        else if (typeof updateData.unit === 'object' && updateData.unit.unit) {
          // Already in correct format, just ensure value is a number
          updateData.unit.value = Number(
            updateData.unit.value || updateData.weight || 0,
          );
        }
      }
      delete updateData.weight;

      // Debug: Log incoming keys to help identify missing fields
      if (req.body) {
        console.log(
          '[ProductController.update] Incoming body :',
          req.body,
        );
      }



      const updated = await productServices.updateWithBarcode(
        req.params.id,
        updateData,
      );
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Product updated successfully',
        updated,
      );
    } catch (error) {
      console.log(error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to update product',
      );
    }
  }

  static async remove(req, res) {
    try {
      const productServices = new ProductServices(req.businessId);
      const removed = await productServices.deleteWithBarcode(req.params.id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Product deleted successfully',
        removed,
      );
    } catch (error) {
      console.error('Product removal error:', error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to delete product',
      );
    }
  }

  static async toggleStatus(req, res) {
    try {
      const productServices = new ProductServices(req.businessId);
      const product = await productServices.getById(req.params.id);
      product.status = !product.status;
      await product.save();
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Product status updated successfully',
        product,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to toggle product status',
      );
    }
  }
  static async expired(req, res) {
    try {
      const productServices = new ProductServices(req.businessId);
      const items = await productServices.getExpiredProducts();
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Expired products fetched successfully',
        items,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch expired products',
      );
    }
  }
  static async active(req, res) {
    try {
      const productServices = new ProductServices(req.businessId);
      // Use list method with status filter to get active products
      // Note: list method expects status as string 'true', not boolean
      const items = await productServices.list({
        ...req.query,
        status: 'true',
        inStockOnly: 'true',
        all: true
      });
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Active products fetched successfully',
        items,
      );
    } catch (error) {
      console.log(error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch active products',
      );
    }
  }
  static async bulkDelete(req, res) {
    try {
      const productServices = new ProductServices(req.businessId);
      const { ids } = req.body; // expects array of product IDs
      const result = await productServices.bulkDelete(ids);

      return ResponseService.send(res, StatusCodes.OK, result.message, result);
    } catch (error) {
      console.error('Bulk delete error:', error);
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to bulk delete products',
      );
    }
  }

  static async bulkGet(req, res) {
    try {
      const { ids, lean, throwOnNotFound } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Product IDs array is required and must not be empty',
        );
      }

      const MAX_IDS = 100;
      if (ids.length > MAX_IDS) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          `Maximum ${MAX_IDS} product IDs allowed per request`,
        );
      }

      const productServices = new ProductServices(req.businessId);
      const result = await productServices.bulkGetProducts(ids, {
        lean,
        throwOnNotFound,
      });

      const message =
        result.found === result.totalRequested
          ? 'All products fetched successfully'
          : result.found > 0
            ? `${result.found} of ${result.totalRequested} products fetched successfully`
            : 'No products found';

      return ResponseService.send(
        res,
        result.found > 0 ? StatusCodes.OK : StatusCodes.NOT_FOUND,
        message,
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Error fetching products',
      );
    }
  }

  static async regenerateBarcode(req, res) {
    try {
      const productServices = new ProductServices(req.businessId);
      const updated = await productServices.regenerateBarcode(req.params.id);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Barcode regenerated successfully',
        updated,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to regenerate barcode',
      );
    }
  }

  // Variant-related methods removed - now handled in product creation/update

  static async getProductStats(req, res) {
    try {
      const productServices = new ProductServices(req.businessId);
      const stats = await productServices.getProductStats();

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Product statistics fetched successfully',
        stats,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch product statistics',
      );
    }
  }

  static async getLowStockProducts(req, res) {
    try {
      const productServices = new ProductServices(req.businessId);
      const products = await productServices.getLowStockProducts(req.query);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Low stock products fetched successfully',
        products,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch low stock products',
      );
    }
  }

  static async bulkUpdateStatus(req, res) {
    try {
      const { ids, status } = req.body;

      if (!ids || !Array.isArray(ids)) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Product IDs array is required',
        );
      }

      if (typeof status !== 'boolean') {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'Status must be a boolean value',
        );
      }

      const productServices = new ProductServices(req.businessId);
      const result = await productServices.bulkUpdateStatus(ids, status);

      return ResponseService.send(res, StatusCodes.OK, result.message, result);
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to bulk update product status',
      );
    }
  }

  static async getInitialProductData(req, res) {
    try {
      const businessId = req.businessId;
      console.log("businessId is : ", businessId);
      if (!businessId) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST
        );
      }

      // Instantiate services
      const subCategoryServices = new SubCategoryServices(businessId);
      const brandServices = new BrandServices(businessId);
      const variantServices = new VariantServices(businessId);
      const tenantTaxServices = new TenantTaxService(businessId);
      const unitServices = new UnitServices(businessId);
      const storeServices = new StoreService(businessId);
      const productCategoryServices = new ProductCategoryServices(businessId);
      const warrantyServices = new WarrantyServices(businessId);

      // Fetch data in parallel
      const [
        subCategories,
        brands,
        variants,
        taxes,
        units,
        stores,
        productCategories,
        warranties
      ] = await Promise.all([
        subCategoryServices.getActiveSubcategories(),
        brandServices.getActiveBrands(),
        variantServices.getActiveVariants(),
        tenantTaxServices.getActiveTaxes(),
        unitServices.getActiveUnits(),
        storeServices.getActiveStores(),
        productCategoryServices.getActiveCategories(),
        warrantyServices.getActiveWarranties()
      ]);

      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Initial data fetched successfully',
        {
          subCategories,
          brands,
          variants,
          taxes,
          units,
          stores,
          productCategories,
          warranties
        }
      );
    } catch (error) {
      console.error('Error in getInitialProductData:', error);
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch initial data',
      );
    }
  }
}

export default ProductController;
