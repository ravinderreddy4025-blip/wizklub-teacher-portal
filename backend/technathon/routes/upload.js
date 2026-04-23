/**
 * Upload API: /api/upload — multipart video/document to AWS S3.
 * Doc: ../../../docs/file-notes/server/routes/upload.js.md
 */
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const { S3Client } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const { uploadLimiter } = require('../middleware/rateLimiter');
const { maybeSignMediaUrl } = require('../lib/s3SignedUrl');

const router = express.Router();
const s3Region = process.env.AWS_REGION || 'ap-south-1';
const s3Bucket = process.env.S3_BUCKET_NAME || '';
const s3Prefix = String(process.env.S3_UPLOAD_PREFIX || 'technathon').replace(/^\/+|\/+$/g, '');

const s3Client = new S3Client({
  region: s3Region,
});

function extFromName(filename = '') {
  const ext = path.extname(String(filename)).toLowerCase();
  return /^[a-z0-9.]+$/.test(ext) ? ext : '';
}

function normalizeStudentId(raw) {
  const v = String(raw || '').trim();
  if (!v) return '';
  return v.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function buildObjectKey(fileKind, studentId, file) {
  const kind = String(fileKind).replace(/^\/+|\/+$/g, '');
  const ext = extFromName(file?.originalname);
  const id = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
  return `${s3Prefix}/${studentId}/${kind}-${id}${ext}`;
}

async function uploadToS3(file, fileKind, studentId) {
  if (!s3Bucket) {
    const e = new Error('S3_BUCKET_NAME is not configured.');
    e.status = 503;
    throw e;
  }
  const key = buildObjectKey(fileKind, studentId, file);
  const uploader = new Upload({
    client: s3Client,
    params: {
      Bucket: s3Bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype || 'application/octet-stream',
    },
    queueSize: 3,
    partSize: 8 * 1024 * 1024,
  });
  await uploader.done();
  const signedUrl = await maybeSignMediaUrl(key);
  return {
    key,
    url: signedUrl,
  };
}

const uploadVideo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 300 * 1024 * 1024 }, // 300 MB
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith('video/')) {
      return cb(new Error('Invalid video file type.'));
    }
    cb(null, true);
  },
});

const uploadDoc = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB (PDF / images)
  fileFilter: (_req, file, cb) => {
    const allowed = new Set([
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
    ]);
    if (!allowed.has(file.mimetype)) {
      return cb(new Error('Invalid document file type.'));
    }
    cb(null, true);
  },
});

/**
 * POST /api/upload/video
 * Upload a video to S3. No auth required (public form).
 */
router.post('/video', uploadLimiter, uploadVideo.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file provided' });
    const studentId = normalizeStudentId(req.body?.studentId);
    if (!studentId) {
      return res.status(400).json({ success: false, message: 'studentId is required for upload.' });
    }
    const saved = await uploadToS3(req.file, 'video', studentId);
    res.json({
      success: true,
      url: saved.key,
      publicId: saved.key,
      signedUrl: saved.url,
      message: 'Video uploaded successfully',
    });
  } catch (err) {
    console.error('[upload/video] failed', {
      message: err?.message,
      studentId: String(req.body?.studentId || '').trim() || null,
      filename: req.file?.originalname || null,
      mimetype: req.file?.mimetype || null,
      size: req.file?.size || null,
    });
    next(err);
  }
});

/**
 * POST /api/upload/document
 * Upload a document/image to S3. No auth required (public form).
 */
router.post('/document', uploadLimiter, uploadDoc.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file provided' });
    const studentId = normalizeStudentId(req.body?.studentId);
    if (!studentId) {
      return res.status(400).json({ success: false, message: 'studentId is required for upload.' });
    }
    const saved = await uploadToS3(req.file, 'document', studentId);
    res.json({
      success: true,
      url: saved.key,
      publicId: saved.key,
      signedUrl: saved.url,
      message: 'Document uploaded successfully',
    });
  } catch (err) {
    console.error('[upload/document] failed', {
      message: err?.message,
      studentId: String(req.body?.studentId || '').trim() || null,
      filename: req.file?.originalname || null,
      mimetype: req.file?.mimetype || null,
      size: req.file?.size || null,
    });
    next(err);
  }
});

module.exports = router;
