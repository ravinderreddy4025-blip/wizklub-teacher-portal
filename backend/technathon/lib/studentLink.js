'use strict'; // Opt in to strict mode for clearer errors and safer globals

const crypto = require('crypto'); // Node built-in: HMAC and timing-safe buffer compare

const HEX_SIG_RE = /^[0-9a-f]+$/i; // Only allow hex characters for signature strings (before buffer conversion)

/**
 * Create HMAC-SHA256 signature over "studentId|expMs" using the shared secret.
 * Same inputs must always produce the same sig so links are verifiable.
 */
function signStudentLink(studentId, expMs, secret) {
  const id = String(studentId).trim(); // Normalize ID from URL or DB
  const payload = `${id}|${String(expMs)}`; // Concatenate fields the verifier will recompute
  return crypto.createHmac('sha256', secret).update(payload).digest('hex'); // Hex digest for URL-safe sig
}

/**
 * Compare two hex strings in constant time to reduce timing side-channels.
 * @returns {boolean}
 */
function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false; // Reject non-strings
  if (!HEX_SIG_RE.test(a) || !HEX_SIG_RE.test(b) || a.length !== b.length) return false; // Length must match for timingSafeEqual
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex')); // Byte compare
  } catch {
    return false; // Invalid hex for Buffer.from
  }
}

/**
 * Relative SPA path for a signed submission link (student opens this on the frontend).
 */
function buildStudentSubmitPath(studentId, expMs, secret) {
  const id = String(studentId).trim();
  const sig = signStudentLink(id, expMs, secret); // Recompute sig for this path template
  return `/submit/${encodeURIComponent(id)}/${expMs}/${sig}`; // exp and sig are not encoded in middle segment by design
}

/**
 * Full absolute URL = public origin + path (no double slash).
 */
function buildStudentSubmitUrl(baseUrl, studentId, expMs, secret) {
  const base = String(baseUrl).replace(/\/+$/, ''); // Strip trailing slash from origin
  return `${base}${buildStudentSubmitPath(studentId, expMs, secret)}`; // Concatenate
}

module.exports = {
  signStudentLink,
  timingSafeEqualHex,
  buildStudentSubmitPath,
  buildStudentSubmitUrl,
};
