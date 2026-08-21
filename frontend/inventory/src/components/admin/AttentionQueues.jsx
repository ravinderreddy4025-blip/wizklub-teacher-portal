import React from 'react';
import { Link } from 'react-router-dom';

function agingLabel(aging = {}) {
  const parts = [];
  if (aging.lt24h) parts.push(`<24h ${aging.lt24h}`);
  if (aging.h24to48) parts.push(`24–48h ${aging.h24to48}`);
  if (aging.gt48h) parts.push(`>48h ${aging.gt48h}`);
  return parts.join(' · ');
}

export default function AttentionQueues({
  queues = [],
  loading = false,
  className = '',
  eyebrow = 'Needs your action',
  title = 'What to deal with right now',
}) {
  if (loading) {
    return (
      <section className={`rounded-2xl border border-[#E5E7EB] bg-white p-5 ${className}`}>
        <p className="text-sm text-[#6B7280]">Loading action queues…</p>
      </section>
    );
  }

  const list = Array.isArray(queues) ? queues : [];
  const total = list.reduce((sum, q) => sum + (q.count || 0), 0);

  return (
    <section className={`rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_12px_40px_-18px_rgba(15,23,42,0.18)] ${className}`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#F89C28]">{eyebrow}</p>
      <h3 className="mt-1 font-heading text-lg font-bold text-[#1F2937]">{title}</h3>
      <p className="mt-1 text-[12px] text-[#6B7280]">
        {total === 0 ? 'No action queues right now.' : `${total} open action${total === 1 ? '' : 's'} across queues.`}
      </p>
      <div className="mt-4 divide-y divide-[#F1F5F9]">
        {list.map((queue) => (
          <Link
            key={queue.id}
            to={queue.href || '/admin'}
            className="flex items-center justify-between gap-3 py-3 transition hover:bg-[#F8FAFC]"
          >
            <div>
              <p className="text-sm font-bold text-[#1F2937]">{queue.label}</p>
              <p className="text-[11px] text-[#6B7280]">
                {queue.kitsAffected != null
                  ? `${queue.count || 0} claim${queue.count === 1 ? '' : 's'} · ${queue.kitsAffected} kits affected`
                  : (agingLabel(queue.aging) || 'No aging')}
              </p>
            </div>
            <span className={`tabular-nums text-lg font-bold ${queue.count ? 'text-[#F89C28]' : 'text-[#9CA3AF]'}`}>
              {queue.count || 0}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
