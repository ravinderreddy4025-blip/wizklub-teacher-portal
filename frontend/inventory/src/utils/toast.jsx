import React, { useState } from 'react';
import { toast as toastify } from 'react-toastify';

function ConfirmToastContent({ message, closeToast, resolve }) {
  return (
    <div className="min-w-[240px]">
      <p className="mb-3 text-sm font-medium text-wk-ink">{message}</p>
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          className="min-h-[40px] rounded-full border border-wk-navy bg-white px-4 text-sm font-semibold text-wk-navy hover:bg-wk-cream"
          onClick={() => {
            resolve(false);
            closeToast();
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          className="min-h-[40px] rounded-full bg-wk-orange px-4 text-sm font-bold text-wk-navy shadow-brand hover:bg-wk-orange-hover"
          onClick={() => {
            resolve(true);
            closeToast();
          }}
        >
          Confirm
        </button>
      </div>
    </div>
  );
}

function ApprovalNotesToastContent({ action, kind, closeToast, resolve }) {
  const [notes, setNotes] = useState('');
  const isApprove = action === 'approve';
  const isClarify = action === 'clarify';

  const subjectByKind = {
    receipt: 'receipt issue',
    replacement: 'replacement request',
    'admin-receipt': 'receipt issue',
    'admin-replacement': 'replacement request',
  };
  const subject = subjectByKind[kind] || 'request';

  const workflowHint = isClarify
    ? 'The school and Account Manager will be asked to provide more details.'
    : isApprove
      ? kind === 'receipt' || kind === 'admin-receipt'
        ? kind === 'admin-receipt'
          ? 'Approval does not ship. Warehouse stock stays unchanged until you ship the replacement with a tracking ID.'
          : 'After your approval, this is sent to Admin. Once Admin approves, they still need to ship the replacement separately.'
        : kind === 'admin-replacement'
          ? 'Confirm approval, then ship the replacement with a tracking ID when ready.'
          : 'After your approval, this is sent to Admin. Once Admin authorizes it, the replacement will be dispatched.'
      : null;

  const title = isClarify
    ? 'Request clarification'
    : `${isApprove ? 'Approve' : 'Reject'} ${subject}`;

  const finish = (confirmed) => {
    resolve({ confirmed, notes: notes.trim() });
    closeToast();
  };

  return (
    <div className="min-w-[300px] max-w-md">
      <p className="mb-1 text-base font-semibold text-wk-ink">{title}</p>
      {workflowHint && (
        <p className="mb-3 text-[13px] leading-relaxed text-wk-body">{workflowHint}</p>
      )}
      <label htmlFor="approval-notes" className="mb-1 block text-[13px] font-medium text-wk-body">
        Notes (optional)
      </label>
      <textarea
        id="approval-notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
        className="mb-3 w-full resize-none rounded-xl border border-wk-control px-3 py-2 text-sm text-wk-ink focus:border-wk-orange-text focus:outline-none focus:ring-1 focus:ring-wk-orange-text"
        placeholder="Add a note for the record…"
      />
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          className="min-h-[40px] rounded-full border border-wk-navy bg-white px-4 text-sm font-semibold text-wk-navy hover:bg-wk-cream"
          onClick={() => finish(false)}
        >
          Cancel
        </button>
        <button
          type="button"
          className={`min-h-[40px] rounded-full px-4 text-sm font-bold ${
            isApprove || isClarify
              ? 'bg-wk-orange text-wk-navy shadow-brand hover:bg-wk-orange-hover'
              : 'bg-error-600 text-white hover:bg-error-800'
          }`}
          onClick={() => finish(true)}
        >
          {isClarify ? 'Send' : isApprove ? 'Approve' : 'Reject'}
        </button>
      </div>
    </div>
  );
}

function confirm(message) {
  return new Promise((resolve) => {
    toastify(
      ({ closeToast }) => (
        <ConfirmToastContent message={message} closeToast={closeToast} resolve={resolve} />
      ),
      {
        autoClose: false,
        closeOnClick: false,
        closeButton: true,
        draggable: false,
        icon: false,
      }
    );
  });
}

function approvalNotes({ action, kind = 'receipt' }) {
  return new Promise((resolve) => {
    toastify(
      ({ closeToast }) => (
        <ApprovalNotesToastContent
          action={action}
          kind={kind}
          closeToast={closeToast}
          resolve={resolve}
        />
      ),
      {
        autoClose: false,
        closeOnClick: false,
        closeButton: true,
        draggable: false,
        icon: false,
        className: 'approval-notes-toast',
      }
    );
  });
}

const toast = {
  success: (message) => toastify.success(message),
  error: (message) => toastify.error(message),
  info: (message) => toastify.info(message),
  warning: (message) => toastify.warning(message),
  confirm,
  approvalNotes,
};

export default toast;
