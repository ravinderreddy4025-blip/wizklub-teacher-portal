const bcrypt = require('bcrypt');
const { WEAK_PASSWORDS } = require('../config/constants');
const { isProd } = require('../config/env');

const BCRYPT_ROUNDS = 12;

async function hashPassword(plain) {
  return bcrypt.hash(String(plain), BCRYPT_ROUNDS);
}

async function verifyPassword(plain, hash) {
  if (!hash) return false;
  return bcrypt.compare(String(plain), String(hash));
}

function validatePasswordStrength(password) {
  const p = String(password || '');
  if (!p) return 'Password is required.';
  const minLen = isProd ? 12 : 8;
  if (p.length < minLen) {
    return isProd
      ? 'Password must be at least 12 characters in production.'
      : 'Password must be at least 8 characters.';
  }
  if (WEAK_PASSWORDS.has(p.toLowerCase())) return 'Password is too weak.';
  return null;
}

module.exports = { hashPassword, verifyPassword, validatePasswordStrength, BCRYPT_ROUNDS };
