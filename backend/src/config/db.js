import mongoose from 'mongoose';
import env from './env.js';

/**
 * Mask sensitive credentials from MongoDB URI for safe logging.
 */
const sanitizeMongoUri = (uri) => {
  if (!uri) return '';
  return uri.replace(/(mongodb(?:\+srv)?:\/\/)([^:]+):([^@]+)@/i, '$1$2:****@');
};

/**
 * Connect to MongoDB using Mongoose.
 */
export const connectDB = async () => {
  const uri = env.mongodbUri;
  const safeUri = sanitizeMongoUri(uri);

  try {
    // Configure mongoose connection options
    const connectionOptions = {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000
    };

    const conn = await mongoose.connect(uri, connectionOptions);

    console.info('Connected to MongoDB');
    console.info(`[MongoDB] Details: ${safeUri} (host: ${conn.connection.host}, database: ${conn.connection.name})`);

    // Listen to connection lifecycle events
    mongoose.connection.on('error', (err) => {
      console.error('[MongoDB] Runtime connection error:', err.message);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('[MongoDB] Connection lost.');
    });

    mongoose.connection.on('reconnected', () => {
      console.info('[MongoDB] Connection re-established.');
    });

    return conn;
  } catch (error) {
    console.error(`[MongoDB] Connection failed to ${safeUri}: ${error.message}`);
    throw error;
  }
};

/**
 * Disconnect from MongoDB gracefully.
 */
export const disconnectDB = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    console.info('Disconnected from MongoDB gracefully.');
  }
};

/**
 * Get human-readable connection status.
 */
export const getDatabaseStatus = () => {
  const stateMap = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };

  const state = mongoose.connection.readyState;
  return {
    state: stateMap[state] || 'disconnected',
    readyState: state,
    isConnected: state === 1,
    host: mongoose.connection.host || null,
    name: mongoose.connection.name || null
  };
};

export default {
  connectDB,
  disconnectDB,
  getDatabaseStatus
};
