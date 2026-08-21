import React from 'react';

function formatValue(line) {
  const n = Number(line.value) || 0;
  const formatted = n.toLocaleString();
  return line.kind === 'records' ? `${formatted} rec` : formatted;
}

export default function KpiHoverTip({
  title,
  total,
  lines = [],
  equation,
  align = 'center',
  placement = 'bottom',
}) {
  const pos =
    align === 'left'
      ? 'left-0'
      : align === 'right'
        ? 'right-0'
        : 'left-1/2 -translate-x-1/2';
  const side = placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2';

  return (
    <div
      className={`pointer-events-none absolute ${pos} ${side} z-[90] hidden w-80 max-w-[min(20rem,calc(100vw-2rem))] group-hover:block group-focus-visible:block`}
      role="tooltip"
    >
      <div className="rounded-xl border border-[#E5E7EB] bg-white p-3.5 text-left shadow-2xl ring-1 ring-black/5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#F89C28]">{title}</p>
          {total != null && (
            <p className="font-heading text-lg font-bold tabular-nums text-[#1F2937]">{Number(total).toLocaleString()}</p>
          )}
        </div>
        <ul className="mt-2 space-y-1 border-t border-[#F1F5F9] pt-2">
          {lines.map((row) => (
            <li key={row.label} className="flex items-baseline justify-between gap-3 text-[11px]">
              <span className="text-[#6B7280]">{row.label}</span>
              <span className="font-heading font-bold tabular-nums text-[#1F2937]">{formatValue(row)}</span>
            </li>
          ))}
        </ul>
        {equation && (
          <p className="mt-2 rounded-lg bg-[#FFFAF3] px-2 py-1.5 font-heading text-[11px] font-bold tabular-nums leading-snug text-[#1F2937]">
            {equation}
          </p>
        )}
      </div>
    </div>
  );
}
