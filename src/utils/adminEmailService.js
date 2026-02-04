// services/adminEmailService.js
import nodemailer from 'nodemailer';
import { BaseService } from './index.js';
import { TenantMailSettingSchema } from '../models/index.js';

class AdminEmailService {
    constructor(businessId) {
        if (!businessId) {
            throw new Error('businessId is required for AdminEmailService');
        }
        this.businessId = businessId;
        this.baseService = new BaseService({
            modelName: 'TenantMailSetting',
            schema: TenantMailSettingSchema,
            collection: 'tenantmailsettings',
            businessId,
        });
    }

    // Check if mail settings are verified and available
    async isMailConfigured() {
        try {
            const Model = await this.baseService.getModel();
            const setting = await Model.findOne({ isVerified: true }).lean();
            return !!(
                setting &&
                setting.host &&
                setting.port &&
                setting.email &&
                setting.password
            );
        } catch (error) {
            console.error('Error checking mail configuration:', error);
            return false;
        }
    }

    // Get mail settings status for debugging/admin purposes
    async getMailStatus() {
        try {
            const Model = await this.baseService.getModel();
            const setting = await Model.findOne({}).lean();
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

    async sendEmail(to, subject, htmlContent) {
        try {
            // Get verified mail settings from tenant database
            const Model = await this.baseService.getModel();
            const setting = await Model.findOne({ isVerified: true }).lean();

            // Check if verified mail settings exist
            if (!setting) {
                throw new Error(
                    'No verified mail settings found. Please configure and verify your mail settings first.',
                );
            }

            // Verify all required fields are present
            if (
                !setting.host ||
                !setting.port ||
                !setting.email ||
                !setting.password
            ) {
                throw new Error(
                    'Incomplete mail settings. Please ensure all required fields are configured.',
                );
            }

            // Use verified database configuration
            const useSSL = setting.encryption === 'ssl';
            const useTLS = setting.encryption === 'tls';

            const transporterConfig = {
                host: setting.host,
                port: Number(setting.port),
                secure: useSSL, // true for 465, false for 587/25 STARTTLS
                auth: {
                    user: setting.email,
                    pass: setting.password,
                },
                requireTLS: useTLS || undefined,
                tls:
                    setting.encryption === 'none'
                        ? { rejectUnauthorized: false }
                        : undefined,
            };

            const transporter = nodemailer.createTransport(transporterConfig);

            const mailOptions = {
                from: setting.email,
                to,
                subject,
                html: htmlContent,
            };

            await transporter.sendMail(mailOptions);
            console.log('✅ Email sent successfully to:', to);
        } catch (error) {
            console.error('❌ Email sending failed:', error);
            throw new Error(`Failed to send email: ${error.message}`);
        }
    }
}

export default AdminEmailService;
