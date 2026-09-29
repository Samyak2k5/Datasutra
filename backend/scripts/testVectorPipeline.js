import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import env from '../src/config/env.js';
import authService from '../src/services/auth.service.js';
import datasetService from '../src/services/dataset.service.js';
import { runDatasetAI } from '../src/ai/aiAnalysis.service.js';
import { executeReviewedPlan } from '../src/ai/aiExecution.service.js';
import { ensureVectorCollection, countVectors, datasetFilter, deleteDatasetVectors } from '../src/ai/vectorStore.service.js';
import User from '../src/models/User.js';
import Dataset from '../src/models/Dataset.js';
import CleaningJob from '../src/models/CleaningJob.js';
import AuditLog from '../src/models/AuditLog.js';
import AISession from '../src/models/AISession.js';

let ownerId; let dataset; let filePath;
try {
  if (!env.openaiApiKey) throw new Error('OPENAI_API_KEY is not configured.');
  await ensureVectorCollection(); // Fail before spending on API calls if Docker storage is unavailable.
  await mongoose.connect(env.mongodbUri, { serverSelectionTimeoutMS: 30000 });
  const account = await authService.register({ name: 'Vector Pipeline Test', email: 'vector-test-' + randomUUID() + '@example.test', password: randomUUID() });
  ownerId = account.user.id;
  const csv = 'Name,City,Email,Phone,Age\n ALICE ,mumbai, ALICE@EXAMPLE.COM ,+91 98765 43210,21\n ALICE ,mumbai, ALICE@EXAMPLE.COM ,+91 98765 43210,21\nBob,pune,invalid-email,bad-phone,\n';
  filePath = path.join(env.uploadDir, 'vector-smoke-' + randomUUID() + '.csv');
  await fs.writeFile(filePath, csv);
  dataset = await datasetService.createDataset({ userId: ownerId, file: { path: filePath, originalname: 'vector-smoke.csv', size: Buffer.byteLength(csv) } });
  const id = String(dataset._id || dataset.id);
  await datasetService.parseDataset(id, ownerId);
  const plan = await runDatasetAI(id, ownerId, 'command', 'Normalize Email, standardize Phone, standardize Name and City, flag missing values, and detect duplicates. Do not remove records or fill missing values.');
  assert.equal(plan.supported, true);
  const expectedOperations = [{ type: 'normalize_email', column: 'Email' }, { type: 'standardize_phone', column: 'Phone' },
    { type: 'standardize_name', column: 'Name' }, { type: 'standardize_location', column: 'City' },
    { type: 'flag_missing_values', column: null }, { type: 'detect_duplicates', column: null }];
  for (const expected of expectedOperations) assert.ok(plan.operations.some(operation => operation.type === expected.type && operation.column === expected.column), 'Missing exact-column operation: ' + JSON.stringify(expected) + '; received: ' + JSON.stringify(plan.operations));
  assert.ok(plan.embeddings.storedChunks > 0);
  const stored = await countVectors(datasetFilter(dataset, plan.embeddings.revision));
  assert.equal(stored, plan.embeddings.storedChunks);
  assert.equal(await countVectors(datasetFilter({ ...dataset.toObject(), owner: new mongoose.Types.ObjectId() }, plan.embeddings.revision)), 0);
  assert.equal(await countVectors(datasetFilter(dataset, 'unrelated-revision')), 0);
  assert.equal(await countVectors(datasetFilter({ ...dataset.toObject(), _id: new mongoose.Types.ObjectId() }, plan.embeddings.revision)), 0);
  const result = await executeReviewedPlan(id, ownerId, plan.operations, plan.sessionId);
  const report = result.comparisonReport;
  assert.equal(report.metrics.originalRows, 3); assert.equal(report.metrics.finalRows, 3);
  assert.equal(report.metrics.missingValuesBefore, 1); assert.equal(report.metrics.missingValuesAfter, 1);
  assert.equal(report.metrics.invalidEmailsBefore, 3); assert.equal(report.metrics.invalidEmailsAfter, 1);
  assert.equal(report.metrics.invalidPhonesBefore, 3); assert.equal(report.metrics.invalidPhonesAfter, 1);
  assert.equal(report.metrics.duplicateGroupsBefore, 1); assert.equal(report.metrics.duplicateGroupsAfter, 1);
  assert.ok(report.metrics.processingTimeMs > 0); assert.ok(report.summary);
  assert.equal(report.apiCalls.embeddings, 2); assert.equal(report.apiCalls.chat, 2); assert.equal(report.apiCalls.total, 4);
  console.log(JSON.stringify({ status: 'PASS', storage: env.qdrantUrl, storedChunks: stored, embeddingModel: env.embeddingModel, chatModel: env.aiModel, metrics: report.metrics, apiCalls: report.apiCalls, summary: report.summary }, null, 2));
} finally {
  if (dataset) {
    await deleteDatasetVectors(dataset);
    assert.equal(await countVectors(datasetFilter(dataset)), 0, 'Test dataset vectors must be removed');
  }
  if (ownerId) await Promise.all([Dataset.deleteMany({ owner: ownerId }), CleaningJob.deleteMany({owner: ownerId}), AISession.deleteMany({ owner: ownerId }), AuditLog.deleteMany({owner: ownerId}), User.deleteOne({_id: ownerId})]);
  if (filePath) await fs.rm(filePath, {force: true});
  await mongoose.disconnect();
}
