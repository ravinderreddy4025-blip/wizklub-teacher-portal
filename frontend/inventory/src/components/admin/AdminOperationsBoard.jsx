import React from 'react';
import { Link } from 'react-router-dom';
import { Truck, CheckCircle2, RefreshCw, Clock, Package, AlertCircle, CheckSquare, Percent, FileDown } from 'lucide-react';

function Card({ label, value, hint, secondary, icon: Icon, accent = 'slate', to }) {
  const accents = {
    slate: 'text-[#6B7280]',
    orange: 'text-[#F89C28]',
    green: 'text-[#16A34A]',
    amber: 'text-[#D97706]',
  };
  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className={`text-[10px] font-bold uppercase tracking-[0.18em] ${accents[accent]}`}>{label}</p>
        {Icon && <Icon size={16} className={accents[accent]} />}
      </div>
      <p className="mt-2 font-heading text-3xl font-bold tabular-nums text-[#1F2937]">{value}</p>
      {secondary ? <p className="mt-1 text-sm font-semibold text-[#1F2937]">{secondary}</p> : null}
      <p className="mt-1 text-[11px] text-[#6B7280]">{hint}</p>
    </>
  );
  const className = 'rounded-xl border border-[#E5E7EB] bg-white p-4';
  if (to) {
    return (
      <Link to={to} className={`${className} block transition hover:border-[#F89C28]/50 hover:shadow-sm`}>
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
      <div className={`rounded-2xl border border-[#E5E7EB] bg-white p-6 ${className}`}>
        <p className="text-sm text-[#6B7280]">Loading operations…</p>
      </div>
    );
  }

  const fulfillment = current?.fulfillment || {};
  const openIssues = current?.openIssues || {};
  const approvals = current?.approvals || {};

  return (
    <div className={`space-y-5 ${className}`}>
      <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#F89C28]">
              Operations — {monthLabel(month)}
            </p>
            <p className="mt-1 text-[12px] text-[#6B7280]">What happened this month (kit units).</p>
          </div>
          {onDownloadPdf && (
            <button
              type="button"
              onClick={onDownloadPdf}
              disabled={downloading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E5E7EB] px-3 py-1.5 text-xs font-semibold text-[#1F2937] hover:bg-[#F8FAFC]"
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

      <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#F89C28]">Current state</p>
        <p className="mt-1 text-[12px] text-[#6B7280]">What needs attention right now — not a month total.</p>
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
