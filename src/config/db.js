import mongoose from 'mongoose';

// Don't buffer when offline
mongoose.set('bufferCommands', false);

// Retry configuration (configurable via env vars)
const BASE_DELAY_MS = parseInt(
  process.env.MONGODB_RETRY_BASE_DELAY_MS || '5000',
  10,
);
const MAX_DELAY_MS = parseInt(
  process.env.MONGODB_RETRY_MAX_DELAY_MS || '60000',
  10,
);
const MAX_RETRIES = parseInt(
  process.env.MONGODB_RETRY_MAX_ATTEMPTS || '10',
  10,
);
const JITTER_MAX_MS = parseInt(
  process.env.MONGODB_RETRY_JITTER_MS || '1000',
  10,
);

// Track retry attempts across recursive calls
let retryAttempt = 0;

/**
 * Calculate exponential backoff delay with jitter
 * @param {number} attempt - Current retry attempt (1-indexed)
 * @returns {number} Delay in milliseconds
 */
const calculateBackoffDelay = (attempt) => {
  // Exponential backoff: baseDelay * 2^(attempt-1)
  const exponentialDelay = BASE_DELAY_MS * Math.pow(2, attempt - 1);

  // Add random jitter (0 to JITTER_MAX_MS)
  const jitter = Math.floor(Math.random() * JITTER_MAX_MS);

  // Cap at maxDelay
  const delay = Math.min(exponentialDelay + jitter, MAX_DELAY_MS);

  return delay;
};

const connectDB = async () => {
  // Check if already connected
  if (mongoose.connection.readyState === 1) {
    console.log('🟢 MongoDB already connected');
    retryAttempt = 0;
    return;
  }

  // Retry loop
  while (retryAttempt < MAX_RETRIES) {
    try {
      await mongoose.connect(process.env.MONGO_URI, {
        maxPoolSize: 7,
        minPoolSize: 2, // Maintain minimum connections
        serverSelectionTimeoutMS: 30000, // Increased from 10s to 30s
        socketTimeoutMS: 60000, // Increased from 45s to 60s
        connectTimeoutMS: 30000, // Add connection timeout
        retryWrites: true,
        retryReads: true, // Enable retry for reads too
        heartbeatFrequencyMS: 5000, // Check connection health more frequently
        maxIdleTimeMS: 60000, // Keep connections alive longer
      });

      console.log(`🟢 MongoDB Connected: ${mongoose.connection.host}`);
      retryAttempt = 0; // Reset on success
      return; // Successfully connected
    } catch (err) {
      retryAttempt++;

      console.error(
        `🔴 MongoDB connection failed (attempt ${retryAttempt}/${MAX_RETRIES}):`,
        err.message,
      );

      // Check if we've exceeded max retries
      if (retryAttempt >= MAX_RETRIES) {
        console.error(
          `❌ MongoDB connection failed after ${MAX_RETRIES} attempts. Exiting...`,
        );
        throw new Error(`MongoDB connection failed after ${MAX_RETRIES} attempts`);
      }

      // Calculate exponential backoff delay with jitter
      const delay = calculateBackoffDelay(retryAttempt);

      console.log(
        `♻️ Retrying MongoDB connection in ${Math.round(delay / 1000)}s (attempt ${retryAttempt}/${MAX_RETRIES})...`,
      );

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

// Register events ONCE (not inside function)
mongoose.connection.on('connected', () => console.log('🔄 MongoDB connected', mongoose.connection.host));
mongoose.connection.on('disconnected', () =>
  console.log('🟡 MongoDB disconnected', mongoose.connection.host),
);
mongoose.connection.on('reconnected', () =>
  console.log('🟢 MongoDB reconnected', mongoose.connection.host),
);
mongoose.connection.on('error', (err) =>
  console.error('❗ MongoDB error:', err.message),
);

export default connectDB;
