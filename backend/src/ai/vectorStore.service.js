import env from '../config/env.js';
import ApiError from '../utils/apiError.js';

const collectionPath = () => '/collections/' + encodeURIComponent(env.qdrantCollection);
export async function vectorRequest(endpoint, method = 'GET', body, allowMissing = false) {
  let response;
  try {
    response = await fetch(env.qdrantUrl.replace(/\/$/, '') + endpoint, {
      method, headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10000),
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
  } catch { throw new ApiError(503, 'Vector storage is unavailable. Start Docker Desktop and run docker compose up -d qdrant from the project directory.'); }
  if (allowMissing && response.status === 404) return null;
  if (!response.ok) throw new ApiError(502, 'Vector storage rejected the request. Check the Qdrant service and collection configuration.');
  const value = await response.json();
  return value.result;
}
export async function ensureVectorCollection() {
  const existing = await vectorRequest(collectionPath(), 'GET', undefined, true);
  if (!existing) await vectorRequest(collectionPath(), 'PUT', { vectors: { size: 1536, distance: 'Cosine' } });
  else if (existing.config?.params?.vectors?.size !== 1536) throw new ApiError(503, 'Vector collection has incompatible dimensions. Configure a separate QDRANT_COLLECTION.');
}
export const datasetFilter = (dataset, revision) => ({ must: [
  { key: 'ownerId', match: { value: String(dataset.owner) } },
  { key: 'datasetId', match: { value: String(dataset._id || dataset.id) } },
  ...(revision ? [{ key: 'revision', match: { value: revision } }] : [])
] });
export const countVectors = async filter => (await vectorRequest(collectionPath() + '/points/count', 'POST', { filter, exact: true })).count;
export const saveVectors = points => vectorRequest(collectionPath() + '/points?wait=true', 'PUT', { points });
export const retrieveVectors = async (filter, vector = null) => {
  const result = vector ? await vectorRequest(collectionPath() + '/points/query', 'POST', { query: vector, filter, limit: 5, with_payload: true, with_vector: false })
    : await vectorRequest(collectionPath() + '/points/scroll', 'POST', { filter, limit: 5, with_payload: true, with_vector: false });
  return (result.points || []).map(point => ({ text: point.payload.text, index: point.payload.index, score: point.score ?? null }));
};
export const deleteDatasetVectors = async dataset => {
  const existing = await vectorRequest(collectionPath(), 'GET', undefined, true);
  if (existing) await vectorRequest(collectionPath() + '/points/delete?wait=true', 'POST', { filter: datasetFilter(dataset) });
};
