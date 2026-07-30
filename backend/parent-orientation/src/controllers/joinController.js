const path = require('path');
const fs = require('fs');
const { PUBLIC_DIR } = require('../config/paths');
const { validateSessionId } = require('../domain/sessions');
const { isValidStudentId, normalizeStudentId } = require('../domain/studentIds');
const { findSessionById, appendStudentIdToSession } = require('../models/sessionModel');
const { mongo, logMongoError, mongoPingOk } = require('../services/mongo');

const ZOOM_HTTP_RE = /^https?:\/\//i;
const JOIN_HTML_PATH = path.join(PUBLIC_DIR, 'join.html');

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderErrorPage(title, message) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f1f5f9; padding: 16px; }
    .card { background: #fff; border-radius: 12px; padding: 24px; max-width: 420px; box-shadow: 0 8px 24px rgba(0,0,0,.08); }
    h1 { font-size: 20px; margin: 0 0 8px; color: #0f172a; }
    p { margin: 0; color: #64748b; line-height: 1.5; font-size: 14px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
  </div>
</body>
</html>`;
}

async function loadJoinableSession(sessionId) {
  if (!validateSessionId(sessionId)) {
    return { ok: false, status: 400, title: 'Invalid link', message: 'This meeting link is not valid.' };
  }
  if (!mongo.client) {
    return { ok: false, status: 503, title: 'Unavailable', message: 'Meeting registration is temporarily unavailable. Try again later.' };
  }
  if (!mongo.ready) {
    mongo.ready = await mongoPingOk();
    if (!mongo.ready) {
      return { ok: false, status: 503, title: 'Unavailable', message: 'Meeting registration is temporarily unavailable. Try again later.' };
    }
  }
  const session = await findSessionById(sessionId);
  if (!session) {
    return { ok: false, status: 404, title: 'Meeting not found', message: 'This meeting link is invalid or has expired.' };
  }
  if (String(session.venue || '').trim() !== 'Online') {
    return { ok: false, status: 400, title: 'Not an online meeting', message: 'This session is not an online meeting.' };
  }
  const st = String(session.status || '').trim();
  if (st === 'Cancelled') {
    return { ok: false, status: 400, title: 'Meeting cancelled', message: 'This meeting has been cancelled.' };
  }
  const location = session.location != null ? String(session.location).trim() : '';
  if (!ZOOM_HTTP_RE.test(location)) {
    return { ok: false, status: 400, title: 'Link not ready', message: 'The meeting link has not been set up yet.' };
  }
  return { ok: true, session, location };
}

function sendJoinForm(res, session, sessionId, errorMsg) {
  let html;
  try {
    html = fs.readFileSync(JOIN_HTML_PATH, 'utf8');
  } catch {
    return res.status(500).send('Join page not found.');
  }
  const branch = session.branch ? String(session.branch).trim() : '';
  const date = session.scheduled_date ? String(session.scheduled_date).trim() : '';
  const errBlock = errorMsg
    ? `<p class="join-err" role="alert">${escapeHtml(errorMsg)}</p>`
    : '';
  const out = html
    .replace('__SESSION_ID__', escapeHtml(sessionId))
    .replace('__BRANCH__', escapeHtml(branch || 'Online session'))
    .replace('__DATE__', escapeHtml(date))
    .replace('__ERROR__', errBlock);
  res.type('html').send(out);
}

async function getJoinPage(req, res) {
  try {
    const sessionId = req.params.sessionId;
    const loaded = await loadJoinableSession(sessionId);
    if (!loaded.ok) {
      return res.status(loaded.status).type('html').send(renderErrorPage(loaded.title, loaded.message));
    }
    return sendJoinForm(res, loaded.session, sessionId, '');
  } catch (err) {
    logMongoError('Join GET', err);
    return res.status(500).type('html').send(renderErrorPage('Error', 'Something went wrong. Please try again.'));
  }
}

async function postJoin(req, res) {
  try {
    const sessionId = req.params.sessionId;
    const loaded = await loadJoinableSession(sessionId);
    if (!loaded.ok) {
      return res.status(loaded.status).type('html').send(renderErrorPage(loaded.title, loaded.message));
    }
    const raw = req.body && req.body.student_id != null ? req.body.student_id : '';
    const studentId = normalizeStudentId(raw);
    if (!isValidStudentId(studentId)) {
      return sendJoinForm(
        res,
        loaded.session,
        sessionId,
        'Enter a valid student ID (1–40 letters, digits, hyphen, or underscore).'
      );
    }
    const result = await appendStudentIdToSession(sessionId, studentId);
    if (!result.ok) {
      return sendJoinForm(res, loaded.session, sessionId, result.msg);
    }
    return res.redirect(302, loaded.location);
  } catch (err) {
    logMongoError('Join POST', err);
    return res.status(500).type('html').send(renderErrorPage('Error', 'Something went wrong. Please try again.'));
  }
}

module.exports = { getJoinPage, postJoin };
