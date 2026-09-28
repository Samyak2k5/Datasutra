import { isMissingValue } from '../cleaning/rules/missingValue.rules.js';
import { IssueCategory, RowClassification } from '../cleaning/schemas/cleaningResult.schema.js';
import { AITaskType } from './schemas/aiCleaningResult.schema.js';

// Keys that should never be sent to LLM under any circumstance
const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /jwt/i,
  /auth/i,
  /apikey/i,
  /api_key/i,
  /credential/i,
  /private/i,
  /hash/i,
  /ssn/i,
  /cvv/i
];

/**
 * Checks whether a field name represents sensitive or credential data.
 *
 * @param {string} key
 * @returns {boolean}
 */
export const isSensitiveKey = (key) => {
  if (!key || typeof key !== 'string') return false;
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
};

/**
 * Strips sensitive keys and internal properties from an object.
 *
 * @param {object} obj
 * @param {string} excludeField - The target unresolved field itself (kept in currentValue, excluded from related)
 * @returns {object}
 */
export const sanitizeRelatedFields = (obj = {}, excludeField = '') => {
  const sanitized = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith('_')) continue;
    if (k === excludeField) continue;
    if (isSensitiveKey(k)) continue;

    // Truncate overly long values to save tokens
    if (typeof v === 'string' && v.length > 200) {
      sanitized[k] = v.slice(0, 200) + '...';
    } else {
      sanitized[k] = v;
    }
  }
  return sanitized;
};

/**
 * Infers an appropriate AITaskType for an unresolved field based on issues and value.
 *
 * @param {string} field
 * @param {any} currentValue
 * @param {Array<object>} issues
 * @returns {string} One of AITaskType
 */
export const inferTaskType = (field, currentValue, issues = []) => {
  const hasMissing = issues.some(
    (i) => i.category === IssueCategory.MISSING_VALUE || i.category === IssueCategory.MISSING_CONFLICT
  );
  if (hasMissing || isMissingValue(currentValue)) {
    return AITaskType.UNRESOLVED_MISSING_VALUE;
  }

  const lower = field.toLowerCase();
  if (lower.includes('city') || lower.includes('state') || lower.includes('country') || lower.includes('location')) {
    return AITaskType.AMBIGUOUS_LOCATION;
  }

  const hasDuplicateSuspect = issues.some((i) => i.category === IssueCategory.DUPLICATE_SUSPECT);
  if (hasDuplicateSuspect) {
    return AITaskType.AMBIGUOUS_DUPLICATE_REVIEW;
  }

  const hasFormatIssue = issues.some((i) => i.category === IssueCategory.INVALID_FORMAT);
  if (hasFormatIssue) {
    return AITaskType.AMBIGUOUS_STANDARDIZATION;
  }

  return AITaskType.AMBIGUOUS_TEXT_NORMALIZATION;
};

/**
 * Extracts only unresolved records and unresolved fields from a cleaned dataset.
 * Ensures zero clean/already-resolved rows are included, protecting token budget.
 *
 * @param {Array<object>} cleanedRows - Row results from deterministic cleaning
 * @param {object} [options={}]
 * @returns {Array<object>} Array of unresolved item contexts
 */
export const extractUnresolvedItems = (cleanedRows = [], options = {}) => {
  const unresolvedItems = [];

  for (const row of cleanedRows) {
    // Only inspect rows that are not clean or modified-without-issues
    // Specifically: needs_review or invalid, or rows with unresolved missing/conflict issues
    if (row.classification === RowClassification.CLEAN) {
      continue;
    }

    // Identify unresolved fields in this row
    const unresolvedFields = new Set();

    // 1. Missing fields that were not resolved
    if (Array.isArray(row.missingFields)) {
      for (const mf of row.missingFields) {
        if (isMissingValue(row.cleaned?.[mf], options)) {
          unresolvedFields.add(mf);
        }
      }
    }

    // 2. Fields with remaining unresolved warnings or conflicts
    for (const issue of row.issues || []) {
      if (issue.field && issue.category !== IssueCategory.DUPLICATE_SUSPECT) {
        unresolvedFields.add(issue.field);
      }
    }

    // If no specific unresolved field was found, skip this row
    if (unresolvedFields.size === 0) {
      continue;
    }

    for (const field of unresolvedFields) {
      // Don't send sensitive fields to AI
      if (isSensitiveKey(field)) continue;

      const fieldIssues = (row.issues || []).filter((i) => i.field === field);
      const currentValue = row.cleaned?.[field] ?? '';
      const taskType = inferTaskType(field, currentValue, fieldIssues);
      const relatedFields = sanitizeRelatedFields(row.cleaned, field);

      unresolvedItems.push({
        rowNumber: row.rowNumber,
        field,
        currentValue,
        taskType,
        issueCodes: fieldIssues.map((i) => i.rule || i.category),
        relatedFields
      });
    }
  }

  return unresolvedItems;
};

/**
 * Chunks unresolved items into bounded batches according to batchSize.
 *
 * @param {Array<object>} items
 * @param {number} [batchSize=10]
 * @returns {Array<Array<object>>}
 */
export const chunkItemsIntoBatches = (items = [], batchSize = 10) => {
  const size = Math.max(1, batchSize);
  const batches = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
};

export default {
  isSensitiveKey,
  sanitizeRelatedFields,
  inferTaskType,
  extractUnresolvedItems,
  chunkItemsIntoBatches
};


// Bounds both data exposure and token cost. Statistics describe this sample only.
export function buildDatasetAIContext(dataset, preview) {
  const headers = preview.headers.filter(key => key.length <= 200 && !key.startsWith('_') && !isSensitiveKey(key)).slice(0, 50);
  const scrub = value => JSON.stringify(value ?? '', (key, item) => isSensitiveKey(key) ? '[REDACTED]' : item)
    .replace(/sk-[a-zA-Z0-9_-]{16,}/g, '[REDACTED]').slice(0, 200);
  const sampled = preview.rows.slice(0, 20);
  const rows = sampled.map(row => Object.fromEntries(headers.map(name => [name, scrub(row[name])])));
  while (JSON.stringify(rows).length > 18000) rows.pop();
  const columns = headers.map(name => ({ name, observedTypes: [...new Set(sampled.map(row => typeof row[name]))],
    missingInSample: sampled.filter(row => isMissingValue(row[name])).length }));
  const text = (preview.documentStructure?.sections || []).map(section => section.content || '').join('\n').slice(0, 8000)
    .replace(/sk-[a-zA-Z0-9_-]{16,}/g, '[REDACTED]');
  return { filename: String(dataset.originalFileName || dataset.name || '').slice(0, 200), format: dataset.fileType, totalRows: dataset.totalRows, totalColumns: preview.headers.length,
    sampledRows: sampled.length, rowsSent: rows.length, columns, rows, text,
    exactDuplicatesInSample: sampled.length - new Set(sampled.map(row => JSON.stringify(headers.map(name => row[name])))).size,
    limitations: 'First 20 rows only; up to 50 non-sensitive columns and 8000 text characters. Findings may not represent the full dataset.' };
}
