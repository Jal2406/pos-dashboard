import { Tax, Plan } from '../models/index.js';
import { BaseService } from '../utils/index.js';

class TaxService extends BaseService {
  constructor() {
    super(Tax);
  }

  async getAllTaxes(queryParams = {}) {
    const { status, isActive, type, all, ...otherParams } = queryParams;

    // Define search fields for Tax
    const searchFields = ['name'];

    // Build filters object
    const filters = { isDeleted: false };

    const effectiveStatus = status !== undefined ? status : isActive;
    if (effectiveStatus !== undefined) {
      filters.status = String(effectiveStatus) === 'true';
    }

    if (type) {
      filters.type = type;
    }

    // Check if non-paginated mode is requested
    if (all === 'true' || all === true) {
      // Non-paginated mode: return all data with filters and search
      const {
        search = '',
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = otherParams;

      // Build filter object
      const filter = { ...filters };

      // Add search functionality
      if (search && searchFields.length > 0) {
        filter.$or = searchFields.map((field) => ({
          [field]: { $regex: search, $options: 'i' },
        }));
      }

      // Build sort object
      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      // Get all taxes without pagination
      const Model = await this.getModelRef();
      const taxes = await Model.find(filter)
        .sort(sort)
        .exec();

      return {
        data: taxes,
        total: taxes.length,
      };
    }

    // Paginated mode: Use BaseService list method with Tax specific configuration
    return await super.list({
      ...otherParams,
      searchFields,
      filters,
    });
  }

  /**
   * Update tax by ID and recalculate totalPrice for all affected plans
   * @param {string} id - Tax ID
   * @param {Object} data - Update data
   * @param {Object} options - Optional options { session }
   * @returns {Promise<Object>} Updated tax document
   */
  async updateById(id, data, options = {}) {
    this.validateObjectId(id);

    if (!data || typeof data !== 'object') {
      throw new Error('Update data must be a valid object');
    }

    const Model = await this.getModelRef();

    // Check if tax fields that affect plan calculation are being updated
    const taxCalculationFields = ['type', 'value'];
    const affectsPlanCalculation = taxCalculationFields.some(
      (field) => field in data,
    );

    // Update the tax document
    const updatedTax = await Model.findByIdAndUpdate(
      id,
      { $set: data },
      {
        new: true,
        runValidators: true,
        session: options.session || undefined,
      },
    );

    if (!updatedTax) {
      throw new Error(`Tax with id ${id} not found`);
    }

    // If tax calculation fields were updated, recalculate totalPrice for all affected plans
    if (affectsPlanCalculation) {
      // Find all plans that reference this tax
      const affectedPlans = await Plan.find({
        taxes: id,
        isDeleted: false,
      })
        .session(options.session || undefined)
        .lean();

      if (affectedPlans && affectedPlans.length > 0) {
        // Get updated tax values for calculation
        const taxType = (updatedTax.type || '').toLowerCase();
        const taxValue = Number(updatedTax.value) || 0;

        // Recalculate totalPrice for all affected plans with updated tax values
        const planUpdates = await Promise.all(
          affectedPlans.map(async (plan) => {
            // Calculate new totalPrice with updated tax
            const basePrice = Number(plan.price) || 0;
            let discountValue = Number(plan.discount) || 0;
            const discountType = (plan.discountType || 'fixed').toLowerCase();

            if (discountType === 'percentage') {
              discountValue = (basePrice * discountValue) / 100;
            }

            if (discountValue > basePrice) {
              discountValue = basePrice;
            }

            const priceAfterDiscount = Math.max(0, basePrice - discountValue);

            // Calculate tax amount with updated tax values
            let taxAmount = 0;
            if (taxType === 'percentage') {
              taxAmount = (priceAfterDiscount * taxValue) / 100;
            } else {
              taxAmount = taxValue;
            }

            const newTotalPrice = Math.max(
              0,
              Math.round((priceAfterDiscount + taxAmount) * 100) / 100,
            );

            return {
              updateOne: {
                filter: { _id: plan._id },
                update: { $set: { totalPrice: newTotalPrice } },
              },
            };
          }),
        );

        // Bulk update all plans' totalPrice
        if (planUpdates.length > 0) {
          await Plan.bulkWrite(planUpdates, {
            session: options.session || undefined,
          });
        }
      }
    }

    return updatedTax;
  }

  async deleteById(id, options = {}) {
    this.validateObjectId(id);

    const Model = await this.getModelRef();
    const update = {
      $set: {
        isDeleted: true,
        status: false,
        deletedAt: new Date(),
      },
    };

    // Execute tax deletion and plan updates in parallel for better performance
    const [updatedDocument, affectedPlans] = await Promise.all([
      Model.findOneAndUpdate({ _id: id, isDeleted: false }, update, {
        new: true,
        session: options.session || undefined,
      }).lean(),
      // Find all plans that reference this tax before removing it
      Plan.find({ tax: id, isDeleted: false })
        .session(options.session || undefined)
        .lean(),
    ]);

    if (!updatedDocument) {
      throw new Error(`Tax with id ${id} not found`);
    }

    // Remove tax from all plans and recalculate totalPrice
    if (affectedPlans && affectedPlans.length > 0) {
      // Remove tax from plans
      await Plan.updateMany(
        { tax: id, isDeleted: false },
        {
          $set: { tax: null },
        },
        {
          session: options.session || undefined,
        },
      );

      // Recalculate totalPrice for all affected plans (tax removed, so no tax amount)
      const planUpdates = await Promise.all(
        affectedPlans.map(async (plan) => {
          // Calculate new totalPrice without tax
          const basePrice = Number(plan.price) || 0;
          let discountValue = Number(plan.discount) || 0;
          const discountType = (plan.discountType || 'fixed').toLowerCase();

          if (discountType === 'percentage') {
            discountValue = (basePrice * discountValue) / 100;
          }

          if (discountValue > basePrice) {
            discountValue = basePrice;
          }

          const priceAfterDiscount = Math.max(0, basePrice - discountValue);
          // No tax amount since tax is removed
          const newTotalPrice = Math.max(
            0,
            Math.round(priceAfterDiscount * 100) / 100,
          );

          return {
            updateOne: {
              filter: { _id: plan._id },
              update: { $set: { totalPrice: newTotalPrice } },
            },
          };
        }),
      );

      // Bulk update all plans' totalPrice
      if (planUpdates.length > 0) {
        await Plan.bulkWrite(planUpdates, {
          session: options.session || undefined,
        });
      }
    }

    return updatedDocument;
  }

  /**
   * Bulk update the status field for multiple taxes
   * @param {Array<string>} ids - Array of document ObjectIds
   * @param {boolean} status - Status value to set
   * @param {Object} options - Optional options { session }
   * @returns {Promise<{ matchedCount: number, modifiedCount: number }>} Result summary
   */
  async bulkUpdateStatus(ids = [], status, options = {}) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new Error('ids must be a non-empty array');
    }
    if (typeof status !== 'boolean') {
      throw new Error('status must be a boolean');
    }

    // Validate ids format early for clearer errors
    for (const id of ids) {
      this.validateObjectId(id);
    }

    const Model = await this.getModelRef();
    const update = { $set: { status } };
    const filter = { _id: { $in: ids }, isDeleted: false };

    const result = await Model.updateMany(filter, update, {
      session: options.session || undefined,
      runValidators: true,
    });

    return {
      matchedCount: result.matchedCount || 0,
      modifiedCount: result.modifiedCount || 0,
    };
  }

  /**
   * Bulk delete taxes by ids
   * @param {Array<string>} ids - Array of document ObjectIds
   * @param {Object} options - Optional options { session }
   * @returns {Promise<{ deletedCount: number }>} Result summary
   */
  async bulkDelete(ids = [], options = {}) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new Error('ids must be a non-empty array');
    }
    for (const id of ids) {
      this.validateObjectId(id);
    }

    const Model = await this.getModelRef();
    const update = {
      $set: {
        isDeleted: true,
        status: false,
        deletedAt: new Date(),
      },
    };
    const filter = { _id: { $in: ids }, isDeleted: false };

    // Execute tax deletion and find affected plans in parallel
    const [result, affectedPlans] = await Promise.all([
      Model.updateMany(filter, update, {
        session: options.session || undefined,
      }),
      // Find all plans that reference any of the deleted taxes
      Plan.find({ tax: { $in: ids }, isDeleted: false })
        .session(options.session || undefined)
        .lean(),
    ]);

    // Remove tax from all plans and recalculate totalPrice
    if (affectedPlans && affectedPlans.length > 0) {
      // Remove tax from plans
      await Plan.updateMany(
        { tax: { $in: ids }, isDeleted: false },
        {
          $set: { tax: null },
        },
        {
          session: options.session || undefined,
        },
      );

      // Recalculate totalPrice for all affected plans (tax removed, so no tax amount)
      const planUpdates = await Promise.all(
        affectedPlans.map(async (plan) => {
          // Calculate new totalPrice without tax
          const basePrice = Number(plan.price) || 0;
          let discountValue = Number(plan.discount) || 0;
          const discountType = (plan.discountType || 'fixed').toLowerCase();

          if (discountType === 'percentage') {
            discountValue = (basePrice * discountValue) / 100;
          }

          if (discountValue > basePrice) {
            discountValue = basePrice;
          }

          const priceAfterDiscount = Math.max(0, basePrice - discountValue);
          // No tax amount since tax is removed
          const newTotalPrice = Math.max(
            0,
            Math.round(priceAfterDiscount * 100) / 100,
          );

          return {
            updateOne: {
              filter: { _id: plan._id },
              update: { $set: { totalPrice: newTotalPrice } },
            },
          };
        }),
      );

      // Bulk update all plans' totalPrice
      if (planUpdates.length > 0) {
        await Plan.bulkWrite(planUpdates, {
          session: options.session || undefined,
        });
      }
    }

    return {
      matchedCount: result.matchedCount || 0,
      deletedCount: result.modifiedCount || 0,
    };
  }

  /**
   * Bulk get taxes by IDs
   * @param {Array<string>} ids - Array of tax IDs to retrieve
   * @param {Object} options - Optional configuration
   * @param {Boolean} options.lean - Return plain JavaScript objects (default: true)
   * @param {Boolean} options.throwOnNotFound - Throw error if any ID not found (default: false)
   * @returns {Promise<Object>} Object containing:
   *   - taxes: Array of found taxes
   *   - found: Number of taxes found
   *   - notFound: Array of IDs that were not found
   *   - totalRequested: Total number of IDs requested
   */
  async bulkGetTaxes(ids, options = {}) {
    try {
      // Validate input
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('Tax IDs array is required and must not be empty');
      }

      // Extract options with defaults
      const {
        lean = true,
        throwOnNotFound = false,
      } = options;

      // Use BaseService bulkGetByIds
      const result = await this.bulkGetByIds(ids, {
        populate: null,
        lean,
        throwOnNotFound,
      });

      // Return with renamed 'documents' to 'taxes' for clarity
      return {
        data: result.documents,
        found: result.found,
        notFound: result.notFound,
        totalRequested: result.totalRequested,
      };
    } catch (error) {
      throw new Error(`Bulk get taxes failed: ${error.message}`);
    }
  }
}

export default TaxService;
