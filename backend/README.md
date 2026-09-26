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


## Local account and data flow

Keep your existing working MongoDB `.env` configuration. Start the backend with
`npm run dev`, then start the frontend from its directory with `npm run dev`.
Create your own account through Register, sign in, and upload your own dataset.
The app restores sessions through `GET /api/v1/auth/me` and starts with empty
lists for new accounts.

`npm run seed:demo` is an optional, explicitly invoked developer utility only.
It is never executed by startup, registration, or login and is not needed to use
this application. Google sign-in is not configured.

Run `npm run test:real-data` to exercise the real Atlas auth/upload/parse/clean/export
flow. It creates uniquely named test users and removes only its test-owned data.
See [the validation report](../FIXES_APPLIED.md) for the full changes and limitations.
