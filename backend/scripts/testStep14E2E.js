import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import app from '../src/app.js';
import env from '../src/config/env.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import User from '../src/models/User.js';
import Dataset from '../src/models/Dataset.js';
import CleaningJob from '../src/models/CleaningJob.js';
import AuditLog from '../src/models/AuditLog.js';
import { parseDOC } from '../src/parsers/doc.parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, 'fixtures_e2e');

if (!fs.existsSync(fixturesDir)) {
  fs.mkdirSync(fixturesDir, { recursive: true });
}

const runTests = async () => {
  console.info('====================================================');
  console.info('🧪 Running STEP 14.1–14.5 — Full End-to-End System Tests');
  console.info('====================================================\n');

  let testPassed = 0;
  let testFailed = 0;

  const assert = (condition, description) => {
    if (condition) {
      console.info(`[PASS] ${description}`);
      testPassed++;
    } else {
      console.error(`[FAIL] ${description}`);
      testFailed++;
      throw new Error(`Assertion failed: ${description}`);
    }
  };

  await connectDB();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;
  console.info(`✔ Ephemeral test server listening on ${baseUrl}\n`);

  const trackedUserIds = [];
  const trackedDatasetIds = [];
  const trackedJobIds = [];

  try {
    // =========================================================================
    // SECTION 14.1 & 14.3: COMPLETE AUTH & USER E2E FLOW
    // =========================================================================
    console.info('--- 14.1 & 14.3: Authentication, Session & Isolation E2E ---');

    // 1. Register User 1
    const email1 = `e2e_user1_${Date.now()}@example.com`;
    const regRes1 = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alpha Operator', email: email1, password: 'SecurePassword123!' })
    });
    const regData1 = await regRes1.json();
    assert(regRes1.status === 201, '14.1.1 User 1 registered with HTTP 201 Created');
    const token1 = regData1.data.accessToken;
    const user1Id = regData1.data.user.id;
    trackedUserIds.push(user1Id);

    // 2. Register User 2
    const email2 = `e2e_user2_${Date.now()}@example.com`;
    const regRes2 = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Beta Tenant', email: email2, password: 'SecurePassword123!' })
    });
    const regData2 = await regRes2.json();
    assert(regRes2.status === 201, '14.1.2 User 2 registered with HTTP 201 Created');
    const token2 = regData2.data.accessToken;
    const user2Id = regData2.data.user.id;
    trackedUserIds.push(user2Id);

    // 3. Login User 1
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email1, password: 'SecurePassword123!' })
    });
    const loginData = await loginRes.json();
    assert(loginRes.status === 200, '14.1.3 Login successful with HTTP 200 OK');
    assert(loginData.data.accessToken, '14.1.4 Login issued fresh access token');
    assert(!('password' in loginData.data.user), '14.1.5 Password field never exposed in login response');
    assert(!('passwordHash' in loginData.data.user), '14.1.6 PasswordHash never exposed in login response');

    // 4. Invalid Login
    const badLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email1, password: 'WrongPassword!' })
    });
    assert(badLoginRes.status === 401, '14.1.7 Bad login rejected with HTTP 401 Unauthorized');

    // 5. Auth Token Integrity: Missing, Malformed & Invalid Tokens
    const noTokenRes = await fetch(`${baseUrl}/auth/me`);
    assert(noTokenRes.status === 401, '14.1.8 Request without token rejected with HTTP 401');

    const badTokenRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: 'Bearer this.is.an.invalid.token' }
    });
    assert(badTokenRes.status === 401, '14.1.9 Malformed JWT rejected with HTTP 401');

    // 6. User 1 /auth/me
    const meRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${token1}` }
    });
    const meData = await meRes.json();
    assert(meRes.status === 200, '14.1.10 GET /auth/me returns HTTP 200 for authenticated user');
    const userEmail = meData.data.user?.email || meData.data.email;
    assert(userEmail === email1.toLowerCase(), '14.1.11 /auth/me returns correct user data');

    // 7. Logout
    const logoutRes = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}` }
    });
    assert(logoutRes.status === 200, '14.1.12 POST /auth/logout returns HTTP 200');

    // =========================================================================
    // SECTION 14.2 & 14.4: MULTI-FORMAT PARSING & FULL CLEANING PIPELINE E2E
    // =========================================================================
    console.info('\n--- 14.2 & 14.4: Multi-Format Upload, Parsing & Cleaning Flow ---');

    // Helper to upload, parse, and verify a dataset
    const uploadAndParse = async (fileName, mimeType, fileContent, datasetName) => {
      const form = new FormData();
      form.append('name', datasetName);
      form.append('file', new Blob([fileContent], { type: mimeType }), fileName);

      const upRes = await fetch(`${baseUrl}/datasets`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token1}` },
        body: form
      });
      const upData = await upRes.json();
      assert(upRes.status === 201, `Upload ${fileName} returns HTTP 201 Created`);
      const dsId = upData.data.id;
      trackedDatasetIds.push(dsId);

      const parseRes = await fetch(`${baseUrl}/datasets/${dsId}/parse`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token1}` }
      });
      const parseData = await parseRes.json();
      assert(parseRes.status === 200, `Parse ${fileName} returns HTTP 200 OK`);

      return { dsId, parseData };
    };

    // 1. Format: CSV
    const csvData =
      'Name,Email,Phone,City,Salary\n' +
      '  RAHUL SHARMA , RAHUL@GMAIL.COM ,+91 98765 43210, bombay , 75000 \n' +
      'Priya Shah,priya@example.com,9988776655,Pune,85000\n' +
      'Amit Verma,,9876543211,Delhi,60000\n' +
      'Rahul Sharma,rahul@gmail.com,9876543210,Mumbai,75000\n';
    const { dsId: csvDatasetId } = await uploadAndParse('leads.csv', 'text/csv', csvData, 'CSV Lead Dataset');

    // 2. Format: JSON Array
    const jsonData = JSON.stringify([
      { name: 'Sunil Mehta', email: 'sunil@example.com', city: 'bombay' },
      { name: 'Deepa Rao', email: 'deepa@example.com', city: 'bangalore' }
    ]);
    const { dsId: jsonDatasetId } = await uploadAndParse('users.json', 'application/json', jsonData, 'JSON User Feed');

    // 3. Format: NDJSON
    const ndjsonData =
      JSON.stringify({ name: 'Vikram Singh', email: 'vikram@example.com', city: 'Delhi' }) + '\n' +
      JSON.stringify({ name: 'Ananya Roy', email: 'ananya@example.com', city: 'Kolkata' }) + '\n';
    const { dsId: ndjsonDatasetId } = await uploadAndParse('stream.ndjson', 'application/x-ndjson', ndjsonData, 'NDJSON Event Stream');

    // 4. Format: Legacy .doc controlled handling
    const dummyDocPath = path.join(fixturesDir, 'legacy.doc');
    const legacyDocBuffer = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0x00]);
    fs.writeFileSync(dummyDocPath, legacyDocBuffer);
    let docErr = null;
    try {
      await parseDOC(dummyDocPath);
    } catch (err) {
      docErr = err;
    }
    assert(docErr !== null, '14.2.1 Legacy .doc returns controlled error');
    assert(docErr.message.includes('UNSUPPORTED_LEGACY_DOC'), '14.2.2 Legacy .doc returns clear UNSUPPORTED_LEGACY_DOC guidance');

    // 5. Cross-User Dataset Protection (Multi-Tenant Authorization)
    const crossGetRes = await fetch(`${baseUrl}/datasets/${csvDatasetId}`, {
      headers: { Authorization: `Bearer ${token2}` }
    });
    assert(crossGetRes.status === 403, '14.3.1 User 2 cannot access User 1 dataset (HTTP 403 Forbidden)');

    const crossParseRes = await fetch(`${baseUrl}/datasets/${csvDatasetId}/parse`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token2}` }
    });
    assert(crossParseRes.status === 403, '14.3.2 User 2 cannot parse User 1 dataset (HTTP 403 Forbidden)');

    const crossCleanRes = await fetch(`${baseUrl}/datasets/${csvDatasetId}/clean`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token2}` }
    });
    assert(crossCleanRes.status === 403, '14.3.3 User 2 cannot clean User 1 dataset (HTTP 403 Forbidden)');

    // =========================================================================
    // SECTION 14.4 & 14.1 CONTINUED: CLEANING ENGINE, AI FALLBACK & REVIEW
    // =========================================================================
    console.info('\n--- 14.1 & 14.4: Cleaning Engine, Rules_Then_AI & Review Operations ---');

    // Clean CSV Dataset with rules_then_ai mode
    const cleanRes = await fetch(`${baseUrl}/datasets/${csvDatasetId}/clean`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token1}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        cleaningMode: 'rules_then_ai',
        country: 'IN'
      })
    });
    const cleanData = await cleanRes.json();
    assert(cleanRes.status === 200, '14.4.1 POST /clean with rules_then_ai returns HTTP 200 OK');
    const jobId = cleanData.data.job.id;
    trackedJobIds.push(jobId);

    // Verify Cleaning Job details
    const jobRes = await fetch(`${baseUrl}/cleaning-jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${token1}` }
    });
    const jobData = await jobRes.json();
    assert(jobRes.status === 200, '14.4.2 GET /cleaning-jobs/:jobId returns HTTP 200');
    assert(jobData.data.job.status === 'completed', '14.4.3 Job status is "completed"');
    assert(jobData.data.job.totalRecords === 4, '14.4.4 Job total records is 4');
    assert(jobData.data.job.duplicateRecords === 1, '14.4.5 Exactly 1 duplicate record identified');

    // Verify Review Items generated
    const reviewListRes = await fetch(`${baseUrl}/cleaning-jobs/${jobId}/review`, {
      headers: { Authorization: `Bearer ${token1}` }
    });
    const reviewListData = await reviewListRes.json();
    assert(reviewListRes.status === 200, '14.4.6 GET /review returns HTTP 200');
    assert(Array.isArray(reviewListData.data.items), '14.4.7 Review items returned as array');

    // Create a known review item for accept/reject/edit verification
    const dbJob = await CleaningJob.findById(jobId);
    dbJob.reviewItems.push(
      {
        reviewId: 'e2e-rev-acc',
        dataset: csvDatasetId,
        cleaningJob: jobId,
        rowNumber: 1,
        field: 'city',
        originalValue: 'bombay',
        suggestedValue: 'Mumbai',
        source: 'rule_engine',
        reason: 'Standardized legacy city name',
        confidence: 0.99,
        status: 'pending'
      },
      {
        reviewId: 'e2e-rev-rej',
        dataset: csvDatasetId,
        cleaningJob: jobId,
        rowNumber: 3,
        field: 'email',
        originalValue: '',
        suggestedValue: 'amit.verma@example.com',
        source: 'ai',
        reason: 'AI model proposed email imputation',
        confidence: 0.65,
        status: 'pending'
      },
      {
        reviewId: 'e2e-rev-edit',
        dataset: csvDatasetId,
        cleaningJob: jobId,
        rowNumber: 2,
        field: 'city',
        originalValue: 'Pune',
        suggestedValue: 'Poona',
        source: 'ai',
        reason: 'Historical alias suggested',
        confidence: 0.70,
        status: 'pending'
      }
    );
    dbJob.markModified('reviewItems');
    await dbJob.save();

    // Test Accept
    const acceptRes = await fetch(`${baseUrl}/cleaning-jobs/${jobId}/review/e2e-rev-acc/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}` }
    });
    const acceptData = await acceptRes.json();
    assert(acceptRes.status === 200, '14.4.8 Accept review item returned HTTP 200');
    assert(acceptData.data.item.status === 'accepted', '14.4.9 Review item status updated to "accepted"');
    assert(acceptData.data.item.approvedValue === 'Mumbai', '14.4.10 approvedValue matches suggestedValue');

    // Test Reject (preserves raw original)
    const rejectRes = await fetch(`${baseUrl}/cleaning-jobs/${jobId}/review/e2e-rev-rej/reject`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}` }
    });
    const rejectData = await rejectRes.json();
    assert(rejectRes.status === 200, '14.4.11 Reject review item returned HTTP 200');
    assert(rejectData.data.item.status === 'rejected', '14.4.12 Review item status updated to "rejected"');
    assert(rejectData.data.item.approvedValue === '', '14.4.13 Discarded suggestion and strictly preserved original value');

    // Test Edit (custom operator value)
    const editRes = await fetch(`${baseUrl}/cleaning-jobs/${jobId}/review/e2e-rev-edit/edit`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token1}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ editedValue: 'Pune Metro' })
    });
    const editData = await editRes.json();
    assert(editRes.status === 200, '14.4.14 Edit review item returned HTTP 200');
    assert(editData.data.item.status === 'edited', '14.4.15 Review item status updated to "edited"');
    assert(editData.data.item.approvedValue === 'Pune Metro', '14.4.16 approvedValue matches custom value');

    // =========================================================================
    // SECTION 14.1 FINAL REPORT & EXPORT E2E
    // =========================================================================
    console.info('\n--- 14.1 & 14.4: Quality Report & Multi-Format Export E2E ---');

    // Get Report
    const reportRes = await fetch(`${baseUrl}/cleaning-jobs/${jobId}/report`, {
      headers: { Authorization: `Bearer ${token1}` }
    });
    const reportData = await reportRes.json();
    assert(reportRes.status === 200, '14.4.17 GET /report returns HTTP 200');
    assert(typeof reportData.data.qualityScore.overall === 'number', '14.4.18 Transparent qualityScore present');
    assert(reportData.data.reviewSummary.accepted >= 1, '14.4.19 Report reflects accepted review items');
    assert(reportData.data.reviewSummary.rejected >= 1, '14.4.20 Report reflects rejected review items');
    assert(reportData.data.reviewSummary.edited >= 1, '14.4.21 Report reflects edited review items');

    // Export CSV
    const csvExpRes = await fetch(`${baseUrl}/cleaning-jobs/${jobId}/export?format=csv`, {
      headers: { Authorization: `Bearer ${token1}` }
    });
    assert(csvExpRes.status === 200, '14.4.22 CSV export returned HTTP 200');
    assert(csvExpRes.headers.get('content-type').includes('text/csv'), '14.4.23 CSV Content-Type is text/csv');
    const csvExpText = await csvExpRes.text();
    assert(csvExpText.includes('Mumbai'), '14.4.24 Cleaned / approved values present in CSV export');
    assert(csvExpText.includes('Pune Metro'), '14.4.25 Edited review values present in CSV export');

    // Export JSON
    const jsonExpRes = await fetch(`${baseUrl}/cleaning-jobs/${jobId}/export?format=json`, {
      headers: { Authorization: `Bearer ${token1}` }
    });
    assert(jsonExpRes.status === 200, '14.4.26 JSON export returned HTTP 200');
    const jsonExpData = await jsonExpRes.json();
    assert(Array.isArray(jsonExpData), '14.4.27 JSON export is an array of records');

    // Export PDF/Text Summary
    const pdfExpRes = await fetch(`${baseUrl}/cleaning-jobs/${jobId}/export?format=pdf`, {
      headers: { Authorization: `Bearer ${token1}` }
    });
    assert(pdfExpRes.status === 200, '14.4.28 PDF/Text summary export returned HTTP 200');
    const pdfExpText = await pdfExpRes.text();
    assert(pdfExpText.includes('DATASUTRA DATA CLEANING & QUALITY AUDIT REPORT'), '14.4.29 PDF audit report includes header');

    // =========================================================================
    // SECTION 14.5: FAILURE TESTING & RESILIENCE
    // =========================================================================
    console.info('\n--- 14.5: Failure Scenarios & Edge Cases ---');

    // 1. Unsupported File Extension (.exe)
    const badExtForm = new FormData();
    badExtForm.append('name', 'Malicious Upload');
    badExtForm.append('file', new Blob(['MZ\x90\x00\x03\x00'], { type: 'application/x-msdownload' }), 'virus.exe');
    const badExtRes = await fetch(`${baseUrl}/datasets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}` },
      body: badExtForm
    });
    assert(badExtRes.status === 400, '14.5.1 Unsupported .exe file rejected with HTTP 400');

    // 2. Corrupted PDF (Invalid magic bytes)
    const badPdfForm = new FormData();
    badPdfForm.append('name', 'Corrupt PDF');
    badPdfForm.append('file', new Blob(['NOT_A_PDF_DOCUMENT_GARBAGE'], { type: 'application/pdf' }), 'corrupted.pdf');
    const badPdfRes = await fetch(`${baseUrl}/datasets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}` },
      body: badPdfForm
    });
    const badPdfData = await badPdfRes.json();
    assert(badPdfRes.status === 201, '14.5.2 Upload raw PDF accepted');
    const badPdfId = badPdfData.data.id;
    trackedDatasetIds.push(badPdfId);

    const badPdfParseRes = await fetch(`${baseUrl}/datasets/${badPdfId}/parse`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}` }
    });
    assert(badPdfParseRes.status === 400, '14.5.3 Corrupted PDF magic bytes rejected on parse with HTTP 400 Bad Request');

    // 3. Malformed JSON
    const badJsonForm = new FormData();
    badJsonForm.append('name', 'Broken JSON');
    badJsonForm.append('file', new Blob(['{ "name": "Broken", incomplete...'], { type: 'application/json' }), 'broken.json');
    const badJsonRes = await fetch(`${baseUrl}/datasets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}` },
      body: badJsonForm
    });
    const badJsonData = await badJsonRes.json();
    assert(badJsonRes.status === 201, '14.5.3 Upload accepts raw file');
    const badJsonId = badJsonData.data.id;
    trackedDatasetIds.push(badJsonId);

    const badJsonParseRes = await fetch(`${baseUrl}/datasets/${badJsonId}/parse`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}` }
    });
    assert(badJsonParseRes.status === 400, '14.5.4 Parsing malformed JSON gracefully rejected with HTTP 400');
    const dbBadJson = await Dataset.findById(badJsonId);
    assert(dbBadJson.status === 'failed', '14.5.5 Dataset status transitioned to "failed" without crashing');

    // 4. Broken DOCX (Invalid ZIP magic bytes)
    const badDocxForm = new FormData();
    badDocxForm.append('name', 'Fake DOCX');
    badDocxForm.append('file', new Blob(['PK_NOT_A_REAL_ZIP'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), 'broken.docx');
    const badDocxRes = await fetch(`${baseUrl}/datasets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}` },
      body: badDocxForm
    });
    const badDocxData = await badDocxRes.json();
    assert(badDocxRes.status === 201, '14.5.6 Upload raw DOCX accepted');
    const badDocxId = badDocxData.data.id;
    trackedDatasetIds.push(badDocxId);

    const badDocxParseRes = await fetch(`${baseUrl}/datasets/${badDocxId}/parse`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}` }
    });
    assert(badDocxParseRes.status === 400, '14.5.7 Spoofed DOCX rejected on parse with HTTP 400');

    // 5. Oversized File (>25MB)
    const bigBuffer = new Uint8Array(26 * 1024 * 1024);
    const bigForm = new FormData();
    bigForm.append('name', 'Too Big');
    bigForm.append('file', new Blob([bigBuffer], { type: 'text/csv' }), 'oversized.csv');
    const bigRes = await fetch(`${baseUrl}/datasets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}` },
      body: bigForm
    });
    assert(bigRes.status === 413, '14.5.7 Oversized upload rejected with HTTP 413 Payload Too Large');

    // 6. JSON API SSRF Protection (Localhost / Loopback / Cloud Metadata rejection)
    const ssrfRes = await fetch(`${baseUrl}/datasets/import/json-api`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token1}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'SSRF Attack',
        endpointUrl: 'http://169.254.169.254/latest/meta-data/'
      })
    });
    assert(ssrfRes.status === 400, '14.5.8 SSRF against AWS metadata 169.254.169.254 rejected with HTTP 400');

    const loopbackRes = await fetch(`${baseUrl}/datasets/import/json-api`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token1}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Loopback Attack',
        endpointUrl: 'http://127.0.0.1:27017'
      })
    });
    assert(loopbackRes.status === 400, '14.5.9 SSRF against loopback 127.0.0.1 rejected with HTTP 400');

    // 7. Non-existent Job ID
    const missingJobRes = await fetch(`${baseUrl}/cleaning-jobs/507f1f77bcf86cd799439011`, {
      headers: { Authorization: `Bearer ${token1}` }
    });
    assert(missingJobRes.status === 404, '14.5.10 Missing job ID returns HTTP 404 Not Found');

    // 8. Health check endpoint responds operational
    const healthRes = await fetch(`${baseUrl}/health`);
    const healthData = await healthRes.json();
    assert(healthRes.status === 200, '14.5.11 GET /health returns HTTP 200');
    assert(healthData.data.status === 'healthy', '14.5.12 Health status is "healthy"');
    assert(healthData.data.services.database === 'connected', '14.5.13 Database status is "connected"');

  } finally {
    // Teardown
    for (const uid of trackedUserIds) {
      await User.findByIdAndDelete(uid);
    }
    for (const did of trackedDatasetIds) {
      const d = await Dataset.findById(did);
      if (d && d.storagePath && fs.existsSync(d.storagePath)) {
        try { fs.unlinkSync(d.storagePath); } catch {}
      }
      await Dataset.findByIdAndDelete(did);
      await AuditLog.deleteMany({ dataset: did });
    }
    for (const jid of trackedJobIds) {
      await CleaningJob.findByIdAndDelete(jid);
      await AuditLog.deleteMany({ cleaningJob: jid });
    }

    if (fs.existsSync(fixturesDir)) {
      try { fs.rmSync(fixturesDir, { recursive: true, force: true }); } catch {}
    }

    await new Promise((resolve) => server.close(resolve));
    await disconnectDB();
    console.info('✔ Cleaned up test database entities & stopped ephemeral server');
  }

  console.info('\n====================================================');
  console.info(`🎉 STEP 14 E2E TESTS SUMMARY: ${testPassed} Passed, ${testFailed} Failed`);
  console.info('====================================================');

  if (testFailed > 0) {
    process.exit(1);
  }
};

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
