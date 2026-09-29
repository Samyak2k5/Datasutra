import { Router } from 'express';
import authController from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authRateLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// Public routes with rate limiting
router.post('/register', authRateLimiter, authController.register);
router.post('/google', authRateLimiter, authController.google);
router.post('/login', authRateLimiter, authController.login);
router.post('/logout', authController.logout);

// Protected routes
router.patch('/profile', authenticate, authRateLimiter, authController.updateProfile);
router.get('/me', authenticate, authController.getMe);
router.get('/protected-test', authenticate, authController.protectedTest);

export default router;
