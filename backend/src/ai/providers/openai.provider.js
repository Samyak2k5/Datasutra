import BaseAIProvider from './base.provider.js';
import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { aiBatchResponseSchema } from '../schemas/aiCleaningResult.schema.js';
import { SYSTEM_PROMPT, buildBatchCleaningUserPrompt } from '../prompts/cleaning.prompt.js';

export class OpenAIProvider extends BaseAIProvider {
  constructor(options = {}) {
    super('openai', options);
    this.modelName = options.model || 'gpt-4o-mini';
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY;
    this.temperature = options.temperature !== undefined ? options.temperature : 0;
    this.maxTokens = options.maxTokens || 1000;
  }

  async processCleaningBatch(items, options = {}) {
    if (!this.apiKey) {
      throw new Error('OpenAI API key is missing. Please set OPENAI_API_KEY environment variable.');
    }

    const model = new ChatOpenAI({
      apiKey: this.apiKey,
      model: this.modelName,
      temperature: this.temperature,
      maxTokens: this.maxTokens,
      timeout: options.timeoutMs || 15000
    });

    const structuredModel = model.withStructuredOutput(aiBatchResponseSchema);

    const userPrompt = buildBatchCleaningUserPrompt(items);
    const messages = [
      new SystemMessage(SYSTEM_PROMPT),
      new HumanMessage(userPrompt)
    ];

    const result = await structuredModel.invoke(messages);

    return {
      suggestions: result.suggestions || [],
      usage: {
        inputTokens: null,
        outputTokens: null,
        totalTokens: null
      },
      raw: result
    };
  }
}

export default OpenAIProvider;
