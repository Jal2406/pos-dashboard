import mongoose from 'mongoose';


const RECIPIENT_TYPES = ['admin', 'manager', 'cashier', 'customer', 'supplier'];

const tenantMailTemplateSchema = new mongoose.Schema(
    {
        label: {
            type: String,
            required: true,
            trim: true,
            maxLength: 150,
        },
        type: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
            maxLength: 120,
        },
        to: [
            {
                type: String,
                enum: RECIPIENT_TYPES,
                required: true,
            },
        ],
        templates: [
            {
                userType: {
                    type: String,
                    enum: RECIPIENT_TYPES,
                    required: true,
                    lowercase: true,
                    trim: true,
                },
                email: {
                    subject: {
                        type: String,
                        required: true,
                        trim: true,
                        maxLength: 200,
                    },
                    content: {
                        type: String,
                        required: true,
                        trim: true,
                    },
                },
                isDefault: {
                    type: Boolean,
                    default: false,
                },
                lastUsedAt: {
                    type: Date,
                    default: null,
                },
            },
        ],
        status: {
            type: Boolean,
            default: true,
            index: true,
        },
        isSystem: {
            type: Boolean,
            default: false,
        },
        lastUsedAt: {
            type: Date,
            default: null,
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
    },
    {
        timestamps: true,
        minimize: false,
    },
);

tenantMailTemplateSchema.index({ label: 1 }, { unique: true });
tenantMailTemplateSchema.index({ status: 1, updatedAt: -1 });
tenantMailTemplateSchema.index(
    {
        label: 'text',
        type: 'text',
        'templates.email.subject': 'text',
        'templates.email.content': 'text',
    },
);

tenantMailTemplateSchema.pre('validate', function enforceRecipientUniqueness(next) {
    if (!Array.isArray(this.templates) || this.templates.length === 0) {
        return next(
            new mongoose.Error.ValidationError(
                new mongoose.Error.ValidatorError({
                    path: 'templates',
                    message: 'At least one recipient-specific template is required',
                }),
            ),
        );
    }

    const seenRecipients = new Set();
    for (const template of this.templates) {
        if (!template?.userType) {
            return next(
                new mongoose.Error.ValidationError(
                    new mongoose.Error.ValidatorError({
                        path: 'templates.userType',
                        message: 'Recipient type is required for every template entry',
                    }),
                ),
            );
        }

        const normalized = String(template.userType).toLowerCase();
        if (seenRecipients.has(normalized)) {
            return next(
                new mongoose.Error.ValidationError(
                    new mongoose.Error.ValidatorError({
                        path: 'templates.userType',
                        message: `Duplicate recipient template defined for: ${normalized}`,
                    }),
                ),
            );
        }
        seenRecipients.add(normalized);
    }

    return next();
});

tenantMailTemplateSchema.methods.getTemplateForRecipient =
    function getTemplateForRecipient(recipientType) {
        if (!recipientType) {
            return null;
        }

        const normalized = String(recipientType).toLowerCase();
        const specific =
            this.templates?.find(
                (template) => template?.userType?.toLowerCase() === normalized,
            ) || null;

        if (specific) {
            return specific;
        }

        return (
            this.templates?.find((template) => template?.isDefault === true) || null
        );
    };

export const TenantMailTemplateSchema = tenantMailTemplateSchema;
