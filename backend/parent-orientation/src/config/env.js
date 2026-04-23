const isProd = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.BIND_HOST || '127.0.0.1';
const COOKIE_SECRET = process.env.COOKIE_SECRET || 'dev-change-me-set-in-env';

const COOKIE_NAME = 'po_auth';
const COOKIE_NAME_PMO = 'po_auth_pmo';
const COOKIE_NAME_SPEAKER = 'po_auth_speaker';
const ACTIVE_ROLE_HEADER = 'x-po-role';

const MONGODB_DB = process.env.MONGODB_DB || 'parent_orientation';

const trustProxyRaw = process.env.TRUST_PROXY;
let trustProxyParsed = null;
if (trustProxyRaw === '1' || trustProxyRaw === 'true' || trustProxyRaw === 'yes') {
  trustProxyParsed = 1;
} else if (trustProxyRaw != null && trustProxyRaw !== '' && !Number.isNaN(Number(trustProxyRaw))) {
  trustProxyParsed = Number(trustProxyRaw);
}

const cs = process.env.COOKIE_SECURE;
let cookieSecure;
if (cs === '0' || cs === 'false') cookieSecure = false;
else if (cs === '1' || cs === 'true') cookieSecure = true;
else cookieSecure = process.env.NODE_ENV === 'production';

const PMO_USER = process.env.PMO_USER || 'PMO';
const PMO_PASS = process.env.PMO_PASS || 'PMO@123';
const SPEAKER_USER = process.env.SPEAKER_USER || 'Speaker';
const SPEAKER_PASS = process.env.SPEAKER_PASS || 'Speaker@123';
const _adminEnv = process.env.ADMIN_USER;
const ADMIN_USER =
  _adminEnv !== undefined && _adminEnv !== '' ? String(_adminEnv).trim().toLowerCase() : 'admin';

module.exports = {
  isProd,
  PORT,
  HOST,
  COOKIE_SECRET,
  COOKIE_NAME,
  COOKIE_NAME_PMO,
  COOKIE_NAME_SPEAKER,
  ACTIVE_ROLE_HEADER,
  MONGODB_DB,
  trustProxyRaw,
  trustProxyParsed,
  cookieSecure,
  PMO_USER,
  PMO_PASS,
  SPEAKER_USER,
  SPEAKER_PASS,
  ADMIN_USER,
};
