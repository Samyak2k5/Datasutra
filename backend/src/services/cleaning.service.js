import fs from 'fs';
import mongoose from 'mongoose';
import env from '../config/env.js';
import Dataset from '../models/Dataset.js';
import CleaningJob from '../models/CleaningJob.js';
import AuditLog from '../models/AuditLog.js';
import ApiError from '../utils/apiError.js';
import parserService from './parser.service.js';
import rulePipeline from '../cleaning/pipeline/rulePipeline.js';
import aiCleaningService from '../ai/aiCleaning.service.js';
import { processDatasetInBatches } from './batchProcessor.service.js';
import qualityAnalyticsService from './qualityAnalytics.service.js';
import reviewService from './review.service.js';

/**
 * Initiates and executes deterministic data cleaning on an uploaded, parsed dataset.
 *
 * @param {string} datasetId - Dataset ObjectId
 * @param {string} userId - Authenticated user ObjectId
 * @param {object} [options={}] - Custom configuration rules
 * @returns {Promise<{ job: object, metrics: object, preview: Array<object> }>}
 */
export const cleanDataset = async (datasetId, userId, options = {}) => {
  if (!mongoose.Types.ObjectId.isValid(datasetId)) {
    throw ApiError.badRequest('Invalid dataset ID format.');
  }

  const dataset = await Dataset.findById(datasetId);
  if (!dataset) {
    throw ApiError.notFound('Dataset not found.');
  }

  // Strict ownership check
  if (dataset.owner.toString() !== userId.toString()) {
    throw ApiError.forbidden('Access denied. You do not have permission to clean this dataset.');
  }

  // Ensure dataset is parsed/completed
  if (dataset.status !== 'completed') {
    throw ApiError.badRequest(
      `Dataset cannot be cleaned because it has not been parsed yet (current status: '${dataset.status}'). Please trigger parsing first.`
    );
  }

  // Ensure physical file exists on disk
  if (!dataset.storagePath || !fs.existsSync(dataset.storagePath)) {
    throw ApiError.badRequest('Dataset physical file is missing from storage.');
  }

  const cleaningMode = options.cleaningMode === 'rules_then_ai' ? 'rules_then_ai' : 'rules_only';
  const startTime = Date.now();

  // 1. Create a CleaningJob record in MongoDB
  const job = await CleaningJob.create({
    dataset: dataset._id,
    owner: userId,
    status: 'processing',
    cleaningMode,
    startedAt: new Date(),
    configuration: options
  });

  // 2. Log cleaning start audit entry
  await AuditLog.create({
    owner: userId,
    user: userId,
    dataset: dataset._id,
    cleaningJob: job._id,
    action: 'dataset_cleaning_started',
    entityType: 'CleaningJob',
    entityId: job._id,
    source: 'rule_engine',
    details: {
      datasetId: dataset._id.toString(),
      cleaningMode
    }
  });

  try {
    const effectiveBatchSize = options.batchSize || env.batchSize;
    const isLargeDataset = dataset.totalRows > effectiveBatchSize;
    let cleaningResult;
    let aiSummary = null;

    if (isLargeDataset) {
      await AuditLog.create({
        owner: userId,
        user: userId,
        dataset: dataset._id,
        cleaningJob: job._id,
        action: 'dataset_batch_started',
        entityType: 'CleaningJob',
        entityId: job._id,
        source: 'batch_processor',
        details: {
          totalRows: dataset.totalRows,
          batchSize: effectiveBatchSize
        }
      });

      const batchOut = await processDatasetInBatches({
        filePath: dataset.storagePath,
        format: dataset.fileType,
        columns: dataset.columns,
        totalExpectedRows: dataset.totalRows,
        batchSize: effectiveBatchSize,
        cleaningMode,
        options,
        onProgress: async (p) => {
          await CleaningJob.findByIdAndUpdate(job._id, {
            processedRecords: p.processedRecords,
            totalRecords: p.totalRecords,
            currentBatch: p.currentBatch,
            totalBatches: p.totalBatches,
            progressPercent: p.progressPercent,
            batchSize: p.batchSize,
            processingMode: 'batch_streaming'
          });
        }
      });

      cleaningResult = {
        rows: batchOut.preview,
        metrics: batchOut.metrics,
        duplicateGroups: batchOut.duplicateGroups,
        fieldTypes: {}
      };

      await AuditLog.create({
        owner: userId,
        user: userId,
        dataset: dataset._id,
        cleaningJob: job._id,
        action: 'dataset_batch_completed',
        entityType: 'CleaningJob',
        entityId: job._id,
        source: 'batch_processor',
        details: {
          totalBatches: batchOut.totalBatches,
          processedRecords: batchOut.processedRecords
        }
      });
    } else {
      // 3. Parse dataset rows from file
      const parsed = await parserService.parseDataset(dataset.storagePath, dataset.fileType);

      // 4. Run deterministic rule pipeline (Steps 7–9)
      cleaningResult = rulePipeline.processDatasetRows(
        parsed.rows,
        dataset.columns,
        options
      );
    }

    // 5. If rules_then_ai (and not already processed via batch streaming), run in-memory AI
    if (!isLargeDataset && cleaningMode === 'rules_then_ai') {
      await AuditLog.create({
        owner: userId,
        user: userId,
        dataset: dataset._id,
        cleaningJob: job._id,
        action: 'dataset_ai_processing_started',
        entityType: 'CleaningJob',
        entityId: job._id,
        source: 'ai',
        details: {
          cleaningMode,
          provider: options.aiProvider || env.aiProvider
        }
      });

      try {
        const aiResult = await aiCleaningService.processUnresolvedWithAI(
          cleaningResult.rows,
          cleaningResult.fieldTypes,
          options
        );

        aiSummary = aiResult.aiSummary;
        Object.assign(cleaningResult.metrics, aiResult.aiMetrics);

        // Recalculate row classification counts if AI applied any safe suggestions
        if (aiResult.aiMetrics.aiApplied > 0) {
          cleaningResult.metrics.cleanRows = 0;
          cleaningResult.metrics.modifiedRows = 0;
          cleaningResult.metrics.reviewRows = 0;
          cleaningResult.metrics.invalidRows = 0;

          for (const r of cleaningResult.rows) {
            switch (r.classification) {
              case 'clean':
                cleaningResult.metrics.cleanRows++;
                break;
              case 'modified':
                cleaningResult.metrics.modifiedRows++;
                break;
              case 'needs_review':
                cleaningResult.metrics.reviewRows++;
                break;
              case 'invalid':
                cleaningResult.metrics.invalidRows++;
                break;
            }
          }
          cleaningResult.metrics.changedFieldCount += aiResult.aiMetrics.aiApplied;
        }

        await AuditLog.create({
          owner: userId,
          user: userId,
          dataset: dataset._id,
          cleaningJob: job._id,
          action: 'dataset_ai_processing_completed',
          entityType: 'CleaningJob',
          entityId: job._id,
          source: 'ai',
          details: {
            aiCandidates: aiResult.aiMetrics.aiCandidates,
            aiProcessed: aiResult.aiMetrics.aiProcessed,
            aiSuggestions: aiResult.aiMetrics.aiSuggestions,
            aiApplied: aiResult.aiMetrics.aiApplied,
            aiNeedsReview: aiResult.aiMetrics.aiNeedsReview,
            aiRejected: aiResult.aiMetrics.aiRejected,
            aiFailed: aiResult.aiMetrics.aiFailed,
            aiProvider: aiResult.aiMetrics.aiProvider,
            aiModel: aiResult.aiMetrics.aiModel,
            aiUsage: aiResult.aiMetrics.aiUsage
          }
        });
      } catch (aiErr) {
        // Fallback: AI failure must never destroy deterministic results
        cleaningResult.metrics.aiFailed = (cleaningResult.metrics.aiFailed || 0) + 1;
        await AuditLog.create({
          owner: userId,
          user: userId,
          dataset: dataset._id,
          cleaningJob: job._id,
          action: 'dataset_ai_processing_failed',
          entityType: 'CleaningJob',
          entityId: job._id,
          source: 'ai',
          details: {
            error: aiErr.message || 'AI processing encountered an error'
          }
        });
      }
    }

    const durationMs = Date.now() - startTime;
    const preview = cleaningResult.rows.slice(0, 20);

    // Compute Data Quality Analytics & Scores (Step 12)
    const qualityAnalytics = qualityAnalyticsService.computeDataQualityAnalytics({
      metrics: cleaningResult.metrics,
      rows: cleaningResult.rows,
      columns: dataset.columns,
      duplicateGroups: cleaningResult.duplicateGroups || [],
      dataset,
      options
    });

    // Generate Human Review Items (Step 11)
    const reviewItems = reviewService.generateReviewItemsForJob({
      job,
      dataset,
      cleanedRows: cleaningResult.rows,
      duplicateGroups: cleaningResult.duplicateGroups || [],
      aiSummary,
      metrics: cleaningResult.metrics
    });

    // 6. Update CleaningJob record with completion metrics, quality scores, and review items
    await CleaningJob.findByIdAndUpdate(
      job._id,
      {
        status: 'completed',
        completedAt: new Date(),
        totalRecords: cleaningResult.metrics.totalRows,
        cleanedRecords: cleaningResult.metrics.cleanRows,
        modifiedRecords: cleaningResult.metrics.modifiedRows,
        duplicateRecords: cleaningResult.metrics.duplicateRows,
        totalDuplicateGroups: cleaningResult.metrics.totalDuplicateGroups || 0,
        duplicateGroups: cleaningResult.duplicateGroups || [],
        missingValueRecords: cleaningResult.metrics.missingValueCount,
        rowsWithMissingValues: cleaningResult.metrics.rowsWithMissingValues || 0,
        resolvedMissingValues: cleaningResult.metrics.resolvedMissingValues || 0,
        unresolvedMissingValues: cleaningResult.metrics.unresolvedMissingValues || 0,
        missingConflicts: cleaningResult.metrics.missingConflicts || 0,
        imputedFieldCount: cleaningResult.metrics.imputedFieldCount || 0,
        fieldsImputed: cleaningResult.metrics.fieldsImputed || {},
        aiProcessedRecords: cleaningResult.metrics.aiProcessed || 0,
        aiCandidates: cleaningResult.metrics.aiCandidates || 0,
        aiProcessed: cleaningResult.metrics.aiProcessed || 0,
        aiSuggestions: cleaningResult.metrics.aiSuggestions || 0,
        aiApplied: cleaningResult.metrics.aiApplied || 0,
        aiNeedsReview: cleaningResult.metrics.aiNeedsReview || 0,
        aiRejected: cleaningResult.metrics.aiRejected || 0,
        aiFailed: cleaningResult.metrics.aiFailed || 0,
        aiProvider: cleaningResult.metrics.aiProvider || null,
        aiModel: cleaningResult.metrics.aiModel || null,
        aiUsage: cleaningResult.metrics.aiUsage || {},
        unresolvedRecords: cleaningResult.metrics.reviewRows + cleaningResult.metrics.invalidRows,
        errorCount: cleaningResult.metrics.invalidRows,
        metrics: cleaningResult.metrics,
        preview,
        qualityScore: qualityAnalytics.qualityScore,
        fieldQuality: qualityAnalytics.fieldQuality,
        transformationLog: qualityAnalytics.transformationLog,
        reviewItems,
        report: {
          metrics: cleaningResult.metrics,
          qualityScore: qualityAnalytics.qualityScore,
          fieldQuality: qualityAnalytics.fieldQuality,
          duplicateReport: qualityAnalytics.duplicateReport,
          missingReport: qualityAnalytics.missingReport,
          aiReport: qualityAnalytics.aiReport,
          duplicateGroups: cleaningResult.duplicateGroups || [],
          aiSummary,
          durationMs,
          preview,
          reviewItemCount: reviewItems.length
        }
      },
      { returnDocument: 'after' }
    );

    // 7. Log cleaning completion audit entry
    await AuditLog.create({
      owner: userId,
      user: userId,
      dataset: dataset._id,
      cleaningJob: job._id,
      action: 'dataset_cleaning_completed',
      entityType: 'CleaningJob',
      entityId: job._id,
      source: 'rule_engine',
      details: {
        ...cleaningResult.metrics,
        durationMs,
        qualityScore: qualityAnalytics.qualityScore?.overall ?? 100,
        reviewItemsCount: reviewItems.length
      }
    });

    if (cleaningResult.metrics.totalDuplicateGroups > 0) {
      await AuditLog.create({
        owner: userId,
        user: userId,
        dataset: dataset._id,
        cleaningJob: job._id,
        action: 'dataset_duplicates_detected',
        entityType: 'CleaningJob',
        entityId: job._id,
        source: 'rule_engine',
        details: {
          groupCount: cleaningResult.metrics.totalDuplicateGroups,
          duplicateRowCount: cleaningResult.metrics.duplicateRows,
          conflictCount: cleaningResult.metrics.conflictCount || 0
        }
      });
    }

    if (cleaningResult.metrics.missingValueCount > 0) {
      await AuditLog.create({
        owner: userId,
        user: userId,
        dataset: dataset._id,
        cleaningJob: job._id,
        action: 'dataset_missing_data_processed',
        entityType: 'CleaningJob',
        entityId: job._id,
        source: 'rule_engine',
        details: {
          missingValueCount: cleaningResult.metrics.missingValueCount,
          rowsWithMissingValues: cleaningResult.metrics.rowsWithMissingValues,
          resolvedMissingValues: cleaningResult.metrics.resolvedMissingValues,
          unresolvedMissingValues: cleaningResult.metrics.unresolvedMissingValues,
          missingConflicts: cleaningResult.metrics.missingConflicts,
          imputedFieldCount: cleaningResult.metrics.imputedFieldCount,
          fieldsImputed: cleaningResult.metrics.fieldsImputed
        }
      });
    }

    return {
      job: {
        id: job._id.toString(),
        status: 'completed',
        qualityScore: qualityAnalytics.qualityScore?.overall ?? 100,
        reviewItemCount: reviewItems.length
      },
      metrics: cleaningResult.metrics,
      duplicateGroups: cleaningResult.duplicateGroups || [],
      qualityScore: qualityAnalytics.qualityScore,
      fieldQuality: qualityAnalytics.fieldQuality,
      reviewItems: reviewItems.slice(0, 20),
      preview
    };
  } catch (err) {
    const errorMsg = err.message || 'Dataset cleaning failed.';

    // Record failure in CleaningJob
    await CleaningJob.findByIdAndUpdate(job._id, {
      status: 'failed',
      completedAt: new Date(),
      errorMessage: errorMsg
    });

    // Log failure in AuditLog
    await AuditLog.create({
      owner: userId,
      user: userId,
      dataset: dataset._id,
      cleaningJob: job._id,
      action: 'dataset_cleaning_failed',
      entityType: 'CleaningJob',
      entityId: job._id,
      source: 'rule_engine',
      details: {
        error: errorMsg
      }
    });

    throw err;
  }
};

/**
 * Retrieves a cleaning job by ID, enforcing user ownership.
 *
 * @param {string} jobId
 * @param {string} userId
 * @returns {Promise<object>}
 */
export const getCleaningJob = async (jobId, userId) => {
  if (!mongoose.Types.ObjectId.isValid(jobId)) {
    throw ApiError.badRequest('Invalid cleaning job ID format.');
  }

  const job = await CleaningJob.findById(jobId);
  if (!job) {
    throw ApiError.notFound('Cleaning job not found.');
  }

  if (job.owner.toString() !== userId.toString()) {
    throw ApiError.forbidden('Access denied. You do not have permission to view this cleaning job.');
  }

  return job;
};

export default {
  cleanDataset,
  getCleaningJob
};
