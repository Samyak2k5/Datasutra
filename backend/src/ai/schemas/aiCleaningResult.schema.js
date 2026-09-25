import { z } from 'zod';

/**
 * Supported task types for AI-assisted unresolved data processing.
 */
export const AITaskType = {
  UNRESOLVED_MISSING_VALUE: 'unresolved_missing_value',
  AMBIGUOUS_STANDARDIZATION: 'ambiguous_standardization',
  AMBIGUOUS_LOCATION: 'ambiguous_location',
  AMBIGUOUS_TEXT_NORMALIZATION: 'ambiguous_text_normalization',
  AMBIGUOUS_DUPLICATE_REVIEW: 'ambiguous_duplicate_review'
};

/**
 * Allowed AI action decisions.
 */
export const AIAction = {
  SUGGEST_VALUE: 'suggest_value',
  SUGGEST_NORMALIZATION: 'suggest_normalization',
  NO_SAFE_CHANGE: 'no_safe_change',
  NEEDS_REVIEW: 'needs_review'
};

/**
 * Safety evaluation status of an AI suggestion.
 */
export const AISafetyStatus = {
  SAFE_SUGGESTION: 'SAFE_SUGGESTION',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
  REJECTED: 'REJECTED',
  NO_CHANGE: 'NO_CHANGE'
};

/**
 * Zod schema for a single evidence item provided by AI.
 */
export const aiEvidenceSchema = z.object({
  type: z.string().min(1, 'Evidence type is required'),
  description: z.string().min(1, 'Evidence description is required')
});

/**
 * Zod schema for a single structured AI cleaning suggestion.
 */
export const aiSuggestionItemSchema = z.object({
  rowNumber: z.number().int().positive('rowNumber must be a positive integer'),
  field: z.string().min(1, 'field name is required'),
  action: z.enum([
    AIAction.SUGGEST_VALUE,
    AIAction.SUGGEST_NORMALIZATION,
    AIAction.NO_SAFE_CHANGE,
    AIAction.NEEDS_REVIEW
  ]),
  originalValue: z.any().nullable().optional(),
  suggestedValue: z.any().nullable(),
  reason: z.string().min(1, 'Reason is required'),
  evidence: z.array(aiEvidenceSchema).default([]),
  confidence: z.number().min(0).max(1),
  requiresReview: z.boolean().default(true)
});

/**
 * Zod schema for a batch of AI cleaning suggestions.
 */
export const aiBatchResponseSchema = z.object({
  suggestions: z.array(aiSuggestionItemSchema).default([])
});

export default {
  AITaskType,
  AIAction,
  AISafetyStatus,
  aiEvidenceSchema,
  aiSuggestionItemSchema,
  aiBatchResponseSchema
};
