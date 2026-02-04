import mongoose from "mongoose";

/**
 * URL validation regex pattern
 * Validates HTTP/HTTPS URLs with proper domain structure
 */
const URL_REGEX = /^(https?:\/\/)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/;

/**
 * Platform-specific URL validators
 */
const PLATFORM_VALIDATORS = {
    instagram: {
        pattern: /^(https?:\/\/)?(www\.)?instagram\.com\/[a-zA-Z0-9._]+\/?$/,
        message: 'Please provide a valid Instagram profile URL (e.g., https://instagram.com/username)'
    },
    facebook: {
        pattern: /^(https?:\/\/)?(www\.)?facebook\.com\/[a-zA-Z0-9._\-]+\/?$/,
        message: 'Please provide a valid Facebook page URL (e.g., https://facebook.com/pagename)'
    },
    twitter: {
        pattern: /^(https?:\/\/)?(www\.)?(twitter\.com|x\.com)\/[a-zA-Z0-9_]+\/?$/,
        message: 'Please provide a valid Twitter/X profile URL (e.g., https://twitter.com/username or https://x.com/username)'
    },
    linkedin: {
        pattern: /^(https?:\/\/)?(www\.)?linkedin\.com\/(in|company)\/[a-zA-Z0-9_\-]+\/?$/,
        message: 'Please provide a valid LinkedIn profile or company URL (e.g., https://linkedin.com/in/username or https://linkedin.com/company/companyname)'
    },
    youtube: {
        pattern: /^(https?:\/\/)?(www\.)?youtube\.com\/(c\/|channel\/|user\/|@)?[a-zA-Z0-9_\-]+\/?$/,
        message: 'Please provide a valid YouTube channel URL (e.g., https://youtube.com/@channelname or https://youtube.com/c/channelname)'
    }
};

/**
 * Custom validator function for platform-specific URLs
 */
const validatePlatformUrl = (platform) => {
    return {
        validator: function (value) {
            // Allow empty strings since all fields are optional
            if (!value || value.trim() === '') {
                return true;
            }

            // Validate against platform-specific pattern
            const validator = PLATFORM_VALIDATORS[platform];
            return validator ? validator.pattern.test(value.trim()) : URL_REGEX.test(value.trim());
        },
        message: (props) => {
            const platform = props.path.replace('Link', '').toLowerCase();
            const validator = PLATFORM_VALIDATORS[platform];
            return validator ? validator.message : `Please provide a valid URL for ${props.path}`;
        }
    };
};

/**
 * Social Media Links Schema
 * Stores social media profile URLs for the business
 * Implements singleton pattern - only one document should exist
 */
const SocialMediaLinksSchema = new mongoose.Schema({
    InstagramLink: {
        type: String,
        required: false,
        default: '',
        trim: true,
        maxlength: [500, 'Instagram URL cannot exceed 500 characters'],
        validate: validatePlatformUrl('instagram')
    },
    FacebookLink: {
        type: String,
        required: false,
        default: '',
        trim: true,
        maxlength: [500, 'Facebook URL cannot exceed 500 characters'],
        validate: validatePlatformUrl('facebook')
    },
    TwitterLink: {
        type: String,
        required: false,
        default: '',
        trim: true,
        maxlength: [500, 'Twitter URL cannot exceed 500 characters'],
        validate: validatePlatformUrl('twitter')
    },
    LinkedInLink: {
        type: String,
        required: false,
        default: '',
        trim: true,
        maxlength: [500, 'LinkedIn URL cannot exceed 500 characters'],
        validate: validatePlatformUrl('linkedin')
    },
    YoutubeLink: {
        type: String,
        required: false,
        default: '',
        trim: true,
        maxlength: [500, 'YouTube URL cannot exceed 500 characters'],
        validate: validatePlatformUrl('youtube')
    }
}, {
    timestamps: true,
    collection: 'socialmedialinks',
    versionKey: false
});

/**
 * Indexes for performance optimization
 */
SocialMediaLinksSchema.index({ createdAt: -1 });

/**
 * Pre-save middleware to enforce singleton pattern
 * Ensures only one social media links document exists
 */
SocialMediaLinksSchema.pre('save', async function (next) {
    if (this.isNew) {
        const count = await this.constructor.countDocuments();
        if (count > 0) {
            const error = new Error('Social Media Links settings already exist. Use update instead of create.');
            error.name = 'SingletonViolationError';
            return next(error);
        }
    }
    next();
});

/**
 * Instance method to sanitize URLs
 * Ensures URLs have proper protocol
 */
SocialMediaLinksSchema.methods.sanitizeUrls = function () {
    const fields = ['InstagramLink', 'FacebookLink', 'TwitterLink', 'LinkedInLink', 'YoutubeLink'];

    fields.forEach(field => {
        if (this[field] && this[field].trim() !== '') {
            const url = this[field].trim();
            // Add https:// if no protocol is specified
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                this[field] = 'https://' + url;
            }
        }
    });

    return this;
};

/**
 * Static method to get or create settings
 * Returns existing settings or creates default ones
 */
SocialMediaLinksSchema.statics.getOrCreate = async function () {
    let settings = await this.findOne();

    if (!settings) {
        settings = await this.create({
            InstagramLink: '',
            FacebookLink: '',
            TwitterLink: '',
            LinkedInLink: '',
            YoutubeLink: ''
        });
    }

    return settings;
};

/**
 * Virtual to check if any social media link is configured
 */
SocialMediaLinksSchema.virtual('hasAnyLink').get(function () {
    return !!(
        this.InstagramLink ||
        this.FacebookLink ||
        this.TwitterLink ||
        this.LinkedInLink ||
        this.YoutubeLink
    );
});

/**
 * Transform output to include virtuals in JSON
 */
SocialMediaLinksSchema.set('toJSON', {
    virtuals: true,
    transform: function (doc, ret) {
        delete ret._id;
        return ret;
    }
});

SocialMediaLinksSchema.set('toObject', {
    virtuals: true
});

const SocialMediaLinks = mongoose.model("SocialMediaLinks", SocialMediaLinksSchema);

export default SocialMediaLinks;