import { BaseService } from '../utils/index.js';
import { BusinessType } from '../models/index.js';

class BusinessTypesServices extends BaseService {
  constructor() {
    super(BusinessType);
  }

  async list(queryParams = {}) {
    const {
      page = 1,
      limit = 10,
      search = '',
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = queryParams;

    const filter = {};

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [items, total] = await Promise.all([
      BusinessType.find(filter).sort(sort).skip(skip).limit(parseInt(limit)),
      BusinessType.countDocuments(filter),
    ]);

    return {
      data: items,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
    };
  }

  async listPublic() {
    return await BusinessType.find({ status: true })
      .sort({ createdAt: -1 })
      .select('title description')
      .lean();
  }

  async bulkUpdateStatus(ids = [], status, options = {}) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new Error('ids must be a non-empty array');
    }
    if (typeof status !== 'boolean') {
      throw new Error('status must be a boolean');
    }
    for (const id of ids) {
      this.validateObjectId(id);
    }

    const Model = await this.getModelRef();
    const result = await Model.updateMany(
      { _id: { $in: ids } },
      { $set: { status } },
      { session: options.session || undefined, runValidators: true },
    );

    return {
      matchedCount: result.matchedCount || 0,
      modifiedCount: result.modifiedCount || 0,
    };
  }

  async bulkUpdate(ids = [], data = {}, options = {}) {
    throw new Error('bulkUpdate has been removed');
  }

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

export default BusinessTypesServices;
