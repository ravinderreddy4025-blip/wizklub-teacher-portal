import { resolveApiBase } from '@inventory/utils/api';

/** Map stored `/api/media/...` and `/uploads/...` paths onto the current portal API base. */
export function resolveMediaUrl(path, apiBase, origin = '') {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const base = String(apiBase || '').replace(/\/$/, '');
  if (normalized.startsWith('/api/')) {
    return `${base}${normalized.slice(4)}`;
  }
  if (normalized.startsWith('/uploads/')) {
    const site = base.replace(/\/api$/i, '').replace(/\/inventory-api$/i, '');
    return `${site}${normalized}`;
  }
  return `${origin}${normalized}`;
}

export function assetUrl(path) {
  const result = resolveMediaUrl(path, resolveApiBase());
  // #region agent log
  const normalized = path && path.startsWith('/') ? path : `/${path || ''}`;
  if (typeof window !== 'undefined' && (normalized.startsWith('/api/media') || normalized.startsWith('/uploads/'))) {
    fetch('http://127.0.0.1:7494/ingest/c666538d-d52a-4b19-9d3b-5c52069c7f45', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '4fc0ec' },
      body: JSON.stringify({
        sessionId: '4fc0ec',
        runId: 'post-fix',
        hypothesisId: 'H',
        location: 'mediaAssets.js:assetUrl',
        message: 'resolved media src',
        data: { stored: normalized, src: result, href: window.location.pathname },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }
  // #endregion
  return result;
}
