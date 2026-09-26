import fs from 'fs';
import readline from 'readline';
import ApiError from '../utils/apiError.js';
import { processHeaders } from './csv.parser.js';

/**
 * Safely extracts a nested property by dot path (e.g., 'data.customers').
 *
 * @param {object} obj
 * @param {string} pathStr
 * @returns {any}
 */
export const getByPath = (obj, pathStr) => {
  if (!obj || !pathStr) return undefined;
  const parts = pathStr.split('.');
  let curr = obj;
  for (const part of parts) {
    if (curr === null || curr === undefined || typeof curr !== 'object') {
      return undefined;
    }
    curr = curr[part];
  }
  return curr;
};

/**
 * Safely flattens nested objects into dot-notated keys (e.g., { contact: { email: 'x' } } -> { 'contact.email': 'x' }).
 * Preserves arrays as-is (does not mangle arrays into destructive strings).
 *
 * @param {object} obj
 * @param {string} [prefix='']
 * @param {number} [maxDepth=5]
 * @returns {object}
 */
export const flattenObject = (obj, prefix = '', maxDepth = 5) => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return obj;
  }

  const flattened = {};

  for (const [key, val] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;

    if (
      val !== null &&
      typeof val === 'object' &&
      !Array.isArray(val) &&
      maxDepth > 1
    ) {
      const nested = flattenObject(val, newKey, maxDepth - 1);
      Object.assign(flattened, nested);
    } else {
      flattened[newKey] = val !== undefined && val !== null ? val : '';
    }
  }

  return flattened;
};

/**
 * Automatically detects the array of records inside a root JSON object if recordPath is not explicitly specified.
 * Inspects common candidate keys: 'records', 'data', 'items', 'results', 'rows'.
 *
 * @param {object} rootObj
 * @returns {{ records: Array<any>, detectedPath: string } | null}
 */
export const detectRecordsArray = (rootObj) => {
  if (Array.isArray(rootObj)) {
    return { records: rootObj, detectedPath: '$' };
  }

  if (!rootObj || typeof rootObj !== 'object') {
    return null;
  }

  const candidateKeys = ['records', 'data', 'items', 'results', 'rows', 'payload'];
  for (const key of candidateKeys) {
    if (Array.isArray(rootObj[key])) {
      return { records: rootObj[key], detectedPath: key };
    }
  }

  // Check 1-level nested (e.g. data.customers)
  for (const [key, val] of Object.entries(rootObj)) {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      for (const nestedKey of candidateKeys) {
        if (Array.isArray(val[nestedKey])) {
          return { records: val[nestedKey], detectedPath: `${key}.${nestedKey}` };
        }
      }
      for (const [subKey, subVal] of Object.entries(val)) {
        if (Array.isArray(subVal)) {
          return { records: subVal, detectedPath: `${key}.${subKey}` };
        }
      }
    }
  }

  return null;
};

/**
 * Parses NDJSON / JSON Lines (.jsonl / .ndjson) with streaming line-by-line support.
 *
 * @param {string} filePath
 * @param {object} options
 * @returns {Promise<object>}
 */
export const parseNDJSON = async (filePath, options = {}) => {
  const { limit = 0, stopAtLimit = false, flatten = true } = options;

  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const rawRecords = [];
  let totalRows = 0;
  let lineNum = 0;

  for await (const line of rl) {
    lineNum++;
    const trimmed = line.trim();
    if (!trimmed) continue;

    let parsedItem;
    try {
      parsedItem = JSON.parse(trimmed);
    } catch (err) {
      rl.close();
      fileStream.destroy();
      throw ApiError.badRequest(`Malformed JSON on line ${lineNum}: ${err.message}`);
    }

    if (typeof parsedItem !== 'object' || parsedItem === null) {
      rl.close();
      fileStream.destroy();
      throw ApiError.badRequest(`Invalid record on line ${lineNum}: JSON record must be an object.`);
    }

    totalRows++;
    const shouldKeep = limit <= 0 || rawRecords.length < limit;
    if (shouldKeep) {
      rawRecords.push({
        item: flatten ? flattenObject(parsedItem) : parsedItem,
        rowNumber: totalRows
      });
    }

    if (stopAtLimit && limit > 0 && rawRecords.length >= limit) {
      rl.close();
      fileStream.destroy();
      break;
    }
  }

  if (totalRows === 0) {
    throw ApiError.badRequest('JSON Lines file is empty or contains no records.');
  }

  // Derive columns from collected records
  const allKeysSet = new Set();
  rawRecords.forEach(({ item }) => {
    Object.keys(item).forEach((k) => allKeysSet.add(k));
  });

  const rawHeaders = Array.from(allKeysSet);
  const processed = processHeaders(rawHeaders);

  const rows = rawRecords.map(({ item, rowNumber }) => {
    const rowObj = {
      _rowNumber: rowNumber + 1,
      _provenance: {
        sourceType: 'json',
        line: rowNumber,
        recordIndex: rowNumber - 1
      }
    };

    processed.headers.forEach((hName) => {
      const val = item[hName];
      rowObj[hName] = val !== undefined && val !== null ? (typeof val === 'object' ? JSON.stringify(val) : val) : '';
    });

    return rowObj;
  });

  return {
    format: 'json',
    headers: processed.headers,
    columns: processed.columns,
    rows,
    totalRows,
    totalColumns: processed.headers.length,
    metadata: {
      sourceType: 'ndjson',
      rootType: 'lines',
      detectedRecordPath: 'line',
      recordCount: totalRows,
      fieldCount: processed.headers.length,
      parserVersion: '1.0.0'
    },
    provenance: {
      sourceType: 'json',
      totalRecords: totalRows
    },
    warnings: [],
    errors: []
  };
};

/**
 * Universal JSON file parser.
 * Supports standard JSON files (.json) and JSON Lines (.jsonl, .ndjson).
 *
 * @param {string} filePath - Path to JSON file
 * @param {object} options
 * @param {string} [options.recordPath] - Optional explicit path to array of records (e.g. 'data.customers')
 * @param {boolean} [options.flatten=true] - Whether to flatten nested objects into dot keys
 * @param {number} [options.limit=0] - Max rows for preview
 * @param {boolean} [options.stopAtLimit=false] - Stop after preview limit
 * @returns {Promise<object>} Common structured data model
 */
export const parseJSON = async (filePath, options = {}) => {
  const { recordPath = null, flatten = true, limit = 0 } = options;

  if (!fs.existsSync(filePath)) {
    throw ApiError.notFound('Dataset file does not exist on disk.');
  }

  const stats = await fs.promises.stat(filePath);
  if (stats.size === 0) {
    throw ApiError.badRequest('The dataset file is empty (0 bytes).');
  }

  // Check if file is NDJSON by extension or inspection
  const lowerPath = filePath.toLowerCase();
  if (lowerPath.endsWith('.ndjson') || lowerPath.endsWith('.jsonl')) {
    return parseNDJSON(filePath, options);
  }

  // Read file contents safely
  let rawContent;
  try {
    rawContent = await fs.promises.readFile(filePath, 'utf-8');
  } catch (err) {
    throw ApiError.badRequest(`Could not read JSON file: ${err.message}`);
  }

  const trimmed = rawContent.trim();
  if (!trimmed) {
    throw ApiError.badRequest('The JSON dataset file is empty (0 bytes).');
  }

  // Parse root JSON
  let root;
  try {
    root = JSON.parse(trimmed);
  } catch (err) {
    // If standard JSON.parse fails, test if it might be NDJSON format
    if (trimmed.includes('\n') && trimmed.startsWith('{')) {
      try {
        return await parseNDJSON(filePath, options);
      } catch {
        // Fall back to original parse error
      }
    }
    throw ApiError.badRequest(`Malformed JSON file: ${err.message}`);
  }

  if (root === null || (typeof root !== 'object' && !Array.isArray(root))) {
    throw ApiError.badRequest('JSON dataset must be an object or an array of objects.');
  }

  let recordsArray = null;
  let detectedPath = '$';

  if (recordPath) {
    const extracted = getByPath(root, recordPath);
    if (!extracted) {
      throw ApiError.badRequest(`Configured recordPath '${recordPath}' not found in JSON document.`);
    }
    if (!Array.isArray(extracted)) {
      throw ApiError.badRequest(
        `Configured recordPath '${recordPath}' points to a ${typeof extracted}, expected an array of records.`
      );
    }
    recordsArray = extracted;
    detectedPath = recordPath;
  } else if (Array.isArray(root)) {
    recordsArray = root;
    detectedPath = '$';
  } else {
    const detected = detectRecordsArray(root);
    if (detected) {
      recordsArray = detected.records;
      detectedPath = detected.detectedPath;
    } else {
      // If root is a single object (not an array), treat single object as 1 record
      recordsArray = [root];
      detectedPath = '$root';
    }
  }

  if (!recordsArray || recordsArray.length === 0) {
    throw ApiError.badRequest('JSON document contains zero records.');
  }

  const totalRows = recordsArray.length;
  const rowsToCollect = limit > 0 ? Math.min(limit, totalRows) : totalRows;

  // Flatten and prepare rows
  const collectedItems = [];
  const allKeysSet = new Set();
  let nestedObjectCount = 0;

  for (let i = 0; i < totalRows; i++) {
    const rawItem = recordsArray[i];
    if (rawItem === null || typeof rawItem !== 'object') {
      throw ApiError.badRequest(`Record at index ${i} is not a valid JSON object.`);
    }

    // Check for nested objects
    for (const val of Object.values(rawItem)) {
      if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
        nestedObjectCount++;
      }
    }

    const item = flatten ? flattenObject(rawItem) : rawItem;

    if (i < rowsToCollect) {
      collectedItems.push({ item, index: i });
    }

    Object.keys(item).forEach((k) => allKeysSet.add(k));
  }

  const rawHeaders = Array.from(allKeysSet);
  if (rawHeaders.length === 0) {
    throw ApiError.badRequest('JSON records contain no valid properties/keys.');
  }

  const processed = processHeaders(rawHeaders);

  const rows = collectedItems.map(({ item, index }) => {
    const rowObj = {
      _rowNumber: index + 2,
      _provenance: {
        sourceType: 'json',
        recordPath: detectedPath === '$' ? `[${index}]` : `${detectedPath}[${index}]`,
        sourceRow: index + 1
      }
    };

    processed.headers.forEach((hName) => {
      const val = item[hName];
      rowObj[hName] = val !== undefined && val !== null ? (typeof val === 'object' ? JSON.stringify(val) : val) : '';
    });

    return rowObj;
  });

  return {
    format: 'json',
    headers: processed.headers,
    columns: processed.columns,
    rows,
    totalRows,
    totalColumns: processed.headers.length,
    metadata: {
      sourceType: 'json',
      rootType: Array.isArray(root) ? 'array' : 'object',
      detectedRecordPath: detectedPath,
      recordCount: totalRows,
      fieldCount: processed.headers.length,
      nestedObjectCount,
      parserVersion: '1.0.0'
    },
    provenance: {
      sourceType: 'json',
      recordPath: detectedPath,
      totalRecords: totalRows
    },
    warnings: [],
    errors: []
  };
};

export default {
  parseJSON,
  parseNDJSON,
  flattenObject,
  detectRecordsArray,
  getByPath
};
