import React from 'react';
import { Clock, Package, AlertCircle, Percent } from 'lucide-react';
import AmKpiCard from './AmKpiCard';
import { ROUTES } from '../../utils/routes';

export default function AmNetworkHealth({ current }) {
  const openIssues = current?.openIssues || {};
  const fulfillment = current?.fulfillment || {};
  const fulfilled = fulfillment.fulfilledDsps ?? 0;
  const eligible = fulfillment.eligibleDsps ?? 0;

  return (
    <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#F89C28]">School network health</p>
      <p className="mt-1 text-[12px] text-[#6B7280]">What is currently happening across your schools.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AmKpiCard
          label="Pending acknowledgement"
          value={`${current?.pendingAcknowledgementKits ?? 0} kits`}
          hint="Currently awaiting school response"
          icon={Clock}
          accent="orange"
          to={ROUTES.am.dispatches}
        />
        <AmKpiCard
          label="Outstanding"
          value={`${current?.outstandingKits ?? 0} kits`}
          hint="Currently owed"
          icon={Package}
          accent="amber"
          to={ROUTES.am.dispatches}
        />
        <AmKpiCard
          label="Open issues"
          value={`${openIssues.claims ?? 0} claims`}
          secondary={`${openIssues.kitsAffected ?? 0} kits affected`}
          icon={AlertCircle}
          to={ROUTES.am.approvals}
        />
        <AmKpiCard
          label="Fulfillment"
          value={`${fulfillment.rate ?? 0}%`}
          secondary={`${fulfilled} / ${eligible} DSPs currently fulfilled`}
          icon={Percent}
          accent="green"
        />
      </div>
    </section>
  );
}
