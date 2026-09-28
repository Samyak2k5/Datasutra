import { z } from 'zod';
import { aiAnalysisSchema } from './aiAnalysis.schema.js';
const count = z.union([z.number().int().nonnegative(), z.literal('Not applicable')]);
export const comparisonMetricsSchema = z.object({
  originalRows: count, finalRows: count,
  missingValuesBefore: count, missingValuesAfter: count,
  duplicateGroupsBefore: count, duplicateGroupsAfter: count,
  invalidEmailsBefore: count, invalidEmailsAfter: count,
  invalidPhonesBefore: count, invalidPhonesAfter: count,
  nameCityInconsistenciesBefore: count, nameCityInconsistenciesAfter: count,
  semanticManualReviewRecords: z.number().int().nonnegative(),
  processingTimeMs: z.number().nonnegative(), llmApiCalls: z.number().int().nonnegative()
}).strict();
export const finalSummarySchema = aiAnalysisSchema.pick({ summary: true, issues: true, recommendations: true });
export const cleaningReportSchema = z.object({
  metrics: comparisonMetricsSchema,
  summary: z.string().nullable(), issues: aiAnalysisSchema.shape.issues,
  recommendations: z.array(z.string()), reviewRecords: z.array(z.record(z.string(), z.unknown())),
  apiCalls: z.object({ embeddings: z.number().int().nonnegative(), chat: z.number().int().nonnegative(), total: z.number().int().nonnegative(), failed: z.number().int().nonnegative() }),
  documentMetrics: z.record(z.string(), z.unknown()).nullable(),
  scope: z.string(), summaryError: z.string().nullable()
}).strict();
