const fs = require('fs');
const path = require('path');
const express = require('express');
const { isProd } = require('../config/env');
const {
  BRAND_DIR,
  PUBLIC_DIR,
  APP_JS_PATH,
  REACT_BUNDLE_PATH,
  TOAST_JS_PATH,
  TOAST_CSS_PATH,
  EXCELJS_VENDOR,
  FILESAVER_VENDOR,
  MANIFEST_PATH,
  SW_JS_PATH,
  PWA_ICON_SVG_PATH,
  REACT_INDEX_HTML_PATH,
} = require('../config/paths');

const PUBLIC_ROOT_ABS = path.resolve(PUBLIC_DIR);

if (!fs.existsSync(BRAND_DIR)) {
  fs.mkdirSync(BRAND_DIR, { recursive: true });
}

let cachedReactIndexHtml = null;

function getReactIndexHtmlWithInlineLogo() {
  if (isProd && cachedReactIndexHtml !== null) return cachedReactIndexHtml;
  if (!fs.existsSync(REACT_INDEX_HTML_PATH)) return null;
  let html = fs.readFileSync(REACT_INDEX_HTML_PATH, 'utf8');
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
    console.warn('[WARN] Could not inline brand logo in React index:', e.message);
  }
  if (isProd) cachedReactIndexHtml = html;
  return html;
}

function mountStaticRoutes(app) {
  app.get('/', (req, res) => {
    if (isProd) res.set('Cache-Control', 'no-store');
    const reactHtml = getReactIndexHtmlWithInlineLogo();
    if (!reactHtml) {
      return res
        .status(404)
        .type('text/plain')
        .send('App HTML not found (frontend/public/index.html).');
    }
    res.type('html');
    return res.send(reactHtml);
  });

  app.get('/react', (req, res) => {
    if (isProd) res.set('Cache-Control', 'no-store');
    const reactHtml = getReactIndexHtmlWithInlineLogo();
    if (!reactHtml) {
      return res
        .status(404)
        .type('text/plain')
        .send('App HTML not found (frontend/public/index.html).');
    }
    res.type('html');
    return res.send(reactHtml);
  });

  app.get('/app.js', (req, res) => {
    const abs = path.join(PUBLIC_ROOT_ABS, 'app.js');
    if (!fs.existsSync(abs)) {
      return res
        .status(404)
        .type('text/plain')
        .send(
          `Missing app.js. Expected file at:\n${abs}\n\nRestore from git: git show HEAD:frontend/public/app.js > frontend/public/app.js`
        );
    }
    if (isProd) res.set('Cache-Control', 'public, max-age=3600');
    else res.set('Cache-Control', 'no-store');
    res.type('application/javascript; charset=utf-8');
    return res.sendFile('app.js', { root: PUBLIC_ROOT_ABS });
  });

  app.get('/react-app.js', (req, res) => {
    if (!fs.existsSync(REACT_BUNDLE_PATH)) {
      return res
        .status(404)
        .type('text/plain')
        .send('React bundle missing — run npm run build:react.');
    }
    if (isProd) res.set('Cache-Control', 'public, max-age=3600');
    else res.set('Cache-Control', 'no-store');
    res.type('application/javascript; charset=utf-8');
    return res.sendFile('react-app.js', { root: PUBLIC_ROOT_ABS });
  });

  app.get('/react-toastify-bundle.js', (req, res) => {
    if (!fs.existsSync(TOAST_JS_PATH)) {
      return res.status(404).type('text/plain').send('Toast bundle missing — run npm run build:toast.');
    }
    if (isProd) res.set('Cache-Control', 'public, max-age=86400');
    res.type('application/javascript; charset=utf-8');
    res.sendFile('react-toastify-bundle.js', { root: PUBLIC_ROOT_ABS });
  });

  app.get('/react-toastify-bundle.css', (req, res) => {
    if (!fs.existsSync(TOAST_CSS_PATH)) {
      return res.status(404).type('text/plain').send('Toast CSS missing — run npm run build:toast.');
    }
    if (isProd) res.set('Cache-Control', 'public, max-age=86400');
    res.type('text/css; charset=utf-8');
    res.sendFile('react-toastify-bundle.css', { root: PUBLIC_ROOT_ABS });
  });

  app.get('/vendor/exceljs.min.js', (req, res) => {
    if (!fs.existsSync(EXCELJS_VENDOR)) {
      return res.status(404).type('text/plain').send('ExcelJS not installed (npm install exceljs).');
    }
    if (isProd) res.set('Cache-Control', 'public, max-age=86400');
    res.type('application/javascript; charset=utf-8');
    res.sendFile(path.basename(EXCELJS_VENDOR), { root: path.dirname(EXCELJS_VENDOR) });
  });

  app.get('/vendor/FileSaver.min.js', (req, res) => {
    if (!fs.existsSync(FILESAVER_VENDOR)) {
      return res.status(404).type('text/plain').send('file-saver not installed (npm install file-saver).');
    }
    if (isProd) res.set('Cache-Control', 'public, max-age=86400');
    res.type('application/javascript; charset=utf-8');
    res.sendFile(path.basename(FILESAVER_VENDOR), { root: path.dirname(FILESAVER_VENDOR) });
  });

  app.get('/brand/logo.png', (req, res) => {
    const p = path.join(BRAND_DIR, 'logo.png');
    if (!fs.existsSync(p)) {
      return res.status(404).type('text/plain').send('Add your logo file at frontend/public/brand/logo.png');
    }
    if (isProd) res.set('Cache-Control', 'public, max-age=604800');
    res.type('image/png');
    res.sendFile('logo.png', { root: path.resolve(BRAND_DIR) });
  });

  app.get('/brand/logo.jpg', (req, res) => {
    const p = path.join(BRAND_DIR, 'logo.jpg');
    if (!fs.existsSync(p)) {
      return res.status(404).end();
    }
    if (isProd) res.set('Cache-Control', 'public, max-age=604800');
    res.type('image/jpeg');
    res.sendFile('logo.jpg', { root: path.resolve(BRAND_DIR) });
  });

  app.get('/manifest.webmanifest', (req, res) => {
    if (!fs.existsSync(MANIFEST_PATH)) {
      return res.status(404).type('text/plain').send('manifest missing');
    }
    res.type('application/manifest+json; charset=utf-8');
    res.set('Cache-Control', isProd ? 'public, max-age=3600' : 'no-store');
    res.sendFile('manifest.webmanifest', { root: PUBLIC_ROOT_ABS });
  });

  app.get('/sw.js', (req, res) => {
    if (!fs.existsSync(SW_JS_PATH)) {
      return res.status(404).type('text/plain').send('service worker missing');
    }
    res.type('application/javascript; charset=utf-8');
    res.set('Cache-Control', 'no-store');
    res.set('Service-Worker-Allowed', '/');
    res.sendFile('sw.js', { root: PUBLIC_ROOT_ABS });
  });

  app.get('/pwa-icon.svg', (req, res) => {
    if (!fs.existsSync(PWA_ICON_SVG_PATH)) {
      return res.status(404).end();
    }
    if (isProd) res.set('Cache-Control', 'public, max-age=604800');
    res.type('image/svg+xml; charset=utf-8');
    res.sendFile('pwa-icon.svg', { root: PUBLIC_ROOT_ABS });
  });

  app.use('/brand', express.static(BRAND_DIR, { maxAge: isProd ? '7d' : 0 }));
}

module.exports = { mountStaticRoutes };
