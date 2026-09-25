import { createChange, createIssue, IssueCategory, IssueSeverity } from '../schemas/cleaningResult.schema.js';
import { isMissingValue } from './missingValue.rules.js';
import { trimAndCollapseWhitespace, toTitleCase } from './standardization.rules.js';

export const DEFAULT_CITY_ALIASES = {
  bombay: 'Mumbai',
  calcutta: 'Kolkata',
  madras: 'Chennai',
  bangalore: 'Bengaluru',
  poona: 'Pune',
  baroda: 'Vadodara',
  gurgaon: 'Gurugram',
  cochin: 'Kochi',
  trivandrum: 'Thiruvananthapuram',
  orissa: 'Odisha',
  pondicherry: 'Puducherry'
};

/**
 * Standardizes a city/location string deterministically.
 *
 * Rules:
 * - Trims and collapses multiple spaces.
 * - Converts to title casing ("mumbai" -> "Mumbai", "New   Delhi" -> "New Delhi").
 * - Applies explicit, configurable city alias substitutions ("bombay" -> "Mumbai").
 *
 * @param {string} field
 * @param {any} value
 * @param {object} [options={}]
 * @param {object} [options.aliases=DEFAULT_CITY_ALIASES]
 * @returns {{ cleanedValue: string, isMissing: boolean, change: object | null, issue: object | null }}
 */
export const cleanLocation = (field, value, options = {}) => {
  if (isMissingValue(value, options)) {
    const issue = createIssue({
      field,
      rule: 'location.missing',
      category: IssueCategory.MISSING_VALUE,
      message: `Location field '${field}' is empty`,
      severity: IssueSeverity.WARNING,
      value
    });
    return {
      cleanedValue: '',
      isMissing: true,
      change: typeof value === 'string' && value !== '' ? createChange({
        field,
        rule: 'location.normalize_empty',
        originalValue: value,
        cleanedValue: '',
        reason: 'Converted whitespace-only location to empty string'
      }) : null,
      issue
    };
  }

  const rawStr = String(value);
  const collapsed = trimAndCollapseWhitespace(rawStr);
  const lower = collapsed.toLowerCase();

  const aliases = options.aliases || DEFAULT_CITY_ALIASES;
  let target = aliases[lower];
  let reason = 'Trimmed whitespace and converted to title case';

  if (target) {
    reason = `Resolved historical city alias '${rawStr}' to standard '${target}'`;
  } else {
    target = toTitleCase(collapsed);
  }

  let change = null;
  if (rawStr !== target) {
    change = createChange({
      field,
      rule: 'location.normalize',
      originalValue: value,
      cleanedValue: target,
      reason
    });
  }

  return {
    cleanedValue: target,
    isMissing: false,
    change,
    issue: null
  };
};

export default {
  DEFAULT_CITY_ALIASES,
  cleanLocation
};
