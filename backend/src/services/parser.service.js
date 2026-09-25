import path from 'path';
import ApiError from '../utils/apiError.js';
import { parseCSV, processHeaders } from '../parsers/csv.parser.js';
import { parseXLSX } from '../parsers/xlsx.parser.js';
import { parseJSON } from '../parsers/json.parser.js';
import { parsePDF } from '../parsers/pdf.parser.js';
import { parseDOCX } from '../parsers/docx.parser.js';
import { parseDOC } from '../parsers/doc.parser.js';
import { parserRegistry } from '../parsers/parser.registry.js';

/**
 * Universal Dataset Parser Service.
 * Detects format and routes through the ParserRegistry.
 * Returns consistent common structured data representation.
 *
 * @param {string} filePath - Absolute path to dataset file
 * @param {string} [fileType] - Declared file type ('csv', 'xlsx', 'json', 'pdf', 'docx', 'doc')
 * @param {object} [options={}]
 * @returns {Promise<object>} Common structured data representation
 */
export const parseDataset = async (filePath, fileType, options = {}) => {
  return parserRegistry.parseToStructuredRecords(filePath, {
    ...options,
    fileType
  });
};

/**
 * Extract a bounded data preview for any supported dataset format.
 * Returns up to `limit` rows (default: 20, max: 100).
 *
 * @param {string} filePath - Absolute path to dataset file
 * @param {string} fileType - Declared file type
 * @param {number} [limit=20] - Number of preview rows requested
 * @returns {Promise<{ headers: string[], rows: object[], totalRows: number, totalColumns: number, previewRows: number, metadata?: object, documentStructure?: object, warnings?: string[] }>}
 */
export const getPreview = async (filePath, fileType, limit = 20) => {
  // Validate and clamp limit between 1 and 100
  let boundedLimit = parseInt(limit, 10);
  if (isNaN(boundedLimit) || boundedLimit <= 0) {
    boundedLimit = 20;
  } else if (boundedLimit > 100) {
    boundedLimit = 100;
  }

  const result = await parseDataset(filePath, fileType, {
    limit: boundedLimit,
    stopAtLimit: true
  });

  return {
    headers: result.headers,
    rows: result.rows,
    totalRows: result.totalRows,
    totalColumns: result.totalColumns,
    previewRows: result.rows.length,
    metadata: result.metadata || {},
    documentStructure: result.documentStructure || null,
    provenance: result.provenance || {},
    warnings: result.warnings || []
  };
};

export default {
  parseCSV,
  parseXLSX,
  parseJSON,
  parsePDF,
  parseDOCX,
  parseDOC,
  parseDataset,
  getPreview,
  processHeaders,
  parserRegistry
};
