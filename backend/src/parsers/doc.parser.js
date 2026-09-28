import fs from 'fs';
import { execSync } from 'child_process';
import WordExtractor from 'word-extractor';
import env from '../config/env.js';
import ApiError from '../utils/apiError.js';

/**
 * Checks if a buffer starts with the legacy Word .doc Compound File Binary (CFB) header:
 * D0 CF 11 E0 A1 B1 1A E1
 *
 * @param {Buffer} buffer
 * @returns {boolean}
 */
export const isLegacyDocMagicBytes = (buffer) => {
  if (!buffer || buffer.length < 8) return false;
  return (
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0 &&
    buffer[4] === 0xa1 &&
    buffer[5] === 0xb1 &&
    buffer[6] === 0x1a &&
    buffer[7] === 0xe1
  );
};

/**
 * Checks if an external conversion engine for legacy .doc is installed in the system.
 * Checks for 'soffice' (LibreOffice), 'antiword', or 'catdoc'.
 *
 * @returns {'soffice' | 'antiword' | 'catdoc' | null}
 */
export const detectDocConverter = () => {
  const tools = ['soffice', 'antiword', 'catdoc'];
  for (const tool of tools) {
    try {
      execSync(`${tool} --version`, { stdio: 'ignore', timeout: 1000 });
      return tool;
    } catch {
      // not available
    }
  }
  return null;
};

/**
 * Legacy .doc Parser / Adapter.
 * Extracts legacy Word body text entirely in Node.js.
 * Encrypted or corrupted inputs return an explicit extraction error.
 *
 * @param {string} filePath
 * @param {object} options
 * @returns {Promise<object>}
 */
export const parseDOC = async (filePath, options = {}) => {
  if (!fs.existsSync(filePath)) {
    throw ApiError.notFound('Dataset file does not exist on disk.');
  }

  const stats = await fs.promises.stat(filePath);
  if (stats.size === 0) {
    throw ApiError.badRequest('The Word document is empty (0 bytes).');
  }

  const buffer = await fs.promises.readFile(filePath);
  if (!isLegacyDocMagicBytes(buffer)) {
    // If not CFB magic bytes, it could be a corrupted doc or incorrectly named
    throw ApiError.badRequest('Invalid or corrupted legacy Word (.doc) file header.');
  }

  let text;
  try { text = (await new WordExtractor().extract(buffer)).getBody(); }
  catch { throw ApiError.badRequest('Unable to extract this legacy DOC file. It may be encrypted or corrupted. Save it as DOCX and upload again.'); }
  if (!text?.trim()) throw ApiError.badRequest('No readable text found. Image AI analysis is not enabled in this MVP');
  if (Buffer.byteLength(text, 'utf8') > env.maxExtractedTextBytes) throw new ApiError(413, 'Extracted DOC text exceeds the configured size limit.');
  const paragraphs = text.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
  const selected = options.limit > 0 ? paragraphs.slice(0, options.limit) : paragraphs;
  return { format: 'doc', headers: ['Document_Paragraph'], columns: [{ name: 'Document_Paragraph', originalName: 'Document_Paragraph', inferredType: 'string' }],
    rows: selected.map((content, index) => ({ _rowNumber: index + 1, Document_Paragraph: content })),
    totalRows: paragraphs.length, totalColumns: 1,
    documentStructure: { sections: selected.map(content => ({ type: 'paragraph', content })) },
    metadata: { sourceType: 'doc', sectionsCount: paragraphs.length, extractor: 'word-extractor' },
    warnings: ['Legacy DOC extraction preserves body text; formatting and table structure are not preserved.'] };

};

export default {
  parseDOC,
  isLegacyDocMagicBytes,
  detectDocConverter
};
