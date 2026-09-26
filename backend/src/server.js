import app from './app.js';
import env from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';
// Register all Mongoose models
import './models/index.js';

let server;

const startServer = async () => {
  try {
    console.info(`[Startup] Initializing DataSutra Backend (${env.nodeEnv})...`);

    // 1. Establish MongoDB connection before accepting HTTP requests
    await connectDB();

    // 2. Start Express HTTP server only after database is connected
    server = app.listen(env.port, () => {
      console.info(`=========================================`);
      console.info(`🚀 DataSutra Backend Server Running`);
      console.info(`📡 Port: ${env.port}`);
      console.info(`🌍 Environment: ${env.nodeEnv}`);
      console.info(`🔗 Base URL: http://localhost:${env.port}`);
      console.info(`🩺 Health Check: http://localhost:${env.port}${env.apiPrefix}/health`);
      console.info(`=========================================`);
    });
  } catch (error) {
    console.error('❌ Server startup failed due to database connection error:');
    console.error(error.message);
    process.exit(1);
  }
};

const handleGracefulShutdown = async (signal) => {
  console.info(`\nReceived ${signal}. Shutting down server gracefully...`);

  if (server) {
    server.close(async () => {
      console.info('HTTP server closed.');
      try {
        await disconnectDB();
      } catch (err) {
        console.error('Error during database disconnection:', err);
      }
      console.info('Graceful shutdown completed. Exiting process.');
      process.exit(0);
    });

    // Force exit if close takes too long (10 seconds timeout)
    setTimeout(() => {
      console.error('Forced shutdown due to timeout.');
      process.exit(1);
    }, 10000).unref();
  } else {
    process.exit(0);
  }
};

process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  handleGracefulShutdown('uncaughtException');
});

startServer();
