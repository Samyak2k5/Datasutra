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


// Constrain generation itself to the same column/null contract enforced at execution.
// A nested anyOf is supported by OpenAI strict structured outputs; no root union is used.
export function createDatasetCleaningSchemas(columns) {
  const names = [...new Set(columns.map(column => typeof column === 'string' ? column : column.name))];
  const exactColumn = names.length ? z.enum(names).describe('An exact, case-sensitive dataset column name. Never rename, lowercase, or invent a column.') : null;
  const variants = operationTypes.flatMap(type => {
    if (type === 'detect_duplicates') return [z.object({ type: z.literal(type), column: z.null() }).strict()];
    if (['trim_whitespace', 'flag_missing_values'].includes(type)) {
      return [z.object({ type: z.literal(type), column: exactColumn ? exactColumn.nullable() : z.null() }).strict()];
    }
    return exactColumn ? [z.object({ type: z.literal(type), column: exactColumn }).strict()] : [];
  });
  const operation = z.union(variants);
  return {
    plan: aiPlanSchema.extend({ operations: z.array(operation).max(12).describe('For supported=true, include at least one requested operation. For supported=false, return an empty array.') }),
    suggestions: aiSuggestionsSchema.extend({ suggestions: z.array(aiSuggestionsSchema.shape.suggestions.element.extend({ operation: operation.nullable() })).max(12) })
  };
}
