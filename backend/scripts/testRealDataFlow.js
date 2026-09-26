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
      Dataset.deleteMany({ owner: { $in: users } }), CleaningJob.deleteMany({ owner: { $in: users } }),
      AuditLog.deleteMany({ owner: { $in: users } }), User.deleteMany({ _id: { $in: users } })
    ]);
  }
  if (server) await new Promise(resolve => server.close(resolve));
  await disconnectDB();
}
