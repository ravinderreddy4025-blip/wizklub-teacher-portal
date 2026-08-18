const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const env = require('../config/env');
const { isS3Configured, uploadBuffer } = require('../services/s3Media');
const { buildObjectKey, safeExt } = require('../utils/mediaUrl');

const localUploadDir = path.join(__dirname, '../../uploads');

function collectFiles(req) {
  const out = [];
  if (req.file) out.push(req.file);
  if (Array.isArray(req.files)) {
    out.push(...req.files);
  } else if (req.files && typeof req.files === 'object') {
    for (const value of Object.values(req.files)) {
      if (Array.isArray(value)) out.push(...value);
      else if (value) out.push(value);
    }
  }
  return out;
}

function agentDebugLog(hypothesisId, location, message, data) {
  // #region agent log
  const payload = JSON.stringify({
    sessionId: '4fc0ec',
    runId: 'pre-fix',
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  });
  const headers = { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '4fc0ec' };
  fetch('http://127.0.0.1:7494/ingest/c666538d-d52a-4b19-9d3b-5c52069c7f45', {
    method: 'POST',
    headers,
    body: payload,
  }).catch(() => {});
  fetch('http://host.docker.internal:7494/ingest/c666538d-d52a-4b19-9d3b-5c52069c7f45', {
    method: 'POST',
    headers,
    body: payload,
  }).catch(() => {});
  // #endregion
}

async function storeFile(file) {
  if (!file || file.mediaUrl) return file;
  if (!file.buffer || !file.buffer.length) {
    if (file.filename) {
      file.mediaUrl = `/uploads/${file.filename}`;
    }
    return file;
  }

  if (isS3Configured()) {
    const key = buildObjectKey(file, env.s3.prefix);
    // #region agent log
    agentDebugLog('A', 'persistMedia.js:storeFile', 'S3 upload starting for dispatch proof', {
      bucket: env.s3.bucket,
      region: env.s3.region,
      prefix: env.s3.prefix,
      accessKeyLen: env.s3.accessKeyId ? env.s3.accessKeyId.length : 0,
      secretLen: env.s3.secretAccessKey ? env.s3.secretAccessKey.length : 0,
      secretExpectedLen: 40,
      field: file.fieldname,
      mimetype: file.mimetype,
      bytes: file.buffer?.length || 0,
      keyExt: path.extname(key),
    });
    // #endregion
    const stored = await uploadBuffer({
      key,
      buffer: file.buffer,
      contentType: file.mimetype,
    });
    file.s3Key = stored.key;
    file.mediaUrl = stored.url;
    file.filename = path.basename(stored.key);
    file.buffer = undefined;
    return file;
  }

  if (env.nodeEnv === 'production') {
    const err = new Error(
      'Photo/video storage is not configured. Set AWS_S3_BUCKET and AWS_REGION (and credentials).'
    );
    err.statusCode = 503;
    throw err;
  }

  if (!fs.existsSync(localUploadDir)) {
    fs.mkdirSync(localUploadDir, { recursive: true });
  }
  const ext = safeExt(file.originalname, file.mimetype);
  const filename = `${sanitizeLocalName(file.fieldname)}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
  fs.writeFileSync(path.join(localUploadDir, filename), file.buffer);
  file.filename = filename;
  file.mediaUrl = `/uploads/${filename}`;
  file.buffer = undefined;
  return file;
}

function sanitizeLocalName(fieldname) {
  return String(fieldname || 'media').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'media';
}

async function persistUploadedMedia(req, res, next) {
  try {
    const files = collectFiles(req);
    // #region agent log
    agentDebugLog('E', 'persistMedia.js:persistUploadedMedia', 'persist start', {
      path: req.originalUrl,
      fileCount: files.length,
      fields: files.map((f) => f.fieldname),
      s3Configured: isS3Configured(),
    });
    // #endregion
    for (const file of files) {
      await storeFile(file);
    }
    next();
  } catch (err) {
    // #region agent log
    agentDebugLog('A', 'persistMedia.js:persistUploadedMedia', 'persist failed', {
      path: req.originalUrl,
      name: err?.name,
      code: err?.Code || err?.code,
      httpStatus: err?.$metadata?.httpStatusCode,
      message: String(err?.message || '').slice(0, 180),
      secretLen: env.s3.secretAccessKey ? env.s3.secretAccessKey.length : 0,
    });
    // #endregion
    next(err);
  }
}

function withMediaPersist(multerMiddleware) {
  return [multerMiddleware, persistUploadedMedia];
}

module.exports = {
  persistUploadedMedia,
  withMediaPersist,
  collectFiles,
};
