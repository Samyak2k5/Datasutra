import AISession from '../src/models/AISession.js';
import AdmZip from 'adm-zip';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import mongoose from 'mongoose';
import app from '../src/app.js';
import env from '../src/config/env.js';
import { disconnectDB } from '../src/config/db.js';
import User from '../src/models/User.js';
import Dataset from '../src/models/Dataset.js';
import CleaningJob from '../src/models/CleaningJob.js';
import AuditLog from '../src/models/AuditLog.js';
import { generateToken } from '../src/utils/jwt.js';

// This isolated test app intentionally exercises more than the interactive AI quota.
process.env.DISABLE_RATE_LIMIT = 'true';
const users = [];
let server;
let checks = 0;
const check = (condition, label) => { assert.ok(condition, label); checks++; console.log(`PASS ${label}`); };
try {
  // Allow slower Atlas handshakes in the test without changing application settings.
  await mongoose.connect(env.mongodbUri, { serverSelectionTimeoutMS: 30000 });
  check(mongoose.connection.name === 'datasutra', 'MongoDB connects to datasutra');
  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  async function request(path, { method = 'GET', token, body } = {}) {
    const response = await fetch(base + path, {
      method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) },
      body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body)
    });
    const payload = await response.json();
    return { status: response.status, ...payload };
  }
  const health = await request('/health');
  check(health.status === 200 && health.data.services.database === 'connected', 'health returns 200 with database connected');
  const email = `validation-${randomUUID()}@example.test`;
  const password = `Check-${randomUUID()}`;
  const registered = await request('/auth/register', { method: 'POST', body: { name: 'Validation Owner', email, password } });
  check(registered.status === 201, 'register succeeds');
  users.push(registered.data.user.id);
  check(!!await User.findById(users[0]), 'registered user persisted in MongoDB');
  check(!('passwordHash' in registered.data.user) && !('password' in registered.data.user), 'registration excludes password fields');
  const login = await request('/auth/login', { method: 'POST', body: { email, password } });
  check(login.status === 200 && !!login.data.accessToken, 'login returns JWT');
  const token = login.data.accessToken;
  const me = await request('/auth/me', { token });
  check(me.status === 200 && me.data.user.name === 'Validation Owner' && me.data.user.email === email, 'current user matches MongoDB identity');
  check(!('passwordHash' in me.data.user), 'current user excludes password hash');
  check((await request('/auth/login', { method: 'POST', body: { email, password: 'incorrect' } })).status === 401, 'wrong credentials return 401');
  check((await request('/auth/login', { method: 'POST', body: {} })).status === 400, 'missing credentials return 400');
  for (const [label, badToken] of [
    ['missing', undefined], ['invalid', 'not-a-jwt'],
    ['expired', generateToken({ sub: users[0] }, { expiresIn: -1 })],
    ['invalid subject', generateToken({ sub: 'invalid-object-id' })]
  ]) check((await request('/auth/me', { token: badToken })).status === 401, `${label} token returns 401`);
  const profile = await request('/auth/profile', { method: 'PATCH', token, body: { name: '  Updated Owner  ' } });
  check(profile.status === 200 && profile.data.user.name === 'Updated Owner', 'profile saves trimmed name');
  check((await User.findById(users[0])).name === 'Updated Owner', 'profile persisted in MongoDB');
  check((await request('/auth/me', { token })).data.user.name === 'Updated Owner', 'profile reload returns updated name');
  check((await request('/auth/login', { method: 'POST', body: { email, password } })).data.user.name === 'Updated Owner', 'login returns updated name');
  check(!('passwordHash' in profile.data.user), 'profile response excludes password');
  for (const body of [{ name: '' }, { name: 'x'.repeat(101) }, { name: 'Valid', email: 'changed@example.test' }, { name: { '$gt': '' } }]) {
    check((await request('/auth/profile', { method: 'PATCH', token, body })).status === 400, 'invalid profile update rejected');
  }
  check((await request('/auth/profile', { method: 'PATCH', body: { name: 'Unauthorized' } })).status === 401, 'profile update requires authentication');
  const datasets = await request('/datasets', { token });
  check(Array.isArray(datasets.data) && datasets.data.length === 0, 'new account has no datasets');
  const jobs = await request('/cleaning-jobs', { token });
  check(jobs.data.jobs.length === 0, 'new account has no cleaning jobs');
  const csv = 'Name,Age,City,Salary\nYash,20,Mumbai,50000\nRahul,21,Pune,45000\n';
  const form = new FormData(); form.append('file', new Blob([csv], { type: 'text/csv' }), 'validation.csv');
  const uploaded = await request('/datasets', { method: 'POST', token, body: form });
  check(uploaded.status === 201 && !!uploaded.data.id && !uploaded.data.dataset, 'upload returns data.id directly');
  const id = uploaded.data.id;
  const ds = await request(`/datasets/${id}`, { token });
  check(ds.data.id === id && ds.data.status === 'uploaded', 'GET dataset uses the same ID and direct shape');
  check((await request(`/datasets/${id}/parse`, { token, method: 'POST' })).status === 200, 'CSV parsing succeeds');
  const preview = await request(`/datasets/${id}/preview`, { token });
  assert.deepEqual(preview.data.headers, ['Name', 'Age', 'City', 'Salary']);
  check(preview.data.rows.length === 2 && preview.data.rows[0].Name === 'Yash' && preview.data.rows[1].Salary === '45000', 'preview contains exact uploaded columns and rows');
  const other = await request('/auth/register', { method: 'POST', body: { name: 'Other Owner', email: `validation-${randomUUID()}@example.test`, password } });
  users.push(other.data.user.id);
  check((await request(`/datasets/${id}`, { token: other.data.accessToken })).status === 403, 'another account cannot access the dataset');
  check((await request(`/datasets/${id}/clean`, { token, method: 'POST', body: { cleaningMode: 'rules_then_ai', aiProvider: 'mock' } })).status === 400, 'normal API cannot run simulated AI');
  const cleaned = await request(`/datasets/${id}/clean`, { token, method: 'POST', body: { cleaningMode: 'rules_only' } });
  check(cleaned.status === 200 && !!cleaned.data.job.id, 'deterministic cleaning returns a real job');
  const jobId = cleaned.data.job.id;
  const report = await request(`/cleaning-jobs/${jobId}/report`, { token });
  check(report.data.dataset.id === id && report.data.metrics.totalRows === 2, 'report describes the uploaded dataset');
  const exported = await fetch(`${base}/cleaning-jobs/${jobId}/export?format=csv`, { headers: { Authorization: `Bearer ${token}` } });
  const exportText = await exported.text();
  check(exported.status === 200 && exportText.includes('Name,Age,City,Salary') && exportText.includes('Yash'), 'export contains actual uploaded data');
  const reviewed = await request('/ai/execute/' + id, { method: 'POST', token, body: { operations: [{ type: 'trim_whitespace', column: 'Name' }] } });
  check(reviewed.status === 200 && reviewed.data.metrics.finalRows === 2, 'reviewed plan creates real cleaning job');
  const storedPlan = await CleaningJob.findById(reviewed.data.job.id);
  check(storedPlan.configuration.operations[0].column === 'Name', 'reviewed operations persisted for export');
  check((await request('/ai/execute/' + id, { method: 'POST', token, body: { operations: [{ type: 'remove_duplicates', column: null }] } })).status === 400, 'unsupported operation cannot execute');
  for (const action of ['analyze', 'cleaning-suggestions', 'command', 'execute']) {
    check((await request('/ai/' + action + '/' + id, { method: 'POST', token: other.data.accessToken, body: { instruction: 'Trim names' } })).status === 403, action + ' enforces dataset ownership');
    check((await request('/ai/' + action + '/' + id, { method: 'POST', body: {} })).status === 401, action + ' requires authentication');
  }
  const savedKey = env.openaiApiKey;
  env.openaiApiKey = null;
  check((await request('/ai/analyze/' + id, { method: 'POST', token, body: {} })).status === 503, 'missing OpenAI key returns a real configuration error');
  env.openaiApiKey = savedKey;
  // Exercise the actual LangChain structured-output adapter with an isolated HTTP fixture.
  // No production route or runtime fallback supplies simulated responses.
  const realFetch = globalThis.fetch;
  env.openaiApiKey = 'test-only-not-a-real-key';
  let upstreamOutput = { summary: 'Transport fixture: sample has two rows.', columns: [], issues: [], recommendations: [] };
  let providerCalls = 0;
  const testVectors = new Map();
  globalThis.fetch = async (url, options) => {
    if (String(url?.url || url).startsWith(env.qdrantUrl)) {
      const path = String(url?.url || url).slice(env.qdrantUrl.length);
      const payload = options?.body ? JSON.parse(options.body) : {};
      const matches = point => (payload.filter?.must || []).every(condition => point.payload[condition.key] === condition.match.value);
      let result;
      if (path.endsWith('/count')) result = { count: [...testVectors.values()].filter(matches).length };
      else if (path.endsWith('/scroll') || path.endsWith('/query')) result = { points: [...testVectors.values()].filter(matches).slice(0, 5) };
      else if (path.includes('/points?')) { for (const point of payload.points) testVectors.set(point.id, point); result = { status: 'completed' }; }
      else result = { config: { params: { vectors: { size: 1536 } } } };
      return new Response(JSON.stringify({ result }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (String(url?.url || url).includes('api.openai.com/v1/embeddings')) {
      const payload = JSON.parse(options.body);
      const input = Array.isArray(payload.input) ? payload.input : [payload.input];
      return new Response(JSON.stringify({ object: 'list', model: 'text-embedding-3-small', data: input.map((_, index) => ({ object: 'embedding', index, embedding: Array(1536).fill(0.01) })), usage: { prompt_tokens: 1, total_tokens: 1 } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (String(url?.url || url).startsWith('https://api.openai.com/')) {
      providerCalls++;
      const payload = JSON.parse(options.body);
      check(payload.response_format.type === 'json_schema', 'LangChain requests structured JSON schema');
      return new Response(JSON.stringify({ id: 'test-completion', object: 'chat.completion', created: 1, model: 'gpt-4o-mini', choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(upstreamOutput) }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return realFetch(url, options);
  };
  try {
    const zip = new AdmZip(); zip.addFile('word/document.xml', Buffer.from('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Review customer names and missing ages.</w:t></w:r></w:p></w:body></w:document>'));
    const analysisIds = [id];
    for (const [filename, data] of [['analysis.json', JSON.stringify([{ Name: 'Yash', Age: 21 }, { Name: 'Amit', Age: null }])], ['analysis.docx', zip.toBuffer()], ['analysis.txt', 'Customer records need review.']]) {
      const uploadForm = new FormData(); uploadForm.append('file', new Blob([data]), filename);
      const upload = await request('/datasets', { method: 'POST', token, body: uploadForm });
      check(upload.status === 201, filename + ' upload');
      check((await request('/datasets/' + upload.data.id + '/parse', { method: 'POST', token })).status === 200, filename + ' parse');
      analysisIds.push(upload.data.id);
    }
    for (const datasetId of analysisIds) {
      const result = await request('/ai/analyze/' + datasetId, { method: 'POST', token, body: {} });
      check(result.status === 200 && !!result.data.summary && result.data.sample.rows > 0, 'parser → LangChain → validated analysis (HTTP fixture)');
    }
    upstreamOutput = { supported: true, message: 'Trim names only', operations: [{ type: 'trim_whitespace', column: 'Name' }] };
    const command = await request('/ai/command/' + id, { method: 'POST', token, body: { instruction: 'Trim names' } });
    check(command.status === 200 && command.data.operations[0].column === 'Name', 'natural-language command returns validated plan (HTTP fixture)');
    check(command.data.apiCalls.chat === 1 && command.data.apiCalls.embeddings === 1, 'actual HTTP calls include query embedding and planning chat; cached vectors cost zero');
    upstreamOutput = { summary: 'Test transport: reviewed operations completed.', issues: [], recommendations: ['Review remaining issues.'] };
    const applied = await request('/ai/execute/' + id, { method: 'POST', token, body: { operations: command.data.operations, sessionId: command.data.sessionId } });
    check(applied.status === 200 && applied.data.metrics.originalRows === 2 && applied.data.metrics.finalRows === 2, 'final AI response has deterministic BEFORE/AFTER metrics');
    check(applied.data.apiCalls.chat === 2 && applied.data.apiCalls.embeddings === 1 && applied.data.metrics.llmApiCalls === 3, 'final report counts actual embedding and chat calls');
    check(applied.data.metrics.processingTimeMs > 0 && !!applied.data.summary, 'final report includes measured elapsed time and validated AI summary');
    const repeated = await request('/ai/execute/' + id, { method: 'POST', token, body: { operations: command.data.operations, sessionId: command.data.sessionId } });
    check(repeated.data.job.id === applied.data.job.id && repeated.data.reused, 'repeated apply reuses completed job without another paid call');
    const savedReport = await request('/cleaning-jobs/' + applied.data.job.id + '/report', { token });
    check(savedReport.data.comparisonReport.metrics.llmApiCalls === 3, 'comparison and usage report persist in MongoDB');
    check(testVectors.size > 0 && [...testVectors.values()].every(point => point.payload.ownerId === users[0]), 'vector transport includes real owner and dataset filters (fixture storage)');
    upstreamOutput = { suggestions: [{ issue: 'Whitespace', explanation: 'Review formatting', suggestedAction: 'Trim Name', severity: 'low', operation: { type: 'trim_whitespace', column: 'Name' } }] };
    check((await request('/ai/cleaning-suggestions/' + id, { method: 'POST', token, body: {} })).status === 200, 'suggestions include validated operations (HTTP fixture)');
    upstreamOutput = { supported: false, message: 'Deleting records is unsupported.', operations: [] };
    check((await request('/ai/command/' + id, { method: 'POST', token, body: { instruction: 'Remove duplicates' } })).data.supported === false, 'unsupported command is not executed (HTTP fixture)');
    upstreamOutput = { supported: true, message: 'Invalid column', operations: [{ type: 'trim_whitespace', column: 'Invented' }] };
    check((await request('/ai/command/' + id, { method: 'POST', token, body: { instruction: 'Trim names' } })).status === 502, 'hallucinated column returns controlled error');
    upstreamOutput = { summary: 42 };
    check((await request('/ai/analyze/' + id, { method: 'POST', token, body: {} })).status === 502, 'malformed AI response returns controlled error');
    check(providerCalls > 0, 'tests used the real LangChain adapter with isolated transport');
  } finally { globalThis.fetch = realFetch; env.openaiApiKey = savedKey; }
  const imageForm = new FormData(); imageForm.append('file', new Blob(['image'], {type: 'image/png'}), 'image.png');
  const imageError = await request('/datasets', { method: 'POST', token, body: imageForm });
  check(imageError.status === 400 && imageError.message.includes('Image AI analysis is not enabled'), 'image upload receives explicit MVP limitation');
  check((await request('/auth/logout', { method: 'POST', token })).status === 200, 'logout endpoint succeeds');
  const malformed = new FormData(); malformed.append('file', new Blob(['Name,Age\n"unterminated,20']), 'invalid.csv');
  const badUpload = await request('/datasets', { method: 'POST', token, body: malformed });
  const badParse = await request(`/datasets/${badUpload.data.id}/parse`, { method: 'POST', token });
  check(badParse.status === 400 && !!badParse.message, 'malformed CSV returns useful parse error');
  const failed = await request(`/datasets/${badUpload.data.id}`, { token });
  check(failed.data.status === 'failed' && !!failed.data.parseError, 'parse failure is persisted for preview');
  console.log(`All ${checks} real-data integration checks passed.`);
} finally {
  // Remove only this run's generated users and their test-owned data.
  if (users.length) {
    const datasets = await Dataset.find({ owner: { $in: users } });
    for (const dataset of datasets) if (dataset.storagePath) await fs.rm(dataset.storagePath, { force: true });
    await Promise.all([
      AISession.deleteMany({ owner: { $in: users } }), Dataset.deleteMany({ owner: { $in: users } }), CleaningJob.deleteMany({ owner: { $in: users } }),
      AuditLog.deleteMany({ owner: { $in: users } }), User.deleteMany({ _id: { $in: users } })
    ]);
  }
  if (server) await new Promise(resolve => server.close(resolve));
  await disconnectDB();
}
