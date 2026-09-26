/**
 * Enterprise Security Headers Middleware (Step 15.3)
 * Enforces strict HTTP security headers:
 * - Content-Security-Policy (CSP)
 * - HTTP Strict Transport Security (HSTS)
 * - X-Content-Type-Options: nosniff
 * - X-Frame-Options: DENY
 * - Referrer-Policy: strict-origin-when-cross-origin
 * - Cross-Origin-Opener-Policy / Cross-Origin-Resource-Policy
 * - Removal of X-Powered-By
 */

export const securityHeaders = (req, res, next) => {
  // Prevent MIME-sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Prevent clickjacking / frame embedding
  res.setHeader('X-Frame-Options', 'DENY');

  // Modern browser XSS protection (disable legacy buggy auditor)
  res.setHeader('X-XSS-Protection', '0');

  // Enforce HSTS for secure transport (1 year, include subdomains)
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

  // Content Security Policy
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'"
  );

  // Referrer and cross-origin policies
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');

  // Remove fingerprinting header
  res.removeHeader('X-Powered-By');

  next();
};

export default securityHeaders;
