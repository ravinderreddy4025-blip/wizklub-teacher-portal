const DEFAULT_BASE = 'https://api.wizklub.com';

function baseUrl() {
  let url = String(process.env.WIZKLUB_API_BASE_URL || DEFAULT_BASE).replace(/\/$/, '');
  // Shared env often includes `/v1` (testimonials style); paths add `/v1/...` themselves.
  if (url.endsWith('/v1')) {
    url = url.slice(0, -3);
  }
  return url;
}

async function parseJsonResponse(res) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function extractErrorMessage(data, fallback) {
  if (!data || typeof data !== 'object') return fallback;
  return (
    data.message
    || data.error
    || data.detail
    || (Array.isArray(data.errors) ? data.errors.join(', ') : null)
    || fallback
  );
}

function pickNested(obj, paths) {
  for (const path of paths) {
    const parts = path.split('.');
    let cur = obj;
    let ok = true;
    for (const p of parts) {
      if (cur == null || typeof cur !== 'object') {
        ok = false;
        break;
      }
      cur = cur[p];
    }
    if (ok && cur != null && String(cur).trim()) return String(cur).trim();
  }
  return null;
}

function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const json = Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function normalizeRoleName(role) {
  return String(role || '').trim().toLowerCase();
}

function rolesIncludePmo(roles) {
  return (Array.isArray(roles) ? roles : [])
    .some((role) => normalizeRoleName(role) === 'pmo');
}

/**
 * Authenticate staff against WizKlub API.
 * @returns {Promise<object>} Raw API response body
 */
async function staffLogin(username, password) {
  const res = await fetch(`${baseUrl()}/v1/auth/login`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  });

  const data = await parseJsonResponse(res);
  if (!res.ok || data?.success === false) {
    const err = new Error(extractErrorMessage(data, 'Invalid username or password'));
    err.status = res.status >= 400 ? res.status : 401;
    throw err;
  }
  return data;
}

/** Normalize staff login response — API shape may vary. */
function parseLoginResponse(data) {
  const root = data?.data && typeof data.data === 'object' ? data.data : data;
  const userDetails = root?.user_details && typeof root.user_details === 'object'
    ? root.user_details
    : (root?.userDetails && typeof root.userDetails === 'object'
      ? root.userDetails
      : (root?.user && typeof root.user === 'object' ? root.user : {}));

  const rolesRaw = userDetails.roles || root.roles || data.roles || [];
  const roles = (Array.isArray(rolesRaw) ? rolesRaw : [])
    .map((role) => String(role).trim())
    .filter(Boolean);

  const accessToken = pickNested(root, [
    'access_token',
    'accessToken',
    'token',
  ]) || pickNested(data, ['access_token', 'accessToken', 'token']);

  const jwtPayload = accessToken ? decodeJwtPayload(accessToken) : null;
  const cognitoGroups = jwtPayload?.['cognito:groups'];
  const jwtRoles = Array.isArray(cognitoGroups)
    ? cognitoGroups.map((role) => String(role).trim()).filter(Boolean)
    : [];

  const allRoles = [...new Set([...roles, ...jwtRoles])];

  const refreshToken = pickNested(root, [
    'refresh_token',
    'refreshToken',
  ]) || pickNested(data, ['refresh_token', 'refreshToken']);

  const expiresInRaw = root?.expires_in ?? root?.expiresIn ?? data?.expires_in ?? data?.expiresIn;
  const expiresIn = Number(expiresInRaw);
  const expiresInSeconds = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600;

  const username = pickNested(userDetails, ['username', 'email', 'name'])
    || pickNested(root, ['username'])
    || pickNested(data, ['username']);

  const email = pickNested(userDetails, ['email'])
    || pickNested(root, ['email']);

  const userId = pickNested(userDetails, ['user_id', 'userId', 'id', 'sub'])
    || pickNested(root, ['user_id', 'userId', 'id']);

  return {
    accessToken,
    refreshToken,
    expiresIn: expiresInSeconds,
    username,
    email,
    userId,
    roles: allRoles,
    hasPmoRole: rolesIncludePmo(allRoles),
    raw: data,
  };
}

module.exports = {
  staffLogin,
  parseLoginResponse,
  rolesIncludePmo,
};
