import {
  RowClassification,
  IssueSeverity,
  createRowResult,
  createInitialMetrics
} from '../schemas/cleaningResult.schema.js';
import { FieldType, detectColumnTypes } from '../rules/fieldTypeDetector.js';
import { checkMissingValue } from '../rules/missingValue.rules.js';
import { cleanEmail } from '../rules/email.rules.js';
import { cleanPhone } from '../rules/phone.rules.js';
import { cleanName } from '../rules/name.rules.js';
import { cleanLocation } from '../rules/location.rules.js';
import { cleanGeneralString } from '../rules/standardization.rules.js';
import { annotateDuplicates, detectDuplicates } from '../duplicate/duplicateDetector.js';
import { processMissingData } from '../missing/missingDataEngine.js';

/**
 * Classifies a row after cleaning rules, duplicate detection, and safe imputation have run.
 *
 * Hierarchy:
 * 1. 'invalid': Contains critical format violations (severity = error) that could not be safely corrected.
 * 2. 'needs_review': Contains missing values in key fields, suspected duplicates, or warnings requiring review.
 * 3. 'modified': Safe deterministic changes were applied with zero outstanding errors or review triggers.
 * 4. 'clean': Pristine row without changes or issues.
 *
 * @param {object} rowResult
 * @returns {string} One of RowClassification values
 */
export const classifyRow = (rowResult) => {
  const { changes, issues, duplicateInfo } = rowResult;

  const hasErrors = issues.some((i) => i.severity === IssueSeverity.ERROR);
  if (hasErrors) {
    return RowClassification.INVALID;
  }

  const isDuplicateNeedsReview =
    duplicateInfo &&
    duplicateInfo.isDuplicate &&
    duplicateInfo.requiresReview !== false;

  const hasWarnings = issues.some((i) => i.severity === IssueSeverity.WARNING);

  if (isDuplicateNeedsReview || hasWarnings) {
    return RowClassification.NEEDS_REVIEW;
  }

  if (changes.length > 0) {
    return RowClassification.MODIFIED;
  }

  return RowClassification.CLEAN;
};

/**
 * Executes deterministic data cleaning on an array of parsed dataset rows.
 *
 * @param {Array<object>} rows - Parsed row records (with _rowNumber)
 * @param {Array<object|string>} [columns=[]] - Dataset column metadata
 * @param {object} [options={}] - Custom configuration (missingMarkers, fieldOverrides, aliases, etc.)
 * @returns {{ rows: Array<object>, metrics: object, fieldTypes: object }}
 */
export const processDatasetRows = (rows, columns = [], options = {}) => {
  if (!Array.isArray(rows)) {
    return { rows: [], metrics: createInitialMetrics(0), fieldTypes: {} };
  }

  // 1. Determine column field types
  let colNames = [];
  if (columns.length > 0) {
    colNames = columns.map((c) => (typeof c === 'string' ? c : c.name));
  } else if (rows.length > 0) {
    colNames = Object.keys(rows[0]).filter((k) => k !== '_rowNumber');
  }

  const columnTypeMap = detectColumnTypes(colNames, options.fieldOverrides || {});
  const metrics = createInitialMetrics(rows.length);

  // 2. Process each row through field-level deterministic rules
  const cleanedRows = rows.map((rawRow, index) => {
    const rowNumber = rawRow._rowNumber || index + 2;
    const original = {};
    const cleaned = {};
    const changes = [];
    const issues = [];

    for (const [key, rawVal] of Object.entries(rawRow)) {
      if (key === '_rowNumber') continue;

      original[key] = rawVal;
      const fieldType = columnTypeMap.get(key) || FieldType.GENERAL_STRING;

      // First check for missing value
      const missingCheck = checkMissingValue(key, rawVal, options);
      if (missingCheck.isMissing) {
        metrics.missingValueCount++;
        cleaned[key] = missingCheck.cleanedValue;
        if (missingCheck.change) {
          changes.push(missingCheck.change);
          metrics.changedFieldCount++;
        }
        if (missingCheck.issue) {
          issues.push(missingCheck.issue);
        }
        continue;
      }

      // Apply field-specific rule
      let ruleResult;
      switch (fieldType) {
        case FieldType.EMAIL:
          ruleResult = cleanEmail(key, rawVal, options);
          break;
        case FieldType.PHONE:
          ruleResult = cleanPhone(key, rawVal, options);
          break;
        case FieldType.NAME:
          ruleResult = cleanName(key, rawVal, options);
          break;
        case FieldType.LOCATION:
          ruleResult = cleanLocation(key, rawVal, options);
          break;
        case FieldType.GENERAL_STRING:
        default:
          ruleResult = cleanGeneralString(key, rawVal, options);
          break;
      }

      cleaned[key] = ruleResult.cleanedValue;
      if (ruleResult.change) {
        changes.push(ruleResult.change);
        metrics.changedFieldCount++;
      }
      if (ruleResult.issue) {
        issues.push(ruleResult.issue);
      }
    }

    return createRowResult({
      rowNumber,
      original,
      cleaned,
      changes,
      issues
    });
  });

  // 3. Detect duplicate records and groups across the batch
  const duplicateResult = detectDuplicates(cleanedRows, columnTypeMap, options);
  metrics.duplicateRows = duplicateResult.duplicateRows;
  metrics.totalDuplicateGroups = duplicateResult.totalDuplicateGroups;
  metrics.deterministicDuplicateGroups = duplicateResult.deterministicDuplicateGroups;
  metrics.potentialDuplicateGroups = duplicateResult.potentialDuplicateGroups;
  metrics.canonicalRows = duplicateResult.canonicalRows;
  metrics.duplicatePairs = duplicateResult.duplicatePairs;
  metrics.conflictCount = duplicateResult.conflictCount;

  // 4. Perform SAFE deterministic missing-value resolution & analysis
  const missingResult = processMissingData(
    cleanedRows,
    duplicateResult.groups,
    columnTypeMap,
    options
  );

  metrics.missingValueCount = missingResult.missingMetrics.missingValueCount;
  metrics.rowsWithMissingValues = missingResult.missingMetrics.rowsWithMissingValues;
  metrics.resolvedMissingValues = missingResult.missingMetrics.resolvedMissingValues;
  metrics.unresolvedMissingValues = missingResult.missingMetrics.unresolvedMissingValues;
  metrics.missingConflicts = missingResult.missingMetrics.missingConflicts;
  metrics.imputedFieldCount = missingResult.missingMetrics.imputedFieldCount;
  metrics.fieldsImputed = missingResult.missingMetrics.fieldsImputed;
  metrics.changedFieldCount += missingResult.missingMetrics.resolvedMissingValues;

  // 5. Classify each row and accumulate metrics
  for (const rowResult of cleanedRows) {
    rowResult.classification = classifyRow(rowResult);

    switch (rowResult.classification) {
      case RowClassification.CLEAN:
        metrics.cleanRows++;
        break;
      case RowClassification.MODIFIED:
        metrics.modifiedRows++;
        break;
      case RowClassification.NEEDS_REVIEW:
        metrics.reviewRows++;
        break;
      case RowClassification.INVALID:
        metrics.invalidRows++;
        break;
    }
  }

  return {
    rows: cleanedRows,
    metrics,
    duplicateGroups: duplicateResult.groups,
    fieldTypes: Object.fromEntries(columnTypeMap.entries())
  };
};

export default {
  classifyRow,
  processDatasetRows
};

