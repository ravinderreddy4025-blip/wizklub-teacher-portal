import React from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from '../../utils/routes';

const TYPES = [
  { key: 'mismatchKits', label: 'Mismatch', to: ROUTES.am.approvalsMismatch },
  { key: 'notReceivedKits', label: 'Not Received', to: ROUTES.am.approvalsMissing },
  { key: 'damagedKits', label: 'Damaged', to: ROUTES.am.approvalsDamaged },
  { key: 'lostKits', label: 'Lost', to: ROUTES.am.approvalsLost },
];

export default function AmOpenIssues({ current }) {
  const openIssues = current?.openIssues || {};
  const byType = openIssues.byType || {};

  return (
    <section className="rounded-2xl bg-white shadow-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-wk-ink">Open issues</h2>
          <p className="mt-0.5 text-[13px] text-wk-body">
            Affected kits on open claims — not a breakdown of Outstanding.
          </p>
        </div>
        <Link to={ROUTES.am.approvals} className="text-xs font-semibold text-wk-orange-text hover:underline">
          View approvals
        </Link>
      </div>
      <p className="mt-3 text-sm font-semibold text-wk-ink">
        {openIssues.claims ?? 0} claims
        <span className="ml-2 font-normal text-wk-muted">{openIssues.kitsAffected ?? 0} kits affected</span>
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {TYPES.map((type) => (
          <Link
            key={type.key}
            to={type.to}
            className="rounded-xl border border-wk-line bg-white p-4 transition hover:border-wk-peach-2 hover:shadow-sm"
          >
            <p className="text-sm font-medium text-wk-muted">{type.label}</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-wk-ink">{byType[type.key] ?? 0}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
