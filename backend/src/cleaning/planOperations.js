import { validateOperations } from '../ai/schemas/aiCleaning.schema.js';
import { createInitialMetrics, createRowResult } from './schemas/cleaningResult.schema.js';
import { detectColumnTypes } from './rules/fieldTypeDetector.js';
import { checkMissingValue } from './rules/missingValue.rules.js';
import { cleanGeneralString } from './rules/standardization.rules.js';
import { cleanEmail } from './rules/email.rules.js';
import { cleanPhone } from './rules/phone.rules.js';
import { cleanName } from './rules/name.rules.js';
import { cleanLocation } from './rules/location.rules.js';
import { detectDuplicates } from './duplicate/duplicateDetector.js';

const rules = { trim_whitespace: cleanGeneralString, normalize_email: cleanEmail,
  standardize_phone: cleanPhone, standardize_name: cleanName, standardize_location: cleanLocation };

// Deliberately executes only the reviewed operations. No eval, arbitrary functions,
// inferred replacement values, deletion, or unrequested missing-value imputation.
export function processPlannedRows(rows, columns, options, classifyRow) {
  const operations = validateOperations(options.operations, columns);
  const names = columns.map(column => typeof column === 'string' ? column : column.name);
  const types = detectColumnTypes(names);
  const metrics = createInitialMetrics(rows.length);
  const cleanedRows = rows.map((raw, index) => {
    const original = Object.fromEntries(names.map(name => [name, raw[name]]));
    const result = createRowResult({ rowNumber: raw._rowNumber || index + 2, original, cleaned: { ...original } });
    for (const operation of operations) {
      if (operation.type === 'detect_duplicates') continue;
      for (const name of operation.column === null ? names : [operation.column]) {
        const value = result.cleaned[name];
        if (operation.type === 'flag_missing_values') {
          const missing = checkMissingValue(name, value, options);
          if (missing.isMissing && !result.missingFields?.includes(name)) {
            result.missingFields = [...(result.missingFields || []), name];
            if (missing.issue) result.issues.push(missing.issue);
            metrics.missingValueCount++; metrics.unresolvedMissingValues++;
          }
          continue;
        }
        // Empty values are not fabricated by a formatting operation.
        if (value == null || value === '') continue;
        const cleaned = rules[operation.type](name, value, options);
        result.cleaned[name] = cleaned.cleanedValue;
        if (cleaned.change) { result.changes.push(cleaned.change); metrics.changedFieldCount++; }
        if (cleaned.issue) result.issues.push(cleaned.issue);
      }
    }
    if (result.missingFields?.length) metrics.rowsWithMissingValues++;
    return result;
  });
  const duplicates = detectDuplicates(operations.some(op => op.type === 'detect_duplicates') ? cleanedRows : [], types, options);
  for (const name of ['duplicateRows', 'totalDuplicateGroups', 'deterministicDuplicateGroups', 'potentialDuplicateGroups', 'canonicalRows', 'duplicatePairs', 'conflictCount']) {
    metrics[name] = duplicates[name] || 0;
  }
  for (const row of cleanedRows) {
    row.classification = classifyRow(row);
    const key = { clean: 'cleanRows', modified: 'modifiedRows', needs_review: 'reviewRows', invalid: 'invalidRows' }[row.classification];
    metrics[key]++;
  }
  return { rows: cleanedRows, metrics, duplicateGroups: duplicates.groups, fieldTypes: Object.fromEntries(types) };
}
