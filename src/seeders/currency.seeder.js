import { Currency } from '../models/index.js';

export const seedDefaultCurrencies = async function seedDefaultCurrencies() {
  try {
    // Check if currencies already exist
    const existingCurrencies = await Currency.find({}).lean();
    if (existingCurrencies && existingCurrencies.length > 0) {
      return;
    }

    // Create default currencies
    const defaultCurrencies = [
      {
        currencyName: 'Indian Rupee',
        currencyCode: 'INR',
        currencySymbol: '₹',
        currencyPosition: 'Left',
        thousandSeparator: ',',
        decimalSeparator: '.',
        numberOfDecimals: 2,
        isPrimary: true,
      },
      {
        currencyName: 'US Dollar',
        currencyCode: 'USD',
        currencySymbol: '$',
        currencyPosition: 'Left',
        thousandSeparator: ',',
        decimalSeparator: '.',
        numberOfDecimals: 2,
        isPrimary: false,
      },
      {
        currencyName: 'Euro',
        currencyCode: 'EUR',
        currencySymbol: '€',
        currencyPosition: 'Left',
        thousandSeparator: ',',
        decimalSeparator: '.',
        numberOfDecimals: 2,
        isPrimary: false,
      },
    ];

    await Currency.insertMany(defaultCurrencies);
    console.log('Default currencies seeded successfully');
  } catch (error) {
    console.error('Error seeding default currencies:', error);
  }
};
