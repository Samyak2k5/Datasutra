import fs from 'fs';
import readline from 'readline';
import { parse as csvParse } from 'csv-parse';
import env from '../config/env.js';
import ApiError from '../utils/apiError.js';
import rulePipeline from '../cleaning/pipeline/rulePipeline.js';
import aiCleaningService from '../ai/aiCleaning.service.js';
import { processHeaders } from '../parsers/csv.parser.js';

/**
 * Generator that streams batches of rows from a CSV file.
 *
 * @param {string} filePath
 * @param {number} batchSize
 * @returns {AsyncGenerator<{ batchRows: Array<object>, headers: string[], columns: object[] }>}
 */
export async function* streamCsvBatches(filePath, batchSize = 500) {
  const stream = fs.createReadStream(filePath);
  const parser = stream.pipe(
    csvParse({
      bom: true,
      relax_column_count: true,
      skip_empty_lines: true,
      trim: false
    })
  );

  let rawHeaders = null;
  let processed = null;
  let currentBatch = [];
  let rowCount = 0;

  for await (const record of parser) {
    if (!rawHeaders) {
      rawHeaders = record;
      processed = processHeaders(rawHeaders);
      continue;
    }

    rowCount++;
    const rowObj = {
      _rowNumber: rowCount + 1,
      _provenance: {
        sourceType: 'csv',
        sourceRow: rowCount + 1
      }
    };

    processed.headers.forEach((hName, idx) => {
      const val = record[idx];
      rowObj[hName] = val !== undefined && val !== null ? val : '';
    });

    currentBatch.push(rowObj);

    if (currentBatch.length >= batchSize) {
      yield {
        batchRows: currentBatch,
        headers: processed.headers,
        columns: processed.columns
      };
      currentBatch = [];
    }
  }

  if (currentBatch.length > 0 && processed) {
    yield {
      batchRows: currentBatch,
      headers: processed.headers,
      columns: processed.columns
    };
  }
}

/**
 * Generator that streams batches of rows from an NDJSON / JSON Lines file.
 *
 * @param {string} filePath
 * @param {number} batchSize
 * @returns {AsyncGenerator<{ batchRows: Array<object>, headers: string[], columns: object[] }>}
 */
export async function* streamNdjsonBatches(filePath, batchSize = 500) {
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let currentBatch = [];
  let rowCount = 0;
  let allKeysSet = new Set();
  let processed = null;

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let item;
    try {
      item = JSON.parse(trimmed);
    } catch {
      continue;
    }

    rowCount++;
    Object.keys(item).forEach((k) => allKeysSet.add(k));

    currentBatch.push({
      item,
      rowNumber: rowCount
    });

    if (currentBatch.length >= batchSize) {
      if (!processed) {
        processed = processHeaders(Array.from(allKeysSet));
      }

      const rows = currentBatch.map(({ item: it, rowNumber: rNum }) => {
        const rowObj = {
          _rowNumber: rNum + 1,
          _provenance: { sourceType: 'json', line: rNum, sourceRow: rNum }
        };
        processed.headers.forEach((h) => {
          const v = it[h];
          rowObj[h] = v !== undefined && v !== null ? (typeof v === 'object' ? JSON.stringify(v) : v) : '';
        });
        return rowObj;
      });

      yield { batchRows: rows, headers: processed.headers, columns: processed.columns };
      currentBatch = [];
    }
  }

  if (currentBatch.length > 0) {
    if (!processed) {
      processed = processHeaders(Array.from(allKeysSet));
    }

    const rows = currentBatch.map(({ item: it, rowNumber: rNum }) => {
      const rowObj = {
        _rowNumber: rNum + 1,
        _provenance: { sourceType: 'json', line: rNum, sourceRow: rNum }
      };
      processed.headers.forEach((h) => {
        const v = it[h];
        rowObj[h] = v !== undefined && v !== null ? (typeof v === 'object' ? JSON.stringify(v) : v) : '';
      });
      return rowObj;
    });

    yield { batchRows: rows, headers: processed.headers, columns: processed.columns };
  }
}

/**
 * Generator that yields slices of in-memory rows in bounded batches.
 *
 * @param {Array<object>} rows
 * @param {Array<object>} columns
 * @param {number} batchSize
 * @returns {AsyncGenerator<{ batchRows: Array<object>, headers: string[], columns: object[] }>}
 */
export async function* sliceBatches(rows, columns, batchSize = 500) {
  const headers = columns.map((c) => (typeof c === 'string' ? c : c.name));
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    yield {
      batchRows: chunk,
      headers,
      columns
    };
  }
}

/**
 * Executes bounded batch processing on a dataset.
 * Runs deterministic cleaning, duplicate tracking, missing data handling,
 * and passes ONLY unresolved items from each batch to AI.
 *
 * @param {object} params
 * @param {string} params.filePath
 * @param {string} params.format
 * @param {Array<object>} [params.inMemoryRows]
 * @param {Array<object>} [params.columns]
 * @param {number} [params.totalExpectedRows]
 * @param {number} [params.batchSize]
 * @param {string} [params.cleaningMode] - 'rules_only' | 'rules_then_ai'
 * @param {object} [params.options]
 * @param {Function} [params.onProgress] - async callback (progress) => {}
 * @returns {Promise<object>} Consolidated job metrics & preview (never whole dataset in RAM)
 */
export const processDatasetInBatches = async ({
  filePath,
  format,
  inMemoryRows = null,
  columns = [],
  totalExpectedRows = 0,
  batchSize = env.batchSize || 500,
  cleaningMode = 'rules_only',
  options = {},
  onProgress = null
}) => {
  let batchGenerator;

  if (inMemoryRows && inMemoryRows.length > 0) {
    batchGenerator = sliceBatches(inMemoryRows, columns, batchSize);
  } else if (format === 'csv') {
    batchGenerator = streamCsvBatches(filePath, batchSize);
  } else if (format === 'ndjson' || format === 'jsonl') {
    batchGenerator = streamNdjsonBatches(filePath, batchSize);
  } else {
    // For other formats, if inMemoryRows was not pre-parsed, load via parser
    const { parserRegistry } = await import('../parsers/parser.registry.js');
    const parsed = await parserRegistry.parseToStructuredRecords(filePath, { fileType: format });
    batchGenerator = sliceBatches(parsed.rows, parsed.columns, batchSize);
    if (!totalExpectedRows) totalExpectedRows = parsed.totalRows;
    columns = parsed.columns;
  }

  // Consolidated Metrics Accumulator
  const aggregatedMetrics = {
    totalRows: 0,
    cleanRows: 0,
    modifiedRows: 0,
    reviewRows: 0,
    invalidRows: 0,
    duplicateRows: 0,
    totalDuplicateGroups: 0,
    deterministicDuplicateGroups: 0,
    potentialDuplicateGroups: 0,
    canonicalRows: 0,
    duplicatePairs: 0,
    conflictCount: 0,
    missingValueCount: 0,
    rowsWithMissingValues: 0,
    resolvedMissingValues: 0,
    unresolvedMissingValues: 0,
    missingConflicts: 0,
    imputedFieldCount: 0,
    fieldsImputed: {},
    changedFieldCount: 0,
    aiCandidates: 0,
    aiProcessed: 0,
    aiSuggestions: 0,
    aiApplied: 0,
    aiNeedsReview: 0,
    aiRejected: 0,
    aiFailed: 0,
    aiProvider: null,
    aiModel: null,
    aiUsage: {
      requestCount: 0,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null
    }
  };

  const preview = [];
  const allDuplicateGroups = [];
  let batchIndex = 0;
  let processedRecords = 0;
  const totalBatches = totalExpectedRows > 0 ? Math.ceil(totalExpectedRows / batchSize) : 0;

  for await (const { batchRows, columns: batchCols } of batchGenerator) {
    batchIndex++;
    const currentCols = columns.length > 0 ? columns : batchCols;

    // 1. Process deterministic rules on this batch (Step 7–9)
    const batchResult = rulePipeline.processDatasetRows(batchRows, currentCols, options);

    // 2. If rules_then_ai, process strictly unresolved candidates FROM THIS BATCH (Step 10)
    if (cleaningMode === 'rules_then_ai') {
      try {
        const aiResult = await aiCleaningService.processUnresolvedWithAI(
          batchResult.rows,
          batchResult.fieldTypes,
          options
        );

        // Merge AI batch metrics
        aggregatedMetrics.aiCandidates += aiResult.aiMetrics.aiCandidates || 0;
        aggregatedMetrics.aiProcessed += aiResult.aiMetrics.aiProcessed || 0;
        aggregatedMetrics.aiSuggestions += aiResult.aiMetrics.aiSuggestions || 0;
        aggregatedMetrics.aiApplied += aiResult.aiMetrics.aiApplied || 0;
        aggregatedMetrics.aiNeedsReview += aiResult.aiMetrics.aiNeedsReview || 0;
        aggregatedMetrics.aiRejected += aiResult.aiMetrics.aiRejected || 0;
        aggregatedMetrics.aiFailed += aiResult.aiMetrics.aiFailed || 0;
        aggregatedMetrics.aiProvider = aiResult.aiMetrics.aiProvider || aggregatedMetrics.aiProvider;
        aggregatedMetrics.aiModel = aiResult.aiMetrics.aiModel || aggregatedMetrics.aiModel;

        if (aiResult.aiMetrics.aiUsage) {
          aggregatedMetrics.aiUsage.requestCount += aiResult.aiMetrics.aiUsage.requestCount || 0;
          if (aiResult.aiMetrics.aiUsage.inputTokens) {
            aggregatedMetrics.aiUsage.inputTokens = (aggregatedMetrics.aiUsage.inputTokens || 0) + aiResult.aiMetrics.aiUsage.inputTokens;
          }
          if (aiResult.aiMetrics.aiUsage.outputTokens) {
            aggregatedMetrics.aiUsage.outputTokens = (aggregatedMetrics.aiUsage.outputTokens || 0) + aiResult.aiMetrics.aiUsage.outputTokens;
          }
          if (aiResult.aiMetrics.aiUsage.totalTokens) {
            aggregatedMetrics.aiUsage.totalTokens = (aggregatedMetrics.aiUsage.totalTokens || 0) + aiResult.aiMetrics.aiUsage.totalTokens;
          }
        }

        // Re-evaluate row classification for modified items
        if (aiResult.aiMetrics.aiApplied > 0) {
          batchResult.metrics.cleanRows = 0;
          batchResult.metrics.modifiedRows = 0;
          batchResult.metrics.reviewRows = 0;
          batchResult.metrics.invalidRows = 0;

          for (const r of batchResult.rows) {
            switch (r.classification) {
              case 'clean':
                batchResult.metrics.cleanRows++;
                break;
              case 'modified':
                batchResult.metrics.modifiedRows++;
                break;
              case 'needs_review':
                batchResult.metrics.reviewRows++;
                break;
              case 'invalid':
                batchResult.metrics.invalidRows++;
                break;
            }
          }
          batchResult.metrics.changedFieldCount += aiResult.aiMetrics.aiApplied;
        }
      } catch (aiErr) {
        aggregatedMetrics.aiFailed++;
      }
    }

    // 3. Accumulate batch metrics into global metrics
    aggregatedMetrics.totalRows += batchResult.metrics.totalRows;
    aggregatedMetrics.cleanRows += batchResult.metrics.cleanRows;
    aggregatedMetrics.modifiedRows += batchResult.metrics.modifiedRows;
    aggregatedMetrics.reviewRows += batchResult.metrics.reviewRows;
    aggregatedMetrics.invalidRows += batchResult.metrics.invalidRows;
    aggregatedMetrics.duplicateRows += batchResult.metrics.duplicateRows;
    aggregatedMetrics.totalDuplicateGroups += batchResult.metrics.totalDuplicateGroups || 0;
    aggregatedMetrics.missingValueCount += batchResult.metrics.missingValueCount;
    aggregatedMetrics.rowsWithMissingValues += batchResult.metrics.rowsWithMissingValues || 0;
    aggregatedMetrics.resolvedMissingValues += batchResult.metrics.resolvedMissingValues || 0;
    aggregatedMetrics.unresolvedMissingValues += batchResult.metrics.unresolvedMissingValues || 0;
    aggregatedMetrics.missingConflicts += batchResult.metrics.missingConflicts || 0;
    aggregatedMetrics.imputedFieldCount += batchResult.metrics.imputedFieldCount || 0;
    aggregatedMetrics.changedFieldCount += batchResult.metrics.changedFieldCount || 0;

    // Collect bounded preview from the first batch
    if (preview.length < 20) {
      const needed = 20 - preview.length;
      preview.push(...batchResult.rows.slice(0, needed));
    }

    // Collect sample duplicate groups (capped at 20 groups to protect DB size)
    if (batchResult.duplicateGroups && allDuplicateGroups.length < 20) {
      allDuplicateGroups.push(...batchResult.duplicateGroups.slice(0, 20 - allDuplicateGroups.length));
    }

    processedRecords += batchRows.length;
    const progressPercent = totalExpectedRows > 0 ? Math.min(100, Math.round((processedRecords / totalExpectedRows) * 100)) : 100;

    // 4. Report progress callback
    if (onProgress) {
      await onProgress({
        processedRecords,
        totalRecords: totalExpectedRows || processedRecords,
        currentBatch: batchIndex,
        totalBatches: totalBatches || batchIndex,
        progressPercent,
        batchSize
      });
    }

    // Explicitly release batchRows from memory
    batchResult.rows = null;
  }

  return {
    metrics: aggregatedMetrics,
    preview,
    duplicateGroups: allDuplicateGroups,
    processedRecords,
    totalBatches: batchIndex
  };
};

export default {
  streamCsvBatches,
  streamNdjsonBatches,
  sliceBatches,
  processDatasetInBatches
};
