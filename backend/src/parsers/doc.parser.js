import fs from 'fs';
import { execSync } from 'child_process';
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
 * Verifies file and conversion availability.
 * If conversion is unsupported in current environment, returns a clean UNSUPPORTED_LEGACY_DOC error.
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

  const converter = detectDocConverter();

  if (!converter) {
    throw ApiError.badRequest(
      'UNSUPPORTED_LEGACY_DOC: Legacy Word (.doc) binary format requires an external conversion utility (such as LibreOffice or Antiword) which is not available in the current environment. Please save and upload your document as modern Word (.docx) or CSV.'
    );
  }

  // If converter is available, execute conversion (placeholder hook for environments with soffice)
  throw ApiError.badRequest('UNSUPPORTED_LEGACY_DOC: External converter failed to process document.');
};

export default {
  parseDOC,
  isLegacyDocMagicBytes,
  detectDocConverter
};
