import React from 'react';
import { clsx } from 'clsx';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import IssueEvidencePanel, { assetUrl } from '../shared/IssueEvidencePanel';
import { IssueShipmentDetailsCell } from '../shared/DispatchRedispatchCells';
import { formatSchoolDisplayName } from '../../utils/schoolName';

const ISSUE_TYPE_BADGE = {
  'Missing Product': 'warning',
  'Damaged Product': 'error',
  'Quantity Mismatch': 'info',
  'Shipment Not Received': 'error',
};

const ISSUE_TYPE_LABEL = {
  'Missing Product': 'Missing product',
  'Damaged Product': 'Damaged product',
  'Quantity Mismatch': 'Quantity mismatch',
  'Shipment Not Received': 'Shipment not received',
};

const ReceiptIssueTable = ({ issues, onAction, emptyMessage, showCategory = false }) => (
  <div className="overflow-x-auto">
    <table className="clean-table">
      <thead>
        <tr>
          <th>School / Kit</th>
          {showCategory && <th>Category</th>}
          <th>Dispatch ID</th>
          <th>Shipment details</th>
          <th>Evidence</th>
          <th className="text-right">Actions</th>
        </tr>
      </thead>
      <tbody>
        {issues.map((issue) => (
          <tr key={issue._id}>
            <td>
              <p className="font-bold text-slate-900">{issue.kit?.name}</p>
              <p className="text-xs text-slate-500">{formatSchoolDisplayName(issue.school?.name)}</p>
            </td>
            {showCategory && (
              <td>
                <Badge type={ISSUE_TYPE_BADGE[issue.issueType] || 'pending'}>
                  {ISSUE_TYPE_LABEL[issue.issueType] || issue.issueType}
                </Badge>
              </td>
            )}
            <td className="font-mono text-xs">{issue.sourceDispatchRef || issue.dispatch?.dispatchId || '—'}</td>
            <td><IssueShipmentDetailsCell issue={issue} /></td>
            <td className="max-w-[200px]">
              <p className="text-xs text-slate-600 mb-2">{issue.damageDescription || issue.remarks || '—'}</p>
              <IssueEvidencePanel issue={issue} compact />
            </td>
            <td className="text-right">
              <div className="flex justify-end gap-2">
                <Button variant="danger" className="text-xs py-1.5 px-3" onClick={() => onAction(issue._id, 'reject')}>Reject</Button>
                <Button variant="gradient" className="text-xs py-1.5 px-3" onClick={() => onAction(issue._id, 'approve')}>Approve</Button>
              </div>
            </td>
          </tr>
        ))}
        {issues.length === 0 && (
          <tr><td colSpan={showCategory ? 6 : 5} className="text-center py-10 text-slate-500">{emptyMessage}</td></tr>
        )}
      </tbody>
    </table>
  </div>
);

const ReplacementRequestTable = ({ requests, onAction, emptyMessage }) => (
  <div className="overflow-x-auto">
    <table className="clean-table">
      <thead>
        <tr>
          <th>Kit / School</th>
          <th>Quantity</th>
          <th>Explanation</th>
          <th className="text-right">Actions</th>
        </tr>
      </thead>
      <tbody>
        {requests.map((req) => (
          <tr key={req._id}>
            <td>
              <p className="font-bold text-slate-900">{req.kit?.name}</p>
              <p className="text-xs text-slate-500 mt-1">{formatSchoolDisplayName(req.school?.name)}</p>
            </td>
            <td className="font-medium text-slate-800 text-base">x{req.quantity}</td>
            <td className="text-slate-600 max-w-sm">
              <p className="line-clamp-2">{req.reasonDetails}</p>
            </td>
            <td className="text-right">
              <div className="flex justify-end gap-3 inline-flex">
                <Button variant="danger" className="text-xs py-1.5 px-4" onClick={() => onAction(req._id, 'reject')}>Reject</Button>
                <Button variant="gradient" className="text-xs py-1.5 px-4" onClick={() => onAction(req._id, 'approve')}>Approve</Button>
              </div>
            </td>
          </tr>
        ))}
        {requests.length === 0 && (
          <tr><td colSpan="4" className="text-center py-10 text-slate-500">{emptyMessage}</td></tr>
        )}
      </tbody>
    </table>
  </div>
);

const AmAuditApprovalList = ({
  audits,
  lineType,
  onAuditAction,
  emptyMessage,
}) => {
  const groups = audits
    .filter((audit) => {
      const statusKey = lineType === 'lost' ? 'lostAmStatus' : 'damagedAmStatus';
      const stored = audit[statusKey];
      if (stored === 'Pending') return true;
      if (stored === 'Approved' || stored === 'Rejected') return false;
      // Legacy: whole audit still pending AM and this line type has qty
      if (audit.workflowStatus !== 'Pending AM Approval') return false;
      return (audit.items || []).some((item) =>
        lineType === 'lost' ? item.lostQuantity > 0 : item.damagedQuantity > 0
      );
    })
    .map((audit) => ({
      audit,
      items: (audit.items || []).filter((item) =>
        lineType === 'lost' ? item.lostQuantity > 0 : item.damagedQuantity > 0
      ),
    }))
    .filter((group) => group.items.length > 0);

  if (groups.length === 0) {
    return <p className="inv-empty inv-empty__text">{emptyMessage}</p>;
  }

  const approveLabel = lineType === 'lost' ? 'Approve lost kits' : 'Approve damaged kits';
  const rejectLabel = lineType === 'lost' ? 'Reject lost kits' : 'Reject damaged kits';

  return (
    <div className="divide-y divide-slate-100">
      {groups.map(({ audit, items }) => (
        <div key={`${audit._id}-${lineType}`} className="p-5 space-y-4">
          <div className="flex flex-wrap justify-between gap-3">
            <div>
              <p className="font-bold text-slate-900">{formatSchoolDisplayName(audit.school?.name)}</p>
              <p className="text-xs text-slate-500">
                Monthly audit · {audit.month} · submitted {new Date(audit.createdAt).toLocaleDateString()}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Approving here only decides the {lineType} kits — the other category stays separate.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="gradient" className="text-xs py-1.5" onClick={() => onAuditAction(audit._id, 'approve', lineType)}>
                {approveLabel}
              </Button>
              <Button variant="danger" className="text-xs py-1.5" onClick={() => onAuditAction(audit._id, 'reject', lineType)}>
                {rejectLabel}
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="clean-table m-0 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th>Kit</th>
                  <th>{lineType === 'lost' ? 'Lost qty' : 'Damaged qty'}</th>
                  <th>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const qty = lineType === 'lost' ? item.lostQuantity : item.damagedQuantity;
                  const evidenceUrl = lineType === 'lost' ? item.lostEvidenceUrl : item.damagedEvidenceUrl;
                  return (
                    <tr key={idx}>
                      <td className="font-semibold text-slate-900">{item.kit?.name || 'Kit'}</td>
                      <td className="font-medium">x{qty}</td>
                      <td>
                        {evidenceUrl ? (
                          <a href={assetUrl(evidenceUrl)} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brand-primary hover:underline">
                            View evidence
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
};

const AmApprovalTile = ({
  title,
  subtitle,
  count,
  icon,
  selected = false,
  onClick,
  accentClass = 'border-t-wk-orange',
}) => {
  const Icon = icon;
  const hasPending = count > 0;
  const displayCount = hasPending ? String(count).padStart(2, '0') : '0';
  const ariaLabel = `${title}. ${hasPending ? `${count} pending` : 'No pending items'}. ${subtitle}`;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={clsx(
        'stitch-card flex min-h-[132px] w-full cursor-pointer flex-col border-t-[3px] p-4 text-left transition-all duration-200',
        'hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-wk-orange-text/40',
        accentClass,
        selected && 'ring-2 ring-wk-orange-text/40 shadow-md',
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div
          className={clsx(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            hasPending ? 'bg-wk-peach text-wk-orange-text' : 'bg-wk-cream text-wk-muted',
          )}
        >
          <Icon size={18} strokeWidth={2} />
        </div>
        <span
          className={clsx('text-xl font-semibold', hasPending ? 'text-wk-ink' : 'text-wk-muted')}
          aria-hidden="true"
        >
          {displayCount}
        </span>
      </div>
      <h3 className="text-sm font-bold leading-snug text-wk-ink">{title}</h3>
      <p className="mt-1.5 flex-1 text-xs leading-relaxed text-wk-muted">{subtitle}</p>      <p
        className={clsx(
          'mt-4 text-sm font-medium',
          hasPending ? 'text-wk-orange-text' : 'text-wk-muted',
        )}
      >
        {hasPending ? `${count} pending — open` : 'Click to view'}
      </p>
    </button>
  );
};

const AmApprovalSection = ({
  title,
  subtitle,
  count,
  children,
  className = '',
}) => {
  const hasPending = count > 0;

  return (
    <Card
      noPadding
      className={`mb-8 overflow-hidden ${hasPending ? 'approval-section-pending' : ''} ${className}`}
    >
      <div className={`px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 ${hasPending ? 'bg-warning-50/60' : 'bg-slate-50/80'}`}>
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 flex-wrap">
            {title}
            {hasPending && (
              <span className="approval-count-badge">{count}</span>
            )}
          </h3>
          {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
        </div>
        {hasPending && (
          <Badge type="warning">{count} pending</Badge>
        )}
      </div>
      {children}
    </Card>
  );
};

export { ReceiptIssueTable, ReplacementRequestTable, AmApprovalSection, AmApprovalTile, AmAuditApprovalList };
