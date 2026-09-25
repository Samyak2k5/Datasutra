import jwt from 'jsonwebtoken';
import env from '../config/env.js';

/**
 * Generate a signed JSON Web Token
 * @param {Object} payload - Token payload containing { sub, role }
 * @param {Object} options - Optional jwt options overriding defaults
 * @returns {string} Signed JWT
 */
export const generateToken = (payload, options = {}) => {
  const jwtOptions = {
    expiresIn: env.jwtExpiresIn,
    ...options
  };

  return jwt.sign(payload, env.jwtSecret, jwtOptions);
};

/**
 * Verify a JSON Web Token
 * @param {string} token - Bearer JWT token string
 * @returns {Object} Decoded payload
 * @throws {jwt.TokenExpiredError|jwt.JsonWebTokenError}
 */
export const verifyToken = (token) => {
  return jwt.verify(token, env.jwtSecret);
};

export default {
  generateToken,
  verifyToken
};
