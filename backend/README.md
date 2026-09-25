# DataSutra Backend

Production-ready Node.js & Express REST API for DataSutra.

## Architecture

```
backend/
├── src/
│   ├── config/
│   │   ├── env.js           # Environment variables & runtime settings
│   │   └── db.js            # Database connector placeholder
│   ├── controllers/
│   │   └── health.controller.js # Health check controller
│   ├── routes/
│   │   ├── health.route.js  # /health route definition
│   │   └── index.js         # API v1 router aggregator
│   ├── middleware/
│   │   ├── errorHandler.js  # Centralized error handler
│   │   ├── notFoundHandler.js # 404 handler
│   │   └── requestLogger.js # Request logging middleware
│   ├── services/
│   │   └── health.service.js# Diagnostic service
│   ├── utils/
│   │   ├── apiResponse.js   # Standardized JSON response wrapper
│   │   ├── apiError.js      # Operational error class
│   │   └── asyncHandler.js  # Async route handler wrapper
│   ├── app.js               # Express application initialization
│   └── server.js            # HTTP server & graceful shutdown handler
├── .env.example             # Example environment configuration
├── .gitignore               # Git ignore rules
└── package.json             # ES Module configuration and dependencies
```

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

### 3. Run Development Server
```bash
npm run dev
```

### 4. Run Production Server
```bash
npm start
```

## API Endpoints

- `GET /` - Basic service status
- `GET /api/v1/health` - Application health check and diagnostics
