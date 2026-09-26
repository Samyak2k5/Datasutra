import env from '../config/env.js';
import { extractUnresolvedItems, chunkItemsIntoBatches } from './aiContext.builder.js';
import { getAIProvider } from './providers/index.js';
import { AIAction, aiSuggestionItemSchema, AISafetyStatus } from './schemas/aiCleaningResult.schema.js';
import { evaluateAISuggestionSafety } from './aiSafety.service.js';
import { createChange, createIssue, IssueCategory, IssueSeverity } from '../cleaning/schemas/cleaningResult.schema.js';
import { classifyRow } from '../cleaning/pipeline/rulePipeline.js';

/**
 * Executes an async operation with bounded retries and exponential backoff.
 *
 * @param {Function} fn - Async operation returning promise
 * @param {number} maxRetries
 * @param {number} timeoutMs
 * @returns {Promise<any>}
 */
export const executeWithRetry = async (fn, maxRetries = 2, timeoutMs = 15000) => {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let timerId;
    try {
      const timeoutPromise = new Promise((_, reject) => {
        timerId = setTimeout(() => {
          const err = new Error(`AI operation timed out after ${timeoutMs}ms`);
          err.code = 'TIMEOUT';
          reject(err);
        }, timeoutMs);
      });

      const result = await Promise.race([fn(), timeoutPromise]);
      clearTimeout(timerId);
      return result;
    } catch (err) {
      if (timerId) clearTimeout(timerId);
      lastError = err;
      if (attempt < maxRetries) {
        const delay = Math.min(50 * Math.pow(2, attempt), 1000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
};

/**
 * Processes unresolved records and fields using the configured AI provider.
 * Enforces Zod validation, deterministic safety evaluations, token conservation,
 * and comprehensive provenance tracking.
 *
 * @param {Array<object>} cleanedRows - Dataset rows after Step 7-9 cleaning
 * @param {Map<string, string>} [columnTypeMap] - Column types
 * @param {object} [options={}] - Options (aiProvider, aiModel, custom provider instance, etc.)
 * @returns {Promise<{
 *   rows: Array<object>,
 *   aiMetrics: object,
 *   aiSummary: object
 * }>}
 */
export const processUnresolvedWithAI = async (
  cleanedRows = [],
  columnTypeMap,
  options = {}
) => {
  const provider = options.aiProviderInstance || getAIProvider(options.aiProvider, options);
  const batchSize = options.aiBatchSize || env.aiBatchSize || 10;
  const maxRetries = options.aiMaxRetries !== undefined ? options.aiMaxRetries : env.aiMaxRetries;
  const timeoutMs = options.aiTimeoutMs || env.aiTimeoutMs || 15000;

  // 1. Extract ONLY unresolved items (token efficiency requirement)
  const unresolvedItems = extractUnresolvedItems(cleanedRows, options);

  const aiMetrics = {
    aiCandidates: unresolvedItems.length,
    aiProcessed: 0,
    aiSuggestions: 0,
    aiApplied: 0,
    aiNeedsReview: 0,
    aiRejected: 0,
    aiFailed: 0,
    aiProvider: provider.name,
    aiModel: provider.modelName,
    aiUsage: {
      requestCount: 0,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null
    }
  };

  const aiSummary = {
    applied: [],
    rejected: [],
    needsReview: []
  };

  if (unresolvedItems.length === 0) {
    return {
      rows: cleanedRows,
      aiMetrics,
      aiSummary
    };
  }

  // 2. Chunk into bounded batches
  const batches = chunkItemsIntoBatches(unresolvedItems, batchSize);
  const rowsByNumber = new Map(cleanedRows.map((r) => [r.rowNumber, r]));

  // 3. Process batches sequentially
  for (const batch of batches) {
    aiMetrics.aiUsage.requestCount++;
    let batchResult;

    try {
      batchResult = await executeWithRetry(
        () => provider.processCleaningBatch(batch, { timeoutMs, ...options }),
        maxRetries,
        timeoutMs
      );
    } catch (batchError) {
      // Graceful provider outage handling: do not destroy deterministic results
      aiMetrics.aiFailed += batch.length;
      aiMetrics.aiNeedsReview += batch.length;

      for (const item of batch) {
        const row = rowsByNumber.get(item.rowNumber);
        if (row) {
          row.issues.push(
            createIssue({
              field: item.field,
              rule: 'ai.provider_unavailable',
              category: IssueCategory.AMBIGUOUS_VALUE,
              message: `AI suggestion failed: ${batchError.message || 'Provider unavailable'}`,
              severity: IssueSeverity.WARNING,
              value: item.currentValue
            })
          );
        }
        aiSummary.needsReview.push({
          rowNumber: item.rowNumber,
          field: item.field,
          reason: `AI provider error: ${batchError.message}`
        });
      }
      continue;
    }

    // Accumulate usage tokens if reported (do not invent counts)
    if (batchResult.usage) {
      if (typeof batchResult.usage.inputTokens === 'number') {
        aiMetrics.aiUsage.inputTokens = (aiMetrics.aiUsage.inputTokens || 0) + batchResult.usage.inputTokens;
      }
      if (typeof batchResult.usage.outputTokens === 'number') {
        aiMetrics.aiUsage.outputTokens = (aiMetrics.aiUsage.outputTokens || 0) + batchResult.usage.outputTokens;
      }
      if (typeof batchResult.usage.totalTokens === 'number') {
        aiMetrics.aiUsage.totalTokens = (aiMetrics.aiUsage.totalTokens || 0) + batchResult.usage.totalTokens;
      }
    }

    const suggestions = batchResult.suggestions || [];
    aiMetrics.aiProcessed += batch.length;

    // Process each item in the batch with safety validation
    for (const item of batch) {
      const row = rowsByNumber.get(item.rowNumber);
      if (!row) continue;
      if (!row.changes) row.changes = [];
      if (!row.issues) row.issues = [];
      if (!row.cleaned) row.cleaned = {};

      // Find matching suggestion from model output by rowNumber and field
      const suggestion = suggestions.find(
        (s) => s.rowNumber === item.rowNumber && s.field === item.field
      );

      // If no suggestion returned for this item
      if (!suggestion) {
        aiMetrics.aiNeedsReview++;
        aiSummary.needsReview.push({
          rowNumber: item.rowNumber,
          field: item.field,
          reason: 'No suggestion returned by AI for this item.'
        });
        continue;
      }

      // Step A: Zod Schema Validation
      const zodParsed = aiSuggestionItemSchema.safeParse(suggestion);
      if (!zodParsed.success) {
        aiMetrics.aiRejected++;
        aiMetrics.aiNeedsReview++;
        row.issues.push(
          createIssue({
            field: item.field,
            rule: 'ai.zod_schema_invalid',
            category: IssueCategory.AMBIGUOUS_VALUE,
            message: `AI suggestion failed schema validation: ${zodParsed.error.message}`,
            severity: IssueSeverity.WARNING,
            value: item.currentValue
          })
        );
        aiSummary.rejected.push({
          rowNumber: item.rowNumber,
          field: item.field,
          reason: `Zod validation error: ${zodParsed.error.message}`
        });
        continue;
      }

      const validSuggestion = zodParsed.data;

      if (
        validSuggestion.action === AIAction.SUGGEST_VALUE ||
        validSuggestion.action === AIAction.SUGGEST_NORMALIZATION
      ) {
        aiMetrics.aiSuggestions++;
      }

      // Step B: Deterministic AI Safety Validation
      const safetyResult = evaluateAISuggestionSafety(
        validSuggestion,
        item,
        columnTypeMap,
        options
      );

      // Handle SAFETY DECISION
      if (safetyResult.status === AISafetyStatus.SAFE_SUGGESTION && safetyResult.isSafeToApply) {
        const origVal = row.cleaned?.[item.field] ?? item.currentValue ?? '';
        row.cleaned[item.field] = safetyResult.validatedValue;

        const ruleName =
          validSuggestion.action === AIAction.SUGGEST_NORMALIZATION
            ? 'ai.suggest_normalization'
            : 'ai.suggest_value';

        const change = createChange({
          field: item.field,
          rule: ruleName,
          originalValue: origVal,
          cleanedValue: safetyResult.validatedValue,
          reason: validSuggestion.reason,
          source: 'ai',
          evidenceLevel: 'ai_assisted',
          sourceField: item.field,
          sourceValue: origVal
        });

        // Store provenance metadata
        change.aiProvenance = {
          provider: provider.name,
          model: provider.modelName,
          taskType: item.taskType,
          confidence: validSuggestion.confidence,
          requiresReview: validSuggestion.requiresReview,
          evidence: validSuggestion.evidence,
          timestamp: new Date().toISOString()
        };

        row.changes.push(change);
        aiMetrics.aiApplied++;

        // Remove unresolved missing value issue for this field
        row.issues = row.issues.filter(
          (issue) => !(issue.field === item.field && issue.category === IssueCategory.MISSING_VALUE)
        );
        if (Array.isArray(row.missingFields)) {
          row.missingFields = row.missingFields.filter((f) => f !== item.field);
        }

        aiSummary.applied.push({
          rowNumber: item.rowNumber,
          field: item.field,
          appliedValue: safetyResult.validatedValue,
          reason: validSuggestion.reason,
          confidence: validSuggestion.confidence
        });
      } else if (safetyResult.status === AISafetyStatus.REJECTED) {
        aiMetrics.aiRejected++;
        aiMetrics.aiNeedsReview++;
        row.issues.push(
          createIssue({
            field: item.field,
            rule: 'ai.safety_rejected',
            category: IssueCategory.AMBIGUOUS_VALUE,
            message: safetyResult.rejectionReason || 'AI suggestion violated safety policy.',
            severity: IssueSeverity.WARNING,
            value: validSuggestion.suggestedValue
          })
        );
        aiSummary.rejected.push({
          rowNumber: item.rowNumber,
          field: item.field,
          suggestedValue: validSuggestion.suggestedValue,
          reason: safetyResult.rejectionReason
        });
      } else {
        // NEEDS_REVIEW or NO_CHANGE
        aiMetrics.aiNeedsReview++;
        aiSummary.needsReview.push({
          rowNumber: item.rowNumber,
          field: item.field,
          reason: validSuggestion.reason || 'AI concluded value requires manual human review.'
        });
      }
    }
  }

  // 4. Reclassify affected rows
  for (const row of cleanedRows) {
    row.classification = classifyRow(row);
  }

  return {
    rows: cleanedRows,
    aiMetrics,
    aiSummary
  };
};

export default {
  executeWithRetry,
  processUnresolvedWithAI
};
