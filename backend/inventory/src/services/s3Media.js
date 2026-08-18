const { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const env = require('../config/env');

let client;

function isS3Configured() {
  return Boolean(env.s3.bucket && env.s3.region);
}

/** Explicit IAM secrets must be 40 chars or PutObject returns SignatureDoesNotMatch. */
function isS3CredentialsUsable() {
  const key = env.s3.accessKeyId;
  const secret = env.s3.secretAccessKey;
  if (!key && !secret) return true;
  return Boolean(key && secret && secret.length === 40);
}

function isS3Ready() {
  return isS3Configured() && isS3CredentialsUsable();
}

function getClient() {
  if (!isS3Configured()) {
    const err = new Error('S3 is not configured. Set AWS_S3_BUCKET and AWS_REGION.');
    err.statusCode = 503;
    throw err;
  }
  if (!client) {
    const config = { region: env.s3.region };
    if (env.s3.accessKeyId && env.s3.secretAccessKey) {
      config.credentials = {
        accessKeyId: env.s3.accessKeyId,
        secretAccessKey: env.s3.secretAccessKey,
      };
    }
    client = new S3Client(config);
  }
  return client;
}

function publicObjectUrl(key) {
  if (env.s3.publicBaseUrl) {
    return `${env.s3.publicBaseUrl.replace(/\/+$/, '')}/${key}`;
  }
  return `https://${env.s3.bucket}.s3.${env.s3.region}.amazonaws.com/${key}`;
}

async function uploadBuffer({ key, buffer, contentType, cacheControl = 'public, max-age=31536000' }) {
  try {
    await getClient().send(
      new PutObjectCommand({
        Bucket: env.s3.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType || 'application/octet-stream',
        CacheControl: cacheControl,
      })
    );
  } catch (err) {
    // #region agent log
    const payload = JSON.stringify({
      sessionId: '4fc0ec',
      runId: 'pre-fix',
      hypothesisId: 'A',
      location: 's3Media.js:uploadBuffer',
      message: 'S3 PutObject failed',
      data: {
        bucket: env.s3.bucket,
        region: env.s3.region,
        accessKeyLen: env.s3.accessKeyId ? env.s3.accessKeyId.length : 0,
        secretLen: env.s3.secretAccessKey ? env.s3.secretAccessKey.length : 0,
        name: err?.name,
        code: err?.Code || err?.code,
        httpStatus: err?.$metadata?.httpStatusCode,
        message: String(err?.message || '').slice(0, 180),
      },
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
    throw err;
  }
  return {
    key,
    url: env.s3.usePublicUrls ? publicObjectUrl(key) : mediaProxyPath(key),
  };
}

function mediaProxyPath(key) {
  return `/api/media/${String(key).replace(/^\/+/, '')}`;
}

function isSafeS3Key(key) {
  if (!key || typeof key !== 'string') return false;
  if (key.includes('..') || key.includes('\\') || key.startsWith('/')) return false;
  return /^[a-zA-Z0-9/._-]+$/.test(key);
}

async function getSignedGetUrl(key, expiresIn = env.s3.signedUrlTtlSec) {
  return getSignedUrl(
    getClient(),
    new GetObjectCommand({ Bucket: env.s3.bucket, Key: key }),
    { expiresIn }
  );
}

async function objectExists(key) {
  try {
    await getClient().send(new HeadObjectCommand({ Bucket: env.s3.bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  isS3Configured,
  uploadBuffer,
  getSignedGetUrl,
  objectExists,
  mediaProxyPath,
  publicObjectUrl,
  isSafeS3Key,
};
