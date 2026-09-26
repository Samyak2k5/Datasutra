/**
 * In-Memory Rate Limiter Middleware (Step 15.4)
 * Protects authentication and general API endpoints from brute-force and DoS.
 */

class MemoryRateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 15 * 60 * 1000; // 15 minutes
    this.max = options.max || 100;
    this.message = options.message || 'Too many requests from this IP, please try again later.';
    this.statusCode = options.statusCode || 429;
    this.hits = new Map();

    // Periodic cleanup of expired buckets every 5 minutes
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, data] of this.hits.entries()) {
        if (now - data.startTime > this.windowMs) {
          this.hits.delete(key);
        }
      }
    }, 5 * 60 * 1000);

    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  middleware() {
    return (req, res, next) => {
      // Optional bypass for test environment if flag is set
      if (process.env.DISABLE_RATE_LIMIT === 'true') {
        return next();
      }

      const ip =
        req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.socket.remoteAddress ||
        '127.0.0.1';

      const now = Date.now();
      let record = this.hits.get(ip);

      if (!record || now - record.startTime > this.windowMs) {
        record = {
          count: 1,
          startTime: now
        };
        this.hits.set(ip, record);
      } else {
        record.count += 1;
      }

      const remaining = Math.max(0, this.max - record.count);
      const resetTimeSeconds = Math.ceil((record.startTime + this.windowMs - now) / 1000);

      res.setHeader('RateLimit-Limit', this.max);
      res.setHeader('RateLimit-Remaining', remaining);
      res.setHeader('RateLimit-Reset', resetTimeSeconds);

      if (record.count > this.max) {
        res.setHeader('Retry-After', resetTimeSeconds);
        const payload = {
          status: 'fail',
          statusCode: this.statusCode,
          message: this.message,
          retryAfter: resetTimeSeconds
        };

        if (typeof res.status === 'function' && typeof res.json === 'function') {
          return res.status(this.statusCode).json(payload);
        }

        res.statusCode = this.statusCode;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify(payload));
      }

      next();
    };
  }

  reset() {
    this.hits.clear();
  }
}

export const createRateLimiter = (options) => {
  const limiter = new MemoryRateLimiter(options);
  const mw = limiter.middleware();
  mw.reset = () => limiter.reset();
  return mw;
};

// Standard API Rate Limiter (e.g. 500 requests per 15 minutes in prod, 2000 in dev/test)
export const apiRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.API_RATE_LIMIT_MAX, 10) || (process.env.NODE_ENV === 'production' ? 500 : 2000),
  message: 'Too many API requests from this IP. Please try again after 15 minutes.'
});

// Strict Auth Route Rate Limiter (e.g. 30 requests per 15 minutes in prod, 100 in dev/test)
export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || (process.env.NODE_ENV === 'production' ? 30 : 100),
  message: 'Too many authentication attempts from this IP. Please wait before trying again.'
});

export default {
  createRateLimiter,
  apiRateLimiter,
  authRateLimiter
};
