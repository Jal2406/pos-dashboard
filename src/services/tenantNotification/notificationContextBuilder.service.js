import { format } from 'date-fns';

const DEFAULT_DATE_FORMAT = 'yyyy-MM-dd';

const ENTITY_FIELD_MAPPINGS = {
    company: {
        companyName: ['appName', 'businessName', 'name'],
        companyEmail: ['email', 'companyEmail'],
        supportEmail: ['supportEmail', 'inquiryEmail', 'email'],
        storeWebsite: ['siteURL', 'siteUrl', 'website'],
    },
    store: {
        storeName: ['name'],
        storeWebsite: ['website', 'siteURL'],
    },
    user: {
        userName: ['name'],
        userEmail: ['email'],
        userPhone: ['phone'],
    },
    admin: {
        adminName: ['name'],
        adminEmail: ['email'],
    },
    customer: {
        customerName: ['name'],
        customerEmail: ['email'],
        customerPhone: ['phone'],
    },
    sender: {
        senderName: ['name', 'senderName', 'fullName', 'userName'],
        senderEmail: ['email', 'senderEmail'],
    },
    order: {
        orderId: ['orderId', '_id', 'id'],
        amountPaid: ['total', 'totalAmount', 'amount'],
    },
    payment: {
        amountPaid: ['amount', 'totalAmount', 'paidAmount'],
        paymentDate: ['paidAt', 'date', 'createdAt'],
    },
    coupon: {
        couponCode: ['code'],
        couponType: ['type'],
        couponDiscount: ['discount', 'discountValue', 'discountAmount', 'discount_amount'],
        expiryDate: ['expiryDate', 'validTill', 'validUntil', 'end_date'],
        couponDescription: ['description', 'desc'],
    },
    giftCard: {
        giftCardCode: ['code', 'cardNumber'],
        giftCardAmount: ['amount', 'value'],
        expiryDate: ['expiryDate', 'validTill', 'validUntil'],
        personalMessage: ['message', 'note'],
        giftCardImage: ['image', 'imageUrl', 'img', 'src', 'giftCardImage'],
        giftCardDescription: ['description', 'desc'],
        giftCardTermsAndConditions: ['termsAndConditions', 'terms', 'conditions'],
    },
    purchaseOrder: {
        purchaseOrderId: ['_id', 'id'],
        purchaseOrderNumber: ['number'],
        purchaseDate: ['date', 'createdAt'],
        purchaseOrderStatus: ['status'],
        totalAmount: ['totalAmount', 'total'],
        supplierName: ['supplierName'],
        supplierEmail: ['supplierEmail'],
    },
    support: {
        supportEmail: ['email'],
    },
};

const DATE_FIELDS = new Set(['paymentDate', 'expiryDate', 'currentDate', 'purchaseDate']);

class TenantNotificationContextBuilder {
    /**
     * Build dynamic placeholders for tenant notifications
     * @param {Object} options contextual entities used for placeholder hydration
     * @returns {Object} notification context map
     */
    static buildContext(options = {}) {
        const {
            company,
            store,
            user,
            admin,
            customer,
            sender,
            order,
            payment,
            coupon,
            giftCard,
            purchaseOrder,
            support,
            links = {},
            metadata = {},
            additionalContext = {},
        } = options;

        const context = {
            currentDate: this._formatDate(new Date()),
            personalMessage: '',
            resetLink: links?.reset || '',
            supportEmail: '',
            storeWebsite: '',
        };

        this._assignFields(context, company, ENTITY_FIELD_MAPPINGS.company);
        this._assignFields(context, store, ENTITY_FIELD_MAPPINGS.store);
        this._assignFields(context, user, ENTITY_FIELD_MAPPINGS.user);
        this._assignFields(context, admin, ENTITY_FIELD_MAPPINGS.admin);
        this._assignFields(context, customer, ENTITY_FIELD_MAPPINGS.customer);
        this._assignFields(context, sender, ENTITY_FIELD_MAPPINGS.sender);
        this._assignFields(context, order, ENTITY_FIELD_MAPPINGS.order);
        this._assignFields(context, payment, ENTITY_FIELD_MAPPINGS.payment);
        this._assignFields(context, coupon, ENTITY_FIELD_MAPPINGS.coupon);
        this._assignFields(context, giftCard, ENTITY_FIELD_MAPPINGS.giftCard);
        this._assignFields(context, purchaseOrder, ENTITY_FIELD_MAPPINGS.purchaseOrder);
        this._assignFields(context, support, ENTITY_FIELD_MAPPINGS.support);

        if (links?.store) {
            this._assignValue(context, 'storeWebsite', links.store);
        }

        // Merge metadata and additional context
        const extraFields = { ...metadata, ...additionalContext };
        Object.entries(extraFields).forEach(([key, value]) => {
            this._assignValue(context, key, value);
        });
        return context;
    }

    static _assignFields(target, source, mappings = {}) {
        if (!source || typeof source !== 'object') return;

        for (const [targetKey, candidates] of Object.entries(mappings)) {
            const paths = Array.isArray(candidates) ? candidates : [candidates];

            for (const path of paths) {
                const value = this._getValue(source, path);
                if (value !== undefined && value !== null && this._shouldOverwrite(target[targetKey])) {
                    this._assignValue(target, targetKey, value);
                    break;
                }
            }
        }
    }

    static _assignValue(target, key, value) {
        if (value === undefined || value === null) return;

        if (DATE_FIELDS.has(key)) {
            target[key] = this._formatDate(value);
            return;
        }

        target[key] = value;
    }

    static _formatDate(value) {
        try {
            const date = value instanceof Date ? value : new Date(value);
            if (Number.isNaN(date.getTime())) {
                return '';
            }
            return format(date, DEFAULT_DATE_FORMAT);
        } catch {
            return '';
        }
    }

    static _getValue(source, path) {
        if (!path) return undefined;
        return path.split('.').reduce((acc, key) => {
            if (acc === undefined || acc === null) {
                return undefined;
            }
            return acc[key];
        }, source);
    }

    static _shouldOverwrite(currentValue) {
        return currentValue === undefined || currentValue === null || currentValue === '';
    }
}

export default TenantNotificationContextBuilder;
