import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const Modal = ({ isOpen, onClose, title, children, footer, className = '', bodyClassName = '', dismissible = true }) => {
  useEffect(() => {
    if (!isOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] overflow-y-auto bg-[#1F2937]/45 backdrop-blur-md"
      onClick={dismissible ? onClose : undefined}
      role="presentation"
    >
      <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
        <div
          className={`flex w-full max-w-lg max-h-[min(90vh,calc(100dvh-2rem))] flex-col overflow-hidden border border-[var(--stitch-border)] bg-white animate-slide-up ${className}`}
          style={{ borderRadius: 'var(--stitch-card-radius)', boxShadow: '0 20px 60px rgba(248, 156, 40, 0.18)' }}
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--stitch-border)] px-6 py-4">
            <h2 className="font-heading text-xl font-bold text-[var(--stitch-text)]">{title}</h2>
            {dismissible ? (
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-2 text-[var(--stitch-muted)] transition-colors hover:bg-[var(--stitch-canvas)] hover:text-[var(--stitch-text)]"
              >
                <X size={20} />
              </button>
            ) : (
              <span className="w-9" aria-hidden="true" />
            )}
          </div>
          <div className={`min-h-0 overflow-y-auto p-6 ${bodyClassName}`}>{children}</div>
          {footer ? (
            <div className="shrink-0 border-t border-[var(--stitch-border)] bg-[var(--stitch-canvas)]/80 p-6">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default Modal;
