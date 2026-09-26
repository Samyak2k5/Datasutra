import env from '../../config/env.js';
import MockAIProvider from './mock.provider.js';
import OpenAIProvider from './openai.provider.js';
import GoogleAIProvider from './google.provider.js';

/**
 * Factory function to retrieve or instantiate an AI provider by name.
 *
 * @param {string} [providerName] - Provider name ('mock', 'openai', 'google', 'gemini')
 * @param {object} [options={}] - Options (model, apiKey, temperature, maxTokens)
 * @returns {import('./base.provider.js').BaseAIProvider}
 */
export const getAIProvider = (providerName, options = {}) => {
  const chosenProvider = (providerName || options.provider || env.aiProvider || 'mock').toLowerCase();

  switch (chosenProvider) {
    case 'openai':
      return new OpenAIProvider({
        model: options.model || env.aiModel,
        apiKey: options.apiKey || env.openaiApiKey,
        temperature: options.temperature !== undefined ? options.temperature : env.aiTemperature,
        maxTokens: options.maxTokens || env.aiMaxTokens,
        ...options
      });

    case 'google':
    case 'gemini':
      return new GoogleAIProvider({
        model: options.model || env.aiModel,
        apiKey: options.apiKey || env.googleApiKey,
        temperature: options.temperature !== undefined ? options.temperature : env.aiTemperature,
        maxTokens: options.maxTokens || env.aiMaxTokens,
        ...options
      });

    case 'mock':
    default:
      return new MockAIProvider({
        model: options.model || 'mock-gpt-4o',
        ...options
      });
  }
};

export {
  MockAIProvider,
  OpenAIProvider,
  GoogleAIProvider
};

export default {
  getAIProvider,
  MockAIProvider,
  OpenAIProvider,
  GoogleAIProvider
};
