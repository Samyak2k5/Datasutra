import {
  createChange,
  createIssue,
  IssueCategory,
  IssueSeverity
} from '../schemas/cleaningResult.schema.js';
import { isMissingValue, checkMissingValue, DEFAULT_MISSING_MARKERS } from '../rules/missingValue.rules.js';
export { DEFAULT_MISSING_MARKERS, isMissingValue, checkMissingValue };
import { FieldType } from '../rules/fieldTypeDetector.js';
import { cleanEmail } from '../rules/email.rules.js';
import { cleanPhone } from '../rules/phone.rules.js';
import { cleanName } from '../rules/name.rules.js';
import { cleanLocation } from '../rules/location.rules.js';
import { cleanGeneralString } from '../rules/standardization.rules.js';

// Sensitive customer identity/contact/address fields that must NEVER have fake defaults or invented values
export const IDENTITY_FIELD_NAMES = new Set([
  'email',
  'mail',
  'phone',
  'mobile',
  'telephone',
  'cell',
  'name',
  'fullname',
  'firstname',
  'lastname',
  'customername',
  'username',
  'clientname',
  'employeename',
  'address',
  'street',
  'streetaddress',
  'addressline',
  'addressline1',
  'addressline2'
]);

/**
 * Checks whether a given field name represents a customer identity/contact/address field.
 *
 * @param {string} fieldName
 * @returns {boolean}
 */
export const isIdentityField = (fieldName) => {
  if (!fieldName || typeof fieldName !== 'string') return false;
  const lower = fieldName.toLowerCase().replace(/[^a-z]/g, '');
  return (
    IDENTITY_FIELD_NAMES.has(lower) ||
    lower.includes('email') ||
    lower.includes('phone') ||
    lower.includes('mobile') ||
    lower.includes('address')
  );
};

/**
 * Analyzes a row to identify missing, present, required, and optional fields.
 *
 * @param {object} row - Row object with { cleaned, original }
 * @param {object} [options={}] - Options including fieldRequirements: { [field]: { required: boolean } }
 * @returns {{ missingFields: Array<string>, presentFields: Array<string>, requiredMissing: Array<string> }}
 */
export const analyzeRowMissingFields = (row, options = {}) => {
  const missingFields = [];
  const presentFields = [];
  const requiredMissing = [];

  const requirements = options.fieldRequirements || {};
  const reqList = Array.isArray(options.requiredFields)
    ? new Set(options.requiredFields.map((f) => String(f).trim().toLowerCase()))
    : options.requiredFields instanceof Set
    ? options.requiredFields
    : null;

  for (const [key, val] of Object.entries(row.cleaned || {})) {
    if (key.startsWith('_')) continue;

    if (isMissingValue(val, options)) {
      missingFields.push(key);
      const isReq =
        requirements[key]?.required === true ||
        (reqList && reqList.has(key.toLowerCase()));
      if (isReq) {
        requiredMissing.push(key);
      }
    } else {
      presentFields.push(key);
    }
  }

  return {
    missingFields,
    presentFields,
    requiredMissing
  };
};

/**
 * Revalidates an imputed field value using the deterministic field rule corresponding to its type.
 *
 * @param {string} field
 * @param {any} value
 * @param {string} fieldType
 * @param {object} options
 * @returns {{ isValid: boolean, cleanedValue: any, change: object | null, issue: object | null }}
 */
export const revalidateImputedField = (field, value, fieldType, options = {}) => {
  switch (fieldType) {
    case FieldType.EMAIL:
      return cleanEmail(field, value, options);
    case FieldType.PHONE:
      return cleanPhone(field, value, options);
    case FieldType.NAME:
      return cleanName(field, value, options);
    case FieldType.LOCATION:
      return cleanLocation(field, value, options);
    case FieldType.GENERAL_STRING:
    default:
      return cleanGeneralString(field, value, options);
  }
};

/**
 * Imputes missing values across duplicate groups based on group consensus.
 *
 * Strategy B Rules:
 * 1. Only deterministic duplicate groups (status === 'confirmed_deterministic').
 * 2. Only non-identity fields (or fields where consensus is 100% unanimous among all populated members).
 * 3. Populated members must all agree on the exact same non-empty value (case-insensitive).
 * 4. If members have different non-empty values, flag as a conflict and DO NOT impute.
 *
 * @param {Array<object>} cleanedRows
 * @param {Array<object>} duplicateGroups
 * @param {Map<string, string>} columnTypeMap
 * @param {object} options
 * @returns {{ resolvedCount: number, conflictCount: number, fieldsImputed: object }}
 */
export const resolveDuplicateConsensus = (
  cleanedRows,
  duplicateGroups = [],
  columnTypeMap,
  options = {}
) => {
  let resolvedCount = 0;
  let conflictCount = 0;
  const fieldsImputed = {};

  const rowsByNumber = new Map(cleanedRows.map((r) => [r.rowNumber, r]));

  for (const group of duplicateGroups) {
    // Only resolve consensus on confirmed deterministic groups
    if (group.status !== 'confirmed_deterministic') continue;

    const memberRows = group.memberRowNumbers
      .map((num) => rowsByNumber.get(num))
      .filter(Boolean);

    if (memberRows.length <= 1) continue;

    // Collect all field names across members
    const fieldNames = new Set();
    for (const r of memberRows) {
      for (const k of Object.keys(r.cleaned || {})) {
        if (!k.startsWith('_')) fieldNames.add(k);
      }
    }

    for (const field of fieldNames) {
      // Identity fields (email, phone, name, address) are key matching fields and must not be blindly cross-filled
      if (isIdentityField(field)) continue;

      // Only check consensus if at least one member has this field missing!
      const hasMissingMember = memberRows.some((r) => isMissingValue(r.cleaned?.[field], options));
      if (!hasMissingMember) continue;

      const populatedValues = new Map(); // normalized -> { originalVal, rowNumbers }

      for (const r of memberRows) {
        const val = r.cleaned?.[field];
        if (!isMissingValue(val, options)) {
          const strVal = String(val).trim();
          if (strVal !== '') {
            const normalizedKey = strVal.toLowerCase();
            if (!populatedValues.has(normalizedKey)) {
              populatedValues.set(normalizedKey, { originalVal: val, rowNumbers: [] });
            }
            populatedValues.get(normalizedKey).rowNumbers.push(r.rowNumber);
          }
        }
      }

      // If populated values conflict across members (e.g. Mumbai vs Delhi)
      if (populatedValues.size > 1) {
        conflictCount++;
        group.conflicts = group.conflicts || [];
        group.conflicts.push({
          type: 'field_conflict',
          field,
          fields: [field],
          severity: IssueSeverity.WARNING,
          message: `Conflicting values for field '${field}' among duplicate group members: ${Array.from(populatedValues.keys()).join(', ')}`,
          values: Array.from(populatedValues.keys())
        });
        group.requiresReview = true;

        // Mark duplicate conflict issue on missing members
        for (const r of memberRows) {
          if (isMissingValue(r.cleaned?.[field], options)) {
            const hasConflictIssue = r.issues.some(
              (i) => i.field === field && i.category === IssueCategory.MISSING_CONFLICT
            );
            if (!hasConflictIssue) {
              r.issues.push(
                createIssue({
                  field,
                  rule: 'missing.duplicate_conflict',
                  category: IssueCategory.MISSING_CONFLICT,
                  message: `Field '${field}' cannot be resolved due to conflicting values in duplicate group ${group.groupId}`,
                  severity: IssueSeverity.WARNING,
                  value: Array.from(populatedValues.keys())
                })
              );
            }
          }
        }
        continue;
      }

      // If exactly ONE non-empty value exists among populated members -> Consensus!
      if (populatedValues.size === 1) {
        const [, consensusObj] = Array.from(populatedValues.entries())[0];
        const consensusVal = consensusObj.originalVal;
        const sourceRows = consensusObj.rowNumbers;

        const fieldType = columnTypeMap?.get
          ? columnTypeMap.get(field) || FieldType.GENERAL_STRING
          : columnTypeMap?.[field] || FieldType.GENERAL_STRING;

        for (const r of memberRows) {
          if (isMissingValue(r.cleaned?.[field], options)) {
            // Revalidate the consensus value
            const reval = revalidateImputedField(field, consensusVal, fieldType, options);
            const isRevalValid =
              reval.isValid !== false &&
              (!reval.issue || reval.issue.severity !== IssueSeverity.ERROR);

            if (isRevalValid) {
              const origVal = r.cleaned?.[field] ?? '';
              r.cleaned[field] = reval.cleanedValue ?? consensusVal;

              const change = createChange({
                field,
                rule: 'missing.fill_duplicate_consensus',
                originalValue: origVal,
                cleanedValue: r.cleaned[field],
                reason: `All populated duplicate-group members agree on ${r.cleaned[field]}`,
                source: 'duplicate_group',
                evidenceLevel: 'strong_deterministic',
                sourceRows,
                groupId: group.groupId
              });

              r.changes.push(change);
              resolvedCount++;
              fieldsImputed[field] = (fieldsImputed[field] || 0) + 1;

              // Remove the earlier missing value issue for this field
              r.issues = r.issues.filter(
                (issue) =>
                  !(
                    issue.field === field &&
                    (issue.category === IssueCategory.MISSING_VALUE ||
                      issue.category === IssueCategory.MISSING_CONFLICT)
                  )
              );

              // Mark that this duplicate row had its missing values safely reconciled
              if (r.duplicateInfo) {
                r.duplicateInfo.imputedFromConsensus = true;
                if (!group.requiresReview) {
                  r.duplicateInfo.requiresReview = false;
                  r.duplicateInfo.status = 'resolved';
                  // Remove duplicate suspect warning if group has no conflicts
                  r.issues = r.issues.filter(
                    (issue) => issue.category !== IssueCategory.DUPLICATE_SUSPECT
                  );
                }
              }
            }
          }
        }
      }
    }
  }

  return { resolvedCount, conflictCount, fieldsImputed };
};

/**
 * Imputes missing values using explicit configuration defaults.
 *
 * Strategy A Rules:
 * 1. Only fills fields with explicitly configured defaults.
 * 2. NEVER invents fake identity defaults (email, phone, name).
 *
 * @param {Array<object>} cleanedRows
 * @param {Map<string, string>} columnTypeMap
 * @param {object} options - options.defaults: { [field]: defaultValue }
 * @returns {{ resolvedCount: number, fieldsImputed: object }}
 */
export const resolveConfiguredDefaults = (
  cleanedRows,
  columnTypeMap,
  options = {}
) => {
  let resolvedCount = 0;
  const fieldsImputed = {};

  const defaults = options.defaults || {};
  if (Object.keys(defaults).length === 0) {
    return { resolvedCount, fieldsImputed };
  }

  for (const row of cleanedRows) {
    for (const [field, defaultVal] of Object.entries(defaults)) {
      if (defaultVal === undefined || defaultVal === null || String(defaultVal).trim() === '') {
        continue;
      }

      // Safety: Never use defaults for identity/contact/address fields
      if (isIdentityField(field)) continue;

      if (isMissingValue(row.cleaned?.[field], options)) {
        const origVal = row.cleaned?.[field] ?? '';
        const fieldType = columnTypeMap?.get
          ? columnTypeMap.get(field) || FieldType.GENERAL_STRING
          : columnTypeMap?.[field] || FieldType.GENERAL_STRING;

        const reval = revalidateImputedField(field, defaultVal, fieldType, options);
        const isRevalValid =
          reval.isValid !== false &&
          (!reval.issue || reval.issue.severity !== IssueSeverity.ERROR);

        if (isRevalValid) {
          row.cleaned[field] = reval.cleanedValue ?? defaultVal;

          const change = createChange({
            field,
            rule: 'missing.fill_configured_default',
            originalValue: origVal,
            cleanedValue: row.cleaned[field],
            reason: `Filled from explicit dataset default (${defaultVal})`,
            source: 'explicit_configuration',
            evidenceLevel: 'explicit'
          });

          row.changes.push(change);
          resolvedCount++;
          fieldsImputed[field] = (fieldsImputed[field] || 0) + 1;

          // Remove earlier missing value issue
          row.issues = row.issues.filter(
            (issue) => !(issue.field === field && issue.category === IssueCategory.MISSING_VALUE)
          );
        }
      }
    }
  }

  return { resolvedCount, fieldsImputed };
};

/**
 * Imputes missing values using explicit mapping/alias tables.
 *
 * Strategy C Rules:
 * - When source field is present and target field is missing, map value deterministically.
 * - Revalidates mapped target value.
 *
 * @param {Array<object>} cleanedRows
 * @param {Map<string, string>} columnTypeMap
 * @param {object} options - options.mappings: { [sourceField]: { [srcVal]: targetVal } }, options.lookups
 * @returns {{ resolvedCount: number, fieldsImputed: object }}
 */
export const resolveConfiguredMappings = (
  cleanedRows,
  columnTypeMap,
  options = {}
) => {
  let resolvedCount = 0;
  const fieldsImputed = {};

  const mappings = options.mappings || {};
  const lookups = options.lookups || [];

  for (const row of cleanedRows) {
    // Check options.mappings: e.g. { countryCode: { "IN": "India" } }
    for (const [srcField, mapTable] of Object.entries(mappings)) {
      const srcVal = row.cleaned?.[srcField];
      if (srcVal && typeof srcVal === 'string' && mapTable[srcVal]) {
        // Find possible target fields (e.g. if srcField is countryCode, target is country)
        const targetField = srcField.replace(/code$/i, '');
        if (targetField !== srcField && isMissingValue(row.cleaned?.[targetField], options)) {
          const rawMappedVal = mapTable[srcVal];
          const fieldType = columnTypeMap?.get
            ? columnTypeMap.get(targetField) || FieldType.GENERAL_STRING
            : columnTypeMap?.[targetField] || FieldType.GENERAL_STRING;

          const reval = revalidateImputedField(targetField, rawMappedVal, fieldType, options);
          const isRevalValid =
            reval.isValid !== false &&
            (!reval.issue || reval.issue.severity !== IssueSeverity.ERROR);

          if (isRevalValid) {
            const mappedVal = reval.cleanedValue ?? rawMappedVal;
            row.cleaned[targetField] = mappedVal;

            row.changes.push(
              createChange({
                field: targetField,
                rule: 'missing.fill_deterministic_mapping',
                originalValue: '',
                cleanedValue: mappedVal,
                reason: `Mapped from ${srcField} '${srcVal}' to '${mappedVal}'`,
                source: 'explicit_mapping',
                evidenceLevel: 'deterministic',
                sourceField: srcField,
                sourceValue: srcVal
              })
            );

            resolvedCount++;
            fieldsImputed[targetField] = (fieldsImputed[targetField] || 0) + 1;
            row.issues = row.issues.filter(
              (issue) => !(issue.field === targetField && issue.category === IssueCategory.MISSING_VALUE)
            );
          }
        }
      }
    }

    // Check options.lookups: e.g. [{ sourceField: 'countryCode', targetField: 'country', mapping: { IN: 'India' } }]
    for (const lookup of lookups) {
      const { sourceField, targetField, mapping } = lookup;
      if (sourceField && targetField && mapping && isMissingValue(row.cleaned?.[targetField], options)) {
        const srcVal = row.cleaned?.[sourceField];
        if (srcVal && mapping[srcVal]) {
          const rawMappedVal = mapping[srcVal];
          const fieldType = columnTypeMap?.get
            ? columnTypeMap.get(targetField) || FieldType.GENERAL_STRING
            : columnTypeMap?.[targetField] || FieldType.GENERAL_STRING;

          const reval = revalidateImputedField(targetField, rawMappedVal, fieldType, options);
          const isRevalValid =
            reval.isValid !== false &&
            (!reval.issue || reval.issue.severity !== IssueSeverity.ERROR);

          if (isRevalValid) {
            const mappedVal = reval.cleanedValue ?? rawMappedVal;
            row.cleaned[targetField] = mappedVal;

            row.changes.push(
              createChange({
                field: targetField,
                rule: 'missing.fill_deterministic_mapping',
                originalValue: '',
                cleanedValue: mappedVal,
                reason: `Mapped from ${sourceField} '${srcVal}' to '${mappedVal}'`,
                source: 'explicit_mapping',
                evidenceLevel: 'deterministic',
                sourceField,
                sourceValue: srcVal
              })
            );

            resolvedCount++;
            fieldsImputed[targetField] = (fieldsImputed[targetField] || 0) + 1;
            row.issues = row.issues.filter(
              (issue) => !(issue.field === targetField && issue.category === IssueCategory.MISSING_VALUE)
            );
          }
        }
      }
    }
  }

  return { resolvedCount, fieldsImputed };
};

/**
 * Imputes missing values using explicitly configured deterministic derived value rules.
 *
 * Strategy D Rules:
 * - Only fills fields with explicitly configured derivation logic.
 * - Source fields must all be present and non-empty.
 * - Revalidates derived value.
 *
 * @param {Array<object>} cleanedRows
 * @param {Map<string, string>} columnTypeMap
 * @param {object} options - options.derivedValues or options.derived
 * @returns {{ resolvedCount: number, fieldsImputed: object }}
 */
export const resolveConfiguredDerivedValues = (
  cleanedRows,
  columnTypeMap,
  options = {}
) => {
  let resolvedCount = 0;
  const fieldsImputed = {};

  const derivedRules = [];

  if (Array.isArray(options.derivedValues)) {
    derivedRules.push(...options.derivedValues);
  } else if (options.derivedValues && typeof options.derivedValues === 'object') {
    for (const [targetField, def] of Object.entries(options.derivedValues)) {
      derivedRules.push({ targetField, ...def });
    }
  }

  if (Array.isArray(options.derived)) {
    derivedRules.push(...options.derived);
  } else if (options.derived && typeof options.derived === 'object') {
    for (const [targetField, def] of Object.entries(options.derived)) {
      derivedRules.push({ targetField, ...def });
    }
  }

  if (derivedRules.length === 0) {
    return { resolvedCount, fieldsImputed };
  }

  for (const row of cleanedRows) {
    for (const rule of derivedRules) {
      const targetField = rule.targetField;
      if (!targetField) continue;

      if (!isMissingValue(row.cleaned?.[targetField], options)) {
        continue;
      }

      let derivedVal = null;
      let sourceInfo = '';
      let sourceValInfo = null;

      if (typeof rule.derive === 'function') {
        derivedVal = rule.derive(row.cleaned);
        sourceInfo = rule.sourceFields ? rule.sourceFields.join(', ') : (rule.sourceField || 'derived_function');
        sourceValInfo = rule.sourceFields ? rule.sourceFields.map((f) => row.cleaned?.[f]) : row.cleaned?.[rule.sourceField];
      } else if (Array.isArray(rule.sourceFields) && rule.sourceFields.length > 0) {
        const allPresent = rule.sourceFields.every(
          (sf) => !isMissingValue(row.cleaned?.[sf], options)
        );
        if (allPresent) {
          const sep = rule.separator !== undefined ? rule.separator : ' ';
          derivedVal = rule.sourceFields
            .map((sf) => String(row.cleaned[sf]).trim())
            .join(sep);
          sourceInfo = rule.sourceFields.join(', ');
          sourceValInfo = rule.sourceFields.map((sf) => row.cleaned[sf]);
        }
      } else if (rule.sourceField && rule.mapping) {
        const srcVal = row.cleaned?.[rule.sourceField];
        if (!isMissingValue(srcVal, options)) {
          const normalizedSrc = String(srcVal).trim();
          if (rule.mapping[normalizedSrc] !== undefined) {
            derivedVal = rule.mapping[normalizedSrc];
          } else if (rule.mapping[normalizedSrc.toLowerCase()] !== undefined) {
            derivedVal = rule.mapping[normalizedSrc.toLowerCase()];
          }
          sourceInfo = rule.sourceField;
          sourceValInfo = srcVal;
        }
      }

      if (derivedVal !== null && derivedVal !== undefined && String(derivedVal).trim() !== '') {
        const origVal = row.cleaned?.[targetField] ?? '';
        const fieldType = columnTypeMap?.get
          ? columnTypeMap.get(targetField) || FieldType.GENERAL_STRING
          : columnTypeMap?.[targetField] || FieldType.GENERAL_STRING;

        const reval = revalidateImputedField(targetField, derivedVal, fieldType, options);
        const isRevalValid =
          reval.isValid !== false &&
          (!reval.issue || reval.issue.severity !== IssueSeverity.ERROR);

        if (isRevalValid) {
          row.cleaned[targetField] = reval.cleanedValue ?? derivedVal;

          const change = createChange({
            field: targetField,
            rule: 'missing.fill_deterministic_derived',
            originalValue: origVal,
            cleanedValue: row.cleaned[targetField],
            reason: `Derived deterministically from ${sourceInfo}`,
            source: 'explicit_derived',
            evidenceLevel: 'deterministic',
            sourceField: sourceInfo,
            sourceValue: sourceValInfo
          });

          row.changes.push(change);
          resolvedCount++;
          fieldsImputed[targetField] = (fieldsImputed[targetField] || 0) + 1;

          // Remove earlier missing value issue
          row.issues = row.issues.filter(
            (issue) => !(issue.field === targetField && issue.category === IssueCategory.MISSING_VALUE)
          );
        }
      }
    }
  }

  return { resolvedCount, fieldsImputed };
};

/**
 * Master missing data processor: analyzes missing fields, applies safe deterministic imputation
 * (duplicate consensus, mappings, derived values, explicit defaults), attaches provenance,
 * enforces required field rules, and compiles metrics.
 *
 * @param {Array<object>} cleanedRows
 * @param {Array<object>} duplicateGroups
 * @param {Map<string, string>} columnTypeMap
 * @param {object} options
 * @returns {{ rows: Array<object>, metrics: object }}
 */
export const processMissingData = (
  cleanedRows,
  duplicateGroups = [],
  columnTypeMap,
  options = {}
) => {
  let initialMissingCount = 0;
  let rowsWithMissingCount = 0;

  // 1. Initial Missing Data Analysis
  for (const row of cleanedRows) {
    const analysis = analyzeRowMissingFields(row, options);
    row.missingFields = analysis.missingFields;
    row.presentFields = analysis.presentFields;
    row.requiredMissing = analysis.requiredMissing;

    if (analysis.missingFields.length > 0) {
      initialMissingCount += analysis.missingFields.length;
      rowsWithMissingCount++;
    }
  }

  // 2. Safe Imputation Strategy B: Duplicate-Group Consensus
  const consensusResult = resolveDuplicateConsensus(
    cleanedRows,
    duplicateGroups,
    columnTypeMap,
    options
  );

  // 3. Safe Imputation Strategy C: Configured Lookups / Mappings
  const mappingsResult = resolveConfiguredMappings(
    cleanedRows,
    columnTypeMap,
    options
  );

  // 4. Safe Imputation Strategy D: Configured Deterministic Derived Values
  const derivedResult = resolveConfiguredDerivedValues(
    cleanedRows,
    columnTypeMap,
    options
  );

  // 5. Safe Imputation Strategy A: Configured Defaults
  const defaultsResult = resolveConfiguredDefaults(
    cleanedRows,
    columnTypeMap,
    options
  );

  const totalResolved =
    consensusResult.resolvedCount +
    mappingsResult.resolvedCount +
    derivedResult.resolvedCount +
    defaultsResult.resolvedCount;

  const totalConflicts = consensusResult.conflictCount;
  const unresolvedCount = Math.max(0, initialMissingCount - totalResolved);

  // Combine fieldsImputed map
  const fieldsImputed = {};
  for (const [k, v] of Object.entries(consensusResult.fieldsImputed)) {
    fieldsImputed[k] = (fieldsImputed[k] || 0) + v;
  }
  for (const [k, v] of Object.entries(mappingsResult.fieldsImputed)) {
    fieldsImputed[k] = (fieldsImputed[k] || 0) + v;
  }
  for (const [k, v] of Object.entries(derivedResult.fieldsImputed)) {
    fieldsImputed[k] = (fieldsImputed[k] || 0) + v;
  }
  for (const [k, v] of Object.entries(defaultsResult.fieldsImputed)) {
    fieldsImputed[k] = (fieldsImputed[k] || 0) + v;
  }

  // 6. Post-Imputation Analysis & Annotate remaining unresolved fields
  for (const row of cleanedRows) {
    const postAnalysis = analyzeRowMissingFields(row, options);
    row.missingFields = postAnalysis.missingFields;
    row.presentFields = postAnalysis.presentFields;
    row.requiredMissing = postAnalysis.requiredMissing;

    // Handle required missing fields (severity: ERROR -> marks row as INVALID)
    if (row.requiredMissing.length > 0) {
      for (const reqField of row.requiredMissing) {
        let existingIssue = row.issues.find(
          (i) => i.field === reqField && (i.category === IssueCategory.MISSING_VALUE || i.category === IssueCategory.MISSING_CONFLICT)
        );
        if (existingIssue) {
          existingIssue.severity = IssueSeverity.ERROR;
          existingIssue.message = `Required field '${reqField}' is missing`;
        } else {
          row.issues.push(
            createIssue({
              field: reqField,
              rule: 'missing_value.required_missing',
              category: IssueCategory.MISSING_VALUE,
              message: `Required field '${reqField}' is missing`,
              severity: IssueSeverity.ERROR,
              value: ''
            })
          );
        }
      }
    }

    // Handle non-required unresolved fields (severity: WARNING -> marks row as NEEDS_REVIEW)
    for (const [k, v] of Object.entries(row.cleaned || {})) {
      if (k.startsWith('_')) continue;
      if (isMissingValue(v, options)) {
        const hasExistingIssue = row.issues.some(
          (i) => i.field === k && (i.category === IssueCategory.MISSING_VALUE || i.category === IssueCategory.MISSING_CONFLICT)
        );
        if (!hasExistingIssue) {
          row.issues.push(
            createIssue({
              field: k,
              rule: 'missing_value.unresolved',
              category: IssueCategory.MISSING_VALUE,
              message: `${k} is missing and no deterministic value is available.`,
              severity: IssueSeverity.WARNING,
              value: ''
            })
          );
        }
      }
    }
  }

  const missingMetrics = {
    missingValueCount: initialMissingCount,
    rowsWithMissingValues: rowsWithMissingCount,
    resolvedMissingValues: totalResolved,
    unresolvedMissingValues: unresolvedCount,
    missingConflicts: totalConflicts,
    imputedFieldCount: totalResolved,
    fieldsImputed
  };

  return {
    rows: cleanedRows,
    missingMetrics
  };
};

export default {
  IDENTITY_FIELD_NAMES,
  isIdentityField,
  analyzeRowMissingFields,
  revalidateImputedField,
  resolveDuplicateConsensus,
  resolveConfiguredDefaults,
  resolveConfiguredMappings,
  resolveConfiguredDerivedValues,
  processMissingData
};
