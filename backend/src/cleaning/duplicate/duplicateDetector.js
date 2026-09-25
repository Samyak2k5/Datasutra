import { createIssue, IssueCategory, IssueSeverity } from '../schemas/cleaningResult.schema.js';
import { FieldType } from '../rules/fieldTypeDetector.js';

/**
 * Disjoint Set (Union-Find) data structure for clustering duplicate records into groups.
 */
export class DisjointSet {
  constructor() {
    this.parent = new Map();
  }

  find(i) {
    if (!this.parent.has(i)) {
      this.parent.set(i, i);
      return i;
    }
    if (this.parent.get(i) === i) return i;
    const root = this.find(this.parent.get(i));
    this.parent.set(i, root);
    return root;
  }

  union(i, j) {
    const rootI = this.find(i);
    const rootJ = this.find(j);
    if (rootI !== rootJ) {
      if (rootI < rootJ) {
        this.parent.set(rootJ, rootI);
      } else {
        this.parent.set(rootI, rootJ);
      }
    }
  }
}

/**
 * Deterministically selects the canonical candidate row number for a group.
 * Default: earliest row number in the dataset.
 *
 * @param {object} group - Duplicate group object with memberRowNumbers
 * @returns {number}
 */
export const selectCanonicalCandidate = (group) => {
  if (!group || !Array.isArray(group.memberRowNumbers) || group.memberRowNumbers.length === 0) {
    return null;
  }
  return Math.min(...group.memberRowNumbers);
};

/**
 * Detects value conflicts among members of a duplicate group.
 * A conflict occurs when members share a key identifier (e.g. email) but differ on other fields (e.g. phone).
 *
 * @param {object} group
 * @param {Map<number, object>} rowsMap
 * @returns {Array<object>} Array of detected field conflicts
 */
export const detectConflicts = (group, rowsMap) => {
  const conflicts = [];
  if (!group || !group.memberRowNumbers || group.memberRowNumbers.length <= 1) {
    return conflicts;
  }

  const memberRows = group.memberRowNumbers
    .map((num) => rowsMap.get(num))
    .filter(Boolean);

  // Check phone conflicts
  const phoneValues = new Set();
  for (const r of memberRows) {
    for (const [k, v] of Object.entries(r.cleaned || {})) {
      if (k.toLowerCase().includes('phone') || k.toLowerCase().includes('mobile')) {
        if (v && typeof v === 'string' && v.trim() !== '') {
          phoneValues.add(v.trim());
        }
      }
    }
  }
  if (phoneValues.size > 1) {
    conflicts.push({
      type: 'field_conflict',
      field: 'phone',
      fields: ['phone'],
      severity: IssueSeverity.WARNING,
      message: `Conflicting phone numbers detected among duplicate group members: ${Array.from(phoneValues).join(', ')}`,
      values: Array.from(phoneValues)
    });
  }

  // Check email conflicts
  const emailValues = new Set();
  for (const r of memberRows) {
    for (const [k, v] of Object.entries(r.cleaned || {})) {
      if (k.toLowerCase().includes('email') || k.toLowerCase().includes('mail')) {
        if (v && typeof v === 'string' && v.trim() !== '') {
          emailValues.add(v.trim().toLowerCase());
        }
      }
    }
  }
  if (emailValues.size > 1) {
    conflicts.push({
      type: 'field_conflict',
      field: 'email',
      fields: ['email'],
      severity: IssueSeverity.WARNING,
      message: `Conflicting email addresses detected among duplicate group members: ${Array.from(emailValues).join(', ')}`,
      values: Array.from(emailValues)
    });
  }

  // Check name conflicts
  const nameValues = new Set();
  for (const r of memberRows) {
    for (const [k, v] of Object.entries(r.cleaned || {})) {
      if (k.toLowerCase() === 'name' || k.toLowerCase().includes('name')) {
        if (v && typeof v === 'string' && v.trim() !== '') {
          nameValues.add(v.trim().toLowerCase());
        }
      }
    }
  }
  if (nameValues.size > 1) {
    conflicts.push({
      type: 'field_conflict',
      field: 'name',
      fields: ['name'],
      severity: IssueSeverity.WARNING,
      message: `Conflicting names detected among duplicate group members: ${Array.from(nameValues).join(', ')}`,
      values: Array.from(nameValues)
    });
  }

  return conflicts;
};

/**
 * Builds explicit pairwise relationships from each duplicate row to the canonical candidate row.
 *
 * @param {object} group
 * @returns {Array<object>}
 */
export const createDuplicateRelationships = (group) => {
  const relationships = [];
  const canonical = group.canonicalRowNumber;
  const primaryEvidence = group.evidence && group.evidence.length > 0
    ? group.evidence[0]
    : { type: 'exact_match', strength: 'strong', fields: ['email'] };

  for (const member of group.memberRowNumbers) {
    if (member !== canonical) {
      relationships.push({
        fromRow: member,
        toRow: canonical,
        relationship: 'duplicate_of',
        evidence: primaryEvidence
      });
    }
  }

  return relationships;
};

/**
 * Calculates aggregate duplicate metrics for a dataset.
 *
 * @param {Array<object>} groups
 * @param {number} totalRows
 * @returns {object}
 */
export const calculateDuplicateMetrics = (groups = [], totalRows = 0) => {
  const totalDuplicateGroups = groups.length;
  const deterministicDuplicateGroups = groups.filter(
    (g) => g.status === 'confirmed_deterministic'
  ).length;
  const potentialDuplicateGroups = groups.filter(
    (g) => g.status === 'potential_review'
  ).length;

  const duplicateRows = groups.reduce(
    (acc, g) => acc + (g.memberRowNumbers.length - 1),
    0
  );
  const canonicalRows = groups.length;
  const duplicatePairs = groups.reduce(
    (acc, g) => acc + (g.relationships ? g.relationships.length : g.memberRowNumbers.length - 1),
    0
  );
  const conflictCount = groups.reduce(
    (acc, g) => acc + (g.conflicts ? g.conflicts.length : 0),
    0
  );

  return {
    totalRows,
    totalDuplicateGroups,
    deterministicDuplicateGroups,
    potentialDuplicateGroups,
    duplicateRows,
    canonicalRows,
    duplicatePairs,
    conflictCount
  };
};

/**
 * Evaluates duplicate records across a dataset batch and produces duplicate groups,
 * relationships, canonical candidates, conflict signals, and metrics.
 *
 * @param {Array<object>} rowResults - Array of cleaned row result objects
 * @param {Map<string, string>|object} [columnTypeMap] - Mapping of column name to FieldType
 * @param {object} [options={}]
 * @returns {{ groups: Array<object>, metrics: object, duplicateRows: number, totalDuplicateGroups: number }}
 */
export const detectDuplicates = (rowResults, columnTypeMap, options = {}) => {
  if (!Array.isArray(rowResults) || rowResults.length === 0) {
    return {
      groups: [],
      metrics: calculateDuplicateMetrics([], 0),
      duplicateRows: 0,
      totalDuplicateGroups: 0
    };
  }

  const typeMap = columnTypeMap instanceof Map
    ? columnTypeMap
    : new Map(Object.entries(columnTypeMap || {}));

  const emailFields = [];
  const phoneFields = [];
  const nameFields = [];
  const locationFields = [];

  for (const [colName, type] of typeMap.entries()) {
    if (type === FieldType.EMAIL) emailFields.push(colName);
    if (type === FieldType.PHONE) phoneFields.push(colName);
    if (type === FieldType.NAME) nameFields.push(colName);
    if (type === FieldType.LOCATION) locationFields.push(colName);
  }

  // If column types weren't explicitly provided, infer heuristically from keys of first row
  if (emailFields.length === 0 && phoneFields.length === 0 && rowResults.length > 0) {
    for (const key of Object.keys(rowResults[0].cleaned || {})) {
      const lower = key.toLowerCase();
      if (lower.includes('email') || lower.includes('mail')) emailFields.push(key);
      else if (lower.includes('phone') || lower.includes('mobile') || lower.includes('cell')) phoneFields.push(key);
      else if (lower === 'name' || lower.includes('name')) nameFields.push(key);
      else if (lower === 'city' || lower === 'location' || lower === 'town') locationFields.push(key);
    }
  }

  const emailIndex = new Map(); // normalizedEmail -> [rowNumber]
  const phoneIndex = new Map(); // normalizedPhone -> [rowNumber]
  const nameLocationIndex = new Map(); // name|||loc -> [rowNumber]
  const rowsByNumber = new Map();

  for (const row of rowResults) {
    const rowNum = row.rowNumber;
    rowsByNumber.set(rowNum, row);

    let hasAnyEmail = false;
    for (const f of emailFields) {
      const val = row.cleaned?.[f];
      if (val && typeof val === 'string' && val.includes('@') && val.trim() !== '') {
        hasAnyEmail = true;
        const normalized = val.toLowerCase().trim();
        if (!emailIndex.has(normalized)) emailIndex.set(normalized, []);
        emailIndex.get(normalized).push(rowNum);
      }
    }

    let hasAnyPhone = false;
    for (const f of phoneFields) {
      const val = row.cleaned?.[f];
      if (val && typeof val === 'string' && val.trim() !== '') {
        const digits = val.replace(/\D/g, '');
        if (digits.length >= 7) {
          hasAnyPhone = true;
          const normalized = val.trim();
          if (!phoneIndex.has(normalized)) phoneIndex.set(normalized, []);
          phoneIndex.get(normalized).push(rowNum);
        }
      }
    }

    // LEVEL 4 — SAME NAME + SAME CITY
    // Condition: normalized name matches AND normalized city matches,
    // BUT email and phone are absent on this row
    if (!hasAnyEmail && !hasAnyPhone) {
      let nameVal = null;
      for (const f of nameFields) {
        const val = row.cleaned?.[f];
        if (val && typeof val === 'string' && val.trim() !== '') {
          nameVal = val.trim().toLowerCase();
          break;
        }
      }

      let locVal = null;
      for (const f of locationFields) {
        const val = row.cleaned?.[f];
        if (val && typeof val === 'string' && val.trim() !== '') {
          locVal = val.trim().toLowerCase();
          break;
        }
      }

      if (nameVal && locVal) {
        const key = `${nameVal}|||${locVal}`;
        if (!nameLocationIndex.has(key)) nameLocationIndex.set(key, []);
        nameLocationIndex.get(key).push(rowNum);
      }
    }
  }

  // Record pairwise matches
  const pairMatches = new Map();
  const getPairKey = (r1, r2) => (r1 < r2 ? `${r1}:${r2}` : `${r2}:${r1}`);

  const registerMatch = (r1, r2, type, value, field) => {
    if (r1 === r2) return;
    const key = getPairKey(r1, r2);
    const minRow = Math.min(r1, r2);
    const maxRow = Math.max(r1, r2);

    if (!pairMatches.has(key)) {
      pairMatches.set(key, {
        rowA: minRow,
        rowB: maxRow,
        matchedEmail: false,
        matchedPhone: false,
        matchedNameLocation: false,
        emailValues: new Set(),
        phoneValues: new Set()
      });
    }

    const match = pairMatches.get(key);
    if (type === 'email') {
      match.matchedEmail = true;
      if (value) match.emailValues.add(value);
    } else if (type === 'phone') {
      match.matchedPhone = true;
      if (value) match.phoneValues.add(value);
    } else if (type === 'name_location') {
      match.matchedNameLocation = true;
    }
  };

  for (const [email, rNums] of emailIndex.entries()) {
    if (rNums.length > 1) {
      for (let i = 0; i < rNums.length; i++) {
        for (let j = i + 1; j < rNums.length; j++) {
          registerMatch(rNums[i], rNums[j], 'email', email);
        }
      }
    }
  }

  for (const [phone, rNums] of phoneIndex.entries()) {
    if (rNums.length > 1) {
      for (let i = 0; i < rNums.length; i++) {
        for (let j = i + 1; j < rNums.length; j++) {
          registerMatch(rNums[i], rNums[j], 'phone', phone);
        }
      }
    }
  }

  for (const [, rNums] of nameLocationIndex.entries()) {
    if (rNums.length > 1) {
      for (let i = 0; i < rNums.length; i++) {
        for (let j = i + 1; j < rNums.length; j++) {
          registerMatch(rNums[i], rNums[j], 'name_location', null);
        }
      }
    }
  }

  // Cluster matched rows via DisjointSet
  const ds = new DisjointSet();
  for (const match of pairMatches.values()) {
    ds.union(match.rowA, match.rowB);
  }

  const clusters = new Map();
  for (const match of pairMatches.values()) {
    const root = ds.find(match.rowA);
    if (!clusters.has(root)) clusters.set(root, new Set());
    clusters.get(root).add(match.rowA);
    clusters.get(root).add(match.rowB);
  }

  // Build duplicate groups
  const groups = [];
  let groupCounter = 1;

  for (const clusterSet of clusters.values()) {
    if (clusterSet.size <= 1) continue;

    const memberRowNumbers = Array.from(clusterSet).sort((a, b) => a - b);
    const canonicalRowNumber = memberRowNumbers[0];

    // Find all pairwise matches belonging to this group
    const groupMatches = [];
    for (let i = 0; i < memberRowNumbers.length; i++) {
      for (let j = i + 1; j < memberRowNumbers.length; j++) {
        const key = getPairKey(memberRowNumbers[i], memberRowNumbers[j]);
        if (pairMatches.has(key)) {
          groupMatches.push(pairMatches.get(key));
        }
      }
    }

    const hasBoth = groupMatches.some((m) => m.matchedEmail && m.matchedPhone);
    const hasEmail = groupMatches.some((m) => m.matchedEmail);
    const hasPhone = groupMatches.some((m) => m.matchedPhone);
    const hasNameLoc = groupMatches.some((m) => m.matchedNameLocation);

    const groupEvidence = [];
    if (hasBoth) {
      groupEvidence.push({
        type: 'exact_email_and_phone',
        strength: 'very_strong',
        fields: ['email', 'phone']
      });
    } else if (hasEmail && hasPhone) {
      groupEvidence.push({
        type: 'exact_email',
        strength: 'strong',
        fields: ['email']
      });
      groupEvidence.push({
        type: 'exact_phone',
        strength: 'strong',
        fields: ['phone']
      });
    } else if (hasEmail) {
      groupEvidence.push({
        type: 'exact_email',
        strength: 'strong',
        fields: ['email']
      });
    } else if (hasPhone) {
      groupEvidence.push({
        type: 'exact_phone',
        strength: 'strong',
        fields: ['phone']
      });
    } else if (hasNameLoc) {
      groupEvidence.push({
        type: 'same_name_and_location',
        strength: 'medium',
        fields: ['name', 'city']
      });
    }

    const isOnlyNameLocation =
      groupEvidence.length > 0 &&
      groupEvidence.every((e) => e.type === 'same_name_and_location');
    const status = isOnlyNameLocation ? 'potential_review' : 'confirmed_deterministic';
    let requiresReview = isOnlyNameLocation;

    const group = {
      groupId: `DUP-${String(groupCounter++).padStart(4, '0')}`,
      canonicalRowNumber,
      memberRowNumbers,
      status,
      requiresReview,
      evidence: groupEvidence,
      conflicts: [],
      relationships: []
    };

    // Detect field conflicts among member records
    const conflicts = detectConflicts(group, rowsByNumber);
    if (conflicts.length > 0) {
      group.conflicts = conflicts;
      group.requiresReview = true;
    }

    // Build pairwise relationships
    group.relationships = createDuplicateRelationships(group);
    groups.push(group);

    // Annotate member rows
    const primaryEvidence = groupEvidence[0] || {
      type: 'exact_match',
      strength: 'strong',
      fields: ['email']
    };

    // Canonical candidate row
    const canonicalRow = rowsByNumber.get(canonicalRowNumber);
    if (canonicalRow) {
      canonicalRow.duplicateInfo = {
        isDuplicate: false,
        isCanonical: true,
        groupId: group.groupId,
        canonicalRowNumber,
        duplicateOfRow: null,
        relationship: 'canonical_candidate',
        status: group.status,
        type: primaryEvidence.type,
        confidence: 'deterministic',
        evidence: group.evidence,
        conflicts: group.conflicts,
        requiresReview: group.requiresReview
      };

      if (group.conflicts.length > 0) {
        for (const c of group.conflicts) {
          canonicalRow.issues.push(
            createIssue({
              field: c.field,
              rule: 'duplicate.field_conflict',
              category: IssueCategory.FIELD_CONFLICT,
              message: c.message,
              severity: IssueSeverity.WARNING,
              value: c.values
            })
          );
        }
      }
    }

    // Duplicate member rows
    for (const dupNum of memberRowNumbers.slice(1)) {
      const dupRow = rowsByNumber.get(dupNum);
      if (!dupRow) continue;

      dupRow.duplicateInfo = {
        isDuplicate: true,
        isCanonical: false,
        groupId: group.groupId,
        canonicalRowNumber,
        duplicateOfRow: canonicalRowNumber,
        relationship: 'duplicate_of',
        status: group.status,
        type: primaryEvidence.type,
        confidence: 'deterministic',
        evidence: group.evidence,
        conflicts: group.conflicts,
        requiresReview: group.requiresReview,
        matchedValues: dupRow.cleaned
      };

      dupRow.issues.push(
        createIssue({
          field: primaryEvidence.fields.join(', '),
          rule: 'duplicate.detect',
          category: IssueCategory.DUPLICATE_SUSPECT,
          message: `Suspected duplicate of row ${canonicalRowNumber} (matched ${primaryEvidence.type})`,
          severity: IssueSeverity.WARNING,
          value: dupRow.cleaned
        })
      );

      if (group.conflicts.length > 0) {
        for (const c of group.conflicts) {
          dupRow.issues.push(
            createIssue({
              field: c.field,
              rule: 'duplicate.field_conflict',
              category: IssueCategory.FIELD_CONFLICT,
              message: c.message,
              severity: IssueSeverity.WARNING,
              value: c.values
            })
          );
        }
      }
    }
  }

  const metrics = calculateDuplicateMetrics(groups, rowResults.length);

  return {
    groups,
    metrics,
    duplicateRows: metrics.duplicateRows,
    totalDuplicateGroups: metrics.totalDuplicateGroups,
    deterministicDuplicateGroups: metrics.deterministicDuplicateGroups,
    potentialDuplicateGroups: metrics.potentialDuplicateGroups,
    canonicalRows: metrics.canonicalRows,
    duplicatePairs: metrics.duplicatePairs,
    conflictCount: metrics.conflictCount
  };
};

/**
 * Backward-compatible streaming duplicate detector class for single-row evaluation.
 */
export class DuplicateDetector {
  constructor(columnTypeMap) {
    this.columnTypeMap = columnTypeMap || new Map();
    this.emailFields = [];
    this.phoneFields = [];
    this.nameFields = [];
    this.locationFields = [];

    const entries = this.columnTypeMap instanceof Map
      ? this.columnTypeMap.entries()
      : Object.entries(this.columnTypeMap || {});

    for (const [colName, type] of entries) {
      if (type === FieldType.EMAIL) this.emailFields.push(colName);
      if (type === FieldType.PHONE) this.phoneFields.push(colName);
      if (type === FieldType.NAME) this.nameFields.push(colName);
      if (type === FieldType.LOCATION) this.locationFields.push(colName);
    }

    this.emailIndex = new Map();
    this.phoneIndex = new Map();
    this.nameLocationIndex = new Map();
  }

  evaluateRow(rowResult) {
    const { rowNumber, cleaned } = rowResult;

    let matchedEmail = null;
    let emailDuplicateOf = null;
    let emailFieldMatched = null;

    for (const field of this.emailFields) {
      const emailVal = cleaned[field];
      if (emailVal && typeof emailVal === 'string' && emailVal.includes('@')) {
        const key = emailVal.toLowerCase().trim();
        if (this.emailIndex.has(key)) {
          matchedEmail = key;
          emailDuplicateOf = this.emailIndex.get(key);
          emailFieldMatched = field;
          break;
        }
      }
    }

    let matchedPhone = null;
    let phoneDuplicateOf = null;
    let phoneFieldMatched = null;

    for (const field of this.phoneFields) {
      const phoneVal = cleaned[field];
      if (phoneVal && typeof phoneVal === 'string' && /^\d{10}$/.test(phoneVal)) {
        const key = phoneVal;
        if (this.phoneIndex.has(key)) {
          matchedPhone = key;
          phoneDuplicateOf = this.phoneIndex.get(key);
          phoneFieldMatched = field;
          break;
        }
      }
    }

    let duplicateInfo = null;

    // Both email and phone match
    if (matchedEmail && matchedPhone && emailDuplicateOf === phoneDuplicateOf) {
      duplicateInfo = {
        isDuplicate: true,
        type: 'exact_email_and_phone',
        confidence: 'deterministic',
        fields: [emailFieldMatched, phoneFieldMatched],
        duplicateOfRow: emailDuplicateOf,
        canonicalRowNumber: emailDuplicateOf,
        matchedValues: { email: matchedEmail, phone: matchedPhone },
        status: 'confirmed_deterministic',
        requiresReview: false,
        conflicts: []
      };
    } else if (matchedEmail) {
      duplicateInfo = {
        isDuplicate: true,
        type: 'exact_email',
        confidence: 'deterministic',
        fields: [emailFieldMatched],
        duplicateOfRow: emailDuplicateOf,
        canonicalRowNumber: emailDuplicateOf,
        matchedValues: { email: matchedEmail },
        status: 'confirmed_deterministic',
        requiresReview: false,
        conflicts: []
      };
    } else if (matchedPhone) {
      duplicateInfo = {
        isDuplicate: true,
        type: 'exact_phone',
        confidence: 'deterministic',
        fields: [phoneFieldMatched],
        duplicateOfRow: phoneDuplicateOf,
        canonicalRowNumber: phoneDuplicateOf,
        matchedValues: { phone: matchedPhone },
        status: 'confirmed_deterministic',
        requiresReview: false,
        conflicts: []
      };
    }

    if (duplicateInfo) {
      rowResult.duplicateInfo = duplicateInfo;
      rowResult.issues.push(
        createIssue({
          field: duplicateInfo.fields.join(', '),
          rule: 'duplicate.detect',
          category: IssueCategory.DUPLICATE_SUSPECT,
          message: `Suspected duplicate of row ${duplicateInfo.duplicateOfRow} (matched ${duplicateInfo.type})`,
          severity: IssueSeverity.WARNING,
          value: duplicateInfo.matchedValues
        })
      );
    } else {
      for (const field of this.emailFields) {
        const emailVal = cleaned[field];
        if (emailVal && typeof emailVal === 'string' && emailVal.includes('@')) {
          this.emailIndex.set(emailVal.toLowerCase().trim(), rowNumber);
        }
      }
      for (const field of this.phoneFields) {
        const phoneVal = cleaned[field];
        if (phoneVal && typeof phoneVal === 'string' && /^\d{10}$/.test(phoneVal)) {
          this.phoneIndex.set(phoneVal, rowNumber);
        }
      }
    }

    return duplicateInfo;
  }
}

/**
 * Convenience function to process a batch of cleaned rows and annotate duplicates.
 *
 * @param {Array<object>} rowResults
 * @param {Map<string, string>} columnTypeMap
 * @param {object} [options={}]
 * @returns {number} Count of duplicate rows identified
 */
export const annotateDuplicates = (rowResults, columnTypeMap, options = {}) => {
  const result = detectDuplicates(rowResults, columnTypeMap, options);
  return result.duplicateRows;
};

export default {
  DisjointSet,
  selectCanonicalCandidate,
  detectConflicts,
  createDuplicateRelationships,
  calculateDuplicateMetrics,
  detectDuplicates,
  DuplicateDetector,
  annotateDuplicates
};
