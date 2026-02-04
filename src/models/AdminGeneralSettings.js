import mongoose from 'mongoose';

const AdminGeneralSettingsSchema = new mongoose.Schema(
    {
        // General Information
        appName: {
            type: String,
            required: [true, 'App name is required'],
            trim: true,
            minlength: [2, 'App name must be at least 2 characters'],
            maxlength: [100, 'App name must not exceed 100 characters'],
            validate: {
                validator: function (v) {
                    return /^[a-zA-Z0-9\s\-_&().]+$/.test(v);
                },
                message:
                    'App name can only contain letters, numbers, spaces, hyphens, underscores, ampersands, parentheses, and periods',
            },
        },
        contactNumber: {
            type: String,
            required: [true, 'Contact number is required'],
            trim: true,
            match: [
                /^\+?[0-9\s\-()]{7,20}$/,
                'Please provide a valid contact number (7-20 digits, may include +, spaces, hyphens, and parentheses)',
            ],
            validate: {
                validator: function (v) {
                    // Remove all non-digit characters except + at the beginning
                    const digitsOnly = v.replace(/[^\d+]/g, '');
                    return digitsOnly.length >= 7 && digitsOnly.length <= 20;
                },
                message: 'Contact number must contain 7-20 digits',
            },
        },
        inquiryEmail: {
            type: String,
            required: [true, 'Inquiry email is required'],
            trim: true,
            lowercase: true,
            match: [
                /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                'Please provide a valid email address',
            ],
            validate: {
                validator: function (v) {
                    return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(v);
                },
                message: 'Please provide a valid email address format',
            },
        },
        siteDescription: {
            type: String,
            required: [true, 'Site description is required'],
            trim: true,
        },
        copyrightText: {
            type: String,
            trim: true,
            maxlength: [500, 'Copyright text must not exceed 500 characters'],
        },
        footerText: {
            type: String,
            trim: true,
            maxlength: [1000, 'Footer text must not exceed 1000 characters'],
        },

        // Business Address
        businessAddress: {
            shopNumber: {
                type: String,
                required: [true, 'Shop number is required'],
                trim: true,
            },
            landmark: {
                type: String,
                required: [true, 'Landmark is required'],
                trim: true,
            },
            country: {
                type: String,
                required: [true, 'Country is required'],
                trim: true,
            },
            state: {
                type: String,
                required: [true, 'State is required'],
                trim: true,
            },
            city: {
                type: String,
                required: [true, 'City is required'],
                trim: true,
            },
            postalCode: {
                type: String,
                required: [true, 'Postal code is required'],
                trim: true,
                maxlength: [20, 'Postal code must not exceed 20 characters'],
                match: [
                    /^[a-zA-Z0-9\s\-]{3,20}$/,
                    'Postal code must be 3-20 characters and contain only letters, numbers, spaces, and hyphens',
                ],
                validate: {
                    validator: function (v) {
                        return /^[a-zA-Z0-9\s\-]{3,20}$/.test(v);
                    },
                    message:
                        'Postal code must be 3-20 characters and contain only letters, numbers, spaces, and hyphens',
                },
            },
            latitude: {
                type: Number,
                required: [true, 'Latitude is required'],
                min: [-90, 'Latitude must be between -90 and 90 degrees'],
                max: [90, 'Latitude must be between -90 and 90 degrees'],
                validate: {
                    validator: function (v) {
                        return v >= -90 && v <= 90;
                    },
                    message: 'Latitude must be between -90 and 90 degrees',
                },
            },
            longitude: {
                type: Number,
                required: [true, 'Longitude is required'],
                min: [-180, 'Longitude must be between -180 and 180 degrees'],
                max: [180, 'Longitude must be between -180 and 180 degrees'],
                validate: {
                    validator: function (v) {
                        return v >= -180 && v <= 180;
                    },
                    message: 'Longitude must be between -180 and 180 degrees',
                },
            },
        },

        // Logo URLs
        logos: {
            lightLogo: {
                type: String,
                trim: true,
                validate: {
                    validator: function (v) {
                        if (!v) return true; // Optional field
                        return /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|svg)$/i.test(v);
                    },
                    message:
                        'Light logo URL must be a valid image URL (jpg, jpeg, png, gif, webp, svg)',
                },
            },
            darkLogo: {
                type: String,
                trim: true,
                validate: {
                    validator: function (v) {
                        if (!v) return true; // Optional field
                        return /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|svg)$/i.test(v);
                    },
                    message:
                        'Dark logo URL must be a valid image URL (jpg, jpeg, png, gif, webp, svg)',
                },
            },
            lightMiniLogo: {
                type: String,
                trim: true,
                validate: {
                    validator: function (v) {
                        if (!v) return true; // Optional field
                        return /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|svg)$/i.test(v);
                    },
                    message:
                        'Light mini logo URL must be a valid image URL (jpg, jpeg, png, gif, webp, svg)',
                },
            },
            darkMiniLogo: {
                type: String,
                trim: true,
                validate: {
                    validator: function (v) {
                        if (!v) return true; // Optional field
                        return /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|svg)$/i.test(v);
                    },
                    message:
                        'Dark mini logo URL must be a valid image URL (jpg, jpeg, png, gif, webp, svg)',
                },
            },
            faviconLogo: {
                type: String,
                trim: true,
                validate: {
                    validator: function (v) {
                        if (!v) return true; // Optional field
                        return /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|svg|ico)$/i.test(v);
                    },
                    message:
                        'Favicon logo URL must be a valid image URL (jpg, jpeg, png, gif, webp, svg, ico)',
                },
            },
        },

        // Cache settings
        lastCachePurge: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    },
);

// Ensure only one admin general settings document exists
AdminGeneralSettingsSchema.index({}, { unique: true });

// Custom validation methods
AdminGeneralSettingsSchema.methods.validateContactNumber = function () {
    const phoneRegex = /^\+?[0-9\s\-()]{7,20}$/;
    if (!phoneRegex.test(this.contactNumber)) {
        throw new Error('Invalid contact number format');
    }
    return true;
};

AdminGeneralSettingsSchema.methods.validateEmail = function () {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(this.inquiryEmail)) {
        throw new Error('Invalid email format');
    }
    return true;
};

AdminGeneralSettingsSchema.methods.validateCoordinates = function () {
    const { latitude, longitude } = this.businessAddress;
    if (latitude < -90 || latitude > 90) {
        throw new Error('Latitude must be between -90 and 90 degrees');
    }
    if (longitude < -180 || longitude > 180) {
        throw new Error('Longitude must be between -180 and 180 degrees');
    }
    return true;
};

// Pre-save middleware for additional validation
AdminGeneralSettingsSchema.pre('save', function (next) {
    try {
        // Validate contact number
        this.validateContactNumber();

        // Validate email
        this.validateEmail();

        // Validate coordinates if provided
        if (this.businessAddress) {
            this.validateCoordinates();
        }

        next();
    } catch (error) {
        next(error);
    }
});

// Pre-update middleware for validation
AdminGeneralSettingsSchema.pre(
    ['findOneAndUpdate', 'updateOne', 'updateMany'],
    function (next) {
        const update = this.getUpdate();

        try {
            // Validate contact number if being updated
            if (update.contactNumber) {
                const phoneRegex = /^\+?[0-9\s\-()]{7,20}$/;
                if (!phoneRegex.test(update.contactNumber)) {
                    throw new Error('Invalid contact number format');
                }
            }

            // Validate email if being updated
            if (update.inquiryEmail) {
                const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
                if (!emailRegex.test(update.inquiryEmail)) {
                    throw new Error('Invalid email format');
                }
            }

            // Validate coordinates if being updated
            if (update.businessAddress) {
                const { latitude, longitude } = update.businessAddress;
                if (latitude !== undefined && (latitude < -90 || latitude > 90)) {
                    throw new Error('Latitude must be between -90 and 90 degrees');
                }
                if (longitude !== undefined && (longitude < -180 || longitude > 180)) {
                    throw new Error('Longitude must be between -180 and 180 degrees');
                }
            }

            next();
        } catch (error) {
            next(error);
        }
    },
);

// Add virtual for full address
AdminGeneralSettingsSchema.virtual('fullAddress').get(function () {
    const addr = this.businessAddress;
    if (!addr) return '';

    const parts = [
        addr.shopNumber,
        addr.landmark,
        addr.city,
        addr.state,
        addr.country,
        addr.postalCode,
    ].filter(Boolean);

    return parts.join(', ');
});

// Add virtual for validation status
AdminGeneralSettingsSchema.virtual('isValid').get(function () {
    try {
        this.validateContactNumber();
        this.validateEmail();
        if (this.businessAddress) {
            this.validateCoordinates();
        }
        return true;
    } catch (error) {
        return false;
    }
});

// Add virtual for required fields completion
AdminGeneralSettingsSchema.virtual('requiredFieldsComplete').get(function () {
    const requiredFields = [
        'appName',
        'contactNumber',
        'inquiryEmail',
        'siteDescription',
    ];
    return requiredFields.every(
        (field) => this[field] && this[field].trim().length > 0,
    );
});

// Ensure virtual fields are serialized
AdminGeneralSettingsSchema.set('toJSON', { virtuals: true });
AdminGeneralSettingsSchema.set('toObject', { virtuals: true });


export {AdminGeneralSettingsSchema};