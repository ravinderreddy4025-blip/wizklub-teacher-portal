'use strict';

const { signStudentLink, timingSafeEqualHex } = require('../lib/studentLink'); // Shared crypto helpers

/**
 * Express middleware: validate :studentId, :exp, :sig on by-link routes.
 * On success sets req.studentLink = { studentId, linkExpiresAt }.
 */
function verifyStudentLink(req, res, next) {
  const secret = process.env.STUDENT_FORM_SECRET; // Must match the secret used when the link was generated
  if (!secret) {
    return res.status(503).json({
      success: false,
      message: 'Student links are not configured (STUDENT_FORM_SECRET).',
    });
  }

  const studentIdRaw = req.params.studentId != null ? String(req.params.studentId).trim() : ''; // From URL path
  const expRaw = req.params.exp != null ? String(req.params.exp).trim() : ''; // Expiry as unix ms string
  const sigRaw = req.params.sig != null ? String(req.params.sig).trim() : ''; // HMAC hex from URL

  if (!studentIdRaw || !expRaw || !sigRaw) { // Any missing piece → reject
    return res.status(403).json({ success: false, message: 'Invalid submission link.' });
  }

  let decodedId;
  try {
    decodedId = decodeURIComponent(studentIdRaw); // Undo encodeURIComponent from path segment
  } catch {
    return res.status(403).json({ success: false, message: 'Invalid submission link.' }); // Malformed encoding
  }

  const expMs = Number(expRaw); // Parse expiry
  if (!Number.isFinite(expMs) || expMs <= 0) { // Must be positive finite number
    return res.status(403).json({ success: false, message: 'Invalid submission link.' });
  }

  const expected = signStudentLink(decodedId, expMs, secret); // Server recomputes expected signature
  if (!timingSafeEqualHex(sigRaw.toLowerCase(), expected.toLowerCase())) { // Constant-time compare (hex case normalized)
    return res.status(403).json({ success: false, message: 'Invalid submission link.' });
  }

  if (Date.now() > expMs) { // Link window closed
    return res.status(403).json({ success: false, message: 'This submission link has expired.' });
  }

  req.studentLink = {
    studentId: String(decodedId).trim(), // Canonical ID for DB lookups
    linkExpiresAt: new Date(expMs), // Date object for JSON responses (meta.linkExpiresAt)
  };
  next(); // Proceed to GET or PUT handler
}

module.exports = { verifyStudentLink };
