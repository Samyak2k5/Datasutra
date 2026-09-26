import { createChange } from '../schemas/cleaningResult.schema.js';

/**
 * Trims leading and trailing whitespace and collapses repeated internal spaces into a single space.
 * @param {any} val
 * @returns {string}
 */
export const trimAndCollapseWhitespace = (val) => {
  if (val === null || val === undefined) return '';
  return String(val)
    .trim()
    .replace(/\s+/g, ' ');
};

/**
 * Converts a string to Title Case (capitalizing the first letter of each word).
 * Accurately handles hyphens and initials.
 * Example: "RAHUL SHARMA" -> "Rahul Sharma", "priya-shah" -> "Priya-Shah"
 * @param {string} str
 * @returns {string}
 */
export const toTitleCase = (str) => {
  if (!str || typeof str !== 'string') return '';
  return str
    .split(' ')
    .map((word) => {
      if (!word) return '';
      // Support hyphenated subwords (e.g. Mary-Jane)
      return word
        .split('-')
        .map((part) => {
          if (!part) return '';
          return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
        })
        .join('-');
    })
    .join(' ');
};

/**
 * Standardize general text fields without aggressive formatting.
 * Preserves numbers, booleans, and non-empty meaningful punctuation.
 *
 * @param {string} field
 * @param {any} value
 * @returns {{ cleanedValue: any, change: object | null }}
 */
export const cleanGeneralString = (field, value) => {
  if (value === null || value === undefined) {
    return { cleanedValue: '', change: null };
  }

  // Preserve numbers and booleans as-is
  if (typeof value === 'number' || typeof value === 'boolean') {
    return { cleanedValue: value, change: null };
  }

  const rawStr = String(value);
  const normalized = trimAndCollapseWhitespace(rawStr);

  if (rawStr !== normalized) {
    const change = createChange({
      field,
      rule: 'standardization.trim_and_collapse',
      originalValue: value,
      cleanedValue: normalized,
      reason: 'Trimmed surrounding spaces and collapsed internal whitespace'
    });
    return { cleanedValue: normalized, change };
  }

  return { cleanedValue: value, change: null };
};

export default {
  trimAndCollapseWhitespace,
  toTitleCase,
  cleanGeneralString
};
