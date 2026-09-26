import ApiError from '../utils/apiError.js';

/**
 * 404 Not Found Middleware
 */
export const notFoundHandler = (req, res, next) => {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
};

export default notFoundHandler;
