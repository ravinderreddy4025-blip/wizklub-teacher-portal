import React from 'react';
import { clsx } from 'clsx';
import { getDispatchRedispatchSummary } from '@inventory/utils/schoolDispatch';

const TONE_CLASS = {
  muted: 'text-slate-500',
  brand: 'text-brand-primary',
};

function CompareLine({ label, value, tone = 'muted' }) {
  if (!value || value === '—') return null;
  return (
    <p className={clsx('text-xs normal-case tracking-normal font-semibold', TONE_CLASS[tone])}>
      {label}: {value}
    </p>
  );
}

/**
 * Compact table lines: current shipment only for redispatched rows.
 * Full cycle stacks live in DispatchCompareGrid (Track dispatch modal).
 */
export function DispatchCompareLines({ item, fields = ['kitId', 'category'], className = '' }) {
  const summary = getDispatchRedispatchSummary(item);

  if (summary.mode === 'single' || summary.mode === 'pending') {
    return (
      <div className={clsx('space-y-1', className)}>
        {fields.includes('kitId') && (
          <CompareLine label="Kit ID" value={summary.original.kitId} tone="muted" />
        )}
        {fields.includes('category') && (
          <CompareLine label="Category" value={summary.original.category} tone="muted" />
        )}
        {fields.includes('tracking') && (
          <CompareLine label="Tracking" value={summary.original.trackingId} tone="muted" />
        )}
        {fields.includes('quantity') && summary.original.quantity != null && (
          <CompareLine label="Quantity" value={`x${summary.original.quantity}`} tone="muted" />
        )}
      </div>
    );
  }

  // Redispatched: current fields only (+ optional Was: for category)
  const current = summary.redispatch;
  return (
    <div className={clsx('space-y-1', className)}>
      {fields.includes('kitId') && (
        <CompareLine label="Kit ID" value={current?.kitId} tone="brand" />
      )}
      {fields.includes('category') && (
        <>
          <CompareLine label="Category" value={current?.category} tone="brand" />
          {summary.original?.category && summary.original.category !== current?.category && (
            <p className="text-xs text-slate-400">Was: {summary.original.category}</p>
          )}
        </>
      )}
      {fields.includes('tracking') && (
        <CompareLine label="Tracking" value={current?.trackingId} tone="brand" />
      )}
      {fields.includes('quantity') && current?.quantity != null && (
        <CompareLine label="Quantity" value={`x${current.quantity}`} tone="brand" />
      )}
    </div>
  );
}

/**
 * Scrollable cycle list for Track dispatch (label, category, tracking, qty).
 */
export function DispatchShipmentHistoryList({ item }) {
  const summary = getDispatchRedispatchSummary(item);
  if (summary.mode !== 'redispatched') return null;

  const cycleList = summary.cycles || [];
  if (cycleList.length < 2) return null;

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <p className="px-4 py-3 text-xs font-bold text-slate-500 normal-case tracking-normal bg-slate-50 border-b border-slate-100">
        Shipment history ({cycleList.length} cycles)
      </p>
      <ul className="max-h-56 overflow-y-auto divide-y divide-slate-100">
        {cycleList.map((cycle, index) => {
          const isLatest = index === cycleList.length - 1;
          return (
            <li
              key={`${cycle.label}-${index}`}
              className={clsx('px-4 py-3', isLatest && 'bg-brand-primary/5')}
            >
              <div className="flex items-start justify-between gap-3">
                <p
                  className={clsx(
                    'text-sm font-medium',
                    isLatest ? 'text-brand-primary' : 'text-slate-500',
                  )}
                >
                  {cycle.label}
                </p>
                <p
                  className={clsx(
                    'text-sm font-semibold shrink-0',
                    isLatest ? 'text-brand-primary' : 'text-slate-800',
                  )}
                >
                  x{cycle.quantity ?? '—'}
                </p>
              </div>
              <p className="mt-1 text-xs text-slate-600">{cycle.category || '—'}</p>
              <p
                className={clsx(
                  'mt-0.5 font-mono text-xs break-all',
                  isLatest ? 'text-brand-primary font-semibold' : 'text-slate-500',
                )}
              >
                {cycle.trackingId || '—'}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Comparison grid for modal: Original | Redispatch, or multi-cycle columns.
 */
export function DispatchCompareGrid({ item }) {
  const summary = getDispatchRedispatchSummary(item);

  if (summary.mode !== 'redispatched') return null;

  const cycleList = summary.cycles || [];
  if (cycleList.length > 2) {
    return (
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <p className="px-4 py-3 text-xs font-bold text-slate-500 normal-case tracking-normal bg-slate-50 border-b border-slate-100">
          Compare fields by cycle
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-4 py-2 text-xs font-bold text-slate-400">Field</th>
                {cycleList.map((cycle, index) => (
                  <th
                    key={`${cycle.label}-${index}`}
                    className={clsx(
                      'text-left px-4 py-2 text-xs font-bold',
                      index === cycleList.length - 1 ? 'text-brand-primary' : 'text-slate-400',
                    )}
                  >
                    {cycle.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { label: 'Kit ID', key: 'kitId' },
                { label: 'Category', key: 'category' },
                { label: 'Quantity', key: 'quantity', format: (v) => (v != null ? `x${v}` : '—') },
                { label: 'Tracking', key: 'trackingId' },
              ].map((row) => (
                <tr key={row.label} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-2.5 text-xs font-medium text-slate-500">{row.label}</td>
                  {cycleList.map((cycle, index) => {
                    const raw = cycle[row.key];
                    const value = row.format ? row.format(raw) : (raw || '—');
                    const isLatest = index === cycleList.length - 1;
                    return (
                      <td
                        key={`${row.label}-${index}`}
                        className={clsx(
                          'px-4 py-2.5 font-mono text-xs break-all',
                          isLatest ? 'text-brand-primary font-semibold' : 'text-slate-700',
                        )}
                      >
                        {value}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const rows = [
    { label: 'Kit ID', original: summary.original.kitId, redispatch: summary.redispatch.kitId },
    { label: 'Category', original: summary.original.category, redispatch: summary.redispatch.category },
    { label: 'Quantity', original: `x${summary.original.quantity}`, redispatch: `x${summary.redispatch.quantity}` },
    { label: 'Tracking', original: summary.original.trackingId, redispatch: summary.redispatch.trackingId },
  ];

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <p className="px-4 py-3 text-xs font-bold text-slate-500 normal-case tracking-normal bg-slate-50 border-b border-slate-100">
        Shipment comparison
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100">
            <th className="text-left px-4 py-2 text-xs font-bold text-slate-400">Field</th>
            <th className="text-left px-4 py-2 text-xs font-bold text-slate-400">Original</th>
            <th className="text-left px-4 py-2 text-xs font-bold text-brand-primary">Redispatch</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-slate-50 last:border-0">
              <td className="px-4 py-2.5 text-xs font-medium text-slate-500">{row.label}</td>
              <td className="px-4 py-2.5 text-slate-700 font-mono text-xs break-all">{row.original || '—'}</td>
              <td className="px-4 py-2.5 text-brand-primary font-mono text-xs font-semibold break-all">{row.redispatch || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default DispatchCompareLines;
