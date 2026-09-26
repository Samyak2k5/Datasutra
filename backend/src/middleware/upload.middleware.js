import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import env from '../config/env.js';
import ApiError from '../utils/apiError.js';

// Ensure dataset upload destination directory exists
if (!fs.existsSync(env.uploadDir)) {
  fs.mkdirSync(env.uploadDir, { recursive: true });
}

// Permitted extensions and MIME types for dataset uploads
const ALLOWED_EXTENSIONS = new Set([
  '.csv',
  '.xlsx',
  '.xls',
  '.json',
  '.jsonl',
  '.ndjson',
  '.pdf',
  '.docx',
  '.doc'
]);

const ALLOWED_MIME_TYPES = new Set([
  'text/csv',
  'text/plain',
  'application/csv',
  'text/x-csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/json',
  'text/json',
  'application/x-ndjson',
  'application/jsonlines',
  'application/pdf',
  'application/x-pdf',
  'application/acrobat',
  'applications/vnd.pdf',
  'text/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/octet-stream',
  'application/zip',
  'application/x-zip-compressed'
]);

// Configure secure disk storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, env.uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeUniqueName = `dataset_${crypto.randomUUID()}${ext}`;
    cb(null, safeUniqueName);
  }
});

// File validation filter
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();

  // Validate file extension
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return cb(
      ApiError.badRequest(
        `Unsupported file format '${ext || 'unknown'}'. Supported formats are CSV (.csv), Excel (.xlsx, .xls), JSON (.json, .jsonl), PDF (.pdf), and Word (.docx, .doc).`
      )
    );
  }

  // Validate MIME type if provided
  if (file.mimetype && !ALLOWED_MIME_TYPES.has(file.mimetype.toLowerCase())) {
    return cb(
      ApiError.badRequest(
        `Invalid file MIME type '${file.mimetype}'. Supported formats are CSV, Excel, JSON, PDF, and Word.`
      )
    );
  }

  cb(null, true);
};

// Multer upload instance
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: env.maxFileSizeBytes
  }
});

/**
 * Middleware for dataset file upload handling single 'file' field.
 * Catches Multer errors (including 413 for LIMIT_FILE_SIZE) and normalizes them into ApiError.
 */
export const uploadDatasetFile = (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(
            new ApiError(413, `File size exceeds the maximum limit of ${env.maxFileSizeMB}MB.`)
          );
        }
        return next(ApiError.badRequest(`File upload error: ${err.message}`));
      }
      return next(err);
    }
    next();
  });
};

export default uploadDatasetFile;
