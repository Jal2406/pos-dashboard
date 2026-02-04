import TenantEmailTemplateService from './emailTemplate.service.js';
import TenantNotificationTemplateRenderer from './templateRenderer.service.js';
import AdminEmailService from '../../utils/adminEmailService.js';

class TenantNotificationDispatcher {
    /**
     * Dispatch notification to requested channels
     * @param {Object} options
     * @param {string} options.businessId
     * @param {string} options.label template label
     * @param {string} options.recipientType template recipient (admin/manager/etc.)
     * @param {Object} options.recipient delivery target info { email }
     * @param {string[]} options.channels ['email']
     * @param {Object} options.contextOptions data passed to context builder
     */
    static async dispatch({
        businessId,
        label,
        recipientType = 'admin',
        recipient = {},
        channels = ['email'],
        contextOptions = {},
    }) {
        if (!businessId) {
            throw new Error('businessId is required to dispatch tenant notifications');
        }
        if (!label) {
            throw new Error('Template label is required');
        }
        if (!Array.isArray(channels) || channels.length === 0) {
            throw new Error('At least one delivery channel is required');
        }

        const templateBlock = await this._getTemplateBlock({
            businessId,
            label,
            recipientType,
        });

        const rendered = TenantNotificationTemplateRenderer.renderChannels(
            {
                email: templateBlock.email,
                sms: templateBlock.sms,
                whatsapp: templateBlock.whatsapp,
            },
            contextOptions,
        );

        const results = {};

        if (channels.includes('email')) {
            results.email = await this._dispatchEmail({
                businessId,
                recipient,
                renderedEmail: rendered.email,
            });
        }

        if (channels.includes('sms') || channels.includes('text')) {
            results.sms = { success: false, message: 'SMS channel not implemented yet' };
        }

        if (channels.includes('whatsapp')) {
            results.whatsapp = {
                success: false,
                message: 'WhatsApp channel not implemented yet',
            };
        }

        return { rendered, results };
    }

    static async _getTemplateBlock({ businessId, label, recipientType }) {
        const templateService = new TenantEmailTemplateService(businessId);
        const template = await templateService.getActiveTemplateByLabel(label, {
            lean: true,
        });

        if (!template) {
            throw new Error(`No active tenant template found for label "${label}"`);
        }

        const block =
            template.templates?.find(
                (entry) => entry.userType?.toLowerCase() === recipientType.toLowerCase(),
            ) ||
            template.templates?.find((entry) => entry.isDefault) ||
            null;

        if (!block) {
            throw new Error(
                `No template block defined for recipient type "${recipientType}"`,
            );
        }

        return block;
    }

    static async _dispatchEmail({ businessId, recipient = {}, renderedEmail }) {
        if (!renderedEmail) {
            return { success: false, message: 'No email template available' };
        }
        if (!recipient.email) {
            throw new Error('Recipient email is required to send email notification');
        }

        const adminEmailService = new AdminEmailService(businessId);
        await adminEmailService.sendEmail(
            recipient.email,
            renderedEmail.subject,
            renderedEmail.content,
        );

        return { success: true };
    }
}

export default TenantNotificationDispatcher;
