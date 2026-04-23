'use strict';

const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl: getS3SignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3Region = process.env.AWS_REGION || 'ap-south-1';
const s3Bucket = String(process.env.S3_BUCKET_NAME || '').trim();
const s3SignedExpiresSec = Number(process.env.S3_SIGNED_URL_EXPIRES_SEC) || 3600;
const s3Client = new S3Client({ region: s3Region });

function looksLikeHttpUrl(v) {
  return /^https?:\/\//i.test(String(v || '').trim());
}

function looksLikeS3Key(v) {
  const s = String(v || '').trim();
  if (!s) return false;
  if (looksLikeHttpUrl(s)) return false;
  return s.includes('/') || s.includes('\\');
}

async function signS3Key(key) {
  const cleanKey = String(key || '').trim();
  if (!cleanKey || !s3Bucket) return cleanKey;
  const cmd = new GetObjectCommand({
    Bucket: s3Bucket,
    Key: cleanKey,
  });
  return getS3SignedUrl(s3Client, cmd, {
    expiresIn: Math.min(604800, Math.max(60, Math.floor(s3SignedExpiresSec))),
  });
}

function toPossibleS3KeyFromUrl(rawUrl) {
  const urlText = String(rawUrl || '').trim();
  if (!urlText || !looksLikeHttpUrl(urlText) || !s3Bucket) return null;
  try {
    const u = new URL(urlText);
    const host = String(u.host || '').toLowerCase();
    const bucket = s3Bucket.toLowerCase();
    let key = '';
    if (host === `${bucket}.s3.${String(s3Region).toLowerCase()}.amazonaws.com`
      || host === `${bucket}.s3.amazonaws.com`) {
      key = decodeURIComponent((u.pathname || '').replace(/^\/+/, ''));
    } else if (host === 's3.amazonaws.com') {
      const parts = (u.pathname || '').split('/').filter(Boolean);
      if (parts.length >= 2 && String(parts[0]).toLowerCase() === bucket) {
        key = decodeURIComponent(parts.slice(1).join('/'));
      }
    }
    return key || null;
  } catch {
    return null;
  }
}

async function maybeSignMediaUrl(rawValue) {
  const v = String(rawValue || '').trim();
  if (!v) return '';
  if (looksLikeHttpUrl(v)) {
    const maybeKey = toPossibleS3KeyFromUrl(v);
    if (!maybeKey) return v;
    try {
      const refreshed = await signS3Key(maybeKey);
      if (refreshed && refreshed !== v) {
        console.info('[media-link] refreshed signed URL', { key: maybeKey });
      }
      return refreshed;
    } catch {
      return v;
    }
  }
  if (!looksLikeS3Key(v)) return v;
  try {
    return await signS3Key(v);
  } catch {
    return v;
  }
}

async function withSignedMediaUrls(row) {
  if (!row || typeof row !== 'object') return row;
  const out = { ...row };
  if (Object.prototype.hasOwnProperty.call(out, 'videoUrl')) {
    out.videoUrl = await maybeSignMediaUrl(out.videoUrl);
  }
  if (Object.prototype.hasOwnProperty.call(out, 'documentUrl')) {
    out.documentUrl = await maybeSignMediaUrl(out.documentUrl);
  }
  return out;
}

async function withSignedMediaUrlsList(list) {
  if (!Array.isArray(list) || list.length === 0) return list;
  return Promise.all(list.map((row) => withSignedMediaUrls(row)));
}

module.exports = {
  maybeSignMediaUrl,
  withSignedMediaUrls,
  withSignedMediaUrlsList,
};

