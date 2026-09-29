import { OAuth2Client } from 'google-auth-library';
import env from '../config/env.js';
import User from '../models/User.js';
import ApiError from '../utils/apiError.js';
import { generateToken } from '../utils/jwt.js';

const client = new OAuth2Client();
const invalidCredential = () => ApiError.unauthorized('Google sign-in could not be verified. Please try signing in again.');
const accountConflict = () => ApiError.conflict('An account already uses this email. Sign in with your existing account. Automatic Google linking is disabled; contact support for account linking.');

export async function googleLogin({ credential } = {}) {
  if (typeof credential !== 'string' || !credential.trim() || credential.length > 16384) {
    throw ApiError.badRequest('A Google sign-in credential is required.');
  }
  if (!env.googleClientId) throw new ApiError(503, 'Google sign-in is not configured on the server. Restart the backend after setting GOOGLE_CLIENT_ID, or use email and password.');

  let payload;
  try {
    // The official library verifies Google's signature, issuer, audience and expiry.
    const ticket = await client.verifyIdToken({ idToken: credential, audience: env.googleClientId });
    payload = ticket.getPayload();
  } catch {
    // Verification errors can contain the credential. Never forward or log them.
    throw invalidCredential();
  }
  if (!payload || !['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss)
    || payload.aud !== env.googleClientId || !Number.isFinite(payload.exp) || payload.exp <= Date.now() / 1000
    || typeof payload.sub !== 'string' || !payload.sub.trim() || payload.sub.length > 255
    || payload.email_verified !== true || typeof payload.email !== 'string'
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) throw invalidCredential();

  try {
    // The subject, not an email or browser-supplied profile, is the identity key.
    let user = await User.findOne({ googleId: payload.sub });
    if (!user) {
      const email = payload.email.trim().toLowerCase();
      if (await User.findOne({ email })) throw accountConflict();
      user = await User.create({
        googleId: payload.sub,
        authProvider: 'google',
        email,
        name: (typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : email.split('@')[0]).slice(0, 100),
        role: 'user',
        isActive: true,
        lastLoginAt: new Date()
      });
    } else {
      if (!user.isActive) throw ApiError.forbidden('Account has been deactivated. Please contact support.');
      // Preserve the user's edited profile, including their name.
      user.lastLoginAt = new Date();
      await user.save();
    }
    return { user: user.toJSON(), accessToken: generateToken({ sub: user._id.toString(), role: user.role }) };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    // Unique indexes protect against concurrent registration and subject collisions.
    if (error.code === 11000) throw accountConflict();
    throw new ApiError(503, 'Google sign-in is temporarily unavailable. Please try again later.');
  }
}
