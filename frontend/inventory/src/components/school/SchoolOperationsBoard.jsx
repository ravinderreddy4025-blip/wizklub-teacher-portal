import React from 'react';
import { Link } from 'react-router-dom';
import { Truck, CheckCircle2, RefreshCw, Boxes, Clock, Package, AlertCircle } from 'lucide-react';
import AttentionQueues from '../admin/AttentionQueues';
import { SCHOOL_ROUTES } from '@school-portal/routes/constants';

function monthLabel(month) {
  if (!month) return 'This month';
  const [year, m] = String(month).split('-');
  const date = new Date(Number(year), Number(m) - 1, 1);
  return date.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
}

function Card({ label, value, hint, secondary, icon: Icon, accent = 'slate', to, hero = false }) {
  const accents = {
    slate: 'text-wk-muted',
    orange: 'text-wk-orange-text',
    green: 'text-success-700',
    amber: 'text-warning-700',
  };
  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className={`text-sm font-medium ${accents[accent]}`}>{label}</p>
        {Icon && <Icon size={hero ? 20 : 16} className={accents[accent]} />}
      </div>
      <p className={`mt-2 font-bold tabular-nums text-wk-ink ${hero ? 'text-4xl' : 'text-3xl'}`}>
        {value}
      </p>
      {secondary ? <p className="mt-1 text-sm font-semibold text-wk-ink">{secondary}</p> : null}
      {hint ? <p className="mt-1 text-xs text-wk-muted">{hint}</p> : null}
    </>
  );
  const className = `rounded-xl border bg-white p-4 ${hero ? 'border-wk-peach-2 shadow-sm' : 'border-wk-line'}`;
  if (to) {
    return (
      <Link to={to} className={`${className} block transition hover:border-wk-peach-2 hover:shadow-sm`}>
        {inner}
      </Link>
    );
  }
  return <article className={className}>{inner}</article>;
}

export default function SchoolOperationsBoard({
  month,
  period,
  current,
  inventory,
  inventoryHealth,
  attention,
  loading = false,
  onDownloadPdf,
  downloading = false,
  className = '',
}) {
  if (loading) {
    return (
      <div className={`rounded-2xl bg-white shadow-card p-6 ${className}`}>
        <p className="text-sm text-wk-muted">Loading school operations…</p>
      </div>
    );
  }

  const onHand = inventory?.onHandKits ?? inventoryHealth?.availableKits ?? 0;
  const outstanding = current?.outstandingKits ?? 0;
  const byType = current?.outstandingByType || {};
  const openIssues = current?.openIssues || {};
  const replacementInTransit = current?.replacementInTransitKits ?? 0;
  const health = inventoryHealth || { availableKits: onHand, lostKits: 0, damagedKits: 0, mismatchKits: 0 };

  return (
    <div className={`space-y-5 ${className}`}>
      <section className="rounded-2xl bg-white shadow-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-wk-ink">
              This month — {monthLabel(month)}
            </h2>
            <p className="mt-0.5 text-[13px] text-wk-body">What was sent and received this month.</p>
          </div>
          {onDownloadPdf && (
            <button
              type="button"
              onClick={onDownloadPdf}
              disabled={downloading}
              className="wk-btn-secondary !min-h-[40px] !px-4 !text-[13px]"
            >
              {downloading ? 'Downloading…' : 'Download PDF'}
            </button>
          )}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Card label="Sent" value={period?.shippedKits ?? 0} hint="Kits shipped to your school this month" icon={Truck} accent="orange" />
          <Card
            label="Received"
            value={period?.acknowledgedKits ?? 0}
            hint="Kits acknowledged as received this month."
            icon={CheckCircle2}
            accent="green"
          />
          <Card label="Replacements" value={period?.replacedKits ?? 0} hint="Replacement kits shipped this month" icon={RefreshCw} />
        </div>
      </section>

      <section className="rounded-2xl bg-white shadow-card p-5">
        <h2 className="text-base font-semibold text-wk-ink">Current status</h2>
        <p className="mt-0.5 text-[13px] text-wk-body">What you have, what is owed, and what still needs action.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card
            hero
            label="Current inventory"
            value={onHand}
            hint="Kits currently in your school warehouse"
            icon={Boxes}
            accent="orange"
            to={SCHOOL_ROUTES.warehouse}
          />
          <Card
            label="Pending acknowledgement"
            value={current?.pendingAcknowledgementKits ?? 0}
            hint={replacementInTransit > 0 ? `Includes ${replacementInTransit} replacement kit(s) in transit` : 'Shipments waiting for your receipt'}
            icon={Clock}
            accent="orange"
            to={SCHOOL_ROUTES.dispatches}
          />
          <Card
            label="Outstanding kits"
            value={outstanding}
            hint="Currently owed"
            secondary={`Not received ${byType.notReceived || 0} · Lost ${byType.lost || 0} · Mismatch ${byType.mismatch || 0} · Damaged ${byType.damaged || 0}`}
            icon={Package}
            accent="amber"
            to={SCHOOL_ROUTES.dispatches}
          />
          <Card
            label="Open issues"
            value={openIssues.claims ?? 0}
            secondary={`${openIssues.kitsAffected ?? 0} kits affected`}
            hint="Current claims — not kit units"
            icon={AlertCircle}
            to={SCHOOL_ROUTES.dispatches}
          />
        </div>
      </section>

      <AttentionQueues
        queues={attention?.queues}
        eyebrow="You need to act"
        title="Only items that need your action"
      />

      <section className="rounded-2xl bg-white shadow-card p-5">
        <h2 className="text-base font-semibold text-wk-ink">Inventory health</h2>
        <p className="mt-0.5 text-[13px] text-wk-body">
          Available is on-hand stock. Lost, damaged, and mismatch are open problem kits — not added together to invent a larger inventory.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card label="Available" value={health.availableKits ?? onHand} hint="Same as current inventory" />
          <Card label="Lost" value={health.lostKits ?? 0} hint="Received, later reported missing" to={SCHOOL_ROUTES.dispatches} />
          <Card label="Damaged" value={health.damagedKits ?? 0} hint="Open damaged claims" to={SCHOOL_ROUTES.dispatches} />
          <Card label="Mismatch" value={health.mismatchKits ?? 0} hint="Open quantity shortfalls" to={SCHOOL_ROUTES.dispatches} />
        </div>
      </section>
    </div>
  );
}
