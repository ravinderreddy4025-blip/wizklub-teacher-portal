const path = require('path');
const fs = require('fs');

const BACKEND_ROOT = path.join(__dirname, '..', '..');
const REPO_ROOT = path.join(BACKEND_ROOT, '..');
const FRONTEND_ROOT = path.join(REPO_ROOT, 'frontend');
const PUBLIC_DIR = path.join(FRONTEND_ROOT, 'public');

const XLSX_IN_BACKEND = path.join(BACKEND_ROOT, 'Parent_Orientation_Tracker.xlsx');
const XLSX_IN_REPO_ROOT = path.join(REPO_ROOT, 'Parent_Orientation_Tracker.xlsx');
const XLSX_PATH = fs.existsSync(XLSX_IN_BACKEND)
  ? XLSX_IN_BACKEND
  : fs.existsSync(XLSX_IN_REPO_ROOT)
    ? XLSX_IN_REPO_ROOT
    : XLSX_IN_BACKEND;

const APP_JS_PATH = path.join(PUBLIC_DIR, 'app.js');
const TOAST_JS_PATH = path.join(PUBLIC_DIR, 'react-toastify-bundle.js');
const TOAST_CSS_PATH = path.join(PUBLIC_DIR, 'react-toastify-bundle.css');
const EXCELJS_VENDOR = path.join(REPO_ROOT, 'node_modules', 'exceljs', 'dist', 'exceljs.min.js');
const FILESAVER_VENDOR = path.join(REPO_ROOT, 'node_modules', 'file-saver', 'dist', 'FileSaver.min.js');
const BRAND_DIR = path.join(PUBLIC_DIR, 'brand');
const MANIFEST_PATH = path.join(PUBLIC_DIR, 'manifest.webmanifest');
const SW_JS_PATH = path.join(PUBLIC_DIR, 'sw.js');
const PWA_ICON_SVG_PATH = path.join(PUBLIC_DIR, 'pwa-icon.svg');
const INDEX_HTML_PATH = path.join(FRONTEND_ROOT, 'index.html');

module.exports = {
  BACKEND_ROOT,
  REPO_ROOT,
  FRONTEND_ROOT,
  PUBLIC_DIR,
  XLSX_PATH,
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
};
