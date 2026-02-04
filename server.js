import dns from 'node:dns/promises';
import session from 'express-session';
import passport from 'passport';
import app, { sessionConfig } from './app.js';
import connectDB from './src/config/db.js';
import {
  seedRoles,
  seedDemoUsers,
  seedDefaultCurrencies,
  seedHeroSection,
  seedMiscSettings,
  seedTaxes,
  seedProductOverview,
  seedSocialMediaLinks,
  seedFooterSection,
  seedFaqCategories,
  seedFaqs,
  seedNotificationTemplates,
} from './src/seeders/index.js';
import { TokenUtils } from './src/utils/index.js';
import MongoStore from 'connect-mongo';
import mongoose from 'mongoose';
import NotificationSchedulerService from './src/services/notification/notificationScheduler.service.js';
import { resolveTenantFromSubdomain } from './src/middleware/subdomainTenantResolver.js';

/**
 * Test DNS resolution for MongoDB connection
 */
async function testDNS() {
  try {
    const records = await dns.resolveSrv(
      '_mongodb._tcp.cluster0.mifyj8v.mongodb.net',
    );
    console.log('DNS SRV records:', records);
  } catch (err) {
    console.warn('⚠️ DNS resolution warning:', err.message);
    console.warn('⚠️ Proceeding with connection attempt anyway...');
    // Don't exit - let mongoose handle the connection
  }
}

const schedulerEnabled = process.env.NOTIFICATION_SCHEDULER_DISABLED !== 'true';
const notificationScheduler = schedulerEnabled
  ? new NotificationSchedulerService({
    logger: console,
  })
  : null;

/**
 * Start the server
 */
const startServer = async () => {
  try {
    // Test DNS resolution
    await testDNS();
    const sessionMaxAgeMs =
      Number(process.env.SESSION_MAX_AGE) || 24 * 60 * 60 * 1000;

    // Connect to database
    await connectDB();
    const store = MongoStore.create({
      client: mongoose.connection.getClient(),
      touchAfter: 24 * 3600,
      ttl: Math.floor(sessionMaxAgeMs / 1000),
      autoIndex: false,
    });

    // Apply session middleware after database connection
    app.use(session({ ...sessionConfig, store }));
    app.use(passport.initialize());
    app.use(passport.session());

    // Session validation and activity tracking middleware
    app.use(TokenUtils.sessionValidationMiddleware());

    // Maintenance mode middleware - blocks non-superadmin access during maintenance
    const { default: MaintenanceModeMiddleware } =
      await import('./src/middleware/maintenanceMode.middleware.js');
    app.use(MaintenanceModeMiddleware.checkMaintenanceMode());

    // Seed database with initial data
    await Promise.all([
      seedRoles(),
      seedDemoUsers(),
      seedDefaultCurrencies(),
      seedHeroSection(),
      seedMiscSettings(),
      seedTaxes(),
      seedProductOverview(),
      seedSocialMediaLinks(),
      seedFooterSection(),
      seedFaqCategories(),
      seedFaqs(),
      // seedNotificationTemplates(),
    ]);

    app.use(resolveTenantFromSubdomain)

    // Load and register API routes
    const { default: API } = await import('./src/routes/index.js');
    app.use('/api/v2', API);

    if (schedulerEnabled && notificationScheduler) {
      try {
        await notificationScheduler.init();
        console.log('Notification scheduler initialized');
      } catch (schedulerError) {
        console.error(
          'Failed to initialize notification scheduler',
          schedulerError,
        );
      }
    }

    // Start HTTP server
    const port = process.env.PORT;

    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();
