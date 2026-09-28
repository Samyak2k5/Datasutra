import Dataset from '../models/Dataset.js';
import { createHash } from 'node:crypto';
import { OpenAIEmbeddings } from '@langchain/openai';
import env from '../config/env.js';
import ApiError from '../utils/apiError.js';
import { isSensitiveKey } from './aiContext.builder.js';
import { trackedFetch, createApiCalls } from './apiCallTracker.js';
import { ensureVectorCollection, countVectors, saveVectors, retrieveVectors, datasetFilter } from './vectorStore.service.js';

export function prepareChunks(parsed) {
  const document = ['pdf', 'doc', 'docx', 'txt'].includes(parsed.format);
  const headers = parsed.headers.filter(name => !isSensitiveKey(name) && !name.startsWith('_'));
  const scrub = text => text.replace(/sk-[a-zA-Z0-9_-]{16,}/g, '[REDACTED]');
  const texts = document && parsed.documentStructure?.sections?.length
    ? parsed.documentStructure.sections.map(section => String(section.content || ''))
    : parsed.rows.map(row => JSON.stringify(Object.fromEntries(headers.map(name => [name, row[name]])), (key, value) => isSensitiveKey(key) ? '[REDACTED]' : value));
  const chunks = []; let truncated = false;
  for (const raw of texts) {
    const text = scrub(raw).trim();
    for (let offset = 0; offset < text.length; offset += 1200) {
      if (chunks.length >= 80) { truncated = true; break; }
      chunks.push(text.slice(offset, offset + 1200));
    }
    if (truncated) break;
  }
  return { chunks, truncated, representation: document ? 'document chunks' : 'record chunks', limit: 80 };
}
function embeddingClient(calls) {
  if (!env.openaiApiKey) throw new ApiError(503, 'OpenAI API key is not configured.');
  return new OpenAIEmbeddings({ apiKey: env.openaiApiKey, model: env.embeddingModel, dimensions: 1536,
    batchSize: 16, maxConcurrency: 1, maxRetries: 0, timeout: 25000, encodingFormat: 'float',
    configuration: { fetch: trackedFetch(calls, 'embeddings') } });
}
async function guarded(fn) {
  try { return await fn(); }
  catch (error) {
    if (error instanceof ApiError) throw error;
    if (error.status === 429) throw new ApiError(429, 'OpenAI embedding quota or rate limit reached.');
    if (/abort|timeout|timed out/i.test(error.name + ' ' + error.message)) throw new ApiError(504, 'Embedding request timed out.');
    throw new ApiError(502, 'OpenAI embedding generation failed. Check backend credentials and provider availability.');
  }
}
export async function indexDataset(dataset, parsed, calls = createApiCalls()) {
  // Check storage before spending on embeddings. Deterministic IDs allow safe retries.
  await ensureVectorCollection();
  const prepared = prepareChunks(parsed);
  if (!prepared.chunks.length) throw ApiError.badRequest('No meaningful content is available for embedding.');
  const revision = createHash('sha256').update(env.embeddingModel + JSON.stringify(prepared.chunks)).digest('hex');
  const filter = datasetFilter(dataset, revision);
  const count = await countVectors(filter);
  if (count !== prepared.chunks.length) {
    const client = embeddingClient(calls);
    for (let offset = 0; offset < prepared.chunks.length; offset += 16) {
      const batch = prepared.chunks.slice(offset, offset + 16);
      const vectors = await guarded(() => client.embedDocuments(batch));
      if (vectors.length !== batch.length || vectors.some(vector => vector.length !== 1536 || vector.some(value => !Number.isFinite(value)))) throw new ApiError(502, 'Invalid embedding response.');
      await saveVectors(batch.map((text, i) => {
        const index = offset + i;
        const hash = createHash('sha256').update(String(dataset._id || dataset.id) + revision + index).digest('hex').slice(0, 32);
        const id = hash.slice(0,8) + '-' + hash.slice(8,12) + '-' + hash.slice(12,16) + '-' + hash.slice(16,20) + '-' + hash.slice(20);
        return { id, vector: vectors[i], payload: { ownerId: String(dataset.owner), datasetId: String(dataset._id || dataset.id), revision, index, text, model: env.embeddingModel } };
      }));
    }
  }
  const stored = await countVectors(filter);
  if (stored !== prepared.chunks.length) throw new ApiError(502, 'Vector storage verification failed.');
  await Dataset.updateOne({ _id: dataset._id || dataset.id }, { $set: { embeddingInfo: { revision, model: env.embeddingModel, storedChunks: stored, truncated: prepared.truncated } } });
  return { model: env.embeddingModel, storedChunks: stored, reused: count === stored, truncated: prepared.truncated, representation: prepared.representation, revision, apiCalls: calls };
}
export async function retrieveDatasetContext(dataset, indexed, calls, query) {
  const vector = query ? await guarded(() => embeddingClient(calls).embedQuery(query.slice(0, 1000))) : null;
  return retrieveVectors(datasetFilter(dataset, indexed.revision), vector);
}
