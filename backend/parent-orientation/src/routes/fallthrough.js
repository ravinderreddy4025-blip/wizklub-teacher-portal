const { isProd } = require('../config/env');

function mountFallthrough(app) {
  app.use((req, res) => {
    if (req.path.startsWith('/api')) {
      const body = { error: 'Unknown API route' };
      if (!isProd) {
        body.method = req.method;
        body.path = req.path;
      }
      return res.status(404).json(body);
    }
    res.status(404).type('text/plain').send('Not found');
  });

  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    console.error('[error]', err && err.stack ? err.stack : err);
    const status = Number(err.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
    if (isProd) {
      return res.status(status).json({ error: status === 500 ? 'Server error' : err.message || 'Error' });
    }
    res.status(status).json({ error: err.message || 'Server error' });
  });
}

module.exports = { mountFallthrough };
