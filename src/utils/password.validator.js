/**
 * Password validation utility
 * Enterprise-grade password validation with configurable rules
 */
class PasswordValidator {
  /**
   * Validate password strength
   * @param {string} password - Password to validate
   * @param {Object} options - Validation options
   * @returns {Object} Validation result with isValid flag and error message
   */
  static validate(password, options = {}) {
    // Default options
    const config = {
      minLength: options.minLength || 8,
      requireUppercase: options.requireUppercase !== false,
      requireLowercase: options.requireLowercase !== false,
      requireNumbers: options.requireNumbers !== false,
      requireSpecialChars: options.requireSpecialChars !== false,
      maxLength: options.maxLength || 128,
      disallowCommonPasswords: options.disallowCommonPasswords !== false,
    };

    // Common passwords to disallow
    const commonPasswords = [
      'password',
      'password123',
      '123456',
      '12345678',
      'qwerty',
      'admin',
      'welcome',
      'admin123',
      'user',
      'user123',
    ];

    // Validation checks
    if (!password) {
      return {
        isValid: false,
        message: 'Password is required',
      };
    }

    if (password.length < config.minLength) {
      return {
        isValid: false,
        message: `Password must be at least ${config.minLength} characters long`,
      };
    }

    if (password.length > config.maxLength) {
      return {
        isValid: false,
        message: `Password cannot exceed ${config.maxLength} characters`,
      };
    }

    if (config.requireUppercase && !/[A-Z]/.test(password)) {
      return {
        isValid: false,
        message: 'Password must contain at least one uppercase letter',
      };
    }

    if (config.requireLowercase && !/[a-z]/.test(password)) {
      return {
        isValid: false,
        message: 'Password must contain at least one lowercase letter',
      };
    }

    if (config.requireNumbers && !/\d/.test(password)) {
      return {
        isValid: false,
        message: 'Password must contain at least one number',
      };
    }

    if (
      config.requireSpecialChars &&
      !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
    ) {
      return {
        isValid: false,
        message: 'Password must contain at least one special character',
      };
    }

    if (
      config.disallowCommonPasswords &&
      commonPasswords.includes(password.toLowerCase())
    ) {
      return {
        isValid: false,
        message: 'Password is too common and easily guessable',
      };
    }

    return {
      isValid: true,
      message: 'Password is valid',
    };
  }

  /**
   * Check if passwords match
   * @param {string} password - Password
   * @param {string} confirmPassword - Confirm password
   * @returns {Object} Validation result with isValid flag and error message
   */
  static passwordsMatch(password, confirmPassword) {
    if (password !== confirmPassword) {
      return {
        isValid: false,
        message: 'Passwords do not match',
      };
    }

    return {
      isValid: true,
      message: 'Passwords match',
    };
  }
}

export default PasswordValidator;
