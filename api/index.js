import dns from 'node:dns/promises';
import session from 'express-session';
import passport from 'passport';
import app, { sessionConfig } from '../app.js';
import connectDB from '../src/config/db.js';
import { TokenUtils } from '../src/utils/index.js';
import MongoStore from 'connect-mongo';
import mongoose from 'mongoose';
import { resolveTenantFromSubdomain } from '../src/middleware/subdomainTenantResolver.js';

const schedulerEnabled = process.env.NOTIFICATION_SCHEDULER_DISABLED !== 'true';
let isInitialized = false;
console.log('Node version:', process.version);


/**
 * Initialize the Express app for Vercel serverless environment
 */
const initializeApp = async () => {
  if (isInitialized) {
    return app;
  }

  try {
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
    const { default: MaintenanceModeMiddleware } = await import(
      '../src/middleware/maintenanceMode.middleware.js'
    );
    app.use(MaintenanceModeMiddleware.checkMaintenanceMode());

    app.use(resolveTenantFromSubdomain);

    app.get('/', (_, res) => {
      res.status(200).send('OK');
    });

    // Load and register API routes
    const { default: API } = await import('../src/routes/index.js');
    app.use('/api/v2', API);

    // Notification scheduler is disabled in serverless environment (NOTIFICATION_SCHEDULER_DISABLED=true)
    if (!schedulerEnabled) {
      console.log('✓ Notification scheduler disabled for serverless');
    }

    isInitialized = true;
  } catch (error) {
    console.error('Failed to initialize app:', error);
    throw error;
  }

  return app;
};

/**
 * Vercel Serverless Handler
 * Exports the Express app as a handler for Vercel's Node.js runtime
 */
export default async (req, res) => {
  try {
    const expressApp = await initializeApp();
    expressApp(req, res);
  } catch (error) {
    console.error('Error in request handler:', error);
    res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: error.message,
    });
  }
};
