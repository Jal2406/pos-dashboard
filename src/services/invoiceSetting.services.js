import { BaseService } from '../utils/index.js';
import { InvoiceSetting } from '../models/index.js';

class InvoiceSettingServices extends BaseService {
  constructor() {
    super(InvoiceSetting);
  }

  async list(queryParams = {}) {
    const { template, ...otherParams } = queryParams;

    // Define search fields for InvoiceSetting
    const searchFields = ['invoicePrefix', 'invoiceFooterNotes'];

    // Build filters object
    const filters = {};
    if (template) {
      filters.template = template;
    }

    // Use BaseService list method with InvoiceSetting specific configuration
    return await super.list({
      ...otherParams,
      searchFields,
      filters,
    });
  }

  async getNextOrderNumber() {
    const setting = await InvoiceSetting.findOne();
    if (!setting) {
      throw new Error(
        'Invoice setting not found. Please configure invoice settings first.',
      );
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    const datePart = `${year}${month}${day}`;
    const sequentialPart = String(setting.orderStart).padStart(4, '0');

    // Use the new invoicePrefix field
    const nextOrderNumber = `${setting.invoicePrefix}-${datePart}-${sequentialPart}`;

    return {
      nextOrderNumber,
      settings: setting,
    };
  }

  async incrementOrderStart() {
    const setting = await InvoiceSetting.findOne();
    if (!setting) {
      throw new Error('Invoice setting not found');
    }

    setting.orderStart += 1;
    await setting.save();

    return setting;
  }

  async createOrUpdate(data) {
    const existingSetting = await InvoiceSetting.findOne();

    if (existingSetting) {
      // Update existing setting
      Object.assign(existingSetting, data);
      await existingSetting.save();
      return existingSetting;
    } else {
      // Create new setting
      return await super.create(data);
    }
  }
}

export default InvoiceSettingServices;
