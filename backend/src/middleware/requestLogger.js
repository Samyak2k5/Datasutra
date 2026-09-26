/**
 * Lightweight HTTP request logger middleware
 */
export const requestLogger = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    const color = statusCode >= 500 ? '\x1b[31m' : statusCode >= 400 ? '\x1b[33m' : statusCode >= 300 ? '\x1b[36m' : '\x1b[32m';
    const reset = '\x1b[0m';

    console.info(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${color}${statusCode}${reset} - ${duration}ms`);
  });

  next();
};

export default requestLogger;
