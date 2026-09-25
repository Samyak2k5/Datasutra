import fs from 'fs';
import { PDFParse } from 'pdf-parse';
import env from '../config/env.js';
import ApiError from '../utils/apiError.js';
import { processHeaders } from './csv.parser.js';

/**
 * Checks if a buffer contains valid PDF magic bytes '%PDF-'.
 *
 * @param {Buffer} buffer
 * @returns {boolean}
 */
export const isValidPdfMagicBytes = (buffer) => {
  if (!buffer || buffer.length < 5) return false;
  // %PDF- in ASCII is 0x25, 0x50, 0x44, 0x46, 0x2D
  return (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46 &&
    buffer[4] === 0x2d
  );
};

/**
 * OCR Adapter. Detects if OCR tool is configured or available in environment.
 * If not available, returns standardized 'OCR_NOT_AVAILABLE' status.
 *
 * @param {Buffer} fileBuffer
 * @param {number} pageNumber
 * @returns {Promise<{ status: string, text: string, confidence: number | null }>}
 */
export const executeOcrFallback = async (fileBuffer, pageNumber = 1) => {
  // Check if OCR environment is configured
  const ocrEngineConfigured = process.env.OCR_ENGINE_ENABLED === 'true';

  if (!ocrEngineConfigured) {
    return {
      status: 'OCR_NOT_AVAILABLE',
      text: '',
      confidence: null,
      message: 'OCR engine is not available or configured in the current environment.'
    };
  }

  // If future OCR engine (e.g. tesseract.js / google vision) is added, it hooks here
  return {
    status: 'OCR_NOT_AVAILABLE',
    text: '',
    confidence: null,
    message: 'OCR engine is not available or configured in the current environment.'
  };
};

/**
 * Parses lines of text looking for tabular delimiters (pipe '|', tab '\t', comma ',', or 2+ consecutive spaces).
 *
 * @param {string} line
 * @returns {string[]}
 */
export const splitTableLine = (line) => {
  if (!line || typeof line !== 'string') return [];
  const trimmed = line.trim();

  // 1. Pipe-separated tables: | Col1 | Col2 | Col3 |
  if (trimmed.includes('|')) {
    const parts = trimmed.split('|').map((p) => p.trim()).filter((p) => p.length > 0);
    // Ignore markdown table separators like |---|---|
    if (parts.length > 1 && !parts.every((p) => /^[-:]+$/.test(p))) {
      return parts;
    }
  }

  // 2. Tab-separated tables
  if (trimmed.includes('\t')) {
    const parts = trimmed.split('\t').map((p) => p.trim()).filter((p) => p.length > 0);
    if (parts.length > 1) return parts;
  }

  // 3. Multi-space aligned tables (2 or more whitespace spaces separating words)
  const multiSpaceParts = trimmed.split(/\s{2,}/).map((p) => p.trim()).filter((p) => p.length > 0);
  if (multiSpaceParts.length > 1) {
    return multiSpaceParts;
  }

  // 4. Comma-separated lines
  if (trimmed.includes(',')) {
    const parts = trimmed.split(',').map((p) => p.trim()).filter((p) => p.length > 0);
    if (parts.length > 1) return parts;
  }

  return [];
};

/**
 * Detects whether a page consists of key-value pairs (e.g. "Customer Name: Rahul Sharma").
 *
 * @param {string[]} lines
 * @returns {Array<object>}
 */
export const extractKeyValueRecords = (lines, pageNum) => {
  const record = {};
  let count = 0;

  for (const line of lines) {
    const match = line.match(/^([A-Za-z\s_]+):\s*(.*)$/);
    if (match) {
      const key = match[1].trim();
      const val = match[2].trim();
      if (key && val) {
        record[key] = val;
        count++;
      }
    }
  }

  if (count >= 2) {
    return [record];
  }
  return [];
};

/**
 * Universal PDF Extractor.
 * Extracts document metadata, page blocks, tables, and structured records into the Common Structured Data Model.
 *
 * @param {string} filePath - Absolute path to PDF file
 * @param {object} options
 * @param {number} [options.limit=0] - Max preview rows
 * @returns {Promise<object>} Common Structured Data Model
 */
export const parsePDF = async (filePath, options = {}) => {
  const { limit = 0 } = options;

  if (!fs.existsSync(filePath)) {
    throw ApiError.notFound('PDF dataset file does not exist on disk.');
  }

  const stats = await fs.promises.stat(filePath);
  if (stats.size === 0) {
    throw ApiError.badRequest('The PDF file is empty (0 bytes).');
  }

  if (stats.size > env.maxFileSizeBytes) {
    throw ApiError.badRequest(
      `PDF file size (${Math.round(stats.size / 1024 / 1024)}MB) exceeds maximum limit of ${env.maxFileSizeMB}MB.`
    );
  }

  const fileBuffer = await fs.promises.readFile(filePath);

  // Validate magic bytes
  if (!isValidPdfMagicBytes(fileBuffer)) {
    throw ApiError.badRequest('Invalid PDF file: Missing or corrupted PDF header magic bytes (%PDF-).');
  }

  let parser = null;
  const warnings = [];
  const errors = [];

  try {
    parser = new PDFParse({ data: fileBuffer });
    await parser.load();

    const info = await parser.getInfo();
    const totalPages = info.total || 1;

    if (totalPages > env.maxPdfPages) {
      throw ApiError.badRequest(
        `PDF page count (${totalPages}) exceeds maximum allowed limit of ${env.maxPdfPages} pages.`
      );
    }

    const textResult = await parser.getText();
    const rawPages = textResult.pages || [];
    let fullText = textResult.text || '';

    if (Buffer.byteLength(fullText, 'utf-8') > env.maxExtractedTextBytes) {
      warnings.push(`Extracted text exceeded ${env.maxExtractedTextBytes} bytes; bounded for safety.`);
      fullText = fullText.slice(0, env.maxExtractedTextBytes);
    }

    // Check for scanned / image-only document (virtually zero extractable text)
    const totalChars = fullText.replace(/\s+/g, '').length;
    let isScanned = false;
    let ocrResult = null;

    if (totalChars < 10) {
      isScanned = true;
      ocrResult = await executeOcrFallback(fileBuffer, 1);
      warnings.push(
        'Document appears to be scanned or image-only. ' +
        (ocrResult.status === 'OCR_NOT_AVAILABLE'
          ? 'OCR engine is not configured in the current environment (OCR_NOT_AVAILABLE).'
          : 'OCR text extracted.')
      );
    }

    // Parse Document Structure: Pages, Sections, Tables
    const documentStructure = {
      pages: [],
      tables: [],
      sections: []
    };

    const extractedRecords = [];
    let currentTableHeaders = null;
    let currentTableIndex = 0;
    let currentTableRows = [];

    for (let pIdx = 0; pIdx < rawPages.length; pIdx++) {
      const pageNum = rawPages[pIdx].num || pIdx + 1;
      const pageText = rawPages[pIdx].text || '';
      const lines = pageText
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      documentStructure.pages.push({
        pageNumber: pageNum,
        lineCount: lines.length,
        charCount: pageText.length
      });

      let pageInTable = false;

      for (let lIdx = 0; lIdx < lines.length; lIdx++) {
        const line = lines[lIdx];
        const cells = splitTableLine(line);

        if (cells.length >= 2) {
          // Check if this looks like a header row
          const looksLikeHeader = cells.every((c) => /^[A-Za-z0-9_\s#]+$/.test(c) && isNaN(Number(c)));

          if (!currentTableHeaders || (looksLikeHeader && !pageInTable)) {
            // New table detected
            if (currentTableHeaders && currentTableRows.length > 0) {
              documentStructure.tables.push({
                tableIndex: currentTableIndex,
                headers: currentTableHeaders,
                rowCount: currentTableRows.length
              });
            }

            currentTableIndex++;
            currentTableHeaders = cells;
            currentTableRows = [];
            pageInTable = true;
            continue;
          }

          // Data row in active table
          if (currentTableHeaders) {
            // Check if column counts align
            if (cells.length !== currentTableHeaders.length) {
              warnings.push(
                `Ambiguous column count on page ${pageNum}, line ${lIdx + 1}: expected ${currentTableHeaders.length} columns, found ${cells.length}.`
              );
            }

            const rowRecord = {
              _provenance: {
                sourceType: 'pdf',
                sourcePage: pageNum,
                tableIndex: currentTableIndex,
                sourceRow: currentTableRows.length + 1
              }
            };

            currentTableHeaders.forEach((hName, colIdx) => {
              rowRecord[hName] = cells[colIdx] !== undefined ? cells[colIdx] : '';
            });

            currentTableRows.push(rowRecord);
            extractedRecords.push(rowRecord);
            pageInTable = true;
            continue;
          }
        } else {
          // Non-table line: could be paragraph or heading
          documentStructure.sections.push({
            type: line.length < 50 && !line.endsWith('.') ? 'heading' : 'paragraph',
            content: line,
            sourceLocation: { pageNumber: pageNum, lineIndex: lIdx + 1 }
          });
        }
      }

      // If no tables detected on this page, try key-value records
      if (currentTableRows.length === 0) {
        const kvRecords = extractKeyValueRecords(lines, pageNum);
        for (const kv of kvRecords) {
          extractedRecords.push({
            ...kv,
            _provenance: {
              sourceType: 'pdf',
              sourcePage: pageNum,
              section: 'key_value_block',
              sourceRow: extractedRecords.length + 1
            }
          });
        }
      }
    }

    if (currentTableHeaders && currentTableRows.length > 0) {
      documentStructure.tables.push({
        tableIndex: currentTableIndex,
        headers: currentTableHeaders,
        rowCount: currentTableRows.length
      });
    }

    // Determine headers from extracted records
    const allHeadersSet = new Set();
    extractedRecords.forEach((rec) => {
      Object.keys(rec).forEach((k) => {
        if (!k.startsWith('_')) allHeadersSet.add(k);
      });
    });

    let rawHeaders = Array.from(allHeadersSet);

    // Fallback if zero tabular data could be structured from text
    if (rawHeaders.length === 0) {
      if (isScanned) {
        rawHeaders = ['Document_Text'];
      } else {
        rawHeaders = ['Extracted_Content'];
        // Provide the text lines as single-column records
        const lines = fullText
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.length > 0);

        lines.slice(0, 100).forEach((l, idx) => {
          extractedRecords.push({
            Extracted_Content: l,
            _provenance: {
              sourceType: 'pdf',
              sourcePage: 1,
              sourceRow: idx + 1
            }
          });
        });
      }
    }

    const processed = processHeaders(rawHeaders.length > 0 ? rawHeaders : ['Content']);

    // Build common structured rows
    const totalRows = extractedRecords.length;
    const rowsToCollect = limit > 0 ? Math.min(limit, totalRows) : totalRows;

    const rows = [];
    for (let i = 0; i < rowsToCollect; i++) {
      const rec = extractedRecords[i] || {};
      const rowObj = {
        _rowNumber: i + 2,
        _provenance: rec._provenance || {
          sourceType: 'pdf',
          sourcePage: 1,
          sourceRow: i + 1
        }
      };

      processed.headers.forEach((hName) => {
        const val = rec[hName];
        rowObj[hName] = val !== undefined && val !== null ? val : '';
      });

      rows.push(rowObj);
    }

    return {
      format: 'pdf',
      headers: processed.headers,
      columns: processed.columns,
      rows,
      totalRows,
      totalColumns: processed.headers.length,
      metadata: {
        sourceType: 'pdf',
        pageCount: totalPages,
        tableCount: documentStructure.tables.length,
        pdfFormatVersion: info.info?.PDFFormatVersion || '1.4',
        title: info.info?.Title || null,
        author: info.info?.Author || null,
        producer: info.info?.Producer || null,
        isScanned,
        ocrStatus: ocrResult ? ocrResult.status : 'NOT_REQUIRED',
        parserVersion: '1.0.0'
      },
      documentStructure,
      provenance: {
        sourceType: 'pdf',
        pageCount: totalPages,
        tablesFound: documentStructure.tables.length,
        totalRecords: totalRows
      },
      warnings,
      errors
    };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw ApiError.badRequest(`PDF extraction failed: ${err.message}`);
  } finally {
    if (parser) {
      try {
        await parser.destroy();
      } catch {
        // Ignore destroy error
      }
    }
  }
};

export default {
  parsePDF,
  isValidPdfMagicBytes,
  splitTableLine,
  executeOcrFallback
};
