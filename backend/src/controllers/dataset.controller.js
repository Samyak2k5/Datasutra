import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/apiResponse.js';
import ApiError from '../utils/apiError.js';
import datasetService from '../services/dataset.service.js';
import cleaningService from '../services/cleaning.service.js';

/**
 * Handle dataset file upload (CSV / XLSX).
 * POST /api/v1/datasets
 */
export const uploadDataset = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw ApiError.badRequest('File is required. Please upload a CSV or XLSX file using form field "file".');
  }

  const dataset = await datasetService.createDataset({
    userId: req.user.id,
    file: req.file,
    name: req.body?.name
  });

  return ApiResponse.success(res, 'Dataset uploaded successfully', dataset, 201);
});

/**
 * Handle dataset import from JSON API endpoint.
 * POST /api/v1/datasets/import/json-api
 */
export const importJsonApi = asyncHandler(async (req, res) => {
  const { url, name, recordPath, bearerToken, apiKey, headers, pagination } = req.body || {};

  if (!url) {
    throw ApiError.badRequest('API URL is required for JSON API import.');
  }

  const dataset = await datasetService.importJsonApiDataset({
    userId: req.user.id,
    url,
    name,
    recordPath,
    bearerToken,
    apiKey,
    headers,
    pagination
  });

  return ApiResponse.success(res, 'JSON API dataset imported successfully', dataset, 201);
});

/**
 * List all datasets for the authenticated user.
 * GET /api/v1/datasets
 */
export const listDatasets = asyncHandler(async (req, res) => {
  const datasets = await datasetService.getUserDatasets(req.user.id);
  return ApiResponse.success(res, 'Datasets retrieved successfully', datasets);
});

/**
 * Get a specific dataset by ID for the authenticated user.
 * GET /api/v1/datasets/:id
 */
export const getDataset = asyncHandler(async (req, res) => {
  const dataset = await datasetService.getDatasetById(req.params.id, req.user.id);
  return ApiResponse.success(res, 'Dataset retrieved successfully', dataset);
});

/**
 * Delete a specific dataset and its underlying file for the authenticated user.
 * DELETE /api/v1/datasets/:id
 */
export const deleteDataset = asyncHandler(async (req, res) => {
  const result = await datasetService.deleteDataset(req.params.id, req.user.id);
  return ApiResponse.success(res, 'Dataset deleted successfully', result);
});

/**
 * Trigger parsing for an uploaded dataset.
 * POST /api/v1/datasets/:id/parse
 */
export const parseDataset = asyncHandler(async (req, res) => {
  const updatedDataset = await datasetService.parseDataset(req.params.id, req.user.id);
  return ApiResponse.success(
    res,
    'Dataset parsed successfully.',
    {
      dataset: {
        id: updatedDataset._id ? updatedDataset._id.toString() : updatedDataset.id,
        name: updatedDataset.name,
        status: updatedDataset.status,
        totalRows: updatedDataset.totalRows,
        totalColumns: updatedDataset.totalColumns
      }
    },
    200
  );
});

/**
 * Retrieve data preview for a parsed dataset.
 * GET /api/v1/datasets/:id/preview?limit=20
 */
export const getPreview = asyncHandler(async (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit, 10) : 20;
  const preview = await datasetService.getDatasetPreview(req.params.id, req.user.id, limit);
  return ApiResponse.success(res, 'Dataset preview retrieved successfully.', preview, 200);
});

/**
 * Execute deterministic data cleaning on an uploaded, parsed dataset.
 * POST /api/v1/datasets/:id/clean
 */
export const cleanDataset = asyncHandler(async (req, res) => {
  const result = await cleaningService.cleanDataset(
    req.params.id,
    req.user.id,
    req.body || {}
  );
  return ApiResponse.success(
    res,
    'Dataset cleaned successfully using deterministic rules.',
    result,
    200
  );
});

export default {
  uploadDataset,
  importJsonApi,
  listDatasets,
  getDataset,
  deleteDataset,
  parseDataset,
  getPreview,
  cleanDataset
};
