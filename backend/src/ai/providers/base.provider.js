/**
 * Abstract base class defining the standard interface for all AI cleaning providers.
 */
export class BaseAIProvider {
  constructor(name = 'base', options = {}) {
    this.name = name;
    this.modelName = options.model || 'default-model';
    this.options = options;
  }

  /**
   * Processes a batch of unresolved item contexts and returns structured cleaning suggestions.
   *
   * @param {Array<object>} items - Array of unresolved item contexts
   * @param {object} [options={}] - Execution options (timeout, retries, etc.)
   * @returns {Promise<{
   *   suggestions: Array<object>,
   *   usage: { inputTokens: number | null, outputTokens: number | null, totalTokens: number | null },
   *   raw?: any
   * }>}
   */
  async processCleaningBatch(items, options = {}) {
    throw new Error(`processCleaningBatch() must be implemented by provider subclass (${this.name})`);
  }
}

export default BaseAIProvider;
