import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  streamCsvBatches,
  streamNdjsonBatches,
  sliceBatches,
  processDatasetInBatches
} from '../src/services/batchProcessor.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, 'fixtures_batch');

if (!fs.existsSync(fixturesDir)) {
  fs.mkdirSync(fixturesDir, { recursive: true });
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.info(`[PASS] ${message}`);
    passed++;
  } else {
    console.error(`[FAIL] ${message}`);
    failed++;
  }
}

async function run() {
  console.info('====================================================');
  console.info('🧪 Running PHASE 21 — Large-File Streaming & Batch Processing Tests');
  console.info('====================================================\n');

  // --- Test 1: CSV Streaming Batches ---
  console.info('--- Test 1: CSV Streaming Batches ---');
  const csvRows = ['Name,Email,City,Salary'];
  for (let i = 1; i <= 250; i++) {
    csvRows.push(`Customer ${i},customer${i}@example.com,bombay,${50000 + i}`);
  }
  const csvPath = path.join(fixturesDir, 'large.csv');
  fs.writeFileSync(csvPath, csvRows.join('\n'));

  const csvBatches = [];
  for await (const b of streamCsvBatches(csvPath, 100)) {
    csvBatches.push(b);
  }

  assert(csvBatches.length === 3, '1.1. 250 rows split into 3 batches (100, 100, 50)');
  assert(csvBatches[0].batchRows.length === 100, '1.2. Batch 1 contains 100 rows');
  assert(csvBatches[1].batchRows.length === 100, '1.3. Batch 2 contains 100 rows');
  assert(csvBatches[2].batchRows.length === 50, '1.4. Batch 3 contains 50 rows');
  assert(csvBatches[0].batchRows[0].Name === 'Customer 1', '1.5. First row preserved');

  // --- Test 2: NDJSON Streaming Batches ---
  console.info('\n--- Test 2: NDJSON Streaming Batches ---');
  const ndjsonLines = [];
  for (let i = 1; i <= 150; i++) {
    ndjsonLines.push(
      JSON.stringify({
        id: i,
        Name: `Lead ${i}`,
        Email: `lead${i}@example.com`,
        City: 'delhi'
      })
    );
  }
  const ndjsonPath = path.join(fixturesDir, 'large.ndjson');
  fs.writeFileSync(ndjsonPath, ndjsonLines.join('\n'));

  const ndjsonBatches = [];
  for await (const b of streamNdjsonBatches(ndjsonPath, 60)) {
    ndjsonBatches.push(b);
  }

  assert(ndjsonBatches.length === 3, '2.1. 150 NDJSON rows split into 3 batches (60, 60, 30)');
  assert(ndjsonBatches[0].batchRows.length === 60, '2.2. Batch 1 has 60 rows');
  assert(ndjsonBatches[2].batchRows.length === 30, '2.3. Batch 3 has 30 rows');

  // --- Test 3: Slice Batches Helper ---
  console.info('\n--- Test 3: In-Memory Slice Batches ---');
  const mockRows = Array.from({ length: 45 }, (_, i) => ({ id: i + 1 }));
  const sliceBatchesList = [];
  for await (const b of sliceBatches(mockRows, [{ name: 'id' }], 20)) {
    sliceBatchesList.push(b);
  }
  assert(sliceBatchesList.length === 3, '3.1. 45 rows sliced into 3 batches (20, 20, 5)');

  // --- Test 4: Full Batch Processing Pipeline with Progress Tracking ---
  console.info('\n--- Test 4: Batch Processing Pipeline & Progress Updates ---');
  const progressReports = [];
  const onProgress = async (p) => {
    progressReports.push({ ...p });
  };

  const batchResult = await processDatasetInBatches({
    filePath: csvPath,
    format: 'csv',
    totalExpectedRows: 250,
    batchSize: 100,
    cleaningMode: 'rules_only',
    onProgress
  });

  assert(progressReports.length === 3, '4.1. onProgress called 3 times (once per batch)');
  assert(progressReports[0].currentBatch === 1, '4.2. First progress report is batch 1');
  assert(progressReports[0].processedRecords === 100, '4.3. Processed records is 100 after batch 1');
  assert(progressReports[2].progressPercent === 100, '4.4. Final progress report is 100%');
  assert(batchResult.metrics.totalRows === 250, '4.5. Aggregated metrics totalRows is 250');
  assert(batchResult.metrics.modifiedRows === 250, '4.6. All 250 bombay values normalized to Mumbai');

  // --- Test 5: Memory-Safe Preview (Bounded to 20 Rows) ---
  console.info('\n--- Test 5: Memory Safety & Bounded Preview ---');
  assert(batchResult.preview.length === 20, '5.1. Preview strictly bounded to 20 rows despite 250 total rows');
  assert(batchResult.preview[0].cleaned.City === 'Mumbai', '5.2. Preview contains cleaned values');

  // --- Test 6: AI Unresolved Candidates Strictly Bounded by Batch ---
  console.info('\n--- Test 6: AI Processing Bounded by Batch ---');
  // Create dataset where only a few rows have unresolved values
  const aiRows = ['Name,Email,City'];
  for (let i = 1; i <= 60; i++) {
    if (i === 15) {
      aiRows.push(`Customer ${i},not-an-email,Mumbai`); // Unresolved candidate (format issue)
    } else if (i === 45) {
      aiRows.push(`Customer ${i},another-invalid-email,Mumbai`); // Unresolved candidate (format issue)
    } else {
      aiRows.push(`Customer ${i},customer${i}@example.com,Mumbai`); // Clean
    }
  }
  const aiCsvPath = path.join(fixturesDir, 'ai_batch.csv');
  fs.writeFileSync(aiCsvPath, aiRows.join('\n'));

  const aiProgressReports = [];
  const aiBatchResult = await processDatasetInBatches({
    filePath: aiCsvPath,
    format: 'csv',
    totalExpectedRows: 60,
    batchSize: 30, // 2 batches of 30
    cleaningMode: 'rules_then_ai',
    options: { aiProvider: 'mock' },
    onProgress: async (p) => aiProgressReports.push(p)
  });

  assert(aiBatchResult.metrics.totalRows === 60, '6.1. Total rows processed is 60');
  assert(aiBatchResult.metrics.aiCandidates >= 2, '6.2. Only unresolved rows flagged as AI candidates');
  assert(aiBatchResult.totalBatches === 2, '6.3. Exactly 2 batches executed');

  // Cleanup test fixtures
  try {
    fs.rmSync(fixturesDir, { recursive: true, force: true });
  } catch {
    // ignore
  }

  console.info('\n====================================================');
  console.info(`🎉 PHASE 21 Tests Completed: ${passed} passed, ${failed} failed`);
  console.info('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
