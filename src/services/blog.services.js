import { BaseService } from '../utils/index.js';
import { Blog } from '../models/index.js';
import { deleteImage } from '../utils/index.js';

class BlogServices extends BaseService {
  constructor() {
    super(Blog);
  }

  /**
   * Create a new blog post
   * @param {Object} data - Blog data
   * @returns {Object} Created blog
   */
  async createBlog(data) {
    try {
      const blogData = {
        ...data,
        tags: data.tags || [],
      };

      const blog = await this.create(blogData);
      return blog;
    } catch (error) {
      throw new Error(error.message);
    }
  }

  /**
   * Get all blogs with filtering and pagination
   * @param {Object} queryParams - Query parameters
   * @returns {Object} Paginated blog results
   */
  async getAllBlogs(queryParams = {}) {
    try {
      const {
        page,
        limit,
        search,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        tags,
        isPublished,
        createdBy,
      } = queryParams;

      // Build query filters
      const filters = {};

      if (isPublished !== undefined) {
        filters.isPublished = isPublished === true;
      }

      if (createdBy) {
        filters.createdBy = createdBy;
      }

      if (tags) {
        const tagArray = tags.split(',').map((tag) => tag.trim().toLowerCase());
        filters.tags = { $in: tagArray };
      }

      // Build search query
      let searchQuery = {};
      if (search) {
        searchQuery = {
          $or: [
            { title: { $regex: search, $options: 'i' } },
            { overview: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
            { tags: { $in: [new RegExp(search, 'i')] } },
          ],
        };
      }

      // Combine filters and search
      const finalQuery = { ...filters, ...searchQuery };

      // Build sort object
      const sort = {};
      sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

      // Get paginated results with author population
      const result = await this.findWithPagination(
        finalQuery,
        page,
        limit,
        sort,
        {
          path: 'createdBy',
          select: 'name email profilePicture',
        },
      );

      return result;
    } catch (error) {
      throw new Error(error.message);
    }
  }

  /**
   * Get published blogs for public access
   * @param {Object} queryParams - Query parameters
   * @returns {Object} Paginated published blog results
   */
  async getPublishedBlogs() {
    try {
      const Blog = await this.model
        .find({ isPublished: true })
        .populate('createdBy', 'name email profilePicture');
      return Blog;
    } catch (error) {
      throw new Error(error.message);
    }
  }

  /**
   * Get blog by slug
   * @param {String} slug - Blog slug
   * @returns {Object} Blog with author details
   */
  async getBlogBySlug(slug) {
    try {
      // Get blog and increment views in parallel for better performance
      const [blog, updatedBlog] = await Promise.all([
        this.model
          .findOne({
            slug,
            isPublished: true,
          })
          .populate('createdBy', 'name email profilePicture'),
        this.model
          .findOneAndUpdate(
            { slug, isPublished: true },
            { $inc: { views: 1 } },
            { new: true },
          )
          .populate('createdBy', 'name email profilePicture'),
      ]);

      if (!blog) {
        throw new Error('Blog not found');
      }

      // Return the updated blog with incremented views
      return updatedBlog || blog;
    } catch (error) {
      throw new Error(error.message);
    }
  }

  /**
   * Update blog post
   * @param {String} id - Blog ID
   * @param {Object} data - Update data
   * @returns {Object} Updated blog
   */
  async updateBlog(id, data) {
    try {
      // If there's a new image, handle image operations in parallel
      if (data.blogImage) {
        // Get existing blog and update in parallel
        const [existingBlog, updatedBlog] = await Promise.all([
          this.getById(id),
          this.updateById(id, data),
        ]);

        // If old image exists and is different, delete it in background (non-blocking)
        if (
          existingBlog &&
          existingBlog.blogImage &&
          existingBlog.blogImage !== data.blogImage
        ) {
          // Fire and forget - don't wait for image deletion
          deleteImage(existingBlog.blogImage, 'blogImages').catch((err) =>
            console.error('Failed to delete old image:', err),
          );
        }

        // Return populated blog without waiting for image deletion
        return await this.getByIdAndPopulate(updatedBlog._id, 'createdBy');
      } else {
        // No image update, just update and populate
        const updatedBlog = await this.updateById(id, data);
        return await this.getByIdAndPopulate(updatedBlog._id, 'createdBy');
      }
    } catch (error) {
      throw new Error(error.message);
    }
  }

  /**
   * Publish/Unpublish blog
   * @param {String} id - Blog ID
   * @param {Boolean} isPublished - Publish status
   * @returns {Object} Updated blog
   */
  async togglePublishStatus(id, isPublished) {
    try {
      // Update and populate in parallel for better performance
      const [updatedBlog, populatedBlog] = await Promise.all([
        this.updateById(id, { isPublished }),
        this.model
          .findByIdAndUpdate(id, { isPublished }, { new: true })
          .populate('createdBy', 'name email profilePicture'),
      ]);

      return populatedBlog;
    } catch (error) {
      throw new Error(error.message);
    }
  }

  /**
   * Get popular blogs (by views)
   * @param {Number} limit - Number of blogs to return
   * @returns {Array} Popular blogs
   */
  async getPopularBlogs(limit = 5) {
    try {
      return await this.model
        .find({ isPublished: true })
        .sort({ views: -1, createdAt: -1 })
        .limit(limit)
        .populate('createdBy', 'name email profilePicture');
    } catch (error) {
      throw new Error(error.message);
    }
  }

  /**
   * Get blogs by tags
   * @param {Array} tags - Array of tags
   * @param {Number} limit - Number of blogs to return
   * @returns {Array} Blogs with matching tags
   */
  async getBlogsByTags(tags, limit = 10) {
    try {
      const tagArray = Array.isArray(tags) ? tags : [tags];
      return await this.model
        .find({
          tags: { $in: tagArray.map((tag) => tag.toLowerCase()) },
          isPublished: true,
        })
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('createdBy', 'name email profilePicture');
    } catch (error) {
      throw new Error(error.message);
    }
  }

  /**
   * Delete blog and its associated image
   * @param {String} id - Blog ID
   * @returns {Object} Deleted blog
   */
  async deleteBlogWithImage(id) {
    try {
      const blog = await this.getById(id);
      if (!blog) {
        throw new Error('Blog not found');
      }

      // Delete blog and image in parallel for better performance
      const [deletedBlog] = await Promise.all([
        this.deleteById(id),
        // If image exists, delete it in parallel (non-blocking)
        blog.blogImage
          ? deleteImage(blog.blogImage, 'blogImages').catch((err) =>
              console.error('Failed to delete image:', err),
            )
          : Promise.resolve(),
      ]);

      return deletedBlog;
    } catch (error) {
      throw new Error(error.message);
    }
  }

  /**
   * Get blog statistics for dashboard (optimized)
   * @returns {Object} Blog statistics
   */
  async getBlogStats() {
    try {
      // Use aggregation pipeline for better performance
      const stats = await this.model.aggregate([
        {
          $facet: {
            total: [{ $count: 'count' }],
            published: [{ $match: { isPublished: true } }, { $count: 'count' }],
            draft: [{ $match: { isPublished: false } }, { $count: 'count' }],
            totalViews: [{ $group: { _id: null, total: { $sum: '$views' } } }],
            avgViews: [{ $group: { _id: null, avg: { $avg: '$views' } } }],
          },
        },
      ]);

      return {
        total: stats[0].total[0]?.count || 0,
        published: stats[0].published[0]?.count || 0,
        draft: stats[0].draft[0]?.count || 0,
        totalViews: stats[0].totalViews[0]?.total || 0,
        avgViews: Math.round(stats[0].avgViews[0]?.avg || 0),
      };
    } catch (error) {
      throw new Error(error.message);
    }
  }

  /**
   * Bulk update the status field for multiple blogs
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
   * Bulk delete blogs by ids (with image cleanup)
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

    // Get blogs with images for cleanup
    const blogsWithImages = await Model.find(
      { _id: { $in: ids }, blogImage: { $exists: true, $ne: null } },
      { blogImage: 1 },
    );

    // Delete blogs
    const result = await Model.deleteMany(
      { _id: { $in: ids } },
      { session: options.session || undefined },
    );

    // Clean up images in background (non-blocking)
    if (blogsWithImages.length > 0) {
      const imageCleanupPromises = blogsWithImages.map((blog) =>
        deleteImage(blog.blogImage, 'blogImages').catch((err) =>
          console.error('Failed to delete blog image:', err),
        ),
      );
      Promise.all(imageCleanupPromises);
    }

    return { deletedCount: result.deletedCount || 0 };
  }
}

export default BlogServices;
