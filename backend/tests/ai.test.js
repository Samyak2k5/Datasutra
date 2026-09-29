import { createRateLimiter } from '../src/middleware/rateLimiter.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import xlsx from 'xlsx';
import AdmZip from 'adm-zip';
import { ChatOpenAI } from '@langchain/openai';
import OpenAIProvider from '../src/ai/providers/openai.provider.js';
import { aiAnalysisSchema } from '../src/ai/schemas/aiAnalysis.schema.js';
import { aiPlanSchema, createDatasetCleaningSchemas, validateOperations } from '../src/ai/schemas/aiCleaning.schema.js';
import { buildDatasetAIContext } from '../src/ai/aiContext.builder.js';
import { processDatasetRows } from '../src/cleaning/pipeline/rulePipeline.js';
import parserRegistry from '../src/parsers/parser.registry.js';

const analysis = { summary: 'Test fixture summary', columns: [], issues: [], recommendations: [] };
test('schemas reject arbitrary code, unknown operations and malformed plans', () => {
  assert.equal(aiAnalysisSchema.safeParse({ summary: 42 }).success, false);
  assert.equal(aiPlanSchema.safeParse({ supported: true, message: 'execute', operations: [{ type: 'eval', column: null }] }).success, false);
  assert.throws(() => validateOperations([{ type: 'normalize_email', column: 'missing' }], ['Email']), /Unknown/);
  assert.throws(() => validateOperations([{ type: 'normalize_email', column: null }], ['Email']), /explicit/);
  assert.throws(() => validateOperations([{ type: 'remove_duplicates', column: null }], ['Email']), /unsupported/);
  assert.throws(() => validateOperations([{ type: 'trim_whitespace', column: null, code: 'run()' }], ['Email']), /unsupported/);
});
test('context bounds large inputs, excludes sensitive fields and reports sample statistics', () => {
  const rows = Array.from({length: 100}, (_, i) => ({ Name: i ? 'A'.repeat(5000) : '', Password: 'private', Nested: { api_key: 'secret', note: 'fine' } }));
  const context = buildDatasetAIContext({ totalRows: 10000, fileType: 'json' }, { headers: ['Name', 'Password', 'Nested'], rows, documentStructure: { sections: [{ content: 'X'.repeat(40000) }] } });
  assert.equal(context.sampledRows, 20); assert.equal(context.totalRows, 10000); assert.equal(context.text.length, 8000);
  assert.equal(context.columns[0].missingInSample, 1); assert.ok(JSON.stringify(context).length < 32000);
  assert.equal(JSON.stringify(context).includes('private'), false); assert.equal(JSON.stringify(context).includes('secret'), false);
});
test('reviewed operations change only selected columns and never fill or delete records', () => {
  const rows = [{ _rowNumber: 2, Name: '  alice  ', Email: '  ALICE@EXAMPLE.COM  ', Age: null }, { _rowNumber: 3, Name: '  alice  ', Email: '  ALICE@EXAMPLE.COM  ', Age: null }];
  const result = processDatasetRows(rows, ['Name', 'Email', 'Age'], { operations: [{ type: 'normalize_email', column: 'Email' }, { type: 'flag_missing_values', column: 'Age' }, { type: 'detect_duplicates', column: null }] });
  assert.equal(result.rows.length, 2); assert.equal(result.rows[0].cleaned.Email, 'alice@example.com');
  assert.equal(result.rows[0].cleaned.Name, '  alice  '); assert.equal(result.rows[0].cleaned.Age, null);
  assert.equal(result.metrics.unresolvedMissingValues, 2); assert.ok(result.metrics.duplicateRows > 0);
  assert.equal(rows[0].Email, '  ALICE@EXAMPLE.COM  '); assert.equal(result.metrics.imputedFieldCount, 0);
});
test('CSV, JSON, TXT, XLSX, XLS and DOCX reuse registry and produce bounded AI context', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'datasutra-ai-'));
  try {
    await fs.writeFile(path.join(dir, 'sample.csv'), 'Name,Age\nYash,21\nAmit,\n');
    await fs.writeFile(path.join(dir, 'sample.json'), JSON.stringify([{ Name: 'Yash', Age: 21 }, { Name: 'Amit', Age: null }]));
    await fs.writeFile(path.join(dir, 'sample.txt'), 'Dataset notes, not CSV\nMissing ages need review.');
    const wb = xlsx.utils.book_new(); xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet([['Name', 'Age'], ['Yash', 21]]), 'Data');
    xlsx.writeFile(wb, path.join(dir, 'sample.xlsx')); xlsx.writeFile(wb, path.join(dir, 'sample.xls'), { bookType: 'biff8' });
    const zip = new AdmZip(); zip.addFile('word/document.xml', Buffer.from('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Customer ages need review.</w:t></w:r></w:p></w:body></w:document>')); zip.writeZip(path.join(dir, 'sample.docx'));
    for (const format of ['csv', 'json', 'txt', 'xlsx', 'xls', 'docx']) {
      const parsed = await parserRegistry.parseToStructuredRecords(path.join(dir, 'sample.' + format), { limit: 20, fileType: format });
      assert.ok(parsed.rows.length > 0, format + ' rows');
      const context = buildDatasetAIContext({ fileType: format, totalRows: parsed.totalRows }, parsed);
      assert.ok(context.columns.length > 0, format + ' columns');
      if (format === 'txt') assert.deepEqual(parsed.headers, ['Text']);
      if (format === 'xls') assert.equal(parsed.format, 'xls');
    }
    await fs.writeFile(path.join(dir, 'bad.txt'), Buffer.from([0xff, 0x00]));
    await assert.rejects(parserRegistry.parseToStructuredRecords(path.join(dir, 'bad.txt')), /UTF-8/);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
test('OpenAI provider validates responses and safely maps failures (stubbed transport; no paid API calls)', async () => {
  const original = ChatOpenAI.prototype.withStructuredOutput;
  const provider = new OpenAIProvider({ apiKey: 'test-only-not-a-real-key' });
  try {
    ChatOpenAI.prototype.withStructuredOutput = function () { return { invoke: async () => analysis }; };
    assert.deepEqual(await provider.invokeStructured(aiAnalysisSchema, { system: 'test', payload: {} }), analysis);
    ChatOpenAI.prototype.withStructuredOutput = function () { return { invoke: async () => ({ summary: 42 }) }; };
    await assert.rejects(provider.invokeStructured(aiAnalysisSchema, { system: 'test', payload: {} }), error => error.statusCode === 502);
    for (const [input, status] of [[{status:429},429], [{status:401},503], [{name:'TimeoutError', message:'timed out'},504], [{status:500, message:'secret key must not escape'},502]]) {
      ChatOpenAI.prototype.withStructuredOutput = function () { return { invoke: async () => { throw input; } }; };
      await assert.rejects(provider.invokeStructured(aiAnalysisSchema, { system: 'test', payload: {} }), error => error.statusCode === status && !error.message.includes('secret key'));
    }
    provider.apiKey = null;
    await assert.rejects(provider.invokeStructured(aiAnalysisSchema, { system: 'test', payload: {} }), error => error.statusCode === 503);
  } finally { ChatOpenAI.prototype.withStructuredOutput = original; }
});


test('AI quota uses authenticated identity even if forwarded IP is spoofed', () => {
  const previous = process.env.DISABLE_RATE_LIMIT; delete process.env.DISABLE_RATE_LIMIT;
  try {
    const limiter = createRateLimiter({ max: 1, keyGenerator: req => req.user.id });
    let passed = 0; let status;
    const res = { setHeader() {}, status(value) { status = value; return this; }, json() {} };
    limiter({ user: { id: 'owner' }, headers: { 'x-forwarded-for': '1.1.1.1' } }, res, () => passed++);
    limiter({ user: { id: 'owner' }, headers: { 'x-forwarded-for': '2.2.2.2' } }, res, () => passed++);
    assert.equal(passed, 1); assert.equal(status, 429);
  } finally { if (previous === undefined) delete process.env.DISABLE_RATE_LIMIT; else process.env.DISABLE_RATE_LIMIT = previous; }
});


test('PDF text extraction feeds bounded AI context; disguised images are rejected', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'datasutra-pdf-'));
  try {
    const content = 'BT /F1 12 Tf 50 700 Td (Customer data report. Alice has age 21. Bob has a missing age. Review formatting and missing data.) Tj ET';
    const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>', '<< /Length ' + Buffer.byteLength(content) + ' >>\nstream\n' + content + '\nendstream', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
    let pdf = '%PDF-1.4\n'; const offsets = [0];
    for (let i = 0; i < objects.length; i++) { offsets.push(Buffer.byteLength(pdf)); pdf += (i + 1) + ' 0 obj\n' + objects[i] + '\nendobj\n'; }
    const xref = Buffer.byteLength(pdf);
    pdf += 'xref\n0 6\n0000000000 65535 f \n' + offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('') + 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
    await fs.writeFile(path.join(dir, 'sample.pdf'), pdf);
    const parsed = await parserRegistry.parseToStructuredRecords(path.join(dir, 'sample.pdf'), { limit: 20 });
    assert.ok(parsed.rows.length > 0);
    assert.equal(parsed.metadata.isScanned, false);
    const context = buildDatasetAIContext({ fileType: 'pdf', totalRows: parsed.totalRows }, parsed);
    assert.ok(JSON.stringify(context).includes('Customer data report'));
    await fs.writeFile(path.join(dir, 'image.csv'), Buffer.from('89504e470d0a1a0a00000000', 'hex'));
    await assert.rejects(parserRegistry.parseToStructuredRecords(path.join(dir, 'image.csv')), /Image AI analysis is not enabled/);
  } finally { await fs.rm(dir, {recursive: true, force: true}); }
});


test('BEFORE/AFTER metrics are calculated from actual values, documents use Not applicable', async () => {
  const { measureRecords, buildComparisonReport } = await import('../src/services/cleaningMetrics.service.js');
  const rows = [{ _rowNumber: 2, Name: 'ALICE', City: 'mumbai', Email: ' A@EXAMPLE.COM ', Phone: '+91 98765 43210', Age: null }];
  const columns = ['Name', 'City', 'Email', 'Phone', 'Age'];
  const before = measureRecords(rows, columns);
  assert.equal(before.missingValues, 1); assert.equal(before.invalidEmails, 1); assert.equal(before.invalidPhones, 1); assert.equal(before.nameCityInconsistencies, 2);
  const cleaned = processDatasetRows(rows, columns, { operations: [{ type: 'standardize_name', column: 'Name' }, { type: 'standardize_location', column: 'City' }, { type: 'normalize_email', column: 'Email' }, { type: 'standardize_phone', column: 'Phone' }] });
  const after = measureRecords(cleaned.rows.map(row => row.cleaned), columns);
  assert.equal(after.invalidEmails, 0); assert.equal(after.invalidPhones, 0); assert.equal(after.nameCityInconsistencies, 0); assert.equal(after.missingValues, 1);
  const parsed = { format: 'txt', headers: ['Text'], columns: ['Text'], rows: [{ Text: 'A meaningful document.' }], documentStructure: { sections: [{content: 'A meaningful document.'}] } };
  const report = buildComparisonReport({ parsed, cleanedRows: [{ cleaned: parsed.rows[0] }], processingTimeMs: 12 });
  assert.equal(report.metrics.originalRows, 'Not applicable'); assert.equal(report.metrics.invalidEmailsBefore, 'Not applicable');
  assert.equal(report.metrics.llmApiCalls, 0); assert.equal(report.metrics.processingTimeMs, 12); assert.equal(report.documentMetrics.extractedCharactersBefore, 22);
});

test('API counter counts successful HTTP calls separately from failures', async () => {
  const { trackedFetch, createApiCalls } = await import('../src/ai/apiCallTracker.js');
  const original = globalThis.fetch; const counts = createApiCalls();
  try {
    globalThis.fetch = async () => new Response('{}', { status: 200 });
    await trackedFetch(counts, 'embeddings')('https://api.openai.com/v1/embeddings');
    globalThis.fetch = async () => new Response('{}', { status: 429 });
    await trackedFetch(counts, 'chat')('https://api.openai.com/v1/chat/completions');
    globalThis.fetch = async () => { throw new Error('offline'); };
    await assert.rejects(trackedFetch(counts, 'chat')('https://api.openai.com/v1/chat/completions'));
    assert.deepEqual(counts, { embeddings: 1, chat: 0, total: 1, failed: 2 });
  } finally { globalThis.fetch = original; }
});


test('dataset-scoped generation schema rejects alternate columns and invalid operation/null pairs', () => {
  const columns = ['Name', 'City', 'Email', 'Phone', 'Age'];
  const { plan, suggestions } = createDatasetCleaningSchemas(columns.map(name => ({ name })));
  const valid = [
    { type: 'normalize_email', column: 'Email' }, { type: 'standardize_phone', column: 'Phone' },
    { type: 'standardize_name', column: 'Name' }, { type: 'standardize_location', column: 'City' },
    { type: 'flag_missing_values', column: null }, { type: 'detect_duplicates', column: null }
  ];
  const wrap = operations => ({ supported: true, message: 'Reviewed plan', operations });
  assert.deepEqual(plan.parse(wrap(valid)).operations, validateOperations(valid, columns));
  for (const operation of [
    { type: 'normalize_email', column: 'email' }, { type: 'standardize_location', column: 'Location' },
    { type: 'standardize_name', column: null }, { type: 'standardize_phone', column: null },
    { type: 'normalize_email', column: null }, { type: 'standardize_location', column: null },
    { type: 'detect_duplicates', column: 'Name' }, { type: 'flag_missing_values', column: 'null' }
  ]) {
    // This was the gap: the generic model schema accepted responses execution must reject.
    assert.equal(aiPlanSchema.safeParse(wrap([operation])).success, true);
    assert.equal(plan.safeParse(wrap([operation])).success, false);
    assert.throws(() => validateOperations([operation], columns));
    assert.equal(suggestions.safeParse({ suggestions: [{ issue: 'Issue', explanation: 'Explanation', suggestedAction: 'Action', severity: 'low', operation }] }).success, false);
  }
  assert.equal(plan.safeParse({ supported: false, message: 'Deletion is unsupported.', operations: [] }).success, true);
  assert.equal(plan.safeParse(wrap([{ type: 'remove_duplicates', column: null }])).success, false);
  assert.equal(createDatasetCleaningSchemas(['Customer Email']).plan.safeParse(wrap([{ type: 'normalize_email', column: 'Customer Email' }])).success, true);
  assert.equal(createDatasetCleaningSchemas([]).plan.safeParse(wrap([{ type: 'normalize_email', column: 'Email' }])).success, false);
});

test('all six vector-pipeline operations execute with exact columns and preserve duplicate rows', async () => {
  const { measureRecords } = await import('../src/services/cleaningMetrics.service.js');
  const columns = ['Name', 'City', 'Email', 'Phone', 'Age'];
  const alice = { Name: ' ALICE ', City: 'mumbai', Email: ' ALICE@EXAMPLE.COM ', Phone: '+91 98765 43210', Age: '21' };
  const rows = [{ ...alice, _rowNumber: 2 }, { ...alice, _rowNumber: 3 }, { _rowNumber: 4, Name: 'Bob', City: 'pune', Email: 'invalid-email', Phone: 'bad-phone', Age: '' }];
  const operations = [{ type: 'normalize_email', column: 'Email' }, { type: 'standardize_phone', column: 'Phone' }, { type: 'standardize_name', column: 'Name' }, { type: 'standardize_location', column: 'City' }, { type: 'flag_missing_values', column: null }, { type: 'detect_duplicates', column: null }];
  createDatasetCleaningSchemas(columns).plan.parse({ supported: true, message: 'Plan', operations });
  const before = measureRecords(rows, columns);
  const result = processDatasetRows(rows, columns, { operations });
  const after = measureRecords(result.rows.map(row => row.cleaned), columns);
  assert.deepEqual([before.rows, after.rows], [3, 3]);
  assert.deepEqual([before.missingValues, after.missingValues], [1, 1]);
  assert.deepEqual([before.invalidEmails, after.invalidEmails], [3, 1]);
  assert.deepEqual([before.invalidPhones, after.invalidPhones], [3, 1]);
  assert.deepEqual([before.duplicateGroups, after.duplicateGroups], [1, 1]);
  assert.deepEqual([before.nameCityInconsistencies, after.nameCityInconsistencies], [5, 0]);
  assert.equal(result.metrics.unresolvedMissingValues, 1);
});
