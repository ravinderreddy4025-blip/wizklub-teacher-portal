const path = require('path');
const crypto = require('crypto');

const SAFE_EXT = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.mp4',
  '.webm',
  '.mov',
  '.m4v',
]);

function safeExt(originalName, mimetype) {
  const ext = path.extname(String(originalName || '')).toLowerCase();
  if (SAFE_EXT.has(ext)) return ext;
  if (mimetype === 'image/jpeg') return '.jpg';
  if (mimetype === 'image/png') return '.png';
  if (mimetype === 'image/webp') return '.webp';
  if (mimetype === 'video/mp4') return '.mp4';
  if (mimetype === 'video/webm') return '.webm';
  if (mimetype === 'video/quicktime') return '.mov';
  return '';
}

function sanitizeField(fieldname) {
  const raw = String(fieldname || 'media')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return raw || 'media';
}

function buildObjectKey(file, prefix) {
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const ext = safeExt(file.originalname, file.mimetype);
  const id = crypto.randomBytes(12).toString('hex');
  const folder = sanitizeField(file.fieldname);
  const base = String(prefix || 'inventory').replace(/^\/+|\/+$/g, '');
  return `${base}/${folder}/${yyyy}/${mm}/${id}${ext}`;
}

function fileUrl(file) {
  if (!file) return null;
  if (file.mediaUrl) return file.mediaUrl;
  if (file.filename) return `/uploads/${file.filename}`;
  return null;
}

module.exports = {
  fileUrl,
  buildObjectKey,
  safeExt,
  sanitizeField,
};
