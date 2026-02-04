/**
 * Template Renderer Service
 * Dependency-free template rendering utility for replacing placeholders
 * Supports both email and in-app notification templates
 */
class TemplateRenderer {
  /**
   * Convert camelCase to snake_case
   * @param {string} str - camelCase string
   * @returns {string} snake_case string
   */
  static toSnakeCase(str) {
    return str.replace(/([A-Z])/g, '_$1').toLowerCase();
  }

  /**
   * Convert snake_case to camelCase
   * @param {string} str - snake_case string
   * @returns {string} camelCase string
   */
  static toCamelCase(str) {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  /**
   * Render a template string by replacing placeholders with context values
   * Supports both {{placeholder}} and {placeholder} syntax
   * Supports both camelCase and snake_case variable names
   * @param {string} template - Template string with {{placeholder}} or {placeholder} syntax
   * @param {Object} context - Key-value pairs for placeholder replacement
   * @returns {string} Rendered template with placeholders replaced
   */
  static render(template, context = {}) {
    if (!template || typeof template !== 'string') {
      return '';
    }

    if (!context || typeof context !== 'object') {
      return template;
    }

    // Build an expanded context that includes both camelCase and snake_case versions
    const expandedContext = this._buildExpandedContext(context);

    // First pass: Replace all {{placeholder}} with corresponding context values
    let result = template.replace(
      /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g,
      (match, key) => {
        return this._getContextValue(expandedContext, key);
      },
    );

    // Second pass: Replace all {placeholder} (single braces) with corresponding context values
    // Be careful not to match already-replaced double braces or JSON/code-like patterns
    result = result.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (match, key) => {
      return this._getContextValue(expandedContext, key);
    });

    return result;
  }

  /**
   * Build expanded context with both camelCase and snake_case versions of all keys
   * @private
   */
  static _buildExpandedContext(context) {
    const expanded = { ...context };

    for (const [key, value] of Object.entries(context)) {
      // Add snake_case version if key is camelCase
      const snakeKey = this.toSnakeCase(key);
      if (snakeKey !== key && !(snakeKey in expanded)) {
        expanded[snakeKey] = value;
      }

      // Add camelCase version if key is snake_case
      const camelKey = this.toCamelCase(key);
      if (camelKey !== key && !(camelKey in expanded)) {
        expanded[camelKey] = value;
      }
    }

    return expanded;
  }

  /**
   * Get context value for a key, trying both camelCase and snake_case
   * @private
   */
  static _getContextValue(context, key) {
    // Try direct key first
    let value = context[key];

    // If not found, try snake_case version
    if (value === null || value === undefined) {
      const snakeKey = this.toSnakeCase(key);
      value = context[snakeKey];
    }

    // If still not found, try camelCase version
    if (value === null || value === undefined) {
      const camelKey = this.toCamelCase(key);
      value = context[camelKey];
    }

    // Handle null/undefined gracefully
    if (value === null || value === undefined) {
      return '';
    }

    // Convert to string for safe rendering
    return String(value);
  }

  /**
   * Render multiple templates at once
   * @param {Object} templates - Object with template strings as values
   * @param {Object} context - Key-value pairs for placeholder replacement
   * @returns {Object} Object with same keys but rendered values
   */
  static renderMultiple(templates, context = {}) {
    if (!templates || typeof templates !== 'object') {
      return {};
    }

    const rendered = {};

    for (const [key, template] of Object.entries(templates)) {
      rendered[key] = this.render(template, context);
    }

    return rendered;
  }

  /**
   * Extract all placeholders from a template
   * Useful for validation and debugging
   * @param {string} template - Template string
   * @returns {string[]} Array of placeholder names
   */
  static extractPlaceholders(template) {
    if (!template || typeof template !== 'string') {
      return [];
    }

    const matches = template.matchAll(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g);
    return [...matches].map((match) => match[1]);
  }
}

export default TemplateRenderer;
