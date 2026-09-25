/**
 * Step 14.6 Performance & Concurrency Benchmarks
 * Evaluates real timings, memory usage, throughput (rows/sec), and concurrency
 * across Small (50 rows), Medium (500 rows), and Large (2,000 rows) datasets.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import app from '../src/app.js';
import env from '../src/config/env.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import User from '../src/models/User.js';
import Dataset from '../src/models/Dataset.js';
import CleaningJob from '../src/models/CleaningJob.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

function generateDirtyCsv(rowCount) {
  const headers = 'id,first_name,last_name,email,phone,city,state,salary,join_date\n';
  const cities = ['New York', 'San Francisco', 'Chicago', 'Austin', 'Seattle', 'Boston', 'Los Angeles'];
  const states = ['NY', 'CA', 'IL', 'TX', 'WA', 'MA', 'CA'];
  const rows = [];

  for (let i = 1; i <= rowCount; i++) {
    // Inject realistic dirtiness:
    // Every 5th row has messy email
    // Every 7th row has non-standard phone format
    // Every 10th row is a duplicate
    // Every 4th row has leading/trailing whitespace
    const isDup = i % 10 === 0;
    const effId = isDup ? i - 1 : i;
    const rawFirst = isDup ? ` DuplicateUser_${effId} ` : (i % 4 === 0 ? `  User${effId}  ` : `User${effId}`);
    const rawLast = `Test${effId}`;
    const rawEmail = i % 5 === 0 ? ` USER${effId}@EXAMPLE.COM ` : (i % 15 === 0 ? `invalid-email-${effId}` : `user${effId}@example.com`);
    const rawPhone = i % 7 === 0 ? `+1 (555) 019-${String(effId).padStart(4, '0')}` : `555019${String(effId).padStart(4, '0')}`;
    const cityIdx = i % cities.length;
    const rawCity = i % 8 === 0 ? cities[cityIdx].toLowerCase() : cities[cityIdx];
    const rawState = states[cityIdx];
    const rawSalary = i % 6 === 0 ? `$${50000 + i * 10}` : `${50000 + i * 10}`;
    const rawDate = `2024-0${(i % 9) + 1}-15`;

    rows.push(`${i},"${rawFirst}","${rawLast}","${rawEmail}","${rawPhone}","${rawCity}","${rawState}","${rawSalary}","${rawDate}"`);
  }

  return headers + rows.join('\n');
}

async function runBenchmarks() {
  console.log('====================================================');
  console.log('⚡ STEP 14.6 — Performance & Scale Benchmark Suite');
  console.log('====================================================\n');

  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }

  // Connect to DB
  await connectDB();
  console.log('✔ Connected to MongoDB for benchmark testing');

  // Start ephemeral server
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}${env.apiPrefix}`;
  console.log(`✔ Benchmark server listening on ${baseUrl}\n`);

  const results = {
    small: null,
    medium: null,
    large: null,
    concurrency: null,
    memory: null
  };

  try {
    // 1. Setup Benchmark User
    const regRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Benchmark Engineer',
        email: `bench_${Date.now()}@datasutra.test`,
        password: 'Password123!',
        organization: 'Performance Labs'
      })
    });
    const regData = await regRes.json();
    const token = regData.data.accessToken;
    const userId = regData.data.user.id;

    // Helper to upload, parse, and clean a dataset
    async function benchmarkDataset(name, rowCount) {
      console.log(`--- Benchmarking ${name} (${rowCount} rows) ---`);
      if (global.gc) global.gc();
      const memBefore = process.memoryUsage();

      const csvContent = generateDirtyCsv(rowCount);
      const csvPath = path.join(UPLOADS_DIR, `bench_${rowCount}_${Date.now()}.csv`);
      fs.writeFileSync(csvPath, csvContent);
      const fileSizeKb = (fs.statSync(csvPath).size / 1024).toFixed(2);

      // 1. Upload Phase
      const form = new FormData();
      form.append('name', `${name} Dataset`);
      form.append('file', new Blob([csvContent], { type: 'text/csv' }), `bench_${rowCount}.csv`);

      const uploadStart = performance.now();
      const uploadRes = await fetch(`${baseUrl}/datasets`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: form
      });
      const uploadDurationMs = performance.now() - uploadStart;
      const uploadData = await uploadRes.json();
      const datasetId = uploadData.data.id;

      // 2. Parse Phase
      const parseStart = performance.now();
      const parseRes = await fetch(`${baseUrl}/datasets/${datasetId}/parse`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const parseDurationMs = performance.now() - parseStart;
      const parseData = await parseRes.json();

      // 3. Clean Phase (rules_then_ai)
      const cleanStart = performance.now();
      const cleanRes = await fetch(`${baseUrl}/datasets/${datasetId}/clean`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          cleaningStrategy: 'rules_then_ai',
          generateQualityReport: true
        })
      });
      const cleanDurationMs = performance.now() - cleanStart;
      const cleanData = await cleanRes.json();
      const jobId = cleanData.data.job.id;

      // 4. Job Details
      const jobRes = await fetch(`${baseUrl}/cleaning-jobs/${jobId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const jobData = await jobRes.json();

      const memAfter = process.memoryUsage();
      const heapDeltaMb = ((memAfter.heapUsed - memBefore.heapUsed) / (1024 * 1024)).toFixed(2);
      const totalTimeMs = uploadDurationMs + parseDurationMs + cleanDurationMs;
      const throughputRowsPerSec = ((rowCount / (cleanDurationMs / 1000))).toFixed(1);

      // Clean temp file
      if (fs.existsSync(csvPath)) fs.unlinkSync(csvPath);

      const metrics = {
        name,
        rowCount,
        fileSizeKb: `${fileSizeKb} KB`,
        uploadDurationMs: uploadDurationMs.toFixed(1),
        parseDurationMs: parseDurationMs.toFixed(1),
        cleanDurationMs: cleanDurationMs.toFixed(1),
        totalTimeMs: totalTimeMs.toFixed(1),
        throughput: `${throughputRowsPerSec} rows/sec`,
        duplicatesFound: jobData.data.job.recordsModified?.duplicatesRemoved || 0,
        rulesTriggered: jobData.data.job.ruleExecutions?.length || 0,
        aiCandidates: jobData.data.job.aiSuggestedModifications?.length || 0,
        qualityScoreBefore: jobData.data.job.qualityScore?.overallBefore || 'N/A',
        qualityScoreAfter: jobData.data.job.qualityScore?.overallAfter || 'N/A',
        heapUsedMb: (memAfter.heapUsed / (1024 * 1024)).toFixed(2),
        heapDeltaMb: `${heapDeltaMb > 0 ? '+' : ''}${heapDeltaMb} MB`
      };

      console.log(`  Upload:     ${metrics.uploadDurationMs}ms (${fileSizeKb} KB)`);
      console.log(`  Parse:      ${metrics.parseDurationMs}ms`);
      console.log(`  Clean:      ${metrics.cleanDurationMs}ms (${metrics.throughput})`);
      console.log(`  AI Cands:   ${metrics.aiCandidates}`);
      console.log(`  Heap Delta: ${metrics.heapDeltaMb}`);
      console.log(`  Quality:    ${metrics.qualityScoreBefore} -> ${metrics.qualityScoreAfter}\n`);

      return metrics;
    }

    // Run benchmarks
    results.small = await benchmarkDataset('Small', 50);
    results.medium = await benchmarkDataset('Medium', 500);
    results.large = await benchmarkDataset('Large', 2000);

    // 4. Concurrency Test: 5 concurrent uploads & parses
    console.log('--- Concurrency Test (5 Simultaneous Client Requests) ---');
    const concurrencyCount = 5;
    const concurrentCsvs = [];
    for (let c = 0; c < concurrencyCount; c++) {
      concurrentCsvs.push(generateDirtyCsv(100));
    }

    const concurrencyStart = performance.now();
    const concurrentPromises = concurrentCsvs.map(async (csvStr, idx) => {
      const form = new FormData();
      form.append('name', `Concurrent Dataset ${idx + 1}`);
      form.append('file', new Blob([csvStr], { type: 'text/csv' }), `concurrent_${idx}.csv`);

      const reqStart = performance.now();
      const upRes = await fetch(`${baseUrl}/datasets`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: form
      });
      const upData = await upRes.json();
      const dId = upData.data.id;

      const pRes = await fetch(`${baseUrl}/datasets/${dId}/parse`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const pData = await pRes.json();
      const reqDuration = performance.now() - reqStart;

      return {
        idx,
        status: pRes.status,
        durationMs: reqDuration,
        parsedRows: pData?.data?.dataset?.metadata?.rowCount || pData?.data?.metadata?.rowCount
      };
    });

    const concurrentResults = await Promise.all(concurrentPromises);
    const totalConcurrencyTime = performance.now() - concurrencyStart;
    const successfulRequests = concurrentResults.filter(r => r.status === 200).length;
    const avgDuration = (concurrentResults.reduce((acc, r) => acc + r.durationMs, 0) / concurrencyCount).toFixed(1);

    results.concurrency = {
      concurrencyCount,
      totalDurationMs: totalConcurrencyTime.toFixed(1),
      successfulRequests,
      successRate: `${(successfulRequests / concurrencyCount) * 100}%`,
      avgRequestDurationMs: avgDuration
    };

    console.log(`  Concurrent Requests:  ${concurrencyCount}`);
    console.log(`  Success Rate:         ${results.concurrency.successRate}`);
    console.log(`  Total Batch Duration: ${results.concurrency.totalDurationMs}ms`);
    console.log(`  Average Per-Request:  ${results.concurrency.avgRequestDurationMs}ms\n`);

    // 5. Memory Leak Verification
    const finalMem = process.memoryUsage();
    results.memory = {
      rssMb: (finalMem.rss / (1024 * 1024)).toFixed(2),
      heapTotalMb: (finalMem.heapTotal / (1024 * 1024)).toFixed(2),
      heapUsedMb: (finalMem.heapUsed / (1024 * 1024)).toFixed(2),
      externalMb: (finalMem.external / (1024 * 1024)).toFixed(2)
    };

    console.log('--- Memory Stability ---');
    console.log(`  Heap Total: ${results.memory.heapTotalMb} MB`);
    console.log(`  Heap Used:  ${results.memory.heapUsedMb} MB`);
    console.log(`  RSS:        ${results.memory.rssMb} MB\n`);

    // Cleanup DB benchmark data
    await Dataset.deleteMany({ owner: userId });
    await CleaningJob.deleteMany({ createdBy: userId });
    await User.findByIdAndDelete(userId);

    console.log('====================================================');
    console.log('📊 PERFORMANCE BENCHMARK SUMMARY TABLE:');
    console.log('====================================================');
    console.table([
      {
        Tier: 'Small (50 rows)',
        Size: results.small.fileSizeKb,
        Upload: `${results.small.uploadDurationMs}ms`,
        Parse: `${results.small.parseDurationMs}ms`,
        Clean: `${results.small.cleanDurationMs}ms`,
        Throughput: results.small.throughput,
        AICandidates: results.small.aiCandidates,
        HeapDelta: results.small.heapDeltaMb
      },
      {
        Tier: 'Medium (500 rows)',
        Size: results.medium.fileSizeKb,
        Upload: `${results.medium.uploadDurationMs}ms`,
        Parse: `${results.medium.parseDurationMs}ms`,
        Clean: `${results.medium.cleanDurationMs}ms`,
        Throughput: results.medium.throughput,
        AICandidates: results.medium.aiCandidates,
        HeapDelta: results.medium.heapDeltaMb
      },
      {
        Tier: 'Large (2,000 rows)',
        Size: results.large.fileSizeKb,
        Upload: `${results.large.uploadDurationMs}ms`,
        Parse: `${results.large.parseDurationMs}ms`,
        Clean: `${results.large.cleanDurationMs}ms`,
        Throughput: results.large.throughput,
        AICandidates: results.large.aiCandidates,
        HeapDelta: results.large.heapDeltaMb
      }
    ]);

    console.log('Concurrency Benchmark:');
    console.log(JSON.stringify(results.concurrency, null, 2));

  } finally {
    await disconnectDB();
    server.close();
  }
}

runBenchmarks().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
