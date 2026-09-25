import http from 'http';
import fs from 'fs';
import crypto from 'crypto';
import app from '../src/app.js';
import env from '../src/config/env.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import User from '../src/models/User.js';
import Dataset from '../src/models/Dataset.js';
import AuditLog from '../src/models/AuditLog.js';

const runTests = async () => {
  console.info('====================================================');
  console.info('🧪 Running STEP 5 — Dataset Management & Secure Upload Tests');
  console.info('====================================================\n');

  // Connect to MongoDB
  await connectDB();

  // Start ephemeral HTTP server
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

  // Tracking state for test flow and cleanup
  const trackedUserIds = [];
  const trackedDatasetIds = [];
  const trackedFilePaths = [];

  let user1Token = null;
  let user1Id = null;
  let user2Token = null;
  let user2Id = null;
  let dataset1Id = null;
  let dataset1FilePath = null;
  let expectedCsvHash = null;

  try {
    // -------------------------------------------------------------------------
    // 1 & 2. Create/login test user and get JWT
    // -------------------------------------------------------------------------
    console.info('--- 1 & 2. Create/Login Test User 1 & Get JWT ---');
    const user1Email = `dataset_user1_${Date.now()}@example.com`;
    const user1Password = 'StrongPassword123!';

    const reg1Res = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Dataset Owner 1',
        email: user1Email,
        password: user1Password
      })
    });
    const reg1Data = await reg1Res.json();
    assert(reg1Res.status === 201, '1. Test User 1 registered successfully (HTTP 201)');
    assert(!!reg1Data.data.accessToken, '2. JWT access token retrieved for User 1');

    user1Token = reg1Data.data.accessToken;
    user1Id = reg1Data.data.user.id;
    trackedUserIds.push(user1Id);

    // -------------------------------------------------------------------------
    // 3 & 4. Upload valid CSV file & verify 201 response
    // -------------------------------------------------------------------------
    console.info('\n--- 3 & 4. Upload Valid CSV & Verify 201 Response ---');
    const validCsvContent = 'id,product,category,price,quantity\n1,Widget A,Tools,19.99,100\n2,Gadget B,Electronics,49.99,50\n3,Tool C,Tools,9.99,200\n';
    expectedCsvHash = crypto.createHash('sha256').update(validCsvContent).digest('hex');

    const csvForm = new FormData();
    csvForm.append('name', 'Sales Inventory 2026');
    csvForm.append(
      'file',
      new Blob([validCsvContent], { type: 'text/csv' }),
      'sales_inventory.csv'
    );

    const uploadRes = await fetch(`${baseUrl}/datasets`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`
      },
      body: csvForm
    });
    const uploadData = await uploadRes.json();

    assert(uploadRes.status === 201, '4. Upload endpoint returns HTTP 201 Created');
    assert(uploadData.success === true, '4. Upload response has success: true');
    assert(uploadData.data.name === 'Sales Inventory 2026', '4. Uploaded dataset name matches requested name');
    assert(uploadData.data.originalFileName === 'sales_inventory.csv', '4. Original filename preserved in metadata');
    assert(uploadData.data.fileType === 'csv', '4. File type detected as csv');
    assert(uploadData.data.fileSize === Buffer.byteLength(validCsvContent), '4. File size matches uploaded byte count');
    assert(!('storagePath' in uploadData.data), '4. Storage path is NOT exposed in response payload');

    dataset1Id = uploadData.data.id;
    trackedDatasetIds.push(dataset1Id);

    // -------------------------------------------------------------------------
    // 5. Verify Dataset exists in MongoDB
    // -------------------------------------------------------------------------
    console.info('\n--- 5 & 6. Verify Dataset in Database & Ownership ---');
    const dbDataset = await Dataset.findById(dataset1Id);
    assert(!!dbDataset, '5. Dataset document successfully persisted in MongoDB');

    // -------------------------------------------------------------------------
    // 6. Verify owner is correct
    // -------------------------------------------------------------------------
    assert(
      dbDataset.owner.toString() === user1Id.toString(),
      '6. Dataset owner in MongoDB matches authenticated user ID'
    );

    // -------------------------------------------------------------------------
    // 7. Verify physical file exists on disk
    // -------------------------------------------------------------------------
    console.info('\n--- 7. Verify Physical File on Disk ---');
    dataset1FilePath = dbDataset.storagePath;
    trackedFilePaths.push(dataset1FilePath);

    assert(fs.existsSync(dataset1FilePath), '7. Physical file exists in backend/uploads/datasets/');
    assert(
      !dataset1FilePath.includes('sales_inventory.csv'),
      '7. Physical file does NOT use untrusted original filename'
    );
    assert(
      dataset1FilePath.startsWith(env.uploadDir),
      '7. Physical file is securely contained inside configured upload directory'
    );

    // -------------------------------------------------------------------------
    // 8. Verify status = uploaded
    // -------------------------------------------------------------------------
    console.info('\n--- 8 & 9 & 10. Verify Status & Initial Row/Column Counters ---');
    assert(dbDataset.status === 'uploaded', '8. MongoDB dataset status is "uploaded"');
    assert(uploadData.data.status === 'uploaded', '8. Response status is "uploaded"');

    // -------------------------------------------------------------------------
    // 9. Verify totalRows = 0 (before STEP 6 parsing)
    // -------------------------------------------------------------------------
    assert(dbDataset.totalRows === 0, '9. totalRows is strictly 0 prior to parsing');
    assert(uploadData.data.totalRows === 0, '9. Response totalRows is 0');

    // -------------------------------------------------------------------------
    // 10. Verify totalColumns = 0 (before STEP 6 parsing)
    // -------------------------------------------------------------------------
    assert(dbDataset.totalColumns === 0, '10. totalColumns is strictly 0 prior to parsing');
    assert(uploadData.data.totalColumns === 0, '10. Response totalColumns is 0');

    // -------------------------------------------------------------------------
    // 11. Verify SHA-256 hash
    // -------------------------------------------------------------------------
    console.info('\n--- 11. Verify SHA-256 Content Hash ---');
    assert(
      dbDataset.originalFileHash === expectedCsvHash,
      `11. MongoDB originalFileHash (${dbDataset.originalFileHash}) matches calculated SHA-256`
    );
    assert(
      uploadData.data.originalFileHash === expectedCsvHash,
      '11. Response contains matching originalFileHash'
    );

    // -------------------------------------------------------------------------
    // 12. Verify upload AuditLog record
    // -------------------------------------------------------------------------
    console.info('\n--- 12. Verify Upload AuditLog Entry ---');
    const uploadAudit = await AuditLog.findOne({
      dataset: dataset1Id,
      action: 'dataset_uploaded'
    });
    assert(!!uploadAudit, '12. AuditLog record created for dataset_uploaded action');
    assert(uploadAudit.entityType === 'Dataset', '12. AuditLog entityType is Dataset');
    assert(uploadAudit.source === 'user', '12. AuditLog source is user');
    assert(uploadAudit.user.toString() === user1Id.toString(), '12. AuditLog user matches uploader');
    assert(
      uploadAudit.details.originalFileHash === expectedCsvHash,
      '12. AuditLog details contain file SHA-256 hash'
    );
    assert(
      !uploadAudit.details.password && !uploadAudit.details.accessToken,
      '12. AuditLog details contain no sensitive credentials or tokens'
    );

    // -------------------------------------------------------------------------
    // 13. List datasets for User 1
    // -------------------------------------------------------------------------
    console.info('\n--- 13 & 14. List & Get Datasets for Owner ---');
    const listRes = await fetch(`${baseUrl}/datasets`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${user1Token}`
      }
    });
    const listData = await listRes.json();
    assert(listRes.status === 200, '13. GET /datasets returns HTTP 200 OK');
    assert(Array.isArray(listData.data), '13. GET /datasets returns an array');
    assert(
      listData.data.some((d) => d.id === dataset1Id),
      '13. Uploaded dataset appears in owner dataset list'
    );
    assert(
      !listData.data.some((d) => 'storagePath' in d),
      '13. Server storage paths are not exposed in dataset list'
    );

    // -------------------------------------------------------------------------
    // 14. Get specific dataset by ID for User 1
    // -------------------------------------------------------------------------
    const getRes = await fetch(`${baseUrl}/datasets/${dataset1Id}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${user1Token}`
      }
    });
    const getData = await getRes.json();
    assert(getRes.status === 200, '14. GET /datasets/:id returns HTTP 200 OK for owner');
    assert(getData.data.id === dataset1Id, '14. Returned dataset ID matches requested ID');
    assert(getData.data.name === 'Sales Inventory 2026', '14. Dataset name matches');
    assert(!('storagePath' in getData.data), '14. Server storage path is NOT exposed in get response');

    // -------------------------------------------------------------------------
    // 15. Create second user (User 2)
    // -------------------------------------------------------------------------
    console.info('\n--- 15 & 16 & 17. Multi-Tenant Ownership & Security Isolation ---');
    const user2Email = `dataset_user2_${Date.now()}@example.com`;
    const reg2Res = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Dataset Owner 2',
        email: user2Email,
        password: 'AnotherPassword456!'
      })
    });
    const reg2Data = await reg2Res.json();
    assert(reg2Res.status === 201, '15. Second test user registered successfully');
    user2Token = reg2Data.data.accessToken;
    user2Id = reg2Data.data.user.id;
    trackedUserIds.push(user2Id);

    // -------------------------------------------------------------------------
    // 16 & 17. Attempt User 2 access to User 1's dataset & verify rejected
    // -------------------------------------------------------------------------
    const user2GetRes = await fetch(`${baseUrl}/datasets/${dataset1Id}`, {
      headers: { Authorization: `Bearer ${user2Token}` }
    });
    assert(
      user2GetRes.status === 403,
      '16 & 17. User 2 GET on User 1 dataset rejected with HTTP 403 Forbidden'
    );

    const user2DelRes = await fetch(`${baseUrl}/datasets/${dataset1Id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${user2Token}` }
    });
    assert(
      user2DelRes.status === 403,
      '16 & 17. User 2 DELETE on User 1 dataset rejected with HTTP 403 Forbidden'
    );

    const user2ListRes = await fetch(`${baseUrl}/datasets`, {
      headers: { Authorization: `Bearer ${user2Token}` }
    });
    const user2ListData = await user2ListRes.json();
    assert(
      user2ListData.data.length === 0,
      '16 & 17. User 2 list contains 0 datasets (cannot see other users datasets)'
    );

    // -------------------------------------------------------------------------
    // 18. Attempt unsupported file format (e.g. .png or .exe)
    // -------------------------------------------------------------------------
    console.info('\n--- 18 & 19 & 20. Validation Edge Cases (Format, Missing, Size) ---');
    const badForm = new FormData();
    badForm.append(
      'file',
      new Blob(['PNG fake binary data'], { type: 'image/png' }),
      'report.png'
    );

    const badExtRes = await fetch(`${baseUrl}/datasets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
      body: badForm
    });
    const badExtData = await badExtRes.json();
    assert(badExtRes.status === 400, '18. Unsupported file extension (.png) rejected with HTTP 400');
    assert(badExtData.success === false, '18. Response indicates success: false');

    // -------------------------------------------------------------------------
    // 19. Test missing file
    // -------------------------------------------------------------------------
    const emptyForm = new FormData();
    emptyForm.append('name', 'Missing File Dataset');
    const missingFileRes = await fetch(`${baseUrl}/datasets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
      body: emptyForm
    });
    const missingFileData = await missingFileRes.json();
    assert(missingFileRes.status === 400, '19. Request without file rejected with HTTP 400 Bad Request');
    assert(
      missingFileData.message.toLowerCase().includes('file is required'),
      '19. Error message indicates file is required'
    );

    // -------------------------------------------------------------------------
    // 20. Test oversized file (exceeding MAX_FILE_SIZE_MB)
    // -------------------------------------------------------------------------
    const oversizedBytes = (env.maxFileSizeMB + 1) * 1024 * 1024; // 26 MB
    console.info(`Testing oversized file upload (${oversizedBytes} bytes)...`);
    const oversizedBlob = new Blob([new Uint8Array(oversizedBytes)], { type: 'text/csv' });
    const oversizedForm = new FormData();
    oversizedForm.append('file', oversizedBlob, 'huge_file.csv');

    const oversizedRes = await fetch(`${baseUrl}/datasets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
      body: oversizedForm
    });
    const oversizedData = await oversizedRes.json();
    assert(
      oversizedRes.status === 413,
      `20. Oversized file rejected with HTTP 413 Payload Too Large (status: ${oversizedRes.status})`
    );
    assert(oversizedData.success === false, '20. Oversized response indicates success: false');

    // -------------------------------------------------------------------------
    // Test XLSX file upload (to verify .xlsx works as required)
    // -------------------------------------------------------------------------
    console.info('\n--- Testing XLSX Format Acceptance ---');
    const dummyXlsxContent = 'PK\x03\x04dummy_xlsx_archive_stream';
    const xlsxForm = new FormData();
    xlsxForm.append('name', 'Financial Projections');
    xlsxForm.append(
      'file',
      new Blob([dummyXlsxContent], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }),
      'projections.xlsx'
    );

    const xlsxRes = await fetch(`${baseUrl}/datasets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
      body: xlsxForm
    });
    const xlsxData = await xlsxRes.json();
    assert(xlsxRes.status === 201, 'XLSX file format accepted with HTTP 201 Created');
    assert(xlsxData.data.fileType === 'xlsx', 'XLSX file type detected as xlsx');
    const xlsxDatasetId = xlsxData.data.id;
    trackedDatasetIds.push(xlsxDatasetId);

    // Clean up test xlsx via service delete endpoint
    const xlsxDelRes = await fetch(`${baseUrl}/datasets/${xlsxDatasetId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${user1Token}` }
    });
    assert(xlsxDelRes.status === 200, 'XLSX test dataset deleted successfully');

    // -------------------------------------------------------------------------
    // 21. Delete dataset
    // -------------------------------------------------------------------------
    console.info('\n--- 21 & 22 & 23 & 24. Delete Dataset & Verify Cleanup & Audit ---');
    const delRes = await fetch(`${baseUrl}/datasets/${dataset1Id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${user1Token}` }
    });
    const delData = await delRes.json();
    assert(delRes.status === 200, '21. DELETE /datasets/:id returns HTTP 200 OK');
    assert(delData.data.deleted === true, '21. Deletion response indicates deleted: true');

    // -------------------------------------------------------------------------
    // 22. Verify Dataset removed from MongoDB
    // -------------------------------------------------------------------------
    const deletedDbCheck = await Dataset.findById(dataset1Id);
    assert(deletedDbCheck === null, '22. Dataset record removed from MongoDB');

    const getDeletedRes = await fetch(`${baseUrl}/datasets/${dataset1Id}`, {
      headers: { Authorization: `Bearer ${user1Token}` }
    });
    assert(getDeletedRes.status === 404, '22. GET on deleted dataset returns HTTP 404 Not Found');

    // -------------------------------------------------------------------------
    // 23. Verify physical file removed from filesystem
    // -------------------------------------------------------------------------
    assert(
      !fs.existsSync(dataset1FilePath),
      '23. Physical file deleted from filesystem upon dataset removal'
    );

    // -------------------------------------------------------------------------
    // 24. Verify deletion AuditLog
    // -------------------------------------------------------------------------
    const deleteAudit = await AuditLog.findOne({
      dataset: dataset1Id,
      action: 'dataset_deleted'
    });
    assert(!!deleteAudit, '24. AuditLog record created for dataset_deleted action');
    assert(deleteAudit.entityType === 'Dataset', '24. AuditLog entityType is Dataset');
    assert(deleteAudit.source === 'user', '24. AuditLog source is user');
    assert(deleteAudit.user.toString() === user1Id.toString(), '24. AuditLog user matches owner');

    // -------------------------------------------------------------------------
    // 25. Verify no orphaned test files/documents remain
    // -------------------------------------------------------------------------
    console.info('\n--- 25. Verify No Orphaned Files or Artifacts ---');
    for (const filePath of trackedFilePaths) {
      assert(!fs.existsSync(filePath), `25. Verified file cleaned up: ${filePath}`);
    }
    console.info('✔ Verified zero orphaned files remain in uploads directory');

  } finally {
    // Teardown: Clean up any test users, datasets, audit logs
    console.info('\n--- Test Teardown & Final Cleanup ---');
    for (const uid of trackedUserIds) {
      await User.findByIdAndDelete(uid);
    }
    for (const did of trackedDatasetIds) {
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
    console.info('✔ Cleaned up test database records');

    await new Promise((resolve) => server.close(resolve));
    await disconnectDB();
    console.info('✔ Ephemeral server closed & database disconnected');
  }

  console.info('\n====================================================');
  console.info(`🎉 All STEP 5 Dataset Upload Tests Passed! (${testPassed} passed, ${testFailed} failed)`);
  console.info('====================================================');
};

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Test suite failed:', err);
    process.exit(1);
  });
