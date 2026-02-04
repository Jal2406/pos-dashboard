import { addYears, addMonths, addWeeks, addDays } from 'date-fns';

/**
 * Calculate expiry date based on purchase date, duration, and duration type
 * @param {Date|string} purchaseDate - The purchase/subscribe date
 * @param {number} duration - The duration value (e.g., 1, 2, 3) - must be a positive integer
 * @param {string} durationType - The type of duration ('monthly', 'yearly', 'daily', 'weekly') - case insensitive
 * @returns {Date} - The calculated expiry date
 * @throws {Error} - If purchaseDate is invalid, duration is not a positive integer, or if durationType is unsupported
 */
export const calculateExpiryDate = (purchaseDate, duration, durationType) => {
  // Validate purchaseDate
  if (!purchaseDate) {
    throw new Error('Purchase date is required');
  }

  const startDate = new Date(purchaseDate);
  if (isNaN(startDate.getTime())) {
    throw new Error('Invalid purchase date');
  }

  // Validate duration
  const durationValue = Number(duration);
  if (!Number.isInteger(durationValue) || durationValue <= 0) {
    throw new Error('Duration must be a positive integer');
  }

  // Validate durationType
  if (!durationType || typeof durationType !== 'string') {
    throw new Error('Duration type is required');
  }

  // Normalize durationType to lowercase for case-insensitive matching
  const normalizedType = durationType.toLowerCase();
  let expiryDate = new Date(startDate);

  // Calculate expiry date based on duration type
  if (normalizedType === 'yearly') {
    expiryDate = addYears(expiryDate, durationValue);
  } else if (normalizedType === 'monthly') {
    expiryDate = addMonths(expiryDate, durationValue);
  } else if (normalizedType === 'daily') {
    expiryDate = addDays(expiryDate, durationValue);
  } else if (normalizedType === 'weekly') {
    expiryDate = addWeeks(expiryDate, durationValue);
  } else {
    throw new Error(`Unsupported plan type: ${durationType}`);
  }

  return expiryDate;
};

export default calculateExpiryDate;
