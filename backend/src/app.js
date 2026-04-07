const express = require('express');
const cookieParser = require('cookie-parser');
const { COOKIE_SECRET, trustProxyParsed } = require('./config/env');
const { securityHeaders } = require('./middleware/security');
const { mountStaticRoutes } = require('./routes/staticAssets');
const { mountApiRoutes } = require('./routes/api');
const { mountFallthrough } = require('./routes/fallthrough');

function createApp() {
  const app = express();
  app.disable('x-powered-by');

  if (trustProxyParsed != null) {
    app.set('trust proxy', trustProxyParsed);
  }

  app.use(securityHeaders());
  app.use(cookieParser(COOKIE_SECRET));

  mountStaticRoutes(app);
  mountApiRoutes(app);
  mountFallthrough(app);

  return app;
}

module.exports = { createApp };
