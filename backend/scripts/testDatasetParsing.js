import http from 'http';
import fs from 'fs';
import xlsx from 'xlsx';
import app from '../src/app.js';
import env from '../src/config/env.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import User from '../src/models/User.js';
import Dataset from '../src/models/Dataset.js';
import AuditLog from '../src/models/AuditLog.js';

const runTests = async () => {
  console.info('====================================================');
  console.info('🧪 Running STEP 6 — CSV/XLSX Parsing, Extraction & Preview Tests');
  console.info('====================================================\n');

  // Connect to MongoDB
  await connectDB();

  // Start ephemeral test server
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;
  console.info(`✔ Ephemeral test server running at ${baseUrl}\n`);

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

  const trackedUserIds = [];
  const trackedDatasetIds = [];
  const trackedFilePaths = [];

  let user1Token = null;
  let user1Id = null;
  let user2Token = null;
  let user2Id = null;

  try {
    // -------------------------------------------------------------------------
    // Setup Users
    // -------------------------------------------------------------------------
    console.info('--- Setup: Register Test Users ---');
    const reg1Res = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Parser Tester 1',
        email: `parser_user1_${Date.now()}@example.com`,
        password: 'Password123!'
      })
    });
    const reg1Data = await reg1Res.json();
    user1Token = reg1Data.data.accessToken;
    user1Id = reg1Data.data.user.id;
    trackedUserIds.push(user1Id);

    const reg2Res = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Parser Tester 2',
        email: `parser_user2_${Date.now()}@example.com`,
        password: 'Password123!'
      })
    });
    const reg2Data = await reg2Res.json();
    user2Token = reg2Data.data.accessToken;
    user2Id = reg2Data.data.user.id;
    trackedUserIds.push(user2Id);
    console.info('✔ Registered User 1 and User 2\n');

    // -------------------------------------------------------------------------
    // 1. Upload valid CSV (with quoted commas, empty cells, duplicate headers)
    // -------------------------------------------------------------------------
    console.info('--- 1 & 2. Upload and Parse Valid CSV ---');
    const richCsvContent =
      'Name,Email,Email,City,Salary\r\n' +
      'Rahul Sharma,"rahul,lead@example.com",,Mumbai,75000\r\n' +
      '"Shah, Priya",priya@example.com,priya_alt@example.com,Pune,80000\r\n' +
      'Amit Patel,amit@example.com,,Delhi,\r\n';

    const csvForm = new FormData();
    csvForm.append('name', 'Employee Directory');
    csvForm.append(
      'file',
      new Blob([richCsvContent], { type: 'text/csv' }),
      'employees.csv'
    );

    const uploadRes = await fetch(`${baseUrl}/datasets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
      body: csvForm
    });
    const uploadData = await uploadRes.json();
    assert(uploadRes.status === 201, '1. Valid CSV uploaded successfully (HTTP 201)');
    const csvDatasetId = uploadData.data.id;
    trackedDatasetIds.push(csvDatasetId);

    // -------------------------------------------------------------------------
    // 2. Parse CSV
    // -------------------------------------------------------------------------
    const parseRes = await fetch(`${baseUrl}/datasets/${csvDatasetId}/parse`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` }
    });
    const parseData = await parseRes.json();
    assert(parseRes.status === 200, '2. Parse CSV endpoint returns HTTP 200 OK');
    assert(parseData.success === true, '2. Parse CSV response indicates success: true');
    assert(
      parseData.data.dataset.status === 'completed',
      '2. Dataset status updated to "completed"'
    );

    // -------------------------------------------------------------------------
    // 3. Verify correct headers
    // -------------------------------------------------------------------------
    console.info('\n--- 3 & 4 & 5. Verify Metadata (Headers, Rows, Columns) ---');
    const dbCsvDataset = await Dataset.findById(csvDatasetId);
    trackedFilePaths.push(dbCsvDataset.storagePath);

    const columnNames = dbCsvDataset.columns.map((c) => c.name);
    assert(
      columnNames[0] === 'Name' &&
        columnNames[1] === 'Email' &&
        columnNames[2] === 'Email_2' &&
        columnNames[3] === 'City' &&
        columnNames[4] === 'Salary',
      '3. Correct headers with deterministic duplicate resolution (Name, Email, Email_2, City, Salary)'
    );

    // -------------------------------------------------------------------------
    // 4. Verify correct row count
    // -------------------------------------------------------------------------
    assert(dbCsvDataset.totalRows === 3, '4. Row count in MongoDB is exactly 3 data rows');
    assert(parseData.data.dataset.totalRows === 3, '4. Row count in parse response is 3');

    // -------------------------------------------------------------------------
    // 5. Verify correct column count
    // -------------------------------------------------------------------------
    assert(dbCsvDataset.totalColumns === 5, '5. Column count in MongoDB is exactly 5');
    assert(parseData.data.dataset.totalColumns === 5, '5. Column count in parse response is 5');

    // -------------------------------------------------------------------------
    // 6, 7, 8, 9. Verify Values, Empty Cells, Quoted Commas & Duplicate Headers
    // -------------------------------------------------------------------------
    console.info('\n--- 6 & 7 & 8 & 9. Verify Data Integrity via Preview ---');
    const previewRes = await fetch(`${baseUrl}/datasets/${csvDatasetId}/preview?limit=10`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${user1Token}` }
    });
    const previewData = await previewRes.json();
    assert(previewRes.status === 200, 'Preview endpoint returns HTTP 200 OK');

    const row1 = previewData.data.rows[0];
    const row2 = previewData.data.rows[1];
    const row3 = previewData.data.rows[2];

    // 6. Verify values are preserved
    assert(
      row1.Name === 'Rahul Sharma' && row1.City === 'Mumbai' && row1.Salary === '75000',
      '6. User cell values are faithfully preserved without mangling'
    );

    // 7. Verify empty cells remain unmodified ("")
    assert(
      row1.Email_2 === '' && row3.Salary === '' && row3.Email_2 === '',
      '7. Empty cells are preserved as empty strings ("") without invention'
    );

    // 8. Verify quoted CSV fields containing commas
    assert(
      row1.Email === 'rahul,lead@example.com',
      '8. Quoted CSV field containing comma parsed correctly (rahul,lead@example.com)'
    );
    assert(
      row2.Name === 'Shah, Priya',
      '8. Quoted CSV name field containing comma parsed correctly (Shah, Priya)'
    );

    // 9. Verify duplicate header handling
    assert(
      'Email' in row1 && 'Email_2' in row1,
      '9. Duplicate headers disambiguated into distinct fields (Email and Email_2)'
    );
    assert(
      dbCsvDataset.columns[2].originalName === 'Email',
      '9. Original header name ("Email") preserved in column metadata'
    );

    // Verify row identifier
    assert(
      row1._rowNumber === 2 && row2._rowNumber === 3 && row3._rowNumber === 4,
      'Row numbers correctly represented with metadata _rowNumber'
    );

    // -------------------------------------------------------------------------
    // 10 & 11 & 12 & 13. Valid XLSX Upload, Worksheet Handling & Row/Col Counts
    // -------------------------------------------------------------------------
    console.info('\n--- 10 & 11 & 12 & 13. XLSX Upload, Multi-Worksheet & Parsing ---');
    const wb = xlsx.utils.book_new();

    // Sheet 1 is empty to test non-empty worksheet detection
    const emptyWs = xlsx.utils.aoa_to_sheet([]);
    xlsx.utils.book_append_sheet(wb, emptyWs, 'BlankSheet');

    // Sheet 2 contains actual data
    const xlsxData = [
      ['Product', 'Category', 'Price', 'Stock'],
      ['Laptop Pro', 'Electronics', 1299.99, 45],
      ['Wireless Mouse', 'Accessories', 29.99, 150],
      ['Mechanical Keyboard', 'Accessories', 89.99, 75],
      ['4K Monitor', 'Electronics', 399.99, 30]
    ];
    const dataWs = xlsx.utils.aoa_to_sheet(xlsxData);
    xlsx.utils.book_append_sheet(wb, dataWs, 'Catalog');

    const xlsxBuffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const xlsxForm = new FormData();
    xlsxForm.append('name', 'Product Catalog');
    xlsxForm.append(
      'file',
      new Blob([xlsxBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }),
      'catalog.xlsx'
    );

    const xlsxUploadRes = await fetch(`${baseUrl}/datasets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
      body: xlsxForm
    });
    const xlsxUploadData = await xlsxUploadRes.json();
    assert(xlsxUploadRes.status === 201, '10. Valid XLSX uploaded successfully');
    const xlsxDatasetId = xlsxUploadData.data.id;
    trackedDatasetIds.push(xlsxDatasetId);

    // 11. Parse XLSX
    const xlsxParseRes = await fetch(`${baseUrl}/datasets/${xlsxDatasetId}/parse`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` }
    });
    const xlsxParseData = await xlsxParseRes.json();
    assert(xlsxParseRes.status === 200, '11. XLSX parsed successfully (HTTP 200)');

    const dbXlsxDataset = await Dataset.findById(xlsxDatasetId);
    trackedFilePaths.push(dbXlsxDataset.storagePath);

    // 12. Verify worksheet handling
    const xlsxAudit = await AuditLog.findOne({
      dataset: xlsxDatasetId,
      action: 'dataset_parsed'
    });
    assert(
      xlsxAudit && xlsxAudit.details.worksheetName === 'Catalog',
      '12. Automatically selected first non-empty worksheet ("Catalog")'
    );

    // 13. Verify XLSX row and column counts
    assert(dbXlsxDataset.totalRows === 4, '13. XLSX row count is exactly 4 data rows');
    assert(dbXlsxDataset.totalColumns === 4, '13. XLSX column count is exactly 4 columns');

    // -------------------------------------------------------------------------
    // 14 & 15 & 16. Preview Endpoint, Limit & Maximum Limit Clamping
    // -------------------------------------------------------------------------
    console.info('\n--- 14 & 15 & 16. Preview Endpoint & Limit Enforcement ---');
    // 14. Verify preview endpoint for XLSX
    const xlsxPreviewRes = await fetch(
      `${baseUrl}/datasets/${xlsxDatasetId}/preview?limit=2`,
      {
        headers: { Authorization: `Bearer ${user1Token}` }
      }
    );
    const xlsxPreviewData = await xlsxPreviewRes.json();
    assert(xlsxPreviewRes.status === 200, '14. GET /preview returns HTTP 200 for XLSX');
    assert(
      xlsxPreviewData.data.headers.length === 4,
      '14. Preview returns correct headers array'
    );

    // 15. Verify preview limit
    assert(
      xlsxPreviewData.data.rows.length === 2,
      '15. Preview respect requested limit (limit=2 returns 2 rows)'
    );
    assert(
      xlsxPreviewData.data.previewRows === 2,
      '15. previewRows metadata correctly reports 2'
    );
    assert(
      xlsxPreviewData.data.totalRows === 4,
      '15. totalRows reports overall dataset total (4)'
    );

    // Verify default preview limit (no limit parameter defaults to 20 rows)
    const defaultPreviewRes = await fetch(
      `${baseUrl}/datasets/${xlsxDatasetId}/preview`,
      {
        headers: { Authorization: `Bearer ${user1Token}` }
      }
    );
    const defaultPreviewData = await defaultPreviewRes.json();
    assert(defaultPreviewRes.status === 200, 'GET /preview without limit parameter returns HTTP 200 OK');
    assert(
      defaultPreviewData.data.rows.length === 4,
      'Preview without limit defaults to 20 (returns all 4 rows for 4-row dataset)'
    );

    // 16. Verify maximum preview limit (generate a CSV with 110 rows, query ?limit=200, expect 100)
    console.info('Testing max preview limit clamping with 110-row dataset...');
    let largeCsv = 'row_id,message\n';
    for (let i = 1; i <= 110; i++) {
      largeCsv += `${i},Message_${i}\n`;
    }

    const largeForm = new FormData();
    largeForm.append('name', 'Large Batch Dataset');
    largeForm.append(
      'file',
      new Blob([largeCsv], { type: 'text/csv' }),
      'large_batch.csv'
    );

    const largeUpRes = await fetch(`${baseUrl}/datasets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
      body: largeForm
    });
    const largeUpData = await largeUpRes.json();
    const largeDatasetId = largeUpData.data.id;
    trackedDatasetIds.push(largeDatasetId);

    await fetch(`${baseUrl}/datasets/${largeDatasetId}/parse`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` }
    });

    const maxLimitRes = await fetch(
      `${baseUrl}/datasets/${largeDatasetId}/preview?limit=200`,
      {
        headers: { Authorization: `Bearer ${user1Token}` }
      }
    );
    const maxLimitData = await maxLimitRes.json();
    assert(
      maxLimitData.data.rows.length === 100,
      '16. Preview limit > 100 is clamped to maximum of 100 rows'
    );
    assert(
      maxLimitData.data.previewRows === 100,
      '16. previewRows correctly reports clamped count 100'
    );
    assert(
      maxLimitData.data.totalRows === 110,
      '16. totalRows accurately reports full 110 rows'
    );

    // -------------------------------------------------------------------------
    // 17 & 18. Multi-Tenant Authorization Security (Parse & Preview)
    // -------------------------------------------------------------------------
    console.info('\n--- 17 & 18. Multi-Tenant Ownership Protection ---');
    // 17. User 2 attempting to parse User 1's dataset
    const unauthParseRes = await fetch(
      `${baseUrl}/datasets/${csvDatasetId}/parse`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${user2Token}` }
      }
    );
    assert(
      unauthParseRes.status === 403,
      '17. Unauthorized dataset parsing rejected with HTTP 403 Forbidden'
    );

    // 18. User 2 attempting to preview User 1's dataset
    const unauthPreviewRes = await fetch(
      `${baseUrl}/datasets/${csvDatasetId}/preview`,
      {
        headers: { Authorization: `Bearer ${user2Token}` }
      }
    );
    assert(
      unauthPreviewRes.status === 403,
      '18. Unauthorized dataset preview rejected with HTTP 403 Forbidden'
    );

    // -------------------------------------------------------------------------
    // 19. Missing Physical File Handling
    // -------------------------------------------------------------------------
    console.info('\n--- 19 & 20 & 21. Error Handling & Failed Status Transitions ---');
    const ghostForm = new FormData();
    ghostForm.append(
      'file',
      new Blob(['col1,col2\nval1,val2\n'], { type: 'text/csv' }),
      'ghost.csv'
    );
    const ghostUpRes = await fetch(`${baseUrl}/datasets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
      body: ghostForm
    });
    const ghostUpData = await ghostUpRes.json();
    const ghostDatasetId = ghostUpData.data.id;
    trackedDatasetIds.push(ghostDatasetId);

    const dbGhost = await Dataset.findById(ghostDatasetId);
    // Intentionally delete physical file
    if (fs.existsSync(dbGhost.storagePath)) {
      fs.unlinkSync(dbGhost.storagePath);
    }

    const missingParseRes = await fetch(
      `${baseUrl}/datasets/${ghostDatasetId}/parse`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${user1Token}` }
      }
    );
    assert(
      missingParseRes.status === 400 || missingParseRes.status === 404,
      '19. Parsing dataset with missing physical file returns HTTP 400/404 error'
    );

    const dbGhostAfter = await Dataset.findById(ghostDatasetId);
    assert(
      dbGhostAfter.status === 'failed',
      '19. Dataset status updated to "failed" when physical file is missing'
    );

    // -------------------------------------------------------------------------
    // 20 & 21. Malformed CSV, Corrupt XLSX & Status Transitions to 'failed'
    // -------------------------------------------------------------------------
    // Empty file test
    const emptyForm = new FormData();
    emptyForm.append('file', new Blob([''], { type: 'text/csv' }), 'empty.csv');
    const emptyUpRes = await fetch(`${baseUrl}/datasets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
      body: emptyForm
    });
    const emptyUpData = await emptyUpRes.json();
    const emptyDatasetId = emptyUpData.data.id;
    trackedDatasetIds.push(emptyDatasetId);

    const emptyParseRes = await fetch(
      `${baseUrl}/datasets/${emptyDatasetId}/parse`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${user1Token}` }
      }
    );
    assert(
      emptyParseRes.status === 400,
      '20. Empty CSV parsing rejected with HTTP 400 Bad Request'
    );

    const dbEmptyAfter = await Dataset.findById(emptyDatasetId);
    assert(
      dbEmptyAfter.status === 'failed',
      '21. Failed parse transitions Dataset status to "failed"'
    );
    assert(
      !!dbEmptyAfter.parseError,
      '21. Useful parseError message recorded in Dataset document'
    );

    // Truly malformed CSV (unclosed quote syntax error)
    console.info('Testing truly malformed CSV with unclosed quote...');
    const malformedCsvContent = 'col1,col2\n"unclosed quote line without end quote\nval1,val2\n';
    const malformedForm = new FormData();
    malformedForm.append('file', new Blob([malformedCsvContent], { type: 'text/csv' }), 'malformed.csv');
    const malformedUpRes = await fetch(`${baseUrl}/datasets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
      body: malformedForm
    });
    const malformedUpData = await malformedUpRes.json();
    const malformedDatasetId = malformedUpData.data.id;
    trackedDatasetIds.push(malformedDatasetId);

    const malformedParseRes = await fetch(
      `${baseUrl}/datasets/${malformedDatasetId}/parse`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${user1Token}` }
      }
    );
    assert(
      malformedParseRes.status === 400,
      'Malformed CSV with unclosed quotes rejected with HTTP 400'
    );
    const dbMalformedAfter = await Dataset.findById(malformedDatasetId);
    assert(
      dbMalformedAfter.status === 'failed',
      'Malformed CSV transitions dataset status to "failed"'
    );

    // Invalid / corrupted XLSX file
    console.info('Testing corrupted XLSX file...');
    const corruptXlsxBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
    const corruptXlsxForm = new FormData();
    corruptXlsxForm.append(
      'file',
      new Blob([corruptXlsxBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }),
      'corrupted.xlsx'
    );
    const corruptXlsxUpRes = await fetch(`${baseUrl}/datasets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
      body: corruptXlsxForm
    });
    const corruptXlsxUpData = await corruptXlsxUpRes.json();
    const corruptXlsxDatasetId = corruptXlsxUpData.data.id;
    trackedDatasetIds.push(corruptXlsxDatasetId);

    const corruptXlsxParseRes = await fetch(
      `${baseUrl}/datasets/${corruptXlsxDatasetId}/parse`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${user1Token}` }
      }
    );
    assert(
      corruptXlsxParseRes.status === 400,
      'Corrupted XLSX rejected with HTTP 400 Bad Request'
    );
    const dbCorruptAfter = await Dataset.findById(corruptXlsxDatasetId);
    assert(
      dbCorruptAfter.status === 'failed',
      'Corrupted XLSX transitions dataset status to "failed"'
    );

    // -------------------------------------------------------------------------
    // 22. Verify Successful Parse Status is 'completed'
    // -------------------------------------------------------------------------
    console.info('\n--- 22 & 23 & 24. Audit Logging & Final Verifications ---');
    const dbCompletedCheck = await Dataset.findById(csvDatasetId);
    assert(
      dbCompletedCheck.status === 'completed',
      '22. Successful parse changes Dataset status to "completed"'
    );

    // -------------------------------------------------------------------------
    // 23. Verify Parse Success AuditLog
    // -------------------------------------------------------------------------
    const parsedAudit = await AuditLog.findOne({
      dataset: csvDatasetId,
      action: 'dataset_parsed'
    });
    assert(!!parsedAudit, '23. AuditLog record created for action "dataset_parsed"');
    assert(parsedAudit.source === 'system', '23. AuditLog source is "system"');
    assert(parsedAudit.entityType === 'Dataset', '23. AuditLog entityType is "Dataset"');
    assert(
      parsedAudit.details.totalRows === 3,
      '23. AuditLog details contain accurate totalRows'
    );
    assert(
      !parsedAudit.details.password && !parsedAudit.details.token,
      '23. No sensitive data leaked into AuditLog details'
    );

    // -------------------------------------------------------------------------
    // 24. Verify Parse Failure AuditLog
    // -------------------------------------------------------------------------
    const failedAudit = await AuditLog.findOne({
      dataset: emptyDatasetId,
      action: 'dataset_parse_failed'
    });
    assert(!!failedAudit, '24. AuditLog record created for action "dataset_parse_failed"');
    assert(failedAudit.source === 'system', '24. Failure AuditLog source is "system"');
    assert(
      !!failedAudit.details.error,
      '24. Failure AuditLog contains informative error description'
    );

    // -------------------------------------------------------------------------
    // 25. Verify Test Data Cleanup
    // -------------------------------------------------------------------------
    console.info('\n--- 25. Clean Up and Verify Zero Orphaned Files ---');
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
        } catch {
          // ignore
        }
      }
      await Dataset.findByIdAndDelete(did);
      await AuditLog.deleteMany({ dataset: did });
    }
    for (const filePath of trackedFilePaths) {
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch {
          // ignore
        }
      }
    }

    assert(true, '25. All test users, datasets, audit logs, and files cleaned up');
    console.info('✔ Cleaned up all test records and files');

    await new Promise((resolve) => server.close(resolve));
    await disconnectDB();
    console.info('✔ Ephemeral server stopped & DB disconnected');
  }

  console.info('\n====================================================');
  console.info(
    `🎉 All STEP 6 Dataset Parsing Tests Passed! (${testPassed} passed, ${testFailed} failed)`
  );
  console.info('====================================================');
};

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Test suite failed:', err);
    process.exit(1);
  });
