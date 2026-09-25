import fs from 'fs';
import path from 'path';
import ApiError from '../utils/apiError.js';
import { parseCSV, processHeaders } from './csv.parser.js';
import { parseXLSX } from './xlsx.parser.js';
import { parseJSON, parseNDJSON } from './json.parser.js';
import { parsePDF, isValidPdfMagicBytes } from './pdf.parser.js';
import { parseDOCX, isValidZipMagicBytes } from './docx.parser.js';
import { parseDOC, isLegacyDocMagicBytes } from './doc.parser.js';

/**
 * Universal Parser Registry.
 * Holds registered format parsers and provides format detection via signatures & extensions.
 */
class ParserRegistry {
  constructor() {
    this.parsers = new Map();

    // Register built-in parsers
    this.register('csv', parseCSV);
    this.register('xlsx', parseXLSX);
    this.register('xls', parseXLSX);
    this.register('json', parseJSON);
    this.register('jsonl', parseNDJSON);
    this.register('ndjson', parseNDJSON);
    this.register('pdf', parsePDF);
    this.register('docx', parseDOCX);
    this.register('doc', parseDOC);
  }

  /**
   * Registers a format parser function.
   *
   * @param {string} format
   * @param {Function} parserFn
   */
  register(format, parserFn) {
    this.parsers.set(format.toLowerCase(), parserFn);
  }

  /**
   * Retrieves a parser function by format name.
   *
   * @param {string} format
   * @returns {Function | null}
   */
  get(format) {
    if (!format) return null;
    return this.parsers.get(format.toLowerCase()) || null;
  }

  /**
   * Detects the file format using file signature / magic bytes, MIME, and extension.
   * Defends against extension spoofing.
   *
   * @param {string} filePath
   * @param {Buffer} [sampleBuffer] - First 512 bytes
   * @param {string} [declaredType]
   * @returns {string} Detected format key
   */
  detectFormat(filePath, sampleBuffer = null, declaredType = null) {
    const ext = path.extname(filePath).toLowerCase().replace('.', '');

    let headerBuf = sampleBuffer;
    if (!headerBuf) {
      const fd = fs.openSync(filePath, 'r');
      headerBuf = Buffer.alloc(512);
      const bytesRead = fs.readSync(fd, headerBuf, 0, 512, 0);
      fs.closeSync(fd);
      headerBuf = headerBuf.subarray(0, bytesRead);
    }

    // 1. PDF signature (%PDF-)
    if (isValidPdfMagicBytes(headerBuf)) {
      if (declaredType && declaredType !== 'pdf' && ext !== 'pdf') {
        throw ApiError.badRequest(
          `Format signature mismatch: File has PDF binary signature but is declared as '${declaredType || ext}'.`
        );
      }
      return 'pdf';
    }

    // 2. Legacy Word CFB signature (D0 CF 11 E0)
    if (isLegacyDocMagicBytes(headerBuf)) {
      if (declaredType && declaredType !== 'doc' && ext !== 'doc') {
        throw ApiError.badRequest(
          `Format signature mismatch: File has legacy DOC signature but is declared as '${declaredType || ext}'.`
        );
      }
      return 'doc';
    }

    // 3. ZIP signature (PK\x03\x04) -> XLSX or DOCX
    if (isValidZipMagicBytes(headerBuf)) {
      if (ext === 'docx' || declaredType === 'docx') {
        return 'docx';
      }
      if (ext === 'xlsx' || ext === 'xls' || declaredType === 'xlsx') {
        return 'xlsx';
      }
      // If extension doesn't disambiguate, default to docx if word is declared, else xlsx
      return ext === 'docx' ? 'docx' : 'xlsx';
    }

    // 4. JSON / NDJSON signature (starts with { or [ after trimming whitespace)
    const textStart = headerBuf.toString('utf-8').trim();
    if (ext === 'ndjson' || ext === 'jsonl') {
      return 'ndjson';
    }
    if (textStart.startsWith('{') || textStart.startsWith('[')) {
      return 'json';
    }

    // 5. Default text / CSV check
    if (ext === 'csv' || ext === 'txt' || declaredType === 'csv') {
      return 'csv';
    }

    // Fall back to extension if registered
    if (this.parsers.has(ext)) {
      return ext;
    }

    throw ApiError.badRequest(
      `Unsupported or unrecognized file format for '${path.basename(filePath)}'. Supported formats: CSV, XLSX, JSON, PDF, DOCX, DOC.`
    );
  }

  /**
   * Unified parsing method.
   * Parses any supported format into the Common Structured Data Model.
   *
   * @param {string} filePath
   * @param {object} [options={}]
   * @returns {Promise<object>} Common Structured Data Model
   */
  async parseToStructuredRecords(filePath, options = {}) {
    if (!fs.existsSync(filePath)) {
      throw ApiError.notFound('Dataset file does not exist on disk.');
    }

    const stats = await fs.promises.stat(filePath);
    if (stats.size === 0) {
      throw ApiError.badRequest('The dataset file is empty (0 bytes).');
    }

    const declaredType = options.fileType || null;
    const format = this.detectFormat(filePath, null, declaredType);
    const parserFn = this.get(format);

    if (!parserFn) {
      throw ApiError.badRequest(`No parser registered for detected format '${format}'.`);
    }

    const result = await parserFn(filePath, options);

    // Ensure all standard Common Data Model fields exist
    return {
      format: result.format || format,
      headers: result.headers || [],
      columns: result.columns || [],
      rows: result.rows || [],
      totalRows: result.totalRows !== undefined ? result.totalRows : result.rows.length,
      totalColumns: result.totalColumns !== undefined ? result.totalColumns : (result.headers ? result.headers.length : 0),
      worksheetName: result.worksheetName || null,
      metadata: {
        sourceType: format,
        sourceFileName: path.basename(filePath),
        parserVersion: '1.0.0',
        ...(result.metadata || {})
      },
      documentStructure: result.documentStructure || null,
      provenance: {
        sourceType: format,
        sourceFileName: path.basename(filePath),
        totalRecords: result.totalRows !== undefined ? result.totalRows : result.rows.length,
        ...(result.provenance || {})
      },
      warnings: result.warnings || [],
      errors: result.errors || []
    };
  }
}

export const parserRegistry = new ParserRegistry();
export default parserRegistry;
