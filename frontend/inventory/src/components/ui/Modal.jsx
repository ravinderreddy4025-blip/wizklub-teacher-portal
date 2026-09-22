import React, { useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/*
 * IL dialog: radius 24, 24px padding, 20/600 title, footer actions right-aligned.
 * < 640px it becomes a bottom sheet (top corners rounded, full width).
 */
const Modal = ({ isOpen, onClose, title, children, footer, className = '', bodyClassName = '', dismissible = true }) => {
  const titleId = useId();

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
      className="inv-portal fixed inset-0 z-[100] overflow-y-auto bg-[rgba(8,14,20,0.5)] font-ui"
      onClick={dismissible ? onClose : undefined}
      role="presentation"
    >
      <div className="flex min-h-full items-end justify-center sm:items-center sm:p-6">
        <div
          className={`flex w-full max-w-lg max-h-[92dvh] flex-col overflow-hidden rounded-t-[24px] bg-white shadow-glass-lg animate-slide-up sm:max-h-[min(90vh,calc(100dvh-3rem))] sm:rounded-[24px] ${className}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-3 pt-5 sm:px-6 sm:pt-6">
            <h2 id={titleId} className="min-w-0 pt-1.5 text-lg font-semibold leading-7 text-wk-ink sm:text-xl">{title}</h2>
            {dismissible ? (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="-mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-wk-body transition-colors hover:bg-wk-mist hover:text-wk-ink"
              >
                <X size={20} aria-hidden />
              </button>
            ) : (
              <span className="w-9" aria-hidden="true" />
            )}
          </div>
          <div className={`min-h-0 overflow-y-auto px-5 pb-6 pt-2 sm:px-6 ${bodyClassName}`}>{children}</div>
          {footer ? (
            <div className="shrink-0 border-t border-wk-line bg-white px-5 py-4 sm:px-6">
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
