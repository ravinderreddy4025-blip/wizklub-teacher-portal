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
    <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#F89C28]">
            Monthly performance — {monthLabel(month)}
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
