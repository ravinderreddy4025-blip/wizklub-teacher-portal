import React from 'react';
import { createRoot } from 'react-dom/client';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const el = document.getElementById('toast-root');
if (el) {
  const root = createRoot(el);
  root.render(
    <ToastContainer
      position="bottom-right"
      autoClose={3200}
      limit={5}
      hideProgressBar={false}
      newestOnTop
      closeOnClick
      rtl={false}
      pauseOnFocusLoss
      draggable
      pauseOnHover
      theme="colored"
    />
  );
}

/**
 * Yes/No dialogue using a non-auto-closing custom toast (Toastify-only UI).
 * @param {string} message
 * @param {{ confirmLabel?: string, cancelLabel?: string, variant?: 'primary' | 'danger' }} [options]
 * @returns {Promise<boolean>}
 */
function confirmDialog(message, options = {}) {
  const {
    confirmLabel = 'OK',
    cancelLabel = 'Cancel',
    variant = 'primary',
  } = options;

  return new Promise((resolve) => {
    let settled = false;
    toast(
      ({ closeToast }) => {
        const finish = (value) => {
          if (settled) return;
          settled = true;
          closeToast();
          resolve(value);
        };
        return (
          <div
            style={{
              padding: '2px 4px',
              fontFamily: "'Nunito', 'Segoe UI', system-ui, -apple-system, sans-serif",
              minWidth: 240,
              maxWidth: 400,
            }}
          >
            <div
              style={{
                marginBottom: 14,
                fontSize: 14,
                lineHeight: 1.45,
                fontWeight: 600,
              }}
            >
              {message}
            </div>
            <div
              style={{
                display: 'flex',
                gap: 10,
                justifyContent: 'flex-end',
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                onClick={() => finish(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: '2px solid rgba(255,255,255,0.7)',
                  background: 'transparent',
                  color: 'inherit',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={() => finish(true)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: variant === 'danger' ? '#b71c1c' : '#0c447c',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: 13,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                }}
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        );
      },
      {
        autoClose: false,
        closeOnClick: false,
        draggable: false,
        closeButton: false,
        icon: false,
        type: 'warning',
        position: 'top-center',
      }
    );
  });
}

window.poToast = {
  success: (msg, opts) => toast.success(msg, opts),
  error: (msg, opts) => toast.error(msg, opts),
  info: (msg, opts) => toast.info(msg, opts),
  warning: (msg, opts) => toast.warning(msg, opts),
  default: (msg, opts) => toast(msg, opts),
  confirm: confirmDialog,
};
