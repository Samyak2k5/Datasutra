import http from 'http';
import fs from 'fs';
import crypto from 'crypto';
import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import User from '../src/models/User.js';
import Dataset from '../src/models/Dataset.js';
import CleaningJob from '../src/models/CleaningJob.js';
import AuditLog from '../src/models/AuditLog.js';

import {
  isMissingValue,
  checkMissingValue,
  DEFAULT_MISSING_MARKERS,
  isIdentityField,
  IDENTITY_FIELD_NAMES,
  analyzeRowMissingFields,
  revalidateImputedField,
  resolveDuplicateConsensus,
  resolveConfiguredDefaults,
  resolveConfiguredMappings,
  resolveConfiguredDerivedValues,
  processMissingData
} from '../src/cleaning/missing/missingDataEngine.js';
import { processDatasetRows, classifyRow } from '../src/cleaning/pipeline/rulePipeline.js';
import { FieldType } from '../src/cleaning/rules/fieldTypeDetector.js';
import { RowClassification, IssueSeverity, IssueCategory } from '../src/cleaning/schemas/cleaningResult.schema.js';

const runTests = async () => {
  console.info('====================================================');
  console.info('🧪 Running STEP 9 — Missing Data Handling & Safe Imputation Tests');
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
    ['city', FieldType.LOCATION],
    ['country', FieldType.GENERAL_STRING],
    ['state', FieldType.GENERAL_STRING],
    ['countryCode', FieldType.GENERAL_STRING],
    ['count', FieldType.GENERAL_STRING],
    ['isActive', FieldType.GENERAL_STRING]
  ]);

  // =========================================================================
  // TEST CASE A: null detection
  // =========================================================================
  console.info('--- Test Case A: null detection ---');
  assert(isMissingValue(null) === true, 'A1. isMissingValue(null) is true');
  const resNull = checkMissingValue('city', null);
  assert(resNull.isMissing === true, 'A2. checkMissingValue with null returns isMissing: true');
  assert(resNull.cleanedValue === '', 'A3. checkMissingValue with null normalizes to empty string');
  assert(resNull.issue && resNull.issue.category === IssueCategory.MISSING_VALUE, 'A4. checkMissingValue creates MISSING_VALUE issue');

  // =========================================================================
  // TEST CASE B: undefined detection
  // =========================================================================
  console.info('\n--- Test Case B: undefined detection ---');
  assert(isMissingValue(undefined) === true, 'B1. isMissingValue(undefined) is true');
  const resUndef = checkMissingValue('city', undefined);
  assert(resUndef.isMissing === true, 'B2. checkMissingValue with undefined returns isMissing: true');
  assert(resUndef.cleanedValue === '', 'B3. checkMissingValue with undefined normalizes to empty string');

  // =========================================================================
  // TEST CASE C: empty string "" detection
  // =========================================================================
  console.info('\n--- Test Case C: empty string "" detection ---');
  assert(isMissingValue('') === true, 'C1. isMissingValue("") is true');
  const resEmpty = checkMissingValue('city', '');
  assert(resEmpty.isMissing === true, 'C2. checkMissingValue with "" returns isMissing: true');
  assert(resEmpty.cleanedValue === '', 'C3. checkMissingValue with "" returns cleanedValue: ""');

  // =========================================================================
  // TEST CASE D: whitespace detection
  // =========================================================================
  console.info('\n--- Test Case D: whitespace detection ---');
  assert(isMissingValue('   ') === true, 'D1. isMissingValue("   ") is true');
  assert(isMissingValue('\t\n') === true, 'D2. isMissingValue("\\t\\n") is true');
  const resWs = checkMissingValue('city', '   ');
  assert(resWs.isMissing === true, 'D3. checkMissingValue with whitespace returns isMissing: true');
  assert(resWs.cleanedValue === '', 'D4. checkMissingValue with whitespace normalizes to empty string');
  assert(resWs.change !== null, 'D5. Change record generated for whitespace normalization');

  // =========================================================================
  // TEST CASE E: N/A marker detection
  // =========================================================================
  console.info('\n--- Test Case E: N/A marker detection ---');
  assert(isMissingValue('N/A') === true, 'E1. isMissingValue("N/A") is true');
  assert(isMissingValue('n/a') === true, 'E2. isMissingValue("n/a") is true');
  assert(isMissingValue('NA') === true, 'E3. isMissingValue("NA") is true');
  assert(isMissingValue('  N/A  ') === true, 'E4. Surrounding whitespace with N/A detected as missing');

  // =========================================================================
  // TEST CASE F: unknown, none, custom markers
  // =========================================================================
  console.info('\n--- Test Case F: unknown and custom markers ---');
  assert(isMissingValue('unknown') === true, 'F1. isMissingValue("unknown") is true');
  assert(isMissingValue('None') === true, 'F2. isMissingValue("None") is true');
  assert(isMissingValue('-') === true, 'F3. isMissingValue("-") is true');
  assert(isMissingValue('--') === true, 'F4. isMissingValue("--") is true');
  assert(
    isMissingValue('MISSING_VAL', { missingMarkers: ['missing_val'] }) === true,
    'F5. Custom missing marker array handled case-insensitively'
  );
  assert(
    isMissingValue('VOID_ENTRY', { missingMarkers: new Set(['VOID_ENTRY']) }) === true,
    'F6. Custom missing marker Set handled case-insensitively'
  );

  // =========================================================================
  // TEST CASE G: zero preservation
  // =========================================================================
  console.info('\n--- Test Case G: zero preservation ---');
  assert(isMissingValue(0) === false, 'G1. Number 0 is NOT missing');
  assert(isMissingValue('0') === false, 'G2. String "0" is NOT missing');
  const resZero = checkMissingValue('count', 0);
  assert(resZero.isMissing === false, 'G3. checkMissingValue(0) returns isMissing: false');
  assert(resZero.cleanedValue === 0, 'G4. checkMissingValue(0) preserves number 0');

  // =========================================================================
  // TEST CASE H: false preservation
  // =========================================================================
  console.info('\n--- Test Case H: false preservation ---');
  assert(isMissingValue(false) === false, 'H1. Boolean false is NOT missing');
  const resFalse = checkMissingValue('isActive', false);
  assert(resFalse.isMissing === false, 'H2. checkMissingValue(false) returns isMissing: false');
  assert(resFalse.cleanedValue === false, 'H3. checkMissingValue(false) preserves boolean false');

  // =========================================================================
  // TEST CASE I: missing email safety (never guess or invent)
  // =========================================================================
  console.info('\n--- Test Case I: missing email safety ---');
  const rowsI = [
    { _rowNumber: 2, name: 'Rahul Sharma', email: '', phone: '9876543210', city: 'Mumbai' }
  ];
  const resI = processDatasetRows(rowsI, [], { defaults: { email: 'guessed@example.com' } });
  assert(resI.rows[0].cleaned.email === '', 'I1. Email remains empty even if default configured (never fabricate email)');
  assert(resI.rows[0].classification === RowClassification.NEEDS_REVIEW, 'I2. Row with missing email classified as needs_review');
  assert(resI.metrics.unresolvedMissingValues === 1, 'I3. Unresolved missing values metric is 1');

  // =========================================================================
  // TEST CASE J: missing phone safety (never guess or invent)
  // =========================================================================
  console.info('\n--- Test Case J: missing phone safety ---');
  const rowsJ = [
    { _rowNumber: 2, name: 'Priya Shah', email: 'priya@example.com', phone: '', city: 'Pune' }
  ];
  const resJ = processDatasetRows(rowsJ, [], { defaults: { phone: '9876543210' } });
  assert(resJ.rows[0].cleaned.phone === '', 'J1. Phone remains empty even if default configured (never fabricate phone)');
  assert(resJ.rows[0].classification === RowClassification.NEEDS_REVIEW, 'J2. Row with missing phone classified as needs_review');

  // =========================================================================
  // TEST CASE K: explicit configured defaults
  // =========================================================================
  console.info('\n--- Test Case K: explicit configured defaults ---');
  const rowsK = [
    { _rowNumber: 2, name: 'Anita Desai', email: 'anita@example.com', phone: '9876543210', country: '' }
  ];
  const resK = processDatasetRows(rowsK, [], { defaults: { country: 'India' } });
  assert(resK.rows[0].cleaned.country === 'India', 'K1. country filled from configured default');
  assert(resK.metrics.resolvedMissingValues === 1, 'K2. metrics.resolvedMissingValues is 1');
  assert(resK.metrics.imputedFieldCount === 1, 'K3. metrics.imputedFieldCount is 1');
  assert(resK.metrics.fieldsImputed.country === 1, 'K4. metrics.fieldsImputed.country is 1');
  assert(resK.rows[0].classification === RowClassification.MODIFIED, 'K5. Row classified as modified');
  const changeK = resK.rows[0].changes.find((c) => c.field === 'country');
  assert(!!changeK, 'K6. Change record recorded for country');
  assert(changeK.source === 'explicit_configuration', 'K7. Provenance source is explicit_configuration');

  // =========================================================================
  // TEST CASE L: duplicate-group consensus filling
  // =========================================================================
  console.info('\n--- Test Case L: duplicate-group consensus filling ---');
  const rowsL = [
    { _rowNumber: 2, name: 'Rahul Sharma', email: 'rahul@gmail.com', phone: '9876543210', city: 'Mumbai' },
    { _rowNumber: 8, name: 'Rahul Sharma', email: 'rahul@gmail.com', phone: '9876543210', city: '' }
  ];
  const resL = processDatasetRows(rowsL, []);
  assert(resL.rows[1].cleaned.city === 'Mumbai', 'L1. Row 8 city filled as Mumbai via consensus');
  assert(resL.metrics.resolvedMissingValues === 1, 'L2. resolvedMissingValues is 1');
  const changeL = resL.rows[1].changes.find((c) => c.field === 'city');
  assert(!!changeL, 'L3. Change record recorded for Row 8 city');
  assert(changeL.source === 'duplicate_group', 'L4. Provenance source is duplicate_group');
  assert(changeL.evidenceLevel === 'strong_deterministic', 'L5. Evidence level is strong_deterministic');
  assert(changeL.sourceRows.includes(2), 'L6. sourceRows contains row 2');
  assert(resL.rows[1].classification === RowClassification.MODIFIED, 'L7. Consensus-filled duplicate row classified as modified');

  // =========================================================================
  // TEST CASE M: conflicting candidate values in duplicate group
  // =========================================================================
  console.info('\n--- Test Case M: conflicting duplicate-group values ---');
  const rowsM = [
    { _rowNumber: 2, name: 'Rahul Sharma', email: 'rahul@gmail.com', phone: '9876543210', city: 'Mumbai' },
    { _rowNumber: 8, name: 'Rahul Sharma', email: 'rahul@gmail.com', phone: '9876543210', city: 'Delhi' },
    { _rowNumber: 14, name: 'Rahul Sharma', email: 'rahul@gmail.com', phone: '9876543210', city: '' }
  ];
  const resM = processDatasetRows(rowsM, []);
  assert(resM.rows[2].cleaned.city === '', 'M1. Row 14 city remains empty due to conflict between Mumbai and Delhi');
  assert(resM.metrics.missingConflicts >= 1, 'M2. metrics.missingConflicts records conflict');
  assert(resM.rows[2].classification === RowClassification.NEEDS_REVIEW, 'M3. Row 14 classified as needs_review');
  const conflictIssue = resM.rows[2].issues.find((i) => i.category === IssueCategory.MISSING_CONFLICT);
  assert(!!conflictIssue, 'M4. Issue with category MISSING_CONFLICT attached to Row 14');

  // =========================================================================
  // TEST CASE N: multiple consensus members
  // =========================================================================
  console.info('\n--- Test Case N: multiple consensus members ---');
  const rowsN = [
    { _rowNumber: 2, name: 'Priya Shah', email: 'priya@gmail.com', phone: '9111111111', city: 'Kolkata' },
    { _rowNumber: 8, name: 'Priya Shah', email: 'priya@gmail.com', phone: '9111111111', city: '' },
    { _rowNumber: 14, name: 'Priya Shah', email: 'priya@gmail.com', phone: '9111111111', city: 'Kolkata' }
  ];
  const resN = processDatasetRows(rowsN, []);
  assert(resN.rows[1].cleaned.city === 'Kolkata', 'N1. Row 8 city filled as Kolkata from multiple agreeing members');
  const changeN = resN.rows[1].changes.find((c) => c.field === 'city');
  assert(changeN.sourceRows.includes(2) && changeN.sourceRows.includes(14), 'N2. sourceRows records all consensus members [2, 14]');

  // =========================================================================
  // TEST CASE O: no safe source
  // =========================================================================
  console.info('\n--- Test Case O: no safe source ---');
  const rowsO = [
    { _rowNumber: 2, name: 'Single User', email: 'single@example.com', phone: '9998887776', city: '' }
  ];
  const resO = processDatasetRows(rowsO, []);
  assert(resO.rows[0].cleaned.city === '', 'O1. City remains empty when no safe source exists');
  assert(resO.rows[0].classification === RowClassification.NEEDS_REVIEW, 'O2. Row classified as needs_review');
  assert(resO.metrics.unresolvedMissingValues === 1, 'O3. metrics.unresolvedMissingValues is 1');
  assert(resO.metrics.resolvedMissingValues === 0, 'O4. metrics.resolvedMissingValues is 0');

  // =========================================================================
  // TEST CASE P: no fabricated identity (name, email, phone, address)
  // =========================================================================
  console.info('\n--- Test Case P: no fabricated identity ---');
  const rowsP = [
    { _rowNumber: 2, name: '', email: '', phone: '', address: '', city: 'Mumbai' }
  ];
  const resP = processDatasetRows(rowsP, [], {
    defaults: {
      name: 'John Doe',
      email: 'john@example.com',
      phone: '9876543210',
      address: '123 Fake Street'
    }
  });
  assert(resP.rows[0].cleaned.name === '', 'P1. Name was NOT fabricated from default');
  assert(resP.rows[0].cleaned.email === '', 'P2. Email was NOT fabricated from default');
  assert(resP.rows[0].cleaned.phone === '', 'P3. Phone was NOT fabricated from default');
  assert(resP.rows[0].cleaned.address === '', 'P4. Address was NOT fabricated from default');

  // =========================================================================
  // TEST CASE Q: provenance tracking
  // =========================================================================
  console.info('\n--- Test Case Q: provenance tracking ---');
  const rowsQ = [
    { _rowNumber: 2, name: 'Amit Roy', email: 'amit@example.com', phone: '9876543210', countryCode: 'IN', country: '' }
  ];
  const resQ = processDatasetRows(rowsQ, [], {
    lookups: [{ sourceField: 'countryCode', targetField: 'country', mapping: { IN: 'India' } }]
  });
  assert(resQ.rows[0].cleaned.country === 'India', 'Q1. country mapped to India');
  const changeQ = resQ.rows[0].changes.find((c) => c.field === 'country');
  assert(!!changeQ, 'Q2. Change record exists');
  assert(changeQ.field === 'country', 'Q3. field is country');
  assert(changeQ.cleanedValue === 'India', 'Q4. cleanedValue is India');
  assert(changeQ.source === 'explicit_mapping', 'Q5. source is explicit_mapping');
  assert(changeQ.evidenceLevel === 'deterministic', 'Q6. evidenceLevel is deterministic');
  assert(changeQ.sourceField === 'countryCode', 'Q7. sourceField is countryCode');
  assert(changeQ.sourceValue === 'IN', 'Q8. sourceValue is IN');

  // =========================================================================
  // TEST CASE R: revalidation of imputed values
  // =========================================================================
  console.info('\n--- Test Case R: revalidation ---');
  const rowsR = [
    { _rowNumber: 2, name: 'Sunil Verma', email: 'sunil@example.com', phone: '9876543210', city: '' }
  ];
  const resR = processDatasetRows(rowsR, [], { defaults: { city: 'bombay' } });
  assert(resR.rows[0].cleaned.city === 'Mumbai', 'R1. Imputed value "bombay" revalidated and standardized to "Mumbai"');

  // Derived values test
  const rowsR2 = [
    { _rowNumber: 2, firstName: 'Sunil', lastName: 'Verma', fullName: '', email: 'sunil@example.com', phone: '9876543210' }
  ];
  const resR2 = processDatasetRows(rowsR2, [], {
    derivedValues: [{ targetField: 'fullName', sourceFields: ['firstName', 'lastName'], separator: ' ' }]
  });
  assert(resR2.rows[0].cleaned.fullName === 'Sunil Verma', 'R2. fullName derived deterministically from firstName and lastName');
  const changeR2 = resR2.rows[0].changes.find((c) => c.field === 'fullName');
  assert(changeR2.source === 'explicit_derived', 'R3. Derived value provenance source is explicit_derived');

  // =========================================================================
  // TEST CASE S: metrics verification
  // =========================================================================
  console.info('\n--- Test Case S: metrics verification ---');
  const rowsS = [
    { _rowNumber: 2, name: 'User 1', email: 'u1@example.com', phone: '9876543210', city: 'Mumbai', country: '' },
    { _rowNumber: 3, name: 'User 1', email: 'u1@example.com', phone: '9876543210', city: '', country: '' },
    { _rowNumber: 4, name: 'User 2', email: 'u2@example.com', phone: '9876543211', city: '', country: '' }
  ];
  const resS = processDatasetRows(rowsS, [], { defaults: { country: 'India' } });
  // Row 2: country missing (1 missing) -> country filled by default
  // Row 3: city missing, country missing (2 missing) -> city filled by consensus, country filled by default
  // Row 4: city missing, country missing (2 missing) -> country filled by default, city unresolved
  // Initial missing count = 1 + 2 + 2 = 5
  // Resolved count: Row 2 country (1) + Row 3 city (1) + Row 3 country (1) + Row 4 country (1) = 4
  // Unresolved count = 5 - 4 = 1 (Row 4 city)
  assert(resS.metrics.missingValueCount === 5, 'S1. metrics.missingValueCount is 5');
  assert(resS.metrics.rowsWithMissingValues === 3, 'S2. metrics.rowsWithMissingValues is 3');
  assert(resS.metrics.resolvedMissingValues === 4, 'S3. metrics.resolvedMissingValues is 4');
  assert(resS.metrics.unresolvedMissingValues === 1, 'S4. metrics.unresolvedMissingValues is 1');
  assert(resS.metrics.imputedFieldCount === 4, 'S5. metrics.imputedFieldCount is 4');
  assert(resS.metrics.fieldsImputed.country === 3, 'S6. fieldsImputed.country is 3');
  assert(resS.metrics.fieldsImputed.city === 1, 'S7. fieldsImputed.city is 1');

  // =========================================================================
  // TEST CASE T: Step 8 duplicate compatibility
  // =========================================================================
  console.info('\n--- Test Case T: Step 8 duplicate compatibility ---');
  const rowsT = [
    { _rowNumber: 2, name: 'Rahul Sharma', email: 'rahul@gmail.com', phone: '9876543210', city: 'Mumbai' },
    { _rowNumber: 5, name: 'Rahul Sharma', email: 'rahul@gmail.com', phone: '9876543210', city: 'Mumbai' }
  ];
  const resT = processDatasetRows(rowsT, []);
  assert(resT.duplicateGroups.length === 1, 'T1. Exactly 1 duplicate group created');
  assert(resT.metrics.totalDuplicateGroups === 1, 'T2. totalDuplicateGroups is 1');
  assert(resT.metrics.duplicateRows === 1, 'T3. duplicateRows is 1');
  assert(resT.metrics.canonicalRows === 1, 'T4. canonicalRows is 1');

  // =========================================================================
  // TEST CASES U, V, W, X: API Integration, Multi-Tenant, File Preservation, No AI
  // =========================================================================
  console.info('\n--- Test Cases U, V, W, X: API, Multi-Tenant, File Preservation & No AI ---');
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;

  const trackedUserIds = [];
  const trackedDatasetIds = [];
  const trackedJobIds = [];

  try {
    await connectDB();

    // 1. Create two users
    const u1Res = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Step9 User One',
        email: `s9user1_${Date.now()}@example.com`,
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
        name: 'Step9 User Two',
        email: `s9user2_${Date.now()}@example.com`,
        password: 'Password123!'
      })
    });
    const u2Data = await u2Res.json();
    const token2 = u2Data.data.accessToken;
    const user2Id = u2Data.data.user.id;
    trackedUserIds.push(user2Id);

    // 2. Upload CSV with missing data & duplicate consensus potential
    const csvContent =
      'name,email,phone,city,countryCode,country\n' +
      'Rahul Sharma,rahul@gmail.com,9876543210,Mumbai,IN,\n' +
      'Rahul Sharma,rahul@gmail.com,9876543210,,IN,\n' +
      'Priya Shah,priya@gmail.com,9111111111,Pune,IN,\n' +
      'Vikram Mehta,vikram@gmail.com,9222222222,,IN,\n';

    const uploadForm = new FormData();
    uploadForm.append('name', 'Missing Data Test Batch');
    uploadForm.append('file', new Blob([csvContent], { type: 'text/csv' }), 'missing_batch.csv');

    const upRes = await fetch(`${baseUrl}/datasets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}` },
      body: uploadForm
    });
    const upData = await upRes.json();
    const datasetId = upData.data.id;
    trackedDatasetIds.push(datasetId);

    // Calculate file hash before cleaning for Test W (File Preservation)
    const datasetDocBefore = await Dataset.findById(datasetId);
    const fileBytesBefore = fs.readFileSync(datasetDocBefore.storagePath);
    const hashBefore = crypto.createHash('sha256').update(fileBytesBefore).digest('hex');

    // 3. Parse dataset
    await fetch(`${baseUrl}/datasets/${datasetId}/parse`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}` }
    });

    // 4. Test Case V: User 2 attempt to clean User 1 dataset -> 403 Forbidden
    const unauthRes = await fetch(`${baseUrl}/datasets/${datasetId}/clean`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token2}` }
    });
    assert(unauthRes.status === 403, 'V1. Unauthorized cleaning request rejected with HTTP 403 Forbidden');

    // 5. Test Case U: User 1 executes clean with defaults & mappings
    const cleanRes = await fetch(`${baseUrl}/datasets/${datasetId}/clean`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token1}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        lookups: [
          { sourceField: 'countryCode', targetField: 'country', mapping: { IN: 'India' } }
        ]
      })
    });
    assert(cleanRes.status === 200, 'U1. POST /api/v1/datasets/:id/clean returned HTTP 200 OK');
    const cleanData = await cleanRes.json();

    const jobId = cleanData.data.job.id;
    trackedJobIds.push(jobId);

    assert(cleanData.success === true, 'U2. Clean response success is true');
    const m = cleanData.data.metrics;
    assert(m.missingValueCount > 0, 'U3. metrics.missingValueCount is tracked');
    assert(m.rowsWithMissingValues > 0, 'U4. metrics.rowsWithMissingValues is tracked');
    assert(m.resolvedMissingValues > 0, 'U5. metrics.resolvedMissingValues is tracked');
    assert(m.imputedFieldCount > 0, 'U6. metrics.imputedFieldCount is tracked');
    assert(typeof m.fieldsImputed === 'object', 'U7. metrics.fieldsImputed is an object');

    // Verify CleaningJob document in MongoDB
    const dbJob = await CleaningJob.findById(jobId);
    assert(!!dbJob, 'U8. CleaningJob document retrieved from MongoDB');
    assert(dbJob.missingValueRecords === m.missingValueCount, 'U9. CleaningJob persisted missingValueRecords');
    assert(dbJob.resolvedMissingValues === m.resolvedMissingValues, 'U10. CleaningJob persisted resolvedMissingValues');
    assert(dbJob.rowsWithMissingValues === m.rowsWithMissingValues, 'U11. CleaningJob persisted rowsWithMissingValues');
    assert(dbJob.unresolvedMissingValues === m.unresolvedMissingValues, 'U12. CleaningJob persisted unresolvedMissingValues');
    assert(dbJob.imputedFieldCount === m.imputedFieldCount, 'U13. CleaningJob persisted imputedFieldCount');

    // Verify AuditLog entries
    const missingAudit = await AuditLog.findOne({
      cleaningJob: jobId,
      action: 'dataset_missing_data_processed'
    });
    assert(!!missingAudit, 'U14. AuditLog created for "dataset_missing_data_processed"');
    assert(missingAudit.source === 'rule_engine', 'U15. AuditLog source is "rule_engine"');
    assert(missingAudit.details.missingValueCount === m.missingValueCount, 'U16. AuditLog records correct missingValueCount');
    assert(missingAudit.details.resolvedMissingValues === m.resolvedMissingValues, 'U17. AuditLog records correct resolvedMissingValues');

    // 6. Test Case W: File Preservation (file bytes must not be touched)
    const fileBytesAfter = fs.readFileSync(datasetDocBefore.storagePath);
    const hashAfter = crypto.createHash('sha256').update(fileBytesAfter).digest('hex');
    assert(hashBefore === hashAfter, 'W1. Original uploaded physical file preserved bit-for-bit intact');

    // 7. Test Case X: Verify NO AI calls or external LLMs loaded
    assert(!process.env.OPENAI_API_KEY, 'X1. No OpenAI API key configured or required');
    assert(!process.env.GEMINI_API_KEY, 'X2. No Gemini API key configured or required');
    assert(!process.env.ANTHROPIC_API_KEY, 'X3. No Anthropic API key configured or required');
    const auditAi = await AuditLog.findOne({ cleaningJob: jobId, source: 'ai' });
    assert(!auditAi, 'X4. Zero AI-sourced audit logs generated');

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
  console.info(`🎉 All STEP 9 Missing Data Handling Tests Passed! (${testPassed} passed, ${testFailed} failed)`);
  console.info('====================================================');
};

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Step 9 Test Suite failed:', err);
    process.exit(1);
  });
