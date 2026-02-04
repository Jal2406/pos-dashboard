import { BaseService } from '../utils/index.js';
import { MailSetting } from '../models/index.js';
import nodemailer from 'nodemailer';

class MailSettingServices extends BaseService {
  constructor() {
    super(MailSetting);
  }

  // Get the single mail setting
  async getMailSetting() {
    const setting = await MailSetting.findOne();
    return setting;
  }

  // Create or update mail setting (single instance)
  async createOrUpdate(data) {
    const existing = await MailSetting.findOne();

    if (existing) {
      // Update existing setting
      return await MailSetting.findByIdAndUpdate(existing._id, data, {
        new: true,
        runValidators: true,
      });
    } else {
      // Create new setting (will automatically delete any existing ones via pre-save middleware)
      return await MailSetting.create(data);
    }
  }

  // Verify the mail setting
  async verify() {
    const setting = await MailSetting.findOne();
    if (!setting) {
      throw new Error(
        'No mail setting found. Please configure mail settings first.',
      );
    }

    // Build transporter from the setting
    const transporter = nodemailer.createTransport({
      host: setting.host,
      port: setting.port,
      secure: setting.encryption === 'ssl',
      auth: {
        user: setting.email,
        pass: setting.password,
      },
      tls:
        setting.encryption === 'none'
          ? { rejectUnauthorized: false }
          : undefined,
    });

    // Verify SMTP connection
    await transporter.verify();

    // Update verification status
    setting.isVerified = true;
    setting.lastVerifiedAt = new Date();
    await setting.save();

    return setting;
  }

  // Delete mail setting
  async delete() {
    const result = await MailSetting.deleteMany({});
    return result;
  }

  // Get mail status for debugging/admin purposes
  async getMailStatus() {
    try {
      const setting = await MailSetting.findOne({}).lean();
      if (!setting) {
        return {
          configured: false,
          verified: false,
          message: 'No mail settings found',
        };
      }

      const isComplete = !!(
        setting.host &&
        setting.port &&
        setting.email &&
        setting.password
      );
      return {
        configured: isComplete,
        verified: setting.isVerified || false,
        lastVerified: setting.lastVerifiedAt || null,
        message: isComplete
          ? setting.isVerified
            ? 'Mail settings are verified and ready'
            : 'Mail settings configured but not verified'
          : 'Mail settings incomplete',
      };
    } catch (error) {
      console.error('Error getting mail status:', error);
      return {
        configured: false,
        verified: false,
        message: 'Error checking mail status',
      };
    }
  }
}

export default MailSettingServices;
