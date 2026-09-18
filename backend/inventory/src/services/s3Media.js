const { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const env = require('../config/env');

let client;

function isS3Configured() {
  return Boolean(env.s3.bucket && env.s3.region);
}

function hasS3Credentials() {
  return Boolean(env.s3.accessKeyId && env.s3.secretAccessKey);
}

/** Explicit IAM secrets must be 40 chars or PutObject returns SignatureDoesNotMatch. */
function isS3CredentialsUsable() {
  const key = env.s3.accessKeyId;
  const secret = env.s3.secretAccessKey;
  if (!key || !secret) return false;
  return secret.length === 40;
}

function isS3Ready() {
  return isS3Configured() && isS3CredentialsUsable();
}

function assertS3Ready() {
  if (!isS3Configured()) {
    const err = new Error('S3 is not configured. Set AWS_S3_BUCKET and AWS_REGION.');
    err.statusCode = 503;
    throw err;
  }
  if (!hasS3Credentials()) {
    const err = new Error(
      'S3 credentials missing. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY (or AWS_NOTIF_ACCESS_KEY / AWS_NOTIF_SECRET_KEY).'
    );
    err.statusCode = 503;
    throw err;
  }
  if (!isS3CredentialsUsable()) {
    const err = new Error(
      'S3 credentials are invalid. AWS secret access key must be exactly 40 characters.'
    );
    err.statusCode = 503;
    throw err;
  }
}

function getClient() {
  assertS3Ready();
  if (!client) {
    client = new S3Client({
      region: env.s3.region,
      credentials: {
        accessKeyId: env.s3.accessKeyId,
        secretAccessKey: env.s3.secretAccessKey,
      },
    });
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
  await getClient().send(
    new PutObjectCommand({
      Bucket: env.s3.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType || 'application/octet-stream',
      CacheControl: cacheControl,
    })
  );
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
  isS3Ready,
  assertS3Ready,
  uploadBuffer,
  getSignedGetUrl,
  objectExists,
  mediaProxyPath,
  publicObjectUrl,
  isSafeS3Key,
};
