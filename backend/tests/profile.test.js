import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import User from '../src/models/User.js';
import { updateProfile } from '../src/services/auth.service.js';
import { isOriginAllowed } from '../src/utils/corsOrigin.js';

async function setup(t, google = false) {
  const user = new User({ name: 'Before', email: 'before@example.com', passwordHash: await bcrypt.hash('current-password', 4),
    ...(google ? { googleId: 'test-subject', authProvider: 'google' } : {}) });
  t.mock.method(User, 'findOne', async () => user);
  t.mock.method(User, 'exists', async () => false);
  const update = t.mock.method(User, 'findOneAndUpdate', async (filter, change) => {
    assert.equal(filter._id, user.id);
    Object.assign(user, change.$set); return user;
  });
  return { user, update };
}
test('profile updates name and HTTPS avatar without exposing internal fields', async t => {
  const { user } = await setup(t);
  const result = await updateProfile(user.id, { name: ' Updated ', avatar: 'https://example.com/avatar.png' });
  assert.equal(result.name, 'Updated'); assert.equal(result.avatar, 'https://example.com/avatar.png');
  assert.equal(result.passwordHash, undefined);
  assert.equal((await updateProfile(user.id, { avatar: null })).avatar, null);
});
test('local email change requires correct password and normalizes email', async t => {
  const { user, update } = await setup(t);
  for (const currentPassword of [undefined, 'wrong']) {
    await assert.rejects(updateProfile(user.id, { email: 'after@example.com', currentPassword }), e => e.statusCode === 400);
  }
  assert.equal(update.mock.callCount(), 0);
  const result = await updateProfile(user.id, { email: ' AFTER@EXAMPLE.COM ', currentPassword: 'current-password' });
  assert.equal(result.email, 'after@example.com');
  assert.equal(result.currentPassword, undefined);
  assert.equal(update.mock.calls[0].arguments[1].$set.currentPassword, undefined);
});
test('profile rejects duplicate email including concurrent unique-index conflict', async t => {
  const { user, update } = await setup(t);
  const exists = t.mock.method(User, 'exists', async () => ({ _id: 'another-user' }));
  const input = { email: 'used@example.com', currentPassword: 'current-password' };
  await assert.rejects(updateProfile(user.id, input), e => e.statusCode === 409);
  exists.mock.mockImplementation(async () => false);
  update.mock.mockImplementation(async () => { throw Object.assign(new Error('duplicate'), { code: 11000 }); });
  await assert.rejects(updateProfile(user.id, input), e => e.statusCode === 409);
});
test('Google-linked email is immutable but display profile remains editable', async t => {
  const { user, update } = await setup(t, true);
  await assert.rejects(updateProfile(user.id, { email: 'other@example.com', currentPassword: 'current-password' }), /controlled by Google/);
  assert.equal(update.mock.callCount(), 0);
  assert.equal((await updateProfile(user.id, { name: 'Custom Name' })).name, 'Custom Name');
  assert.equal(user.googleId, 'test-subject');
});
test('profile rejects protected fields and malformed values before database writes', async t => {
  const { user, update } = await setup(t);
  for (const input of [{}, [], null, { name: 'x' }, { email: 'invalid' }, { avatar: 'javascript:alert(1)' }, { avatar: 'http://example.com/a' },
    { avatar: 'https://user:password@example.com/a' }, { currentPassword: 'alone' },
    ...['id', '_id', 'role', 'passwordHash', 'googleId', 'authProvider', 'isActive', 'lastLoginAt', 'createdAt'].map(key => ({ [key]: 'changed' }))]) {
    await assert.rejects(updateProfile(user.id, input), e => e.statusCode === 400);
  }
  assert.equal(update.mock.callCount(), 0);
});
test('profile concurrent security changes cannot overwrite account state', async t => {
  const { user, update } = await setup(t);
  update.mock.mockImplementation(async filter => {
    assert.equal(filter.email, user.email); assert.equal(filter.passwordHash, user.passwordHash);
    assert.deepEqual(filter.googleId, { $exists: false }); return null;
  });
  await assert.rejects(updateProfile(user.id, { email: 'new@example.com', currentPassword: 'current-password' }), e => e.statusCode === 409);
});
test('development CORS allows localhost ports but never lookalike or remote hosts', () => {
  const config = { isDevelopment: true, corsOrigin: ['https://configured.example'] };
  for (const origin of ['http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:6000', 'http://[::1]:5175', 'https://configured.example']) assert.ok(isOriginAllowed(origin, config));
  for (const origin of ['http://localhost.evil.test:5173', 'null', 'file://localhost', 'http://192.168.1.1:5173', 'http://localhost:5173/path']) assert.equal(isOriginAllowed(origin, config), false);
});
test('production CORS requires exact configured origins and does not accept wildcard', () => {
  const config = { isDevelopment: false, corsOrigin: ['https://configured.example'] };
  assert.ok(isOriginAllowed('https://configured.example', config));
  assert.equal(isOriginAllowed('http://localhost:5174', config), false);
  assert.equal(isOriginAllowed('https://untrusted.example', { ...config, corsOrigin: '*' }), false);
});
