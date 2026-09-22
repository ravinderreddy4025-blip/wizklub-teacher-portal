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
      <div className="rounded-xl border border-wk-line bg-white p-3.5 text-left shadow-2xl ring-1 ring-black/5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-medium text-wk-orange-text">{title}</p>
          {total != null && (
            <p className="text-lg font-semibold tabular-nums text-wk-ink">{Number(total).toLocaleString()}</p>
          )}
        </div>
        <ul className="mt-2 space-y-1 border-t border-wk-line pt-2">
          {lines.map((row) => (
            <li key={row.label} className="flex items-baseline justify-between gap-3 text-xs">
              <span className="text-wk-muted">{row.label}</span>
              <span className="font-bold tabular-nums text-wk-ink">{formatValue(row)}</span>
            </li>
          ))}
        </ul>
        {equation && (
          <p className="mt-2 rounded-lg bg-wk-cream px-2 py-1.5 text-xs font-bold tabular-nums leading-snug text-wk-ink">
            {equation}
          </p>
        )}
      </div>
    </div>
  );
}
