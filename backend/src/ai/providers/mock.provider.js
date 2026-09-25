import BaseAIProvider from './base.provider.js';
import { AIAction } from '../schemas/aiCleaningResult.schema.js';
import { isIdentityField } from '../../cleaning/missing/missingDataEngine.js';
import { isMissingValue } from '../../cleaning/rules/missingValue.rules.js';

export class MockAIProvider extends BaseAIProvider {
  constructor(options = {}) {
    super('mock', options);
    this.modelName = options.model || 'mock-gpt-4o';
    this.customHandler = options.customHandler || null;
    this.failureCount = options.failureCount || 0;
    this.currentFailures = 0;
    this.shouldTimeout = options.shouldTimeout || false;
    this.permanentFailure = options.permanentFailure || false;
    this.callCount = 0;
  }

  setCustomHandler(fn) {
    this.customHandler = fn;
  }

  setFailureCount(count) {
    this.failureCount = count;
    this.currentFailures = 0;
  }

  setShouldTimeout(timeout) {
    this.shouldTimeout = timeout;
  }

  setPermanentFailure(fail) {
    this.permanentFailure = fail;
  }

  setNoTokenUsage(noUsage) {
    this.noTokenUsage = !!noUsage;
  }

  reset() {
    this.customHandler = null;
    this.failureCount = 0;
    this.currentFailures = 0;
    this.shouldTimeout = false;
    this.permanentFailure = false;
    this.noTokenUsage = false;
    this.callCount = 0;
  }

  async processCleaningBatch(items, options = {}) {
    this.callCount++;

    if (this.shouldTimeout) {
      const timeoutMs = options.timeoutMs || 200;
      await new Promise((resolve) => setTimeout(resolve, timeoutMs + 50));
      const err = new Error('Mock AI provider request timed out');
      err.code = 'TIMEOUT';
      throw err;
    }

    if (this.permanentFailure) {
      const err = new Error('Mock AI provider permanent failure: Service Unavailable (503)');
      err.status = 503;
      throw err;
    }

    if (this.currentFailures < this.failureCount) {
      this.currentFailures++;
      const err = new Error('Mock AI provider transient network error (429/500)');
      err.status = 429;
      throw err;
    }

    if (typeof this.customHandler === 'function') {
      return this.customHandler(items, options);
    }

    const suggestions = items.map((item) => {
      const { rowNumber, field, currentValue } = item;

      // 1. If it's an identity field and missing -> model correctly returns needs_review
      if (isIdentityField(field) && isMissingValue(currentValue)) {
        return {
          rowNumber,
          field,
          action: AIAction.NEEDS_REVIEW,
          originalValue: currentValue,
          suggestedValue: null,
          reason: `Insufficient evidence to safely determine customer ${field}`,
          evidence: [
            {
              type: 'missing_evidence',
              description: `No verified ${field} source exists in row data`
            }
          ],
          confidence: 0.2,
          requiresReview: true
        };
      }

      // 2. If it's a messy location or text string -> model suggests normalization
      if (typeof currentValue === 'string' && (currentValue.includes('   ') || currentValue === currentValue.toLowerCase())) {
        const cleanedText = currentValue.trim().replace(/\s+/g, ' ');
        const titleCased = cleanedText
          .split(' ')
          .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ''))
          .join(' ');

        return {
          rowNumber,
          field,
          action: AIAction.SUGGEST_NORMALIZATION,
          originalValue: currentValue,
          suggestedValue: titleCased,
          reason: 'Normalized extra whitespace and standardized casing',
          evidence: [
            {
              type: 'text_standardization',
              description: 'Standardized casing and collapsed duplicate spaces'
            }
          ],
          confidence: 0.95,
          requiresReview: false
        };
      }

      // 3. Default fallback: needs_review
      return {
        rowNumber,
        field,
        action: AIAction.NEEDS_REVIEW,
        originalValue: currentValue,
        suggestedValue: null,
        reason: 'Unable to safely deduce value from row context',
        evidence: [],
        confidence: 0.3,
        requiresReview: true
      };
    });

    return {
      suggestions,
      usage: this.noTokenUsage
        ? { inputTokens: null, outputTokens: null, totalTokens: null }
        : {
            inputTokens: items.length * 150,
            outputTokens: items.length * 80,
            totalTokens: items.length * 230
          },
      raw: { provider: 'mock', itemsProcessed: items.length }
    };
  }
}

export default MockAIProvider;
