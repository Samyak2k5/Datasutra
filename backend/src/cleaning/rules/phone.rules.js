import { createChange, createIssue, IssueCategory, IssueSeverity } from '../schemas/cleaningResult.schema.js';
import { isMissingValue } from './missingValue.rules.js';

/**
 * Validates an Indian mobile number.
 * Standard format: 10 digits starting with 6, 7, 8, or 9.
 * @param {string} digits
 * @returns {boolean}
 */
export const isValidIndianMobile = (digits) => {
  return /^[6-9]\d{9}$/.test(digits);
};

/**
 * Normalizes phone numbers with special support for Indian formats (+91, 91, 0, separators).
 *
 * Rules:
 * - Trims and removes whitespace, hyphens, parentheses, dots.
 * - Handles Indian prefixes (+91, 91, leading 0) when followed by a valid 10-digit mobile number.
 * - Leaves unrecognized international formats unchanged while flagging issues if invalid.
 *
 * @param {string} field
 * @param {any} value
 * @param {object} [options={}]
 * @param {string} [options.country='IN']
 * @returns {{ cleanedValue: string, isMissing: boolean, isValid: boolean, change: object | null, issue: object | null }}
 */
export const cleanPhone = (field, value, options = {}) => {
  if (isMissingValue(value, options)) {
    const issue = createIssue({
      field,
      rule: 'phone.missing',
      category: IssueCategory.MISSING_VALUE,
      message: `Phone field '${field}' is empty`,
      severity: IssueSeverity.WARNING,
      value
    });
    return {
      cleanedValue: '',
      isMissing: true,
      isValid: false,
      change: typeof value === 'string' && value !== '' ? createChange({
        field,
        rule: 'phone.normalize_empty',
        originalValue: value,
        cleanedValue: '',
        reason: 'Converted whitespace-only phone to empty string'
      }) : null,
      issue
    };
  }

  const rawStr = String(value);
  const trimmed = rawStr.trim();
  const country = options.country || 'IN';

  // Check if string contains unexpected alphabetic characters
  if (/[a-zA-Z]/.test(trimmed)) {
    const issue = createIssue({
      field,
      rule: 'phone.alphabetic_characters',
      category: IssueCategory.INVALID_FORMAT,
      message: `Phone number '${rawStr}' contains invalid alphabetic characters`,
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

  let normalized = trimmed;

  if (country === 'IN') {
    // 1. Remove + prefix if present
    let working = trimmed;
    if (working.startsWith('+')) {
      working = working.slice(1).trim();
    }

    // 2. Remove standard separators: space, hyphen, parentheses, dots, slashes
    const digitsOnly = working.replace(/[\s\-()./]/g, '');

    // 3. Handle Indian prefixes
    let extracted = digitsOnly;

    // Check if 12 digits starting with 91 (e.g. 919876543210)
    if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
      const sub = digitsOnly.slice(2);
      if (isValidIndianMobile(sub)) {
        extracted = sub;
      }
    }
    // Check if 11 digits starting with 0 (e.g. 09876543210)
    else if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) {
      const sub = digitsOnly.slice(1);
      if (isValidIndianMobile(sub)) {
        extracted = sub;
      }
    }
    // 10 digits
    else if (digitsOnly.length === 10) {
      extracted = digitsOnly;
    }

    if (isValidIndianMobile(extracted)) {
      let change = null;
      if (rawStr !== extracted) {
        change = createChange({
          field,
          rule: 'phone.normalize_in',
          originalValue: value,
          cleanedValue: extracted,
          reason: 'Normalized Indian phone number to standard 10-digit mobile format'
        });
      }
      return {
        cleanedValue: extracted,
        isMissing: false,
        isValid: true,
        change,
        issue: null
      };
    }

    // Invalid Indian format
    const issue = createIssue({
      field,
      rule: 'phone.invalid_in_format',
      category: IssueCategory.INVALID_FORMAT,
      message: `Phone number '${rawStr}' is not a valid 10-digit Indian mobile number`,
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

  // Non-IN or generic phone numbers
  const genericCleaned = trimmed.replace(/[\s\-()./]/g, '');
  const isValidGeneric = /^\+?\d{7,15}$/.test(genericCleaned);

  if (isValidGeneric) {
    let change = null;
    if (rawStr !== genericCleaned) {
      change = createChange({
        field,
        rule: 'phone.normalize_generic',
        originalValue: value,
        cleanedValue: genericCleaned,
        reason: 'Removed phone formatting separators'
      });
    }
    return {
      cleanedValue: genericCleaned,
      isMissing: false,
      isValid: true,
      change,
      issue: null
    };
  }

  const issue = createIssue({
    field,
    rule: 'phone.invalid_generic_format',
    category: IssueCategory.INVALID_FORMAT,
    message: `Phone number '${rawStr}' is not valid`,
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
};

export default {
  isValidIndianMobile,
  cleanPhone
};
