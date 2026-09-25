/**
 * Standard classification enums and factory helpers for the deterministic cleaning engine.
 */

export const RowClassification = {
  CLEAN: 'clean',
  MODIFIED: 'modified',
  NEEDS_REVIEW: 'needs_review',
  INVALID: 'invalid'
};

export const IssueSeverity = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error'
};

export const IssueCategory = {
  MISSING_VALUE: 'missing_value',
  INVALID_FORMAT: 'invalid_format',
  AMBIGUOUS_VALUE: 'ambiguous_value',
  DUPLICATE_SUSPECT: 'duplicate_suspect',
  FIELD_CONFLICT: 'field_conflict',
  MISSING_CONFLICT: 'missing_conflict'
};

/**
 * Creates a standardized change record with optional provenance metadata.
 */
export const createChange = ({
  field,
  rule,
  originalValue,
  cleanedValue,
  reason,
  source = null,
  evidenceLevel = null,
  sourceRows = null,
  groupId = null,
  sourceField = null,
  sourceValue = null
}) => ({
  field,
  rule,
  originalValue,
  cleanedValue,
  reason,
  ...(source ? { source } : {}),
  ...(evidenceLevel ? { evidenceLevel } : {}),
  ...(sourceRows ? { sourceRows } : {}),
  ...(groupId ? { groupId } : {}),
  ...(sourceField ? { sourceField } : {}),
  ...(sourceValue !== null && sourceValue !== undefined ? { sourceValue } : {})
});

/**
 * Creates a standardized validation/cleaning issue record.
 */
export const createIssue = ({ field, rule, category, message, severity = IssueSeverity.WARNING, value = null }) => ({
  field,
  rule,
  category,
  message,
  severity,
  value
});

/**
 * Creates a standardized row result record.
 */
export const createRowResult = ({
  rowNumber,
  original = {},
  cleaned = {},
  changes = [],
  issues = [],
  duplicateInfo = null,
  classification = RowClassification.CLEAN
}) => ({
  rowNumber,
  original,
  cleaned,
  changes,
  issues,
  duplicateInfo,
  classification
});

/**
 * Creates initial metric counters for a dataset cleaning run.
 */
export const createInitialMetrics = (totalRows = 0) => ({
  totalRows,
  cleanRows: 0,
  modifiedRows: 0,
  reviewRows: 0,
  invalidRows: 0,
  duplicateRows: 0,
  totalDuplicateGroups: 0,
  deterministicDuplicateGroups: 0,
  potentialDuplicateGroups: 0,
  canonicalRows: 0,
  duplicatePairs: 0,
  conflictCount: 0,
  missingValueCount: 0,
  rowsWithMissingValues: 0,
  resolvedMissingValues: 0,
  unresolvedMissingValues: 0,
  missingConflicts: 0,
  imputedFieldCount: 0,
  fieldsImputed: {},
  changedFieldCount: 0,
  aiCandidates: 0,
  aiProcessed: 0,
  aiSuggestions: 0,
  aiApplied: 0,
  aiNeedsReview: 0,
  aiRejected: 0,
  aiFailed: 0,
  aiProvider: null,
  aiModel: null,
  aiUsage: {
    requestCount: 0,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null
  }
});

export default {
  RowClassification,
  IssueSeverity,
  IssueCategory,
  createChange,
  createIssue,
  createRowResult,
  createInitialMetrics
};
