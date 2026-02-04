import { StatusCodes } from 'http-status-codes';
import { ResponseService } from '../utils/index.js';
import { BlogServices } from '../services/index.js';

const blogServices = new BlogServices();

class BlogController {
  /**
   * Create a new blog post (Superadmin only)
   */
  static async createBlog(req, res) {
    try {
      const blogData = req.body;
      // Add image URL if file was uploaded
      if (req.file) {
        // Cloudinary response structure: use path for the URL
        blogData.blogImage = req.file.path; // Use blogImage to match the model field
      }

      const newBlog = await blogServices.createBlog(blogData);
      ResponseService.send(
        res,
        StatusCodes.CREATED,
        'Blog created successfully',
        newBlog,
      );
    } catch (error) {
      ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to create blog',
      );
      console.error('Error creating blog:', error);
    }
  }

  /**
   * Get all blogs with filtering and pagination (Superadmin only)
   */
  static async getAllBlogs(req, res) {
    try {
      const queryParams = {
        page: req.query.page,
        limit: req.query.limit,
        search: req.query.search,
        sortBy: req.query.sortBy,
        sortOrder: req.query.sortOrder,
        tags: req.query.tags,
        isPublished: req.query.isPublished,
        createdBy: req.query.createdBy,
      };

      const result = await blogServices.getAllBlogs(queryParams);

      if (result && result.documents && result.documents.length > 0) {
        ResponseService.send(
          res,
          StatusCodes.OK,
          'Blogs fetched successfully',
          result,
        );
      } else {
        ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'No blogs found',
          result,
        );
      }
    } catch (error) {
      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Error fetching blogs',
      );
    }
  }

  /**
   * Get published blogs for public access (Read-only)
   */
  static async getPublishedBlogs(req, res) {
    try {
      const queryParams = {
        page: req.query.page,
        limit: req.query.limit,
        search: req.query.search,
        sortBy: req.query.sortBy,
        sortOrder: req.query.sortOrder,
        tags: req.query.tags,
      };

      const result = await blogServices.getPublishedBlogs();

      if (result) {
        ResponseService.send(
          res,
          StatusCodes.OK,
          'Published blogs fetched successfully',
          result,
        );
      } else {
        ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'No published blogs found',
          result,
        );
      }
    } catch (error) {
      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Error fetching published blogs',
      );
    }
  }

  /**
   * Get blog by ID (Superadmin only)
   */
  static async getBlogById(req, res) {
    try {
      const { id } = req.params;
      const blog = await blogServices.getByIdAndPopulate(id, 'createdBy');

      if (blog) {
        ResponseService.send(
          res,
          StatusCodes.OK,
          'Blog fetched successfully',
          blog,
        );
      } else {
        ResponseService.send(res, StatusCodes.NOT_FOUND, 'Blog not found');
      }
    } catch (error) {
      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Error fetching blog',
      );
    }
  }

  /**
   * Get published blog by slug (Public read-only)
   */
  static async getBlogBySlug(req, res) {
    try {
      const { slug } = req.params;
      const blog = await blogServices.getBlogBySlug(slug);

      if (blog) {
        ResponseService.send(
          res,
          StatusCodes.OK,
          'Blog fetched successfully',
          blog,
        );
      } else {
        ResponseService.send(res, StatusCodes.NOT_FOUND, 'Blog not found');
      }
    } catch (error) {
      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Error fetching blog',
      );
    }
  }

  /**
   * Update blog post (Superadmin only)
   */
  static async updateBlog(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      // Add image URL if file was uploaded
      if (req.file) {
        // Cloudinary response structure: use path for the URL
        updateData.blogImage = req.file.path; // Use blogImage to match the model field
      }

      const updatedBlog = await blogServices.updateBlog(id, updateData);

      if (updatedBlog) {
        ResponseService.send(
          res,
          StatusCodes.OK,
          'Blog updated successfully',
          updatedBlog,
        );
      } else {
        ResponseService.send(res, StatusCodes.NOT_FOUND, 'Blog not found');
      }
    } catch (error) {
      ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to update blog',
        console.error('Error updating blog:', error),
      );
    }
  }

  /**
   * Publish/Unpublish blog (Superadmin only)
   */
  static async togglePublishStatus(req, res) {
    try {
      const { id } = req.params;
      const { isPublished } = req.body;

      if (typeof isPublished !== 'boolean') {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'isPublished must be a boolean value',
        );
      }

      const updatedBlog = await blogServices.togglePublishStatus(
        id,
        isPublished,
      );

      if (updatedBlog) {
        const status = isPublished ? 'published' : 'unpublished';
        ResponseService.send(
          res,
          StatusCodes.OK,
          `Blog ${status} successfully`,
          updatedBlog,
        );
      } else {
        ResponseService.send(res, StatusCodes.NOT_FOUND, 'Blog not found');
      }
    } catch (error) {
      ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to update blog status',
      );
    }
  }

  /**
   * Delete blog post (Superadmin only)
   */
  static async deleteBlog(req, res) {
    try {
      const { id } = req.params;
      const deletedBlog = await blogServices.deleteBlogWithImage(id);

      if (deletedBlog) {
        ResponseService.send(
          res,
          StatusCodes.OK,
          'Blog deleted successfully',
          deletedBlog,
        );
      } else {
        ResponseService.send(res, StatusCodes.NOT_FOUND, 'Blog not found');
      }
    } catch (error) {
      ResponseService.send(
        res,
        StatusCodes.BAD_REQUEST,
        error.message || 'Failed to delete blog',
      );
    }
  }

  /**
   * Get popular blogs (Public read-only)
   */
  static async getPopularBlogs(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 5;
      const blogs = await blogServices.getPopularBlogs(limit);

      if (blogs && blogs.length > 0) {
        ResponseService.send(
          res,
          StatusCodes.OK,
          'Popular blogs fetched successfully',
          blogs,
        );
      } else {
        ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'No popular blogs found',
          blogs,
        );
      }
    } catch (error) {
      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Error fetching popular blogs',
      );
    }
  }

  /**
   * Get blogs by tags (Public read-only)
   */
  static async getBlogsByTags(req, res) {
    try {
      const { tags } = req.params;
      const limit = parseInt(req.query.limit) || 10;

      const tagArray = tags.split(',').map((tag) => tag.trim());
      const blogs = await blogServices.getBlogsByTags(tagArray, limit);

      if (blogs && blogs.length > 0) {
        ResponseService.send(
          res,
          StatusCodes.OK,
          'Blogs by tags fetched successfully',
          blogs,
        );
      } else {
        ResponseService.send(
          res,
          StatusCodes.NOT_FOUND,
          'No blogs found with these tags',
          blogs,
        );
      }
    } catch (error) {
      ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Error fetching blogs by tags',
      );
    }
  }

  // /**
  //  * Like/Unlike blog (Public read-only - for future implementation)
  //  */
  // static async toggleLike(req, res) {
  //   try {
  //     const { id } = req.params;

  //     // This is a placeholder for future implementation
  //     // You might want to track likes per user in a separate collection
  //     ResponseService.send(res, StatusCodes.OK, 'Like functionality coming soon');
  //   } catch (error) {
  //     ResponseService.send(res, StatusCodes.INTERNAL_SERVER_ERROR, 'Error toggling like');
  //   }
  // }

  static async bulkUpdateStatus(req, res) {
    try {
      const { ids, status } = req.body || {};

      if (!Array.isArray(ids) || ids.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'ids must be a non-empty array',
        );
      }
      if (typeof status !== 'boolean') {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'status must be a boolean',
        );
      }

      const result = await blogServices.bulkUpdateStatus(ids, status);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Blogs status updated successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error?.message || 'Error updating blogs status',
      );
    }
  }

  static async bulkDelete(req, res) {
    try {
      const { ids } = req.body || {};

      if (!Array.isArray(ids) || ids.length === 0) {
        return ResponseService.send(
          res,
          StatusCodes.BAD_REQUEST,
          'ids must be a non-empty array',
        );
      }

      const result = await blogServices.bulkDelete(ids);
      return ResponseService.send(
        res,
        StatusCodes.OK,
        'Blogs deleted successfully',
        result,
      );
    } catch (error) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error?.message || 'Error deleting blogs',
      );
    }
  }
}

export default BlogController;
