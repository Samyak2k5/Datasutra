import { trackedFetch } from '../apiCallTracker.js';
import ApiError from '../../utils/apiError.js';
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

  async invokeStructured(schema, { system, payload, name = 'dataset_analysis', timeoutMs = 25000, apiCalls }) {
    if (!this.apiKey) throw new ApiError(503, 'OpenAI API key is not configured. Set OPENAI_API_KEY in backend/.env and restart the backend.');
    try {
      const model = new ChatOpenAI({ apiKey: this.apiKey, model: this.modelName,
        temperature: 0, maxTokens: 2400, maxRetries: 0, timeout: timeoutMs,
        ...(apiCalls ? { configuration: { fetch: trackedFetch(apiCalls, 'chat') } } : {}) });
      const runnable = model.withStructuredOutput(schema, { name, method: 'jsonSchema', strict: true });
      const result = await runnable.invoke([new SystemMessage(system), new HumanMessage(JSON.stringify(payload))],
        { signal: AbortSignal.timeout(timeoutMs) });
      const parsed = schema.safeParse(result);
      if (!parsed.success) throw new Error('Invalid structured output');
      return parsed.data;
    } catch (error) {
      if (error.status === 429) throw new ApiError(429, 'OpenAI rate limit or quota reached. Check billing or try again later.');
      if (/timeout|timed out|abort/i.test(error.name + ' ' + error.message)) throw new ApiError(504, 'AI request timed out. Please try again.');
      if ([401, 403].includes(error.status)) throw new ApiError(503, 'OpenAI rejected the backend API credentials. Check OPENAI_API_KEY.');
      throw new ApiError(502, 'AI returned an invalid response or the provider is unavailable. Please try again.');
    }
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
