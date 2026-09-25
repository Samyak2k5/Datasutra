import http from 'http';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import env from '../src/config/env.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import User from '../src/models/User.js';

const runTests = async () => {
  console.info('====================================================');
  console.info('🧪 Running STEP 4 — Authentication & User Management Tests');
  console.info('====================================================\n');

  // Connect to database
  await connectDB();

  // Start ephemeral server for testing
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

  const testEmail = `auth_test_${Date.now()}@example.com`;
  const testPassword = 'StrongPassword123!';
  let createdUserId = null;
  let validToken = null;

  try {
    // 1. Register a new user
    console.info('--- 1 & 2 & 3 & 4. Registration & Password Security ---');
    const registerRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Jane Developer',
        email: testEmail,
        password: testPassword
      })
    });
    const registerData = await registerRes.json();
    assert(registerRes.status === 201, 'Registration returns HTTP 201 Created');
    assert(registerData.success === true, 'Registration returns success: true');
    assert(registerData.data.accessToken, 'Registration returns accessToken');
    assert(registerData.data.user.email === testEmail.toLowerCase(), 'Registration returns normalized email');
    assert(!('password' in registerData.data.user), 'Response does NOT contain plain password');
    assert(!('passwordHash' in registerData.data.user), 'Response does NOT contain passwordHash');
    createdUserId = registerData.data.user.id;
    validToken = registerData.data.accessToken;

    // Direct MongoDB verification
    const dbUser = await User.findById(createdUserId);
    assert(!!dbUser, 'User successfully persisted in MongoDB');
    assert(dbUser.passwordHash !== testPassword, 'Plaintext password is NOT stored in MongoDB');
    assert(dbUser.passwordHash.startsWith('$2b$'), 'Password in MongoDB is a valid bcrypt hash');
    const hashMatches = await bcrypt.compare(testPassword, dbUser.passwordHash);
    assert(hashMatches === true, 'bcrypt correctly verifies password against stored hash');

    // 5. Duplicate email registration fails
    console.info('\n--- 5. Duplicate Registration ---');
    const dupRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Another User',
        email: testEmail.toUpperCase(), // Test case-insensitivity
        password: 'AnotherPassword456!'
      })
    });
    const dupData = await dupRes.json();
    assert(dupRes.status === 409, 'Duplicate registration returns HTTP 409 Conflict');
    assert(dupData.success === false, 'Duplicate registration returns success: false');

    // 6 & 7. Login with correct credentials
    console.info('\n--- 6 & 7 & 14. Login & lastLoginAt Update ---');
    const initialLoginAt = dbUser.lastLoginAt;
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword
      })
    });
    const loginData = await loginRes.json();
    assert(loginRes.status === 200, 'Login with correct credentials returns HTTP 200 OK');
    assert(loginData.success === true, 'Login returns success: true');
    assert(loginData.data.accessToken, 'Login returns accessToken');
    assert(!('passwordHash' in loginData.data.user), 'Login response does NOT contain passwordHash');

    // Verify lastLoginAt updated in MongoDB
    const updatedDbUser = await User.findById(createdUserId);
    assert(updatedDbUser.lastLoginAt !== initialLoginAt && updatedDbUser.lastLoginAt !== null, 'lastLoginAt was updated in MongoDB upon login');

    // 8. Login with incorrect password
    console.info('\n--- 8. Invalid Login ---');
    const wrongLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'WrongPassword999!'
      })
    });
    const wrongLoginData = await wrongLoginRes.json();
    assert(wrongLoginRes.status === 401, 'Login with wrong password returns HTTP 401');
    assert(wrongLoginData.message === 'Invalid email or password.', 'Generic error message returned for invalid credentials');

    // 9, 10, 11. /auth/me tests
    console.info('\n--- 9 & 10 & 11 & 18. Protected /auth/me Endpoint ---');
    // Without token
    const meNoTokenRes = await fetch(`${baseUrl}/auth/me`);
    assert(meNoTokenRes.status === 401, 'GET /auth/me without token returns HTTP 401');

    // With invalid token
    const meBadTokenRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: 'Bearer this.is.an.invalid.token' }
    });
    assert(meBadTokenRes.status === 401, 'GET /auth/me with invalid token returns HTTP 401');

    // With valid token
    const meValidRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${validToken}` }
    });
    const meValidData = await meValidRes.json();
    assert(meValidRes.status === 200, 'GET /auth/me with valid token returns HTTP 200 OK');
    assert(meValidData.data.user.id === createdUserId, 'GET /auth/me returns correct user data');
    assert(!('passwordHash' in meValidData.data.user), 'GET /auth/me does NOT contain passwordHash');

    // 12 & 13. Protected test endpoint
    console.info('\n--- 12 & 13. Protected Test Route ---');
    const testNoTokenRes = await fetch(`${baseUrl}/auth/protected-test`);
    assert(testNoTokenRes.status === 401, 'GET /auth/protected-test without token returns HTTP 401');

    const testValidRes = await fetch(`${baseUrl}/auth/protected-test`, {
      headers: { Authorization: `Bearer ${validToken}` }
    });
    const testValidData = await testValidRes.json();
    assert(testValidRes.status === 200, 'GET /auth/protected-test with valid token returns HTTP 200');
    assert(testValidData.data.userId === createdUserId, 'GET /auth/protected-test returns correct userId');

    // 16. Malformed Authorization Header
    console.info('\n--- 16. Malformed Authorization Header ---');
    const malformedRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: 'Basic dXNlcjpwYXNz' }
    });
    assert(malformedRes.status === 401, 'Malformed Authorization header returns HTTP 401');

    // 17. Expired JWT test
    console.info('\n--- 17. Expired JWT Test ---');
    const expiredToken = jwt.sign(
      { sub: createdUserId, role: 'user' },
      env.jwtSecret,
      { expiresIn: '-10s' } // Expired in past
    );
    const expiredRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${expiredToken}` }
    });
    const expiredData = await expiredRes.json();
    assert(expiredRes.status === 401, 'Expired token returns HTTP 401');
    assert(expiredData.message.includes('expired'), 'Expired token returns clear expiration message');

    // 15. Inactive user test
    console.info('\n--- 15. Inactive User Test ---');
    await User.findByIdAndUpdate(createdUserId, { isActive: false });
    const inactiveLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword })
    });
    assert(inactiveLoginRes.status === 403, 'Inactive user login returns HTTP 403 Forbidden');

    const inactiveMeRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${validToken}` }
    });
    assert(inactiveMeRes.status === 403, 'Inactive user accessing protected endpoint returns HTTP 403 Forbidden');

    // 10. Logout test
    console.info('\n--- 10. Logout Test ---');
    const logoutRes = await fetch(`${baseUrl}/auth/logout`, { method: 'POST' });
    const logoutData = await logoutRes.json();
    assert(logoutRes.status === 200, 'POST /auth/logout returns HTTP 200 OK');
    assert(logoutData.data.loggedOut === true, 'POST /auth/logout returns loggedOut: true');

  } finally {
    // Clean up temporary user document
    if (createdUserId) {
      await User.findByIdAndDelete(createdUserId);
      console.info(`\n✔ Cleaned up temporary test user (ID: ${createdUserId})`);
    }
    // Shutdown test server and disconnect
    await new Promise((resolve) => server.close(resolve));
    await disconnectDB();
    console.info('✔ Ephemeral server stopped & DB disconnected');
  }

  console.info('\n====================================================');
  console.info(`🎉 All Authentication Tests Passed! (${testPassed} passed, ${testFailed} failed)`);
  console.info('====================================================');
};

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Test suite failed:', err);
    process.exit(1);
  });
