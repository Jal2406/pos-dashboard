import express from 'express';
import auth from './auth.js';
import superadmin from './superadmin.js';
import passport from 'passport';
import admin from './admin.js';
import manager from './manager.js';
import cashier from './cashier.js';
import ragRoutes from './rag.routes.js';
import { StatusCodes } from 'http-status-codes';
import { ResponseService, AuthMiddleware } from '../utils/index.js';
import populateRequestContext from '../middleware/requestContext.middleware.js';
import {
  BusinessCategoryController,
  FaqController,
  PlanController,
  BlogController,
  HeroSectionController,
  FooterSectionController,
  BusinessTypesController,
  FeaturesController,
  ProductOverviewController,
  GeneralSettingsController,
  GdprCookieSettingsController,
  InvoiceSettingController,
  AdvertisementController,
  MiscSettingController,
  FaqCategoryController,
  SocialMediaLinksController,
} from '../controller/index.js';

const router = express.Router();

router.use('/auth', auth);

// Apply authentication logging middleware
router.use(AuthMiddleware.logAuthAttempts());

// RBAC: Populate request context for all authenticated routes
// This makes user context available to services via AsyncLocalStorage
// MUST run after auth middleware but before route handlers
router.use(populateRequestContext);

// Superadmin routes - requires superadmin role
router.use('/super-admin', AuthMiddleware.requireSuperadmin(), superadmin);

// RAG routes - public access for landing page widget, protected for admin operations
router.use('/rag', ragRoutes);

// Admin routes - requires admin or superadmin role
router.use('/admin', AuthMiddleware.requireAdmin(), admin);

// Manager routes - requires manager, admin, or superadmin role
router.use('/manager', AuthMiddleware.requireManager(), manager);

// Cashier routes - requires any role (cashier, manager, admin, or superadmin)
router.use('/cashier', AuthMiddleware.requireCashier(), cashier);

// Public Routes without Redis Caching
router.get('/faqs', FaqController.get);
router.get('/business-categories', BusinessCategoryController.listPublic);
router.get('/plans', PlanController.getPlan);
router.get('/plans/trialDays', PlanController.getTrialDays);
router.get('/plans/:id', PlanController.getPlanById);

// Public Blog Routes
router.get('/blogs', BlogController.getPublishedBlogs);
router.get('/blogs/popular', BlogController.getPopularBlogs);
router.get('/blogs/:id', BlogController.getBlogById);
router.get('/blogs/slug/:slug', BlogController.getBlogBySlug);
router.get('/blogs/tags/:tags', BlogController.getBlogsByTags);

router.get('/hero-section', HeroSectionController.getCurrentHeroSection);

router.get('/general-settings', GeneralSettingsController.getCurrentSettings);

router.get('/footer-section', FooterSectionController.getCurrentFooterSection);

// Public GDPR Cookie Settings
router.get(
  '/gdpr-cookie-settings',
  GdprCookieSettingsController.getGdprCookieSettings,
);

// Public Business Types
router.get('/business-types', BusinessTypesController.listPublic);

// Public Features
router.get('/features', FeaturesController.listPublic);

// Public Product Overview
router.get('/product-overview', ProductOverviewController.listPublic);

// Public Invoice Settings Routes
router.get('/invoice-settings', InvoiceSettingController.list);
router.get(
  '/invoice-settings/next-order-number',
  InvoiceSettingController.getNextOrderNumber,
);

// Public Advertisement Routes
router.get('/advertisements', AdvertisementController.getActiveAdvertisements);
router.patch(
  '/advertisements/:id/click',
  AdvertisementController.incrementClickCount,
);
router.patch(
  '/advertisements/:id/view',
  AdvertisementController.incrementViewCount,
);

router.get('/misc-settings', MiscSettingController.getCurrentSettings);
router.get('/faq-categories', FaqCategoryController.getActive);
router.get(
  '/socialMedia',
  SocialMediaLinksController.getCurrentSocialMediaLinks,
);

export default router;
