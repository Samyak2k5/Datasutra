import http from 'http';
import fs from 'fs';
import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import User from '../src/models/User.js';
import Dataset from '../src/models/Dataset.js';
import CleaningJob from '../src/models/CleaningJob.js';
import AuditLog from '../src/models/AuditLog.js';

// Unit rule imports
import { isMissingValue, checkMissingValue } from '../src/cleaning/rules/missingValue.rules.js';
import { cleanEmail } from '../src/cleaning/rules/email.rules.js';
import { cleanPhone } from '../src/cleaning/rules/phone.rules.js';
import { cleanName } from '../src/cleaning/rules/name.rules.js';
import { cleanLocation } from '../src/cleaning/rules/location.rules.js';
import { cleanGeneralString } from '../src/cleaning/rules/standardization.rules.js';
import { DuplicateDetector, annotateDuplicates } from '../src/cleaning/duplicate/duplicateDetector.js';
import { FieldType, detectFieldType } from '../src/cleaning/rules/fieldTypeDetector.js';
import { processDatasetRows, classifyRow } from '../src/cleaning/pipeline/rulePipeline.js';
import { RowClassification, IssueSeverity } from '../src/cleaning/schemas/cleaningResult.schema.js';

const runTests = async () => {
  console.info('====================================================');
  console.info('🧪 Running STEP 7 — Deterministic Cleaning Engine Tests');
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

  // =========================================================================
  // SECTION A: Missing Values
  // =========================================================================
  console.info('--- Section A: Missing Values Rule Tests ---');
  assert(isMissingValue(null) === true, 'A1. null is recognized as missing');
  assert(isMissingValue(undefined) === true, 'A2. undefined is recognized as missing');
  assert(isMissingValue('') === true, 'A3. Empty string "" is recognized as missing');
  assert(isMissingValue('   ') === true, 'A4. Whitespace-only string "   " is recognized as missing');
  assert(isMissingValue(0) === false, 'A5. Number 0 is NOT missing');
  assert(isMissingValue(false) === false, 'A6. Boolean false is NOT missing');
  assert(isMissingValue('0') === false, 'A7. String "0" is NOT missing');
  assert(isMissingValue('N/A') === true, 'A8. "N/A" is recognized as missing');
  assert(isMissingValue('unknown') === true, 'A9. "unknown" is recognized as missing');
  assert(isMissingValue('None') === true, 'A10. "None" is recognized as missing');

  const missingCheckWhitespace = checkMissingValue('notes', '   ');
  assert(missingCheckWhitespace.isMissing === true, 'A11. checkMissingValue returns isMissing: true');
  assert(missingCheckWhitespace.cleanedValue === '', 'A12. Whitespace is normalized to empty string');
  assert(missingCheckWhitespace.change !== null, 'A13. Change record generated for whitespace normalization');

  // =========================================================================
  // SECTION B: Email Cleaning & Validation
  // =========================================================================
  console.info('\n--- Section B: Email Cleaning & Validation Tests ---');
  const emailUpper = cleanEmail('email', ' RAHUL@GMAIL.COM ');
  assert(emailUpper.cleanedValue === 'rahul@gmail.com', 'B1. " RAHUL@GMAIL.COM " normalized to "rahul@gmail.com"');
  assert(emailUpper.isValid === true, 'B2. Normalized email is valid');
  assert(emailUpper.change !== null, 'B3. Change recorded for email normalization');

  const emailValid = cleanEmail('email', 'priya.shah@company.co.in');
  assert(emailValid.cleanedValue === 'priya.shah@company.co.in', 'B4. Valid pristine email preserved as-is');
  assert(emailValid.change === null, 'B5. No change recorded for already pristine email');
  assert(emailValid.isValid === true, 'B6. Pristine email marked valid');

  const emailSpaceInside = cleanEmail('email', 'rahul @gmail.com');
  assert(emailSpaceInside.isValid === false, 'B7. Email with space inside ("rahul @gmail.com") marked invalid');
  assert(emailSpaceInside.issue.severity === IssueSeverity.ERROR, 'B8. Email with space produces error issue');

  const emailMissingAt = cleanEmail('email', 'rahulgmail.com');
  assert(emailMissingAt.isValid === false, 'B9. Email without @ ("rahulgmail.com") marked invalid');
  assert(emailMissingAt.cleanedValue === 'rahulgmail.com', 'B10. Original invalid value preserved');

  const emailDomainMistake = cleanEmail('email', 'rahul@gmial.com');
  assert(emailDomainMistake.cleanedValue === 'rahul@gmial.com', 'B11. Does NOT guess or alter unknown domain "gmial.com"');

  const emailEmpty = cleanEmail('email', '');
  assert(emailEmpty.isMissing === true, 'B12. Empty email detected as missing');

  // =========================================================================
  // SECTION C: Phone Number Normalization (Indian & Generic)
  // =========================================================================
  console.info('\n--- Section C: Phone Cleaning Tests ---');
  const phonePlus91 = cleanPhone('phone', '+91 98765 43210');
  assert(phonePlus91.cleanedValue === '9876543210', 'C1. "+91 98765 43210" normalized to "9876543210"');
  assert(phonePlus91.isValid === true, 'C2. Normalized +91 phone marked valid');

  const phone91Hyphen = cleanPhone('phone', '91-9876543210');
  assert(phone91Hyphen.cleanedValue === '9876543210', 'C3. "91-9876543210" normalized to "9876543210"');

  const phoneLeadingZero = cleanPhone('phone', '09876543210');
  assert(phoneLeadingZero.cleanedValue === '9876543210', 'C4. "09876543210" with leading zero normalized to "9876543210"');

  const phoneHyphen = cleanPhone('phone', ' 98765-43210 ');
  assert(phoneHyphen.cleanedValue === '9876543210', 'C5. " 98765-43210 " with hyphen normalized to "9876543210"');

  const phonePristine = cleanPhone('phone', '9876543210');
  assert(phonePristine.cleanedValue === '9876543210', 'C6. Pristine 10-digit number preserved');
  assert(phonePristine.change === null, 'C7. No change recorded for already pristine phone');

  const phoneTooShort = cleanPhone('phone', '98765');
  assert(phoneTooShort.isValid === false, 'C8. Short phone ("98765") marked invalid');
  assert(phoneTooShort.issue.severity === IssueSeverity.ERROR, 'C9. Invalid length produces error issue');

  const phoneAlpha = cleanPhone('phone', '98765ABCDE');
  assert(phoneAlpha.isValid === false, 'C10. Phone with letters marked invalid');

  const phoneInvalidStart = cleanPhone('phone', '1234567890');
  assert(phoneInvalidStart.isValid === false, 'C11. Indian mobile starting with 1 marked invalid');

  // =========================================================================
  // SECTION D: Name Standardization
  // =========================================================================
  console.info('\n--- Section D: Name Standardization Tests ---');
  const nameUpper = cleanName('name', 'RAHUL SHARMA');
  assert(nameUpper.cleanedValue === 'Rahul Sharma', 'D1. "RAHUL SHARMA" title-cased to "Rahul Sharma"');

  const nameLower = cleanName('name', 'priya shah');
  assert(nameLower.cleanedValue === 'Priya Shah', 'D2. "priya shah" title-cased to "Priya Shah"');

  const nameExtraSpaces = cleanName('name', '  rahul   sharma ');
  assert(nameExtraSpaces.cleanedValue === 'Rahul Sharma', 'D3. "  rahul   sharma " spaces collapsed to "Rahul Sharma"');

  const nameInitials = cleanName('name', 'a.k. sharma');
  assert(nameInitials.cleanedValue === 'A.k. Sharma', 'D4. Name with initials formatted safely');

  // =========================================================================
  // SECTION E: City / Location Standardization
  // =========================================================================
  console.info('\n--- Section E: City / Location Tests ---');
  const cityUpper = cleanLocation('city', ' MUMBAI ');
  assert(cityUpper.cleanedValue === 'Mumbai', 'E1. " MUMBAI " normalized to "Mumbai"');

  const cityLower = cleanLocation('city', ' mumbai ');
  assert(cityLower.cleanedValue === 'Mumbai', 'E2. " mumbai " normalized to "Mumbai"');

  const citySpaces = cleanLocation('city', 'New   Delhi');
  assert(citySpaces.cleanedValue === 'New Delhi', 'E3. "New   Delhi" collapsed to "New Delhi"');

  const cityAliasBombay = cleanLocation('city', 'bombay');
  assert(cityAliasBombay.cleanedValue === 'Mumbai', 'E4. "bombay" alias resolved to "Mumbai"');

  const cityAliasCalcutta = cleanLocation('city', 'calcutta');
  assert(cityAliasCalcutta.cleanedValue === 'Kolkata', 'E5. "calcutta" alias resolved to "Kolkata"');

  // =========================================================================
  // SECTION F: Duplicate Detection
  // =========================================================================
  console.info('\n--- Section F: Duplicate Detection Tests ---');
  const colTypes = new Map([
    ['name', FieldType.NAME],
    ['email', FieldType.EMAIL],
    ['phone', FieldType.PHONE]
  ]);

  const detector = new DuplicateDetector(colTypes);

  const rowA = {
    rowNumber: 2,
    cleaned: { name: 'Rahul Sharma', email: 'rahul@gmail.com', phone: '9876543210' },
    issues: []
  };
  const dupA = detector.evaluateRow(rowA);
  assert(dupA === null, 'F1. First record is recognized as unique');

  // Same email + same phone
  const rowB = {
    rowNumber: 3,
    cleaned: { name: 'RAHUL SHARMA', email: 'rahul@gmail.com', phone: '9876543210' },
    issues: []
  };
  const dupB = detector.evaluateRow(rowB);
  assert(dupB !== null, 'F2. Second record with same email and phone detected as duplicate');
  assert(dupB.type === 'exact_email_and_phone', 'F3. Duplicate type is exact_email_and_phone');
  assert(dupB.duplicateOfRow === 2, 'F4. Accurately links duplicate to row 2');

  // Similar name but different email and phone -> MUST NOT MERGE
  const rowC = {
    rowNumber: 4,
    cleaned: { name: 'Rahul S Sharma', email: 'rahul.alt@gmail.com', phone: '9123456780' },
    issues: []
  };
  const dupC = detector.evaluateRow(rowC);
  assert(dupC === null, 'F5. Similar name with different email and phone is NOT flagged as duplicate');

  // =========================================================================
  // SECTION G: Classification Hierarchy
  // =========================================================================
  console.info('\n--- Section G: Row Classification Tests ---');
  const cleanRowRes = { changes: [], issues: [], duplicateInfo: null };
  assert(classifyRow(cleanRowRes) === RowClassification.CLEAN, 'G1. Row with no changes/issues classified as "clean"');

  const modifiedRowRes = { changes: [{ field: 'name' }], issues: [], duplicateInfo: null };
  assert(classifyRow(modifiedRowRes) === RowClassification.MODIFIED, 'G2. Row with changes classified as "modified"');

  const reviewRowRes = { changes: [], issues: [{ severity: IssueSeverity.WARNING }], duplicateInfo: null };
  assert(classifyRow(reviewRowRes) === RowClassification.NEEDS_REVIEW, 'G3. Row with warning classified as "needs_review"');

  const invalidRowRes = { changes: [], issues: [{ severity: IssueSeverity.ERROR }], duplicateInfo: null };
  assert(classifyRow(invalidRowRes) === RowClassification.INVALID, 'G4. Row with error classified as "invalid"');

  // =========================================================================
  // SECTION H: Full Row Pipeline
  // =========================================================================
  console.info('\n--- Section H: Full Row Pipeline Tests ---');
  const batchInput = [
    {
      _rowNumber: 2,
      name: '  RAHUL   SHARMA ',
      email: ' RAHUL@GMAIL.COM ',
      phone: '+91 98765 43210',
      city: ' mumbai '
    },
    {
      _rowNumber: 3,
      name: 'Priya Shah',
      email: 'priya@example.com',
      phone: '9888877777',
      city: 'Pune'
    },
    {
      _rowNumber: 4,
      name: 'Amit Kumar',
      email: '',
      phone: '9777766666',
      city: 'Delhi'
    },
    {
      _rowNumber: 5,
      name: 'Corrupt User',
      email: 'bademail_without_at.com',
      phone: '12345',
      city: 'Unknown'
    },
    {
      _rowNumber: 6,
      name: 'Rahul Sharma',
      email: 'rahul@gmail.com',
      phone: '9876543210',
      city: 'Mumbai'
    }
  ];

  const pipelineOutput = processDatasetRows(batchInput);
  assert(pipelineOutput.metrics.totalRows === 5, 'H1. Pipeline processed all 5 rows');

  // Row 1: Modified
  const r1 = pipelineOutput.rows[0];
  assert(r1.classification === RowClassification.MODIFIED, 'H2. Row 1 classified as "modified"');
  assert(r1.cleaned.name === 'Rahul Sharma', 'H3. Row 1 name normalized');
  assert(r1.cleaned.email === 'rahul@gmail.com', 'H4. Row 1 email normalized');
  assert(r1.cleaned.phone === '9876543210', 'H5. Row 1 phone normalized');
  assert(r1.cleaned.city === 'Mumbai', 'H6. Row 1 city normalized');

  // Row 2: Clean
  const r2 = pipelineOutput.rows[1];
  assert(r2.classification === RowClassification.CLEAN, 'H7. Row 2 pristine classified as "clean"');

  // Row 3: Missing Email -> Needs Review
  const r3 = pipelineOutput.rows[2];
  assert(r3.classification === RowClassification.NEEDS_REVIEW, 'H8. Row 3 with missing email classified as "needs_review"');

  // Row 4: Invalid Email & Phone -> Invalid
  const r4 = pipelineOutput.rows[3];
  assert(r4.classification === RowClassification.INVALID, 'H9. Row 4 with malformed email/phone classified as "invalid"');

  // Row 5: Duplicate of Row 1 -> Needs Review (duplicate suspect)
  const r5 = pipelineOutput.rows[4];
  assert(r5.classification === RowClassification.NEEDS_REVIEW, 'H10. Row 5 duplicate classified as "needs_review"');
  assert(r5.duplicateInfo.isDuplicate === true, 'H11. Row 5 annotated as duplicate');
  assert(r5.duplicateInfo.duplicateOfRow === 2, 'H12. Row 5 links to row 2');

  assert(pipelineOutput.metrics.cleanRows === 1, 'H13. cleanRows count is 1');
  assert(pipelineOutput.metrics.modifiedRows === 1, 'H14. modifiedRows count is 1');
  assert(pipelineOutput.metrics.reviewRows === 2, 'H15. reviewRows count is 2 (missing + duplicate)');
  assert(pipelineOutput.metrics.invalidRows === 1, 'H16. invalidRows count is 1');
  assert(pipelineOutput.metrics.duplicateRows === 1, 'H17. duplicateRows count is 1');

  // =========================================================================
  // SECTION I: Integration with Database, Server, and API Endpoint
  // =========================================================================
  console.info('\n--- Section I: API & Service Integration Tests ---');
  await connectDB();

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;

  const trackedUserIds = [];
  const trackedDatasetIds = [];
  const trackedJobIds = [];

  try {
    // 1. Register User 1 & User 2
    const u1Res = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Cleaner User 1',
        email: `cleaner1_${Date.now()}@example.com`,
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
        name: 'Cleaner User 2',
        email: `cleaner2_${Date.now()}@example.com`,
        password: 'Password123!'
      })
    });
    const u2Data = await u2Res.json();
    const token2 = u2Data.data.accessToken;
    const user2Id = u2Data.data.user.id;
    trackedUserIds.push(user2Id);

    // 2. Upload CSV
    const csvContent =
      'name,email,phone,city\n' +
      '  RAHUL SHARMA , RAHUL@GMAIL.COM ,+91 98765 43210, bombay \n' +
      'Priya Shah,priya@example.com,9988776655,Pune\n' +
      'Amit Verma,,9876543211,Delhi\n' +
      'Bad Contact,invalid_email_format,1234,unknown\n' +
      'Rahul Sharma,rahul@gmail.com,9876543210,Mumbai\n';

    const uploadForm = new FormData();
    uploadForm.append('name', 'Customer Cleaning Batch');
    uploadForm.append('file', new Blob([csvContent], { type: 'text/csv' }), 'customers.csv');

    const upRes = await fetch(`${baseUrl}/datasets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}` },
      body: uploadForm
    });
    const upData = await upRes.json();
    const datasetId = upData.data.id;
    trackedDatasetIds.push(datasetId);
    assert(upRes.status === 201, 'I1. Dataset uploaded successfully');

    // 3. Attempt clean on unparsed dataset -> should fail with 400
    const unparsedCleanRes = await fetch(`${baseUrl}/datasets/${datasetId}/clean`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}` }
    });
    assert(unparsedCleanRes.status === 400, 'I2. Cleaning unparsed dataset rejected with HTTP 400');

    // 4. Parse dataset
    const parseRes = await fetch(`${baseUrl}/datasets/${datasetId}/parse`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}` }
    });
    assert(parseRes.status === 200, 'I3. Dataset parsed successfully');

    // 5. User 2 attempts to clean User 1's dataset -> 403 Forbidden
    const unauthCleanRes = await fetch(`${baseUrl}/datasets/${datasetId}/clean`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token2}` }
    });
    assert(unauthCleanRes.status === 403, 'I4. Unauthorized dataset clean rejected with HTTP 403 Forbidden');

    // 6. User 1 triggers clean
    const cleanRes = await fetch(`${baseUrl}/datasets/${datasetId}/clean`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token1}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ country: 'IN' })
    });
    const cleanData = await cleanRes.json();
    assert(cleanRes.status === 200, 'I5. POST /datasets/:id/clean returned HTTP 200 OK');
    assert(cleanData.success === true, 'I6. Clean response indicated success: true');
    assert(cleanData.data.job.status === 'completed', 'I7. Cleaning job status is "completed"');
    assert(cleanData.data.metrics.totalRows === 5, 'I8. Clean metrics reports totalRows: 5');
    assert(cleanData.data.preview.length === 5, 'I9. Preview of cleaned rows returned');

    const jobId = cleanData.data.job.id;
    trackedJobIds.push(jobId);

    // 7. Verify CleaningJob persisted in MongoDB
    const dbJob = await CleaningJob.findById(jobId);
    assert(!!dbJob, 'I10. CleaningJob document persisted in MongoDB');
    assert(dbJob.cleaningMode === 'rules_only', 'I11. CleaningJob mode is "rules_only"');
    assert(dbJob.status === 'completed', 'I12. CleaningJob DB status is "completed"');
    assert(dbJob.totalRecords === 5, 'I13. CleaningJob totalRecords is 5');
    assert(dbJob.duplicateRecords === 1, 'I14. CleaningJob duplicateRecords is 1');
    assert(dbJob.errorCount === 1, 'I15. CleaningJob errorCount is 1');

    // 8. Verify AuditLogs
    const startedAudit = await AuditLog.findOne({
      cleaningJob: jobId,
      action: 'dataset_cleaning_started'
    });
    assert(!!startedAudit, 'I16. AuditLog created for "dataset_cleaning_started"');
    assert(startedAudit.source === 'rule_engine', 'I17. Started AuditLog source is "rule_engine"');

    const completedAudit = await AuditLog.findOne({
      cleaningJob: jobId,
      action: 'dataset_cleaning_completed'
    });
    assert(!!completedAudit, 'I18. AuditLog created for "dataset_cleaning_completed"');
    assert(completedAudit.source === 'rule_engine', 'I19. Completed AuditLog source is "rule_engine"');
    assert(completedAudit.details.totalRows === 5, 'I20. Completed AuditLog contains metrics');

    // 9. Verify physical file is preserved
    const dbDataset = await Dataset.findById(datasetId);
    assert(fs.existsSync(dbDataset.storagePath) === true, 'I21. Original uploaded physical file preserved intact');

  } finally {
    // Teardown
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
    console.info('✔ Cleaned up all temporary test entities & closed server');
  }

  console.info('\n====================================================');
  console.info(`🎉 All STEP 7 Cleaning Engine Tests Passed! (${testPassed} passed, ${testFailed} failed)`);
  console.info('====================================================');
};

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Test suite failed:', err);
    process.exit(1);
  });
