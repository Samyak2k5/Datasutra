import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mock } from 'node:test';
import mongoose from 'mongoose';
import { OAuth2Client } from 'google-auth-library';
import app from '../src/app.js';
import env from '../src/config/env.js';
import User from '../src/models/User.js';
import { updateProfile, login, getUserById } from '../src/services/auth.service.js';

// Integration test: real HTTP, MongoDB and app JWT; Google verifier alone is mocked.
// Never use this script to claim a real Google account login was tested.
const prefix = `google-auth-test-${randomUUID()}`;
const emails = [`${prefix}@example.com`, `${prefix}-local@example.com`, `${prefix}-duplicate@example.com`];
let server;
let passed = 0;
const check = (condition, label) => { assert.ok(condition, label); passed++; console.log(`PASS ${label}`); };
try {
  await mongoose.connect(env.mongodbUri, { serverSelectionTimeoutMS: 5000 });
  await User.init();
  env.googleClientId = 'integration-test-client';
  const payload = { sub: prefix, aud: env.googleClientId, iss: 'https://accounts.google.com', exp: Date.now() / 1000 + 3600,
    email_verified: true, email: emails[0], name: 'Google Integration User' };
  mock.method(OAuth2Client.prototype, 'verifyIdToken', async ({ idToken, audience }) => {
    assert.equal(audience, env.googleClientId);
    if (idToken !== 'TEST_ONLY_MOCKED_VERIFICATION') throw new Error('Invalid test credential');
    return { getPayload: () => payload };
  });
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/auth`;
  const request = async (path, body, token, method = 'POST') => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, ...await response.json() };
  };
  check((await request('/google', {})).status === 400, 'missing credential rejected by endpoint');
  check((await request('/google', { credential: 'invalid' })).status === 401, 'invalid credential rejected by endpoint');
  const created = await request('/google', { credential: 'TEST_ONLY_MOCKED_VERIFICATION' });
  check(created.status === 200 && created.data.accessToken, 'Google signup returns normal app JWT');
  const userId = created.data.user.id;
  const persisted = await User.findById(userId).lean();
  check(persisted.googleId === prefix && persisted.authProvider === 'google', 'verified subject and provider stored');
  check(!persisted.passwordHash && !persisted.credential && !persisted.accessToken, 'no Google tokens or password stored');
  check((await request('/me', undefined, created.data.accessToken, 'GET')).data.user.id === userId, 'JWT authenticates protected me route');
  check((await request('/profile', { name: 'Edited Google Name' }, created.data.accessToken, 'PATCH')).data.user.name === 'Edited Google Name', 'Edit Profile works for Google users');
  const again = await request('/google', { credential: 'TEST_ONLY_MOCKED_VERIFICATION' });
  check(again.data.user.id === userId && again.data.user.name === 'Edited Google Name', 'subsequent login preserves identity and edited name');
  check(await User.countDocuments({ googleId: prefix }) === 1, 'repeat login creates no duplicate');
  await assert.rejects(User.create({ googleId: prefix, authProvider: 'google', name: 'Duplicate Test', email: emails[2] }), error => error.code === 11000);
  check(true, 'MongoDB unique googleId index rejects duplicate subjects');
  check((await request('/login', { email: emails[0], password: 'test-password' })).status === 401, 'Google-only password login fails cleanly');
  const local = await request('/register', { name: 'Local Integration', email: emails[1], password: 'TestPassword123!' });
  check(local.status === 201, 'local registration works without googleId');
  payload.sub = prefix + '-conflict'; payload.email = emails[1];
  check((await request('/google', { credential: 'TEST_ONLY_MOCKED_VERIFICATION' })).status === 409, 'same-email local account is not auto-linked');
  check(!(await User.findById(local.data.user.id)).googleId, 'local account unchanged after conflict');
  check((await request('/login', { email: emails[1], password: 'TestPassword123!' })).status === 200, 'local password login still works');
  check((await request('/logout', {})).status === 200, 'existing logout endpoint works');
  const localId = local.data.user.id;
  const profileResponse = await request('/profile', { name: 'Profile Updated', email: emails[2], avatar: 'https://example.com/avatar.png', currentPassword: 'TestPassword123!' }, local.data.accessToken, 'PATCH');
  const changed = profileResponse.data.user;
  check(changed.email === emails[2] && changed.name === 'Profile Updated', 'local name/email/avatar update succeeds');
  check((await User.findById(localId)).avatar === 'https://example.com/avatar.png', 'avatar and profile persist in MongoDB');
  check((await getUserById(localId)).email === emails[2], 'profile refresh loads changed email');
  await assert.rejects(login({ email: emails[1], password: 'TestPassword123!' }), e => e.statusCode === 401);
  check(true, 'old email no longer authenticates');
  check((await login({ email: emails[2], password: 'TestPassword123!' })).user.name === 'Profile Updated', 'logout/login with new email retains profile');
  await assert.rejects(updateProfile(localId, { email: emails[0], currentPassword: 'TestPassword123!' }), e => e.statusCode === 409);
  check(true, 'existing Google email cannot be claimed by local account');
  await assert.rejects(updateProfile(localId, { email: 'invalid' }), e => e.statusCode === 400);
  check(true, 'invalid profile email rejected');
  await assert.rejects(updateProfile(localId, { role: 'admin' }), e => e.statusCode === 400);
  check((await User.findById(localId)).role === 'user', 'protected role remains unchanged');
  await assert.rejects(updateProfile(userId, { email: emails[1] }), e => e.statusCode === 400);
  check(true, 'Google identity email is protected');
  payload.sub = prefix; payload.email = emails[0];
  const googleAgain = await request('/google', { credential: 'TEST_ONLY_MOCKED_VERIFICATION' });
  check(googleAgain.data.user.id === userId && googleAgain.data.user.name === 'Edited Google Name', 'Google login works after all profile edits');

  console.log(`PASS ${passed} Google auth integration assertions (Google verification mocked, real MongoDB/JWT/HTTP).`);
} catch (error) {
  console.error('Google auth integration failed:', error instanceof assert.AssertionError ? error.message : error.name);
  process.exitCode = 1;
} finally {
  mock.restoreAll();
  if (mongoose.connection.readyState === 1) await User.deleteMany({ email: { $in: emails } });
  if (server) await new Promise(resolve => server.close(resolve));
  await mongoose.disconnect();
}
