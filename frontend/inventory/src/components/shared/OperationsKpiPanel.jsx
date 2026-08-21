import React from 'react';
import { FileDown } from 'lucide-react';
import OperationsKpiStrip from './OperationsKpiStrip';

export default function OperationsKpiPanel({
  summary,
  loading = false,
  onDownloadPdf,
  downloading = false,
  className = '',
}) {
  return (
    <div className={className}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--stitch-primary)]">
            Operations KPIs
          </p>
          <p className="mt-0.5 max-w-3xl text-[11px] leading-snug text-[var(--stitch-muted)]">
            Sent till date is kits actually shipped. Pending is created this month but not yet shipped.
            Scheduled is sent plus pending. Then acknowledged, mismatched, lost, damaged, and rejected
            (by AM or Admin).
          </p>
        </div>
        {onDownloadPdf && (
          <button
            type="button"
            disabled={downloading}
            onClick={onDownloadPdf}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-bold text-[#1F2937] transition hover:border-[#F89C28] hover:text-[#F89C28] disabled:opacity-60"
          >
            <FileDown size={14} />
            {downloading ? 'Generating…' : 'Download PDF'}
          </button>
        )}
      </div>
      {loading ? (
        <p className="py-4 text-center text-sm text-[var(--stitch-muted)]">Loading operations KPIs…</p>
      ) : (
        <OperationsKpiStrip summary={summary} />
      )}
    </div>
  );
}
