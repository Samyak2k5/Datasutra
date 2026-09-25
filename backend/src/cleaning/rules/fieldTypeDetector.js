/**
 * Deterministic Field Type Detection based on column names and configurations.
 */

export const FieldType = {
  EMAIL: 'email',
  PHONE: 'phone',
  NAME: 'name',
  LOCATION: 'location',
  GENERAL_STRING: 'general_string'
};

const EMAIL_PATTERNS = [
  /^e[-_]?mail(_?(id|address))?$/i,
  /^mail(_?id)?$/i,
  /^user[-_]?email$/i
];

const PHONE_PATTERNS = [
  /^phone(_?(no|num|number))?$/i,
  /^mobile(_?(no|num|number))?$/i,
  /^contact(_?(no|num|number))?$/i,
  /^cell(_?(no|num|number))?$/i,
  /^telephone$/i,
  /^tel$/i
];

const NAME_PATTERNS = [
  /^name$/i,
  /^full[-_]?name$/i,
  /^customer[-_]?name$/i,
  /^client[-_]?name$/i,
  /^employee[-_]?name$/i,
  /^user[-_]?name$/i,
  /^first[-_]?name$/i,
  /^last[-_]?name$/i,
  /^person[-_]?name$/i
];

const LOCATION_PATTERNS = [
  /^city$/i,
  /^location$/i,
  /^town$/i,
  /^metro$/i,
  /^district$/i,
  /^state$/i,
  /^place$/i
];

/**
 * Detects the semantic field type for a column based on its name and optional overrides.
 *
 * @param {string} columnName
 * @param {object} [overrides={}] - Optional map of { [columnName]: FieldType }
 * @returns {string} One of FieldType enum values
 */
export const detectFieldType = (columnName, overrides = {}) => {
  if (!columnName || typeof columnName !== 'string') {
    return FieldType.GENERAL_STRING;
  }

  const normalizedName = columnName.trim();

  // 1. Check explicit overrides first
  if (overrides[normalizedName]) {
    return overrides[normalizedName];
  }
  const lowerName = normalizedName.toLowerCase();
  if (overrides[lowerName]) {
    return overrides[lowerName];
  }

  // 2. Deterministic regex checks against canonical patterns
  if (EMAIL_PATTERNS.some((p) => p.test(normalizedName))) {
    return FieldType.EMAIL;
  }

  if (PHONE_PATTERNS.some((p) => p.test(normalizedName))) {
    return FieldType.PHONE;
  }

  if (NAME_PATTERNS.some((p) => p.test(normalizedName))) {
    return FieldType.NAME;
  }

  if (LOCATION_PATTERNS.some((p) => p.test(normalizedName))) {
    return FieldType.LOCATION;
  }

  return FieldType.GENERAL_STRING;
};

/**
 * Maps an array of column names or column objects to their detected field types.
 *
 * @param {Array<string|object>} columns
 * @param {object} [overrides={}]
 * @returns {Map<string, string>} Map from column name to FieldType
 */
export const detectColumnTypes = (columns, overrides = {}) => {
  const mapping = new Map();
  for (const col of columns) {
    const colName = typeof col === 'string' ? col : col.name;
    if (colName) {
      mapping.set(colName, detectFieldType(colName, overrides));
    }
  }
  return mapping;
};

export default {
  FieldType,
  detectFieldType,
  detectColumnTypes
};
