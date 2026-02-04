import { BaseService } from '../utils/index.js';
import { Faq, FaqCategory } from '../models/index.js';

class FaqServices extends BaseService {
  constructor() {
    super(Faq);
  }

  async list(queryParams = {}) {
    const { isPublished, categoryId, ...otherParams } = queryParams;

    // Define search fields for Faq
    const searchFields = ['question', 'answer'];

    // Build filters object
    const filters = {};

    if (isPublished !== undefined) {
      filters.isPublished = isPublished === 'true';
    }

    if (categoryId) {
      filters.categoryId = categoryId;
    }

    // Use BaseService list method with Faq specific configuration
    const result = await super.list({
      ...otherParams,
      searchFields,
      filters,
      sortBy: otherParams.sortBy || 'createdAt',
      sortOrder: otherParams.sortOrder || 'desc',
    });

    // Populate category information while preserving the original sort order
    if (result.data && result.data.length > 0) {
      const Model = await this.getModelRef();
      await Model.populate(result.data, {
        path: 'categoryId',
        select: 'categoryName status',
      });

      result.data.sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
      );
    }

    return result;
  }

  async getBySlug(slug) {
    try {
      const faq = await this.model
        .findOne({ slug })
        .populate('categoryId', 'categoryName status');
      if (!faq) {
        throw new Error(`FAQ with slug ${slug} not found`);
      }
      return faq;
    } catch (error) {
      throw new Error(`Error retrieving FAQ: ${error.message}`);
    }
  }

  /**
   * Fetch only published FAQs that belong to active (non-deleted) categories
   * and return them sorted by newest first. Used by public routes.
   */
  async getActiveFaqsFromActiveCategories() {
    try {
      const activeCategoryIds = await FaqCategory.distinct('_id', {
        status: true,
        isDeleted: false,
      });

      if (!activeCategoryIds.length) {
        return [];
      }

      const Model = await this.getModelRef();
      const faqs = await Model.find({
        isPublished: true,
        categoryId: { $in: activeCategoryIds },
      })
        .sort({ createdAt: -1 })
        .populate('categoryId', 'categoryName status')
        .lean();

      return faqs;
    } catch (error) {
      throw new Error(
        `Error retrieving active FAQs from active categories: ${error.message}`,
      );
    }
  }

  /**
   * Bulk update the status field for multiple FAQs
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
    const update = { $set: { isPublished: status } };
    const filter = { _id: { $in: ids } };

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
   * Bulk delete FAQs by ids
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
    const result = await Model.deleteMany(
      { _id: { $in: ids } },
      { session: options.session || undefined },
    );

    return { deletedCount: result.deletedCount || 0 };
  }
}

export default FaqServices;
