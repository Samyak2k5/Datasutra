import mongoose from 'mongoose';
import CleaningJob from '../models/CleaningJob.js';
import AuditLog from '../models/AuditLog.js';
import ApiError from '../utils/apiError.js';

/**
 * DataSutra Human Review & Explainability Service (Step 11)
 *
 * Ensures every ambiguous, conflicting, or AI-generated transformation can be
 * inspected, understood, accepted, rejected, or manually edited by a human operator.
 */

/**
 * Extracts and synthesizes review items for a cleaning job.
 *
 * @param {Object} params
 * @param {Object} params.job - CleaningJob document
 * @param {Object} params.dataset - Dataset document
 * @param {Array} params.cleanedRows - Cleaned rows from pipeline
 * @param {Array} params.duplicateGroups - Duplicate groups identified
 * @param {Object} params.aiSummary - AI processing summary
 * @param {Object} params.metrics - Aggregated cleaning metrics
 * @returns {Array} Array of review item objects
 */
export function generateReviewItemsForJob({
  job,
  dataset,
  cleanedRows = [],
  duplicateGroups = [],
  aiSummary = null,
  metrics = {}
}) {
  const reviewItems = [];
  const seenKey = new Set();

  const addItem = (item) => {
    const key = `${item.rowNumber}_${item.field}_${item.source}`;
    if (!seenKey.has(key)) {
      seenKey.add(key);
      reviewItems.push({
        reviewId: new mongoose.Types.ObjectId().toString(),
        dataset: dataset._id,
        cleaningJob: job._id,
        rowNumber: item.rowNumber,
        field: item.field,
        originalValue: item.originalValue ?? '',
        suggestedValue: item.suggestedValue ?? '',
        approvedValue: null,
        source: item.source || 'ai',
        reason: item.reason || 'Flagged for human operator review',
        evidence: item.evidence || null,
        confidence: typeof item.confidence === 'number' ? item.confidence : 0.85,
        status: 'pending',
        reviewedBy: null,
        reviewedAt: null,
        provenance: item.provenance || {}
      });
    }
  };

  // 1. Ingest AI suggestions that require review or were proposed
  if (aiSummary) {
    // Items AI marked as needing review
    if (Array.isArray(aiSummary.needsReview)) {
      for (const nr of aiSummary.needsReview) {
        const row = cleanedRows.find((r) => r.rowNumber === nr.rowNumber);
        const origVal = row?.original?.[nr.field] ?? '';
        const suggestedVal = row?.cleaned?.[nr.field] ?? origVal;

        addItem({
          rowNumber: nr.rowNumber,
          field: nr.field,
          originalValue: origVal,
          suggestedValue: suggestedVal !== origVal ? suggestedVal : '',
          source: 'ai',
          reason: nr.reason || 'AI model flagged this value as ambiguous and recommended human review.',
          evidence: { taskType: 'unresolved_review', provider: metrics.aiProvider || 'ai' },
          confidence: 0.65,
          provenance: row?.provenance || {}
        });
      }
    }

    // Items AI auto-applied that can still be inspected/overridden by operator
    if (Array.isArray(aiSummary.applied)) {
      for (const app of aiSummary.applied) {
        const row = cleanedRows.find((r) => r.rowNumber === app.rowNumber);
        const origVal = row?.original?.[app.field] ?? '';

        addItem({
          rowNumber: app.rowNumber,
          field: app.field,
          originalValue: origVal,
          suggestedValue: app.appliedValue,
          source: 'ai',
          reason: app.reason || 'AI suggestion applied based on contextual similarity.',
          evidence: { rule: 'ai.suggest_value', confidence: app.confidence },
          confidence: app.confidence || 0.88,
          provenance: row?.provenance || {}
        });
      }
    }
  }

  // 2. Ingest duplicate candidate conflicts
  for (const group of duplicateGroups) {
    if (group.requiresReview && Array.isArray(group.conflicts) && group.conflicts.length > 0) {
      for (const conflict of group.conflicts) {
        for (const memberRow of group.members || []) {
          const row = cleanedRows.find((r) => r.rowNumber === memberRow);
          const origVal = row?.original?.[conflict.field] ?? '';

          addItem({
            rowNumber: memberRow,
            field: conflict.field,
            originalValue: origVal,
            suggestedValue: conflict.values?.[0] || origVal,
            source: 'duplicate_detection',
            reason: `Conflicting values between duplicate records: ${conflict.values ? conflict.values.join(' vs ') : 'mismatch'}.`,
            evidence: {
              groupId: group.groupId,
              members: group.members,
              canonicalRow: group.canonicalRow
            },
            confidence: 0.70,
            provenance: row?.provenance || {}
          });
        }
      }
    }
  }

  // 3. Ingest ambiguous rows with warnings or missing data conflicts
  for (const r of cleanedRows) {
    if (r.classification === 'needs_review' && Array.isArray(r.issues)) {
      for (const issue of r.issues) {
        if (issue.severity === 'warning' || issue.category === 'ambiguous_value' || issue.category === 'missing_conflict') {
          const origVal = r.original?.[issue.field] ?? issue.value ?? '';
          const cleanedVal = r.cleaned?.[issue.field] ?? origVal;

          addItem({
            rowNumber: r.rowNumber,
            field: issue.field || 'record',
            originalValue: origVal,
            suggestedValue: cleanedVal,
            source: issue.rule?.startsWith('ai.') ? 'ai' : 'rule_engine',
            reason: issue.message || 'Value flagged by deterministic rule engine for review.',
            evidence: { rule: issue.rule, category: issue.category },
            confidence: 0.75,
            provenance: r.provenance || {}
          });
        }
      }
    }
  }

  // 4. Ingest parser/extraction warnings
  for (const r of cleanedRows) {
    if (Array.isArray(r.issues)) {
      for (const issue of r.issues) {
        if (issue.rule?.startsWith('parser.') || issue.rule?.startsWith('doc.') || issue.category === 'parser_warning' || issue.category === 'extraction_warning') {
          const origVal = r.original?.[issue.field] ?? issue.value ?? '';
          const cleanedVal = r.cleaned?.[issue.field] ?? origVal;

          addItem({
            rowNumber: r.rowNumber,
            field: issue.field || 'record',
            originalValue: origVal,
            suggestedValue: cleanedVal,
            source: 'parser',
            reason: issue.message || 'Extracted with format or document structure warning.',
            evidence: { rule: issue.rule, category: issue.category },
            confidence: 0.70,
            provenance: r.provenance || {}
          });
        }
      }
    }
  }

  return reviewItems;
}

/**
 * Retrieves paginated review items for a specific cleaning job.
 */
export async function getJobReviewItems(jobId, userId, filters = {}) {
  const job = await CleaningJob.findById(jobId);
  if (!job) {
    throw ApiError.notFound('Cleaning job not found.');
  }

  if (job.owner.toString() !== userId.toString()) {
    throw ApiError.forbidden('Access denied. You do not own this cleaning job.');
  }

  const items = job.reviewItems || [];
  const statusFilter = filters.status;
  const page = Math.max(1, parseInt(filters.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(filters.limit, 10) || 20));

  let filtered = items;
  if (statusFilter && statusFilter !== 'all') {
    filtered = items.filter((item) => item.status === statusFilter);
  }

  const total = filtered.length;
  const startIndex = (page - 1) * limit;
  const paginated = filtered.slice(startIndex, startIndex + limit);

  // Status breakdown counters
  const counts = {
    total: items.length,
    pending: items.filter((i) => i.status === 'pending').length,
    accepted: items.filter((i) => i.status === 'accepted').length,
    rejected: items.filter((i) => i.status === 'rejected').length,
    edited: items.filter((i) => i.status === 'edited').length
  };

  return {
    items: paginated,
    counts,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1
    }
  };
}

/**
 * Retrieves a single review item by ID.
 */
export async function getReviewItem(jobId, reviewId, userId) {
  const job = await CleaningJob.findById(jobId);
  if (!job) {
    throw ApiError.notFound('Cleaning job not found.');
  }

  if (job.owner.toString() !== userId.toString()) {
    throw ApiError.forbidden('Access denied. You do not own this cleaning job.');
  }

  const item = job.reviewItems.find(
    (i) => i.reviewId === reviewId || i._id?.toString() === reviewId
  );
  if (!item) {
    throw ApiError.notFound(`Review item '${reviewId}' not found on this job.`);
  }

  return item;
}

/**
 * Accepts a review item suggestion.
 */
export async function acceptReviewItem(jobId, reviewId, userId) {
  const job = await CleaningJob.findById(jobId);
  if (!job) {
    throw ApiError.notFound('Cleaning job not found.');
  }

  if (job.owner.toString() !== userId.toString()) {
    throw ApiError.forbidden('Access denied. You do not own this cleaning job.');
  }

  const item = job.reviewItems.find(
    (i) => i.reviewId === reviewId || i._id?.toString() === reviewId
  );
  if (!item) {
    throw ApiError.notFound(`Review item '${reviewId}' not found.`);
  }

  const now = new Date();
  item.status = 'accepted';
  item.approvedValue = item.suggestedValue;
  item.reviewedBy = userId;
  item.reviewedAt = now;

  // Update corresponding preview row if present
  if (Array.isArray(job.preview)) {
    const previewRow = job.preview.find((r) => r.rowNumber === item.rowNumber);
    if (previewRow && previewRow.cleaned) {
      previewRow.cleaned[item.field] = item.suggestedValue;
      previewRow.classification = 'modified';
    }
  }

  job.markModified('preview');
  job.markModified('reviewItems');
  await job.save();

  // Audit log
  await AuditLog.create({
    owner: userId,
    user: userId,
    dataset: job.dataset,
    cleaningJob: job._id,
    action: 'review_item_accepted',
    entityType: 'CleaningJob',
    entityId: job._id,
    source: 'user',
    details: {
      reviewId: item.reviewId,
      rowNumber: item.rowNumber,
      field: item.field,
      originalValue: item.originalValue,
      approvedValue: item.approvedValue,
      source: item.source
    }
  });

  return item;
}

/**
 * Rejects a review item suggestion, preserving the original raw value.
 */
export async function rejectReviewItem(jobId, reviewId, userId) {
  const job = await CleaningJob.findById(jobId);
  if (!job) {
    throw ApiError.notFound('Cleaning job not found.');
  }

  if (job.owner.toString() !== userId.toString()) {
    throw ApiError.forbidden('Access denied. You do not own this cleaning job.');
  }

  const item = job.reviewItems.find(
    (i) => i.reviewId === reviewId || i._id?.toString() === reviewId
  );
  if (!item) {
    throw ApiError.notFound(`Review item '${reviewId}' not found.`);
  }

  const now = new Date();
  item.status = 'rejected';
  item.approvedValue = item.originalValue; // Discard suggestion, preserve original
  item.reviewedBy = userId;
  item.reviewedAt = now;

  // Restore original value in preview row if present
  if (Array.isArray(job.preview)) {
    const previewRow = job.preview.find((r) => r.rowNumber === item.rowNumber);
    if (previewRow && previewRow.cleaned) {
      previewRow.cleaned[item.field] = item.originalValue;
    }
  }

  job.markModified('preview');
  job.markModified('reviewItems');
  await job.save();

  // Audit log
  await AuditLog.create({
    owner: userId,
    user: userId,
    dataset: job.dataset,
    cleaningJob: job._id,
    action: 'review_item_rejected',
    entityType: 'CleaningJob',
    entityId: job._id,
    source: 'user',
    details: {
      reviewId: item.reviewId,
      rowNumber: item.rowNumber,
      field: item.field,
      originalValue: item.originalValue,
      suggestedValue: item.suggestedValue,
      source: item.source
    }
  });

  return item;
}

/**
 * Manually edits a review item with a custom operator-provided value.
 */
export async function editReviewItem(jobId, reviewId, editedValue, userId) {
  if (editedValue === undefined) {
    throw ApiError.badRequest('Field "editedValue" is required when editing a review item.');
  }

  const job = await CleaningJob.findById(jobId);
  if (!job) {
    throw ApiError.notFound('Cleaning job not found.');
  }

  if (job.owner.toString() !== userId.toString()) {
    throw ApiError.forbidden('Access denied. You do not own this cleaning job.');
  }

  const item = job.reviewItems.find(
    (i) => i.reviewId === reviewId || i._id?.toString() === reviewId
  );
  if (!item) {
    throw ApiError.notFound(`Review item '${reviewId}' not found.`);
  }

  const now = new Date();
  item.status = 'edited';
  item.approvedValue = editedValue;
  item.reviewedBy = userId;
  item.reviewedAt = now;

  // Update corresponding preview row if present
  if (Array.isArray(job.preview)) {
    const previewRow = job.preview.find((r) => r.rowNumber === item.rowNumber);
    if (previewRow && previewRow.cleaned) {
      previewRow.cleaned[item.field] = editedValue;
      previewRow.classification = 'modified';
    }
  }

  job.markModified('preview');
  job.markModified('reviewItems');
  await job.save();

  // Audit log
  await AuditLog.create({
    owner: userId,
    user: userId,
    dataset: job.dataset,
    cleaningJob: job._id,
    action: 'review_item_edited',
    entityType: 'CleaningJob',
    entityId: job._id,
    source: 'user',
    details: {
      reviewId: item.reviewId,
      rowNumber: item.rowNumber,
      field: item.field,
      originalValue: item.originalValue,
      suggestedValue: item.suggestedValue,
      approvedValue: item.approvedValue,
      source: item.source
    }
  });

  return item;
}

/**
 * Bulk accepts selected review items.
 */
export async function bulkAcceptReviewItems(jobId, reviewIds = [], userId) {
  const job = await CleaningJob.findById(jobId);
  if (!job) {
    throw ApiError.notFound('Cleaning job not found.');
  }

  if (job.owner.toString() !== userId.toString()) {
    throw ApiError.forbidden('Access denied. You do not own this cleaning job.');
  }

  const idSet = Array.isArray(reviewIds) && reviewIds.length > 0
    ? new Set(reviewIds.map(String))
    : null; // null means accept all pending

  const now = new Date();
  let acceptedCount = 0;

  for (const item of job.reviewItems || []) {
    const matches = idSet ? (idSet.has(item.reviewId) || idSet.has(item._id?.toString())) : item.status === 'pending';
    if (matches && item.status === 'pending') {
      item.status = 'accepted';
      item.approvedValue = item.suggestedValue;
      item.reviewedBy = userId;
      item.reviewedAt = now;
      acceptedCount++;

      // Update preview row
      if (Array.isArray(job.preview)) {
        const previewRow = job.preview.find((r) => r.rowNumber === item.rowNumber);
        if (previewRow && previewRow.cleaned) {
          previewRow.cleaned[item.field] = item.suggestedValue;
          previewRow.classification = 'modified';
        }
      }
    }
  }

  job.markModified('preview');
  job.markModified('reviewItems');
  await job.save();

  await AuditLog.create({
    owner: userId,
    user: userId,
    dataset: job.dataset,
    cleaningJob: job._id,
    action: 'review_bulk_accepted',
    entityType: 'CleaningJob',
    entityId: job._id,
    source: 'user',
    details: {
      acceptedCount,
      totalReviewItems: job.reviewItems.length
    }
  });

  return {
    success: true,
    acceptedCount
  };
}

/**
 * Bulk rejects selected review items.
 */
export async function bulkRejectReviewItems(jobId, reviewIds = [], userId) {
  const job = await CleaningJob.findById(jobId);
  if (!job) {
    throw ApiError.notFound('Cleaning job not found.');
  }

  if (job.owner.toString() !== userId.toString()) {
    throw ApiError.forbidden('Access denied. You do not own this cleaning job.');
  }

  const idSet = Array.isArray(reviewIds) && reviewIds.length > 0
    ? new Set(reviewIds.map(String))
    : null;

  const now = new Date();
  let rejectedCount = 0;

  for (const item of job.reviewItems || []) {
    const matches = idSet ? (idSet.has(item.reviewId) || idSet.has(item._id?.toString())) : item.status === 'pending';
    if (matches && item.status === 'pending') {
      item.status = 'rejected';
      item.approvedValue = item.originalValue; // Preserves raw original value
      item.reviewedBy = userId;
      item.reviewedAt = now;
      rejectedCount++;

      // Restore original value in preview row
      if (Array.isArray(job.preview)) {
        const previewRow = job.preview.find((r) => r.rowNumber === item.rowNumber);
        if (previewRow && previewRow.cleaned) {
          previewRow.cleaned[item.field] = item.originalValue;
        }
      }
    }
  }

  job.markModified('preview');
  job.markModified('reviewItems');
  await job.save();

  await AuditLog.create({
    owner: userId,
    user: userId,
    dataset: job.dataset,
    cleaningJob: job._id,
    action: 'review_bulk_rejected',
    entityType: 'CleaningJob',
    entityId: job._id,
    source: 'user',
    details: {
      rejectedCount,
      totalReviewItems: job.reviewItems.length
    }
  });

  return {
    success: true,
    rejectedCount
  };
}

export default {
  generateReviewItemsForJob,
  getJobReviewItems,
  getReviewItem,
  acceptReviewItem,
  rejectReviewItem,
  editReviewItem,
  bulkAcceptReviewItems,
  bulkRejectReviewItems
};
