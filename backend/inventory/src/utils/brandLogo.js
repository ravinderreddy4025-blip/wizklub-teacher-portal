const fs = require('fs');
const path = require('path');
const env = require('../config/env');

const BUNDLED_LOGO = path.resolve(__dirname, '../../assets/wizklub-futurz-logo.png');
const EMAIL_LOGO_FILENAME = 'wizklub-logo.png';

let remotePdfLogoBuffer = null;

function configuredLogoPath() {
  return String(env.ses.logoUrl || process.env.WIZKLUB_LOGO_PATH || '').trim();
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim());
}

function resolveLocalLogoPath() {
  const raw = configuredLogoPath();
  const candidates = [];
  if (raw && !isHttpUrl(raw)) {
    candidates.push(path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw));
    candidates.push(path.resolve(__dirname, '../../../../', raw));
    candidates.push(path.resolve(__dirname, '../../', raw));
  }
  candidates.push(BUNDLED_LOGO);
  return candidates.find((filePath) => {
    try {
      return filePath && fs.existsSync(filePath);
    } catch {
      return false;
    }
  }) || null;
}

function readLocalLogoBuffer() {
  const filePath = resolveLocalLogoPath();
  if (!filePath) return null;
  try {
    return fs.readFileSync(filePath);
  } catch {
    return null;
  }
}

async function fetchRemoteLogoBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Public HTTPS URL for SES `logo_url`.
 * Uses https WIZKLUB_LOGO_PATH, else FRONTEND_URL/wizklub-logo.png (admin site static file).
 */
function logoUrlForEmail() {
  const configured = configuredLogoPath();
  if (isHttpUrl(configured)) return configured;

  const frontend = String(process.env.FRONTEND_URL || env.frontendUrl || '').replace(/\/$/, '');
  if (frontend && isHttpUrl(frontend)) {
    return `${frontend}/${EMAIL_LOGO_FILENAME}`;
  }

  return '';
}

async function preloadBrandLogo() {
  const raw = configuredLogoPath();
  if (!isHttpUrl(raw)) return;

  try {
    remotePdfLogoBuffer = await fetchRemoteLogoBuffer(raw);
  } catch (error) {
    console.warn('[brandLogo] Could not fetch WIZKLUB_LOGO_PATH logo:', error.message);
  }
}

function logoBufferForPdf() {
  if (remotePdfLogoBuffer) return remotePdfLogoBuffer;
  return readLocalLogoBuffer();
}

function drawPdfBrandHeader(doc, { rightTitle, rightSubtitle } = {}) {
  const logo = logoBufferForPdf();
  const pageWidth = doc.page.width;

  doc.save();
  doc.rect(0, 0, pageWidth, 96).fill('#FFFFFF');
  doc.strokeColor('#F7941D').lineWidth(4).moveTo(0, 96).lineTo(pageWidth, 96).stroke();

  if (logo) {
    try {
      doc.image(logo, 50, 22, { fit: [200, 52], valign: 'center' });
    } catch {
      doc.fillColor('#1A1A2E').font('Helvetica-Bold').fontSize(20).text('WizKlub Futurz', 50, 34);
    }
  } else {
    doc.fillColor('#1A1A2E').font('Helvetica-Bold').fontSize(20).text('WizKlub Futurz', 50, 34);
  }

  if (rightTitle) {
    doc.fillColor('#1A1A2E').font('Helvetica-Bold').fontSize(13)
      .text(rightTitle, pageWidth - 250, 28, { width: 200, align: 'right' });
  }
  if (rightSubtitle) {
    doc.fillColor('#64748B').font('Helvetica').fontSize(9)
      .text(rightSubtitle, pageWidth - 250, 50, { width: 200, align: 'right' });
  }
  doc.restore();
  doc.y = 116;
}

module.exports = {
  preloadBrandLogo,
  logoBufferForPdf,
  logoUrlForEmail,
  drawPdfBrandHeader,
};
