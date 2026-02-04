import { BaseService } from '../utils/index.js';
import { FaqCategory } from '../models/index.js';

class FaqCategoryServices extends BaseService {
    constructor() {
        super(FaqCategory);
    }

    /**
     * Create a new FAQ category
     * @param {Object} data - Category data
     * @returns {Promise<Object>} Created category
     */
    async create(data) {
        try {
            // Validate required fields
            this.validateRequiredFields(data, ['categoryName']);

            const created = await this.model.create(data);
            return created.toObject ? created.toObject() : created;
        } catch (error) {
            if (error.name === 'ValidationError') {
                const validationErrors = Object.values(error.errors).map(
                    (e) => e.message,
                );
                throw new Error(`Validation failed: ${validationErrors.join(', ')}`);
            }
            if (error.code === 11000) {
                const field = Object.keys(error.keyPattern || {})[0] || 'field';
                throw new Error(`${field} already exists`);
            }
            throw new Error(`Error creating FAQ category: ${error.message}`);
        }
    }

    /**
     * Get FAQ category by ID
     * @param {string} id - Category ID
     * @returns {Promise<Object>} Category data
     */
    async getById(id) {
        try {
            this.validateObjectId(id);
            const doc = await this.model.findOne({ _id: id, isDeleted: false }).lean();
            if (!doc) {
                throw new Error(`FAQ category with id ${id} not found`);
            }
            return doc;
        } catch (error) {
            throw new Error(`Error retrieving FAQ category: ${error.message}`);
        }
    }

    /**
     * Update FAQ category by ID
     * @param {string} id - Category ID
     * @param {Object} data - Update data
     * @returns {Promise<Object>} Updated category
     */
    async updateById(id, data) {
        try {
            this.validateObjectId(id);

            const updated = await this.model
                .findByIdAndUpdate(id, data, {
                    new: true,
                    runValidators: true,
                })
                .lean();

            if (!updated) {
                throw new Error(`FAQ category with id ${id} not found`);
            }

            return updated;
        } catch (error) {
            if (error.name === 'ValidationError') {
                const validationErrors = Object.values(error.errors).map(
                    (e) => e.message,
                );
                throw new Error(`Validation failed: ${validationErrors.join(', ')}`);
            }
            if (error.code === 11000) {
                const field = Object.keys(error.keyPattern || {})[0] || 'field';
                throw new Error(`${field} already exists`);
            }
            throw new Error(`Error updating FAQ category: ${error.message}`);
        }
    }

    /**
     * Soft delete FAQ category by ID
     * @param {string} id - Category ID
     * @returns {Promise<Object>} Deleted category
     */
    async deleteById(id) {
        try {
            this.validateObjectId(id);

            const deleted = await this.model.findByIdAndUpdate(
                id,
                {
                    isDeleted: true,
                    deletedAt: new Date(),
                },
                { new: true }
            );

            if (!deleted) {
                throw new Error(`FAQ category with id ${id} not found`);
            }

            return deleted;
        } catch (error) {
            throw new Error(`Error deleting FAQ category: ${error.message}`);
        }
    }

    /**
     * List FAQ categories with advanced filtering, search, and pagination
     * @param {Object} queryParams - Query parameters
     * @returns {Promise<Object>} Paginated results
     */
    async list(queryParams = {}) {
        try {
            const {
                page = 1,
                limit = 10,
                search = '',
                sortBy = 'createdAt',
                sortOrder = 'desc',
                status,
            } = queryParams;

            // Validate pagination parameters
            const validatedPage = Math.max(1, parseInt(page));
            const validatedLimit = Math.min(Math.max(1, parseInt(limit)), 100);
            const skip = (validatedPage - 1) * validatedLimit;

            // Build filter
            const filter = { isDeleted: false }; // Exclude soft-deleted categories

            // Add status filter if provided
            if (status !== undefined) {
                filter.status = status === 'true';
            }

            // Add search functionality
            if (search) {
                filter.categoryName = { $regex: search, $options: 'i' };
            }

            // Build sort object
            const sort = {};
            const allowedSortFields = [
                'categoryName',
                'status',
                'createdAt',
                'updatedAt',
            ];
            const sortField = allowedSortFields.includes(sortBy)
                ? sortBy
                : 'createdAt';
            const sortDirection = sortOrder === 'desc' ? -1 : 1;
            sort[sortField] = sortDirection;

            // Execute queries in parallel
            const [items, total] = await Promise.all([
                this.model.find(filter).sort(sort).skip(skip).limit(validatedLimit).lean(),
                this.model.countDocuments(filter),
            ]);

            return {
                data: items,
                pagination: {
                    currentPage: validatedPage,
                    totalPages: Math.ceil(total / validatedLimit),
                    totalItems: total,
                    itemsPerPage: validatedLimit,
                    hasNext: validatedPage * validatedLimit < total,
                    hasPrev: validatedPage > 1,
                },
            };
        } catch (error) {
            throw new Error(`Error listing FAQ categories: ${error.message}`);
        }
    }

    /**
     * Get all active FAQ categories (for dropdowns/selects)
     * @returns {Promise<Array>} Active categories
     */
    async getActiveCategories() {
        try {
            return await this.model
                .find({ status: true, isDeleted: false })
                .select('categoryName')
                .sort({ categoryName: 1 })
                .lean();
        } catch (error) {
            throw new Error(
                `Error retrieving active FAQ categories: ${error.message}`,
            );
        }
    }

    /**
     * Toggle category status
     * @param {string} id - Category ID
     * @returns {Promise<Object>} Updated category
     */
    async toggleStatus(id) {
        try {
            this.validateObjectId(id);

            const category = await this.model.findOne({ _id: id, isDeleted: false });
            if (!category) {
                throw new Error(`FAQ category with id ${id} not found`);
            }

            category.status = !category.status;
            await category.save();

            return category.toObject ? category.toObject() : category;
        } catch (error) {
            throw new Error(`Error toggling FAQ category status: ${error.message}`);
        }
    }

    /**
     * Bulk update the status field for multiple FAQ categories
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

        const update = { $set: { status } };
        const filter = { _id: { $in: ids }, isDeleted: false }; // Only update non-deleted categories

        const result = await this.model.updateMany(filter, update, {
            session: options.session || undefined,
            runValidators: true,
        });

        return {
            matchedCount: result.matchedCount || 0,
            modifiedCount: result.modifiedCount || 0,
        };
    }

    /**
     * Bulk soft delete FAQ categories by ids
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

        const result = await this.model.updateMany(
            { _id: { $in: ids }, isDeleted: false },
            {
                $set: {
                    isDeleted: true,
                    deletedAt: new Date(),
                },
            },
            { session: options.session || undefined },
        );

        return { deletedCount: result.modifiedCount || 0 };
    }

    /**
     * Get category statistics
     * @returns {Promise<Object>} Category statistics
     */
    async getStatistics() {
        try {
            const [total, active, inactive] = await Promise.all([
                this.model.countDocuments({ isDeleted: false }),
                this.model.countDocuments({ status: true, isDeleted: false }),
                this.model.countDocuments({ status: false, isDeleted: false }),
            ]);

            return {
                total,
                active,
                inactive,
            };
        } catch (error) {
            throw new Error(`Error retrieving category statistics: ${error.message}`);
        }
    }

    /**
     * Restore a soft-deleted FAQ category
     * @param {string} id - Category ID
     * @returns {Promise<Object>} Restored category
     */
    async restore(id) {
        try {
            this.validateObjectId(id);

            const restored = await this.model.findByIdAndUpdate(
                id,
                {
                    isDeleted: false,
                    deletedAt: null,
                },
                { new: true }
            );

            if (!restored) {
                throw new Error(`FAQ category with id ${id} not found`);
            }

            return restored;
        } catch (error) {
            throw new Error(`Error restoring FAQ category: ${error.message}`);
        }
    }
}

export default FaqCategoryServices;
