import ApiResponse from '../utils/apiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import authService from '../services/auth.service.js';

/**
 * Register a new user
 * POST /api/v1/auth/register
 */
export const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body);
  return ApiResponse.success(res, 'User registered successfully.', result, 201);
});

/**
 * Authenticate user and issue JWT
 * POST /api/v1/auth/login
 */
export const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body);
  return ApiResponse.success(res, 'Login successful.', result, 200);
});

/**
 * Handle user logout (instructs client to purge stateless token)
 * POST /api/v1/auth/logout
 */
export const logout = asyncHandler(async (req, res) => {
  return ApiResponse.success(
    res,
    'Logged out successfully. Please remove the access token from client storage.',
    { loggedOut: true },
    200
  );
});

/**
 * Get current authenticated user profile
 * GET /api/v1/auth/me
 */
export const getMe = asyncHandler(async (req, res) => {
  return ApiResponse.success(
    res,
    'Authenticated user retrieved successfully.',
    { user: req.user },
    200
  );
});

/**
 * Protected test endpoint for authentication verification
 * GET /api/v1/auth/protected-test
 */
export const protectedTest = asyncHandler(async (req, res) => {
  return ApiResponse.success(
    res,
    'Authentication middleware is working.',
    {
      userId: req.user.id,
      role: req.user.role
    },
    200
  );
});

export default {
  register,
  login,
  logout,
  getMe,
  protectedTest
};
