import crypto from 'crypto';

class EncryptionUtils {
  constructor() {
    // Use environment variable for encryption key, fallback to a default for development
    this.encryptionKey =
      process.env.ENCRYPTION_KEY || 'my-super-secret-32-char-key-here-1234';

    // Ensure the key is exactly 32 characters for AES-256
    if (this.encryptionKey.length !== 32) {
      console.warn('ENCRYPTION_KEY is not 32 characters, using default key');
    }

    this.algorithm = 'aes-256-cbc';
  }

  /**
   * Encrypt a string value
   * @param {string} text - The text to encrypt
   * @returns {string} - The encrypted text in format: iv:encryptedData
   */
  encrypt(text) {
    if (!text) return text;

    try {
      const iv = crypto.randomBytes(16);
      const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
      const cipher = crypto.createCipheriv(this.algorithm, key, iv);

      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt a string value
   * @param {string} encryptedText - The encrypted text in format: iv:encryptedData
   * @returns {string} - The decrypted text
   */
  decrypt(encryptedText) {
    if (!encryptedText || !encryptedText.includes(':')) return encryptedText;

    try {
      const parts = encryptedText.split(':');
      const iv = Buffer.from(parts[0], 'hex');
      const encryptedData = parts[1];
      const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);

      const decipher = crypto.createDecipheriv(this.algorithm, key, iv);

      let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Encrypt an object's sensitive fields
   * @param {Object} obj - The object to encrypt
   * @param {Array} sensitiveFields - Array of field names to encrypt
   * @returns {Object} - Object with encrypted sensitive fields
   */
  encryptObject(obj, sensitiveFields = []) {
    if (!obj || typeof obj !== 'object') return obj;

    const encryptedObj = { ...obj };

    sensitiveFields.forEach((field) => {
      if (encryptedObj[field] && typeof encryptedObj[field] === 'string') {
        encryptedObj[field] = this.encrypt(encryptedObj[field]);
      }
    });

    return encryptedObj;
  }

  /**
   * Decrypt an object's sensitive fields
   * @param {Object} obj - The object to decrypt
   * @param {Array} sensitiveFields - Array of field names to decrypt
   * @returns {Object} - Object with decrypted sensitive fields
   */
  decryptObject(obj, sensitiveFields = []) {
    if (!obj || typeof obj !== 'object') return obj;

    const decryptedObj = { ...obj };

    sensitiveFields.forEach((field) => {
      if (decryptedObj[field] && typeof decryptedObj[field] === 'string') {
        try {
          decryptedObj[field] = this.decrypt(decryptedObj[field]);
        } catch (error) {
          // If decryption fails, assume it's not encrypted (backward compatibility)
          console.warn(`Failed to decrypt field ${field}: ${error.message}`);
        }
      }
    });

    return decryptedObj;
  }

  /**
   * Encrypt credentials object for payment gateways
   * @param {Object} credentials - The credentials object
   * @returns {Object} - Encrypted credentials object
   */
  encryptCredentials(credentials) {
    if (!credentials || typeof credentials !== 'object') return credentials;

    const sensitiveFields = [
      'secretKey',
      'apiKey',
      'saltKey',
      'secret',
      'key',
      'password',
      'appKey',
      'siteId',
      'merchantId',
      'saltId',
      'domain',
      'key_secret',
      'clientSecret',
      'privateKey',
      'publishableKey',
      'clientId',
    ];

    const encryptedCredentials = {};

    Object.keys(credentials).forEach((key) => {
      const lowerKey = key.toLowerCase();
      const isSensitive = sensitiveFields.some((field) =>
        lowerKey.includes(field.toLowerCase()),
      );

      if (isSensitive && credentials[key]) {
        encryptedCredentials[key] = this.encrypt(credentials[key]);
      } else {
        encryptedCredentials[key] = credentials[key];
      }
    });

    return encryptedCredentials;
  }

  /**
   * Decrypt credentials object for payment gateways
   * @param {Object} credentials - The encrypted credentials object
   * @returns {Object} - Decrypted credentials object
   */
  decryptCredentials(credentials) {
    if (!credentials || typeof credentials !== 'object') return credentials;

    // Handle Mongoose Map objects by converting to plain object
    let credentialsObj = credentials;
    if (credentials instanceof Map) {
      credentialsObj = Object.fromEntries(credentials);
    }
    const sensitiveFields = [
      'secretKey',
      'apiKey',
      'saltKey',
      'secret',
      'key',
      'password',
      'appKey',
      'siteId',
      'merchantId',
      'saltId',
      'domain',
      'key_secret',
      'clientSecret',
      'privateKey',
      'publishableKey',
      'clientId',
    ];

    const decryptedCredentials = {};

    Object.keys(credentialsObj).forEach((key) => {
      const lowerKey = key.toLowerCase();
      const isSensitive = sensitiveFields.some((field) =>
        lowerKey.includes(field.toLowerCase()),
      );

      if (isSensitive && credentialsObj[key]) {
        try {
          const decrypted = this.decrypt(credentialsObj[key]);
          decryptedCredentials[key] = decrypted;
        } catch (error) {
          console.warn(`❌ Failed to decrypt '${key}':`, error.message);
          // If decryption fails, assume it's not encrypted (backward compatibility)
          decryptedCredentials[key] = credentialsObj[key];
        }
      } else {
        decryptedCredentials[key] = credentialsObj[key];
      }
    });
    return decryptedCredentials;
  }

  /**
   * Get public credentials for payment operations (non-sensitive fields only)
   * @param {Object} credentials - The credentials object
   * @returns {Object} - Public credentials object
   */
  getPublicCredentials(credentials) {
    if (!credentials || typeof credentials !== 'object') return credentials;

    const publicFields = [
      'appKey',
      'publicKey',
      'publishableKey',
      'merchantId',
      'siteId',
      'clientId',
      'domain',
      'name',
      'description',
      'key_id',
      'displayName',
      'currency',
    ];

    const publicCredentials = {};

    Object.keys(credentials).forEach((key) => {
      const lowerKey = key.toLowerCase();
      const isPublic = publicFields.some((field) =>
        lowerKey.includes(field.toLowerCase()),
      );

      if (isPublic) {
        publicCredentials[key] = credentials[key];
      }
    });

    return publicCredentials;
  }
}

export default new EncryptionUtils();
