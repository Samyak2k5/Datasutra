import test from 'node:test';
import assert from 'node:assert/strict';
import { OAuth2Client } from 'google-auth-library';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import env from '../src/config/env.js';
import User from '../src/models/User.js';
import { googleLogin } from '../src/services/googleAuth.service.js';
import { login } from '../src/services/auth.service.js';

// Test-only mocks. No production verifier bypass or Google network calls.
const claims = () => ({ sub: 'test-google-subject', email: 'google@example.com', email_verified: true,
  name: 'Google User', iss: 'https://accounts.google.com', aud: 'unit-test-client', exp: Date.now() / 1000 + 3600 });
function setup(t, overrides = {}) {
  const original = env.googleClientId;
  env.googleClientId = 'unit-test-client';
  t.after(() => { env.googleClientId = original; });
  const verify = t.mock.method(OAuth2Client.prototype, 'verifyIdToken', async options => {
    assert.equal(options.audience, 'unit-test-client');
    return { getPayload: () => ({ ...claims(), ...overrides }) };
  });
  return verify;
}

test('Google rejects missing/invalid credential shapes before verification', async t => {
  const verify = setup(t);
  for (const credential of [undefined, '', ' ', {}, 42, 'a'.repeat(16385)]) {
    await assert.rejects(googleLogin({ credential }), e => e.statusCode === 400);
  }
  assert.equal(verify.mock.callCount(), 0);
});
test('Google configuration missing returns a safe 503', async t => {
  const verify = setup(t); env.googleClientId = '';
  await assert.rejects(googleLogin({ credential: 'test-only-token' }), e => e.statusCode === 503);
  assert.equal(verify.mock.callCount(), 0);
});
test('invalid signatures and expired/wrong-audience library errors are sanitized', async t => {
  const verify = setup(t);
  for (const message of ['Invalid signature: PRIVATE_TOKEN', 'Wrong recipient: PRIVATE_TOKEN', 'Token expired: PRIVATE_TOKEN']) {
    verify.mock.mockImplementation(async () => { throw new Error(message); });
    await assert.rejects(googleLogin({ credential: 'test-only-token' }), e => e.statusCode === 401 && !e.message.includes('PRIVATE_TOKEN'));
  }
});
test('Google requires valid subject, verified email, issuer, audience and expiry', async t => {
  const verify = setup(t);
  for (const invalid of [{ sub: '' }, { email_verified: false }, { email: 'bad' }, { iss: 'evil' }, { aud: 'wrong' }, { exp: 1 }]) {
    verify.mock.mockImplementation(async () => ({ getPayload: () => ({ ...claims(), ...invalid }) }));
    await assert.rejects(googleLogin({ credential: 'test-only-token' }), e => e.statusCode === 401);
  }
});
test('new verified Google user receives normal app JWT without tokens or passwords persisted', async t => {
  setup(t);
  t.mock.method(User, 'findOne', async () => null);
  let created;
  t.mock.method(User, 'create', async data => { created = data; return new User(data); });
  const result = await googleLogin({ credential: 'test-only-token', name: 'Untrusted', email: 'attacker@example.com' });
  assert.equal(created.googleId, claims().sub);
  assert.equal(created.authProvider, 'google');
  assert.equal(result.user.name, 'Google User');
  assert.equal(result.user.email, 'google@example.com');
  assert.equal(created.passwordHash, undefined);
  assert.equal(created.credential, undefined);
  assert.equal(result.user.googleId, undefined);
  assert.equal(jwt.verify(result.accessToken, env.jwtSecret).sub, result.user.id);
  await new User(created).validate();
});
test('existing Google identity keeps edited profile and account ID', async t => {
  setup(t, { email: 'new-google-email@example.com' });
  const user = new User({ googleId: claims().sub, email: 'google@example.com', name: 'Edited Name', authProvider: 'google' });
  t.mock.method(user, 'save', async () => user);
  t.mock.method(User, 'findOne', async query => { assert.deepEqual(query, { googleId: claims().sub }); return user; });
  const result = await googleLogin({ credential: 'test-only-token' });
  assert.equal(result.user.id, user.id);
  assert.equal(result.user.name, 'Edited Name');
  assert.equal(result.user.email, 'google@example.com');
  assert.ok(user.lastLoginAt instanceof Date);
});
test('same email local account is not silently linked or duplicated', async t => {
  setup(t);
  t.mock.method(User, 'findOne', async query => query.email ? new User({ name: 'Local User', email: query.email, passwordHash: 'existing' }) : null);
  const create = t.mock.method(User, 'create', async () => { throw new Error('Must not create'); });
  await assert.rejects(googleLogin({ credential: 'test-only-token' }), e => e.statusCode === 409 && /existing account/.test(e.message));
  assert.equal(create.mock.callCount(), 0);
});
test('Google rejects deactivated accounts', async t => {
  setup(t);
  t.mock.method(User, 'findOne', async () => new User({ isActive: false }));
  await assert.rejects(googleLogin({ credential: 'test-only-token' }), e => e.statusCode === 403);
});
test('unique subject index and concurrent conflicts fail safely', async t => {
  setup(t);
  assert.ok(User.schema.indexes().some(([keys, options]) => keys.googleId === 1 && options.unique && options.sparse));
  t.mock.method(User, 'findOne', async () => null);
  t.mock.method(User, 'create', async () => { throw Object.assign(new Error('private database details'), { code: 11000 }); });
  await assert.rejects(googleLogin({ credential: 'test-only-token' }), e => e.statusCode === 409 && !e.message.includes('private'));
});
test('existing local password login works and Google-only password login fails cleanly', async t => {
  const user = new User({ name: 'Local', email: 'local@example.com', passwordHash: await bcrypt.hash('test-password', 4) });
  t.mock.method(user, 'save', async () => user);
  t.mock.method(User, 'findOne', async () => user);
  const result = await login({ email: user.email, password: 'test-password' });
  assert.equal(result.user.id, user.id);
  assert.ok(result.accessToken);
  user.passwordHash = undefined; user.googleId = 'test-google-subject';
  await assert.rejects(login({ email: user.email, password: 'test-password' }), e => e.statusCode === 401);
  const legacy = new User({ name: 'Legacy', email: 'legacy@example.com' });
  await assert.rejects(legacy.validate(), /Password hash is required/);
});
