import { isMissingValue } from '../cleaning/rules/missingValue.rules.js';
import { isValidEmailFormat } from '../cleaning/rules/email.rules.js';
import { cleanPhone } from '../cleaning/rules/phone.rules.js';
import { cleanName } from '../cleaning/rules/name.rules.js';
import { cleanLocation } from '../cleaning/rules/location.rules.js';
import { detectColumnTypes, FieldType } from '../cleaning/rules/fieldTypeDetector.js';
import { detectDuplicates } from '../cleaning/duplicate/duplicateDetector.js';
import { createRowResult } from '../cleaning/schemas/cleaningResult.schema.js';
import { cleaningReportSchema } from '../ai/schemas/cleaningReport.schema.js';
import { createApiCalls } from '../ai/apiCallTracker.js';

const NA = 'Not applicable';
export function measureRecords(rows, columns, { document = false, structuredTable = false } = {}) {
  const names = columns.map(column => typeof column === 'string' ? column : column.name);
  const types = detectColumnTypes(names);
  const tabular = !document || structuredTable;
  const has = type => [...types.values()].includes(type);
  const stats = { rows: tabular ? rows.length : NA, missingValues: tabular ? 0 : NA,
    duplicateGroups: tabular ? 0 : NA, invalidEmails: has(FieldType.EMAIL) ? 0 : NA,
    invalidPhones: has(FieldType.PHONE) ? 0 : NA,
    nameCityInconsistencies: has(FieldType.NAME) || has(FieldType.LOCATION) ? 0 : NA };
  for (const row of rows) for (const name of names) {
    const value = row[name];
    if (isMissingValue(value)) { if (tabular) stats.missingValues++; continue; }
    const type = types.get(name);
    if (type === FieldType.EMAIL && !isValidEmailFormat(String(value))) stats.invalidEmails++;
    if (type === FieldType.PHONE) {
      const checked = cleanPhone(name, value);
      if (!checked.isValid || checked.change) stats.invalidPhones++;
    }
    if ([FieldType.NAME, FieldType.LOCATION].includes(type)) {
      const checked = (type === FieldType.NAME ? cleanName : cleanLocation)(name, value);
      if (checked.change || checked.issue) stats.nameCityInconsistencies++;
    }
  }
  if (tabular) {
    const copies = rows.map((row, i) => createRowResult({ rowNumber: row._rowNumber || i + 2,
      original: Object.fromEntries(names.map(name => [name, row[name]])), cleaned: Object.fromEntries(names.map(name => [name, row[name]])) }));
    stats.duplicateGroups = detectDuplicates(copies, types).totalDuplicateGroups;
  }
  return stats;
}
export function metricOptions(parsed) {
  return { document: ['pdf', 'doc', 'docx', 'txt'].includes(parsed.format),
    structuredTable: (parsed.metadata?.tablesFound || parsed.metadata?.tableCount || 0) > 0 };
}
export function buildComparisonReport({ parsed, cleanedRows, reviewItems = [], processingTimeMs, apiCalls = createApiCalls() }) {
  const options = metricOptions(parsed);
  const before = measureRecords(parsed.rows, parsed.columns, options);
  const after = measureRecords(cleanedRows.map(row => row.cleaned), parsed.columns, options);
  const manualRecords = new Set(reviewItems.map(item => item.rowNumber)).size;
  const metrics = { originalRows: before.rows, finalRows: after.rows,
    missingValuesBefore: before.missingValues, missingValuesAfter: after.missingValues,
    duplicateGroupsBefore: before.duplicateGroups, duplicateGroupsAfter: after.duplicateGroups,
    invalidEmailsBefore: before.invalidEmails, invalidEmailsAfter: after.invalidEmails,
    invalidPhonesBefore: before.invalidPhones, invalidPhonesAfter: after.invalidPhones,
    nameCityInconsistenciesBefore: before.nameCityInconsistencies, nameCityInconsistenciesAfter: after.nameCityInconsistencies,
    semanticManualReviewRecords: manualRecords, processingTimeMs, llmApiCalls: apiCalls.total };
  const textLength = rows => rows.reduce((sum, row) => sum + parsed.headers.reduce((n, name) => n + String(row[name] ?? '').length, 0), 0);
  return cleaningReportSchema.parse({ metrics, apiCalls, summary: null, issues: [], recommendations: [],
    reviewRecords: reviewItems.slice(0, 50).map(item => typeof item.toObject === 'function' ? item.toObject() : item),
    documentMetrics: options.document ? { extractedCharactersBefore: textLength(parsed.rows), extractedCharactersAfter: textLength(cleanedRows.map(row => row.cleaned)),
      extractedSections: parsed.documentStructure?.sections?.length ?? null, tablesFound: parsed.metadata?.tablesFound ?? parsed.metadata?.tableCount ?? null } : null,
    scope: options.document ? 'Extracted document content only. Table metrics apply only when the parser identifies a table; prose is not treated as dataset rows.' : 'All parsed records. Missing and invalid values count cells; duplicate groups use the existing deterministic detector. Review count is distinct record numbers.',
    summaryError: null });
}
