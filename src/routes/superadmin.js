import express from 'express';
import {
  UserController,
  BusinessCategoryController,
  CouponController,
  taxController,
  PlanController,
  FaqController,
  FaqCategoryController,
  InvoiceSettingController,
  MailSettingController,
  SubscriptionController,
  DashboardController,
  StoreController,
  BlogController,
  HeroSectionController,
  FooterSectionController,
  ProductOverviewController,
  PricingSectionController,
  FeaturesController,
  BusinessTypesController,
  PaymentGatewayController,
  CurrencyController,
  GoogleLoginSettingController,
  GeneralSettingsController,
  GdprCookieSettingsController,
  SeoSettingsController,
  LanguageSettingsController,
  AdvertisementController,
  UploadController,
  MiscSettingController,
  SocialMediaLinksController,
  NotificationTemplateController,
  NotificationController,
} from '../controller/index.js';
import { upload } from '../utils/index.js';

const router = express.Router();

// ===== USER ROUTES =====
router.get('/users', UserController.getUsers);
router.get('/users/:id', UserController.getUser);
router.post('/users', UserController.createUser);
router.put('/users/:id', UserController.updateUser);
router.patch('/users/bulk-status', UserController.bulkSetActive);
router.post('/users/bulk-get', UserController.bulkGetUsers);
// Backwards-compatible alias
router.patch('/users/:id/toggle', UserController.toggle);

// ===== SUBSCRIPTION REPORT ROUTES =====
router.get(
  '/business-owner-report',
  UserController.getBusinessOwnerSubscriptionReport,
);

// POST /users/download-selected
router.post('/business-owner-report/bulk-get', UserController.bulkGetSelectDownload);




// ===== BUSINESS CATEGORY ROUTES =====
router.post('/business-categories', BusinessCategoryController.create);
router.get('/business-categories', BusinessCategoryController.list);
// Bulk operations must be declared BEFORE parameterized routes to avoid conflicts
router.patch(
  '/business-categories/bulk-status',
  BusinessCategoryController.bulkUpdateStatus,
);
router.delete(
  '/business-categories/bulk-delete',
  BusinessCategoryController.bulkDelete,
);
router.post(
  '/business-categories/bulk-get',
  BusinessCategoryController.bulkGet,
);
// Parameterized routes
router.get('/business-categories/:id', BusinessCategoryController.get);
router.put('/business-categories/:id', BusinessCategoryController.update);
router.delete('/business-categories/:id', BusinessCategoryController.remove);

// ===== COUPON ROUTES =====
// Management endpoints (place before :id routes to avoid conflicts)
router.post('/coupons', CouponController.create);
router.get('/coupons', CouponController.list);
router.get('/coupons/analytics', CouponController.getCouponAnalytics);
router.patch('/coupons/bulk-status', CouponController.bulkUpdateStatus);
router.delete('/coupons/bulk-delete', CouponController.bulkDelete);
router.post('/coupons/bulk-get', CouponController.bulkGet);
router.post('/coupons/cleanup-expired', CouponController.cleanupExpiredCoupons);
router.get('/coupons/stats', CouponController.getCouponStats);
router.get('/coupons/cache-stats', CouponController.getCacheStats);

// Individual coupon routes
router.get('/coupons/:id', CouponController.get);
router.put('/coupons/:id', CouponController.update);
router.delete('/coupons/:id', CouponController.remove);
router.patch('/coupons/:id/toggle', CouponController.toggleStatus);

// ===== TAX ROUTES =====
router.post('/tax', taxController.createTax);
router.get('/tax', taxController.getTaxes);
router.patch('/tax/bulk-status', taxController.bulkUpdateStatus);
router.delete('/tax/bulk-delete', taxController.bulkDelete);
router.post('/tax/bulk-get', taxController.bulkGet);
// Parameterized routes should come after bulk routes to avoid conflicts
router.get('/tax/:id', taxController.getTaxById);
router.put('/tax/:id', taxController.updateTax);
router.delete('/tax/:id', taxController.deleteTax);

// ===== PLAN ROUTES =====
router.post('/plans', PlanController.createPlan);
router.get('/plans', PlanController.getPlan);
router.get(
  '/plans/currencies/active',
  PlanController.getActiveCurrenciesForPlans,
);
router.put('/plans/trial', PlanController.updateTrialPlan);
router.get('/plans/trial', PlanController.getTrialPlan);
router.patch('/plans/bulk-status', PlanController.bulkUpdateStatus);
router.delete('/plans/bulk-delete', PlanController.bulkDelete);
router.post('/plans/bulk-get', PlanController.bulkGet);
router.get('/plans/:id', PlanController.getPlanById);
router.put('/plans/:id', PlanController.updatePlan);
router.delete('/plans/:id', PlanController.deletePlan);

// ===== FAQ ROUTES =====
router.post('/faqs', FaqController.create);
router.get('/faqs', FaqController.list);
router.patch('/faqs/bulk-status', FaqController.bulkUpdateStatus);
router.delete('/faqs/bulk-delete', FaqController.bulkDelete);
router.get('/faqs/slug/:slug', FaqController.getBySlug);
router.get('/faqs/:id', FaqController.get);
router.put('/faqs/:id', FaqController.update);
router.delete('/faqs/:id', FaqController.remove);

// ===== FAQ CATEGORY ROUTES =====
router.post('/faq-categories', FaqCategoryController.create);
router.get('/faq-categories', FaqCategoryController.list);
router.patch('/faq-categories/bulk-status', FaqCategoryController.bulkUpdateStatus);
router.delete('/faq-categories/bulk-delete', FaqCategoryController.bulkDelete);
router.get('/faq-categories/active', FaqCategoryController.getActive);
router.patch('/faq-categories/:id/restore', FaqCategoryController.restore);
router.get('/faq-categories/:id', FaqCategoryController.get);
router.put('/faq-categories/:id', FaqCategoryController.update);
router.patch('/faq-categories/:id/toggle', FaqCategoryController.toggleStatus);
router.delete('/faq-categories/:id', FaqCategoryController.remove);


// ===== INVOICE SETTING ROUTES =====
router.get('/invoice-settings', InvoiceSettingController.list);
router.post('/invoice-settings', InvoiceSettingController.createOrUpdate);
router.post(
  '/invoice-settings/increment-order-start',
  InvoiceSettingController.incrementOrderStart,
);

// ===== MAIL SETTING ROUTES =====
router.get('/mail-settings', MailSettingController.get);
router.get('/mail-settings/status', MailSettingController.getStatus);
router.post('/mail-settings', MailSettingController.createOrUpdate);
router.put('/mail-settings', MailSettingController.createOrUpdate);
router.post('/mail-settings/verify', MailSettingController.verify);
router.delete('/mail-settings', MailSettingController.delete);

// ===== SUBSCRIPTION ROUTES =====
router.post('/subscription', SubscriptionController.createActiveSubscription);
router.get(
  '/subscription',
  SubscriptionController.getActiveAndLatestPendingSubscriptions,
);
router.post(
  '/subscription/bulk-get',
  SubscriptionController.bulkGetSubscriptions,
);

// ===== BLOG ROUTES =====
router.post('/blogs', upload.single('blogImage'), BlogController.createBlog);
router.patch('/blogs/bulk-status', BlogController.bulkUpdateStatus);
router.delete('/blogs/bulk-delete', BlogController.bulkDelete);
router.get('/blogs', BlogController.getAllBlogs);
router.get('/blogs/slug/:slug', BlogController.getBlogBySlug);
router.get('/blogs/:id', BlogController.getBlogById);
router.put('/blogs/:id', upload.single('blogImage'), BlogController.updateBlog);
router.delete('/blogs/:id', BlogController.deleteBlog);
router.patch('/blogs/:id/publish', BlogController.togglePublishStatus);

// ===== DASHBOARD ROUTES =====
router.get('/dashboard', DashboardController.getDashboardData);
router.get(
  '/dashboard/plan-wise-subscriptions',
  DashboardController.getPlanWiseSubscriptionsByDate,
);
router.get(
  '/dashboard/revenue-overview',
  DashboardController.getRevenueOverviewByDate,
);


// ===== HERO SECTION ROUTES =====
router.post(
  '/hero-section',
  upload.fields([{ name: 'heroImage', maxCount: 1 }]),
  HeroSectionController.createOrUpdateHeroSection,
);
router.get('/hero-section', HeroSectionController.getHeroSections);
router.get(
  '/hero-section/current',
  HeroSectionController.getCurrentHeroSection,
);
router.get('/hero-section/stats', HeroSectionController.getHeroSectionStats);

router.post('/hero-section/preview', HeroSectionController.previewHeroSection);

// ===== FOOTER SECTION ROUTES =====
router.post(
  '/footer-section',
  FooterSectionController.createOrUpdateFooterSection,
);
router.get('/footer-section', FooterSectionController.getFooterSections);

// CTA: single create/update (singleton, no id required)
router.post(
  '/footer-section/cta',
  FooterSectionController.createOrUpdateCTASection,
);

router.post(
  '/footer-section/:sectionId/link',
  FooterSectionController.appendFooterLinks,
);

// Individual link operations (by link ID)
router.put(
  '/footer-section/link/:linkId',
  FooterSectionController.updateFooterLink,
);
router.delete(
  '/footer-section/link/:linkId',
  FooterSectionController.removeFooterLink,
);

// ===== PRODUCT OVERVIEW ROUTES =====
router.post(
  '/product-overview',
  upload.single('overviewImage'),
  ProductOverviewController.create,
);
// Bulk operations must be declared BEFORE parameterized routes to avoid conflicts
router.patch(
  '/product-overview/bulk-status',
  ProductOverviewController.bulkUpdateStatus,
);
router.delete(
  '/product-overview/bulk-delete',
  ProductOverviewController.bulkDelete,
);
router.put(
  '/product-overview/:id',
  upload.single('overviewImage'),
  ProductOverviewController.update,
);
router.get('/product-overview', ProductOverviewController.list);
router.delete('/product-overview/:id', ProductOverviewController.remove);

// ===== PRICING SECTION ROUTES =====
router.post('/pricing-section', PricingSectionController.createPricingSection);
router.get('/pricing-section', PricingSectionController.getPricingSections);
router.get(
  '/pricing-section/current',
  PricingSectionController.getCurrentPricingSection,
);
router.put(
  '/pricing-section/:id',
  PricingSectionController.updatePricingSection,
);

// ===== FEATURES SECTION ROUTES =====
router.post('/features', FeaturesController.create);
router.get('/features', FeaturesController.list);
router.patch('/features/bulk-status', FeaturesController.bulkUpdateStatus);
router.delete('/features/bulk-delete', FeaturesController.bulkDelete);
router.delete('/features/:id', FeaturesController.remove);
router.put('/features/:id', FeaturesController.update);
// Bulk operations (declare before :id where applicable)

// ===== BUSINESS TYPES ROUTES =====
router.post('/business-types', BusinessTypesController.create);
router.get('/business-types', BusinessTypesController.list);
// Bulk operations (declare before :id routes)
router.patch(
  '/business-types/bulk-status',
  BusinessTypesController.bulkUpdateStatus,
);
router.delete(
  '/business-types/bulk-delete',
  BusinessTypesController.bulkDelete,
);
router.get('/business-types/:id', BusinessTypesController.get);
router.put('/business-types/:id', BusinessTypesController.update);
router.delete('/business-types/:id', BusinessTypesController.remove);

// ===== PAYMENT GATEWAY CONFIG ROUTES =====
router.post('/payment-config', PaymentGatewayController.createPaymentGateway);
router.get('/payment-config', PaymentGatewayController.getPaymentGateways);
router.get(
  '/payment-config/active',
  PaymentGatewayController.getActiveGateways,
);
router.get('/payment-config/:id', PaymentGatewayController.getPaymentGateway);
router.put(
  '/payment-config/:id',
  PaymentGatewayController.updatePaymentGateway,
);
router.put(
  '/payment-config/:id/credentials',
  PaymentGatewayController.updateCredentials,
);
router.delete(
  '/payment-config/:id',
  PaymentGatewayController.deletePaymentGateway,
);
router.patch(
  '/payment-config/:id/toggle',
  PaymentGatewayController.toggleGatewayStatus,
);
router.get(
  '/payment-config/:provider/public-credentials',
  PaymentGatewayController.getPublicCredentialsForPayment,
);

// ===== CURRENCY ROUTES =====
router.post('/currencies', CurrencyController.createCurrency);
router.get('/currencies', CurrencyController.getAllCurrencies);
router.get('/currencies/primary', CurrencyController.getPrimaryCurrency);
router.put('/currencies/:id', CurrencyController.updateCurrency);
router.patch('/currencies/:id/set-primary', CurrencyController.setAsPrimary);
router.delete('/currencies/:id', CurrencyController.deleteCurrency);

// ===== GOOGLE LOGIN SETTING ROUTES =====
router.get('/google-login', GoogleLoginSettingController.get);
router.put('/google-login', GoogleLoginSettingController.update);
router.patch('/google-login/toggle', GoogleLoginSettingController.toggle);
router.post('/google-login/verify', GoogleLoginSettingController.verify);
router.get('/google-login/status', GoogleLoginSettingController.getStatus);

// ===== GENERAL SETTINGS ROUTES =====
router.post(
  '/general-settings',
  GeneralSettingsController.createOrUpdateSettings,
);
router.get(
  '/general-settings',
  GeneralSettingsController.getCurrentSettings,
);
router.put(
  '/general-settings',
  GeneralSettingsController.updateGeneralSettings,
);

// Logo deletion routes
router.delete(
  '/general-settings/logo/dark',
  GeneralSettingsController.deleteDarkLogo,
);
router.delete(
  '/general-settings/logo/light',
  GeneralSettingsController.deleteLightLogo,
);
router.delete(
  '/general-settings/logo/favicon',
  GeneralSettingsController.deleteFavicon,
);

// ===== GDPR COOKIE SETTINGS ROUTES =====
router.post(
  '/gdpr-cookie-settings',
  GdprCookieSettingsController.createOrUpdateSettings,
);
router.get(
  '/gdpr-cookie-settings',
  GdprCookieSettingsController.getGdprCookieSettings,
);
router.put(
  '/gdpr-cookie-settings',
  GdprCookieSettingsController.updateGdprCookieSettings,
);
router.patch(
  '/gdpr-cookie-settings',
  GdprCookieSettingsController.toggleGdprCookieNotice,
);

// ===== SEO SETTINGS ROUTES =====
router.post(
  '/seo-settings',
  upload.single('seoImage'),
  SeoSettingsController.createOrUpdateSettings,
);
router.get('/seo-settings', SeoSettingsController.getSeoSettings);
router.put(
  '/seo-settings',
  upload.single('seoImage'),
  SeoSettingsController.updateSeoSettings,
);

// Image deletion routes
router.delete('/seo-settings/image/seo', SeoSettingsController.deleteSeoImage);

// ===== LANGUAGE SETTINGS ROUTES =====
router.post(
  '/language-settings',
  LanguageSettingsController.createOrUpdateSettings,
);
router.get(
  '/language-settings',
  LanguageSettingsController.getLanguageSettings,
);
router.get(
  '/language-settings/current',
  LanguageSettingsController.getCurrentSettings,
);
router.get(
  '/language-settings/stats',
  LanguageSettingsController.getLanguageSettingsStats,
);
router.get(
  '/language-settings/languages',
  LanguageSettingsController.getAvailableLanguages,
);
router.get(
  '/language-settings/files',
  LanguageSettingsController.getAvailableFiles,
);
router.put(
  '/language-settings/:id',
  LanguageSettingsController.updateLanguageSettings,
);
router.delete(
  '/language-settings/:id',
  LanguageSettingsController.deleteLanguageSettings,
);

// ===== ADVERTISEMENT ROUTES =====
router.post('/advertisements', AdvertisementController.createAdvertisement);
router.get('/advertisements', AdvertisementController.getAdvertisements);
router.get(
  '/advertisements/stats',
  AdvertisementController.getAdvertisementStats,
);
router.get(
  '/advertisements/active',
  AdvertisementController.getActiveAdvertisements,
);
router.patch(
  '/advertisements/bulk-status',
  AdvertisementController.bulkUpdateStatus,
);
router.delete(
  '/advertisements/bulk-delete',
  AdvertisementController.bulkDelete,
);
router.get(
  '/advertisements/cleanup-expired',
  AdvertisementController.cleanupExpiredAdvertisements,
);
router.get(
  '/advertisements/:placement/:position',
  AdvertisementController.getAdvertisementsByPlacement,
);
router.get('/advertisements/:id', AdvertisementController.getAdvertisementById);
router.put('/advertisements/:id', AdvertisementController.updateAdvertisement);
router.patch(
  '/advertisements/:id/toggle',
  AdvertisementController.toggleAdvertisementStatus,
);
router.patch(
  '/advertisements/:id/click',
  AdvertisementController.incrementClickCount,
);
router.patch(
  '/advertisements/:id/view',
  AdvertisementController.incrementViewCount,
);
router.delete(
  '/advertisements/:id',
  AdvertisementController.deleteAdvertisement,
);

// ===== MISCELLANEOUS SETTINGS ROUTES =====
router.get('/misc-settings', MiscSettingController.getCurrentSettings);
router.put('/misc-settings', MiscSettingController.updateSettings);
router.post('/misc-settings/reset', MiscSettingController.resetToDefaults);
router.patch('/misc-settings/dark-mode', MiscSettingController.toggleDarkMode);
router.patch(
  '/misc-settings/maintenance-mode',
  MiscSettingController.toggleMaintenanceMode,
);

router.post('/notification', NotificationTemplateController.create);
router.get('/notification', NotificationTemplateController.list);
router.get('/notification/:id', NotificationTemplateController.getById);
router.put('/notification/:id', NotificationTemplateController.update);
router.delete('/notification/:id', NotificationTemplateController.remove);
router.patch('/notification/:id/toggle', NotificationTemplateController.toggleStatus);

router.get(
  '/notifications',
  NotificationController.getNotifications,
);
router.get(
  '/notifications/unread-count',
  NotificationController.getUnreadCount,
);
router.get(
  '/notifications/statistics',
  NotificationController.getStatistics,
);
router.patch(
  '/notifications/read-all',
  NotificationController.markAllAsRead,
);
router.patch(
  '/notifications/:id/read',
  NotificationController.markAsRead,
);
router.delete(
  '/notifications/all',
  NotificationController.deleteAllNotifications,
);
router.delete(
  '/notifications/:id',
  NotificationController.deleteNotification,
);


// ===== UPLOAD ROUTES =====
// Single file upload - automatically identifies Cloudinary folder based on fieldname
// Accepts any fieldname (e.g., 'productImage', 'storeImage', 'profilePicture', etc.)
router.post('/upload', upload.any(), UploadController.uploadSingle);
// Multiple files upload - automatically identifies Cloudinary folder based on fieldname
router.post('/upload/multiple', upload.any(), UploadController.uploadMultiple);

router.get('/misc-settings/format-options', MiscSettingController.getFormatOptions);

// ===== SOCIAL MEDIA LINKS ROUTES =====
router.post('/socialMedia', SocialMediaLinksController.createOrUpdateSocialMediaLinks);
router.put('/socialMedia', SocialMediaLinksController.createOrUpdateSocialMediaLinks);
router.get('/socialMedia', SocialMediaLinksController.getSocialMediaLinks);

export default router;
