/**
 * STEP 15 — Security Hardening Test Suite
 * Validates:
 * 1. Security Headers (HSTS, CSP, X-Frame-Options, X-Content-Type-Options, etc.)
 * 2. Information Disclosure Protection (Removal of X-Powered-By)
 * 3. Rate Limiting (Headers, Quota exhaustion, 429 status, Retry-After)
 * 4. NoSQL Operator Injection Sanitization
 * 5. CSV Formula Injection Defense (CWE-1236)
 * 6. SSRF Protection (Cloud metadata, loopback, private ranges)
 * 7. Sensitive Credential Isolation & Masking
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import app from '../src/app.js';
import env from '../src/config/env.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import User from '../src/models/User.js';
import Dataset from '../src/models/Dataset.js';
import CleaningJob from '../src/models/CleaningJob.js';
import { createRateLimiter } from '../src/middleware/rateLimiter.js';
import { exportDatasetOrReport } from '../src/services/export.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runSecurityTests() {
  console.log('====================================================');
  console.log('🛡️  STEP 15 — Security Hardening & Penetration Tests');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  const assert = (condition, description) => {
    if (condition) {
      console.log(`[PASS] ${description}`);
      passed++;
    } else {
      console.error(`[FAIL] ${description}`);
      failed++;
      throw new Error(`Security assertion failed: ${description}`);
    }
  };

  await connectDB();

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}${env.apiPrefix}`;
  const rootUrl = `http://127.0.0.1:${port}`;
  console.log(`✔ Ephemeral test server listening on ${baseUrl}\n`);

  let testUserId = null;
  let testUserToken = null;

  try {
    // =========================================================================
    // SECTION 15.1: HTTP SECURITY HEADERS & INFORMATION DISCLOSURE
    // =========================================================================
    console.log('--- 15.1: HTTP Security Headers & Information Disclosure ---');

    const headRes = await fetch(`${baseUrl}/health`);
    assert(headRes.status === 200, '15.1.1 Health endpoint reachable');

    const headers = headRes.headers;
    assert(headers.get('x-content-type-options') === 'nosniff', '15.1.2 X-Content-Type-Options is nosniff');
    assert(headers.get('x-frame-options') === 'DENY', '15.1.3 X-Frame-Options is DENY');
    assert(headers.get('x-xss-protection') === '0', '15.1.4 X-XSS-Protection is 0 (modern policy)');
    assert(headers.get('strict-transport-security')?.includes('max-age=31536000'), '15.1.5 HSTS header configured for 1 year');
    assert(headers.get('content-security-policy')?.includes("default-src 'self'"), '15.1.6 Content-Security-Policy enforces self origin');
    assert(headers.get('referrer-policy') === 'strict-origin-when-cross-origin', '15.1.7 Referrer-Policy is strict-origin-when-cross-origin');
    assert(headers.get('cross-origin-opener-policy') === 'same-origin', '15.1.8 COOP is same-origin');
    assert(headers.get('cross-origin-resource-policy') === 'same-site', '15.1.9 CORP is same-site');
    assert(!headers.get('x-powered-by'), '15.1.10 X-Powered-By is suppressed / removed');

    // Root URL check
    const rootRes = await fetch(rootUrl);
    assert(!rootRes.headers.get('x-powered-by'), '15.1.11 Root endpoint strips X-Powered-By');

    // =========================================================================
    // SECTION 15.2: RATE LIMITING & BRUTE FORCE DEFENSE
    // =========================================================================
    console.log('\n--- 15.2: Rate Limiting & Throttling Protections ---');

    assert(headers.has('ratelimit-limit'), '15.2.1 RateLimit-Limit header returned to client');
    assert(headers.has('ratelimit-remaining'), '15.2.2 RateLimit-Remaining header returned to client');
    assert(headers.has('ratelimit-reset'), '15.2.3 RateLimit-Reset header returned to client');

    // Test a strict mini-rate limiter for quota exhaustion
    const strictLimiter = createRateLimiter({
      windowMs: 5000,
      max: 3,
      message: 'Quota exceeded for test'
    });

    const testApp = http.createServer((req, res) => {
      strictLimiter(req, res, () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      });
    });

    await new Promise(r => testApp.listen(0, '127.0.0.1', r));
    const testAppPort = testApp.address().port;
    const testAppUrl = `http://127.0.0.1:${testAppPort}`;

    // Fire 3 allowed requests
    for (let i = 1; i <= 3; i++) {
      const res = await fetch(testAppUrl);
      assert(res.status === 200, `15.2.4 Request #${i} allowed within quota`);
    }

    // 4th request must be blocked with HTTP 429
    const blockedRes = await fetch(testAppUrl);
    const blockedBody = await blockedRes.json();
    assert(blockedRes.status === 429, '15.2.5 4th request blocked with HTTP 429 Too Many Requests');
    assert(blockedRes.headers.has('retry-after'), '15.2.6 Retry-After header present on 429 response');
    assert(blockedBody.message === 'Quota exceeded for test', '15.2.7 Informative quota exceeded message returned');

    testApp.close();

    // =========================================================================
    // SECTION 15.3: NOSQL OPERATOR INJECTION SANITIZATION
    // =========================================================================
    console.log('\n--- 15.3: NoSQL Operator Injection Sanitization ---');

    // Register test user
    const regRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Security Tester',
        email: `sec_${Date.now()}@datasutra.test`,
        password: 'Password123!',
        organization: 'Security Guild'
      })
    });
    const regData = await regRes.json();
    testUserId = regData.data.user.id;
    testUserToken = regData.data.accessToken;

    // Attempt NoSQL injection via login with operator payload
    const injectionLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: { $gt: '' },
        password: 'Password123!'
      })
    });
    assert(
      injectionLoginRes.status === 400,
      '15.3.1 Login with object/NoSQL operator $gt rejected with HTTP 400 Bad Request'
    );

    // =========================================================================
    // SECTION 15.4: SSRF PROTECTION (METADATA & LOOPBACKS)
    // =========================================================================
    console.log('\n--- 15.4: Server-Side Request Forgery (SSRF) Defense ---');

    const ssrfEndpoints = [
      { name: 'AWS/GCP Instance Metadata', url: 'http://169.254.169.254/computeMetadata/v1/' },
      { name: 'IPv4 Loopback Localhost', url: 'http://127.0.0.1:27017' },
      { name: 'Named Localhost', url: 'http://localhost:5000' },
      { name: 'Private Subnet 10.x.x.x', url: 'http://10.0.0.1/internal-admin' },
      { name: 'Private Subnet 192.168.x.x', url: 'http://192.168.1.1/router' },
      { name: 'Non-HTTP Protocol file://', url: 'file:///etc/passwd' }
    ];

    for (let s = 0; s < ssrfEndpoints.length; s++) {
      const target = ssrfEndpoints[s];
      const res = await fetch(`${baseUrl}/datasets/import/json-api`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${testUserToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: `SSRF Probe ${s}`,
          endpointUrl: target.url
        })
      });
      assert(res.status === 400, `15.4.${s + 1} SSRF blocked: ${target.name} (${target.url})`);
    }

    // =========================================================================
    // SECTION 15.5: CSV FORMULA INJECTION DEFENSE (CWE-1236)
    // =========================================================================
    console.log('\n--- 15.5: CSV Formula Injection Defense (CWE-1236) ---');

    // Create a mock dataset and cleaning job with malicious CSV formula cells
    const maliciousDataset = await Dataset.create({
      owner: testUserId,
      name: 'CSV Injection Test',
      originalFileName: 'malicious.csv',
      fileType: 'csv',
      sourceFormat: 'csv',
      storagePath: 'fake/path/malicious.csv',
      fileSize: 1024,
      status: 'completed',
      columns: [
        { name: 'ID', originalName: 'ID', detectedType: 'number' },
        { name: 'Command', originalName: 'Command', detectedType: 'string' },
        { name: 'FormulaSum', originalName: 'FormulaSum', detectedType: 'string' },
        { name: 'LegitNegative', originalName: 'LegitNegative', detectedType: 'number' },
        { name: 'LegitPositive', originalName: 'LegitPositive', detectedType: 'number' }
      ]
    });

    const maliciousJob = await CleaningJob.create({
      dataset: maliciousDataset._id,
      owner: testUserId,
      createdBy: testUserId,
      status: 'completed',
      cleaningMode: 'rules_only',
      preview: [
        {
          rowNumber: 1,
          original: {
            ID: 1,
            Command: '=CMD|\' /C calc\'!A0',
            FormulaSum: '@SUM(1+1)',
            LegitNegative: -42,
            LegitPositive: +100
          },
          cleaned: {
            ID: 1,
            Command: '=CMD|\' /C calc\'!A0',
            FormulaSum: '@SUM(1+1)',
            LegitNegative: -42,
            LegitPositive: +100
          }
        },
        {
          rowNumber: 2,
          original: {
            ID: 2,
            Command: '+cmd|\' /C notepad\'!A0',
            FormulaSum: '-malicious_payload',
            LegitNegative: -999.5,
            LegitPositive: 50
          },
          cleaned: {
            ID: 2,
            Command: '+cmd|\' /C notepad\'!A0',
            FormulaSum: '-malicious_payload',
            LegitNegative: -999.5,
            LegitPositive: 50
          }
        }
      ]
    });

    const csvExport = await exportDatasetOrReport(maliciousJob._id.toString(), testUserId.toString(), 'csv');
    assert(csvExport.contentType.includes('text/csv'), '15.5.1 CSV export generated successfully');

    const csvLines = csvExport.content.split('\r\n');
    const headerLine = csvLines[0];
    const dataLine1 = csvLines[1];
    const dataLine2 = csvLines[2];

    assert(headerLine.includes('Command'), '15.5.2 Header row contains Command column');

    // Verify formula cells were neutralized with leading single quote: '=CMD... or '+cmd...
    assert(dataLine1.includes("'=CMD"), '15.5.3 "=CMD" cell neutralized with leading single quote (\'=CMD)');
    assert(dataLine1.includes("'@SUM"), '15.5.4 "@SUM" cell neutralized with leading single quote (\'@SUM)');
    assert(dataLine2.includes("'+cmd"), '15.5.5 "+cmd" cell neutralized with leading single quote (\'+cmd)');
    assert(dataLine2.includes("'-malicious"), '15.5.6 "-malicious" cell neutralized with leading single quote (\'-malicious)');

    // Verify legitimate numbers were NOT corrupted with single quotes
    assert(dataLine1.includes('-42'), '15.5.7 Legitimate negative number -42 preserved untouched');
    assert(!dataLine1.includes("'-42"), '15.5.8 Legitimate negative number -42 not corrupted with single quote');

    // =========================================================================
    // SECTION 15.6: SENSITIVE CREDENTIAL ISOLATION & MASKING
    // =========================================================================
    console.log('\n--- 15.6: Sensitive Credential Isolation & Masking ---');

    // Verify User JSON serialization never exposes passwordHash
    const userDoc = await User.findById(testUserId);
    const userJson = userDoc.toJSON();
    assert(userJson.passwordHash === undefined, '15.6.1 passwordHash strictly excluded from User.toJSON()');
    assert(userJson.__v === undefined, '15.6.2 __v strictly excluded from User.toJSON()');

    // Verify export service strips sensitive columns
    const sensitiveDataset = await Dataset.create({
      owner: testUserId,
      name: 'Sensitive Auth Data',
      originalFileName: 'auth_dump.csv',
      fileType: 'csv',
      sourceFormat: 'csv',
      storagePath: 'fake/path/auth.csv',
      fileSize: 512,
      status: 'completed',
      columns: [
        { name: 'username', originalName: 'username', detectedType: 'string' },
        { name: 'password', originalName: 'password', detectedType: 'string' },
        { name: 'passwordHash', originalName: 'passwordHash', detectedType: 'string' },
        { name: 'apiKey', originalName: 'apiKey', detectedType: 'string' },
        { name: 'jwtToken', originalName: 'jwtToken', detectedType: 'string' }
      ]
    });

    const sensitiveJob = await CleaningJob.create({
      dataset: sensitiveDataset._id,
      owner: testUserId,
      createdBy: testUserId,
      status: 'completed',
      cleaningMode: 'rules_only',
      preview: [
        {
          rowNumber: 1,
          original: {
            username: 'alice',
            password: 'SuperSecretPassword!',
            passwordHash: '$2b$12$eX4mPL3H45hV4Lu3',
            apiKey: 'sk-proj-1234567890abcdef',
            jwtToken: 'eyJhbGciOiJIUzI1NiIsIn...'
          },
          cleaned: {
            username: 'alice',
            password: 'SuperSecretPassword!',
            passwordHash: '$2b$12$eX4mPL3H45hV4Lu3',
            apiKey: 'sk-proj-1234567890abcdef',
            jwtToken: 'eyJhbGciOiJIUzI1NiIsIn...'
          }
        }
      ]
    });

    const strippedCsv = await exportDatasetOrReport(sensitiveJob._id.toString(), testUserId.toString(), 'csv');
    assert(!strippedCsv.content.includes('SuperSecretPassword!'), '15.6.3 Plaintext password stripped from export');
    assert(!strippedCsv.content.includes('$2b$12$eX4mPL3H45hV4Lu3'), '15.6.4 Password hash stripped from export');
    assert(!strippedCsv.content.includes('sk-proj-1234567890abcdef'), '15.6.5 API key stripped from export');
    assert(!strippedCsv.content.includes('eyJhbGciOiJIUzI1NiIsIn...'), '15.6.6 JWT token stripped from export');
    assert(strippedCsv.content.includes('alice'), '15.6.7 Non-sensitive username field preserved');

    // Clean up created entities
    await Dataset.deleteMany({ owner: testUserId });
    await CleaningJob.deleteMany({ owner: testUserId });
    await User.findByIdAndDelete(testUserId);

  } finally {
    await disconnectDB();
    server.close();
  }

  console.log('\n====================================================');
  console.log(`🎉 STEP 15 SECURITY TESTS SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('====================================================');
}

runSecurityTests().catch(err => {
  console.error('Security tests encountered error:', err);
  process.exit(1);
});
