import React from 'react';
import DispatchCompareLines from '@school-portal/components/school/DispatchCompareLines';
import {
  getCycleCount,
  getDispatchQuantityDisplay,
  getDispatchRedispatchSummary,
} from '../../utils/schoolDispatch';
import {
  getDispatchTrackingValue,
  isTrackingOverdue,
  trackingDisplayLabel,
} from '../../utils/dispatchTracking';

function CycleChip({ count, onClick }) {
  if (!count || count < 2) return null;
  const label = `${count} redispatch cycles — click to view full shipment history`;
  const className = 'inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-600';
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={label}
        aria-label={label}
        className={`${className} hover:bg-brand-primary/10 hover:text-brand-primary transition-colors`}
      >
        {count} cycles
      </button>
    );
  }
  return <span className={className} title={label}>{count} cycles</span>;
}

/** Compact table cell: dispatch ID, current tracking, cycle chip. */
export function DispatchIdCell({ item, onViewHistory }) {
  const summary = getDispatchRedispatchSummary(item);
  const cycleCount = getCycleCount(item);
  const hasTracking = !!getDispatchTrackingValue(item);
  const currentTracking = trackingDisplayLabel(item);
  const overdue = isTrackingOverdue(item);

  return (
    <div className="space-y-1.5">
      <p className="font-mono text-sm font-bold text-brand-primary break-all">
        {item.dispatchId || item._id}
      </p>
      <p
        className={`text-xs uppercase tracking-widest font-semibold ${
          !hasTracking ? 'text-warning-700' : 'text-slate-500'
        }`}
      >
        Tracking: {currentTracking}
      </p>
      {overdue && (
        <span className="inline-flex items-center rounded-md bg-error-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-error-700">
          Tracking overdue
        </span>
      )}
      {summary.mode === 'redispatched' && (
        <CycleChip count={cycleCount} onClick={onViewHistory} />
      )}
    </div>
  );
}

/** Compact: kit name, current kit ID / category, optional "Was: original category". */
export function KitDetailsCell({ item, showShippedDate = true }) {
  const summary = getDispatchRedispatchSummary(item);
  const isRedispatched = summary.mode === 'redispatched';
  const current = isRedispatched ? summary.redispatch : summary.original;

  return (
    <div>
      <p className="font-bold text-slate-900">{item.kit?.name || '—'}</p>
      <div className="mt-1 space-y-1">
        <p className="text-xs uppercase tracking-widest font-semibold text-slate-500">
          Kit ID: {current?.kitId || '—'}
        </p>
        <p className="text-xs uppercase tracking-widest font-semibold text-brand-primary">
          Category: {current?.category || '—'}
        </p>
        {isRedispatched && summary.original?.category && summary.original.category !== current?.category && (
          <p className="text-xs text-slate-400">
            Was: {summary.original.category}
          </p>
        )}
        {showShippedDate && item.dispatchedAt && (
          <p className="text-xs text-slate-500 mt-1">
            Shipped: {new Date(item.dispatchedAt).toLocaleDateString()}
          </p>
        )}
      </div>
    </div>
  );
}

/** Compact quantity: current only; optional muted original if different. */
export function QuantityCell({ item }) {
  if (item?.quantityInitial != null || item?.quantityAcknowledged != null) {
    const initial = Number(item.quantityInitial ?? item.quantity) || 0;
    const ack = Number(item.quantityAcknowledged ?? item.acknowledgedUnits) || 0;
    const affected = Number(item.quantityAffected) || 0;
    const replaced = Number(item.quantityReplaced) || 0;
    const outstanding = item.outstandingQuantity != null
      ? Number(item.outstandingQuantity)
      : Math.max(0, initial - ack);
    return (
      <div className="space-y-0.5 text-[11px] font-semibold text-slate-800">
        <p>sent {initial} · ok {ack}</p>
        {affected > 0 && (
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            affected {affected}
            {replaced > 0 ? ` · repl ${replaced}` : outstanding > 0 ? ' · repl pending' : ''}
          </p>
        )}
        {item.status === 'Completed' && (
          outstanding > 0 ? (
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600">
              Cycle completed · outstanding {outstanding}
            </p>
          ) : (
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">
              Fulfilled
            </p>
          )
        )}
      </div>
    );
  }
  if (item?.acknowledgedUnits != null) {
    const ack = Number(item.acknowledgedUnits) || 0;
    const cycleQty = Number(item.quantity) || 0;
    return (
      <div className="space-y-0.5 text-sm font-semibold text-slate-800">
        <p>x{ack}</p>
        {cycleQty > 0 && cycleQty !== ack && (
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            this cycle x{cycleQty}
          </p>
        )}
      </div>
    );
  }
  const qty = getDispatchQuantityDisplay(item);
  if (qty.mode === 'single') {
    return <span className="font-semibold text-slate-800">x{qty.quantity}</span>;
  }
  return (
    <div className="space-y-0.5 text-sm font-semibold text-slate-800">
      <p className="text-brand-primary">x{qty.redispatched}</p>
      {qty.originalSent != null && qty.originalSent !== qty.redispatched && (
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          orig x{qty.originalSent}
        </p>
      )}
    </div>
  );
}

/** Issue row shipment snapshot — compact current fields; full history via Track. */
export function IssueShipmentDetailsCell({ issue }) {
  if (!issue) return null;
  const row = {
    ...(typeof issue.dispatch === 'object' ? issue.dispatch : {}),
    dispatchId: issue.dispatch?.dispatchId || issue.sourceDispatchRef,
    school: issue.school,
    kit: issue.kit,
    receiptIssue: issue,
    originalKitId: issue.originalKitId,
    originalCategory: issue.originalCategory,
    quantity: issue.quantityAffected,
    consignmentNo: issue.dispatch?.consignmentNo,
    category: issue.dispatch?.category,
    status: issue.dispatch?.status,
    redispatchCycles: issue.dispatch?.redispatchCycles,
  };
  return (
    <div className="min-w-[160px]">
      <DispatchCompareLines item={row} fields={['kitId', 'category', 'tracking']} />
      <div className="mt-2">
        <QuantityCell item={row} />
      </div>
    </div>
  );
}
