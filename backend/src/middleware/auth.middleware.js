import jwt from 'jsonwebtoken';
import { verifyToken } from '../utils/jwt.js';
import User from '../models/User.js';
import ApiError from '../utils/apiError.js';
import asyncHandler from '../utils/asyncHandler.js';

/**
 * Authentication Middleware
 * Validates incoming Bearer token, verifies user existence & status in MongoDB,
 * and attaches sanitized user to req.user.
 */
export const authenticate = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;

  // 1. Check for Authorization header
  if (!authHeader) {
    throw ApiError.unauthorized('Authentication required. Missing Authorization header.');
  }

  // 2. Validate Bearer format
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1].trim()) {
    throw ApiError.unauthorized('Malformed authorization header. Expected: Bearer <token>');
  }

  const token = parts[1].trim();

  // 3. Verify JWT
  let decoded;
  try {
    decoded = verifyToken(token);
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw ApiError.unauthorized('Authentication token has expired. Please log in again.');
    }
    if (err instanceof jwt.JsonWebTokenError) {
      throw ApiError.unauthorized('Invalid authentication token.');
    }
    throw ApiError.unauthorized('Authentication token verification failed.');
  }

  // 4. Validate payload subject
  if (!decoded || !decoded.sub) {
    throw ApiError.unauthorized('Invalid token claims.');
  }

  // 5. Verify user exists in MongoDB
  const user = await User.findById(decoded.sub);
  if (!user) {
    throw ApiError.unauthorized('The user belonging to this token no longer exists.');
  }

  // 6. Verify user is active
  if (!user.isActive) {
    throw new ApiError(403, 'Account is deactivated. Please contact support.');
  }

  // 7. Attach sanitized user to request
  req.user = user.toJSON();

  next();
});

/**
 * Role-based authorization middleware
 * @param  {...string} roles Allowed roles (e.g. 'admin', 'user')
 */
export const authorize = (...roles) => (req, res, next) => {
  if (!req.user) {
    return next(ApiError.unauthorized('Authentication required.'));
  }

  if (roles.length && !roles.includes(req.user.role)) {
    return next(new ApiError(403, `Access denied. Requires one of: ${roles.join(', ')}`));
  }

  next();
};

export default {
  authenticate,
  authorize
};
