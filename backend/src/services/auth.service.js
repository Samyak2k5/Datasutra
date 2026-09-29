import bcrypt from 'bcrypt';
import User from '../models/User.js';
import { generateToken } from '../utils/jwt.js';
import ApiError from '../utils/apiError.js';

const BCRYPT_SALT_ROUNDS = 12;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

/**
 * Register a new user account
 * @param {Object} data - { name, email, password }
 * @returns {Promise<{ user: Object, accessToken: string }>}
 */
export const register = async ({ name, email, password }) => {
  // 1. Validate name
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw ApiError.badRequest('Full name is required.');
  }
  const trimmedName = name.trim();
  if (trimmedName.length < 2 || trimmedName.length > 100) {
    throw ApiError.badRequest('Full name must be between 2 and 100 characters.');
  }

  // 2. Validate email
  if (!email || typeof email !== 'string' || email.trim().length === 0) {
    throw ApiError.badRequest('Email address is required.');
  }
  const normalizedEmail = email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(normalizedEmail)) {
    throw ApiError.badRequest('Please provide a valid email address.');
  }

  // 3. Validate password
  if (!password || typeof password !== 'string') {
    throw ApiError.badRequest('Password is required.');
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw ApiError.badRequest(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
  }

  // 4. Check for duplicate email
  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    throw ApiError.conflict('An account with this email address already exists.');
  }

  // 5. Hash password with bcrypt
  const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

  // 6. Persist new user
  const user = await User.create({
    name: trimmedName,
    email: normalizedEmail,
    passwordHash,
    role: 'user',
    isActive: true
  });

  // 7. Generate JWT access token
  const accessToken = generateToken({
    sub: user._id.toString(),
    role: user.role
  });

  return {
    user: user.toJSON(),
    accessToken
  };
};

/**
 * Authenticate user credentials and return JWT
 * @param {Object} credentials - { email, password }
 * @returns {Promise<{ user: Object, accessToken: string }>}
 */
export const login = async ({ email, password }) => {
  // 1. Validate inputs
  if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
    throw ApiError.badRequest('Email and password are required.');
  }

  const normalizedEmail = email.trim().toLowerCase();

  // 2. Lookup user by email
  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    // Generic failure message to prevent user enumeration
    throw ApiError.unauthorized('Invalid email or password.');
  }

  // 3. Compare password with stored bcrypt hash
  const isPasswordValid = !!user.passwordHash && await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    // Same generic message
    throw ApiError.unauthorized('Invalid email or password.');
  }

  // 4. Verify account status
  if (!user.isActive) {
    throw new ApiError(403, 'Account has been deactivated. Please contact support.');
  }

  // 5. Update lastLoginAt
  user.lastLoginAt = new Date();
  await user.save();

  // 6. Generate JWT access token
  const accessToken = generateToken({
    sub: user._id.toString(),
    role: user.role
  });

  return {
    user: user.toJSON(),
    accessToken
  };
};

/**
 * Retrieve user by ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Sanitized user object
 */
export const getUserById = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw ApiError.notFound('User not found.');
  }

  if (!user.isActive) {
    throw new ApiError(403, 'Account is deactivated.');
  }

  return user.toJSON();
};

export const updateProfile = async (userId, input) => {
  const allowed = ['name', 'email', 'avatar', 'currentPassword'];
  if (!input || typeof input !== 'object' || Array.isArray(input) || !Object.keys(input).length
    || Object.keys(input).some(key => !allowed.includes(key))) {
    throw ApiError.badRequest('Only name, email and avatar may be updated.');
  }
  const updates = {};
  if ('name' in input) {
    if (typeof input.name !== 'string' || input.name.trim().length < 2 || input.name.trim().length > 100) {
      throw ApiError.badRequest('Name must contain 2–100 characters.');
    }
    updates.name = input.name.trim();
  }
  if ('email' in input) {
    if (typeof input.email !== 'string' || input.email.trim().length > 254 || !EMAIL_REGEX.test(input.email.trim())) {
      throw ApiError.badRequest('Please provide a valid email address.');
    }
    updates.email = input.email.trim().toLowerCase();
  }
  if ('avatar' in input) {
    if (input.avatar === null || input.avatar === '') updates.avatar = null;
    else {
      try {
        if (typeof input.avatar !== 'string' || input.avatar.length > 2048) throw new Error();
        const url = new URL(input.avatar.trim());
        if (url.protocol !== 'https:' || url.username || url.password) throw new Error();
        updates.avatar = url.href;
      } catch { throw ApiError.badRequest('Avatar must be an HTTPS image URL, or empty to remove it.'); }
    }
  }
  if (!Object.keys(updates).length) throw ApiError.badRequest('Choose a profile field to update.');
  const user = await User.findOne({ _id: userId, isActive: true });
  if (!user) throw ApiError.notFound('User not found.');
  const changingEmail = updates.email !== undefined && updates.email !== user.email;
  if (changingEmail) {
    if (user.googleId || user.authProvider === 'google') throw ApiError.badRequest('Google-linked email is controlled by Google and cannot be edited here.');
    if (typeof input.currentPassword !== 'string' || !input.currentPassword || !user.passwordHash
      || !await bcrypt.compare(input.currentPassword, user.passwordHash)) {
      throw ApiError.badRequest('Your current password is required to change your email.');
    }
    if (await User.exists({ email: updates.email, _id: { $ne: userId } })) {
      throw ApiError.conflict('An account with this email address already exists.');
    }
  }
  // Guard against concurrent credential or provider changes during reauthentication.
  const filter = { _id: userId, isActive: true };
  if (changingEmail) {
    filter.email = user.email;
    filter.passwordHash = user.passwordHash;
    filter.googleId = { $exists: false };
    filter.authProvider = { $ne: 'google' };
  }
  try {
    const updated = await User.findOneAndUpdate(filter, { $set: updates }, { returnDocument: 'after', runValidators: true });
    if (!updated) throw ApiError.conflict('Your account changed during this request. Refresh and try again.');
    return updated.toJSON();
  } catch (error) {
    if (error.code === 11000) throw ApiError.conflict('An account with this email address already exists.');
    throw error;
  }
};

export default {
  updateProfile,
  register,
  login,
  getUserById
};
