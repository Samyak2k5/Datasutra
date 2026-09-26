import { createChange, createIssue, IssueCategory, IssueSeverity } from '../schemas/cleaningResult.schema.js';
import { isMissingValue } from './missingValue.rules.js';
import { trimAndCollapseWhitespace, toTitleCase } from './standardization.rules.js';

/**
 * Normalizes a person's name deterministically.
 *
 * Rules:
 * - Trims leading and trailing spaces.
 * - Collapses internal repeated whitespace.
 * - Converts to title casing (capitalizing each name segment).
 * - Preserves initials with periods (e.g., "A.K. Sharma").
 * - Does not invent names or infer identity from similarity.
 *
 * @param {string} field
 * @param {any} value
 * @param {object} [options={}]
 * @returns {{ cleanedValue: string, isMissing: boolean, change: object | null, issue: object | null }}
 */
export const cleanName = (field, value, options = {}) => {
  if (isMissingValue(value, options)) {
    const issue = createIssue({
      field,
      rule: 'name.missing',
      category: IssueCategory.MISSING_VALUE,
      message: `Name field '${field}' is empty`,
      severity: IssueSeverity.WARNING,
      value
    });
    return {
      cleanedValue: '',
      isMissing: true,
      change: typeof value === 'string' && value !== '' ? createChange({
        field,
        rule: 'name.normalize_empty',
        originalValue: value,
        cleanedValue: '',
        reason: 'Converted whitespace-only name to empty string'
      }) : null,
      issue
    };
  }

  const rawStr = String(value);
  const collapsed = trimAndCollapseWhitespace(rawStr);
  const titleCased = toTitleCase(collapsed);

  let change = null;
  if (rawStr !== titleCased) {
    change = createChange({
      field,
      rule: 'name.normalize',
      originalValue: value,
      cleanedValue: titleCased,
      reason: 'Trimmed whitespace and converted to title case'
    });
  }

  return {
    cleanedValue: titleCased,
    isMissing: false,
    change,
    issue: null
  };
};

export default {
  cleanName
};
