import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from backend root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const parseCorsOrigin = (originStr) => {
  if (!originStr || originStr === '*') return '*';
  return originStr.split(',').map((origin) => origin.trim());
};

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret && process.env.NODE_ENV === 'production') {
  throw new Error('FATAL: JWT_SECRET environment variable is missing in production mode.');
}

const maxFileSizeMB = parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 25;

export const env = {
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isDevelopment: process.env.NODE_ENV === 'development' || !process.env.NODE_ENV,
  apiPrefix: process.env.API_PREFIX || '/api/v1',
  corsOrigin: parseCorsOrigin(process.env.CORS_ORIGIN),
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/datasutra',
  jwtSecret: jwtSecret || 'datasutra_default_dev_secret_fallback_key',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  maxFileSizeMB,
  maxFileSizeBytes: maxFileSizeMB * 1024 * 1024,
  uploadDir: path.resolve(__dirname, '../../uploads/datasets'),

  // AI Configuration
  aiProvider: process.env.AI_PROVIDER || 'mock',
  aiModel: process.env.AI_MODEL || 'gpt-4o-mini',
  aiTemperature: process.env.AI_TEMPERATURE !== undefined ? parseFloat(process.env.AI_TEMPERATURE) : 0,
  aiMaxTokens: parseInt(process.env.AI_MAX_TOKENS, 10) || 1000,
  aiTimeoutMs: parseInt(process.env.AI_TIMEOUT_MS, 10) || 15000,
  aiMaxRetries: parseInt(process.env.AI_MAX_RETRIES, 10) || 2,
  aiBatchSize: parseInt(process.env.AI_BATCH_SIZE, 10) || 10,

  // Provider Credentials (strictly backend, never returned to client)
  openaiApiKey: process.env.OPENAI_API_KEY || null,
  googleApiKey: process.env.GOOGLE_API_KEY || null,

  // Multi-Format & Document Limits
  maxPdfPages: parseInt(process.env.MAX_PDF_PAGES, 10) || 100,
  maxExtractedTextBytes: parseInt(process.env.MAX_EXTRACTED_TEXT_BYTES, 10) || 10 * 1024 * 1024, // 10MB
  maxJsonRecords: parseInt(process.env.MAX_JSON_RECORDS, 10) || 50000,
  jsonApiTimeoutMs: parseInt(process.env.JSON_API_TIMEOUT_MS, 10) || 10000,
  jsonApiMaxSizeBytes: parseInt(process.env.JSON_API_MAX_SIZE_BYTES, 10) || 25 * 1024 * 1024, // 25MB

  // Large-File Batch Processing
  batchSize: parseInt(process.env.BATCH_SIZE, 10) || 500,
  batchConcurrency: parseInt(process.env.BATCH_CONCURRENCY, 10) || 2
};

export default env;
