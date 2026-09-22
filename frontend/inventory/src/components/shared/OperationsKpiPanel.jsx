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
          <p className="text-sm font-medium text-wk-orange-text">
            Operations KPIs
          </p>
          <p className="mt-0.5 max-w-3xl text-xs leading-snug text-wk-muted">
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
            className="wk-btn-secondary !min-h-[40px] !px-4 !text-[13px]"
          >
            <FileDown size={14} />
            {downloading ? 'Generating…' : 'Download PDF'}
          </button>
        )}
      </div>
      {loading ? (
        <p className="py-4 text-center text-sm text-wk-muted">Loading operations KPIs…</p>
      ) : (
        <OperationsKpiStrip summary={summary} />
      )}
    </div>
  );
}
