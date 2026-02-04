import express from 'express';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import hpp from 'hpp';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import './src/config/passport.js'; // Import passport configuration to register strategies

dotenv.config();

// CORS Configuration – set CORS_ALLOWED_ORIGINS in .env (comma-separated)
const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : [];

// Initialize Express App
const app = express();

// Basic Middleware
app.use(morgan('dev'));
app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : 0);

// Security Middleware
app.use(helmet());
app.use(hpp());
app.use(compression());

// Body Parser Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request Sanitization Middleware
app.use((req, res, next) => {
  // Sanitize request body
  if (req.body) {
    Object.keys(req.body).forEach((key) => {
      if (key.startsWith('$')) {
        delete req.body[key];
      }
    });
  }

  // Sanitize query parameters
  if (req.query) {
    Object.keys(req.query).forEach((key) => {
      if (key.startsWith('$')) {
        delete req.query[key];
      }
    });
  }

  next();
});

// Cookie Parser Middleware
app.use(cookieParser(process.env.COOKIE_SECRET || 'secret-key'));

// CORS Middleware
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        // Allow non-browser tools like Postman or curl
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.warn('❌ Blocked by CORS:', origin);
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-Id'],
  }),
);
const isLoad = process.env.LOAD_TEST === 'true';

// Rate Limiting Middleware
if (!isLoad) {
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.headers['x-load-test'] === 'true',
  });
  app.use(apiLimiter);
}

const DEFAULT_SESSION_MAX_AGE = 24 * 60 * 60 * 1000;
const envSessionMaxAge = process.env.SESSION_MAX_AGE;
const hasSessionMaxAge = typeof envSessionMaxAge === 'string';
const parsedSessionMaxAge = hasSessionMaxAge
  ? Number.parseInt(envSessionMaxAge, 10)
  : Number.NaN;

if (hasSessionMaxAge && Number.isNaN(parsedSessionMaxAge)) {
  console.warn(
    'Invalid SESSION_MAX_AGE provided. Falling back to default (24h).',
  );
}

const sessionMaxAge =
  hasSessionMaxAge && !Number.isNaN(parsedSessionMaxAge)
    ? parsedSessionMaxAge
    : DEFAULT_SESSION_MAX_AGE;

// Session Configuration (base config without store)
// Store will be added after DB connection in server.js
export const sessionConfig = {
  name: process.env.SESSION_NAME || 'pos.sid',
  secret: process.env.SESSION_SECRET || 'super-secret-key',
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    maxAge: sessionMaxAge,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    // domain:
    //   process.env.NODE_ENV === 'production'
    //     ? process.env.COOKIE_DOMAIN || undefined
    //     : undefined,
  },
};

export default app;
