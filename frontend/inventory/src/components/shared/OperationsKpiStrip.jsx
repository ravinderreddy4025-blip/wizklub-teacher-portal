import React from 'react';
import { Truck, Clock, CalendarClock, CheckCircle2, Scale, PackageX, ShieldAlert, Ban } from 'lucide-react';
import StatCard from '../admin/StatCard';

export function rejectedHint(summary) {
  const am = summary?.rejectedByAm ?? 0;
  const admin = summary?.rejectedByAdmin ?? 0;
  return `Rejected by AM ${am} · Admin ${admin}`;
}

export default function OperationsKpiStrip({ summary, className = '' }) {
  const sent = summary?.sentKits ?? summary?.dispatchedKits ?? 0;
  const pending = summary?.pendingKits ?? 0;
  const scheduled = summary?.scheduledKits ?? sent + pending;

  return (
    <div className={`grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8 ${className}`}>
      <StatCard
        label="Sent till date"
        value={sent}
        hint="Actually shipped — excludes pending"
        accent="primary"
        icon={Truck}
      />
      <StatCard
        label="Pending"
        value={pending}
        hint="Created this month, not yet shipped"
        accent="warning"
        icon={Clock}
      />
      <StatCard
        label="Scheduled"
        value={scheduled}
        hint={`Sent (${sent}) + pending (${pending})`}
        accent="slate"
        icon={CalendarClock}
      />
      <StatCard
        label="Acknowledged"
        value={summary?.acknowledgedKits ?? 0}
        hint="Received OK, including remainder after issues"
        accent="blue"
        icon={CheckCircle2}
      />
      <StatCard
        label="Mismatched"
        value={summary?.mismatchKits ?? 0}
        hint="Shortfall vs sent quantity"
        accent="warning"
        icon={Scale}
      />
      <StatCard
        label="Lost"
        value={summary?.lostKits ?? 0}
        hint="Received, later reported missing"
        accent="slate"
        icon={PackageX}
      />
      <StatCard
        label="Damaged"
        value={summary?.damagedKits ?? 0}
        hint="Damaged remainder of sent qty"
        accent="error"
        icon={ShieldAlert}
      />
      <StatCard
        label="Rejected"
        value={summary?.rejectedKits ?? 0}
        hint={rejectedHint(summary)}
        accent="error"
        icon={Ban}
      />
    </div>
  );
}
