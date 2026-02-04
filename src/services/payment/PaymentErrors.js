/**
 * Custom Payment Error Classes
 * Provides specific error types for payment operations
 */

export class PaymentError extends Error {
  constructor(message, code = 'PAYMENT_ERROR', statusCode = 400) {
    super(message);
    this.name = 'PaymentError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class PaymentProviderError extends PaymentError {
  constructor(message, provider, code = 'PROVIDER_ERROR', statusCode = 502) {
    super(message, code, statusCode);
    this.name = 'PaymentProviderError';
    this.provider = provider;
  }
}

export class PaymentValidationError extends PaymentError {
  constructor(
    message,
    field = null,
    code = 'VALIDATION_ERROR',
    statusCode = 400,
  ) {
    super(message, code, statusCode);
    this.name = 'PaymentValidationError';
    this.field = field;
  }
}

export class PaymentSignatureError extends PaymentError {
  constructor(message, code = 'SIGNATURE_ERROR', statusCode = 401) {
    super(message, code, statusCode);
    this.name = 'PaymentSignatureError';
  }
}

export class PaymentConfigurationError extends PaymentError {
  constructor(
    message,
    provider,
    code = 'CONFIGURATION_ERROR',
    statusCode = 500,
  ) {
    super(message, code, statusCode);
    this.name = 'PaymentConfigurationError';
    this.provider = provider;
  }
}

export class PaymentNotFoundError extends PaymentError {
  constructor(
    message,
    paymentId = null,
    code = 'PAYMENT_NOT_FOUND',
    statusCode = 404,
  ) {
    super(message, code, statusCode);
    this.name = 'PaymentNotFoundError';
    this.paymentId = paymentId;
  }
}
