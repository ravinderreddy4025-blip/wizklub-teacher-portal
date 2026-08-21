import React, { useState } from 'react';
import { toast as toastify } from 'react-toastify';

function ConfirmToastContent({ message, closeToast, resolve }) {
  return (
    <div className="min-w-[240px]">
      <p className="text-sm font-medium text-slate-800 mb-3">{message}</p>
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
          onClick={() => {
            resolve(false);
            closeToast();
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-brand-primary text-white hover:opacity-90"
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
      <p className="text-sm font-bold text-slate-900 mb-1">{title}</p>
      {workflowHint && (
        <p className="text-xs text-slate-600 mb-3 leading-relaxed">{workflowHint}</p>
      )}
      <label htmlFor="approval-notes" className="block text-xs font-semibold text-slate-500 mb-1">
        Notes (optional)
      </label>
      <textarea
        id="approval-notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 mb-3 focus:outline-none focus:ring-2 focus:ring-brand-primary/40 resize-none"
        placeholder="Add a note for the record…"
      />
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
          onClick={() => finish(false)}
        >
          Cancel
        </button>
        <button
          type="button"
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg text-white hover:opacity-90 ${
            isApprove || isClarify ? 'bg-brand-primary' : 'bg-error-500'
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
