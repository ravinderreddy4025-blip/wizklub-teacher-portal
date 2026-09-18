const { isS3Configured, isSafeS3Key, getSignedGetUrl } = require('../services/s3Media');

function mediaKeyFromReq(req) {
  const raw = req.params.path || req.params[0] || '';
  const joined = Array.isArray(raw) ? raw.filter(Boolean).join('/') : String(raw);
  return joined.replace(/^\/+/, '');
}

async function getMedia(req, res, next) {
  try {
    const key = mediaKeyFromReq(req);
    if (!key) return res.status(400).json({ message: 'Missing media key.' });
    if (!isS3Configured() || !isSafeS3Key(key)) {
      return res.status(404).json({ message: 'Media not found.' });
    }

    const url = await getSignedGetUrl(key);
    return res.redirect(302, url);
  } catch (err) {
    return next(err);
  }
}

module.exports = { getMedia };
