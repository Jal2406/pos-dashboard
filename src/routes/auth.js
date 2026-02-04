import express from 'express';
const router = express.Router();
import { AuthController, CouponController } from '../controller/index.js';
import {
  ResponseService,
  upload,
  TokenUtils,
  AuthMiddleware,
} from '../utils/index.js';
import passport from 'passport';
import { StatusCodes } from 'http-status-codes';
import cookieParser from 'cookie-parser';

// Use cookie parser middleware
router.use(cookieParser());

// Public routes
router.post(
  '/register',
  upload.fields([{ name: 'profilePicture', maxCount: 1 }]),
  AuthController.Register,
);
router.post('/login', AuthController.Login);
router.get('/session-status', AuthController.SessionStatus);
router.post('/forgotPassword', AuthController.ForgotPassword);
router.post('/verifyOtp', AuthController.VerifyOtp);
router.post('/resetPassword', AuthController.ResetPassword);

// Token management
router.post('/refresh', AuthController.RefreshToken);
router.post('/logout', AuthController.Logout);

// Google OAuth
router.get('/google', (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return ResponseService.send(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
    );
  }
  return passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account',
  })(req, res, next);
});

router.get(
  '/google/callback',
  (req, res, next) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return ResponseService.send(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
      );
    }
    return passport.authenticate('google', {
      failureRedirect: '/auth/login?error=google',
    })(req, res, next);
  },
  AuthController.GoogleOAuthCallback,
);

// Protected routes - using unified authentication middleware
router.get('/me', AuthMiddleware.authenticate(), AuthController.GetCurrentUser);
router.put(
  '/editProfile/:id',
  AuthMiddleware.authenticate(),
  upload.single('profilePicture'),
  AuthController.EditProfile,
);
router.post(
  '/logout-all',
  AuthMiddleware.authenticate(),
  AuthController.LogoutAllDevices,
);
router.post(
  '/changePassword',
  AuthMiddleware.authenticate(),
  AuthController.ChangePassword,
);

export default router;
