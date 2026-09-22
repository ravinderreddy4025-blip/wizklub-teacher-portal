import React from 'react';
import { Link } from 'react-router-dom';
import { Truck, CheckCircle2, RefreshCw, Clock, Package, AlertCircle, CheckSquare, Percent, FileDown } from 'lucide-react';

function Card({ label, value, hint, secondary, icon: Icon, accent = 'slate', to }) {
  const accents = {
    slate: 'text-wk-muted',
    orange: 'text-wk-orange-text',
    green: 'text-success-700',
    amber: 'text-warning-700',
  };
  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium text-wk-body">{label}</p>
        {Icon && <Icon size={18} className={accents[accent]} aria-hidden />}
      </div>
      <p className="mt-1 text-[28px] font-semibold leading-10 tabular-nums text-wk-ink">{value}</p>
      {secondary ? <p className="text-sm font-medium text-wk-ink">{secondary}</p> : null}
      <p className="mt-1 text-xs text-wk-muted">{hint}</p>
    </>
  );
  const className = 'rounded-2xl border border-wk-line bg-white p-4';
  if (to) {
    return (
      <Link to={to} className={`${className} block transition hover:border-wk-control hover:bg-wk-cream`}>
        {inner}
      </Link>
    );
  }
  return <article className={className}>{inner}</article>;
}

function monthLabel(month) {
  if (!month) return 'Selected month';
  const [year, m] = String(month).split('-');
  const date = new Date(Number(year), Number(m) - 1, 1);
  return date.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
}

export default function AdminOperationsBoard({
  month,
  period,
  current,
  loading = false,
  className = '',
  clickable = false,
  onDownloadPdf,
  downloading = false,
}) {
  if (loading) {
    return (
      <div className={`rounded-2xl bg-white p-5 shadow-card ${className}`} aria-busy="true">
        <div className="h-5 w-56 animate-pulse-subtle rounded-md bg-wk-mist" />
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse-subtle rounded-2xl bg-wk-mist" />)}
        </div>
        <p className="sr-only">Loading operations…</p>
      </div>
    );
  }

  const fulfillment = current?.fulfillment || {};
  const openIssues = current?.openIssues || {};
  const approvals = current?.approvals || {};

  return (
    <div className={`space-y-5 ${className}`}>
      <section className="rounded-2xl bg-white shadow-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-wk-ink">
              Operations — {monthLabel(month)}
            </h2>
            <p className="mt-0.5 text-[13px] text-wk-body">What happened this month, in kit units.</p>
          </div>
          {onDownloadPdf && (
            <button
              type="button"
              onClick={onDownloadPdf}
              disabled={downloading}
              className="wk-btn-secondary !min-h-[40px]"
            >
              <FileDown size={14} />
              {downloading ? 'Downloading…' : 'Download PDF'}
            </button>
          )}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Card label="Shipped" value={period?.shippedKits ?? 0} hint="This month · INITIAL only" icon={Truck} accent="orange" />
          <Card label="Acknowledged" value={period?.acknowledgedKits ?? 0} hint="This month · OK kits only" icon={CheckCircle2} accent="green" />
          <Card label="Replacements" value={period?.replacedKits ?? 0} hint="This month · physically shipped" icon={RefreshCw} accent="slate" />
        </div>
      </section>

      <section className="rounded-2xl bg-white shadow-card p-5">
        <h2 className="text-lg font-semibold text-wk-ink">Current state</h2>
        <p className="mt-0.5 text-[13px] text-wk-body">What needs attention right now — not a month total.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Card
            label="Pending acknowledgement"
            value={current?.pendingAcknowledgementKits ?? 0}
            hint="Current · live Dispatched cycle"
            icon={Clock}
            accent="orange"
            to={clickable ? '/admin/dispatches' : undefined}
          />
          <Card
            label="Outstanding kits"
            value={current?.outstandingKits ?? 0}
            hint="Currently owed"
            icon={Package}
            accent="amber"
            to={clickable ? '/admin/replacements' : undefined}
          />
          <Card
            label="Open issues"
            value={openIssues.claims ?? 0}
            secondary={`${openIssues.kitsAffected ?? 0} kits affected`}
            hint="Current · claims"
            icon={AlertCircle}
            to={clickable ? '/admin/replacements' : undefined}
          />
          <Card
            label="Approvals"
            value={approvals.claims ?? 0}
            secondary={`${approvals.kitsAffected ?? 0} kits affected`}
            hint="Current · claims"
            icon={CheckSquare}
            to={clickable ? '/admin/replacements' : undefined}
          />
          <Card
            label="Fulfillment"
            value={`${fulfillment.rate ?? 0}%`}
            secondary={`${fulfillment.fulfilledDsps ?? 0} / ${fulfillment.eligibleDsps ?? 0} DSPs`}
            hint="Of this month's DSPs, currently fulfilled"
            icon={Percent}
            accent="green"
          />
        </div>
      </section>
    </div>
  );
}
