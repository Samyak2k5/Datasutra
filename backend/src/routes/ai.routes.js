import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware.js';
import { createRateLimiter } from '../middleware/rateLimiter.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/apiResponse.js';
import ApiError from '../utils/apiError.js';
import datasetService from '../services/dataset.service.js';
import parserService from '../services/parser.service.js';
import env from '../config/env.js';
import { indexDataset } from '../ai/embedding.service.js';
import { createApiCalls } from '../ai/apiCallTracker.js';
import { executeReviewedPlan } from '../ai/aiExecution.service.js';
import { runDatasetAI } from '../ai/aiAnalysis.service.js';
import { operationsSchema, validateOperations } from '../ai/schemas/aiCleaning.schema.js';

const router = Router();
router.use(authenticate);
router.use(createRateLimiter({ windowMs: 60000, max: 10, keyGenerator: req => req.user.id,
  message: 'Too many AI requests. Wait one minute before trying again.' }));
router.post('/embeddings/:datasetId', asyncHandler(async (req, res) => {
  const dataset = await datasetService.getDatasetById(req.params.datasetId, req.user.id);
  if (dataset.status !== 'completed') throw ApiError.badRequest('Parse the dataset before preparing embeddings.');
  if (!env.openaiApiKey) throw new ApiError(503, 'OpenAI API key is not configured.');
  if (dataset.totalRows > env.aiMaxRecords) throw new ApiError(413, 'The demo AI pipeline supports up to ' + env.aiMaxRecords + ' extracted records.');
  const parsed = await parserService.parseDataset(dataset.storagePath, dataset.fileType);
  const result = await indexDataset(dataset, parsed, createApiCalls());
  return ApiResponse.success(res, 'Embeddings stored and verified.', result);
}));
for (const mode of ['analyze', 'cleaning-suggestions', 'command']) {
  router.post('/' + mode + '/:datasetId', asyncHandler(async (req, res) => {
    let instruction;
    if (mode === 'command') {
      const parsed = z.object({ instruction: z.string().trim().min(1).max(1000) }).strict().safeParse(req.body);
      if (!parsed.success) throw ApiError.badRequest('Provide an instruction between 1 and 1000 characters.');
      instruction = parsed.data.instruction;
    }
    const result = await runDatasetAI(req.params.datasetId, req.user.id, mode, instruction);
    return ApiResponse.success(res, 'AI request completed. Review the sample-based result.', result);
  }));
}
router.post('/execute/:datasetId', asyncHandler(async (req, res) => {
  const dataset = await datasetService.getDatasetById(req.params.datasetId, req.user.id);
  const parsed = z.object({ operations: operationsSchema, sessionId: z.string().optional() }).strict().safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest('Provide a valid reviewed cleaning plan.');
  const operations = validateOperations(parsed.data.operations, dataset.columns);
  const result = await executeReviewedPlan(req.params.datasetId, req.user.id, operations, parsed.data.sessionId);
  const report = result.comparisonReport;
  return ApiResponse.success(res, result.aiError || 'Reviewed operations applied.', { ...result,
    ...(report ? { metrics: report.metrics, summary: report.summary, issues: report.issues,
      recommendations: report.recommendations, reviewRecords: report.reviewRecords, apiCalls: report.apiCalls } : {}) });
}));
export default router;
