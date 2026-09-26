import env from '../config/env.js';
import { getDatabaseStatus } from '../config/db.js';

/**
 * Health service to collect application diagnostics including database state.
 */
export const getHealthDiagnostics = () => {
  const memoryUsage = process.memoryUsage();
  const dbStatus = getDatabaseStatus();
  const isHealthy = dbStatus.isConnected;

  return {
    status: isHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    environment: env.nodeEnv,
    version: '1.0.0',
    system: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      memory: {
        rssMB: Math.round((memoryUsage.rss / 1024 / 1024) * 100) / 100,
        heapTotalMB: Math.round((memoryUsage.heapTotal / 1024 / 1024) * 100) / 100,
        heapUsedMB: Math.round((memoryUsage.heapUsed / 1024 / 1024) * 100) / 100
      }
    },
    services: {
      api: 'operational',
      database: dbStatus.state
    }
  };
};

export default {
  getHealthDiagnostics
};
