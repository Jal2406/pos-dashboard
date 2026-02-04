import { BaseService } from '../../utils/index.js';
import { NotificationTemplate } from '../../models/index.js';

class NotificationTemplateServices extends BaseService {
  constructor() {
    super(NotificationTemplate);
  }

  /**
   * Get all notification templates with pagination and search
   * @param {Object} queryParams - Query parameters
   * @returns {Object} Paginated notification templates
   */
  async getTemplates(queryParams = {}) {
    try {
      const { type, userType, status, ...rest } = queryParams;
      const filters = {};

      if (type) filters.type = type;
      if (userType) filters.to = userType; // Match if userType exists in 'to' array

      // Handle status filter (convert string to boolean)
      if (status !== undefined && status !== '') {
        filters.status = status === 'true' || status === true;
      }

      const searchFields = [
        'type',
        'label',
        'templates.notification.subject',
        'templates.email.subject',
      ];

      return await this.list({
        ...rest,
        filters,
        searchFields,
        sortBy: queryParams.sortBy || 'createdAt',
        sortOrder: queryParams.sortOrder || 'desc',
      });
    } catch (error) {
      throw new Error(`Error getting notification templates: ${error.message}`);
    }
  }

  /**
   * Create a new notification template
   * @param {Object} data - Template data
   * @returns {Object} Created template
   */
  async createTemplate(data) {
    try {
      const requiredFields = ['type', 'label', 'to', 'templates'];
      this.validateRequiredFields(data, requiredFields);
      const sanitizedData = this.validateTemplateStructure(data);

      // Check uniqueness on type only
      const existing = await this.model.findOne({
        type: data.type,
      });

      if (existing) {
        throw new Error(`Template with type '${data.type}' already exists`);
      }

      return await this.create(sanitizedData);
    } catch (error) {
      throw new Error(`Error creating notification template: ${error.message}`);
    }
  }

  /**
   * Update notification template
   * @param {String} id - Template ID
   * @param {Object} data - Update data
   * @returns {Object} Updated template
   */
  async updateTemplate(id, data) {
    try {
      const existing = await this.getById(id);
      if (!existing) {
        throw new Error('Notification template not found');
      }

      // Check uniqueness if modifying type
      if (data.type) {
        const duplicate = await this.model.findOne({
          _id: { $ne: id },
          type: data.type,
        });

        if (duplicate) {
          throw new Error(`Template with type '${data.type}' already exists`);
        }
      }

      if (data.templates || data.to) {
        const merged = { ...existing.toObject(), ...data };
        const sanitized = this.validateTemplateStructure(merged);
        data.templates = sanitized.templates;
      }

      return await this.updateById(id, data);
    } catch (error) {
      throw new Error(`Error updating notification template: ${error.message}`);
    }
  }

  /**
   * Toggle template status
   * @param {String} id - Template ID
   * @returns {Object} Updated template
   */
  async toggleStatus(id) {
    try {
      const existing = await this.getById(id);
      if (!existing) throw new Error('Template not found');

      return await this.updateById(id, { status: !existing.status });
    } catch (error) {
      throw new Error(`Error toggling status: ${error.message}`);
    }
  }
  /**
   * Validate template structure deeply and return sanitized data
   * @param {Object} data
   * @returns {Object}
   */
  validateTemplateStructure(data) {
    if (!Array.isArray(data.to) || data.to.length === 0) {
      throw new Error("'to' field must be a non-empty array of user roles");
    }

    if (!Array.isArray(data.templates)) {
      throw new Error("'templates' field must be an array");
    }

    // Validate each template has a userType that exists in 'to'
    const filteredTemplates = data.templates.filter((tmpl, index) => {
      if (!tmpl.userType) {
        throw new Error(`Template at index ${index} missing 'userType'`);
      }
      return data.to.includes(tmpl.userType);
    });

    return {
      ...data,
      templates: filteredTemplates,
    };
  }
}

export default NotificationTemplateServices;

