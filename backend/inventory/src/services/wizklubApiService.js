const env = require('../config/env');

const DEFAULT_BASE = 'https://api.wizklub.com';

function baseUrl() {
  let url = (process.env.WIZKLUB_API_BASE_URL || env.wizklubApiBaseUrl || DEFAULT_BASE).replace(/\/$/, '');
  // Shared env often includes `/v1` (testimonials style); inventory paths add `/v1/...` themselves.
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

/**
 * Authenticate admin (and other staff) against WizKlub API.
 * @returns {Promise<object>} Raw API response body
 */
async function adminLogin(username, password) {
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

/**
 * Refresh WizKlub admin access token.
 * @returns {Promise<object>} Raw API response body
 */
async function adminRefresh(username, refreshToken) {
  const res = await fetch(`${baseUrl()}/v1/auth/refresh`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username,
      refresh_token: refreshToken,
    }),
  });

  const data = await parseJsonResponse(res);
  if (!res.ok || data?.success === false) {
    const err = new Error(extractErrorMessage(data, 'Session expired. Please sign in again.'));
    err.status = res.status >= 400 ? res.status : 401;
    throw err;
  }
  return data;
}

/**
 * Logout WizKlub admin session.
 * @returns {Promise<object>} Raw API response body
 */
async function adminLogout(accessToken) {
  const headers = { accept: 'application/json' };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const res = await fetch(`${baseUrl()}/v1/auth/logout`, {
    method: 'POST',
    headers,
    body: '',
  });

  const data = await parseJsonResponse(res);
  if (!res.ok || data?.success === false) {
    const err = new Error(extractErrorMessage(data, 'Logout failed'));
    err.status = res.status >= 400 ? res.status : 500;
    throw err;
  }
  return data;
}

/**
 * Authenticate instructor against WizKlub staff login API.
 * Staff instructors (e.g. Cognito users with Instructor role) use /v1/auth/login,
 * not the legacy /v1/auth/instructor/login endpoint.
 * @returns {Promise<object>} Raw API response body
 */
async function instructorLogin(username, password) {
  const url = `${baseUrl()}/v1/auth/login`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  });

  const data = await parseJsonResponse(res);
  if (!res.ok || data?.success === false) {
    const err = new Error(extractErrorMessage(data, 'Invalid instructor username or password'));
    err.status = res.status >= 400 ? res.status : 401;
    throw err;
  }
  return data;
}

/**
 * Fetch school display details from WizKlub API.
 */
async function getSchoolDetails(schoolId, wizklubToken) {
  const encodedId = encodeURIComponent(String(schoolId).trim());
  const url = `${baseUrl()}/v1/schools/${encodedId}`;

  const headers = { accept: 'application/json' };
  if (wizklubToken) {
    headers.Authorization = `Bearer ${wizklubToken}`;
  }

  const res = await fetch(url, { headers });
  const data = await parseJsonResponse(res);
  if (!res.ok || data?.success === false) {
    const err = new Error(extractErrorMessage(data, `Failed to load school details for ${schoolId}`));
    err.status = res.status >= 400 ? res.status : 502;
    throw err;
  }
  return data;
}

let cachedServiceAdminToken = null;
let cachedServiceAdminTokenExpiresAt = 0;

/**
 * Server-side WizKlub admin token for lookups instructors cannot perform (optional).
 * Set WIZKLUB_ADMIN_USERNAME / WIZKLUB_ADMIN_PASSWORD in .env.
 */
async function getServiceAdminAccessToken() {
  const username = process.env.WIZKLUB_ADMIN_USERNAME?.trim();
  const password = process.env.WIZKLUB_ADMIN_PASSWORD;
  if (!username || !password) return null;

  const now = Date.now();
  if (cachedServiceAdminToken && cachedServiceAdminTokenExpiresAt > now + 60_000) {
    return cachedServiceAdminToken;
  }

  const loginData = await adminLogin(username, password);
  const parsed = parseAdminLoginResponse(loginData);
  if (!parsed.accessToken) return null;

  cachedServiceAdminToken = parsed.accessToken;
  cachedServiceAdminTokenExpiresAt = now + (parsed.expiresIn * 1000);
  return cachedServiceAdminToken;
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

function rolesIncludeAdmin(roles) {
  return (Array.isArray(roles) ? roles : [])
    .some((role) => normalizeRoleName(role) === 'admin');
}

function rolesIncludeInstructor(roles) {
  return (Array.isArray(roles) ? roles : [])
    .some((role) => normalizeRoleName(role) === 'instructor');
}

/** Normalize staff/admin login response — API shape may vary. */
function parseAdminLoginResponse(data) {
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
  const hasAdminRole = rolesIncludeAdmin(allRoles);

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
    hasAdminRole,
    raw: data,
  };
}

/** Normalize instructor login response — API shape may vary. */
function parseInstructorLoginResponse(data) {
  const root = data?.data && typeof data.data === 'object' ? data.data : data;
  const userDetails = root?.user_details && typeof root.user_details === 'object'
    ? root.user_details
    : (root?.userDetails && typeof root.userDetails === 'object'
      ? root.userDetails
      : (root?.user && typeof root.user === 'object' ? root.user : {}));
  const user = root?.user && typeof root.user === 'object' ? root.user : userDetails;

  const rawSchoolIds = (
    userDetails.school_ids
    || userDetails.schoolIds
    || user.school_ids
    || user.schoolIds
    || root.school_ids
    || root.schoolIds
    || root.schools
    || data.school_ids
    || data.schoolIds
    || []
  );
  const schoolIds = (Array.isArray(rawSchoolIds) ? rawSchoolIds : [])
    .map((id) => String(id).trim())
    .filter(Boolean);

  const wizklubToken = pickNested(root, [
    'access_token',
    'accessToken',
    'token',
    'auth_token',
    'jwt',
  ]) || pickNested(data, ['access_token', 'accessToken', 'token']);

  const rolesRaw = userDetails.roles || user.roles || root.roles || data.roles || [];
  const roles = (Array.isArray(rolesRaw) ? rolesRaw : [])
    .map((role) => String(role).trim())
    .filter(Boolean);

  const jwtPayload = wizklubToken ? decodeJwtPayload(wizklubToken) : null;
  const cognitoGroups = jwtPayload?.['cognito:groups'];
  const jwtRoles = Array.isArray(cognitoGroups)
    ? cognitoGroups.map((role) => String(role).trim()).filter(Boolean)
    : [];
  const allRoles = [...new Set([...roles, ...jwtRoles])];
  const hasInstructorRole = rolesIncludeInstructor(allRoles);

  const instructorName = pickNested(userDetails, [
    'name',
    'full_name',
    'fullName',
    'instructor_name',
    'username',
  ]) || pickNested(user, [
    'name',
    'full_name',
    'fullName',
    'instructor_name',
    'username',
  ]) || pickNested(root, ['name', 'username']) || pickNested(data, ['name', 'username']);

  const username = pickNested(userDetails, ['username', 'email'])
    || pickNested(user, ['username', 'email'])
    || pickNested(root, ['username'])
    || pickNested(data, ['username']);

  return {
    schoolIds,
    wizklubToken,
    instructorName,
    username,
    roles: allRoles,
    hasInstructorRole,
    raw: data,
  };
}

/** Normalize school-details response. */
function parseSchoolDetailsResponse(data, fallbackSchoolId) {
  const root = data?.data && typeof data.data === 'object' ? data.data : data;
  const school = root?.school && typeof root.school === 'object' ? root.school : root;

  const name = pickNested(school, [
    'name',
    'school_name',
    'schoolName',
    'branch_name',
    'branchName',
    'display_name',
  ]) || pickNested(root, ['school_name', 'name']) || pickNested(data, ['school_name', 'name']);

  const schoolId = pickNested(school, ['id', 'school_id', 'schoolId', 'code'])
    || pickNested(root, ['school_id', 'schoolId', 'id'])
    || fallbackSchoolId;

  return { name: name || fallbackSchoolId, schoolId };
}

/**
 * Fetch one page of schools from WizKlub API.
 */
async function listSchoolsPage(accessToken, { pageSize = 100, cursor = null } = {}) {
  const url = new URL(`${baseUrl()}/v1/schools`);
  url.searchParams.set('page_size', String(Math.min(Math.max(pageSize, 1), 500)));
  if (cursor) {
    url.searchParams.set('cursor', cursor);
  }

  const res = await fetch(url, {
    headers: {
      accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await parseJsonResponse(res);
  if (!res.ok || data?.success === false) {
    const err = new Error(extractErrorMessage(data, 'Failed to load schools from WizKlub'));
    err.status = res.status >= 400 ? res.status : 502;
    throw err;
  }
  return data;
}

function extractPageInfo(data) {
  const root = data?.data && typeof data.data === 'object' ? data.data : data;
  const pageInfo = root?.page_info || root?.pageInfo || data?.page_info || data?.pageInfo || {};

  const nextCursor = pageInfo.next_cursor ?? pageInfo.nextCursor ?? null;
  const hasNextPage = pageInfo.has_next_page ?? pageInfo.hasNextPage ?? null;

  return {
    nextCursor: nextCursor ? String(nextCursor) : null,
    hasNextPage: typeof hasNextPage === 'boolean' ? hasNextPage : null,
  };
}

/** Normalize schools list API response. */
function parseSchoolsListResponse(data) {
  const root = data?.data && typeof data.data === 'object' ? data.data : data;
  const candidates = [
    root?.schools,
    root?.items,
    root?.results,
    data?.schools,
    data?.items,
    data?.results,
  ];
  let list = candidates.find((value) => Array.isArray(value));
  if (!list && Array.isArray(root)) list = root;
  if (!list && Array.isArray(data)) list = data;
  if (!list) return [];

  return list.map((item) => {
    const school = item?.school && typeof item.school === 'object' ? item.school : item;
    const id = pickNested(school, ['id', 'school_id', 'schoolId', 'uuid']);
    const code = pickNested(school, ['code', 'school_code', 'schoolCode', 'school_id', 'id']);
    const name = pickNested(school, [
      'name',
      'school_name',
      'schoolName',
      'branch_name',
      'branchName',
      'display_name',
    ]);
    const email = pickNested(school, ['email', 'contact_email', 'contactEmail']);
    const region = school.region ?? item.region ?? null;
    const regionIdRaw = school.region_id ?? school.regionId ?? item.region_id ?? item.regionId;
    const region_id = regionIdRaw == null || regionIdRaw === '' ? null : Number(regionIdRaw);
    return {
      id: id || code,
      code: code || id,
      name: name || code || id,
      email,
      region_id: Number.isFinite(region_id) ? region_id : null,
      region: region != null && String(region).trim() ? String(region).trim() : null,
    };
  }).filter((school) => school.id || school.code);
}

/** Fetch all schools, following page_info.next_cursor until has_next_page is false. */
async function listAllSchools(accessToken, { pageSize = 100, maxPages = 500 } = {}) {
  const seen = new Set();
  const all = [];
  let cursor = null;
  let pageCount = 0;

  while (pageCount < maxPages) {
    const data = await listSchoolsPage(accessToken, { pageSize, cursor });
    const batch = parseSchoolsListResponse(data);
    batch.forEach((school) => {
      const key = String(school.code || school.id).toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      all.push(school);
    });

    pageCount += 1;
    const { nextCursor, hasNextPage } = extractPageInfo(data);

    if (hasNextPage === false) break;
    if (batch.length === 0) break;

    if (hasNextPage === true) {
      if (!nextCursor) break;
      cursor = nextCursor;
      continue;
    }

    // Legacy fallback when page_info is missing.
    const root = data?.data && typeof data.data === 'object' ? data.data : data;
    const legacyCursor = pickNested(root, ['next_page_token', 'nextPageToken', 'page_token']);
    if (batch.length < pageSize || !legacyCursor) break;
    cursor = legacyCursor;
  }

  return all.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

module.exports = {
  adminLogin,
  adminRefresh,
  adminLogout,
  instructorLogin,
  getSchoolDetails,
  getServiceAdminAccessToken,
  listSchoolsPage,
  listAllSchools,
  parseSchoolsListResponse,
  parseAdminLoginResponse,
  parseInstructorLoginResponse,
  parseSchoolDetailsResponse,
};
