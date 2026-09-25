import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import mongoose from 'mongoose';
import Dataset from '../models/Dataset.js';
import AuditLog from '../models/AuditLog.js';
import ApiError from '../utils/apiError.js';
import parserService from './parser.service.js';

/**
 * Computes SHA-256 hash of a file on disk.
 * @param {string} filePath
 * @returns {Promise<string>}
 */
const calculateFileHash = (filePath) => {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (err) => reject(err));
  });
};

/**
 * Safely unlinks a file if it exists, logging any unexpected error.
 * @param {string} filePath
 */
const cleanupFile = async (filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    try {
      await fs.promises.unlink(filePath);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.warn(`[Cleanup Warning] Could not remove file at ${filePath}:`, err.message);
      }
    }
  }
};

/**
 * Create a new dataset record from an uploaded file.
 * Computes SHA-256 hash, creates Dataset document, and writes an AuditLog entry.
 * Cleans up the uploaded file if any failure occurs to prevent orphaned files.
 */
export const createDataset = async ({ userId, file, name }) => {
  if (!file || !file.path) {
    throw ApiError.badRequest('File is required for dataset creation.');
  }

  try {
    // 1. Calculate SHA-256 hash from the stored file contents
    const originalFileHash = await calculateFileHash(file.path);

    // 2. Determine file type from extension
    const ext = path.extname(file.originalname).toLowerCase();
    const fileType = ext.replace('.', '') || 'csv';

    // 3. Determine dataset display name
    const datasetName = (name && name.trim()) ? name.trim() : path.parse(file.originalname).name;

    // 4. Create Dataset record in MongoDB
    const dataset = await Dataset.create({
      owner: userId,
      name: datasetName,
      originalFileName: file.originalname,
      fileType,
      fileSize: file.size,
      storagePath: file.path,
      totalRows: 0,
      totalColumns: 0,
      columns: [],
      status: 'uploaded',
      originalFileHash,
      uploadedAt: new Date()
    });

    // 5. Create audit log record
    await AuditLog.create({
      owner: userId,
      user: userId,
      dataset: dataset._id,
      action: 'dataset_uploaded',
      entityType: 'Dataset',
      entityId: dataset._id,
      source: 'user',
      details: {
        name: dataset.name,
        originalFileName: dataset.originalFileName,
        fileType: dataset.fileType,
        fileSize: dataset.fileSize,
        originalFileHash: dataset.originalFileHash
      }
    });

    return dataset;
  } catch (error) {
    // Clean up uploaded physical file on failure to avoid orphaned files
    await cleanupFile(file.path);
    throw error;
  }
};

/**
 * Retrieve all datasets owned by the authenticated user.
 * @param {string} userId
 * @returns {Promise<Array>}
 */
export const getUserDatasets = async (userId) => {
  return Dataset.find({ owner: userId }).sort({ createdAt: -1 });
};

/**
 * Retrieve a single dataset by ID, enforcing user ownership.
 * @param {string} datasetId
 * @param {string} userId
 * @returns {Promise<Object>}
 */
export const getDatasetById = async (datasetId, userId) => {
  if (!mongoose.Types.ObjectId.isValid(datasetId)) {
    throw ApiError.badRequest('Invalid dataset ID format.');
  }

  const dataset = await Dataset.findById(datasetId);
  if (!dataset) {
    throw ApiError.notFound('Dataset not found.');
  }

  // Strict ownership enforcement
  if (dataset.owner.toString() !== userId.toString()) {
    throw ApiError.forbidden('Access denied. You do not have permission to access this dataset.');
  }

  return dataset;
};

/**
 * Delete a dataset document and its underlying physical file, enforcing user ownership.
 * Writes a deletion AuditLog entry.
 * @param {string} datasetId
 * @param {string} userId
 * @returns {Promise<Object>}
 */
export const deleteDataset = async (datasetId, userId) => {
  if (!mongoose.Types.ObjectId.isValid(datasetId)) {
    throw ApiError.badRequest('Invalid dataset ID format.');
  }

  const dataset = await Dataset.findById(datasetId);
  if (!dataset) {
    throw ApiError.notFound('Dataset not found.');
  }

  // Strict ownership enforcement
  if (dataset.owner.toString() !== userId.toString()) {
    throw ApiError.forbidden('Access denied. You do not have permission to delete this dataset.');
  }

  // Delete physical file gracefully
  if (dataset.storagePath) {
    await cleanupFile(dataset.storagePath);
  }

  // Delete MongoDB Dataset document
  await Dataset.findByIdAndDelete(datasetId);

  // Create deletion AuditLog record
  await AuditLog.create({
    owner: userId,
    user: userId,
    dataset: dataset._id,
    action: 'dataset_deleted',
    entityType: 'Dataset',
    entityId: dataset._id,
    source: 'user',
    details: {
      name: dataset.name,
      originalFileName: dataset.originalFileName,
      fileSize: dataset.fileSize
    }
  });

  return { id: dataset._id.toString(), deleted: true };
};

/**
 * Parse an existing dataset file and update Dataset metadata in MongoDB.
 * Enforces user ownership.
 * If parsing fails, updates status to 'failed' and writes failure audit log.
 *
 * @param {string} datasetId
 * @param {string} userId
 * @returns {Promise<Object>}
 */
export const parseDataset = async (datasetId, userId) => {
  if (!mongoose.Types.ObjectId.isValid(datasetId)) {
    throw ApiError.badRequest('Invalid dataset ID format.');
  }

  const dataset = await Dataset.findById(datasetId);
  if (!dataset) {
    throw ApiError.notFound('Dataset not found.');
  }

  // Strict ownership enforcement
  if (dataset.owner.toString() !== userId.toString()) {
    throw ApiError.forbidden('Access denied. You do not have permission to parse this dataset.');
  }

  // Verify file exists on disk
  if (!dataset.storagePath || !fs.existsSync(dataset.storagePath)) {
    await Dataset.findByIdAndUpdate(datasetId, {
      status: 'failed',
      parseError: 'Dataset physical file is missing from storage.'
    });

    await AuditLog.create({
      owner: userId,
      user: userId,
      dataset: dataset._id,
      action: 'dataset_parse_failed',
      entityType: 'Dataset',
      entityId: dataset._id,
      source: 'system',
      details: {
        error: 'Dataset physical file is missing from storage.',
        fileType: dataset.fileType
      }
    });

    throw ApiError.badRequest('Dataset physical file is missing from storage.');
  }

  // Update status to processing
  await Dataset.findByIdAndUpdate(datasetId, {
    status: 'processing',
    parseError: null
  });

  try {
    const parseResult = await parserService.parseDataset(
      dataset.storagePath,
      dataset.fileType
    );

    // Update Dataset document in MongoDB
    const updatedDataset = await Dataset.findByIdAndUpdate(
      datasetId,
      {
        status: 'completed',
        totalRows: parseResult.totalRows,
        totalColumns: parseResult.totalColumns,
        columns: parseResult.columns,
        sourceFormat: parseResult.format || dataset.fileType,
        parserType: parseResult.format || dataset.fileType,
        parserVersion: '1.0.0',
        extractionStatus: parseResult.metadata?.isScanned ? 'ocr_fallback' : 'extracted',
        pageCount: parseResult.metadata?.pageCount || 0,
        tableCount: parseResult.metadata?.tableCount || parseResult.metadata?.tablesFound || 0,
        extractionMetadata: parseResult.metadata || {},
        documentStructure: parseResult.documentStructure || null,
        warnings: parseResult.warnings || [],
        parseError: null,
        parsedAt: new Date()
      },
      { returnDocument: 'after' }
    );

    // Create AuditLog for dataset_parsed
    await AuditLog.create({
      owner: userId,
      user: userId,
      dataset: dataset._id,
      action: 'dataset_parsed',
      entityType: 'Dataset',
      entityId: dataset._id,
      source: 'system',
      details: {
        totalRows: parseResult.totalRows,
        totalColumns: parseResult.totalColumns,
        fileType: dataset.fileType,
        sourceFormat: parseResult.format || dataset.fileType,
        worksheetName: parseResult.worksheetName || null,
        pageCount: parseResult.metadata?.pageCount || 0,
        tableCount: parseResult.metadata?.tableCount || parseResult.metadata?.tablesFound || 0
      }
    });

    if (parseResult.format === 'pdf' || parseResult.format === 'docx') {
      await AuditLog.create({
        owner: userId,
        user: userId,
        dataset: dataset._id,
        action: 'dataset_extraction_completed',
        entityType: 'Dataset',
        entityId: dataset._id,
        source: 'system',
        details: {
          format: parseResult.format,
          totalRows: parseResult.totalRows,
          pageCount: parseResult.metadata?.pageCount || 0,
          tableCount: parseResult.metadata?.tableCount || parseResult.metadata?.tablesFound || 0
        }
      });
    }

    return updatedDataset;
  } catch (error) {
    const errorMessage = error.message || 'Dataset parsing failed.';

    // Mark dataset status as failed
    await Dataset.findByIdAndUpdate(datasetId, {
      status: 'failed',
      parseError: errorMessage
    });

    // Create AuditLog for dataset_parse_failed
    await AuditLog.create({
      owner: userId,
      user: userId,
      dataset: dataset._id,
      action: 'dataset_parse_failed',
      entityType: 'Dataset',
      entityId: dataset._id,
      source: 'system',
      details: {
        error: errorMessage,
        fileType: dataset.fileType
      }
    });

    throw error;
  }
};

/**
 * Get bounded data preview for a parsed dataset.
 * Enforces user ownership and verified completed parsing.
 *
 * @param {string} datasetId
 * @param {string} userId
 * @param {number} [limit=20]
 * @returns {Promise<Object>}
 */
export const getDatasetPreview = async (datasetId, userId, limit = 20) => {
  if (!mongoose.Types.ObjectId.isValid(datasetId)) {
    throw ApiError.badRequest('Invalid dataset ID format.');
  }

  const dataset = await Dataset.findById(datasetId);
  if (!dataset) {
    throw ApiError.notFound('Dataset not found.');
  }

  // Strict ownership enforcement
  if (dataset.owner.toString() !== userId.toString()) {
    throw ApiError.forbidden('Access denied. You do not have permission to view this dataset preview.');
  }

  if (dataset.status !== 'completed') {
    throw ApiError.badRequest(
      `Dataset has not been parsed yet (current status: ${dataset.status}). Please trigger parsing first.`
    );
  }

  if (!dataset.storagePath || !fs.existsSync(dataset.storagePath)) {
    throw ApiError.badRequest('Dataset physical file is missing from storage.');
  }

  const preview = await parserService.getPreview(dataset.storagePath, dataset.fileType, limit);

  return {
    headers: preview.headers,
    rows: preview.rows,
    totalRows: dataset.totalRows,
    totalColumns: dataset.totalColumns,
    previewRows: preview.previewRows,
    sourceFormat: dataset.sourceFormat || dataset.fileType,
    pageCount: dataset.pageCount || 0,
    tableCount: dataset.tableCount || 0,
    metadata: dataset.extractionMetadata || preview.metadata || {},
    documentStructure: dataset.documentStructure || preview.documentStructure || null,
    provenance: preview.provenance || {},
    warnings: dataset.warnings?.length ? dataset.warnings : (preview.warnings || [])
  };
};

/**
 * Ingests a JSON dataset from a secure external JSON API endpoint.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.url
 * @param {string} [params.name]
 * @param {string} [params.recordPath]
 * @param {string} [params.bearerToken]
 * @param {string} [params.apiKey]
 * @param {object} [params.headers]
 * @param {object} [params.pagination]
 * @returns {Promise<object>}
 */
export const importJsonApiDataset = async ({
  userId,
  url,
  name,
  recordPath = null,
  bearerToken = null,
  apiKey = null,
  headers = {},
  pagination = {}
}) => {
  const { fetchJsonApi } = await import('./jsonApi.service.js');

  const { records, rawJson, metadata } = await fetchJsonApi({
    url,
    recordPath,
    bearerToken,
    apiKey,
    headers,
    pagination
  });

  if (!records || records.length === 0) {
    throw ApiError.badRequest('JSON API endpoint returned 0 records.');
  }

  // Save records as local JSON file
  const fileName = `dataset_${crypto.randomUUID()}.json`;
  const storagePath = path.join(env.uploadDir, fileName);
  const jsonContent = JSON.stringify(records, null, 2);
  await fs.promises.writeFile(storagePath, jsonContent, 'utf-8');

  const originalFileHash = await calculateFileHash(storagePath);
  const datasetName = (name && name.trim()) ? name.trim() : (new URL(url).hostname || 'json_api_import');

  const dataset = await Dataset.create({
    owner: userId,
    name: datasetName,
    originalFileName: `${datasetName}.json`,
    fileType: 'json',
    sourceFormat: 'json_api',
    fileSize: Buffer.byteLength(jsonContent, 'utf-8'),
    storagePath,
    totalRows: 0,
    totalColumns: 0,
    columns: [],
    status: 'uploaded',
    originalFileHash,
    extractionMetadata: {
      sourceUrl: metadata.sourceUrl,
      pagesFetched: metadata.pagesFetched,
      importedAt: new Date().toISOString()
    },
    uploadedAt: new Date()
  });

  await AuditLog.create({
    owner: userId,
    user: userId,
    dataset: dataset._id,
    action: 'dataset_uploaded',
    entityType: 'Dataset',
    entityId: dataset._id,
    source: 'user',
    details: {
      name: dataset.name,
      fileType: 'json',
      sourceFormat: 'json_api',
      sourceUrl: metadata.sourceUrl,
      fileSize: dataset.fileSize
    }
  });

  return dataset;
};

export default {
  createDataset,
  getUserDatasets,
  getDatasetById,
  deleteDataset,
  parseDataset,
  getDatasetPreview,
  importJsonApiDataset
};
