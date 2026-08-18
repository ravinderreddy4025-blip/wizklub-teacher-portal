const path = require('path');
const fs = require('fs');
const { isS3Configured, getSignedGetUrl, isSafeS3Key } = require('../services/s3Media');

const localUploadDir = path.resolve(__dirname, '../../uploads');

function mediaKeyFromReq(req) {
  const raw = req.params.path || req.params[0] || '';
  const joined = Array.isArray(raw) ? raw.filter(Boolean).join('/') : String(raw);
  return joined.replace(/^\/+/, '');
}

async function getMedia(req, res, next) {
  try {
    const key = mediaKeyFromReq(req);
    const safe = isSafeS3Key(key);
    const s3 = isS3Configured();
    // #region agent log
    const payload = JSON.stringify({
      sessionId: '4fc0ec',
      runId: 'post-fix',
      hypothesisId: 'F',
      location: 'mediaController.js:getMedia',
      message: 'media request',
      data: {
        url: req.originalUrl,
        paramsType: Array.isArray(req.params.path) ? 'array' : typeof req.params.path,
        paramsPath: req.params.path,
        key,
        keyLen: key.length,
        s3Configured: s3,
        safeKey: safe,
      },
      timestamp: Date.now(),
    });
    const headers = { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '4fc0ec' };
    fetch('http://127.0.0.1:7494/ingest/c666538d-d52a-4b19-9d3b-5c52069c7f45', { method: 'POST', headers, body: payload }).catch(() => {});
    fetch('http://host.docker.internal:7494/ingest/c666538d-d52a-4b19-9d3b-5c52069c7f45', { method: 'POST', headers, body: payload }).catch(() => {});
    console.log('[debug-4fc0ec]', payload);
    try { require('fs').appendFileSync('/tmp/debug-4fc0ec.log', payload + '\n'); } catch (_) {}
    // #endregion
    if (!key) return res.status(400).json({ message: 'Missing media key.' });

    if (s3 && safe) {
      const url = await getSignedGetUrl(key);
      // #region agent log
      const payload2 = JSON.stringify({
        sessionId: '4fc0ec',
        runId: 'post-fix',
        hypothesisId: 'G',
        location: 'mediaController.js:getMedia',
        message: 'signed redirect',
        data: { key, signedHost: (() => { try { return new URL(url).host; } catch { return 'invalid'; } })() },
        timestamp: Date.now(),
      });
      fetch('http://127.0.0.1:7494/ingest/c666538d-d52a-4b19-9d3b-5c52069c7f45', { method: 'POST', headers, body: payload2 }).catch(() => {});
      fetch('http://host.docker.internal:7494/ingest/c666538d-d52a-4b19-9d3b-5c52069c7f45', { method: 'POST', headers, body: payload2 }).catch(() => {});
      console.log('[debug-4fc0ec]', payload2);
      // #endregion
      return res.redirect(302, url);
    }

    const filename = path.basename(key);
    const localPath = path.join(localUploadDir, filename);
    if (!localPath.startsWith(localUploadDir) || !fs.existsSync(localPath)) {
      return res.status(404).json({ message: 'Media not found.' });
    }
    return res.sendFile(localPath);
  } catch (err) {
    // #region agent log
    const fail = JSON.stringify({
      sessionId: '4fc0ec',
      runId: 'post-fix',
      hypothesisId: 'G',
      location: 'mediaController.js:getMedia',
      message: 'media failed',
      data: { name: err?.name, code: err?.Code || err?.code, msg: String(err?.message || '').slice(0, 180) },
      timestamp: Date.now(),
    });
    const headers = { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '4fc0ec' };
    fetch('http://host.docker.internal:7494/ingest/c666538d-d52a-4b19-9d3b-5c52069c7f45', { method: 'POST', headers, body: fail }).catch(() => {});
    console.log('[debug-4fc0ec]', fail);
    // #endregion
    return next(err);
  }
}

module.exports = { getMedia };
