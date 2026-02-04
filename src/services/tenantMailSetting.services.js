import nodemailer from 'nodemailer';
import { BaseService } from '../utils/index.js';
import { TenantMailSettingSchema } from '../models/index.js';

const ALLOWED_FIELDS = ['email', 'host', 'port', 'password', 'encryption'];
const CACHE_TTL_MS = 30 * 1000; // 30 seconds – avoids hammering tenant DBs

class TenantMailSettingServices extends BaseService {
  constructor(businessId) {
    if (!businessId) {
      throw new Error('TenantMailSettingServices initialized without businessId');
    }
    super({
      modelName: 'TenantMailSetting',
      schema: TenantMailSettingSchema,
      collection: 'tenantmailsettings',
      businessId,
    });

    this.businessId = businessId;
    this._settingCache = null;
    this._cacheExpiresAt = 0;
  }

  _assertBusiness() {
    if (!this.businessId) {
      throw new Error('Tenant mail settings require a business context');
    }
  }

  _invalidateCache() {
    this._settingCache = null;
    this._cacheExpiresAt = 0;
  }

  async _getSettingFromCache(forceRefresh = false) {
    this._assertBusiness();
    const now = Date.now();
    if (!forceRefresh && this._settingCache && now < this._cacheExpiresAt) {
      return this._settingCache;
    }

    const Model = await this.getModel();
    const setting = await Model.findOne();
    this._settingCache = setting;
    this._cacheExpiresAt = now + CACHE_TTL_MS;
    return setting;
  }

  async getMailSetting(options = {}) {
    const { forceRefresh = false } = options;
    return this._getSettingFromCache(forceRefresh);
  }

  async createOrUpdate(data = {}, userContext = {}) {
    this._assertBusiness();
    const Model = await this.getModel();
    const payload = this._sanitizePayload(data, userContext);
    let setting;

    const existing = await Model.findOne();
    if (existing) {
      payload.updatedBy = userContext?.userId || existing.updatedBy;
      setting = await Model.findByIdAndUpdate(existing._id, payload, {
        new: true,
        runValidators: true,
      });
    } else {
      payload.createdBy = userContext?.userId || null;
      setting = await Model.create(payload);
    }

    this._invalidateCache();
    return setting;
  }

  _buildTransportOptions(setting) {
    return {
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
      connectionTimeout: 10000,
    };
  }

  async verify(userContext = {}) {
    const setting = await this.getMailSetting({ forceRefresh: true });
    if (!setting) {
      throw new Error('No tenant mail settings configured for this business');
    }

    const transporter = nodemailer.createTransport(
      this._buildTransportOptions(setting),
    );

    try {
      await transporter.verify();
      setting.isVerified = true;
      setting.lastVerifiedAt = new Date();
      setting.updatedBy = userContext?.userId || setting.updatedBy;
      await setting.save();
      this._invalidateCache();
      return setting.toSafeObject();
    } catch (error) {
      setting.isVerified = false;
      await setting.save();
      this._invalidateCache();
      throw new Error(`SMTP verification failed: ${error.message}`);
    }
  }

  async delete() {
    this._assertBusiness();
    const Model = await this.getModel();
    const result = await Model.deleteMany({});
    this._invalidateCache();
    return result;
  }

  async getMailStatus() {
    const setting = await this.getMailSetting();

    if (!setting) {
      return {
        configured: false,
        verified: false,
        message: 'No tenant mail settings configured',
      };
    }

    const isComplete = Boolean(
      setting.host && setting.port && setting.email && setting.password,
    );

    return {
      configured: isComplete,
      verified: setting.isVerified,
      lastVerified: setting.lastVerifiedAt,
      message: isComplete
        ? setting.isVerified
          ? 'Tenant mail settings verified and ready'
          : 'Tenant mail settings configured but not verified'
        : 'Tenant mail settings incomplete',
    };
  }

  _sanitizePayload(data, userContext) {
    const payload = {};

    for (const field of ALLOWED_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(data, field)) {
        payload[field] = data[field];
      }
    }

    if (payload.port !== undefined) {
      const port = Number(payload.port);
      if (Number.isNaN(port)) {
        throw new Error('Port must be a valid number');
      }
      payload.port = port;
    }

    if (payload.encryption) {
      const normalized = String(payload.encryption).toLowerCase();
      if (!['ssl', 'tls', 'none'].includes(normalized)) {
        throw new Error("Encryption must be one of: 'ssl', 'tls', 'none'");
      }
      payload.encryption = normalized;
    }

    payload.updatedBy = userContext?.userId || null;
    return payload;
  }
}

export default TenantMailSettingServices;
