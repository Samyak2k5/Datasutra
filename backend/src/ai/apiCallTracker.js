export const createApiCalls = () => ({ embeddings: 0, chat: 0, total: 0, failed: 0 });

// Count actual successful HTTP calls, including SDK batching, not guessed model invocations.
export function trackedFetch(calls, kind) {
  return async (...args) => {
    let response;
    try { response = await fetch(...args); }
    catch (error) { calls.failed++; throw error; }
    if (response.ok) { calls[kind]++; calls.total++; }
    else calls.failed++;
    return response;
  };
}
