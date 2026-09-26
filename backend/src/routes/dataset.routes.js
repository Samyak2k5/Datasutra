import { Router } from 'express';
import datasetController from '../controllers/dataset.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { uploadDatasetFile } from '../middleware/upload.middleware.js';

const router = Router();

// Protect all dataset routes with JWT authentication
router.use(authenticate);

// Upload a new dataset (CSV, XLSX, JSON, PDF, DOCX)
router.post('/', uploadDatasetFile, datasetController.uploadDataset);

// Import dataset from secure JSON API endpoint
router.post('/import/json-api', datasetController.importJsonApi);

// List datasets owned by authenticated user
router.get('/', datasetController.listDatasets);

// Get a single dataset by ID (ownership verified)
router.get('/:id', datasetController.getDataset);

// Trigger dataset parsing (CSV/XLSX)
router.post('/:id/parse', datasetController.parseDataset);

// Get dataset preview rows
router.get('/:id/preview', datasetController.getPreview);

// Execute deterministic dataset cleaning
router.post('/:id/clean', datasetController.cleanDataset);

// Delete a dataset and its physical file by ID (ownership verified)
router.delete('/:id', datasetController.deleteDataset);

export default router;
