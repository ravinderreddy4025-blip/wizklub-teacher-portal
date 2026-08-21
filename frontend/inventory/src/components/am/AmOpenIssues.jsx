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
    <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#F89C28]">Open issues</p>
          <p className="mt-1 text-[12px] text-[#6B7280]">
            Affected kits on open claims — not a breakdown of Outstanding.
          </p>
        </div>
        <Link to={ROUTES.am.approvals} className="text-xs font-semibold text-[#F89C28] hover:underline">
          View approvals
        </Link>
      </div>
      <p className="mt-3 text-sm font-semibold text-[#1F2937]">
        {openIssues.claims ?? 0} claims
        <span className="ml-2 font-normal text-[#6B7280]">{openIssues.kitsAffected ?? 0} kits affected</span>
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {TYPES.map((type) => (
          <Link
            key={type.key}
            to={type.to}
            className="rounded-xl border border-[#E5E7EB] bg-white p-4 transition hover:border-[#F89C28]/50 hover:shadow-sm"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B7280]">{type.label}</p>
            <p className="mt-2 font-heading text-3xl font-bold tabular-nums text-[#1F2937]">{byType[type.key] ?? 0}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
