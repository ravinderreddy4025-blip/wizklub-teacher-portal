import React from 'react';
import { createRoot } from 'react-dom/client';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const PO_FONT = "'Poppins', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

const el = document.getElementById('toast-root');
if (el) {
  const root = createRoot(el);
  root.render(
    <ToastContainer
      className="po-toasts"
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
      theme="light"
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
        const primaryBg = variant === 'danger' ? '#b42323' : '#ff8c2b';
        const primaryColor = variant === 'danger' ? '#fff' : '#02344f';
        return (
          <div
            style={{
              padding: '2px 4px',
              fontFamily: PO_FONT,
              minWidth: 240,
              maxWidth: 400,
              color: '#02344f',
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
                  minHeight: 44,
                  padding: '0 16px',
                  borderRadius: 9999,
                  border: '1px solid #02344f',
                  background: '#fff',
                  color: '#02344f',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 14,
                  fontFamily: PO_FONT,
                }}
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={() => finish(true)}
                style={{
                  minHeight: 44,
                  padding: '0 16px',
                  borderRadius: 9999,
                  border: 'none',
                  background: primaryBg,
                  color: primaryColor,
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: 14,
                  fontFamily: PO_FONT,
                  boxShadow: variant === 'danger' ? 'none' : '0 3px 0 #d9661a',
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
