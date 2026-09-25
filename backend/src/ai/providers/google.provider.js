import BaseAIProvider from './base.provider.js';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { aiBatchResponseSchema } from '../schemas/aiCleaningResult.schema.js';
import { SYSTEM_PROMPT, buildBatchCleaningUserPrompt } from '../prompts/cleaning.prompt.js';

export class GoogleAIProvider extends BaseAIProvider {
  constructor(options = {}) {
    super('google', options);
    this.modelName = options.model || 'gemini-1.5-flash';
    this.apiKey = options.apiKey || process.env.GOOGLE_API_KEY;
    this.temperature = options.temperature !== undefined ? options.temperature : 0;
    this.maxTokens = options.maxTokens || 1000;
  }

  async processCleaningBatch(items, options = {}) {
    if (!this.apiKey) {
      throw new Error('Google API key is missing. Please set GOOGLE_API_KEY environment variable.');
    }

    const model = new ChatGoogleGenerativeAI({
      apiKey: this.apiKey,
      model: this.modelName,
      temperature: this.temperature,
      maxOutputTokens: this.maxTokens
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

export default GoogleAIProvider;
