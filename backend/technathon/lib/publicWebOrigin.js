'use strict';

/**
 * Resolve the public SPA origin for building student share links.
 * Used by admin routes when minting URLs. Doc: ../../../docs/file-notes/server/lib/publicWebOrigin.js.md
 */

/**
 * Normalize to `https://host` (no path, no trailing slash).
 * @param {string} [raw]
 * @returns {string|null}
 */
function normalizePublicOrigin(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  try {
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const u = new URL(withScheme);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    const path = u.pathname && u.pathname !== '/' ? u.pathname.replace(/\/+$/, '') : '';
    return `${u.protocol}//${u.host}${path}`;
  } catch {
    return null;
  }
}

function firstForwarded(val) {
  if (!val || typeof val !== 'string') return '';
  return val.split(',')[0].trim();
}

/**
 * Infer student-facing SPA origin from the request (same host the admin used to reach the API).
 * Behind nginx/Cloud Run set `TRUST_PROXY_HOPS` (see server) so `X-Forwarded-*` / `req.secure` are correct.
 * If the API is on a different hostname than the SPA, set PUBLIC_WEB_ORIGIN instead — do not rely on inference.
 * @param {import('express').Request} req
 * @returns {string|null}
 */
function inferPublicOriginFromRequest(req) {
  if (!req || typeof req.get !== 'function') return null;
  const xfHost = firstForwarded(req.get('x-forwarded-host'));
  const host = (xfHost || req.get('host') || '').trim();
  if (!host) return null;

  const xfProto = firstForwarded(req.get('x-forwarded-proto')).toLowerCase();
  let proto = xfProto === 'http' || xfProto === 'https' ? xfProto : '';
  if (!proto) {
    if (typeof req.secure === 'boolean' && req.secure) proto = 'https';
    else {
      const p = String(req.protocol || 'http').replace(/:+$/, '');
      proto = p === 'https' ? 'https' : 'http';
    }
  }

  try {
    const u = new URL(`${proto}://${host}`);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

/**
 * Base URL for signed student form links.
 * Priority: explicit client `publicBaseUrl` → PUBLIC_WEB_ORIGIN → infer from request → dev default.
 * @param {{ publicBaseUrl?: string }} [fromClient]
 * @param {import('express').Request} [req]
 */
function resolveStudentFacingOrigin(fromClient, req) {
  const client = normalizePublicOrigin(fromClient && fromClient.publicBaseUrl);
  if (client) return client;

  const fromEnv = normalizePublicOrigin(process.env.PUBLIC_WEB_ORIGIN);
  if (fromEnv) return fromEnv;

  if (req) {
    const inferred = inferPublicOriginFromRequest(req);
    if (inferred) return inferred;
  }

  return 'http://localhost:5173';
}

module.exports = {
  normalizePublicOrigin,
  inferPublicOriginFromRequest,
  resolveStudentFacingOrigin,
};
