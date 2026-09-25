import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import cleaningJobController from '../controllers/cleaningJob.controller.js';

const router = Router();

// Protect all cleaning job routes with JWT authentication
router.use(authenticate);

// List cleaning jobs for user
router.get('/', cleaningJobController.listCleaningJobs);

// Bulk review actions
router.post('/:jobId/review/bulk-accept', cleaningJobController.bulkAcceptReviews);
router.post('/:jobId/review/bulk-reject', cleaningJobController.bulkRejectReviews);

// Individual review actions
router.get('/:jobId/review', cleaningJobController.getReviewItems);
router.get('/:jobId/review/:reviewId', cleaningJobController.getReviewItem);
router.post('/:jobId/review/:reviewId/accept', cleaningJobController.acceptReviewItem);
router.post('/:jobId/review/:reviewId/reject', cleaningJobController.rejectReviewItem);
router.post('/:jobId/review/:reviewId/edit', cleaningJobController.editReviewItem);

// Report and export
router.get('/:jobId/report', cleaningJobController.getCleaningJobReport);
router.get('/:jobId/export', cleaningJobController.exportCleaningJob);

// Get single cleaning job details
router.get('/:jobId', cleaningJobController.getCleaningJob);

export default router;
