import express from 'express';
import cors from 'cors';
import env from './config/env.js';
import securityHeaders from './middleware/securityHeaders.js';
import mongoSanitize from './middleware/mongoSanitize.js';
import { apiRateLimiter } from './middleware/rateLimiter.js';
import requestLogger from './middleware/requestLogger.js';
import notFoundHandler from './middleware/notFoundHandler.js';
import errorHandler from './middleware/errorHandler.js';
import apiRouter from './routes/index.js';

const app = express();

// Disable information disclosure headers
app.disable('x-powered-by');

// Apply enterprise security headers (HSTS, CSP, X-Frame-Options, etc.)
app.use(securityHeaders);

// CORS configuration
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    if (env.corsOrigin === '*' || env.corsOrigin.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));

// Body parsing middlewares
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Sanitize inputs against NoSQL operator injection
app.use(mongoSanitize);

// Request logging middleware
app.use(requestLogger);

// Base root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    name: 'DataSutra Backend API',
    version: '1.0.0',
    status: 'online',
    documentation: `${env.apiPrefix}/health`
  });
});

// Mount versioned API routes with API rate limiter
app.use(env.apiPrefix, apiRateLimiter, apiRouter);

// 404 handler
app.use(notFoundHandler);

// Centralized error handler
app.use(errorHandler);

export default app;
