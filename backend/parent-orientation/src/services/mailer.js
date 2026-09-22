/**
 * Thin SMTP wrapper (nodemailer). One lazily created transport per process.
 * Tests replace the transport with __setMailerTransport({ sendMail }).
 */
const nodemailer = require('nodemailer');
const { mailConfig } = require('../config/mail');

let transport = null;
let transportOverride = null;

function getTransport(cfg = mailConfig()) {
  if (transportOverride) return transportOverride;
  if (!transport) {
    transport = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
      pool: true,
      maxConnections: 2,
      connectionTimeout: 15000,
      socketTimeout: 20000,
    });
  }
  return transport;
}

/** @returns {Promise<{ messageId: string|null }>} */
async function sendMail(message, cfg = mailConfig()) {
  const info = await getTransport(cfg).sendMail({
    from: cfg.from,
    ...(cfg.replyTo ? { replyTo: cfg.replyTo } : {}),
    ...(cfg.cc.length ? { cc: cfg.cc } : {}),
    ...message,
  });
  return { messageId: (info && info.messageId) || null };
}

function __setMailerTransport(t) {
  transportOverride = t;
}

module.exports = { sendMail, __setMailerTransport };
