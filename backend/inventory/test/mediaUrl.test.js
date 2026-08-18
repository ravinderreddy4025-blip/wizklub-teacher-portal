const assert = require('assert');
const { fileUrl, buildObjectKey, sanitizeField, safeExt } = require('../src/utils/mediaUrl');

assert.strictEqual(fileUrl(null), null);
assert.strictEqual(fileUrl({ mediaUrl: '/api/media/inventory/a.jpg' }), '/api/media/inventory/a.jpg');
assert.strictEqual(fileUrl({ filename: 'old.jpg' }), '/uploads/old.jpg');

assert.strictEqual(sanitizeField('dispatchProof'), 'dispatchproof');
assert.strictEqual(sanitizeField('../etc/passwd'), 'etc-passwd');

assert.strictEqual(safeExt('shot.JPG', 'image/jpeg'), '.jpg');
assert.strictEqual(safeExt('clip.mov', 'video/quicktime'), '.mov');
assert.strictEqual(safeExt('evil.exe', 'application/octet-stream'), '');

const key = buildObjectKey(
  { originalname: 'proof.png', mimetype: 'image/png', fieldname: 'dispatchProof' },
  'inventory'
);
assert.match(key, /^inventory\/dispatchproof\/\d{4}\/\d{2}\/[a-f0-9]{24}\.png$/);

function mapStoredMediaPath(path, apiBase) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const base = String(apiBase || '').replace(/\/$/, '');
  if (normalized.startsWith('/api/')) return `${base}${normalized.slice(4)}`;
  if (normalized.startsWith('/uploads/')) {
    return `${base.replace(/\/api$/i, '').replace(/\/inventory-api$/i, '')}${normalized}`;
  }
  return path;
}

assert.strictEqual(
  mapStoredMediaPath('/api/media/INVENTORY/a.png', '/inventory/api'),
  '/inventory/api/media/INVENTORY/a.png'
);
assert.strictEqual(
  mapStoredMediaPath('/api/media/INVENTORY/a.png', '/wizklub-testimonials/inventory-api'),
  '/wizklub-testimonials/inventory-api/media/INVENTORY/a.png'
);
assert.strictEqual(
  mapStoredMediaPath('/uploads/old.jpg', '/inventory/api'),
  '/inventory/uploads/old.jpg'
);
assert.strictEqual(
  mapStoredMediaPath('/uploads/old.jpg', '/wizklub-testimonials/inventory-api'),
  '/wizklub-testimonials/uploads/old.jpg'
);

console.log('mediaUrl.test.js: ok');
