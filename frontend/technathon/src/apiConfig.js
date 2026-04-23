// Central API URL config for fetch() calls. Vite injects import.meta.env at build time.

/** Remove trailing slashes so we can safely concatenate paths. */
const trimBase = (s) => String(s || '').replace(/\/+$/, '');

/** SPA path segment without slashes (e.g. "" or "technathon"). */
const appSegment = trimBase(import.meta.env.BASE_URL || '').replace(/^\/+|\/+$/g, '') || '';

const devApiPrefix = appSegment ? `/${appSegment}` : '';

/**
 * In dev, prefer 127.0.0.1 over "localhost" for uploads on Windows (IPv6 ::1 vs IPv4 issues with large multipart).
 * @param {string} url
 */
function devUploadBase(url) {
  const t = trimBase(url) // Normalize requested URL string
  if (!t) return '' // No URL configured → caller will fall back to default
  return t.replace(/^http:\/\/localhost\b/i, 'http://127.0.0.1').replace(/^https:\/\/localhost\b/i, 'https://127.0.0.1') // Swap host only
}

/**
 * Base URL for JSON API calls (same-origin prefix or absolute URL).
 * DEV: "" or "/technathon" so fetch hits Vite proxy.
 * PROD: VITE_API_URL if set, else "" or "/technathon" for same-host gateway builds.
 */
export const API_BASE = import.meta.env.DEV
  ? devApiPrefix
  : trimBase(import.meta.env.VITE_API_URL) || devApiPrefix

/** Shorter hint string embedded in user-facing network error messages. */
export const API_BASE_HINT = import.meta.env.DEV
  ? (API_BASE ? `${API_BASE} (Vite proxies …/api to :5000)` : 'http://127.0.0.1:5000 (Vite proxies /api here; uploads use direct API URL)')
  : API_BASE

/**
 * Multipart uploads in dev always hit the API server directly (not through Vite).
 * PROD: same as API_BASE (typically same-origin /technathon with gateway).
 */
export const UPLOAD_API_BASE = import.meta.env.DEV
  ? (devUploadBase(import.meta.env.VITE_UPLOAD_API_URL || import.meta.env.VITE_API_URL) || 'http://127.0.0.1:5000')
  : API_BASE

/** Hint text when an upload fails for network reasons. */
export const UPLOAD_API_HINT = UPLOAD_API_BASE || 'http://127.0.0.1:5000'

/** Full public SPA origin + optional path (for student link generation). */
export function publicSpaBaseUrl() {
  if (typeof window === 'undefined') return undefined
  return appSegment ? `${window.location.origin}/${appSegment}` : window.location.origin
}
