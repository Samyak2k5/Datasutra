import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  DocumentCategory,
  mapToCanonicalHeader,
  classifyDocument,
  extractSemiStructuredFields,
  separateDocumentTables,
  calculateDocumentQualityMetrics
} from '../src/intelligence/documentIntelligence.js';

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
  console.info('🧪 Running PHASE 22 — Advanced Document Intelligence Tests');
  console.info('====================================================\n');

  // --- Test 1: Deterministic Document Classification ---
  console.info('--- Test 1: Deterministic Document Classification ---');
  const invoiceText = 'Invoice Number: INV-2026-001\nBill To: Acme Corp\nDue Date: 2026-10-15\nSubtotal: $5,000\nTax Rate: 10%\nAmount Due: $5,500';
  const class1 = classifyDocument(invoiceText);
  assert(class1.category === DocumentCategory.INVOICE, '1.1. Invoice classified correctly');
  assert(class1.confidence >= 0.9, '1.2. Invoice classification confidence high');

  const customerListText = 'Customer Directory 2026\nContains client leads, contact numbers, email addresses and cities.';
  const class2 = classifyDocument(customerListText, ['Customer Name', 'Email Address', 'Mobile']);
  assert(class2.category === DocumentCategory.CUSTOMER_LIST, '1.3. Customer list classified correctly');

  const statementText = 'Statement of Account\nTransaction Date: 2026-09-01\nDebit: 500\nCredit: 1200\nBalance: 7000';
  const class3 = classifyDocument(statementText);
  assert(class3.category === DocumentCategory.TRANSACTION_STATEMENT, '1.4. Transaction statement classified correctly');

  const appFormText = 'Application Form for Registration\nApplicant Name: John Doe\nDate of Birth: 1995-05-10\nApplicant Signature: [Signed]';
  const class4 = classifyDocument(appFormText);
  assert(class4.category === DocumentCategory.APPLICATION_FORM, '1.5. Application form classified correctly');

  const unknownText = 'Just some random notes about the weather today.';
  const class5 = classifyDocument(unknownText);
  assert(class5.category === DocumentCategory.UNKNOWN, '1.6. Unrecognized document classified as unknown_document');

  // --- Test 2: Deterministic Header Alias Mapping ---
  console.info('\n--- Test 2: Table Header Alias Mapping ---');
  const m1 = mapToCanonicalHeader('Full Name');
  assert(m1.canonical === 'Name' && m1.matched === true, '2.1. "Full Name" mapped to canonical "Name"');

  const m2 = mapToCanonicalHeader('Customer Name');
  assert(m2.canonical === 'Name', '2.2. "Customer Name" mapped to "Name"');

  const m3 = mapToCanonicalHeader('Email Address');
  assert(m3.canonical === 'Email', '2.3. "Email Address" mapped to canonical "Email"');

  const m4 = mapToCanonicalHeader('Contact Number');
  assert(m4.canonical === 'Phone', '2.4. "Contact Number" mapped to canonical "Phone"');

  const m5 = mapToCanonicalHeader('Mobile');
  assert(m5.canonical === 'Phone', '2.5. "Mobile" mapped to canonical "Phone"');

  const m6 = mapToCanonicalHeader('Location');
  assert(m6.canonical === 'City', '2.6. "Location" mapped to canonical "City"');

  const m7 = mapToCanonicalHeader('UnknownCustomMetric');
  assert(m7.canonical === 'UnknownCustomMetric' && m7.matched === false, '2.7. Unmapped headers preserved intact');

  // --- Test 3: Semi-Structured Field Discovery (Zero Hallucination) ---
  console.info('\n--- Test 3: Semi-Structured Key-Value Extraction ---');
  const semiStructuredLines = [
    'Customer Details:',
    'Customer Name: Rahul Sharma',
    'Email Address: rahul@gmail.com',
    'Mobile: 9876543210',
    'Location: Mumbai',
    '---',
    'Customer Name: Priya Patel',
    'Email Address: priya@patel.com',
    'Mobile: 9123456780',
    'Location: Delhi'
  ];

  const extracted = extractSemiStructuredFields(semiStructuredLines, 2);
  assert(extracted.length === 2, '3.1. Exactly 2 records extracted from key-value text');
  assert(extracted[0].Name === 'Rahul Sharma', '3.2. Record 1 Name extracted');
  assert(extracted[0].Email === 'rahul@gmail.com', '3.3. Record 1 Email extracted');
  assert(extracted[0].Phone === '9876543210', '3.4. Record 1 Phone extracted');
  assert(extracted[0].City === 'Mumbai', '3.5. Record 1 City extracted');
  assert(extracted[0].Salary === undefined, '3.6. Missing field Salary is NOT fabricated (zero hallucination)');
  assert(extracted[0]._provenance.sourcePage === 2, '3.7. Source page preserved in provenance');

  // --- Test 4: Multi-Table Cataloguing & Separation ---
  console.info('\n--- Test 4: Multi-Table Separation ---');
  const detectedTables = [
    { headers: ['Full Name', 'Email Address'], rowCount: 15, pageNumber: 1 },
    { headers: ['Product ID', 'Price', 'Qty'], rowCount: 8, pageNumber: 2 }
  ];

  const separated = separateDocumentTables(detectedTables);
  assert(separated.length === 2, '4.1. Exactly 2 tables catalogued');
  assert(separated[0].tableId === 'table_1', '4.2. First table identified as table_1');
  assert(separated[0].isPrimary === true, '4.3. First table designated as primary');
  assert(separated[0].canonicalHeaders.includes('Name'), '4.4. Canonical headers mapped');
  assert(separated[1].tableId === 'table_2', '4.5. Second table identified as table_2');
  assert(separated[1].isPrimary === false, '4.6. Second table is not primary');

  // --- Test 5: Document Extraction Quality Metrics ---
  console.info('\n--- Test 5: Document Quality Metrics ---');
  const quality = calculateDocumentQualityMetrics({
    totalPages: 3,
    extractedPages: 3,
    failedPages: 0,
    tablesFound: 2,
    recordsExtracted: 23,
    columns: ['Name', 'Email', 'City'],
    rows: [
      { Name: 'Rahul', Email: 'rahul@test.com', City: 'Mumbai' },
      { Name: 'Priya', Email: '', City: 'Delhi', issues: [{ field: 'Email', message: 'Missing' }] }
    ],
    ocrUsed: false
  });

  assert(quality.totalPages === 3, '5.1. Total pages tracked');
  assert(quality.tablesFound === 2, '5.2. Tables found tracked');
  assert(quality.fieldsMissing === 1, '5.3. Missing field counted (Priya empty email)');
  assert(quality.ambiguousFields === 1, '5.4. Ambiguous field counted');
  assert(quality.reviewRequired === true, '5.5. reviewRequired marked true due to missing value');

  console.info('\n====================================================');
  console.info(`🎉 PHASE 22 Tests Completed: ${passed} passed, ${failed} failed`);
  console.info('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
