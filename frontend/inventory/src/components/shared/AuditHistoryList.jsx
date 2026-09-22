import React from 'react';
import Badge from '../ui/Badge';
import AuditReportDetails from '../AuditReportDetails';
import { formatAuditMonthLabel, groupAuditsByMonth } from '../../utils/auditMonth';

function workflowBadgeType(status) {
  if (status === 'Approved') return 'success';
  if (status === 'Rejected') return 'error';
  if (status === 'Pending Admin Approval') return 'pending';
  return 'warning';
}

export default function AuditHistoryList({
  audits = [],
  emptyMessage = 'No audit reports found.',
  showSchool = false,
  variant = 'default',
}) {
  const reportsByMonth = groupAuditsByMonth(audits);
  const isSchool = variant === 'school';

  if (!reportsByMonth.length) {
    return <p className="inv-empty inv-empty__text">{emptyMessage}</p>;
  }

  return (
    <div className={isSchool ? 'space-y-4' : 'divide-y divide-slate-100'}>
      {reportsByMonth.map(([month, monthAudits]) => (
        <div key={month} className={isSchool ? 'space-y-4' : 'space-y-4 p-5'}>
          {!isSchool && (
            <h4 className="border-b border-slate-100 pb-2 text-sm font-bold normal-case tracking-normal text-slate-700">
              {formatAuditMonthLabel(month)}
            </h4>
          )}
          {monthAudits.map((audit) => (
            <div
              key={audit._id}
              className={
                isSchool
                  ? 'overflow-hidden rounded-xl border border-wk-line shadow-sm'
                  : `rounded-xl border p-4 ${
                    audit.status === 'Mismatch'
                      ? 'border-error-200 bg-error-50/20'
                      : 'border-slate-200 bg-white'
                  }`
              }
            >
              <div
                className={
                  isSchool
                    ? 'flex flex-wrap items-center justify-between gap-4 border-b border-wk-line bg-slate-50/50 px-6 py-4'
                    : 'mb-4 flex flex-wrap items-center justify-between gap-3'
                }
              >
                <div className="space-y-1">
                  {isSchool ? (
                    <>
                      <h3 className="text-sm font-medium text-wk-muted">
                        {formatAuditMonthLabel(audit.month || month)}
                      </h3>
                      <p className="text-xs text-wk-muted">
                        Submitted {new Date(audit.createdAt).toLocaleDateString()}
                      </p>
                    </>
                  ) : (
                    <>
                      {showSchool && (
                        <p className="font-bold text-slate-900">{audit.school?.name || 'School'}</p>
                      )}
                      <p className="text-xs text-slate-500">
                        Submitted {new Date(audit.createdAt).toLocaleDateString()}
                      </p>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge type={audit.status === 'Mismatch' ? 'error' : 'success'}>{audit.status}</Badge>
                  <Badge type={workflowBadgeType(audit.workflowStatus)}>
                    {audit.workflowStatus || 'Pending AM Approval'}
                  </Badge>
                </div>
              </div>
              <div className={isSchool ? '' : undefined}>
                <AuditReportDetails audit={audit} showWorkflow />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
