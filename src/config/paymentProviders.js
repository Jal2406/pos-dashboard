
export const PAYMENT_PROVIDERS = {
  razorpay: {
    name: 'Razorpay',
    requiredFields: ['key_id', 'key_secret'],
    sensitiveFields: ['key_secret'],
  },
  stripe: {
    name: 'Stripe',
    requiredFields: ['secretKey', 'appKey'],
    sensitiveFields: ['secretKey'],
  },
  paypal: {
    name: 'PayPal',
    requiredFields: ['clientId', 'clientSecret'],
    sensitiveFields: ['clientSecret'],
  },
  cinet: {
    name: 'Cinet',
    requiredFields: ['siteId', 'apiKey', 'secretKey'],
    sensitiveFields: ['apiKey', 'secretKey'],
  },
  sadad: {
    name: 'SADAD',
    requiredFields: ['siteId', 'secretKey', 'domain'],
    sensitiveFields: ['secretKey'],
  },
  airtelMoney: {
    name: 'Airtel Money',
    requiredFields: ['siteId', 'secretKey'],
    sensitiveFields: ['secretKey'],
  },
  phonePe: {
    name: 'PhonePe',
    requiredFields: ['appId', 'merchantId', 'saltId', 'saltKey'],
    sensitiveFields: ['saltKey'],
  },
  midtrans: {
    name: 'Midtrans',
    requiredFields: ['siteId'],
    sensitiveFields: [],
  },
  paystack: {
    name: 'Paystack',
    requiredFields: ['secretKey', 'appKey'],
    sensitiveFields: ['secretKey'],
  },
  flutterwave: {
    name: 'Flutterwave',
    requiredFields: ['secretKey', 'appKey'],
    sensitiveFields: ['secretKey'],
  },
};

/**
 * Get required fields for a payment provider
 * @param {string} provider - The payment provider name
 * @returns {string[]} Array of required field names
 */
export function getRequiredFieldsForProvider(provider) {
  const providerConfig = PAYMENT_PROVIDERS[provider];
  return providerConfig ? providerConfig.requiredFields : [];
}

/**
 * Get sensitive fields for a payment provider
 * @param {string} provider - The payment provider name
 * @returns {string[]} Array of sensitive field names
 */
export function getSensitiveFieldsForProvider(provider) {
  const providerConfig = PAYMENT_PROVIDERS[provider];
  return providerConfig ? providerConfig.sensitiveFields : [];
}

/**
 * Check if a field is sensitive for a provider
 * @param {string} provider - The payment provider name
 * @param {string} fieldName - The field name to check
 * @returns {boolean} True if the field is sensitive
 */
export function isFieldSensitive(provider, fieldName) {
  const sensitiveFields = getSensitiveFieldsForProvider(provider);
  return sensitiveFields.includes(fieldName);
}
