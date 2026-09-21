const path = require('path');
const env = require('../config/env');
const { isS3Configured, assertS3Ready, uploadBuffer } = require('../services/s3Media');
const { buildObjectKey } = require('../utils/mediaUrl');

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

async function storeFile(file) {
  if (!file || file.mediaUrl) return file;
  if (!file.buffer || !file.buffer.length) {
    return file;
  }

  if (!isS3Configured()) {
    const err = new Error('Photo/video storage is not configured. Set AWS_S3_BUCKET and AWS_REGION.');
    err.statusCode = 503;
    throw err;
  }

  assertS3Ready();

  const key = buildObjectKey(file, env.s3.prefix);
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

async function persistUploadedMedia(req, res, next) {
  try {
    const files = collectFiles(req);
    for (const file of files) {
      await storeFile(file);
    }
    next();
  } catch (err) {
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
