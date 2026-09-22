import React from 'react';
import { Truck, CheckCircle2, RefreshCw, FileDown } from 'lucide-react';
import AmKpiCard from './AmKpiCard';

function monthLabel(month) {
  if (!month) return 'Selected month';
  const [year, m] = String(month).split('-');
  const date = new Date(Number(year), Number(m) - 1, 1);
  return date.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
}

export default function AmMonthlyPerformance({
  month,
  period,
  onDownloadPdf,
  downloading = false,
}) {
  return (
    <section className="rounded-2xl bg-white shadow-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-wk-ink">
            Monthly performance — {monthLabel(month)}
          </h2>
          <p className="mt-0.5 text-[13px] text-wk-body">What happened this month (kit units).</p>
        </div>
        {onDownloadPdf && (
          <button
            type="button"
            onClick={onDownloadPdf}
            disabled={downloading}
            className="wk-btn-secondary !min-h-[40px] !px-4 !text-[13px]"
          >
            <FileDown size={14} />
            {downloading ? 'Downloading…' : 'Download PDF'}
          </button>
        )}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <AmKpiCard
          label="Sent"
          value={`${period?.shippedKits ?? 0} kits`}
          hint="This month"
          icon={Truck}
          accent="orange"
        />
        <AmKpiCard
          label="Received"
          value={`${period?.acknowledgedKits ?? 0} kits`}
          hint="This month"
          icon={CheckCircle2}
          accent="green"
        />
        <AmKpiCard
          label="Replacements"
          value={`${period?.replacedKits ?? 0} kits`}
          hint="This month"
          icon={RefreshCw}
        />
      </div>
    </section>
  );
}
