const fs = require('fs');
const {
  isProd,
  PORT,
  HOST,
  COOKIE_SECRET,
  PMO_PASS,
  SPEAKER_PASS,
  SALES_ADMIN_PASS,
  cookieSecure,
  trustProxyRaw,
} = require('./config/env');
const { INDEX_HTML_PATH, APP_JS_PATH, REACT_BUNDLE_PATH } = require('./config/paths');
const { WEAK_PASSWORDS } = require('./config/constants');
const { createApp } = require('./app');
const { ensureExcelTemplateFile } = require('./services/excel');
const { initMongo, mongo, closeMongo, mongoPingOk } = require('./services/mongo');

function assertProductionConfig() {
  if (!isProd) return;
  const badSecret =
    !process.env.COOKIE_SECRET ||
    COOKIE_SECRET.length < 32 ||
    /dev-change-me|replace-with-long-random/i.test(COOKIE_SECRET);
  if (badSecret) {
    console.error('[FATAL] Set COOKIE_SECRET in .env to a random string of at least 32 characters.');
    process.exit(1);
  }
  if (!process.env.PMO_PASS || !process.env.SPEAKER_PASS || !process.env.SALES_ADMIN_PASS) {
    console.error(
      '[FATAL] Production requires PMO_PASS, SPEAKER_PASS, and SALES_ADMIN_PASS in the environment (no defaults).'
    );
    process.exit(1);
  }
  const minLen = 12;
  if (
    PMO_PASS.length < minLen ||
    SPEAKER_PASS.length < minLen ||
    SALES_ADMIN_PASS.length < minLen
  ) {
    console.error(
      `[FATAL] Production: PMO_PASS, SPEAKER_PASS, and SALES_ADMIN_PASS must be at least ${minLen} characters.`
    );
    process.exit(1);
  }
  if (
    WEAK_PASSWORDS.has(PMO_PASS.toLowerCase()) ||
    WEAK_PASSWORDS.has(SPEAKER_PASS.toLowerCase()) ||
    WEAK_PASSWORDS.has(SALES_ADMIN_PASS.toLowerCase())
  ) {
    console.error('[FATAL] Production: use stronger role passwords (not a common default).');
    process.exit(1);
  }
  const passSet = new Set([PMO_PASS, SPEAKER_PASS, SALES_ADMIN_PASS]);
  if (passSet.size < 3) {
    console.error('[FATAL] Production: PMO_PASS, SPEAKER_PASS, and SALES_ADMIN_PASS must all differ.');
    process.exit(1);
  }
  if (!process.env.MONGODB_URI || !String(process.env.MONGODB_URI).trim()) {
    console.error('[FATAL] Production requires MONGODB_URI for shared persistence.');
    process.exit(1);
  }
  if (!cookieSecure) {
    console.warn('[WARN] Production: use HTTPS and set COOKIE_SECURE=1 so session cookies are secure.');
  }
  if (!trustProxyRaw && !['127.0.0.1', '::1', 'localhost'].includes(HOST)) {
    console.warn('[WARN] Production: behind a reverse proxy? Set TRUST_PROXY=1 for correct client IP / rate limits.');
  }
}

async function start(app) {
  assertProductionConfig();

  try {
    await ensureExcelTemplateFile();
  } catch (err) {
    console.error('[WARN] Excel template:', err && err.message ? err.message : err);
  }

  try {
    await initMongo();
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    if (isProd) {
      console.error('[FATAL] Production requires a working MONGODB_URI.');
      process.exit(1);
    }
    if (process.env.MONGODB_URI) {
      console.warn(
        '[WARN] Dev: continuing without MongoDB (sessions empty; PUT no-op). Fix VPN/firewall or set MONGODB_DISABLED=1, or use a reachable MONGODB_URI.'
      );
    }
  }

  if (isProd) {
    const requireFrontendFiles = process.env.REQUIRE_FRONTEND_FILES === '1';
    if (!fs.existsSync(INDEX_HTML_PATH) || !fs.existsSync(APP_JS_PATH)) {
      const msg =
        '[WARN] Frontend static files not found near backend (expected index.html + app.js). This is okay in split-deploy mode behind a frontend container.';
      if (requireFrontendFiles) {
        console.error(msg.replace('[WARN]', '[FATAL]'));
        process.exit(1);
      }
      console.warn(msg);
    } else if (!fs.existsSync(REACT_BUNDLE_PATH)) {
      console.warn('[WARN] frontend public/react-app.js missing — optional; run npm run build:react if needed.');
    }
  }

  const server = app.listen(PORT, HOST, async () => {
    const displayHost =
      HOST === '0.0.0.0' ? '0.0.0.0 (all interfaces)' : HOST === '127.0.0.1' ? 'localhost' : HOST;
    let mr = mongo.ready;
    if (mongo.client) {
      mr = await mongoPingOk();
      mongo.ready = mr;
    }
    console.log(`\n======================================================`);
    console.log(`Listening on ${displayHost}:${PORT}`);
    console.log(`Local: http://127.0.0.1:${PORT}`);
    console.log(`======================================================`);
    console.log(`Health: GET /api/health  |  mongo=${mr}`);
    console.log(`Cookies secure=${cookieSecure}  trustProxy=${Boolean(trustProxyRaw)}`);
    console.log(`Legacy bundle: ${fs.existsSync(APP_JS_PATH) ? 'OK' : 'MISSING'}  ${APP_JS_PATH}`);
    console.log(`======================================================\n`);
  });

  server.on('error', async (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[FATAL] Port ${PORT} is already in use on ${HOST}.`);
      console.error('Stop the other process (often another "node backend/server.js") or set PORT=8081 in .env.');
      console.error('Git Bash: netstat -ano | findstr :' + PORT + '  then  taskkill //PID <pid> //F');
    } else {
      console.error('[FATAL] HTTP server error:', err.message);
    }
    await closeMongo();
    process.exit(1);
  });

  const shutdown = (signal) => {
    console.log(`\n${signal} received, shutting down…`);
    server.close(() => {
      if (mongo.client) {
        closeMongo()
          .then(() => {
            console.log('MongoDB connection closed.');
            process.exit(0);
          })
          .catch((e) => {
            console.error('MongoDB close error:', e);
            process.exit(1);
          });
      } else {
        process.exit(0);
      }
    });
    setTimeout(() => {
      console.error('Forced exit after shutdown timeout.');
      process.exit(1);
    }, 12_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = { createApp, start };
