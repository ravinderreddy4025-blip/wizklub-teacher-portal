const fs = require('fs');
const path = require('path');
const express = require('express');
const { isProd } = require('../config/env');
const {
  BRAND_DIR,
  APP_JS_PATH,
  TOAST_JS_PATH,
  TOAST_CSS_PATH,
  EXCELJS_VENDOR,
  FILESAVER_VENDOR,
  MANIFEST_PATH,
  SW_JS_PATH,
  PWA_ICON_SVG_PATH,
  INDEX_HTML_PATH,
} = require('../config/paths');

if (!fs.existsSync(BRAND_DIR)) {
  fs.mkdirSync(BRAND_DIR, { recursive: true });
}

let cachedIndexHtml = null;

function getIndexHtmlWithInlineLogo() {
  if (isProd && cachedIndexHtml !== null) return cachedIndexHtml;
  let html = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
  const logoPng = path.join(BRAND_DIR, 'logo.png');
  const logoJpg = path.join(BRAND_DIR, 'logo.jpg');
  try {
    if (fs.existsSync(logoPng)) {
      const dataUri = `data:image/png;base64,${fs.readFileSync(logoPng).toString('base64')}`;
      html = html.replace(/src="\/brand\/logo\.png"/g, `src="${dataUri}"`);
    } else if (fs.existsSync(logoJpg)) {
      const dataUri = `data:image/jpeg;base64,${fs.readFileSync(logoJpg).toString('base64')}`;
      html = html.replace(/src="\/brand\/logo\.png"/g, `src="${dataUri}"`);
    }
  } catch (e) {
    console.warn('[WARN] Could not inline brand logo:', e.message);
  }
  if (isProd) cachedIndexHtml = html;
  return html;
}

function mountStaticRoutes(app) {
  app.get('/', (req, res) => {
    if (isProd) res.set('Cache-Control', 'no-store');
    res.type('html');
    res.send(getIndexHtmlWithInlineLogo());
  });

  app.get('/app.js', (req, res) => {
    if (isProd) res.set('Cache-Control', 'public, max-age=3600');
    else res.set('Cache-Control', 'no-store');
    res.type('application/javascript');
    res.sendFile(APP_JS_PATH);
  });

  app.get('/react-toastify-bundle.js', (req, res) => {
    if (!fs.existsSync(TOAST_JS_PATH)) {
      return res.status(404).type('text/plain').send('Toast bundle missing — run npm run build:toast.');
    }
    if (isProd) res.set('Cache-Control', 'public, max-age=86400');
    res.type('application/javascript');
    res.sendFile(TOAST_JS_PATH);
  });

  app.get('/react-toastify-bundle.css', (req, res) => {
    if (!fs.existsSync(TOAST_CSS_PATH)) {
      return res.status(404).type('text/plain').send('Toast CSS missing — run npm run build:toast.');
    }
    if (isProd) res.set('Cache-Control', 'public, max-age=86400');
    res.type('text/css');
    res.sendFile(TOAST_CSS_PATH);
  });

  app.get('/vendor/exceljs.min.js', (req, res) => {
    if (!fs.existsSync(EXCELJS_VENDOR)) {
      return res.status(404).type('text/plain').send('ExcelJS not installed (npm install exceljs).');
    }
    if (isProd) res.set('Cache-Control', 'public, max-age=86400');
    res.type('application/javascript');
    res.sendFile(EXCELJS_VENDOR);
  });

  app.get('/vendor/FileSaver.min.js', (req, res) => {
    if (!fs.existsSync(FILESAVER_VENDOR)) {
      return res.status(404).type('text/plain').send('file-saver not installed (npm install file-saver).');
    }
    if (isProd) res.set('Cache-Control', 'public, max-age=86400');
    res.type('application/javascript');
    res.sendFile(FILESAVER_VENDOR);
  });

  app.get('/brand/logo.png', (req, res) => {
    const p = path.join(BRAND_DIR, 'logo.png');
    if (!fs.existsSync(p)) {
      return res.status(404).type('text/plain').send('Add your logo file at frontend/public/brand/logo.png');
    }
    if (isProd) res.set('Cache-Control', 'public, max-age=604800');
    res.type('image/png');
    res.sendFile(p);
  });

  app.get('/brand/logo.jpg', (req, res) => {
    const p = path.join(BRAND_DIR, 'logo.jpg');
    if (!fs.existsSync(p)) {
      return res.status(404).end();
    }
    if (isProd) res.set('Cache-Control', 'public, max-age=604800');
    res.type('image/jpeg');
    res.sendFile(p);
  });

  app.get('/manifest.webmanifest', (req, res) => {
    if (!fs.existsSync(MANIFEST_PATH)) {
      return res.status(404).type('text/plain').send('manifest missing');
    }
    res.type('application/manifest+json; charset=utf-8');
    res.set('Cache-Control', isProd ? 'public, max-age=3600' : 'no-store');
    res.sendFile(MANIFEST_PATH);
  });

  app.get('/sw.js', (req, res) => {
    if (!fs.existsSync(SW_JS_PATH)) {
      return res.status(404).type('text/plain').send('service worker missing');
    }
    res.type('application/javascript; charset=utf-8');
    res.set('Cache-Control', 'no-store');
    res.set('Service-Worker-Allowed', '/');
    res.sendFile(SW_JS_PATH);
  });

  app.get('/pwa-icon.svg', (req, res) => {
    if (!fs.existsSync(PWA_ICON_SVG_PATH)) {
      return res.status(404).end();
    }
    if (isProd) res.set('Cache-Control', 'public, max-age=604800');
    res.type('image/svg+xml; charset=utf-8');
    res.sendFile(PWA_ICON_SVG_PATH);
  });

  app.use('/brand', express.static(BRAND_DIR, { maxAge: isProd ? '7d' : 0 }));
}

module.exports = { mountStaticRoutes };
