import { createChange, createIssue, IssueCategory, IssueSeverity } from '../schemas/cleaningResult.schema.js';
import { isMissingValue } from './missingValue.rules.js';

// Standard RFC-compliant email regular expression
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/**
 * Validates whether a normalized email string has a syntactically valid structure.
 * @param {string} email
 * @returns {boolean}
 */
export const isValidEmailFormat = (email) => {
  if (!email || typeof email !== 'string') return false;
  // Ensure no spaces anywhere inside
  if (/\s/.test(email)) return false;
  // Check against RFC regex
  return EMAIL_REGEX.test(email);
};

/**
 * Deterministically cleans and validates an email field.
 *
 * Rules:
 * - Trims leading and trailing whitespace.
 * - Converts to lowercase.
 * - Validates format.
 * - Flags internal spaces ("rahul @gmail.com") or missing domain/at ("rahulgmail.com") as invalid.
 * - Never guesses or replaces domain names (e.g. "gmial.com" is NOT changed).
 *
 * @param {string} field - Field/column name
 * @param {any} value - Input value
 * @param {object} [options={}]
 * @returns {{ cleanedValue: string, isMissing: boolean, isValid: boolean, change: object | null, issue: object | null }}
 */
export const cleanEmail = (field, value, options = {}) => {
  if (isMissingValue(value, options)) {
    const issue = createIssue({
      field,
      rule: 'email.missing',
      category: IssueCategory.MISSING_VALUE,
      message: `Email field '${field}' is empty`,
      severity: IssueSeverity.WARNING,
      value
    });
    return {
      cleanedValue: '',
      isMissing: true,
      isValid: false,
      change: typeof value === 'string' && value !== '' ? createChange({
        field,
        rule: 'email.normalize_empty',
        originalValue: value,
        cleanedValue: '',
        reason: 'Converted whitespace-only email to empty string'
      }) : null,
      issue
    };
  }

  const rawStr = String(value);
  const trimmed = rawStr.trim();
  const normalized = trimmed.toLowerCase();

  let change = null;
  if (rawStr !== normalized && !/\s/.test(trimmed)) {
    change = createChange({
      field,
      rule: 'email.trim_and_lowercase',
      originalValue: value,
      cleanedValue: normalized,
      reason: 'Trimmed surrounding spaces and normalized email to lowercase'
    });
  }

  // Detect internal spaces
  if (/\s/.test(trimmed)) {
    const issue = createIssue({
      field,
      rule: 'email.internal_whitespace',
      category: IssueCategory.INVALID_FORMAT,
      message: `Email '${rawStr}' contains invalid internal spaces`,
      severity: IssueSeverity.ERROR,
      value
    });
    return {
      cleanedValue: rawStr, // preserve original value on invalid
      isMissing: false,
      isValid: false,
      change: null,
      issue
    };
  }

  // Validate format
  const valid = isValidEmailFormat(normalized);

  if (!valid) {
    const issue = createIssue({
      field,
      rule: 'email.invalid_format',
      category: IssueCategory.INVALID_FORMAT,
      message: `Email '${rawStr}' is not a valid email address`,
      severity: IssueSeverity.ERROR,
      value
    });
    return {
      cleanedValue: rawStr,
      isMissing: false,
      isValid: false,
      change: null,
      issue
    };
  }

  return {
    cleanedValue: normalized,
    isMissing: false,
    isValid: true,
    change,
    issue: null
  };
};

export default {
  isValidEmailFormat,
  cleanEmail
};
