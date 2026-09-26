import { createChange, createIssue, IssueCategory, IssueSeverity } from '../schemas/cleaningResult.schema.js';

export const DEFAULT_MISSING_MARKERS = new Set([
  'n/a',
  'na',
  'null',
  'unknown',
  '-',
  '--',
  'none',
  'nil',
  'undefined'
]);

/**
 * Checks whether a given value represents a missing value.
 *
 * Rules:
 * - null, undefined, "", and whitespace-only strings are ALWAYS missing.
 * - 0 (number) and false (boolean) are NOT missing.
 * - Textual markers like "N/A", "null", "unknown" are configurable.
 *
 * @param {any} value
 * @param {object} [options={}]
 * @param {Set<string>|Array<string>} [options.missingMarkers=DEFAULT_MISSING_MARKERS]
 * @returns {boolean}
 */
export const isMissingValue = (value, options = {}) => {
  if (value === null || value === undefined) {
    return true;
  }

  // Explicit safety rule: 0 and false must NOT be classified as missing
  if (value === 0 || value === false) {
    return false;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return true;
    }

    let markers = DEFAULT_MISSING_MARKERS;
    if (options.missingMarkers) {
      const arr = options.missingMarkers instanceof Set
        ? Array.from(options.missingMarkers)
        : Array.isArray(options.missingMarkers)
        ? options.missingMarkers
        : [options.missingMarkers];
      markers = new Set(arr.map((m) => String(m).trim().toLowerCase()));
    }

    if (markers.has(trimmed.toLowerCase())) {
      return true;
    }
  }

  return false;
};

/**
 * Evaluates a field for missing values and generates change/issue records if applicable.
 *
 * @param {string} field
 * @param {any} value
 * @param {object} [options={}]
 * @returns {{ isMissing: boolean, cleanedValue: any, change: object | null, issue: object | null }}
 */
export const checkMissingValue = (field, value, options = {}) => {
  const missing = isMissingValue(value, options);

  if (missing) {
    let change = null;

    // If it was a non-empty string like "N/A" or whitespace "  ", normalize to ""
    if (typeof value === 'string' && value !== '') {
      change = createChange({
        field,
        rule: 'missing_value.normalize_to_empty',
        originalValue: value,
        cleanedValue: '',
        reason: 'Converted missing/placeholder value marker to empty cell'
      });
    }

    const issue = createIssue({
      field,
      rule: 'missing_value.detect',
      category: IssueCategory.MISSING_VALUE,
      message: `Field '${field}' contains a missing or empty value`,
      severity: IssueSeverity.WARNING,
      value
    });

    return {
      isMissing: true,
      cleanedValue: '',
      change,
      issue
    };
  }

  return {
    isMissing: false,
    cleanedValue: value,
    change: null,
    issue: null
  };
};

export default {
  DEFAULT_MISSING_MARKERS,
  isMissingValue,
  checkMissingValue
};
