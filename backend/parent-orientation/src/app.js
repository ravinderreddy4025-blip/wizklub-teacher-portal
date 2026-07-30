const express = require('express');
const cookieParser = require('cookie-parser');
const { COOKIE_SECRET, trustProxyParsed } = require('./config/env');
const { securityHeaders } = require('./middleware/security');
const { mountStaticRoutes } = require('./routes/staticAssets');
const { mountJoinRoutes } = require('./routes/joinRoutes');
const { mountApiRoutes } = require('./routes/api');
const { mountSwagger } = require('./routes/swagger');
const { mountFallthrough } = require('./routes/fallthrough');

function createApp() {
  const app = express();
  app.disable('x-powered-by');

  if (trustProxyParsed != null) {
    app.set('trust proxy', trustProxyParsed);
  }

  const helmetMiddleware = securityHeaders();
  app.use((req, res, next) => {
    if (req.path.startsWith('/join')) return next();
    return helmetMiddleware(req, res, next);
  });
  app.use(cookieParser(COOKIE_SECRET));

  mountStaticRoutes(app);
  mountJoinRoutes(app);
  mountApiRoutes(app);
  mountSwagger(app);
  mountFallthrough(app);

  return app;
}

module.exports = { createApp };
