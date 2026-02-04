import TemplateRenderer from '../templateRenderer.service.js';
import TenantNotificationContextBuilder from './notificationContextBuilder.service.js';

const CHANNEL_KEYS = {
    email: 'email',
    sms: 'sms',
    text: 'text',
    whatsapp: 'whatsapp',
};

class TenantNotificationTemplateRenderer {
    /**
     * Build a hydrated context using the shared builder
     * @param {Object} contextOptions
     * @returns {{context: Object}}
     */
    static buildContext(contextOptions = {}) {
        return TenantNotificationContextBuilder.buildContext(contextOptions);
    }

    /**
     * Render channel templates (email/sms/whatsapp) with the provided context
     * @param {Object} channelTemplates - template definitions from DB
     * @param {Object} contextOptions - data for context builder
     * @returns {{context: Object, email?: Object, sms?: Object, whatsapp?: Object}}
     */
    static renderChannels(channelTemplates = {}, contextOptions = {}) {
        const context = this.buildContext(contextOptions);
        const rendered = { context };

        if (channelTemplates[CHANNEL_KEYS.email]) {
            rendered.email = this._renderEmail(channelTemplates[CHANNEL_KEYS.email], context);
        }

        const smsTemplate =
            channelTemplates[CHANNEL_KEYS.sms] ||
            channelTemplates[CHANNEL_KEYS.text] ||
            null;
        if (smsTemplate) {
            rendered.sms = this._renderTextChannel(smsTemplate, context);
        }

        if (channelTemplates[CHANNEL_KEYS.whatsapp]) {
            rendered.whatsapp = this._renderTextChannel(
                channelTemplates[CHANNEL_KEYS.whatsapp],
                context,
            );
        }

        return rendered;
    }

    static _renderEmail(emailTemplate, context) {
        return {
            subject: TemplateRenderer.render(emailTemplate.subject || '', context),
            content: TemplateRenderer.render(emailTemplate.content || '', context),
        };
    }

    static _renderTextChannel(template, context) {
        // Template might be string or object with content
        const body =
            typeof template === 'string'
                ? template
                : template?.content || template?.body || '';

        return {
            content: TemplateRenderer.render(body || '', context),
        };
    }
}

export default TenantNotificationTemplateRenderer;
