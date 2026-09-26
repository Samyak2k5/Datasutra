import fs from 'fs';
import xlsx from 'xlsx';
import ApiError from '../utils/apiError.js';
import { processHeaders } from './csv.parser.js';

/**
 * Parse an Excel (.xlsx) file.
 * Automatically selects the first non-empty worksheet.
 *
 * @param {string} filePath - Absolute path to the XLSX file
 * @param {object} options
 * @param {number} [options.limit=0] - Maximum rows to retain for preview (0 = all data rows)
 * @returns {Promise<{ headers: string[], columns: object[], rows: object[], totalRows: number, totalColumns: number, worksheetName: string }>}
 */
export const parseXLSX = async (filePath, options = {}) => {
  const { limit = 0 } = options;

  if (!fs.existsSync(filePath)) {
    throw ApiError.notFound('Dataset file does not exist on disk.');
  }

  const stats = await fs.promises.stat(filePath);
  if (stats.size === 0) {
    throw ApiError.badRequest('The dataset file is empty (0 bytes).');
  }

  let wb;
  try {
    wb = xlsx.readFile(filePath, { cellDates: true });
  } catch (err) {
    throw ApiError.badRequest(`Malformed or corrupted Excel file: ${err.message}`);
  }

  if (!wb || !wb.SheetNames || wb.SheetNames.length === 0) {
    throw ApiError.badRequest('Excel workbook contains no readable sheets.');
  }

  // Find first non-empty worksheet
  let selectedSheetName = null;
  let selectedSheet = null;

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (ws && ws['!ref']) {
      selectedSheetName = sheetName;
      selectedSheet = ws;
      break;
    }
  }

  if (!selectedSheet) {
    throw ApiError.badRequest('Excel workbook contains no valid non-empty worksheets.');
  }

  const rawRows = xlsx.utils.sheet_to_json(selectedSheet, {
    header: 1,
    defval: ''
  });

  if (!rawRows || rawRows.length === 0) {
    throw ApiError.badRequest(`Worksheet '${selectedSheetName}' contains no data.`);
  }

  // Process header row
  const rawHeaders = rawRows[0];
  const processed = processHeaders(rawHeaders);

  const totalRows = Math.max(0, rawRows.length - 1);
  const rows = [];

  const rowsToCollect = limit > 0 ? Math.min(limit, totalRows) : totalRows;

  for (let i = 1; i <= rowsToCollect; i++) {
    const record = rawRows[i] || [];
    const rowObj = { _rowNumber: i + 1 };

    processed.headers.forEach((headerName, colIdx) => {
      const val = record[colIdx];
      rowObj[headerName] = val !== undefined && val !== null ? val : '';
    });

    rows.push(rowObj);
  }

  return {
    headers: processed.headers,
    columns: processed.columns,
    rows,
    totalRows,
    totalColumns: processed.headers.length,
    worksheetName: selectedSheetName
  };
};

export default {
  parseXLSX
};
