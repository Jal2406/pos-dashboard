import mongoose from 'mongoose';

/**
 * Utility class for handling MongoDB transactions with retry logic
 */
class TransactionUtils {
  /**
   * Execute a function with retry logic for MongoDB transient transaction errors
   * @param {Function} operation - The operation to execute
   * @param {Object} options - Retry options
   * @returns {Promise<any>} Operation result
   */
  static async executeWithRetry(operation, options = {}) {
    const {
      maxRetries = 3,
      baseDelay = 1000,
      maxDelay = 5000,
      backoffMultiplier = 2,
    } = options;

    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        // Check if this is a transient transaction error that we should retry
        const isTransientError = this.isTransientTransactionError(error);

        if (!isTransientError || attempt === maxRetries) {
          throw error;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          baseDelay * Math.pow(backoffMultiplier, attempt),
          maxDelay,
        );

        console.warn(
          `Transaction attempt ${
            attempt + 1
          } failed with transient error. Retrying in ${delay}ms...`,
          {
            error: error.message,
            code: error.code,
            codeName: error.codeName,
            attempt: attempt + 1,
            maxRetries,
          },
        );

        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  /**
   * Check if an error is a transient transaction error that should be retried
   * @param {Error} error - The error to check
   * @returns {boolean} True if the error is transient and should be retried
   */
  static isTransientTransactionError(error) {
    // Check for MongoDB transient transaction errors
    if (error.code === 251 || error.codeName === 'NoSuchTransaction') {
      return true;
    }

    if (error.code === 112 || error.codeName === 'WriteConflict') {
      return true;
    }

    if (error.code === 24 || error.codeName === 'LockTimeout') {
      return true;
    }

    if (error.code === 50 || error.codeName === 'MaxTimeMSExpired') {
      return true;
    }

    if (error.code === 91 || error.codeName === 'ShutdownInProgress') {
      return true;
    }

    // Check for error labels that indicate transient errors
    if (
      error.errorLabels &&
      error.errorLabels.includes('TransientTransactionError')
    ) {
      return true;
    }

    // Check for specific error messages
    const errorMessage = error.message?.toLowerCase() || '';
    if (
      errorMessage.includes('transaction') &&
      (errorMessage.includes('does not match') ||
        errorMessage.includes('in-progress') ||
        errorMessage.includes('timeout') ||
        errorMessage.includes('conflict'))
    ) {
      return true;
    }

    return false;
  }

  /**
   * Execute a transaction with automatic retry logic
   * @param {Function} transactionFn - The transaction function to execute
   * @param {Object} options - Retry options
   * @returns {Promise<any>} Transaction result
   */
  static async executeTransaction(transactionFn, options = {}) {
    return this.executeWithRetry(async () => {
      const session = await mongoose.startSession();

      try {
        let result;
        await session.withTransaction(async () => {
          result = await transactionFn(session);
        });
        return result;
      } finally {
        await session.endSession();
      }
    }, options);
  }

  /**
   * Get retry configuration for different types of operations
   * @param {string} operationType - Type of operation (payment, subscription, etc.)
   * @returns {Object} Retry configuration
   */
  static getRetryConfig(operationType = 'default') {
    const configs = {
      payment: {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 5000,
        backoffMultiplier: 2,
      },
      subscription: {
        maxRetries: 2,
        baseDelay: 500,
        maxDelay: 2000,
        backoffMultiplier: 1.5,
      },
      webhook: {
        maxRetries: 5,
        baseDelay: 2000,
        maxDelay: 10000,
        backoffMultiplier: 2,
      },
      default: {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 5000,
        backoffMultiplier: 2,
      },
    };

    return configs[operationType] || configs.default;
  }
}

export default TransactionUtils;
