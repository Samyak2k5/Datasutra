import CleaningJob from '../models/CleaningJob.js';
import Dataset from '../models/Dataset.js';
import reviewService from '../services/review.service.js';
import qualityAnalyticsService from '../services/qualityAnalytics.service.js';
import exportService from '../services/export.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import ApiError from '../utils/apiError.js';

/**
 * Controller for CleaningJob operations, reports, review workflows, and export.
 */

/**
 * List all cleaning jobs owned by the authenticated user.
 * GET /api/v1/cleaning-jobs
 */
export const listCleaningJobs = asyncHandler(async (req, res) => {
  const userId = req.user.id || req.user._id;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const filter = { owner: userId };
  if (req.query.datasetId) {
    filter.dataset = req.query.datasetId;
  }
  if (req.query.status) {
    filter.status = req.query.status;
  }

  const [jobs, total] = await Promise.all([
    CleaningJob.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('dataset', 'name originalFileName originalName fileType sourceFormat totalRows status')
      .lean(),
    CleaningJob.countDocuments(filter)
  ]);

  const transformed = jobs.map((j) => ({
    id: j._id.toString(),
    datasetId: j.dataset?._id?.toString() || j.dataset?.toString(),
    datasetName: j.dataset?.name || j.dataset?.originalFileName || j.dataset?.originalName || 'Dataset',
    status: j.status,
    cleaningMode: j.cleaningMode,
    totalRecords: j.totalRecords,
    cleanedRecords: j.cleanedRecords,
    modifiedRecords: j.modifiedRecords,
    duplicateRecords: j.duplicateRecords,
    missingValueRecords: j.missingValueRecords,
    aiCandidates: j.aiCandidates,
    aiApplied: j.aiApplied,
    qualityScore: j.qualityScore?.overall ?? 100,
    progressPercent: j.progressPercent,
    currentBatch: j.currentBatch,
    totalBatches: j.totalBatches,
    processingMode: j.processingMode,
    reviewCount: (j.reviewItems || []).filter((i) => i.status === 'pending').length,
    startedAt: j.startedAt,
    completedAt: j.completedAt,
    createdAt: j.createdAt
  }));

  return ApiResponse.success(
    res,
    'Cleaning jobs retrieved successfully.',
    {
      jobs: transformed,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1
      }
    }
  );
});

/**
 * Get a single cleaning job by ID.
 * GET /api/v1/cleaning-jobs/:jobId
 */
export const getCleaningJob = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  const userId = req.user.id || req.user._id;

  const job = await CleaningJob.findById(jobId)
    .populate('dataset', 'name originalFileName originalName fileType sourceFormat totalRows columns')
    .lean();

  if (!job) {
    throw ApiError.notFound('Cleaning job not found.');
  }

  if (job.owner.toString() !== userId.toString()) {
    throw ApiError.forbidden('Access denied. You do not own this cleaning job.');
  }

  return ApiResponse.success(res, 'Cleaning job retrieved successfully.', { job });
});

/**
 * Get detailed cleaning report and quality analytics.
 * GET /api/v1/cleaning-jobs/:jobId/report
 */
export const getCleaningJobReport = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  const userId = req.user.id || req.user._id;

  const job = await CleaningJob.findById(jobId).lean();
  if (!job) {
    throw ApiError.notFound('Cleaning job not found.');
  }

  if (job.owner.toString() !== userId.toString()) {
    throw ApiError.forbidden('Access denied. You do not own this cleaning job.');
  }

  const dataset = await Dataset.findById(job.dataset).lean();

  const reportPayload = {
    jobId: job._id.toString(),
    dataset: {
      id: dataset?._id?.toString(),
      name: dataset?.name || dataset?.originalFileName || dataset?.originalName,
      originalName: dataset?.originalFileName || dataset?.originalName || dataset?.name,
      sourceFormat: dataset?.sourceFormat || dataset?.fileType,
      totalRows: dataset?.totalRows,
      pageCount: dataset?.pageCount || null,
      tableCount: dataset?.tableCount || null
    },
    status: job.status,
    cleaningMode: job.cleaningMode,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    sourceFormat: dataset?.sourceFormat || dataset?.fileType || 'csv',
    durationMs: job.completedAt && job.startedAt ? new Date(job.completedAt) - new Date(job.startedAt) : 0,
    processingDuration: job.completedAt && job.startedAt ? new Date(job.completedAt) - new Date(job.startedAt) : 0,
    batchInformation: {
      currentBatch: job.currentBatch || 1,
      totalBatches: job.totalBatches || 1,
      batchSize: job.batchSize || 500,
      processingMode: job.processingMode || 'in_memory'
    },
    parserWarnings: Array.isArray(dataset?.warnings) ? dataset.warnings.length : (job.metrics?.parserWarnings || 0),
    extractionWarnings: job.extractionMetrics?.warningCount || job.metrics?.extractionWarnings || 0,
    qualityScore: job.qualityScore || { overall: 100 },
    fieldQuality: job.fieldQuality || [],
    metrics: job.metrics || {
      totalRows: job.totalRecords,
      cleanRows: job.cleanedRecords,
      modifiedRows: job.modifiedRecords,
      duplicateRows: job.duplicateRecords,
      reviewRows: job.unresolvedRecords,
      invalidRows: job.errorCount
    },
    duplicateReport: {
      totalGroups: job.totalDuplicateGroups || 0,
      duplicateRows: job.duplicateRecords || 0,
      groups: job.duplicateGroups || []
    },
    missingReport: {
      missingValueCount: job.missingValueRecords || 0,
      rowsWithMissingValues: job.rowsWithMissingValues || 0,
      resolvedMissingValues: job.resolvedMissingValues || 0,
      unresolvedMissingValues: job.unresolvedMissingValues || 0,
      imputedFieldCount: job.imputedFieldCount || 0,
      fieldsImputed: job.fieldsImputed || {}
    },
    aiReport: {
      candidates: job.aiCandidates || 0,
      processed: job.aiProcessed || 0,
      suggestions: job.aiSuggestions || 0,
      applied: job.aiApplied || 0,
      rejected: job.aiRejected || 0,
      needsReview: job.aiNeedsReview || 0,
      failed: job.aiFailed || 0,
      provider: job.aiProvider || null,
      model: job.aiModel || null,
      usage: job.aiUsage || {}
    },
    reviewSummary: {
      total: (job.reviewItems || []).length,
      pending: (job.reviewItems || []).filter((i) => i.status === 'pending').length,
      accepted: (job.reviewItems || []).filter((i) => i.status === 'accepted').length,
      rejected: (job.reviewItems || []).filter((i) => i.status === 'rejected').length,
      edited: (job.reviewItems || []).filter((i) => i.status === 'edited').length
    },
    transformationLog: job.transformationLog || [],
    preview: (job.preview || []).slice(0, 50)
  };

  return ApiResponse.success(res, 'Cleaning report retrieved successfully.', reportPayload);
});

/**
 * Export cleaned dataset or audit summary in CSV, JSON, or PDF format.
 * GET /api/v1/cleaning-jobs/:jobId/export?format=csv|json|report-csv|pdf
 */
export const exportCleaningJob = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  const userId = req.user.id || req.user._id;
  const format = req.query.format || 'csv';

  const exportResult = await exportService.exportDatasetOrReport(jobId, userId, format);

  res.setHeader('Content-Type', exportResult.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);
  return res.send(exportResult.content);
});

/**
 * Get paginated review items for a job.
 * GET /api/v1/cleaning-jobs/:jobId/review
 */
export const getReviewItems = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  const userId = req.user.id || req.user._id;

  const result = await reviewService.getJobReviewItems(jobId, userId, req.query);
  return ApiResponse.success(res, 'Review items retrieved successfully.', result);
});

/**
 * Get a single review item by ID.
 * GET /api/v1/cleaning-jobs/:jobId/review/:reviewId
 */
export const getReviewItem = asyncHandler(async (req, res) => {
  const { jobId, reviewId } = req.params;
  const userId = req.user.id || req.user._id;

  const item = await reviewService.getReviewItem(jobId, reviewId, userId);
  return ApiResponse.success(res, 'Review item retrieved successfully.', { item });
});

/**
 * Accept a review item.
 * POST /api/v1/cleaning-jobs/:jobId/review/:reviewId/accept
 */
export const acceptReviewItem = asyncHandler(async (req, res) => {
  const { jobId, reviewId } = req.params;
  const userId = req.user.id || req.user._id;

  const updatedItem = await reviewService.acceptReviewItem(jobId, reviewId, userId);
  return ApiResponse.success(res, 'Review item accepted successfully.', { item: updatedItem });
});

/**
 * Reject a review item.
 * POST /api/v1/cleaning-jobs/:jobId/review/:reviewId/reject
 */
export const rejectReviewItem = asyncHandler(async (req, res) => {
  const { jobId, reviewId } = req.params;
  const userId = req.user.id || req.user._id;

  const updatedItem = await reviewService.rejectReviewItem(jobId, reviewId, userId);
  return ApiResponse.success(res, 'Review item rejected successfully.', { item: updatedItem });
});

/**
 * Edit a review item with an operator custom value.
 * POST /api/v1/cleaning-jobs/:jobId/review/:reviewId/edit
 */
export const editReviewItem = asyncHandler(async (req, res) => {
  const { jobId, reviewId } = req.params;
  const { editedValue } = req.body;
  const userId = req.user.id || req.user._id;

  const updatedItem = await reviewService.editReviewItem(jobId, reviewId, editedValue, userId);
  return ApiResponse.success(res, 'Review item edited successfully.', { item: updatedItem });
});

/**
 * Bulk accept selected review items.
 * POST /api/v1/cleaning-jobs/:jobId/review/bulk-accept
 */
export const bulkAcceptReviews = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  const { reviewIds } = req.body;
  const userId = req.user.id || req.user._id;

  const result = await reviewService.bulkAcceptReviewItems(jobId, reviewIds, userId);
  return ApiResponse.success(res, 'Review items accepted in bulk.', result);
});

/**
 * Bulk reject selected review items.
 * POST /api/v1/cleaning-jobs/:jobId/review/bulk-reject
 */
export const bulkRejectReviews = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  const { reviewIds } = req.body;
  const userId = req.user.id || req.user._id;

  const result = await reviewService.bulkRejectReviewItems(jobId, reviewIds, userId);
  return ApiResponse.success(res, 'Review items rejected in bulk.', result);
});

export default {
  listCleaningJobs,
  getCleaningJob,
  getCleaningJobReport,
  exportCleaningJob,
  getReviewItems,
  getReviewItem,
  acceptReviewItem,
  rejectReviewItem,
  editReviewItem,
  bulkAcceptReviews,
  bulkRejectReviews
};
