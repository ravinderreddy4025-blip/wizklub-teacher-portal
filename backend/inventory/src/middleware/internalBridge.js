function requireInternalBridge(req, res, next) {
  const expected = String(process.env.INTERNAL_BRIDGE_SECRET || '').trim();
  if (!expected) {
    return res.status(503).json({ message: 'Inventory bridge is not configured.' });
  }

  const provided = String(req.headers['x-internal-bridge-secret'] || '').trim();
  if (!provided || provided !== expected) {
    return res.status(403).json({ message: 'Forbidden.' });
  }

  return next();
}

module.exports = { requireInternalBridge };
