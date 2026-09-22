import React, { useEffect, useState } from 'react';
import {
  Truck,
  CheckCircle2,
  Scale,
  PackageX,
  ShieldAlert,
  Ban,
  Package,
  Clock,
  FileDown,
  ArrowRight,
} from 'lucide-react';
import { buildUnitAnalytics, buildHubJustification, getSegmentTooltip, getShippedTooltip } from '../../utils/unitAnalytics';
import KpiHoverTip from './KpiHoverTip';

const SEGMENT_ICONS = {
  acknowledged: CheckCircle2,
  inTransit: Package,
  mismatched: Scale,
  lost: PackageX,
  damaged: ShieldAlert,
  rejected: Ban,
};

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function useCountUp(value, duration = 800) {
  const [n, setN] = useState(0);

  useEffect(() => {
    const target = Number(value) || 0;
    if (prefersReducedMotion()) {
      setN(target);
      return undefined;
    }
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setN(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return n;
}

function formatUnits(n) {
  return Number(n || 0).toLocaleString();
}

export default function AdminOperationsAnalytics({
  summary,
  loading = false,
  incomingUnits,
  hubSummary,
  onDownloadPdf,
  downloading = false,
  className = '',
}) {
  const analytics = buildUnitAnalytics(summary, incomingUnits);
  const hubRows = buildHubJustification(analytics, hubSummary);
  const shippedCount = useCountUp(loading ? 0 : analytics.sent);
  const ackCount = useCountUp(loading ? 0 : analytics.acknowledged);
  const [barReady, setBarReady] = useState(false);

  useEffect(() => {
    if (loading) {
      setBarReady(false);
      return undefined;
    }
    const id = requestAnimationFrame(() => setBarReady(true));
    return () => cancelAnimationFrame(id);
  }, [loading, analytics.sent, analytics.acknowledged, analytics.inTransit]);

  if (loading) {
    return (
      <div className={`overflow-hidden rounded-2xl bg-white shadow-card ${className}`}>
        <div className="animate-pulse space-y-4 p-5 md:p-6">
          <div className="h-3 w-40 rounded bg-wk-mist" />
          <div className="grid gap-3 md:grid-cols-2">
            <div className="h-28 rounded-2xl bg-wk-cream" />
            <div className="h-28 rounded-2xl bg-wk-cream" />
          </div>
          <div className="h-4 rounded-full bg-wk-mist" />
        </div>
      </div>
    );
  }

  return (
    <section
      className={`relative rounded-2xl bg-white shadow-card ${className}`}
      aria-label="Unit analytics: shipped, acknowledged, and justification"
    >
      <div className="relative z-10 space-y-5 p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-wk-orange-text">Unit analytics</p>
            <h2 className="mt-0.5 text-lg font-semibold text-wk-ink md:text-xl">
              Shipped → acknowledged, then the justification
            </h2>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-wk-body">
              Every number is <span className="font-semibold text-wk-ink">kit units</span>, not shipment
              records. The bar accounts for what left the warehouse this month.
            </p>
          </div>
          {onDownloadPdf && (
            <button
              type="button"
              disabled={downloading}
              onClick={onDownloadPdf}
              className="wk-btn-secondary !min-h-[40px]"
            >
              <FileDown size={14} />
              {downloading ? 'Generating…' : 'Download PDF'}
            </button>
          )}
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_auto_1fr]">
          <article className="group relative z-0 rounded-2xl bg-wk-promo p-5 text-white hover:z-[80]">
            <div className="pointer-events-none absolute -right-6 top-4 opacity-20" aria-hidden>
              <Truck size={88} strokeWidth={1.25} />
            </div>
            <p className="text-sm font-medium text-wk-sun">Shipped</p>
            <p className="mt-2 text-4xl font-semibold tabular-nums md:text-5xl">
              {formatUnits(shippedCount)}
            </p>
            <p className="mt-1 text-sm text-white/90">kit units actually sent</p>
            <KpiHoverTip
              {...getShippedTooltip(analytics)}
              align="left"
            />
          </article>

          <div className="hidden items-center justify-center text-wk-orange-text lg:flex" aria-hidden="true">
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-wk-peach-2 bg-wk-cream">
              <ArrowRight size={18} />
            </span>
          </div>

          <article className="group relative z-0 rounded-2xl bg-success-100 p-5 hover:z-[80]">
            <div className="pointer-events-none absolute -right-4 top-3 text-success-700 opacity-15" aria-hidden>
              <CheckCircle2 size={88} strokeWidth={1.25} />
            </div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-success-700">Acknowledged</p>
                <p className="mt-2 text-4xl font-semibold tabular-nums text-success-800 md:text-5xl">
                  {formatUnits(ackCount)}
                </p>
                <p className="mt-1 text-sm text-wk-body">units received OK</p>
              </div>
              <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full border-4 border-success-600 bg-white text-center">
                <span className="text-sm font-semibold leading-none text-success-800">{analytics.ackRate}%</span>
                <span className="mt-0.5 text-[11px] font-medium text-wk-body">of sent</span>
              </div>
            </div>
            <KpiHoverTip
              {...getSegmentTooltip({ key: 'acknowledged' }, analytics, hubSummary)}
              align="right"
            />
          </article>
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
            <p className="text-sm font-medium text-wk-body">
              Justification · {formatUnits(analytics.sent)} units shipped
            </p>
            <p className={`text-xs font-semibold ${analytics.balanced ? 'text-success-700' : 'text-warning-700'}`}>
              {analytics.balanced
                ? 'Adds up exactly'
                : `Parts total ${formatUnits(analytics.partSum)} · off by ${formatUnits(Math.abs(analytics.shippedBalance))} (audit / reship overlap)`}
            </p>
          </div>
          <p className="mb-3 flex flex-wrap items-center gap-x-1 gap-y-1 text-[13px] font-semibold tabular-nums text-wk-ink sm:text-sm">
            <span className="font-medium text-wk-body">Shipped</span>
            <span>{formatUnits(analytics.sent)}</span>
            <span className="text-wk-muted">=</span>
            {analytics.segments.map((segment, i) => (
              <span key={segment.key} className="inline-flex items-center gap-1">
                {i > 0 && <span className="text-wk-muted">+</span>}
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs sm:text-xs" style={{ background: segment.track, color: segment.color }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: segment.color }} />
                  {segment.label} {formatUnits(segment.units)}
                </span>
              </span>
            ))}
          </p>
          <div
            className="flex h-4 overflow-hidden rounded-full bg-wk-mist ring-1 ring-inset ring-wk-line"
            role="img"
            aria-label={analytics.segments.map((s) => `${s.label} ${s.units}`).join(', ')}
          >
            {analytics.segments.map((segment) => (
              <span
                key={segment.key}
                title={`${segment.label}: ${segment.units} units`}
                className="h-full min-w-0 transition-[width] duration-700 ease-out"
                style={{
                  width: barReady && segment.units > 0 ? `${segment.pct}%` : 0,
                  background: segment.color,
                }}
              />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {analytics.segments.map((segment, index) => {
            const Icon = SEGMENT_ICONS[segment.key];
            const tip = getSegmentTooltip(segment, analytics, hubSummary);
            const align = index === 0 ? 'left' : index === analytics.segments.length - 1 ? 'right' : 'center';
            return (
              <div
                key={segment.key}
                className="group relative z-0 rounded-2xl border border-wk-line bg-white px-3 py-3 transition hover:z-[80] hover:border-wk-control"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-full"
                    style={{ background: segment.track, color: segment.color }}
                  >
                    {Icon ? <Icon size={14} /> : null}
                  </span>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: segment.color }} />
                </div>
                <p className="text-xl font-semibold tabular-nums text-wk-ink">{formatUnits(segment.units)}</p>
                <p className="text-sm font-medium text-wk-ink">{segment.label}</p>
                <p className="mt-0.5 text-xs leading-snug text-wk-muted">{segment.hint}</p>
                {analytics.sent > 0 && (
                  <p className="mt-1 text-xs font-semibold tabular-nums" style={{ color: segment.color }}>
                    {segment.units} of {formatUnits(analytics.sent)} shipped
                  </p>
                )}
                {tip && (
                  <KpiHoverTip
                    title={tip.title}
                    total={tip.total}
                    lines={tip.lines}
                    equation={tip.equation}
                    align={align}
                    placement={index >= 3 ? 'top' : 'bottom'}
                  />
                )}
              </div>
            );
          })}
        </div>

        {hubRows && (
          <div className="rounded-2xl border border-wk-line bg-wk-cream p-4">
            <h2 className="text-base font-semibold text-wk-ink">
              How the lists map to the cycle
            </h2>
            <p className="mt-0.5 text-[13px] text-wk-body">
              Shipped and acknowledged OK kits are <strong className="text-wk-ink">Completed</strong>.
              The leftover units from that same receipt are <strong className="text-wk-ink">Lost / Mismatch / Damaged</strong>.
            </p>
            <div className="mt-3 space-y-2">
              {hubRows.map((row) => {
                const differs =
                  row.rightUnits != null && row.leftUnits !== row.rightUnits;
                return (
                  <div
                    key={row.id}
                    className={`rounded-xl border bg-white px-3 py-2.5 ${
                      differs ? 'border-warning-200' : 'border-wk-line'
                    }`}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-[13px] font-semibold text-wk-ink">
                        {row.leftLabel}{' '}
                        <span className="tabular-nums text-wk-orange-text">{formatUnits(row.leftUnits)}</span>
                        <span className="mx-1.5 font-semibold text-wk-muted">vs</span>
                        {row.rightLabel}{' '}
                        <span className="tabular-nums">
                          {row.rightUnits == null ? '—' : formatUnits(row.rightUnits)}
                        </span>
                        {row.rightRecords != null && (
                          <span className="ml-1 font-semibold text-wk-muted">
                            · {row.rightRecords} record{row.rightRecords === 1 ? '' : 's'}
                          </span>
                        )}
                      </p>
                    </div>
                    <p className="mt-1 text-xs leading-snug text-wk-muted">{row.why}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl bg-wk-cream px-4 py-3 text-[13px] text-wk-body">
          <span className="inline-flex items-center gap-1.5">
            <Clock size={13} className="text-warning-700" />
            Pending (not shipped yet):{' '}
            <strong className="text-wk-ink">{formatUnits(analytics.pending)} units</strong>
          </span>
          <span>
            Replacements:{' '}
            <strong className="text-wk-ink">{formatUnits(analytics.replaced)} units</strong>
          </span>
          <span>
            Scheduled = shipped + pending:{' '}
            <strong className="text-wk-ink">{formatUnits(analytics.scheduled)} units</strong>
          </span>
          {analytics.rejected > 0 && (
            <span>
              Rejected by AM {formatUnits(analytics.rejectedByAm)} · Admin {formatUnits(analytics.rejectedByAdmin)}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
