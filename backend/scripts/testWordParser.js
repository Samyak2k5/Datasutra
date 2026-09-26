import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import AdmZip from 'adm-zip';
import { parseDOCX, isValidZipMagicBytes, unescapeXml } from '../src/parsers/docx.parser.js';
import { parseDOC, isLegacyDocMagicBytes } from '../src/parsers/doc.parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, 'fixtures_word');

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
 * Creates a valid DOCX buffer containing paragraphs, headings, and tables.
 */
function createDocxBuffer({ title = 'Test Doc', paragraphs = [], tables = [] } = {}) {
  const zip = new AdmZip();

  // 1. [Content_Types].xml
  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`;
  zip.addFile('[Content_Types].xml', Buffer.from(contentTypesXml, 'utf-8'));

  // 2. docProps/core.xml
  const coreXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/">
  <dc:title>${title}</dc:title>
  <dc:creator>DataSutra Author</dc:creator>
  <dcterms:created>2026-09-25T10:00:00Z</dcterms:created>
</cp:coreProperties>`;
  zip.addFile('docProps/core.xml', Buffer.from(coreXml, 'utf-8'));

  // 3. word/document.xml
  let bodyContent = '';

  for (const p of paragraphs) {
    if (p.isHeading) {
      bodyContent += `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${p.text}</w:t></w:r></w:p>`;
    } else {
      bodyContent += `<w:p><w:r><w:t>${p.text}</w:t></w:r></w:p>`;
    }
  }

  for (const tbl of tables) {
    bodyContent += '<w:tbl>';
    for (const row of tbl) {
      bodyContent += '<w:tr>';
      for (const cell of row) {
        bodyContent += `<w:tc><w:p><w:r><w:t>${cell}</w:t></w:r></w:p></w:tc>`;
      }
      bodyContent += '</w:tr>';
    }
    bodyContent += '</w:tbl>';
  }

  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${bodyContent}</w:body>
</w:document>`;
  zip.addFile('word/document.xml', Buffer.from(docXml, 'utf-8'));

  return zip.toBuffer();
}

async function run() {
  console.info('====================================================');
  console.info('🧪 Running PHASE 19 — DOC / DOCX Extraction Tests');
  console.info('====================================================\n');

  // --- Test 1: Helper Functions ---
  console.info('--- Test 1: Helpers and XML Unescaping ---');
  assert(unescapeXml('Tom &amp; Jerry') === 'Tom & Jerry', '1.1. Unescaped &amp;');
  assert(unescapeXml('&lt;tag&gt;') === '<tag>', '1.2. Unescaped &lt; and &gt;');

  const validZipHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]);
  const invalidZipHeader = Buffer.from([0x00, 0x01, 0x02, 0x03]);
  assert(isValidZipMagicBytes(validZipHeader) === true, '1.3. Valid zip magic bytes accepted');
  assert(isValidZipMagicBytes(invalidZipHeader) === false, '1.4. Invalid zip magic bytes rejected');

  // --- Test 2: Basic DOCX with Headings & Paragraphs ---
  console.info('\n--- Test 2: DOCX with Paragraphs and Headings ---');
  const docx1 = createDocxBuffer({
    title: 'Customer Directory Report',
    paragraphs: [
      { text: 'Customer Management Guide', isHeading: true },
      { text: 'This document lists active customer records for 2026.' }
    ]
  });
  const docx1Path = path.join(fixturesDir, 'paragraphs.docx');
  fs.writeFileSync(docx1Path, docx1);

  const res2 = await parseDOCX(docx1Path);
  assert(res2.format === 'docx', '2.1. Format reported as "docx"');
  assert(res2.metadata.title === 'Customer Directory Report', '2.2. Metadata title extracted');
  assert(res2.metadata.author === 'DataSutra Author', '2.3. Metadata author extracted');
  assert(res2.documentStructure.sections.length === 2, '2.4. Document structure has 2 sections');
  assert(res2.documentStructure.sections[0].type === 'heading', '2.5. First section recognized as heading');
  assert(res2.documentStructure.sections[1].type === 'paragraph', '2.6. Second section recognized as paragraph');

  // --- Test 3: DOCX Table Extraction ---
  console.info('\n--- Test 3: DOCX Table Extraction ---');
  const docxTable = createDocxBuffer({
    title: 'Customer Leads',
    paragraphs: [{ text: 'Active Leads Table', isHeading: true }],
    tables: [
      [
        ['Name', 'Email', 'City'],
        ['Rahul Sharma', 'rahul@gmail.com', 'Mumbai'],
        ['Priya Patel', 'priya@gmail.com', 'Delhi'],
        ['Amit Verma', 'amit@gmail.com', 'Bangalore']
      ]
    ]
  });
  const docxTablePath = path.join(fixturesDir, 'table.docx');
  fs.writeFileSync(docxTablePath, docxTable);

  const res3 = await parseDOCX(docxTablePath);
  assert(res3.headers.includes('Name'), '3.1. Name header extracted');
  assert(res3.headers.includes('Email'), '3.2. Email header extracted');
  assert(res3.headers.includes('City'), '3.3. City header extracted');
  assert(res3.totalRows === 3, '3.4. Exactly 3 data rows extracted');
  assert(res3.rows[0].Name === 'Rahul Sharma', '3.5. First row Name is Rahul Sharma');
  assert(res3.rows[0].Email === 'rahul@gmail.com', '3.6. First row Email is rahul@gmail.com');
  assert(res3.rows[0]._provenance.sourceType === 'docx', '3.7. Provenance source is docx');
  assert(res3.rows[0]._provenance.tableIndex === 1, '3.8. Provenance tableIndex is 1');
  assert(res3.rows[0]._provenance.sourceRow === 1, '3.9. Provenance sourceRow is 1');

  // --- Test 4: Multiple Tables in DOCX ---
  console.info('\n--- Test 4: Multiple Tables in DOCX ---');
  const multiTableDocx = createDocxBuffer({
    title: 'Multi-Table Document',
    tables: [
      [
        ['ColA', 'ColB'],
        ['Val1', 'Val2']
      ],
      [
        ['User', 'Role'],
        ['AdminUser', 'Superadmin']
      ]
    ]
  });
  const multiTablePath = path.join(fixturesDir, 'multi_table.docx');
  fs.writeFileSync(multiTablePath, multiTableTableDocxPath());

  function multiTableTableDocxPath() {
    return multiTableDocx;
  }
  fs.writeFileSync(multiTablePath, multiTableDocx);

  const res4 = await parseDOCX(multiTablePath);
  assert(res4.documentStructure.tables.length === 2, '4.1. Exactly 2 tables recognized in structure');
  assert(
    res4.warnings.some((w) => w.includes('Multiple tables detected')),
    '4.2. Warning emitted for multiple tables without silent data loss'
  );

  // --- Test 5: Empty & Malformed DOCX ---
  console.info('\n--- Test 5: Empty and Malformed DOCX Handling ---');
  const emptyDocxPath = path.join(fixturesDir, 'empty.docx');
  fs.writeFileSync(emptyDocxPath, Buffer.alloc(0));

  let emptyErr = null;
  try {
    await parseDOCX(emptyDocxPath);
  } catch (err) {
    emptyErr = err;
  }
  assert(emptyErr !== null, '5.1. Empty DOCX rejected with error');
  assert(emptyErr.message.includes('empty'), '5.2. Error indicates empty file');

  const malformedDocxPath = path.join(fixturesDir, 'corrupt.docx');
  fs.writeFileSync(malformedDocxPath, Buffer.from('NOT A ZIP ARCHIVE'));

  let corruptErr = null;
  try {
    await parseDOCX(malformedDocxPath);
  } catch (err) {
    corruptErr = err;
  }
  assert(corruptErr !== null, '5.3. Corrupt DOCX rejected');
  assert(corruptErr.message.includes('ZIP header'), '5.4. Error indicates invalid ZIP header');

  // --- Test 6: Legacy .doc Format & Controlled Fallback ---
  console.info('\n--- Test 6: Legacy .doc Format Handling ---');
  // CFB magic bytes: D0 CF 11 E0 A1 B1 1A E1
  const legacyDocBuffer = Buffer.from([
    0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
    0x00, 0x00, 0x00, 0x00
  ]);
  assert(isLegacyDocMagicBytes(legacyDocBuffer) === true, '6.1. Legacy .doc CFB magic bytes detected');

  const docFilePath = path.join(fixturesDir, 'legacy_document.doc');
  fs.writeFileSync(docFilePath, legacyDocBuffer);

  let docErr = null;
  try {
    await parseDOC(docFilePath);
  } catch (err) {
    docErr = err;
  }
  assert(docErr !== null, '6.2. parseDOC returns controlled error');
  assert(
    docErr.message.includes('UNSUPPORTED_LEGACY_DOC'),
    '6.3. Returns clear UNSUPPORTED_LEGACY_DOC status and user guidance'
  );

  // Cleanup test fixtures
  try {
    fs.rmSync(fixturesDir, { recursive: true, force: true });
  } catch {
    // ignore
  }

  console.info('\n====================================================');
  console.info(`🎉 PHASE 19 Tests Completed: ${passed} passed, ${failed} failed`);
  console.info('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
