import fs from 'fs';
import AdmZip from 'adm-zip';
import ApiError from '../utils/apiError.js';
import { processHeaders } from './csv.parser.js';

/**
 * Checks if a buffer has ZIP magic bytes: PK\x03\x04 (0x50 0x4B 0x03 0x04)
 *
 * @param {Buffer} buffer
 * @returns {boolean}
 */
export const isValidZipMagicBytes = (buffer) => {
  if (!buffer || buffer.length < 4) return false;
  return (
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  );
};

/**
 * Unescapes standard XML entities.
 *
 * @param {string} str
 * @returns {string}
 */
export const unescapeXml = (str) => {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
};

/**
 * Extracts all text contained in <w:t> tags within an XML snippet.
 *
 * @param {string} xmlSnippet
 * @returns {string}
 */
export const extractTextFromXml = (xmlSnippet) => {
  if (!xmlSnippet) return '';
  const textMatches = xmlSnippet.matchAll(/<w:t[^>]*>(.*?)<\/w:t>/gs);
  const textParts = [];
  for (const match of textMatches) {
    textParts.push(match[1]);
  }
  return unescapeXml(textParts.join(''));
};

/**
 * Parses XML core metadata from docProps/core.xml.
 *
 * @param {string} coreXml
 * @returns {object}
 */
export const parseCoreMetadata = (coreXml) => {
  const metadata = {
    title: null,
    creator: null,
    lastModifiedBy: null,
    created: null
  };

  if (!coreXml) return metadata;

  const titleMatch = coreXml.match(/<dc:title[^>]*>(.*?)<\/dc:title>/s);
  if (titleMatch) metadata.title = unescapeXml(titleMatch[1].trim());

  const creatorMatch = coreXml.match(/<dc:creator[^>]*>(.*?)<\/dc:creator>/s);
  if (creatorMatch) metadata.creator = unescapeXml(creatorMatch[1].trim());

  const modMatch = coreXml.match(/<cp:lastModifiedBy[^>]*>(.*?)<\/cp:lastModifiedBy>/s);
  if (modMatch) metadata.lastModifiedBy = unescapeXml(modMatch[1].trim());

  const createdMatch = coreXml.match(/<dcterms:created[^>]*>(.*?)<\/dcterms:created>/s);
  if (createdMatch) metadata.created = createdMatch[1].trim();

  return metadata;
};

/**
 * Parses tables from word/document.xml.
 *
 * @param {string} docXml
 * @returns {Array<{ tableIndex: number, headers: string[], rows: Array<string[]> }>}
 */
export const extractWordTables = (docXml) => {
  const tables = [];
  const tableMatches = docXml.matchAll(/<w:tbl>(.*?)<\/w:tbl>/gs);
  let tblIndex = 0;

  for (const tMatch of tableMatches) {
    tblIndex++;
    const tableXml = tMatch[1];
    const rowMatches = tableXml.matchAll(/<w:tr[^>]*>(.*?)<\/w:tr>/gs);
    const rawTableRows = [];

    for (const rMatch of rowMatches) {
      const rowXml = rMatch[1];
      const cellMatches = rowXml.matchAll(/<w:tc[^>]*>(.*?)<\/w:tc>/gs);
      const rowCells = [];

      for (const cMatch of cellMatches) {
        const cellXml = cMatch[1];
        const cellText = extractTextFromXml(cellXml).trim();
        rowCells.push(cellText);
      }

      if (rowCells.length > 0) {
        rawTableRows.push(rowCells);
      }
    }

    if (rawTableRows.length > 0) {
      const headers = rawTableRows[0];
      const dataRows = rawTableRows.slice(1);
      tables.push({
        tableIndex: tblIndex,
        headers,
        rows: dataRows
      });
    }
  }

  return tables;
};

/**
 * Extracts sequential paragraphs and headings outside of tables.
 *
 * @param {string} docXml
 * @returns {Array<object>}
 */
export const extractDocumentSections = (docXml) => {
  const sections = [];
  // Strip out tables first to isolate paragraphs
  const strippedXml = docXml.replace(/<w:tbl>.*?<\/w:tbl>/gs, '');
  const pMatches = strippedXml.matchAll(/<w:p[^>]*>(.*?)<\/w:p>/gs);
  let order = 0;

  for (const pMatch of pMatches) {
    const pXml = pMatch[1];
    const text = extractTextFromXml(pXml).trim();
    if (!text) continue;

    order++;
    const isHeading =
      /<w:pStyle\s+[^>]*w:val="Heading/i.test(pXml) ||
      /<w:pStyle\s+[^>]*w:val="Title/i.test(pXml);

    const isList = /<w:numPr>/i.test(pXml);

    sections.push({
      order,
      type: isHeading ? 'heading' : isList ? 'list' : 'paragraph',
      content: text,
      sourceLocation: { sectionIndex: order }
    });
  }

  return sections;
};

/**
 * Universal DOCX Extractor.
 * Extracts document metadata, document structure (headings, paragraphs, lists), and tables into the Common Structured Data Model.
 *
 * @param {string} filePath - Absolute path to DOCX file
 * @param {object} options
 * @param {number} [options.limit=0] - Max preview rows
 * @returns {Promise<object>} Common Structured Data Model
 */
export const parseDOCX = async (filePath, options = {}) => {
  const { limit = 0 } = options;

  if (!fs.existsSync(filePath)) {
    throw ApiError.notFound('DOCX dataset file does not exist on disk.');
  }

  const stats = await fs.promises.stat(filePath);
  if (stats.size === 0) {
    throw ApiError.badRequest('The Word document is empty (0 bytes).');
  }

  const fileBuffer = await fs.promises.readFile(filePath);

  // Validate ZIP magic bytes
  if (!isValidZipMagicBytes(fileBuffer)) {
    throw ApiError.badRequest('Invalid DOCX file: Missing valid Office Open XML ZIP header.');
  }

  let zip;
  try {
    zip = new AdmZip(fileBuffer);
  } catch (err) {
    throw ApiError.badRequest(`Malformed or corrupted DOCX archive: ${err.message}`);
  }

  const docEntry = zip.getEntry('word/document.xml');
  if (!docEntry) {
    throw ApiError.badRequest('Invalid DOCX format: Document archive is missing "word/document.xml".');
  }

  let docXml;
  try {
    docXml = zip.readAsText(docEntry);
  } catch (err) {
    throw ApiError.badRequest(`Failed to read document XML: ${err.message}`);
  }

  // Extract core metadata if present
  let coreMetadata = {};
  const coreEntry = zip.getEntry('docProps/core.xml');
  if (coreEntry) {
    try {
      const coreXml = zip.readAsText(coreEntry);
      coreMetadata = parseCoreMetadata(coreXml);
    } catch {
      // Non-critical, continue
    }
  }

  // Extract tables and non-table sections
  const tables = extractWordTables(docXml);
  const sections = extractDocumentSections(docXml);

  const documentStructure = {
    tablesCount: tables.length,
    sectionsCount: sections.length,
    sections,
    tables: tables.map((t) => ({
      tableIndex: t.tableIndex,
      headers: t.headers,
      rowCount: t.rows.length
    }))
  };

  const extractedRecords = [];
  let rawHeaders = [];
  const warnings = [];

  if (tables.length > 0) {
    // Primary extraction from document tables
    const primaryTable = tables[0];
    rawHeaders = primaryTable.headers;

    for (let rIdx = 0; rIdx < primaryTable.rows.length; rIdx++) {
      const cells = primaryTable.rows[rIdx];
      const record = {
        _provenance: {
          sourceType: 'docx',
          section: 'table',
          tableIndex: primaryTable.tableIndex,
          sourceRow: rIdx + 1
        }
      };

      rawHeaders.forEach((hName, cIdx) => {
        record[hName] = cells[cIdx] !== undefined ? cells[cIdx] : '';
      });

      extractedRecords.push(record);
    }

    if (tables.length > 1) {
      warnings.push(
        `Multiple tables detected (${tables.length} tables). Extracted primary table ${primaryTable.tableIndex} containing ${primaryTable.rows.length} rows.`
      );
    }
  } else {
    // If no tables, inspect key-value lines or paragraph records
    const kvRecord = {};
    let kvFound = 0;

    for (const sec of sections) {
      const match = sec.content.match(/^([A-Za-z\s_]+):\s*(.*)$/);
      if (match) {
        const key = match[1].trim();
        const val = match[2].trim();
        if (key && val) {
          kvRecord[key] = val;
          kvFound++;
        }
      }
    }

    if (kvFound >= 2) {
      extractedRecords.push({
        ...kvRecord,
        _provenance: {
          sourceType: 'docx',
          section: 'key_value_block',
          sourceRow: 1
        }
      });
      rawHeaders = Object.keys(kvRecord);
    } else {
      // Single-column paragraph records
      rawHeaders = ['Document_Paragraph'];
      sections.forEach((sec, idx) => {
        extractedRecords.push({
          Document_Paragraph: sec.content,
          _provenance: {
            sourceType: 'docx',
            section: sec.type,
            sourceRow: idx + 1
          }
        });
      });
    }
  }

  const processed = processHeaders(rawHeaders.length > 0 ? rawHeaders : ['Content']);

  const totalRows = extractedRecords.length;
  const rowsToCollect = limit > 0 ? Math.min(limit, totalRows) : totalRows;

  const rows = [];
  for (let i = 0; i < rowsToCollect; i++) {
    const rec = extractedRecords[i] || {};
    const rowObj = {
      _rowNumber: i + 2,
      _provenance: rec._provenance || {
        sourceType: 'docx',
        section: 'document',
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
    format: 'docx',
    headers: processed.headers,
    columns: processed.columns,
    rows,
    totalRows,
    totalColumns: processed.headers.length,
    metadata: {
      sourceType: 'docx',
      title: coreMetadata.title || null,
      author: coreMetadata.creator || null,
      created: coreMetadata.created || null,
      tablesFound: tables.length,
      sectionsCount: sections.length,
      parserVersion: '1.0.0'
    },
    documentStructure,
    provenance: {
      sourceType: 'docx',
      tablesFound: tables.length,
      totalRecords: totalRows
    },
    warnings,
    errors: []
  };
};

export default {
  parseDOCX,
  isValidZipMagicBytes,
  unescapeXml,
  extractTextFromXml,
  extractWordTables,
  extractDocumentSections
};
