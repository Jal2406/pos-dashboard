import dotenv from 'dotenv';
import Passport from 'passport';
import { User } from '../models/index.js';
import { Strategy as jwtStrategy } from 'passport-jwt';
import { Strategy as LocalStrategy } from 'passport-local';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Role } from '../models/index.js';

dotenv.config();

// JWT token extraction function that checks signed cookies first, then regular cookies
const cookieExtractor = (req) => {
  let token = null;

  // Check signed cookies first (since we use signed: true in setAuthCookies)
  if (req && req.signedCookies && req.signedCookies['accessToken']) {
    token = req.signedCookies['accessToken'];
  }
  // Fallback to regular cookies
  else if (req && req.cookies && req.cookies['accessToken']) {
    token = req.cookies['accessToken'];
  }

  return token;
};

// Custom JWT extractor that tries signed cookies first, then regular cookies, then Authorization header
const jwtFromRequestWithCookieFallback = (req) => {
  // First check for token in signed cookies
  if (req && req.signedCookies && req.signedCookies['accessToken']) {
    return req.signedCookies['accessToken'];
  }

  // Then check regular cookies
  if (req && req.cookies && req.cookies['accessToken']) {
    return req.cookies['accessToken'];
  }

  // Fall back to Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }

  return null;
};

const opts = {
  jwtFromRequest: jwtFromRequestWithCookieFallback,
  secretOrKey: process.env.JWT_SECRET_SUPERADMIN,
};

const adminOpts = {
  jwtFromRequest: jwtFromRequestWithCookieFallback,
  secretOrKey: process.env.JWT_SECRET_ADMIN,
};

const managerOpts = {
  jwtFromRequest: jwtFromRequestWithCookieFallback,
  secretOrKey: process.env.JWT_SECRET_MANAGER,
};

const cashierOpts = {
  jwtFromRequest: jwtFromRequestWithCookieFallback,
  secretOrKey: process.env.JWT_SECRET_CASHIER,
};

Passport.use(
  new jwtStrategy(opts, async (record, done) => {
    try {
      const data = await User.findById(record.user._id).populate('roleId');

      if (data && data.roleId.name === 'superadmin') {
        return done(null, data);
      } else {
        return done(null, false, { message: 'Unauthorized access' });
      }
    } catch (error) {
      return done(error, false);
    }
  }),
);

Passport.use(
  'admin',
  new jwtStrategy(adminOpts, async (record, done) => {
    try {
      const data = await User.findById(record.user._id).populate('roleId');

      if (data && data.roleId.name === 'admin') {
        return done(null, data);
      } else {
        return done(null, false, { message: 'Unauthorized access' });
      }
    } catch (error) {
      return done(error, false);
    }
  }),
);

Passport.use(
  'manager',
  new jwtStrategy(managerOpts, async (record, done) => {
    try {
      const data = await User.findById(record.user._id).populate('roleId');
      if (
        (data && data.roleId.name === 'manager') ||
        data.roleId.name === 'admin'
      ) {
        return done(null, data);
      } else {
        return done(null, false, { message: 'Unauthorized access' });
      }
    } catch (error) {
      return done(error, false);
    }
  }),
);

Passport.use(
  'cashier',
  new jwtStrategy(cashierOpts, async (record, done) => {
    try {
      const data = await User.findById(record.user._id).populate('roleId');
      if (
        (data && data.roleId.name === 'cashier') ||
        data.roleId.name === 'admin'
      ) {
        return done(null, data);
      } else {
        return done(null, false, { message: 'Unauthorized access' });
      }
    } catch (error) {
      return done(error, false);
    }
  }),
);

// Local strategy for username/password authentication
Passport.use(
  'local',
  new LocalStrategy(
    { usernameField: 'email', passwordField: 'password' },
    async (email, password, done) => {
      try {
        // This strategy will be handled by the login controller
        // It's defined here for completeness but actual auth happens in auth.services.js
        return done(null, false, { message: 'Use the login endpoint instead' });
      } catch (error) {
        return done(error);
      }
    },
  ),
);

// Serialize user into the session - store only the user ID for security
Passport.serializeUser((user, done) => {
  const userId = user._id || user.id;

  if (!userId) {
    console.error('[PASSPORT] ❌ serializeUser failed - no user ID');
    return done(new Error('Cannot serialize user: no ID found'));
  }

  const userIdString = userId.toString ? userId.toString() : String(userId);
  return done(null, userIdString);
});

// Deserialize user from session ID - called on every request with a valid session
Passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id).populate('roleId');
    if (!user) {
      return done(null, false, { message: 'User not found' });
    }
    return done(null, user);
  } catch (error) {
    console.error(`[PASSPORT] ❌ deserializeUser error:`, error.message);
    return done(error, false);
  }
});

// Google OAuth Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  Passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL:
          process.env.GOOGLE_CALLBACK_URL || '/api/v2/auth/google/callback',
        passReqToCallback: true,
      },
      async (req, accessToken, refreshToken, profile, done) => {
        try {
          const googleId = profile.id;
          const email = (profile.emails && profile.emails[0]?.value) || null;
          const name =
            profile.displayName ||
            `${profile.name?.givenName || ''} ${profile.name?.familyName || ''
              }`.trim();
          const photo = (profile.photos && profile.photos[0]?.value) || null;

          // Try find by googleId first
          let user = await User.findOne({ googleId }).populate('roleId');

          // If not found, fallback to email match
          if (!user && email) {
            user = await User.findOne({ email }).populate('roleId');
          }

          // Create new user if needed
          if (!user) {
            const defaultRoleId = 2; // admin by default like register() fallback
            user = await User.create({
              name: name || 'Google User',
              email,
              provider: 'google',
              googleId,
              phone: undefined,
              roleId: defaultRoleId,
              isActive: false,
              emailVerified: true,
              profilePicture: photo,
            });

            // Populate role for downstream logic
            user = await User.findById(user._id).populate('roleId');
          } else {
            // Ensure google fields are up to date but preserve existing role
            const updates = {};
            if (!user.googleId) {
              updates.googleId = googleId;
            }
            if (photo && user.profilePicture !== photo) {
              updates.profilePicture = photo;
            }
            if (user.provider !== 'google') {
              updates.provider = 'google';
            }
            if (!user.emailVerified) {
              updates.emailVerified = true;
            }

            // IMPORTANT: Do NOT update roleId here to preserve admin/manager assigned roles
            // The roleId should only be changed by admin/manager role assignment, not by Google signin

            if (Object.keys(updates).length) {
              await User.updateOne({ _id: user._id }, { $set: updates });
              user = await User.findById(user._id).populate('roleId');
            }
          }

          return done(null, user);
        } catch (error) {
          return done(error, false);
        }
      },
    ),
  );
}

export default Passport;
