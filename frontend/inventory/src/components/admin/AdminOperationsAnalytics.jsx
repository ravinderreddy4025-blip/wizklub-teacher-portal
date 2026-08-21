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
      <div className={`overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white ${className}`}>
        <div className="animate-pulse space-y-4 p-5 md:p-6">
          <div className="h-3 w-40 rounded bg-[#F1F5F9]" />
          <div className="grid gap-3 md:grid-cols-2">
            <div className="h-28 rounded-2xl bg-[#F8FAFC]" />
            <div className="h-28 rounded-2xl bg-[#F8FAFC]" />
          </div>
          <div className="h-4 rounded-full bg-[#F1F5F9]" />
        </div>
      </div>
    );
  }

  return (
    <section
      className={`relative rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_12px_40px_-18px_rgba(15,23,42,0.18)] ${className}`}
      aria-label="Unit analytics: shipped, acknowledged, and justification"
    >
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[#F89C28]/10 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-24 left-10 h-48 w-48 rounded-full bg-[#F7941D]/10 blur-3xl" />

      <div className="relative z-10 space-y-5 p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#F89C28]">Unit analytics</p>
            <h3 className="mt-1 font-heading text-lg font-bold text-[#1F2937] md:text-xl">
              Shipped → acknowledged, then the justification
            </h3>
            <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-[#6B7280]">
              Every number is <span className="font-semibold text-[#1F2937]">kit units</span>, not shipment
              records. The bar accounts for what left the warehouse this month.
            </p>
          </div>
          {onDownloadPdf && (
            <button
              type="button"
              disabled={downloading}
              onClick={onDownloadPdf}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-bold text-[#1F2937] shadow-sm transition hover:border-[#F89C28] hover:text-[#F89C28] disabled:opacity-60"
            >
              <FileDown size={14} />
              {downloading ? 'Generating…' : 'Download PDF'}
            </button>
          )}
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_auto_1fr]">
          <article className="group relative z-0 rounded-2xl bg-gradient-to-br from-[#101828] via-[#1F2937] to-[#7C4A12] p-5 text-white shadow-lg hover:z-[80]">
            <div className="pointer-events-none absolute -right-6 top-4 opacity-20">
              <Truck size={88} strokeWidth={1.25} />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#FBB040]">Shipped</p>
            <p className="mt-2 font-heading text-4xl font-bold tabular-nums tracking-tight md:text-5xl">
              {formatUnits(shippedCount)}
            </p>
            <p className="mt-1 text-sm text-white/70">kit units actually sent</p>
            <KpiHoverTip
              {...getShippedTooltip(analytics)}
              align="left"
            />
          </article>

          <div className="hidden items-center justify-center text-[#F89C28] lg:flex" aria-hidden="true">
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[#F89C28]/30 bg-[#FFF8F0]">
              <ArrowRight size={18} />
            </span>
          </div>

          <article className="group relative z-0 rounded-2xl border border-[#BBF7D0] bg-gradient-to-br from-[#F0FDF4] to-white p-5 shadow-sm hover:z-[80]">
            <div className="pointer-events-none absolute -right-4 top-3 text-[#16A34A]/15">
              <CheckCircle2 size={88} strokeWidth={1.25} />
            </div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#16A34A]">Acknowledged</p>
                <p className="mt-2 font-heading text-4xl font-bold tabular-nums tracking-tight text-[#14532D] md:text-5xl">
                  {formatUnits(ackCount)}
                </p>
                <p className="mt-1 text-sm text-[#4B5563]">units received OK</p>
              </div>
              <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-full border-4 border-[#16A34A] bg-white text-center shadow-sm">
                <span className="font-heading text-sm font-bold leading-none text-[#14532D]">{analytics.ackRate}%</span>
                <span className="mt-0.5 text-[8px] font-bold uppercase tracking-wider text-[#6B7280]">of sent</span>
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
            <p className="text-[11px] font-bold uppercase tracking-widest text-[#6B7280]">
              Justification · {formatUnits(analytics.sent)} units shipped
            </p>
            <p className={`text-[11px] font-semibold ${analytics.balanced ? 'text-[#16A34A]' : 'text-[#D97706]'}`}>
              {analytics.balanced
                ? 'Adds up exactly'
                : `Parts total ${formatUnits(analytics.partSum)} · off by ${formatUnits(Math.abs(analytics.shippedBalance))} (audit / reship overlap)`}
            </p>
          </div>
          <p className="mb-3 flex flex-wrap items-center gap-x-1 gap-y-1 font-heading text-[13px] font-bold tabular-nums text-[#1F2937] sm:text-sm">
            <span className="text-[#6B7280] font-semibold">Shipped</span>
            <span>{formatUnits(analytics.sent)}</span>
            <span className="text-[#9CA3AF]">=</span>
            {analytics.segments.map((segment, i) => (
              <span key={segment.key} className="inline-flex items-center gap-1">
                {i > 0 && <span className="text-[#9CA3AF]">+</span>}
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] sm:text-xs" style={{ background: segment.track, color: segment.color }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: segment.color }} />
                  {segment.label} {formatUnits(segment.units)}
                </span>
              </span>
            ))}
          </p>
          <div
            className="flex h-4 overflow-hidden rounded-full bg-[#F1F5F9] ring-1 ring-inset ring-[#E5E7EB]"
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
                className="group relative z-0 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/80 px-3 py-3 transition hover:z-[80] hover:-translate-y-0.5 hover:border-[#F89C28]/40 hover:bg-white hover:shadow-sm"
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
                <p className="font-heading text-xl font-bold tabular-nums text-[#1F2937]">{formatUnits(segment.units)}</p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">{segment.label}</p>
                <p className="mt-0.5 text-[10px] leading-snug text-[#9CA3AF]">{segment.hint}</p>
                {analytics.sent > 0 && (
                  <p className="mt-1 text-[10px] font-semibold tabular-nums" style={{ color: segment.color }}>
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
          <div className="rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-[#F89C28]">
              How the lists map to the cycle
            </p>
            <p className="mt-1 text-[12px] text-[#6B7280]">
              Shipped and acknowledged OK kits are <strong className="text-[#1F2937]">Completed</strong>.
              The leftover units from that same receipt are <strong className="text-[#1F2937]">Lost / Mismatch / Damaged</strong>.
            </p>
            <div className="mt-3 space-y-2">
              {hubRows.map((row) => {
                const differs =
                  row.rightUnits != null && row.leftUnits !== row.rightUnits;
                return (
                  <div
                    key={row.id}
                    className={`rounded-xl border bg-white px-3 py-2.5 ${
                      differs ? 'border-[#F59E0B]/40' : 'border-[#E5E7EB]'
                    }`}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-[12px] font-bold text-[#1F2937]">
                        {row.leftLabel}{' '}
                        <span className="tabular-nums text-[#F89C28]">{formatUnits(row.leftUnits)}</span>
                        <span className="mx-1.5 font-semibold text-[#9CA3AF]">vs</span>
                        {row.rightLabel}{' '}
                        <span className="tabular-nums">
                          {row.rightUnits == null ? '—' : formatUnits(row.rightUnits)}
                        </span>
                        {row.rightRecords != null && (
                          <span className="ml-1 font-semibold text-[#9CA3AF]">
                            · {row.rightRecords} record{row.rightRecords === 1 ? '' : 's'}
                          </span>
                        )}
                      </p>
                    </div>
                    <p className="mt-1 text-[11px] leading-snug text-[#6B7280]">{row.why}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-dashed border-[#E5E7EB] bg-[#FFFAF3]/80 px-4 py-3 text-[12px] text-[#6B7280]">
          <span className="inline-flex items-center gap-1.5">
            <Clock size={13} className="text-[#F59E0B]" />
            Pending (not shipped yet):{' '}
            <strong className="text-[#1F2937]">{formatUnits(analytics.pending)} units</strong>
          </span>
          <span>
            Replacements:{' '}
            <strong className="text-[#1F2937]">{formatUnits(analytics.replaced)} units</strong>
          </span>
          <span>
            Scheduled = shipped + pending:{' '}
            <strong className="text-[#1F2937]">{formatUnits(analytics.scheduled)} units</strong>
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
