import React from 'react';
import Badge from './ui/Badge';
import { assetUrl } from './shared/IssueEvidencePanel';

function EvidenceCell({ url, mime }) {
  if (!url) return <span className="text-xs text-slate-400">—</span>;
  const isVideo = mime?.startsWith('video/');
  return (
    <a
      href={assetUrl(url)}
      target="_blank"
      rel="noreferrer"
      className="text-sm font-medium text-[var(--stitch-primary)] underline underline-offset-4 decoration-[var(--stitch-primary)]/30 hover:opacity-80"
    >
      View {isVideo ? 'video' : 'photo'}
    </a>
  );
}

function DispatchStatusLine({ label, dispatch, pendingLabel }) {
  if (!dispatch && !pendingLabel) return null;
  const status = dispatch?.status || 'Dispatched';
  const category = dispatch?.category || label;
  const isDone = ['Dispatched', 'Delivery Completed', 'Received'].includes(status);
  return (
    <p className="font-medium text-[var(--stitch-text)]">
      {category} -{' '}
      <span className={isDone ? 'text-green-600' : 'text-[var(--stitch-muted)]'}>
        {dispatch ? status : pendingLabel}
      </span>
    </p>
  );
}

function workflowBadgeType(status) {
  if (status === 'Approved') return 'success';
  if (status === 'Rejected') return 'error';
  if (status === 'Pending Admin Approval') return 'pending';
  return 'warning';
}

const AuditReportDetails = ({ audit, showWorkflow = false }) => {
  if (!audit?.items?.length) {
    return <p className="text-sm text-slate-500">No kit lines in this audit.</p>;
  }

  return (
    <div className="space-y-3">
      {showWorkflow && audit.workflowStatus && (
        <div className="px-5 pt-3">
          <Badge type={workflowBadgeType(audit.workflowStatus)}>{audit.workflowStatus}</Badge>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="stitch-table-head">
            <tr>
              {['Kit', 'Warehouse', 'Available', 'Lost', 'Damaged', 'Lost Evidence', 'Damaged Evidence'].map((col) => (
                <th key={col}>{col}</th>
              ))}
              {showWorkflow && <th>Dispatch Status</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--stitch-border)] bg-white">
            {audit.items.map((item, idx) => (
              <tr key={idx} className="transition-colors hover:bg-slate-50">
                <td className="px-5 py-4 font-medium text-[var(--stitch-text)]">{item.kit?.name || 'Unknown kit'}</td>
                <td className="px-5 py-4 text-[var(--stitch-muted)]">{item.warehouseQuantity ?? '—'}</td>
                <td className="px-5 py-4 text-[var(--stitch-muted)]">{item.availableQuantity ?? 0}</td>
                <td className="px-5 py-4 text-[var(--stitch-muted)]">{item.lostQuantity ?? 0}</td>
                <td className="px-5 py-4 text-[var(--stitch-muted)]">{item.damagedQuantity ?? 0}</td>
                <td className="px-5 py-4"><EvidenceCell url={item.lostEvidenceUrl} mime={item.lostEvidenceMime} /></td>
                <td className="px-5 py-4"><EvidenceCell url={item.damagedEvidenceUrl} mime={item.damagedEvidenceMime} /></td>
                {showWorkflow && (
                  <td className="px-5 py-4 text-xs">
                    <div className="space-y-1">
                      {item.lostQuantity > 0 && (
                        <DispatchStatusLine
                          label="Audit Lost Dispatch"
                          dispatch={item.lostDispatch}
                          pendingLabel="pending dispatch"
                        />
                      )}
                      {item.damagedQuantity > 0 && (
                        <DispatchStatusLine
                          label="Audit Damaged Dispatch"
                          dispatch={item.damagedDispatch}
                          pendingLabel="pending dispatch"
                        />
                      )}
                      {!item.lostQuantity && !item.damagedQuantity && '—'}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AuditReportDetails;
