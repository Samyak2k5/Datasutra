import http from 'http';
import fs from 'fs';
import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import User from '../src/models/User.js';
import Dataset from '../src/models/Dataset.js';
import CleaningJob from '../src/models/CleaningJob.js';
import AuditLog from '../src/models/AuditLog.js';

import {
  detectDuplicates,
  selectCanonicalCandidate,
  detectConflicts,
  createDuplicateRelationships,
  calculateDuplicateMetrics,
  DisjointSet
} from '../src/cleaning/duplicate/duplicateDetector.js';
import { processDatasetRows, classifyRow } from '../src/cleaning/pipeline/rulePipeline.js';
import { FieldType } from '../src/cleaning/rules/fieldTypeDetector.js';
import { RowClassification, IssueSeverity } from '../src/cleaning/schemas/cleaningResult.schema.js';

const runTests = async () => {
  console.info('====================================================');
  console.info('🧪 Running STEP 8 — Advanced Duplicate Detection Tests');
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

  const colTypes = new Map([
    ['name', FieldType.NAME],
    ['email', FieldType.EMAIL],
    ['phone', FieldType.PHONE],
    ['city', FieldType.LOCATION]
  ]);

  // =========================================================================
  // TEST CASE A: Exact Email Duplicate
  // =========================================================================
  console.info('--- Test Case A: Exact Email Duplicate ---');
  const inputA = [
    { rowNumber: 1, cleaned: { name: 'Rahul Sharma', email: 'rahul@gmail.com', phone: '' }, original: {}, issues: [] },
    { rowNumber: 2, cleaned: { name: 'Rahul S', email: 'rahul@gmail.com', phone: '' }, original: {}, issues: [] }
  ];
  const resA = detectDuplicates(inputA, colTypes);
  assert(resA.groups.length === 1, 'A1. Exactly one duplicate group created for exact email match');
  assert(resA.groups[0].status === 'confirmed_deterministic', 'A2. Exact email group status is confirmed_deterministic');
  assert(resA.groups[0].canonicalRowNumber === 1, 'A3. Canonical candidate is Row 1');
  assert(resA.groups[0].memberRowNumbers.join(',') === '1,2', 'A4. Members are [1, 2]');
  assert(resA.groups[0].evidence.some((e) => e.type === 'exact_email'), 'A5. Evidence indicates exact_email');
  assert(resA.metrics.totalDuplicateGroups === 1, 'A6. Metrics totalDuplicateGroups is 1');
  assert(resA.metrics.duplicateRows === 1, 'A7. Metrics duplicateRows is 1 (non-canonical duplicate count)');

  // =========================================================================
  // TEST CASE B: Exact Phone Duplicate
  // =========================================================================
  console.info('\n--- Test Case B: Exact Phone Duplicate ---');
  const inputB = [
    { rowNumber: 10, cleaned: { name: 'Client A', email: '', phone: '9876543210' }, original: {}, issues: [] },
    { rowNumber: 15, cleaned: { name: 'Client B', email: '', phone: '9876543210' }, original: {}, issues: [] }
  ];
  const resB = detectDuplicates(inputB, colTypes);
  assert(resB.groups.length === 1, 'B1. Exactly one duplicate group created for exact phone match');
  assert(resB.groups[0].status === 'confirmed_deterministic', 'B2. Exact phone group status is confirmed_deterministic');
  assert(resB.groups[0].canonicalRowNumber === 10, 'B3. Canonical candidate is Row 10');
  assert(resB.groups[0].evidence.some((e) => e.type === 'exact_phone'), 'B4. Evidence indicates exact_phone');

  // =========================================================================
  // TEST CASE C: Exact Email + Phone Duplicate (Very Strong)
  // =========================================================================
  console.info('\n--- Test Case C: Exact Email + Phone Duplicate ---');
  const inputC = [
    { rowNumber: 2, cleaned: { name: 'Rahul Sharma', email: 'rahul@gmail.com', phone: '9876543210' }, original: {}, issues: [] },
    { rowNumber: 5, cleaned: { name: 'Rahul Sharma', email: 'rahul@gmail.com', phone: '9876543210' }, original: {}, issues: [] }
  ];
  const resC = detectDuplicates(inputC, colTypes);
  assert(resC.groups.length === 1, 'C1. Exactly one duplicate group created');
  assert(resC.groups[0].evidence[0].type === 'exact_email_and_phone', 'C2. Evidence type is exact_email_and_phone');
  assert(resC.groups[0].evidence[0].strength === 'very_strong', 'C3. Evidence strength is very_strong');
  assert(resC.groups[0].requiresReview === false, 'C4. Identical record duplicate does not require review');

  // =========================================================================
  // TEST CASE D: Same Name + Same City Potential Duplicate (Email & Phone Absent)
  // =========================================================================
  console.info('\n--- Test Case D: Same Name + Same City (No Contact Info) ---');
  const inputD = [
    { rowNumber: 3, cleaned: { name: 'Vikram Mehta', email: '', phone: '', city: 'Mumbai' }, original: {}, issues: [] },
    { rowNumber: 7, cleaned: { name: 'Vikram Mehta', email: '', phone: '', city: 'Mumbai' }, original: {}, issues: [] }
  ];
  const resD = detectDuplicates(inputD, colTypes);
  assert(resD.groups.length === 1, 'D1. Potential duplicate group formed for same name and city without contacts');
  assert(resD.groups[0].status === 'potential_review', 'D2. Group status is potential_review');
  assert(resD.groups[0].requiresReview === true, 'D3. requiresReview is true for potential duplicate');
  assert(resD.groups[0].evidence[0].type === 'same_name_and_location', 'D4. Evidence is same_name_and_location');
  assert(resD.metrics.potentialDuplicateGroups === 1, 'D5. Metrics potentialDuplicateGroups is 1');
  assert(resD.metrics.deterministicDuplicateGroups === 0, 'D6. Metrics deterministicDuplicateGroups is 0');

  // =========================================================================
  // TEST CASE E: Same Name but Different Email/Phone -> MUST NOT GROUP
  // =========================================================================
  console.info('\n--- Test Case E: Same Name but Different Email/Phone ---');
  const inputE = [
    { rowNumber: 1, cleaned: { name: 'Rahul Sharma', email: 'rahul@gmail.com', phone: '9876543210', city: 'Mumbai' }, original: {}, issues: [] },
    { rowNumber: 7, cleaned: { name: 'Rahul Sharma', email: 'different@gmail.com', phone: '9222222222', city: 'Mumbai' }, original: {}, issues: [] },
    { rowNumber: 8, cleaned: { name: 'Rahul S Sharma', email: 'another@gmail.com', phone: '9333333333', city: 'Mumbai' }, original: {}, issues: [] }
  ];
  const resE = detectDuplicates(inputE, colTypes);
  assert(resE.groups.length === 0, 'E1. Zero duplicate groups when contacts differ despite identical name');
  assert(resE.duplicateRows === 0, 'E2. Zero duplicate rows detected');

  // =========================================================================
  // TEST CASE F: Same Email with Conflicting Phone
  // =========================================================================
  console.info('\n--- Test Case F: Same Email with Conflicting Phone ---');
  const inputF = [
    { rowNumber: 5, cleaned: { name: 'Amit Kumar', email: 'amit@gmail.com', phone: '9000000001' }, original: {}, issues: [] },
    { rowNumber: 6, cleaned: { name: 'Amit Kumar', email: 'amit@gmail.com', phone: '9111111111' }, original: {}, issues: [] }
  ];
  const resF = detectDuplicates(inputF, colTypes);
  assert(resF.groups.length === 1, 'F1. One duplicate group identified by email');
  assert(resF.groups[0].conflicts.length > 0, 'F2. Conflicts array is non-empty');
  assert(resF.groups[0].conflicts[0].field === 'phone', 'F3. Conflict detected on phone field');
  assert(resF.groups[0].requiresReview === true, 'F4. Conflict triggers requiresReview = true');
  // Check that row values were preserved and not merged
  assert(inputF[0].cleaned.phone === '9000000001', 'F5. Row 5 original phone preserved without overwrite');
  assert(inputF[1].cleaned.phone === '9111111111', 'F6. Row 6 original phone preserved without overwrite');
  assert(inputF[0].issues.some((i) => i.rule === 'duplicate.field_conflict'), 'F7. Conflict issue attached to canonical row');
  assert(inputF[1].issues.some((i) => i.rule === 'duplicate.field_conflict'), 'F8. Conflict issue attached to duplicate row');

  // =========================================================================
  // TEST CASE G: Same Phone with Conflicting Email
  // =========================================================================
  console.info('\n--- Test Case G: Same Phone with Conflicting Email ---');
  const inputG = [
    { rowNumber: 10, cleaned: { name: 'Priya Shah', email: 'priya1@gmail.com', phone: '9988776655' }, original: {}, issues: [] },
    { rowNumber: 11, cleaned: { name: 'Priya Shah', email: 'priya2@gmail.com', phone: '9988776655' }, original: {}, issues: [] }
  ];
  const resG = detectDuplicates(inputG, colTypes);
  assert(resG.groups.length === 1, 'G1. One duplicate group identified by phone');
  assert(resG.groups[0].conflicts.some((c) => c.field === 'email'), 'G2. Conflict detected on email field');
  assert(resG.groups[0].requiresReview === true, 'G3. requiresReview is true for conflicting email');
  assert(inputG[0].cleaned.email === 'priya1@gmail.com', 'G4. Row 10 email preserved intact');
  assert(inputG[1].cleaned.email === 'priya2@gmail.com', 'G5. Row 11 email preserved intact');

  // =========================================================================
  // TEST CASE H: Three or More Records in One Duplicate Group
  // =========================================================================
  console.info('\n--- Test Case H: Three or More Records in One Duplicate Group ---');
  const inputH = [
    { rowNumber: 2, cleaned: { name: 'Rahul Sharma', email: 'rahul@gmail.com', phone: '9876543210' }, original: {}, issues: [] },
    { rowNumber: 8, cleaned: { name: 'Rahul Sharma', email: 'rahul@gmail.com', phone: '9876543210' }, original: {}, issues: [] },
    { rowNumber: 14, cleaned: { name: 'Rahul Sharma', email: 'rahul@gmail.com', phone: '9876543210' }, original: {}, issues: [] }
  ];
  const resH = detectDuplicates(inputH, colTypes);
  assert(resH.groups.length === 1, 'H1. Exactly 1 duplicate group (no double counting)');
  assert(resH.groups[0].canonicalRowNumber === 2, 'H2. Canonical candidate is Row 2');
  assert(resH.groups[0].memberRowNumbers.length === 3, 'H3. Group has 3 members [2, 8, 14]');
  assert(resH.groups[0].relationships.length === 2, 'H4. Exactly 2 pairwise relationships (8->2 and 14->2)');
  assert(resH.groups[0].relationships[0].fromRow === 8 && resH.groups[0].relationships[0].toRow === 2, 'H5. Relationship 8 -> 2');
  assert(resH.groups[0].relationships[1].fromRow === 14 && resH.groups[0].relationships[1].toRow === 2, 'H6. Relationship 14 -> 2');
  assert(resH.metrics.duplicatePairs === 2, 'H7. Metrics duplicatePairs is 2');
  assert(resH.metrics.duplicateRows === 2, 'H8. Metrics duplicateRows is 2');

  // =========================================================================
  // TEST CASE I: Multiple Independent Duplicate Groups
  // =========================================================================
  console.info('\n--- Test Case I: Multiple Independent Duplicate Groups ---');
  const inputI = [
    { rowNumber: 1, cleaned: { email: 'userA@example.com', phone: '9111111111' }, original: {}, issues: [] },
    { rowNumber: 2, cleaned: { email: 'userA@example.com', phone: '9111111111' }, original: {}, issues: [] },
    { rowNumber: 3, cleaned: { email: 'userB@example.com', phone: '9222222222' }, original: {}, issues: [] },
    { rowNumber: 4, cleaned: { email: 'userB@example.com', phone: '9222222222' }, original: {}, issues: [] }
  ];
  const resI = detectDuplicates(inputI, colTypes);
  assert(resI.groups.length === 2, 'I1. Exactly 2 independent duplicate groups');
  assert(resI.groups[0].groupId === 'DUP-0001', 'I2. First group has ID DUP-0001');
  assert(resI.groups[1].groupId === 'DUP-0002', 'I3. Second group has ID DUP-0002');
  assert(resI.metrics.totalDuplicateGroups === 2, 'I4. totalDuplicateGroups is 2');
  assert(resI.metrics.canonicalRows === 2, 'I5. canonicalRows is 2');
  assert(resI.metrics.duplicateRows === 2, 'I6. duplicateRows is 2');

  // =========================================================================
  // TEST CASE J: No Duplicates
  // =========================================================================
  console.info('\n--- Test Case J: No Duplicates ---');
  const inputJ = [
    { rowNumber: 1, cleaned: { email: 'a@example.com', phone: '9111111111' }, original: {}, issues: [] },
    { rowNumber: 2, cleaned: { email: 'b@example.com', phone: '9222222222' }, original: {}, issues: [] },
    { rowNumber: 3, cleaned: { email: 'c@example.com', phone: '9333333333' }, original: {}, issues: [] }
  ];
  const resJ = detectDuplicates(inputJ, colTypes);
  assert(resJ.groups.length === 0, 'J1. Zero groups when all records unique');
  assert(resJ.metrics.totalDuplicateGroups === 0, 'J2. totalDuplicateGroups is 0');
  assert(resJ.metrics.duplicateRows === 0, 'J3. duplicateRows is 0');

  // =========================================================================
  // TEST CASE K & L: Empty Email and Empty Phone Matching Safety
  // =========================================================================
  console.info('\n--- Test Case K & L: Empty Email & Empty Phone Safety ---');
  const inputKL = [
    { rowNumber: 1, cleaned: { name: 'User 1', email: '', phone: '9111111111' }, original: {}, issues: [] },
    { rowNumber: 2, cleaned: { name: 'User 2', email: '', phone: '9222222222' }, original: {}, issues: [] },
    { rowNumber: 3, cleaned: { name: 'User 3', email: 'user3@example.com', phone: '' }, original: {}, issues: [] },
    { rowNumber: 4, cleaned: { name: 'User 4', email: 'user4@example.com', phone: '' }, original: {}, issues: [] }
  ];
  const resKL = detectDuplicates(inputKL, colTypes);
  assert(resKL.groups.length === 0, 'KL1. Empty emails or empty phones do NOT trigger false duplicate groupings');

  // =========================================================================
  // TEST CASE M: Missing Values Must Not Create False Duplicate Groups
  // =========================================================================
  console.info('\n--- Test Case M: Missing Values Safety ---');
  const inputM = [
    { rowNumber: 1, cleaned: { name: '', email: '', phone: '', city: '' }, original: {}, issues: [] },
    { rowNumber: 2, cleaned: { name: '', email: '', phone: '', city: '' }, original: {}, issues: [] }
  ];
  const resM = detectDuplicates(inputM, colTypes);
  assert(resM.groups.length === 0, 'M1. Rows with empty fields do NOT form duplicate groups');

  // =========================================================================
  // TEST CASE N: Duplicate Group IDs Are Unique
  // =========================================================================
  console.info('\n--- Test Case N: Group ID Uniqueness ---');
  const groupIds = new Set(resI.groups.map((g) => g.groupId));
  assert(groupIds.size === resI.groups.length, 'N1. All duplicate group IDs are strictly unique');
  assert(resI.groups.every((g) => /^DUP-\d{4}$/.test(g.groupId)), 'N2. Group IDs follow format DUP-XXXX');

  // =========================================================================
  // TEST CASE O: Canonical Candidate Selection is Deterministic
  // =========================================================================
  console.info('\n--- Test Case O: Canonical Candidate Selection ---');
  assert(selectCanonicalCandidate({ memberRowNumbers: [14, 2, 8] }) === 2, 'O1. Earliest row 2 selected regardless of array order');
  assert(selectCanonicalCandidate({ memberRowNumbers: [5] }) === 5, 'O2. Single member returns row 5');
  assert(selectCanonicalCandidate(null) === null, 'O3. Null group returns null safely');

  // =========================================================================
  // TEST CASE P & Q & R: Preservation & Non-Destructive Integrity
  // =========================================================================
  console.info('\n--- Test Case P, Q, R: Data Integrity and Non-Destructive Invariants ---');
  const rawDataset = [
    { _rowNumber: 1, name: 'Rahul Sharma', email: 'rahul@gmail.com', phone: '9876543210' },
    { _rowNumber: 2, name: 'RAHUL SHARMA', email: 'RAHUL@GMAIL.COM', phone: '+91 98765 43210' }
  ];
  const processed = processDatasetRows(rawDataset);
  assert(processed.rows.length === 2, 'Q1. Zero records deleted, length matches input exactly');
  assert(processed.rows[0].original.name === 'Rahul Sharma', 'P1. Original row 1 values strictly preserved');
  assert(processed.rows[1].original.phone === '+91 98765 43210', 'P2. Original row 2 raw phone strictly preserved');
  assert(processed.rows[0].duplicateInfo.isCanonical === true, 'R1. Row 1 marked canonical');
  assert(processed.rows[1].duplicateInfo.isDuplicate === true, 'R2. Row 2 marked duplicate');
  assert(processed.duplicateGroups.length === 1, 'R3. Exactly one duplicate group produced in pipeline');

  // =========================================================================
  // TEST CASE S & T: Full API Integration, AuditLog & Multi-Tenant Security
  // =========================================================================
  console.info('\n--- Test Case S & T: API Endpoint, CleaningJob & AuditLog Integration ---');
  await connectDB();

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;

  const trackedUserIds = [];
  const trackedDatasetIds = [];
  const trackedJobIds = [];

  try {
    // 1. Create User 1 & User 2
    const u1Res = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Step8 User 1',
        email: `step8_user1_${Date.now()}@example.com`,
        password: 'Password123!'
      })
    });
    const u1Data = await u1Res.json();
    const token1 = u1Data.data.accessToken;
    const user1Id = u1Data.data.user.id;
    trackedUserIds.push(user1Id);

    const u2Res = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Step8 User 2',
        email: `step8_user2_${Date.now()}@example.com`,
        password: 'Password123!'
      })
    });
    const u2Data = await u2Res.json();
    const token2 = u2Data.data.accessToken;
    const user2Id = u2Data.data.user.id;
    trackedUserIds.push(user2Id);

    // 2. Upload CSV with duplicate records
    const csvContent =
      'name,email,phone,city\n' +
      'Rahul Sharma,rahul@gmail.com,9876543210,Mumbai\n' +
      'RAHUL SHARMA,RAHUL@GMAIL.COM,+91 98765 43210,Mumbai\n' +
      'Amit Kumar,amit@gmail.com,9000000001,Delhi\n' +
      'Amit Kumar,amit@gmail.com,9111111111,Delhi\n' +
      'Vikram Mehta,,,Mumbai\n' +
      'Vikram Mehta,,,Mumbai\n' +
      'Unique User,unique@example.com,9999988888,Kolkata\n';

    const uploadForm = new FormData();
    uploadForm.append('name', 'Advanced Duplicate Test Batch');
    uploadForm.append('file', new Blob([csvContent], { type: 'text/csv' }), 'dup_batch.csv');

    const upRes = await fetch(`${baseUrl}/datasets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}` },
      body: uploadForm
    });
    const upData = await upRes.json();
    const datasetId = upData.data.id;
    trackedDatasetIds.push(datasetId);

    // 3. Parse dataset
    await fetch(`${baseUrl}/datasets/${datasetId}/parse`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}` }
    });

    // 4. Test Case T: User 2 attempt to clean User 1 dataset -> 403 Forbidden
    const unauthRes = await fetch(`${baseUrl}/datasets/${datasetId}/clean`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token2}` }
    });
    assert(unauthRes.status === 403, 'T1. Unauthorized cleaning request rejected with HTTP 403 Forbidden');

    // 5. Test Case S: User 1 executes clean
    const cleanRes = await fetch(`${baseUrl}/datasets/${datasetId}/clean`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token1}`,
        'Content-Type': 'application/json'
      }
    });
    assert(cleanRes.status === 200, 'S1. POST /api/v1/datasets/:id/clean returned HTTP 200 OK');
    const cleanData = await cleanRes.json();

    const jobId = cleanData.data.job.id;
    trackedJobIds.push(jobId);

    assert(cleanData.success === true, 'S2. Clean response success is true');
    assert(Array.isArray(cleanData.data.duplicateGroups), 'S3. API response includes duplicateGroups array');
    assert(cleanData.data.duplicateGroups.length === 3, 'S4. Detected 3 duplicate groups (exact, conflict, potential)');

    const m = cleanData.data.metrics;
    assert(m.totalDuplicateGroups === 3, 'S5. metrics.totalDuplicateGroups is 3');
    assert(m.deterministicDuplicateGroups === 2, 'S6. metrics.deterministicDuplicateGroups is 2');
    assert(m.potentialDuplicateGroups === 1, 'S7. metrics.potentialDuplicateGroups is 1');
    assert(m.duplicateRows === 3, 'S8. metrics.duplicateRows is 3');
    assert(m.canonicalRows === 3, 'S9. metrics.canonicalRows is 3');
    assert(m.conflictCount >= 1, 'S10. metrics.conflictCount reflects phone conflict in Amit Kumar group');

    // Verify CleaningJob document in MongoDB
    const dbJob = await CleaningJob.findById(jobId);
    assert(!!dbJob, 'S11. CleaningJob document retrieved from MongoDB');
    assert(dbJob.totalDuplicateGroups === 3, 'S12. CleaningJob persisted totalDuplicateGroups: 3');
    assert(dbJob.duplicateGroups.length === 3, 'S13. CleaningJob persisted duplicateGroups array');

    // Verify AuditLog entries
    const dupAudit = await AuditLog.findOne({
      cleaningJob: jobId,
      action: 'dataset_duplicates_detected'
    });
    assert(!!dupAudit, 'S14. AuditLog created for "dataset_duplicates_detected"');
    assert(dupAudit.source === 'rule_engine', 'S15. AuditLog source is "rule_engine"');
    assert(dupAudit.details.groupCount === 3, 'S16. AuditLog records groupCount: 3');
    assert(dupAudit.details.duplicateRowCount === 3, 'S17. AuditLog records duplicateRowCount: 3');

  } finally {
    // Cleanup
    for (const uid of trackedUserIds) {
      await User.findByIdAndDelete(uid);
    }
    for (const did of trackedDatasetIds) {
      const d = await Dataset.findById(did);
      if (d && d.storagePath && fs.existsSync(d.storagePath)) {
        try {
          fs.unlinkSync(d.storagePath);
        } catch {}
      }
      await Dataset.findByIdAndDelete(did);
      await AuditLog.deleteMany({ dataset: did });
    }
    for (const jid of trackedJobIds) {
      await CleaningJob.findByIdAndDelete(jid);
      await AuditLog.deleteMany({ cleaningJob: jid });
    }

    await new Promise((resolve) => server.close(resolve));
    await disconnectDB();
    console.info('✔ Cleaned up test entities and closed connection');
  }

  console.info('\n====================================================');
  console.info(`🎉 All STEP 8 Duplicate Detection Tests Passed! (${testPassed} passed, ${testFailed} failed)`);
  console.info('====================================================');
};

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Step 8 Test Suite failed:', err);
    process.exit(1);
  });
