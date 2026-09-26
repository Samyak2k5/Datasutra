import http from 'http';
import fs from 'fs';
import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import User from '../src/models/User.js';
import Dataset from '../src/models/Dataset.js';
import CleaningJob from '../src/models/CleaningJob.js';
import AuditLog from '../src/models/AuditLog.js';

// Step 11-12 unit service imports
import {
  generateReviewItemsForJob,
  getJobReviewItems,
  getReviewItem,
  acceptReviewItem,
  rejectReviewItem,
  editReviewItem,
  bulkAcceptReviewItems,
  bulkRejectReviewItems
} from '../src/services/review.service.js';
import { computeDataQualityAnalytics } from '../src/services/qualityAnalytics.service.js';
import { exportDatasetOrReport } from '../src/services/export.service.js';

const runTests = async () => {
  console.info('====================================================');
  console.info('🧪 Running STEP 11–13 Integration & Quality Analytics Tests');
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
  // SECTION A: Unit Tests for Quality Analytics Service (Step 12)
  // =========================================================================
  console.info('--- Section A: Quality Analytics & Scoring Formulas ---');

  const sampleMetrics = {
    totalRows: 100,
    cleanRows: 70,
    modifiedRows: 20,
    duplicateRows: 10,
    reviewRows: 5,
    invalidRows: 5,
    missingValueCount: 20,
    resolvedMissingValues: 15,
    unresolvedMissingValues: 5,
    missingConflicts: 2
  };

  const sampleColumns = [
    { name: 'name', inferredType: 'string' },
    { name: 'email', inferredType: 'email' },
    { name: 'city', inferredType: 'string' },
    { name: 'salary', inferredType: 'number' }
  ];

  const sampleRows = [
    {
      rowNumber: 1,
      classification: 'clean',
      original: { name: 'Alice', email: 'alice@example.com', city: 'Mumbai', salary: '50000' },
      cleaned: { name: 'Alice', email: 'alice@example.com', city: 'Mumbai', salary: '50000' },
      changes: []
    },
    {
      rowNumber: 2,
      classification: 'modified',
      original: { name: 'Bob', email: 'bob@example.com', city: 'bombay', salary: '' },
      cleaned: { name: 'Bob', email: 'bob@example.com', city: 'Mumbai', salary: null },
      changes: [{ field: 'city', originalValue: 'bombay', cleanedValue: 'Mumbai', rule: 'location.standardize' }]
    }
  ];

  const analytics = computeDataQualityAnalytics({
    metrics: sampleMetrics,
    rows: sampleRows,
    columns: sampleColumns,
    duplicateGroups: []
  });

  assert(typeof analytics.qualityScore.overall === 'number', 'A1. Overall quality score is a number');
  assert(analytics.qualityScore.overall >= 0 && analytics.qualityScore.overall <= 100, 'A2. Overall quality score between 0 and 100');
  assert(analytics.qualityScore.completeness >= 0 && analytics.qualityScore.completeness <= 100, 'A3. Completeness score valid');
  assert(analytics.qualityScore.validity >= 0 && analytics.qualityScore.validity <= 100, 'A4. Validity score valid');
  assert(analytics.qualityScore.uniqueness >= 0 && analytics.qualityScore.uniqueness <= 100, 'A5. Uniqueness score valid');
  assert(analytics.qualityScore.consistency >= 0 && analytics.qualityScore.consistency <= 100, 'A6. Consistency score valid');

  // Verify exact mathematical formula: 30% Completeness + 30% Validity + 20% Uniqueness + 20% Consistency
  const expectedWeighted = Math.round(
    (analytics.qualityScore.completeness * 0.30 +
      analytics.qualityScore.validity * 0.30 +
      analytics.qualityScore.uniqueness * 0.20 +
      analytics.qualityScore.consistency * 0.20) * 10
  ) / 10;
  assert(
    Math.abs(analytics.qualityScore.overall - expectedWeighted) < 0.1,
    'A7. Overall score matches exact 30/30/20/20 formula'
  );

  // Check dimensions metadata
  assert(analytics.qualityScore.dimensions.completeness.weight === '30%', 'A8. Completeness dimension has 30% weight');
  assert(analytics.qualityScore.dimensions.validity.weight === '30%', 'A9. Validity dimension has 30% weight');
  assert(analytics.qualityScore.dimensions.uniqueness.weight === '20%', 'A10. Uniqueness dimension has 20% weight');
  assert(analytics.qualityScore.dimensions.consistency.weight === '20%', 'A11. Consistency dimension has 20% weight');

  // Check field quality breakdown
  assert(Array.isArray(analytics.fieldQuality), 'A12. fieldQuality is an array');
  assert(analytics.fieldQuality.length === 4, 'A13. fieldQuality covers all 4 columns');
  assert(analytics.fieldQuality[0].name === 'name', 'A14. First column is name');
  assert(typeof analytics.fieldQuality[0].completeness === 'number', 'A15. Column completeness is numeric');

  // Edge case: empty rows & columns
  const emptyAnalytics = computeDataQualityAnalytics({ metrics: {}, rows: [], columns: [] });
  assert(emptyAnalytics.qualityScore.overall === 100, 'A16. Empty metrics default gracefully to 100 score');

  // =========================================================================
  // SECTION B: Unit Tests for Review Item Generator (Step 11)
  // =========================================================================
  console.info('\n--- Section B: Review Item Generation & Synthesis ---');

  const mockJob = { _id: '507f1f77bcf86cd799439011' };
  const mockDataset = { _id: '507f1f77bcf86cd799439022' };

  const mockCleanedRows = [
    {
      rowNumber: 1,
      original: { name: 'John Doe', email: 'john@example.com' },
      cleaned: { name: 'John Doe', email: 'john@example.com' },
      issues: []
    },
    {
      rowNumber: 2,
      original: { name: 'Jane Smith', email: 'jane@invalid' },
      cleaned: { name: 'Jane Smith', email: 'jane@invalid' },
      issues: [
        {
          field: 'email',
          severity: 'warning',
          rule: 'email.unresolved',
          message: 'Ambiguous domain syntax',
          category: 'invalid_syntax'
        }
      ]
    }
  ];

  const mockAiSummary = {
    needsReview: [
      {
        rowNumber: 2,
        field: 'email',
        reason: 'AI model suggests jane@example.com with medium confidence'
      }
    ],
    applied: [
      {
        rowNumber: 1,
        field: 'name',
        appliedValue: 'John Doe',
        confidence: 0.95,
        reason: 'Title case standardized'
      }
    ]
  };

  const generatedItems = generateReviewItemsForJob({
    job: mockJob,
    dataset: mockDataset,
    cleanedRows: mockCleanedRows,
    duplicateGroups: [],
    aiSummary: mockAiSummary,
    metrics: {}
  });

  assert(Array.isArray(generatedItems), 'B1. generateReviewItemsForJob returns an array');
  assert(generatedItems.length >= 2, 'B2. Review items generated for AI review and parser/rule flags');
  assert(generatedItems[0].status === 'pending', 'B3. Initial review item status is pending');
  assert(generatedItems[0].reviewId, 'B4. Review item has unique reviewId');
  assert(generatedItems[0].originalValue !== undefined, 'B5. Original value preserved in review item');

  // =========================================================================
  // SECTION C: End-to-End API Integration Tests (Steps 11, 12, 13)
  // =========================================================================
  console.info('\n--- Section C: End-to-End API & Integration Workflow ---');

  await connectDB();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;

  const trackedUserIds = [];
  const trackedDatasetIds = [];
  const trackedJobIds = [];

  try {
    // 1. Create User 1 (Dataset & Job Owner)
    const u1Res = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Step 11-13 Primary User',
        email: `primary_user_${Date.now()}@example.com`,
        password: 'Password123!'
      })
    });
    const u1Data = await u1Res.json();
    assert(u1Res.status === 201, 'C1. Primary user registered successfully');
    const token1 = u1Data.data.accessToken;
    const user1Id = u1Data.data.user.id;
    trackedUserIds.push(user1Id);

    // 2. Create User 2 (Unauthorized Tenant)
    const u2Res = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Step 11-13 Secondary User',
        email: `secondary_user_${Date.now()}@example.com`,
        password: 'Password123!'
      })
    });
    const u2Data = await u2Res.json();
    assert(u2Res.status === 201, 'C2. Secondary user registered successfully');
    const token2 = u2Data.data.accessToken;
    const user2Id = u2Data.data.user.id;
    trackedUserIds.push(user2Id);

    // 3. Upload CSV with normal, dirty, duplicate, and sensitive fields
    const csvContent =
      'name,email,phone,city,password\n' +
      '  RAHUL SHARMA , RAHUL@GMAIL.COM ,+91 98765 43210, bombay ,SecretPass123\n' +
      'Priya Shah,priya@example.com,9988776655,Pune,SuperSecret456\n' +
      'Amit Verma,,9876543211,Delhi,HiddenToken789\n' +
      'Bad Contact,invalid_email_format,1234,unknown,AdminKey999\n' +
      'Rahul Sharma,rahul@gmail.com,9876543210,Mumbai,SecretPass123\n';

    const uploadForm = new FormData();
    uploadForm.append('name', 'E2E Review and Export Dataset');
    uploadForm.append('file', new Blob([csvContent], { type: 'text/csv' }), 'e2e_dataset.csv');

    const upRes = await fetch(`${baseUrl}/datasets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}` },
      body: uploadForm
    });
    const upData = await upRes.json();
    assert(upRes.status === 201, 'C3. Dataset uploaded successfully');
    const datasetId = upData.data.id;
    trackedDatasetIds.push(datasetId);

    // 4. Parse Dataset
    const parseRes = await fetch(`${baseUrl}/datasets/${datasetId}/parse`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}` }
    });
    const parseData = await parseRes.json();
    assert(parseRes.status === 200, 'C4. Dataset parsed successfully');
    const parsedRows = parseData.data.dataset?.totalRows ?? parseData.data.totalRows;
    assert(parsedRows === 5, 'C5. 5 total rows identified');

    // 5. Clean Dataset
    const cleanRes = await fetch(`${baseUrl}/datasets/${datasetId}/clean`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token1}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ country: 'IN' })
    });
    const cleanData = await cleanRes.json();
    assert(cleanRes.status === 200, 'C6. Cleaning triggered successfully');
    const jobId = cleanData.data.job.id;
    trackedJobIds.push(jobId);

    // Seed additional review items representing different sources to thoroughly test all sources
    const dbJob = await CleaningJob.findById(jobId);
    dbJob.reviewItems.push(
      {
        reviewId: 'test-review-rule-1',
        dataset: datasetId,
        cleaningJob: jobId,
        rowNumber: 3,
        field: 'email',
        originalValue: '',
        suggestedValue: 'amit.verma@example.com',
        source: 'rule_engine',
        reason: 'Imputed missing email based on company domain heuristic',
        confidence: 0.82,
        status: 'pending'
      },
      {
        reviewId: 'test-review-dup-1',
        dataset: datasetId,
        cleaningJob: jobId,
        rowNumber: 5,
        field: 'name',
        originalValue: 'Rahul Sharma',
        suggestedValue: 'Rahul Sharma (Duplicate)',
        source: 'duplicate_detection',
        reason: 'Fuzzy duplicate match with row 1',
        confidence: 0.94,
        status: 'pending'
      },
      {
        reviewId: 'test-review-ai-1',
        dataset: datasetId,
        cleaningJob: jobId,
        rowNumber: 4,
        field: 'city',
        originalValue: 'unknown',
        suggestedValue: 'New Delhi',
        source: 'ai',
        reason: 'Contextual AI inference from contact region',
        confidence: 0.78,
        status: 'pending'
      },
      {
        reviewId: 'test-review-bulk-1',
        dataset: datasetId,
        cleaningJob: jobId,
        rowNumber: 1,
        field: 'city',
        originalValue: 'bombay',
        suggestedValue: 'Mumbai',
        source: 'deterministic',
        reason: 'Standardized legacy city name',
        confidence: 0.99,
        status: 'pending'
      },
      {
        reviewId: 'test-review-bulk-2',
        dataset: datasetId,
        cleaningJob: jobId,
        rowNumber: 2,
        field: 'city',
        originalValue: 'Pune',
        suggestedValue: 'Pune',
        source: 'deterministic',
        reason: 'Verified existing valid city name',
        confidence: 1.0,
        status: 'pending'
      }
    );
    dbJob.markModified('reviewItems');
    await dbJob.save();

    // 6. List Cleaning Jobs
    const listRes = await fetch(`${baseUrl}/cleaning-jobs`, {
      headers: { Authorization: `Bearer ${token1}` }
    });
    const listData = await listRes.json();
    assert(listRes.status === 200, 'C7. GET /cleaning-jobs returned HTTP 200');
    assert(Array.isArray(listData.data.jobs), 'C8. Jobs list is an array');
    assert(listData.data.jobs.length >= 1, 'C9. At least 1 cleaning job listed for User 1');
    assert(listData.data.jobs[0].reviewCount >= 1, 'C10. reviewCount reported on listed job');

    // 7. Get Single Cleaning Job
    const getJobRes = await fetch(`${baseUrl}/cleaning-jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${token1}` }
    });
    const getJobData = await getJobRes.json();
    assert(getJobRes.status === 200, 'C11. GET /cleaning-jobs/:jobId returned HTTP 200');
    assert(getJobData.data.job._id === jobId, 'C12. Job details retrieved');

    // 8. Get Paginated Review Items
    const reviewListRes = await fetch(`${baseUrl}/cleaning-jobs/${jobId}/review?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${token1}` }
    });
    const reviewListData = await reviewListRes.json();
    assert(reviewListRes.status === 200, 'C13. GET /cleaning-jobs/:jobId/review returned HTTP 200');
    assert(Array.isArray(reviewListData.data.items), 'C14. Review items returned as array');
    assert(reviewListData.data.pagination.total >= 5, 'C15. Total review items recorded');
    assert(reviewListData.data.counts.pending >= 5, 'C16. Pending items count reported accurately');

    // Filter by status=pending
    const pendingFilterRes = await fetch(`${baseUrl}/cleaning-jobs/${jobId}/review?status=pending`, {
      headers: { Authorization: `Bearer ${token1}` }
    });
    const pendingFilterData = await pendingFilterRes.json();
    assert(pendingFilterRes.status === 200, 'C17. Status filtering returned HTTP 200');
    assert(pendingFilterData.data.items.every((i) => i.status === 'pending'), 'C18. All filtered items have status "pending"');

    // 9. Get Single Review Item
    const singleReviewRes = await fetch(`${baseUrl}/cleaning-jobs/${jobId}/review/test-review-rule-1`, {
      headers: { Authorization: `Bearer ${token1}` }
    });
    const singleReviewData = await singleReviewRes.json();
    assert(singleReviewRes.status === 200, 'C19. GET single review item returned HTTP 200');
    assert(singleReviewData.data.item.reviewId === 'test-review-rule-1', 'C20. Single review item matches requested ID');

    // 10. Accept Review Item
    const acceptRes = await fetch(`${baseUrl}/cleaning-jobs/${jobId}/review/test-review-rule-1/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}` }
    });
    const acceptData = await acceptRes.json();
    assert(acceptRes.status === 200, 'C21. Accept review item returned HTTP 200');
    assert(acceptData.data.item.status === 'accepted', 'C22. Accepted item status changed to "accepted"');
    assert(acceptData.data.item.approvedValue === 'amit.verma@example.com', 'C23. approvedValue matches suggestedValue');

    const acceptAudit = await AuditLog.findOne({
      cleaningJob: jobId,
      action: 'review_item_accepted',
      'details.reviewId': 'test-review-rule-1'
    });
    assert(!!acceptAudit, 'C24. AuditLog created for review_item_accepted');

    // 11. Reject Review Item (Verify raw original value preservation)
    const rejectRes = await fetch(`${baseUrl}/cleaning-jobs/${jobId}/review/test-review-dup-1/reject`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}` }
    });
    const rejectData = await rejectRes.json();
    assert(rejectRes.status === 200, 'C25. Reject review item returned HTTP 200');
    assert(rejectData.data.item.status === 'rejected', 'C26. Rejected item status changed to "rejected"');
    assert(rejectData.data.item.approvedValue === 'Rahul Sharma', 'C27. approvedValue strictly preserved raw original value');

    const rejectAudit = await AuditLog.findOne({
      cleaningJob: jobId,
      action: 'review_item_rejected',
      'details.reviewId': 'test-review-dup-1'
    });
    assert(!!rejectAudit, 'C28. AuditLog created for review_item_rejected');

    // 12. Edit Review Item with Custom Value
    // 12a. Missing editedValue parameter validation
    const invalidEditRes = await fetch(`${baseUrl}/cleaning-jobs/${jobId}/review/test-review-ai-1/edit`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token1}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });
    assert(invalidEditRes.status === 400, 'C29. Edit without editedValue rejected with HTTP 400');

    // 12b. Valid edit
    const editRes = await fetch(`${baseUrl}/cleaning-jobs/${jobId}/review/test-review-ai-1/edit`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token1}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ editedValue: 'Noida' })
    });
    const editData = await editRes.json();
    assert(editRes.status === 200, 'C30. Edit review item returned HTTP 200');
    assert(editData.data.item.status === 'edited', 'C31. Edited item status changed to "edited"');
    assert(editData.data.item.approvedValue === 'Noida', 'C32. approvedValue matches custom edited value');

    const editAudit = await AuditLog.findOne({
      cleaningJob: jobId,
      action: 'review_item_edited',
      'details.reviewId': 'test-review-ai-1'
    });
    assert(!!editAudit, 'C33. AuditLog created for review_item_edited');

    // 13. Bulk Accept Review Items
    const bulkAcceptRes = await fetch(`${baseUrl}/cleaning-jobs/${jobId}/review/bulk-accept`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token1}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ reviewIds: ['test-review-bulk-1'] })
    });
    const bulkAcceptData = await bulkAcceptRes.json();
    assert(bulkAcceptRes.status === 200, 'C34. Bulk accept returned HTTP 200');
    assert(bulkAcceptData.data.acceptedCount === 1, 'C35. Exactly 1 item bulk accepted');

    const bulkAcceptAudit = await AuditLog.findOne({
      cleaningJob: jobId,
      action: 'review_bulk_accepted'
    });
    assert(!!bulkAcceptAudit, 'C36. AuditLog created for review_bulk_accepted');

    // 14. Bulk Reject Review Items
    const bulkRejectRes = await fetch(`${baseUrl}/cleaning-jobs/${jobId}/review/bulk-reject`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token1}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ reviewIds: ['test-review-bulk-2'] })
    });
    const bulkRejectData = await bulkRejectRes.json();
    assert(bulkRejectRes.status === 200, 'C37. Bulk reject returned HTTP 200');
    assert(bulkRejectData.data.rejectedCount === 1, 'C38. Exactly 1 item bulk rejected');

    const bulkRejectAudit = await AuditLog.findOne({
      cleaningJob: jobId,
      action: 'review_bulk_rejected'
    });
    assert(!!bulkRejectAudit, 'C39. AuditLog created for review_bulk_rejected');

    // =========================================================================
    // SECTION D: Multi-Tenant Authorization Security Checks
    // =========================================================================
    console.info('\n--- Section D: Multi-Tenant Authorization & Security Checks ---');

    // User 2 attempts to get User 1's cleaning job
    const unauthJobRes = await fetch(`${baseUrl}/cleaning-jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${token2}` }
    });
    assert(unauthJobRes.status === 403, 'D1. Unauthorized GET /cleaning-jobs/:jobId rejected with 403');

    // User 2 attempts to view User 1's review items
    const unauthReviewListRes = await fetch(`${baseUrl}/cleaning-jobs/${jobId}/review`, {
      headers: { Authorization: `Bearer ${token2}` }
    });
    assert(unauthReviewListRes.status === 403, 'D2. Unauthorized GET /review rejected with 403');

    // User 2 attempts to view single review item
    const unauthSingleReviewRes = await fetch(`${baseUrl}/cleaning-jobs/${jobId}/review/test-review-rule-1`, {
      headers: { Authorization: `Bearer ${token2}` }
    });
    assert(unauthSingleReviewRes.status === 403, 'D3. Unauthorized GET /review/:id rejected with 403');

    // User 2 attempts to accept review item
    const unauthAcceptRes = await fetch(`${baseUrl}/cleaning-jobs/${jobId}/review/test-review-rule-1/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token2}` }
    });
    assert(unauthAcceptRes.status === 403, 'D4. Unauthorized accept rejected with 403');

    // User 2 attempts to reject review item
    const unauthRejectRes = await fetch(`${baseUrl}/cleaning-jobs/${jobId}/review/test-review-dup-1/reject`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token2}` }
    });
    assert(unauthRejectRes.status === 403, 'D5. Unauthorized reject rejected with 403');

    // User 2 attempts to edit review item
    const unauthEditRes = await fetch(`${baseUrl}/cleaning-jobs/${jobId}/review/test-review-ai-1/edit`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token2}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ editedValue: 'HackerValue' })
    });
    assert(unauthEditRes.status === 403, 'D6. Unauthorized edit rejected with 403');

    // User 2 attempts bulk review actions
    const unauthBulkAcceptRes = await fetch(`${baseUrl}/cleaning-jobs/${jobId}/review/bulk-accept`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token2}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ reviewIds: ['test-review-bulk-1'] })
    });
    assert(unauthBulkAcceptRes.status === 403, 'D7. Unauthorized bulk-accept rejected with 403');

    const unauthBulkRejectRes = await fetch(`${baseUrl}/cleaning-jobs/${jobId}/review/bulk-reject`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token2}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ reviewIds: ['test-review-bulk-2'] })
    });
    assert(unauthBulkRejectRes.status === 403, 'D8. Unauthorized bulk-reject rejected with 403');

    // User 2 attempts to get cleaning report
    const unauthReportRes = await fetch(`${baseUrl}/cleaning-jobs/${jobId}/report`, {
      headers: { Authorization: `Bearer ${token2}` }
    });
    assert(unauthReportRes.status === 403, 'D9. Unauthorized GET /report rejected with 403');

    // User 2 attempts to export cleaned data
    const unauthExportRes = await fetch(`${baseUrl}/cleaning-jobs/${jobId}/export`, {
      headers: { Authorization: `Bearer ${token2}` }
    });
    assert(unauthExportRes.status === 403, 'D10. Unauthorized GET /export rejected with 403');

    // =========================================================================
    // SECTION E: Cleaning Report & Quality Analytics API Verification (Step 12)
    // =========================================================================
    console.info('\n--- Section E: Quality Report & Scorecard API ---');

    const reportRes = await fetch(`${baseUrl}/cleaning-jobs/${jobId}/report`, {
      headers: { Authorization: `Bearer ${token1}` }
    });
    const reportData = await reportRes.json();
    assert(reportRes.status === 200, 'E1. GET /cleaning-jobs/:jobId/report returned HTTP 200');
    assert(reportData.data.jobId === jobId, 'E2. Report contains valid jobId');
    assert(reportData.data.qualityScore, 'E3. Report contains qualityScore object');
    assert(typeof reportData.data.qualityScore.overall === 'number', 'E4. qualityScore.overall is a number');
    assert(typeof reportData.data.qualityScore.completeness === 'number', 'E5. Completeness score present');
    assert(typeof reportData.data.qualityScore.validity === 'number', 'E6. Validity score present');
    assert(typeof reportData.data.qualityScore.uniqueness === 'number', 'E7. Uniqueness score present');
    assert(typeof reportData.data.qualityScore.consistency === 'number', 'E8. Consistency score present');
    assert(Array.isArray(reportData.data.fieldQuality), 'E9. fieldQuality array present');
    assert(reportData.data.duplicateReport, 'E10. duplicateReport present');
    assert(reportData.data.missingReport, 'E11. missingReport present');
    assert(reportData.data.aiReport, 'E12. aiReport present');
    assert(reportData.data.batchInformation, 'E13. batchInformation present');
    assert(reportData.data.reviewSummary, 'E14. reviewSummary present');
    assert(reportData.data.reviewSummary.accepted >= 2, 'E15. reviewSummary reflects accepted items');
    assert(reportData.data.reviewSummary.rejected >= 2, 'E16. reviewSummary reflects rejected items');
    assert(reportData.data.reviewSummary.edited >= 1, 'E17. reviewSummary reflects edited items');

    // =========================================================================
    // SECTION F: Multi-Format Export Functionality & Security Redaction (Step 12)
    // =========================================================================
    console.info('\n--- Section F: Export Service & Security Redaction ---');

    // 1. CSV Export
    const csvExportRes = await fetch(`${baseUrl}/cleaning-jobs/${jobId}/export?format=csv`, {
      headers: { Authorization: `Bearer ${token1}` }
    });
    assert(csvExportRes.status === 200, 'F1. CSV export returned HTTP 200');
    assert(csvExportRes.headers.get('content-type').includes('text/csv'), 'F2. Content-Type is text/csv');
    assert(
      csvExportRes.headers.get('content-disposition').includes('attachment; filename="'),
      'F3. Content-Disposition contains attachment filename'
    );
    const csvExportText = await csvExportRes.text();
    assert(csvExportText.length > 0, 'F4. CSV export contains content');
    // Verify sensitive field 'password' is strictly redacted
    const csvHeaderLine = csvExportText.split('\n')[0].toLowerCase();
    assert(!csvHeaderLine.includes('password'), 'F5. Sensitive column "password" is REDACTED from CSV header');
    assert(!csvExportText.includes('SecretPass123'), 'F6. Sensitive password values are REDACTED from CSV rows');

    // 2. JSON Export
    const jsonExportRes = await fetch(`${baseUrl}/cleaning-jobs/${jobId}/export?format=json`, {
      headers: { Authorization: `Bearer ${token1}` }
    });
    assert(jsonExportRes.status === 200, 'F7. JSON export returned HTTP 200');
    assert(jsonExportRes.headers.get('content-type').includes('application/json'), 'F8. Content-Type is application/json');
    const jsonExportData = await jsonExportRes.json();
    assert(Array.isArray(jsonExportData), 'F9. JSON export is an array of row objects');
    assert(jsonExportData.length === 5, 'F10. All 5 dataset rows exported in JSON');
    assert(!('password' in jsonExportData[0]), 'F11. Sensitive field "password" is REDACTED from JSON rows');
    assert(!jsonExportData.some((r) => r.password !== undefined), 'F12. No row in JSON contains password');

    // Verify approved human review overrides in export
    const row4 = jsonExportData.find((r) => r.city === 'Noida');
    assert(!!row4, 'F13. Custom edited review value ("Noida") is reflected in exported data');

    // 3. Transformation Audit Report CSV Export
    const auditCsvRes = await fetch(`${baseUrl}/cleaning-jobs/${jobId}/export?format=report-csv`, {
      headers: { Authorization: `Bearer ${token1}` }
    });
    assert(auditCsvRes.status === 200, 'F14. Audit CSV export returned HTTP 200');
    assert(auditCsvRes.headers.get('content-type').includes('text/csv'), 'F15. Audit CSV Content-Type is text/csv');
    const auditCsvText = await auditCsvRes.text();
    assert(auditCsvText.includes('Original Value,Cleaned Value,Rule Applied'), 'F16. Audit CSV contains audit headers');

    // 4. PDF / Plain Text Audit Report Export
    const pdfExportRes = await fetch(`${baseUrl}/cleaning-jobs/${jobId}/export?format=pdf`, {
      headers: { Authorization: `Bearer ${token1}` }
    });
    assert(pdfExportRes.status === 200, 'F17. PDF/Text audit summary returned HTTP 200');
    const pdfText = await pdfExportRes.text();
    assert(pdfText.includes('DATASUTRA DATA CLEANING & QUALITY AUDIT REPORT'), 'F18. PDF summary includes title header');
    assert(pdfText.includes('DATA QUALITY SCORE SUMMARY'), 'F19. PDF summary includes Data Quality Score Summary');
    assert(pdfText.includes('HUMAN OPERATOR REVIEW ACTIONS'), 'F20. PDF summary includes Human Operator Review Actions');

    // 5. Audit Log verification for exports
    const exportAudits = await AuditLog.find({
      cleaningJob: jobId,
      action: 'dataset_exported'
    });
    assert(exportAudits.length >= 4, 'F21. AuditLog entries recorded for each export event');

  } finally {
    // Teardown test entities
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
    console.info('✔ Cleaned up test database entities & stopped ephemeral server');
  }

  console.info('\n====================================================');
  console.info(`🎉 STEP 11–13 TESTS SUMMARY: ${testPassed} Passed, ${testFailed} Failed`);
  console.info('====================================================');

  if (testFailed > 0) {
    process.exit(1);
  }
};

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
