import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import AdmZip from 'adm-zip';
import parserRegistry from '../src/parsers/parser.registry.js';
import parserService from '../src/services/parser.service.js';
import rulePipeline from '../src/cleaning/pipeline/rulePipeline.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, 'fixtures_unified');

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

/**
 * Creates minimal valid PDF buffer.
 */
function createPdfBuffer(lines = []) {
  let streamText = 'BT /F1 12 Tf\n72 720 Td\n';
  lines.forEach((line, idx) => {
    if (idx > 0) streamText += '0 -20 Td\n';
    streamText += `(${line}) Tj\n`;
  });
  streamText += 'ET\n';

  const len = Buffer.byteLength(streamText, 'utf-8');
  let pdf = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n4 0 obj\n<< /Length ' + len + ' >>\nstream\n' + streamText + 'endstream\nendobj\n5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\nxref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000244 00000 n \n0000000340 00000 n \ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n419\n%%EOF\n';
  return Buffer.from(pdf, 'utf-8');
}

/**
 * Creates minimal valid DOCX buffer with a table.
 */
function createDocxTableBuffer(headers, rows) {
  const zip = new AdmZip();
  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
  zip.addFile('[Content_Types].xml', Buffer.from(contentTypesXml, 'utf-8'));

  let tableXml = '<w:tbl><w:tr>';
  for (const h of headers) {
    tableXml += `<w:tc><w:p><w:r><w:t>${h}</w:t></w:r></w:p></w:tc>`;
  }
  tableXml += '</w:tr>';

  for (const r of rows) {
    tableXml += '<w:tr>';
    for (const c of r) {
      tableXml += `<w:tc><w:p><w:r><w:t>${c}</w:t></w:r></w:p></w:tc>`;
    }
    tableXml += '</w:tr>';
  }
  tableXml += '</w:tbl>';

  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${tableXml}</w:body>
</w:document>`;
  zip.addFile('word/document.xml', Buffer.from(docXml, 'utf-8'));
  return zip.toBuffer();
}

async function run() {
  console.info('====================================================');
  console.info('🧪 Running PHASE 20 — Multi-Format Unified Pipeline Tests');
  console.info('====================================================\n');

  // --- Test 1: Parser Registry Registration & Detection ---
  console.info('--- Test 1: Registry Parser Registration & Detection ---');
  assert(parserRegistry.get('csv') !== null, '1.1. CSV parser registered');
  assert(parserRegistry.get('xlsx') !== null, '1.2. XLSX parser registered');
  assert(parserRegistry.get('json') !== null, '1.3. JSON parser registered');
  assert(parserRegistry.get('pdf') !== null, '1.4. PDF parser registered');
  assert(parserRegistry.get('docx') !== null, '1.5. DOCX parser registered');
  assert(parserRegistry.get('doc') !== null, '1.6. DOC parser registered');

  // --- Test 2: Unified CSV Parsing ---
  console.info('\n--- Test 2: Unified Parsing - CSV ---');
  const csvPath = path.join(fixturesDir, 'sample.csv');
  fs.writeFileSync(csvPath, 'Name,Email,City\nRahul Sharma,rahul@gmail.com,bombay\nPriya Patel,priya@patel.com,delhi\n');

  const csvResult = await parserService.parseDataset(csvPath, 'csv');
  assert(csvResult.format === 'csv', '2.1. Format is csv');
  assert(csvResult.totalRows === 2, '2.2. Total rows is 2');
  assert(Array.isArray(csvResult.columns), '2.3. Columns is an array');
  assert(csvResult.headers.includes('Email'), '2.4. Headers contains Email');

  // --- Test 3: Unified JSON Parsing ---
  console.info('\n--- Test 3: Unified Parsing - JSON ---');
  const jsonPath = path.join(fixturesDir, 'sample.json');
  fs.writeFileSync(
    jsonPath,
    JSON.stringify([
      { Name: 'Amit Verma', Email: 'AMIT@GMAIL.COM', City: 'BANGALORE' },
      { Name: 'Sneha Roy', Email: 'sneha@yahoo.com', City: 'kolkata' }
    ])
  );

  const jsonResult = await parserService.parseDataset(jsonPath, 'json');
  assert(jsonResult.format === 'json', '3.1. Format is json');
  assert(jsonResult.totalRows === 2, '3.2. Total rows is 2');
  assert(jsonResult.headers.includes('City'), '3.3. Headers contains City');
  assert(jsonResult.rows[0].Name === 'Amit Verma', '3.4. First row parsed');

  // --- Test 4: Unified PDF Parsing ---
  console.info('\n--- Test 4: Unified Parsing - PDF ---');
  const pdfBuffer = createPdfBuffer([
    '| Name | Email | City |',
    '| Karan Malhotra | karan@gmail.com | Mumbai |',
    '| Nisha Singh | nisha@gmail.com | Delhi |'
  ]);
  const pdfPath = path.join(fixturesDir, 'sample.pdf');
  fs.writeFileSync(pdfPath, pdfBuffer);

  const pdfResult = await parserService.parseDataset(pdfPath, 'pdf');
  assert(pdfResult.format === 'pdf', '4.1. Format is pdf');
  assert(pdfResult.totalRows === 2, '4.2. Total rows is 2');
  assert(pdfResult.rows[0].Name === 'Karan Malhotra', '4.3. Extracted name matches');
  assert(pdfResult.rows[0]._provenance.sourceType === 'pdf', '4.4. Provenance source is pdf');

  // --- Test 5: Unified DOCX Parsing ---
  console.info('\n--- Test 5: Unified Parsing - DOCX ---');
  const docxBuffer = createDocxTableBuffer(
    ['Name', 'Email', 'City'],
    [
      ['Deepak Chopra', 'deepak@gmail.com', 'pune'],
      ['Meera Nair', 'meera@gmail.com', 'chennai']
    ]
  );
  const docxPath = path.join(fixturesDir, 'sample.docx');
  fs.writeFileSync(docxPath, docxBuffer);

  const docxResult = await parserService.parseDataset(docxPath, 'docx');
  assert(docxResult.format === 'docx', '5.1. Format is docx');
  assert(docxResult.totalRows === 2, '5.2. Total rows is 2');
  assert(docxResult.rows[0].Name === 'Deepak Chopra', '5.3. Extracted name matches');
  assert(docxResult.rows[0]._provenance.sourceType === 'docx', '5.4. Provenance source is docx');

  // --- Test 6: Universal Data Preview Across Formats ---
  console.info('\n--- Test 6: Universal Data Preview Across Formats ---');
  const csvPrev = await parserService.getPreview(csvPath, 'csv', 1);
  assert(csvPrev.previewRows === 1, '6.1. CSV preview bounded to 1');

  const jsonPrev = await parserService.getPreview(jsonPath, 'json', 1);
  assert(jsonPrev.previewRows === 1, '6.2. JSON preview bounded to 1');

  const pdfPrev = await parserService.getPreview(pdfPath, 'pdf', 1);
  assert(pdfPrev.previewRows === 1, '6.3. PDF preview bounded to 1');
  assert(pdfPrev.documentStructure !== null, '6.4. PDF preview includes documentStructure');

  const docxPrev = await parserService.getPreview(docxPath, 'docx', 1);
  assert(docxPrev.previewRows === 1, '6.5. DOCX preview bounded to 1');
  assert(docxPrev.documentStructure !== null, '6.6. DOCX preview includes documentStructure');

  // --- Test 7: Extension Spoofing Defense ---
  console.info('\n--- Test 7: Signature Mismatch / Spoofing Defense ---');
  const spoofedPath = path.join(fixturesDir, 'spoofed.csv');
  // Write a PDF buffer to a file named .csv
  fs.writeFileSync(spoofedPath, pdfBuffer);

  let spoofErr = null;
  try {
    await parserRegistry.parseToStructuredRecords(spoofedPath, { fileType: 'csv' });
  } catch (err) {
    spoofErr = err;
  }
  assert(spoofErr !== null, '7.1. Spoofed extension rejected');
  assert(spoofErr.message.includes('signature mismatch'), '7.2. Error identifies signature mismatch');

  // --- Test 8: All Formats Enter Common Cleaning Pipeline (Step 7–9) ---
  console.info('\n--- Test 8: Single Common Cleaning Pipeline Handoff ---');
  // Pass records from CSV, JSON, PDF, and DOCX through the EXACT SAME rulePipeline!
  const cleanedFromCsv = rulePipeline.processDatasetRows(csvResult.rows, csvResult.columns);
  assert(cleanedFromCsv.metrics.totalRows === 2, '8.1. CSV rows cleaned by common engine');
  assert(cleanedFromCsv.rows[0].cleaned.City === 'Mumbai', '8.2. CSV bombay normalized to Mumbai');

  const cleanedFromJson = rulePipeline.processDatasetRows(jsonResult.rows, jsonResult.columns);
  assert(cleanedFromJson.metrics.totalRows === 2, '8.3. JSON rows cleaned by common engine');
  assert(cleanedFromJson.rows[0].cleaned.Email === 'amit@gmail.com', '8.4. JSON email lowercased');

  const cleanedFromPdf = rulePipeline.processDatasetRows(pdfResult.rows, pdfResult.columns);
  assert(cleanedFromPdf.metrics.totalRows === 2, '8.5. PDF rows cleaned by common engine');
  assert(cleanedFromPdf.rows[0].classification === 'clean' || cleanedFromPdf.rows[0].classification === 'modified', '8.6. PDF row classified');

  const cleanedFromDocx = rulePipeline.processDatasetRows(docxResult.rows, docxResult.columns);
  assert(cleanedFromDocx.metrics.totalRows === 2, '8.7. DOCX rows cleaned by common engine');
  assert(cleanedFromDocx.rows[0].cleaned.City === 'Pune', '8.8. DOCX pune title-cased');

  // Cleanup test fixtures
  try {
    fs.rmSync(fixturesDir, { recursive: true, force: true });
  } catch {
    // ignore
  }

  console.info('\n====================================================');
  console.info(`🎉 PHASE 20 Tests Completed: ${passed} passed, ${failed} failed`);
  console.info('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
