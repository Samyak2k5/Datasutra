import { Router } from 'express';
import healthRoute from './health.route.js';
import authRoutes from './auth.routes.js';
import datasetRoutes from './dataset.routes.js';
import cleaningJobRoutes from './cleaningJob.routes.js';

const router = Router();

// Mount Health Check endpoint: /api/v1/health
router.use('/health', healthRoute);

// Mount Authentication endpoints: /api/v1/auth
router.use('/auth', authRoutes);

// Mount Dataset endpoints: /api/v1/datasets
router.use('/datasets', datasetRoutes);

// Mount CleaningJob & Human Review endpoints: /api/v1/cleaning-jobs and /api/v1/cleaning/jobs
router.use('/cleaning-jobs', cleaningJobRoutes);
router.use('/cleaning/jobs', cleaningJobRoutes);

export default router;
