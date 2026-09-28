import { z } from 'zod';

export const severitySchema = z.enum(['low', 'medium', 'high']);
export const aiAnalysisSchema = z.object({
  summary: z.string().min(1).max(2000),
  columns: z.array(z.object({
    name: z.string(), type: z.string(), issues: z.array(z.string()).max(8)
  }).strict()).max(50),
  issues: z.array(z.object({
    type: z.enum(['missing_values', 'duplicate', 'invalid_format', 'inconsistent_type', 'outlier', 'other']),
    column: z.string().nullable(), description: z.string().max(1000),
    severity: severitySchema, suggestion: z.string().max(1000)
  }).strict()).max(20),
  recommendations: z.array(z.string().max(1000)).max(10)
}).strict();
