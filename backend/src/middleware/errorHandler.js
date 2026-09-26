import env from '../config/env.js';
import ApiError from '../utils/apiError.js';

/**
 * Centralized Error Handler Middleware
 */
export const errorHandler = (err, req, res, next) => { // eslint-disable-line no-unused-vars
  let error = err;

  // Handle malformed JSON body errors from express.json()
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    error = ApiError.badRequest('Invalid JSON payload received.');
  }

  // Handle Multer upload errors
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      error = new ApiError(413, `File size exceeds the maximum limit of ${env.maxFileSizeMB}MB.`);
    } else {
      error = ApiError.badRequest(`File upload error: ${err.message}`);
    }
  }

  // Convert generic Error to ApiError if not already
  if (!(error instanceof ApiError)) {
    const statusCode = error.statusCode || 500;
    const message = error.message || 'Internal Server Error';
    error = new ApiError(statusCode, message, error.errors || [], err.stack);
  }

  const statusCode = error.statusCode || 500;
  const response = {
    success: false,
    statusCode,
    message: error.message,
    errors: error.errors || []
  };

  // Include stack trace only in development
  if (env.isDevelopment) {
    response.stack = error.stack;
  }

  if (statusCode >= 500) {
    console.error(`[Error] ${req.method} ${req.originalUrl}:`, err);
  }

  return res.status(statusCode).json(response);
};

export default errorHandler;
