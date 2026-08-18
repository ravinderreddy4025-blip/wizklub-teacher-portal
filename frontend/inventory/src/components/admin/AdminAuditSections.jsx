import React from 'react';
import { ClipboardCheck, Truck } from 'lucide-react';
import Badge from '../ui/Badge';
import { assetUrl } from '../shared/IssueEvidencePanel';
import { formatSchoolDisplayName } from '../../utils/schoolName';

function workflowBadgeType(status) {
  if (status === 'Approved') return 'success';
  if (status === 'Rejected') return 'error';
  if (status === 'Pending Admin Approval') return 'pending';
  return 'warning';
}

function EmptyQueue({ icon: Icon, title, message }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#F8FAFC] text-[#F89C28] ring-1 ring-[#E5E7EB]">
        <Icon size={28} strokeWidth={1.75} />
      </div>
      <p className="font-bold text-[#1F2937]">{title}</p>
      <p className="mt-2 max-w-md text-sm text-[#6B7280]">{message}</p>
    </div>
  );
}

export function AdminAuditReviewTable({ audits, onReview, emptyMessage, emptyTitle, emptyIcon }) {
  if (!audits?.length) {
    return (
      <EmptyQueue
        icon={emptyIcon || ClipboardCheck}
        title={emptyTitle || "Everything's up to date"}
        message={emptyMessage || 'Nothing to review.'}
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-[#E5E7EB] bg-[#F8FAFC]">
            {['School', 'Month', 'Variance', 'Workflow', 'Submitted', 'Action'].map((col) => (
              <th
                key={col}
                className={`px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-[#6B7280] ${
                  col === 'Action' ? 'text-right' : ''
                }`}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E5E7EB]">
          {audits.map((audit) => (
            <tr key={audit._id} className={`transition hover:bg-[#F8FAFC] ${audit.status === 'Mismatch' ? 'bg-[#EF4444]/5' : ''}`}>
              <td className="px-5 py-3.5 font-bold text-[#1F2937]">
                {formatSchoolDisplayName(audit.school?.name)}
              </td>
              <td className="px-5 py-3.5 font-mono text-sm text-[#6B7280]">{audit.month}</td>
              <td className="px-5 py-3.5">
                <Badge type={audit.status === 'Mismatch' ? 'error' : 'success'}>{audit.status}</Badge>
              </td>
              <td className="px-5 py-3.5">
                <Badge type={workflowBadgeType(audit.workflowStatus)}>
                  {audit.workflowStatus || 'Pending AM Approval'}
                </Badge>
              </td>
              <td className="px-5 py-3.5 text-sm text-[#6B7280]">
                {new Date(audit.createdAt).toLocaleDateString()}
              </td>
              <td className="px-5 py-3.5 text-right">
                <button
                  type="button"
                  onClick={() => onReview(audit)}
                  className="rounded-lg bg-[#F89C28] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#E88914]"
                >
                  Review
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function adminLineAmReady(audit, lineType) {
  const key = lineType === 'lost' ? 'lostAmStatus' : 'damagedAmStatus';
  const stored = audit[key];
  if (stored === 'Approved') return true;
  if (stored === 'Rejected' || stored === 'Pending') return false;
  return audit.workflowStatus === 'Pending Admin Approval' || audit.workflowStatus === 'Approved';
}

export function AdminAuditReplacementList({
  audits,
  lineType,
  onReview,
  emptyMessage,
  mode = 'all',
}) {
  const groups = audits
    .filter((audit) => {
      if (mode === 'pendingReview') {
        return audit.workflowStatus === 'Pending Admin Approval' && adminLineAmReady(audit, lineType);
      }
      if (mode === 'dispatch') {
        return audit.workflowStatus === 'Approved' && adminLineAmReady(audit, lineType);
      }
      return true;
    })
    .map((audit) => ({
      audit,
      items: (audit.items || []).filter((item) => {
        const qty = lineType === 'lost' ? item.lostQuantity : item.damagedQuantity;
        if (!qty || qty <= 0) return false;
        if (mode === 'dispatch') {
          const dispatch = lineType === 'lost' ? item.lostDispatch : item.damagedDispatch;
          return !dispatch;
        }
        return true;
      }),
    }))
    .filter((group) => group.items.length > 0);

  if (groups.length === 0) {
    return (
      <EmptyQueue
        icon={Truck}
        title="Clear queue"
        message={emptyMessage || 'Nothing waiting for dispatch.'}
      />
    );
  }

  return (
    <div className="divide-y divide-[#E5E7EB]">
      {groups.map(({ audit, items }) => (
        <div key={audit._id} className="space-y-4 p-5">
          <div className="flex flex-wrap justify-between gap-3">
            <div>
              <p className="font-bold text-[#1F2937]">{formatSchoolDisplayName(audit.school?.name)}</p>
              <p className="text-xs text-[#6B7280]">
                Monthly audit · {audit.month} · submitted {new Date(audit.createdAt).toLocaleDateString()}
              </p>
              <Badge type={workflowBadgeType(audit.workflowStatus)} className="mt-2">
                {audit.workflowStatus}
              </Badge>
            </div>
            <button
              type="button"
              onClick={() => onReview(audit)}
              className="rounded-lg bg-[#F89C28] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#E88914]"
            >
              {audit.workflowStatus === 'Pending Admin Approval' ? 'Review & approve' : 'Open dispatch'}
            </button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-[#E5E7EB]">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-[#F8FAFC]">
                <tr>
                  {['Kit', lineType === 'lost' ? 'Lost qty' : 'Damaged qty', 'Dispatch', 'Evidence'].map((col) => (
                    <th key={col} className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                {items.map((item, idx) => {
                  const qty = lineType === 'lost' ? item.lostQuantity : item.damagedQuantity;
                  const evidenceUrl = lineType === 'lost' ? item.lostEvidenceUrl : item.damagedEvidenceUrl;
                  const dispatch = lineType === 'lost' ? item.lostDispatch : item.damagedDispatch;
                  return (
                    <tr key={idx}>
                      <td className="px-4 py-2.5 font-semibold text-[#1F2937]">{item.kit?.name || 'Kit'}</td>
                      <td className="px-4 py-2.5 font-bold">x{qty}</td>
                      <td className="px-4 py-2.5">
                        {dispatch ? (
                          <span className="text-xs font-semibold text-[#22C55E]">Dispatched</span>
                        ) : (
                          <span className="text-xs font-semibold text-[#F59E0B]">Pending dispatch</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {evidenceUrl ? (
                          <a
                            href={assetUrl(evidenceUrl)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-semibold text-[#F89C28] hover:underline"
                          >
                            View evidence
                          </a>
                        ) : (
                          <span className="text-xs text-[#9CA3AF]">—</span>
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
}
