/**
 * DataSutra Quality Analytics & Reporting Service (Step 12)
 *
 * Provides transparent, explainable data quality scoring, field-level analytics,
 * duplicate breakdown, missing data audit, and transformation logs.
 */

/**
 * Computes a transparent, explainable data quality score and multidimensional analytics.
 *
 * @param {Object} params
 * @param {Object} params.metrics - Aggregated cleaning metrics from rule engine / batch processor
 * @param {Array} params.rows - Sample/preview or full cleaned rows
 * @param {Array} params.columns - Dataset columns array
 * @param {Array} params.duplicateGroups - Duplicate groups identified
 * @param {Object} params.dataset - Associated Dataset document
 * @param {Object} [params.options] - Cleaning options
 * @returns {Object} Quality analytics object with scores, dimensions, field breakdowns
 */
export function computeDataQualityAnalytics({
  metrics,
  rows = [],
  columns = [],
  duplicateGroups = [],
  dataset = {},
  options = {}
}) {
  const totalRows = metrics.totalRows || dataset.totalRows || rows.length || 1;
  const colList = Array.isArray(columns) && columns.length > 0
    ? columns.map((c) => (typeof c === 'string' ? c : c.name || c.key))
    : (rows.length > 0 && rows[0].cleaned ? Object.keys(rows[0].cleaned) : []);
  
  const totalColumns = colList.length || 1;
  const totalFieldCells = totalRows * totalColumns;

  // 1. Measurable Dimensions (0 - 100)
  // Completeness: proportion of cells that are not empty/missing (unresolved)
  const unresolvedMissing = metrics.unresolvedMissingValues ?? (metrics.missingValueCount - (metrics.resolvedMissingValues || 0));
  const safeUnresolvedMissing = Math.max(0, Math.min(totalFieldCells, unresolvedMissing || 0));
  const completeness = totalFieldCells > 0
    ? Math.max(0, Math.min(100, Math.round(((totalFieldCells - safeUnresolvedMissing) / totalFieldCells) * 1000) / 10))
    : 100;

  // Validity: proportion of records without structural/syntax errors
  const invalidRows = metrics.invalidRows || 0;
  const validity = totalRows > 0
    ? Math.max(0, Math.min(100, Math.round(((totalRows - Math.min(totalRows, invalidRows)) / totalRows) * 1000) / 10))
    : 100;

  // Uniqueness: proportion of records that are distinct non-duplicates
  const duplicateRows = metrics.duplicateRows || 0;
  const uniqueness = totalRows > 0
    ? Math.max(0, Math.min(100, Math.round(((totalRows - Math.min(totalRows, duplicateRows)) / totalRows) * 1000) / 10))
    : 100;

  // Consistency: proportion of records free from conflict issues or ambiguous review flags
  const conflictCount = metrics.missingConflicts || metrics.conflictCount || 0;
  const reviewRows = metrics.reviewRows || 0;
  const inconsistentCount = Math.min(totalRows, conflictCount + reviewRows);
  const consistency = totalRows > 0
    ? Math.max(0, Math.min(100, Math.round(((totalRows - inconsistentCount) / totalRows) * 1000) / 10))
    : 100;

  // Transparent Weighted Overall Score
  // Weights: Completeness (30%), Validity (30%), Uniqueness (20%), Consistency (20%)
  const weights = {
    completeness: 0.30,
    validity: 0.30,
    uniqueness: 0.20,
    consistency: 0.20
  };

  const overallScore = Math.round(
    (completeness * weights.completeness +
      validity * weights.validity +
      uniqueness * weights.uniqueness +
      consistency * weights.consistency) *
      10
  ) / 10;

  const qualityScore = {
    overall: overallScore,
    completeness,
    validity,
    uniqueness,
    consistency,
    dimensions: {
      completeness: {
        score: completeness,
        weight: '30%',
        formula: '100 * ((TotalCells - UnresolvedMissing) / TotalCells)',
        metricDetails: `${totalFieldCells - safeUnresolvedMissing} of ${totalFieldCells} cells populated`
      },
      validity: {
        score: validity,
        weight: '30%',
        formula: '100 * ((TotalRows - InvalidRows) / TotalRows)',
        metricDetails: `${totalRows - Math.min(totalRows, invalidRows)} of ${totalRows} rows syntax-valid`
      },
      uniqueness: {
        score: uniqueness,
        weight: '20%',
        formula: '100 * ((TotalRows - DuplicateRows) / TotalRows)',
        metricDetails: `${totalRows - Math.min(totalRows, duplicateRows)} of ${totalRows} records unique`
      },
      consistency: {
        score: consistency,
        weight: '20%',
        formula: '100 * ((TotalRows - (Conflicts + ReviewRows)) / TotalRows)',
        metricDetails: `${totalRows - inconsistentCount} of ${totalRows} rows conflict-free`
      }
    },
    explanation: 'The DataSutra Data Quality Score is a deterministic, weighted aggregate calculated from measurable dimensions: Completeness (30%), Validity (30%), Uniqueness (20%), and Consistency (20%). It contains no black-box multipliers.'
  };

  // 2. Field-Level Quality Analytics
  const fieldQuality = colList.map((colName) => {
    let missingCount = 0;
    let invalidCount = 0;
    let modifiedCount = 0;
    let reviewCount = 0;

    // Scan sample/preview rows for field-level telemetry
    for (const r of rows) {
      const issues = r.issues || [];
      const changes = r.changes || [];
      
      const fieldIssues = issues.filter((iss) => iss.field === colName);
      const fieldChanges = changes.filter((chg) => chg.field === colName);

      if (fieldChanges.length > 0) modifiedCount++;
      if (fieldIssues.some((i) => i.category === 'missing_value')) missingCount++;
      if (fieldIssues.some((i) => i.severity === 'error' || i.category === 'invalid_format')) invalidCount++;
      if (fieldIssues.some((i) => i.severity === 'warning' || i.category === 'ambiguous_value')) reviewCount++;
    }

    const sampleTotal = rows.length || totalRows;
    const cleanInSample = Math.max(0, sampleTotal - missingCount - invalidCount);
    const fieldQualityPercent = sampleTotal > 0
      ? Math.round((cleanInSample / sampleTotal) * 1000) / 10
      : 100;

    const fieldCompleteness = sampleTotal > 0
      ? Math.round(((sampleTotal - missingCount) / sampleTotal) * 1000) / 10
      : 100;
    const fieldValidity = sampleTotal > 0
      ? Math.round(((sampleTotal - invalidCount) / sampleTotal) * 1000) / 10
      : 100;

    return {
      field: colName,
      name: colName,
      total: sampleTotal,
      missing: missingCount,
      invalid: invalidCount,
      modified: modifiedCount,
      needsReview: reviewCount,
      qualityPercent: fieldQualityPercent,
      completeness: fieldCompleteness,
      validity: fieldValidity
    };
  });

  // 3. Duplicate Analytics Report
  const duplicateReport = {
    totalGroups: metrics.totalDuplicateGroups || duplicateGroups.length || 0,
    duplicateRows: metrics.duplicateRows || 0,
    canonicalRows: metrics.canonicalRows || Math.max(0, (metrics.totalRows || totalRows) - (metrics.duplicateRows || 0)),
    deterministicGroups: metrics.deterministicDuplicateGroups || 0,
    potentialGroups: metrics.potentialDuplicateGroups || 0,
    conflictCount: metrics.conflictCount || 0,
    groups: duplicateGroups.map((g) => ({
      groupId: g.groupId,
      status: g.status,
      canonicalRow: g.canonicalRow,
      members: g.members,
      evidence: g.evidence,
      requiresReview: g.requiresReview || false,
      conflicts: g.conflicts || []
    }))
  };

  // 4. Missing Data Analytics Report
  const missingReport = {
    missingValueCount: metrics.missingValueCount || 0,
    rowsWithMissingValues: metrics.rowsWithMissingValues || 0,
    resolvedMissingValues: metrics.resolvedMissingValues || 0,
    unresolvedMissingValues: safeUnresolvedMissing,
    missingConflicts: metrics.missingConflicts || 0,
    fieldsImputed: metrics.fieldsImputed || {},
    imputedFieldCount: metrics.imputedFieldCount || 0
  };

  // 5. AI Analytics Report
  const aiReport = {
    aiCandidates: metrics.aiCandidates || 0,
    aiProcessed: metrics.aiProcessed || 0,
    aiSuggestions: metrics.aiSuggestions || 0,
    aiApplied: metrics.aiApplied || 0,
    aiRejected: metrics.aiRejected || 0,
    aiNeedsReview: metrics.aiNeedsReview || 0,
    aiFailed: metrics.aiFailed || 0,
    aiProvider: metrics.aiProvider || null,
    aiModel: metrics.aiModel || null,
    aiUsage: {
      inputTokens: metrics.aiUsage?.inputTokens ?? null,
      outputTokens: metrics.aiUsage?.outputTokens ?? null,
      totalTokens: metrics.aiUsage?.totalTokens ?? null,
      requestCount: metrics.aiUsage?.requestCount || 0
    }
  };

  // 6. Chronological Transformation Log
  const transformationLog = [];
  for (const r of rows) {
    if (Array.isArray(r.changes)) {
      for (const chg of r.changes) {
        transformationLog.push({
          rowNumber: r.rowNumber,
          field: chg.field,
          originalValue: chg.originalValue,
          cleanedValue: chg.cleanedValue,
          rule: chg.rule,
          source: chg.source || 'rule_engine',
          reason: chg.reason || 'Standardized by rule engine',
          evidenceLevel: chg.evidenceLevel || 'deterministic',
          timestamp: chg.timestamp || new Date().toISOString(),
          provenance: r.provenance || null
        });
      }
    }
  }

  return {
    qualityScore,
    fieldQuality,
    duplicateReport,
    missingReport,
    aiReport,
    transformationLog
  };
}

export default {
  computeDataQualityAnalytics
};
