import fs from 'node:fs/promises';
import ApiError from '../utils/apiError.js';
import env from '../config/env.js';

// Text remains text: commas and document instructions are never interpreted as code.
export async function parseTXT(filePath, { limit = 0 } = {}) {
  const stat = await fs.stat(filePath);
  if (stat.size > env.maxExtractedTextBytes) throw new ApiError(413, 'Text file exceeds the extraction size limit.');
  const buffer = await fs.readFile(filePath);
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
  catch { throw ApiError.badRequest('TXT files must contain valid UTF-8 text.'); }
  if (text.includes('\0')) throw ApiError.badRequest('TXT file contains binary data.');
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length) throw ApiError.badRequest('The text file contains no readable text.');
  const selected = limit > 0 ? lines.slice(0, limit) : lines;
  return {
    format: 'txt', headers: ['Text'], columns: [{ name: 'Text', originalName: 'Text', inferredType: 'string' }],
    rows: selected.map((line, index) => ({ _rowNumber: index + 1, Text: line })),
    totalRows: lines.length, totalColumns: 1,
    documentStructure: { sections: selected.map(content => ({ type: 'paragraph', content })) },
    metadata: { encoding: 'utf-8' }, warnings: []
  };
}
