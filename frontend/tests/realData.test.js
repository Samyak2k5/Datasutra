import test from 'node:test';
import assert from 'node:assert/strict';
import api from '../src/services/api.js';
import { loadDatasetPreview } from '../src/services/datasets.js';

const storage = new Map();
globalThis.localStorage = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
globalThis.window = new EventTarget();
const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

test('upload, parse, refresh, and preview preserve direct API shapes and original headers', async () => {
  const calls = [];
  let parsed = false;
  globalThis.fetch = async (url, options) => {
    const path = url.replace('/api/v1', ''); calls.push([path, options.method]);
    if (path === '/datasets') return response({ data: { id: 'upload-id' } }, 201);
    if (path === '/datasets/upload-id') return response({ data: { id: 'upload-id', status: parsed ? 'completed' : 'uploaded' } });
    if (path.endsWith('/parse')) { parsed = true; return response({ data: { dataset: { id: 'upload-id' } } }); }
    if (path.includes('/preview')) return response({ data: { headers: ['Name', 'Age', 'City', 'Salary', 'id'], rows: [{ Name: 'Yash', Age: '20', City: 'Mumbai', Salary: '50000', id: 'external-id' }] } });
    throw new Error(`Unexpected URL ${url}`);
  };
  const uploaded = await api.uploadDataset(new FormData());
  const [a, b] = await Promise.all([loadDatasetPreview(uploaded.data.id), loadDatasetPreview(uploaded.data.id)]);
  assert.deepEqual(a, b);
  assert.equal(a.preview.rows[0].Name, 'Yash');
  assert.deepEqual(a.preview.headers, ['Name', 'Age', 'City', 'Salary', 'id']);
  assert.equal(calls.filter(([path]) => path.endsWith('/parse')).length, 1);
  assert.equal(calls.filter(([path]) => path.includes('/preview')).length, 1);
});

test('parse errors propagate without requesting a replacement preview', async () => {
  globalThis.fetch = async url => url.endsWith('/parse')
    ? response({ message: 'Unterminated CSV quote' }, 400)
    : response({ data: { id: 'broken', status: 'uploaded' } });
  await assert.rejects(loadDatasetPreview('broken'), /Unterminated CSV quote/);
});

test('failed dataset shows persisted error and missing ID never makes a request', async () => {
  globalThis.fetch = async () => response({ data: { id: 'failed', status: 'failed', parseError: 'Invalid header' } });
  await assert.rejects(loadDatasetPreview('failed'), /Invalid header/);
  globalThis.fetch = () => { throw new Error('Unexpected request'); };
  await assert.rejects(loadDatasetPreview(null), /Choose a dataset/);
});

test('empty real preview stays empty', async () => {
  globalThis.fetch = async url => response({ data: url.includes('/preview') ? { headers: ['Name'], rows: [] } : { id: 'empty', status: 'completed' } });
  const result = await loadDatasetPreview('empty');
  assert.deepEqual(result.preview.rows, []);
});

test('expired JWT clears token and cached user and notifies the UI, including exports', async () => {
  for (const exportRequest of [false, true]) {
    api.setToken('expired'); api.setCurrentUser({ name: 'Old User' });
    let notified = false;
    window.addEventListener('datasutra:unauthorized', () => { notified = true; }, { once: true });
    globalThis.fetch = async () => response({ message: 'Token expired' }, 401);
    await assert.rejects(api.request('/protected', exportRequest ? { responseType: 'blob' } : {}), /Token expired/);
    assert.equal(api.getToken(), null); assert.equal(api.getCurrentUser(), null); assert.ok(notified);
  }
});

test('server failures preserve session and surface the actual error', async () => {
  api.setToken('valid');
  globalThis.fetch = async () => response({ message: 'Database unavailable' }, 503);
  await assert.rejects(api.getMe(), /Database unavailable/);
  assert.equal(api.getToken(), 'valid');
});

test('incomplete authentication responses never persist a token or user', async () => {
  api.setToken(null); api.setCurrentUser(null);
  globalThis.fetch = async () => response({ data: { accessToken: 'incomplete' } });
  await assert.rejects(api.login({ email: 'validation@example.test', password: 'unused' }), /incomplete authentication/);
  assert.equal(api.getToken(), null); assert.equal(api.getCurrentUser(), null);
});
