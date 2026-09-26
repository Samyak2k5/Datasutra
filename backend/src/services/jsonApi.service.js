import dns from 'dns';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import env from '../config/env.js';
import ApiError from '../utils/apiError.js';
import { parseJSON } from '../parsers/json.parser.js';

const lookupAsync = promisify(dns.lookup);

/**
 * Checks whether an IPv4 address is in a private, loopback, or link-local range.
 *
 * @param {string} ip
 * @returns {boolean}
 */
export const isPrivateOrReservedIp = (ip) => {
  if (!ip) return true;

  // IPv4 Loopback: 127.0.0.0/8
  if (ip.startsWith('127.')) return true;

  // IPv4 Zero: 0.0.0.0/8
  if (ip.startsWith('0.')) return true;

  // IPv4 Private Class A: 10.0.0.0/8
  if (ip.startsWith('10.')) return true;

  // IPv4 Link-local / AWS / Cloud metadata: 169.254.0.0/16
  if (ip.startsWith('169.254.')) return true;

  // IPv4 Private Class B: 172.16.0.0/12
  if (ip.startsWith('172.')) {
    const parts = ip.split('.');
    const secondOctet = parseInt(parts[1], 10);
    if (secondOctet >= 16 && secondOctet <= 31) return true;
  }

  // IPv4 Private Class C: 192.168.0.0/16
  if (ip.startsWith('192.168.')) return true;

  // IPv4 Shared CGNAT: 100.64.0.0/10
  if (ip.startsWith('100.')) {
    const parts = ip.split('.');
    const secondOctet = parseInt(parts[1], 10);
    if (secondOctet >= 64 && secondOctet <= 127) return true;
  }

  // IPv6 checks
  const lowerIp = ip.toLowerCase();
  if (
    lowerIp === '::1' ||
    lowerIp === '::' ||
    lowerIp.startsWith('fe80:') || // link-local
    lowerIp.startsWith('fc00:') || // unique local
    lowerIp.startsWith('fd00:')
  ) {
    return true;
  }

  return false;
};

/**
 * Validates a target URL against SSRF and private network attacks.
 * Rejects localhost, private IPs, loopback, cloud metadata IPs, and internal domains.
 *
 * @param {string} urlStr
 * @param {boolean} [allowTestHttp=false] - Allows http (not https) strictly for non-private URLs during tests
 * @returns {Promise<URL>}
 */
export const validateApiUrl = async (urlStr, allowTestHttp = false) => {
  if (!urlStr || typeof urlStr !== 'string') {
    throw ApiError.badRequest('A valid API URL is required.');
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(urlStr);
  } catch {
    throw ApiError.badRequest('Invalid URL format provided.');
  }

  // Enforce protocol
  const protocol = parsedUrl.protocol.toLowerCase();
  if (protocol !== 'https:' && protocol !== 'http:') {
    throw ApiError.badRequest(`Unsupported protocol '${protocol}'. Only HTTP(S) endpoints are allowed.`);
  }

  const hostname = parsedUrl.hostname.toLowerCase();

  // Reject explicit localhost or loopback names
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.includes('metadata.google') ||
    hostname.includes('instance-data')
  ) {
    throw ApiError.badRequest(
      'Security policy violation: Requests to localhost, loopback, or private internal networks are strictly forbidden.'
    );
  }

  // If hostname is directly an IP, validate it
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.includes(':')) {
    if (isPrivateOrReservedIp(hostname)) {
      throw ApiError.badRequest(
        'Security policy violation: Direct IP requests to private, loopback, or link-local address spaces are prohibited.'
      );
    }
  } else {
    // Resolve DNS to verify the target host does not resolve to a private or loopback IP (DNS Rebinding defense)
    try {
      const { address } = await lookupAsync(hostname);
      if (isPrivateOrReservedIp(address)) {
        throw ApiError.badRequest(
          `Security policy violation: Hostname '${hostname}' resolves to a private IP address (${address}). Connection aborted.`
        );
      }
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw ApiError.badRequest(`Failed to resolve host '${hostname}': ${err.message}`);
    }
  }

  return parsedUrl;
};

/**
 * Sanitizes headers to eliminate credential leakage in logs.
 * Masks Authorization and API-Key tokens.
 *
 * @param {object} headers
 * @returns {object}
 */
export const sanitizeHeadersForLogging = (headers = {}) => {
  const safe = {};
  for (const [k, v] of Object.entries(headers)) {
    const lower = k.toLowerCase();
    if (
      lower.includes('auth') ||
      lower.includes('key') ||
      lower.includes('token') ||
      lower.includes('secret')
    ) {
      safe[k] = '[REDACTED]';
    } else {
      safe[k] = v;
    }
  }
  return safe;
};

/**
 * Fetches JSON dataset from an external API endpoint with strict security and size controls.
 *
 * @param {object} params
 * @param {string} params.url - Target API endpoint
 * @param {string} [params.method='GET']
 * @param {object} [params.headers={}]
 * @param {string} [params.bearerToken] - Optional bearer token
 * @param {string} [params.apiKey] - Optional api key header
 * @param {string} [params.apiKeyHeader='X-API-Key']
 * @param {string} [params.recordPath]
 * @param {object} [params.pagination] - Bounded pagination { pageParam, maxPages, maxRecords }
 * @param {number} [params.timeoutMs]
 * @param {number} [params.maxSizeBytes]
 * @param {boolean} [params.allowTestHttp=false]
 * @returns {Promise<{ records: Array<object>, rawJson: any, metadata: object }>}
 */
export const fetchJsonApi = async ({
  url,
  method = 'GET',
  headers = {},
  bearerToken = null,
  apiKey = null,
  apiKeyHeader = 'X-API-Key',
  recordPath = null,
  pagination = {},
  timeoutMs = env.jsonApiTimeoutMs,
  maxSizeBytes = env.jsonApiMaxSizeBytes,
  allowTestHttp = false
}) => {
  const parsedUrl = await validateApiUrl(url, allowTestHttp);

  const requestHeaders = {
    Accept: 'application/json',
    ...headers
  };

  if (bearerToken) {
    requestHeaders['Authorization'] = `Bearer ${bearerToken}`;
  } else if (apiKey) {
    requestHeaders[apiKeyHeader] = apiKey;
  }

  const maxPages = Math.min(Math.max(1, parseInt(pagination.maxPages, 10) || 1), 5);
  const maxTotalRecords = Math.min(Math.max(1, parseInt(pagination.maxRecords, 10) || 2000), 5000);

  let allRecords = [];
  let currentPage = 1;
  let currentUrl = parsedUrl.toString();
  let firstResponseJson = null;

  while (currentPage <= maxPages && allRecords.length < maxTotalRecords) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    try {
      response = await fetch(currentUrl, {
        method,
        headers: requestHeaders,
        signal: controller.signal,
        redirect: 'error' // Disallow uncontrolled redirects to prevent SSRF bypass
      });
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        throw ApiError.badRequest(`JSON API request timed out after ${timeoutMs}ms.`);
      }
      throw ApiError.badRequest(`JSON API request failed: ${err.message}`);
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw ApiError.badRequest(
        `JSON API returned HTTP status ${response.status} (${response.statusText}).`
      );
    }

    // Verify Content-Type
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json') && !contentType.includes('text/json')) {
      throw ApiError.badRequest(
        `Invalid response content type '${contentType}'. The endpoint must return JSON content.`
      );
    }

    // Verify Content-Length if provided
    const contentLength = parseInt(response.headers.get('content-length'), 10);
    if (!isNaN(contentLength) && contentLength > maxSizeBytes) {
      throw ApiError.badRequest(
        `JSON API response size (${contentLength} bytes) exceeds maximum allowed limit (${maxSizeBytes} bytes).`
      );
    }

    // Read body with size bounds
    const rawText = await response.text();
    if (Buffer.byteLength(rawText, 'utf-8') > maxSizeBytes) {
      throw ApiError.badRequest(
        `JSON API response body exceeds maximum allowed limit of ${maxSizeBytes} bytes.`
      );
    }

    let parsedData;
    try {
      parsedData = JSON.parse(rawText);
    } catch (err) {
      throw ApiError.badRequest(`API response returned invalid JSON: ${err.message}`);
    }

    if (!firstResponseJson) {
      firstResponseJson = parsedData;
    }

    // Extract records using configured or detected path
    let pageRecords = [];
    if (recordPath) {
      const parts = recordPath.split('.');
      let curr = parsedData;
      for (const p of parts) {
        if (curr && typeof curr === 'object') curr = curr[p];
        else {
          curr = undefined;
          break;
        }
      }
      if (Array.isArray(curr)) {
        pageRecords = curr;
      }
    } else if (Array.isArray(parsedData)) {
      pageRecords = parsedData;
    } else if (parsedData && typeof parsedData === 'object') {
      const keys = ['records', 'data', 'items', 'results', 'rows'];
      for (const k of keys) {
        if (Array.isArray(parsedData[k])) {
          pageRecords = parsedData[k];
          break;
        }
      }
      if (pageRecords.length === 0) {
        pageRecords = [parsedData];
      }
    }

    allRecords = allRecords.concat(pageRecords);

    // Check pagination configuration
    if (pagination.pageParam && currentPage < maxPages) {
      currentPage++;
      const nextUrl = new URL(currentUrl);
      nextUrl.searchParams.set(pagination.pageParam, String(currentPage));
      currentUrl = nextUrl.toString();
    } else {
      break;
    }
  }

  // Slice to bounded maximum
  if (allRecords.length > maxTotalRecords) {
    allRecords = allRecords.slice(0, maxTotalRecords);
  }

  return {
    records: allRecords,
    rawJson: firstResponseJson,
    metadata: {
      sourceUrl: parsedUrl.origin + parsedUrl.pathname, // Strip query params to avoid logging sensitive query strings
      pagesFetched: currentPage,
      totalRecords: allRecords.length
    }
  };
};

export default {
  validateApiUrl,
  isPrivateOrReservedIp,
  sanitizeHeadersForLogging,
  fetchJsonApi
};
