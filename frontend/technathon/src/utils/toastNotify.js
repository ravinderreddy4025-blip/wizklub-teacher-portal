/** Toast + network error message helpers. Doc: ../../../docs/file-notes/client/src/utils/toastNotify.js.md */
import { toast } from 'react-toastify';

/**
 * Turn browser fetch errors into actionable copy (Failed to fetch → API URL / server hint).
 */
export function formatNetworkError(
  message,
  apiBase,
  actionPhrase = 'reach the server',
  { isUpload = false } = {},
) {
  const m = (message || '').trim() || 'Something went wrong';
  const lower = m.toLowerCase();
  if (
    lower === 'failed to fetch'
    || lower.includes('networkerror')
    || lower.includes('network request failed')
    || lower.includes('load failed')
    || lower.includes('ecconnrefused')
  ) {
    const envHint = isUpload
      ? 'VITE_UPLOAD_API_URL or VITE_API_URL points to that API (restart Vite after changing .env).'
      : 'VITE_API_URL matches it (then restart Vite).';
    return `Could not ${actionPhrase}. Check that the API is running at ${apiBase} and that ${envHint}`;
  }
  return m;
}

export function notifyError(message, options = {}) {
  toast.error(message, { ...options });
}

export function notifySuccess(message, options = {}) {
  toast.success(message, { autoClose: 2800, ...options });
}

export function notifyUploadError(err, apiBase) {
  const raw = err?.message || String(err);
  toast.error(formatNetworkError(raw, apiBase, 'upload your file', { isUpload: true }), {
    toastId: 'upload-error',
  });
}

export function notifyCopyError() {
  toast.error('Could not copy to clipboard. Check site permissions or copy the link manually.', {
    toastId: 'copy-error',
  });
}
