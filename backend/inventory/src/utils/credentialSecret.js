const crypto = require('crypto');
const env = require('../config/env');

function getKey() {
  const secret = env.credentialKey || env.jwtSecret;
  if (secret) {
    return crypto.createHash('sha256').update(String(secret)).digest();
  }
  if (env.nodeEnv === 'production') {
    throw new Error('INVENTORY_CREDENTIAL_KEY or JWT_SECRET is required to store recoverable AM passwords');
  }
  return crypto.createHash('sha256').update('inventory-dev-credential-key').digest();
}

function encryptSecret(plain) {
  if (!plain) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptSecret(payload) {
  if (!payload || typeof payload !== 'string') return null;
  const parts = payload.split(':');
  if (parts.length !== 3) return null;
  try {
    const [ivHex, tagHex, dataHex] = parts;
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      getKey(),
      Buffer.from(ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

module.exports = { encryptSecret, decryptSecret };
