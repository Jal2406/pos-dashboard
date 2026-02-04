import { BaseService } from '../../utils/index.js';
import { TenantMailTemplateSchema } from '../../models/index.js';

const RECIPIENT_TYPES = ['admin', 'manager', 'cashier', 'customer', 'supplier'];
const DEFAULT_SORT_FIELDS = ['name', 'label', 'status', 'updatedAt', 'createdAt'];

class TenantEmailTemplateService extends BaseService {
    constructor(businessId) {
        super({
            modelName: 'TenantMailTemplate',
            schema: TenantMailTemplateSchema,
            collection: 'tenantmailtemplates',
            businessId,
        });

        this.businessId = businessId;
    }

    /**
     * Create or update a template based on label (idempotent per label)
     */
    async createOrUpdateByLabel(data = {}) {
        this.validateRequiredFields(data, ['label', 'type', 'to', 'templates']);

        const normalizedLabel = String(data.label || '').trim();
        if (!normalizedLabel) {
            throw new Error('Label is required');
        }

        const Model = await this.getModel();
        const existing = await Model.findOne({ label: normalizedLabel });
        const payload = this._preparePayload({ ...data, label: normalizedLabel }, { isNew: !existing });

        if (existing) {
            const updated = await Model.findByIdAndUpdate(
                existing._id,
                { $set: payload },
                {
                    new: true,
                    runValidators: true,
                },
            );
            const template = updated?.toObject?.() || updated;
            return { template, created: false };
        }

        const created = await Model.create(payload);
        const template = created?.toObject?.() || created;
        return { template, created: true };
    }

    /**
     * Get paginated tenant email templates
     */
    async listTemplates(queryParams = {}) {
        const {
            page = 1,
            limit = 10,
            search = '',
            status,
            recipient,
            sortBy = 'updatedAt',
            sortOrder = 'desc',
        } = queryParams;

        const { page: validatedPage, limit: validatedLimit, skip } = this.validatePagination(
            page,
            limit,
            100,
        );

        const filter = {};

        if (status !== undefined && status !== null && status !== '') {
            filter.status =
                status === true ||
                status === 'true' ||
                status === 1 ||
                status === '1' ||
                status === 'active';
        }

        if (recipient) {
            filter.to = String(recipient).toLowerCase();
        }

        if (search && typeof search === 'string' && search.trim()) {
            filter.$text = { $search: search.trim() };
        }

        const sortField = this._resolveSortField(sortBy);
        const sort = { [sortField]: sortOrder === 'asc' ? 1 : -1 };

        const Model = await this.getModel();
        const [items, total] = await Promise.all([
            Model.find(filter).sort(sort).skip(skip).limit(validatedLimit).lean(),
            Model.countDocuments(filter),
        ]);

        return {
            data: items,
            pagination: {
                currentPage: validatedPage,
                totalPages: Math.ceil(total / validatedLimit),
                totalItems: total,
                itemsPerPage: validatedLimit,
                hasNext: validatedPage * validatedLimit < total,
                hasPrev: validatedPage > 1,
            },
        };
    }

    _resolveSortField(field) {
        if (DEFAULT_SORT_FIELDS.includes(field)) {
            return field;
        }
        return 'updatedAt';
    }

    /**
     * Get a template by ID with optional lean result
     */
    async getTemplateById(id, { lean = true } = {}) {
        this.validateObjectId(id);
        const Model = await this.getModel();
        const query = Model.findById(id);
        const result = lean ? await query.lean() : await query;
        if (!result) {
            throw new Error(`Tenant email template with id ${id} not found`);
        }
        return result;
    }

    /**
     * Get an active template by label
     */
    async getActiveTemplateByLabel(label, { lean = true } = {}) {
        const normalizedLabel = String(label || '').trim();
        if (!normalizedLabel) {
            throw new Error('Template label is required');
        }

        const Model = await this.getModel();
        const query = Model.findOne({
            label: normalizedLabel,
            status: true,
        });

        const result = lean ? await query.lean() : await query;
        return result;
    }

    /**
     * Update a template by ID
     */
    async updateTemplateById(id, data = {}) {
        this.validateObjectId(id);
        if (!data || typeof data !== 'object') {
            throw new Error('Update payload must be a valid object');
        }

        const payload = this._preparePayload(data, { isNew: false });
        if (Object.keys(payload).length === 0) {
            throw new Error('No valid fields provided for update');
        }

        const Model = await this.getModel();
        const updated = await Model.findByIdAndUpdate(
            id,
            { $set: payload },
            {
                new: true,
                runValidators: true,
            },
        );

        if (!updated) {
            throw new Error(`Tenant email template with id ${id} not found`);
        }

        return updated;
    }

    /**
     * Delete template by ID
     */
    async deleteTemplateById(id) {
        return this.deleteById(id);
    }

    /**
     * Toggle status flag
     */
    async toggleTemplateStatus(id) {
        this.validateObjectId(id);
        const Model = await this.getModel();
        const existing = await Model.findById(id).select('status');
        if (!existing) {
            throw new Error(`Tenant email template with id ${id} not found`);
        }

        const updated = await Model.findByIdAndUpdate(
            id,
            { $set: { status: !existing.status } },
            { new: true, runValidators: false, projection: 'status' },
        );

        return updated;
    }

    /**
     * Internal helpers
     */
    _preparePayload(data = {}, options = {}) {
        const payload = {};

        if (data.name !== undefined) {
            payload.name = String(data.name).trim().toLowerCase();
        }
        if (data.label !== undefined) {
            payload.label = String(data.label).trim();
        }
        if (data.type !== undefined) {
            payload.type = String(data.type).trim().toLowerCase();
        }
        if (data.status !== undefined) {
            payload.status =
                data.status === true ||
                data.status === 'true' ||
                data.status === 1 ||
                data.status === '1' ||
                data.status === 'active';
        }
        if (data.isSystem !== undefined) {
            payload.isSystem = Boolean(data.isSystem);
        }
        if (data.to !== undefined) {
            payload.to = this._normalizeRecipients(data.to);
        }
        if (data.templates !== undefined) {
            payload.templates = this._normalizeTemplates(data.templates);
        }

        if (options.isNew) {
            if (!payload.to) {
                payload.to = this._normalizeRecipients(data.to);
            }
            if (!payload.templates) {
                payload.templates = this._normalizeTemplates(data.templates);
            }
        }

        if (payload.to && payload.templates) {
            this._validateTemplateCoverage(payload.to, payload.templates);
        }

        return payload;
    }

    _normalizeRecipients(list = []) {
        if (!Array.isArray(list) || list.length === 0) {
            throw new Error('At least one recipient is required');
        }

        const normalized = Array.from(
            new Set(
                list.map((recipient) => {
                    const value = String(recipient).toLowerCase().trim();
                    if (!RECIPIENT_TYPES.includes(value)) {
                        throw new Error(
                            `Invalid recipient type "${recipient}". Allowed: ${RECIPIENT_TYPES.join(', ')}`,
                        );
                    }
                    return value;
                }),
            ),
        );

        return normalized;
    }

    _normalizeTemplates(templates = []) {
        if (!Array.isArray(templates) || templates.length === 0) {
            throw new Error('At least one recipient template block is required');
        }

        const normalized = templates.map((entry) => {
            if (!entry || typeof entry !== 'object') {
                throw new Error('Template entries must be objects');
            }

            const userType = String(
                entry.userType || entry.recipientType || entry.to,
            )
                .toLowerCase()
                .trim();

            if (!userType) {
                throw new Error('recipientType is required for each template block');
            }
            if (!RECIPIENT_TYPES.includes(userType)) {
                throw new Error(
                    `Invalid recipientType "${entry.userType || entry.recipientType}". Allowed: ${RECIPIENT_TYPES.join(', ')}`,
                );
            }

            const emailSubject = String(
                entry.email?.subject || entry.subject || '',
            ).trim();
            const emailContent = String(
                entry.email?.content || entry.description || entry.content || '',
            ).trim();

            if (!emailSubject) {
                throw new Error(`Subject is required for ${userType} template`);
            }

            if (!emailContent) {
                throw new Error(
                    `Content is required for ${userType} template`,
                );
            }

            return {
                userType,
                email: {
                    subject: emailSubject,
                    content: emailContent,
                },
                isDefault: Boolean(entry.isDefault),
                lastUsedAt: entry.lastUsedAt || null,
            };
        });

        if (!normalized.some((template) => template.isDefault)) {
            normalized[0].isDefault = true;
        }

        return normalized;
    }

    _validateTemplateCoverage(recipients = [], templates = []) {
        const templateMap = new Map(
            templates.map((template) => [template.userType, template]),
        );

        for (const recipient of recipients) {
            if (!templateMap.has(recipient)) {
                throw new Error(
                    `Missing template definition for recipient "${recipient}"`,
                );
            }
        }
    }
}

export default TenantEmailTemplateService;
