import ApiResponse from '../utils/apiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import healthService from '../services/health.service.js';

/**
 * Controller to handle health check requests
 */
export const getHealth = asyncHandler(async (req, res) => {
  const diagnostics = healthService.getHealthDiagnostics();
  return ApiResponse.success(res, 'DataSutra Backend API is healthy and operational.', diagnostics, 200);
});

export default {
  getHealth
};
