import { z } from 'zod';
import ApiError from '../../utils/apiError.js';
import { severitySchema } from './aiAnalysis.schema.js';

export const operationTypes = ['trim_whitespace', 'normalize_email', 'standardize_phone',
  'standardize_name', 'standardize_location', 'detect_duplicates', 'flag_missing_values'];
export const operationSchema = z.object({
  type: z.enum(operationTypes), column: z.string().nullable()
}).strict();
export const operationsSchema = z.array(operationSchema).min(1).max(12);
export const aiPlanSchema = z.object({
  supported: z.boolean(), message: z.string().max(1500),
  operations: z.array(operationSchema).max(12)
}).strict();
export const aiSuggestionsSchema = z.object({
  suggestions: z.array(z.object({
    issue: z.string().max(500), explanation: z.string().max(1000),
    suggestedAction: z.string().max(1000), severity: severitySchema,
    operation: operationSchema.nullable()
  }).strict()).max(12)
}).strict();

export function validateOperations(input, columns) {
  const parsed = operationsSchema.safeParse(input);
  if (!parsed.success) throw ApiError.badRequest('Invalid or unsupported cleaning operations.');
  const names = new Set(columns.map(column => typeof column === 'string' ? column : column.name));
  for (const operation of parsed.data) {
    if (operation.column !== null && !names.has(operation.column)) {
      throw ApiError.badRequest(`Unknown dataset column: ${operation.column}`);
    }
    if (operation.type === 'detect_duplicates' && operation.column !== null) {
      throw ApiError.badRequest('Duplicate detection operates across the dataset, not a selected column.');
    }
    if (operation.column === null && !['trim_whitespace', 'detect_duplicates', 'flag_missing_values'].includes(operation.type)) {
      throw ApiError.badRequest(`${operation.type} requires an explicit dataset column.`);
    }
  }
  return parsed.data;
}
