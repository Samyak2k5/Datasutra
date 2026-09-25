import fs from 'fs';
import { parse } from 'csv-parse';
import ApiError from '../utils/apiError.js';

/**
 * Process and validate raw headers.
 * Resolves empty headers to Column_N and handles duplicate header names deterministically (e.g. Email -> Email_2).
 * Preserves original header text in column metadata.
 *
 * @param {Array<string>} rawHeaders
 * @returns {{ headers: string[], columns: object[] }}
 */
export const processHeaders = (rawHeaders) => {
  if (!rawHeaders || rawHeaders.length === 0) {
    throw ApiError.badRequest('Dataset header row is missing or empty.');
  }

  const nonEmptyCount = rawHeaders.filter(
    (h) => h !== null && h !== undefined && String(h).trim() !== ''
  ).length;

  if (nonEmptyCount === 0) {
    throw ApiError.badRequest('Dataset contains no valid headers (all header cells are empty).');
  }

  const seenCounts = new Map();
  const headers = [];
  const columns = [];

  rawHeaders.forEach((rawH, index) => {
    let originalName = rawH !== null && rawH !== undefined ? String(rawH).trim() : '';
    if (originalName === '') {
      originalName = `Column_${index + 1}`;
    }

    const count = seenCounts.get(originalName) || 0;
    seenCounts.set(originalName, count + 1);

    let finalName = originalName;
    if (count > 0) {
      finalName = `${originalName}_${count + 1}`;
    }

    headers.push(finalName);
    columns.push({
      name: finalName,
      originalName,
      index,
      inferredType: 'string'
    });
  });

  return { headers, columns };
};

/**
 * Parse a CSV file with streaming support.
 *
 * @param {string} filePath - Absolute path to the CSV file
 * @param {object} options
 * @param {number} [options.limit=0] - Maximum rows to retain in memory (0 = count only / no limit)
 * @param {boolean} [options.stopAtLimit=false] - Whether to stop stream after limit is reached (for preview)
 * @returns {Promise<{ headers: string[], columns: object[], rows: object[], totalRows: number, totalColumns: number }>}
 */
export const parseCSV = async (filePath, options = {}) => {
  const { limit = 0, stopAtLimit = false } = options;

  if (!fs.existsSync(filePath)) {
    throw ApiError.notFound('Dataset file does not exist on disk.');
  }

  const stats = await fs.promises.stat(filePath);
  if (stats.size === 0) {
    throw ApiError.badRequest('The dataset file is empty (0 bytes).');
  }

  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    const parser = stream.pipe(
      parse({
        bom: true,
        relax_column_count: true,
        skip_empty_lines: true,
        trim: false
      })
    );

    let rawHeaders = null;
    let processed = null;
    const rows = [];
    let totalRows = 0;
    let isTerminated = false;

    const cleanup = () => {
      isTerminated = true;
      try {
        parser.destroy();
        stream.destroy();
      } catch {
        // Ignore destroy error
      }
    };

    (async () => {
      try {
        for await (const record of parser) {
          if (!rawHeaders) {
            rawHeaders = record;
            processed = processHeaders(rawHeaders);
          } else {
            totalRows++;
            const shouldCollectRow = limit <= 0 || rows.length < limit;

            if (shouldCollectRow) {
              const rowObj = { _rowNumber: totalRows + 1 };
              processed.headers.forEach((headerName, colIdx) => {
                const rawVal = record[colIdx];
                rowObj[headerName] = rawVal !== undefined && rawVal !== null ? rawVal : '';
              });
              rows.push(rowObj);
            }

            if (stopAtLimit && limit > 0 && rows.length >= limit) {
              cleanup();
              break;
            }
          }
        }

        if (!rawHeaders) {
          throw ApiError.badRequest('CSV file is empty or contains no readable lines.');
        }

        resolve({
          headers: processed.headers,
          columns: processed.columns,
          rows,
          totalRows,
          totalColumns: processed.headers.length
        });
      } catch (err) {
        if (!isTerminated) {
          cleanup();
          if (err instanceof ApiError) {
            return reject(err);
          }
          return reject(ApiError.badRequest(`Malformed or invalid CSV: ${err.message}`));
        }
        // If terminated intentionally by stopAtLimit, resolve successfully
        resolve({
          headers: processed.headers,
          columns: processed.columns,
          rows,
          totalRows: rows.length,
          totalColumns: processed.headers.length
        });
      }
    })();

    stream.on('error', (err) => {
      if (!isTerminated) {
        cleanup();
        reject(ApiError.badRequest(`Error reading CSV file stream: ${err.message}`));
      }
    });

    parser.on('error', (err) => {
      if (!isTerminated) {
        cleanup();
        reject(ApiError.badRequest(`CSV parse error: ${err.message}`));
      }
    });
  });
};

export default {
  parseCSV,
  processHeaders
};
