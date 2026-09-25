import fs from 'fs';
import CleaningJob from '../models/CleaningJob.js';
import Dataset from '../models/Dataset.js';
import AuditLog from '../models/AuditLog.js';
import ApiError from '../utils/apiError.js';
import parserService from './parser.service.js';
import rulePipeline from '../cleaning/pipeline/rulePipeline.js';

/**
 * DataSutra Export Service (Step 12)
 *
 * Supports exporting cleaned datasets and compliance-ready audit summaries
 * in CSV, JSON, and PDF formats without modifying original files or exposing secrets.
 */

const SENSITIVE_EXPORT_FIELDS = new Set([
  'password', 'passwordhash', 'pass', 'passwd', 'jwt', 'token', 'accesstoken', 'refreshtoken',
  'apikey', 'api_key', 'secret', 'auth_token', 'private_key', 'authorization', 'bearer'
]);

const SENSITIVE_KEYWORDS = ['password', 'passwd', 'secret', 'token', 'apikey', 'jwt', 'privatekey'];

function isSensitiveField(fieldName) {
  if (!fieldName || typeof fieldName !== 'string') return false;
  const clean = fieldName.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (SENSITIVE_EXPORT_FIELDS.has(clean)) return true;
  return SENSITIVE_KEYWORDS.some((kw) => clean.includes(kw));
}

const CSV_FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

/**
 * Safely escapes a string for CSV inclusion with formula injection defense (CWE-1236).
 */
function escapeCsvCell(val) {
  if (val === null || val === undefined) return '';
  let str = String(val);

  // Neutralize CSV formula injection if string starts with formula operators and isn't a pure number
  const isPureNumber = typeof val === 'number' || (/^[-+]?\d+(\.\d+)?$/.test(str.trim()) && !str.includes('\n'));
  if (!isPureNumber && CSV_FORMULA_PREFIXES.some((p) => str.startsWith(p))) {
    str = `'${str}`;
  }

  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generates an export payload for a cleaned dataset or report.
 *
 * @param {string} jobId - CleaningJob ID
 * @param {string} userId - Requesting user ID
 * @param {string} [format='csv'] - Export format ('csv' | 'json' | 'report-csv' | 'pdf')
 * @returns {Promise<Object>} Object containing { content, contentType, filename }
 */
export async function exportDatasetOrReport(jobId, userId, format = 'csv') {
  const job = await CleaningJob.findById(jobId);
  if (!job) {
    throw ApiError.notFound('Cleaning job not found.');
  }

  if (job.owner.toString() !== userId.toString()) {
    throw ApiError.forbidden('Access denied. You do not own this cleaning job.');
  }

  const dataset = await Dataset.findById(job.dataset);
  if (!dataset) {
    throw ApiError.notFound('Associated dataset not found.');
  }

  // Build approved row values incorporating human review decisions
  const reviewMap = new Map();
  for (const item of job.reviewItems || []) {
    if (item.status === 'accepted' || item.status === 'edited') {
      const key = `${item.rowNumber}_${item.field}`;
      reviewMap.set(key, item.approvedValue);
    } else if (item.status === 'rejected') {
      const key = `${item.rowNumber}_${item.field}`;
      reviewMap.set(key, item.originalValue);
    }
  }

  // Retrieve raw source rows if physical file is available; fallback to preview
  let sourceRows = [];
  if (dataset.storagePath && fs.existsSync(dataset.storagePath)) {
    try {
      const parsed = await parserService.parseDataset(
        dataset.storagePath,
        dataset.sourceFormat || dataset.fileType
      );
      const cleaningResult = rulePipeline.processDatasetRows(
        parsed.rows,
        dataset.columns,
        job.configuration || {}
      );
      sourceRows = cleaningResult.rows;
    } catch {
      sourceRows = job.preview || [];
    }
  } else {
    sourceRows = job.preview || [];
  }

  const rows = sourceRows.map((r) => {
    const rawCleaned = { ...(r.cleaned || r.original || {}) };
    for (const [key, approvedVal] of reviewMap.entries()) {
      const [rowNumStr, field] = key.split('_');
      if (parseInt(rowNumStr, 10) === r.rowNumber) {
        const targetKey = Object.keys(rawCleaned).find(
          (k) => k.toLowerCase() === field.toLowerCase()
        ) || field;
        rawCleaned[targetKey] = approvedVal;
      }
    }

    // Redact sensitive security fields
    const safeRow = {};
    for (const [k, v] of Object.entries(rawCleaned)) {
      if (!isSensitiveField(k)) {
        safeRow[k] = v;
      }
    }
    return safeRow;
  });

  const baseName = (dataset.originalFileName || dataset.name || dataset.originalName || 'dataset').replace(/\.[^/.]+$/, '');

  // Log export action
  await AuditLog.create({
    owner: userId,
    user: userId,
    dataset: dataset._id,
    cleaningJob: job._id,
    action: 'dataset_exported',
    entityType: 'CleaningJob',
    entityId: job._id,
    source: 'user',
    details: {
      format,
      rowCount: rows.length,
      datasetId: dataset._id.toString()
    }
  });

  if (format === 'json') {
    return {
      content: JSON.stringify(rows, null, 2),
      contentType: 'application/json; charset=utf-8',
      filename: `${baseName}_cleaned.json`
    };
  }

  if (format === 'report-csv') {
    // Audit summary of changes
    const headers = ['Row', 'Field', 'Original Value', 'Cleaned Value', 'Rule Applied', 'Source', 'Reason'];
    const lines = [headers.join(',')];

    for (const log of job.transformationLog || []) {
      lines.push(
        [
          log.rowNumber,
          escapeCsvCell(log.field),
          escapeCsvCell(log.originalValue),
          escapeCsvCell(log.cleanedValue),
          escapeCsvCell(log.rule),
          escapeCsvCell(log.source),
          escapeCsvCell(log.reason)
        ].join(',')
      );
    }

    return {
      content: lines.join('\r\n'),
      contentType: 'text/csv; charset=utf-8',
      filename: `${baseName}_audit_report.csv`
    };
  }

  if (format === 'pdf') {
    // Generate text/PDF audit report summary
    const quality = job.qualityScore || {};
    const reportText = [
      '=================================================================',
      'DATASUTRA DATA CLEANING & QUALITY AUDIT REPORT',
      '=================================================================',
      `Dataset:         ${dataset.originalFileName || dataset.name || dataset.originalName || 'Dataset'}`,
      `File Format:     ${dataset.sourceFormat || dataset.fileType || 'CSV'}`,
      `Cleaning Job:    ${job._id.toString()}`,
      `Completed At:    ${job.completedAt ? new Date(job.completedAt).toISOString() : new Date().toISOString()}`,
      `Cleaning Mode:   ${job.cleaningMode}`,
      '-----------------------------------------------------------------',
      'DATA QUALITY SCORE SUMMARY',
      '-----------------------------------------------------------------',
      `Overall Score:   ${quality.overall ?? 100}%`,
      `Completeness:    ${quality.completeness ?? 100}% (Weight: 30%)`,
      `Validity:        ${quality.validity ?? 100}% (Weight: 30%)`,
      `Uniqueness:      ${quality.uniqueness ?? 100}% (Weight: 20%)`,
      `Consistency:     ${quality.consistency ?? 100}% (Weight: 20%)`,
      '-----------------------------------------------------------------',
      'CLEANING PIPELINE METRICS',
      '-----------------------------------------------------------------',
      `Total Records:             ${job.totalRecords || 0}`,
      `Clean Records:             ${job.cleanedRecords || 0}`,
      `Modified Records:          ${job.modifiedRecords || 0}`,
      `Duplicate Records:         ${job.duplicateRecords || 0}`,
      `Duplicate Groups:          ${job.totalDuplicateGroups || 0}`,
      `Missing Values:            ${job.missingValueRecords || 0}`,
      `Resolved Missing Values:   ${job.resolvedMissingValues || 0}`,
      `Unresolved Missing Values: ${job.unresolvedMissingValues || 0}`,
      `AI Candidates:             ${job.aiCandidates || 0}`,
      `AI Applied Suggestions:    ${job.aiApplied || 0}`,
      `AI Needs Review:           ${job.aiNeedsReview || 0}`,
      '-----------------------------------------------------------------',
      'HUMAN OPERATOR REVIEW ACTIONS',
      '-----------------------------------------------------------------',
      `Total Review Items:        ${(job.reviewItems || []).length}`,
      `Accepted:                  ${(job.reviewItems || []).filter((i) => i.status === 'accepted').length}`,
      `Rejected:                  ${(job.reviewItems || []).filter((i) => i.status === 'rejected').length}`,
      `Edited:                    ${(job.reviewItems || []).filter((i) => i.status === 'edited').length}`,
      `Pending:                   ${(job.reviewItems || []).filter((i) => i.status === 'pending').length}`,
      '=================================================================',
      'Generated by DataSutra Intelligent Data Preparation Engine',
      '================================================================='
    ].join('\n');

    return {
      content: reportText,
      contentType: 'text/plain; charset=utf-8',
      filename: `${baseName}_quality_audit.txt`
    };
  }

  // Default: Standard CSV of cleaned data
  const colKeys = (dataset.columns && dataset.columns.length > 0
    ? dataset.columns.map((c) => (typeof c === 'string' ? c : c.name || c.key))
    : (rows.length > 0 ? Object.keys(rows[0]) : [])
  ).filter((col) => !isSensitiveField(col));

  const csvLines = [colKeys.map(escapeCsvCell).join(',')];

  for (const r of rows) {
    const rowValues = colKeys.map((col) => escapeCsvCell(r[col] ?? ''));
    csvLines.push(rowValues.join(','));
  }

  return {
    content: csvLines.join('\r\n'),
    contentType: 'text/csv; charset=utf-8',
    filename: `${baseName}_cleaned.csv`
  };
}

export default {
  exportDatasetOrReport
};
