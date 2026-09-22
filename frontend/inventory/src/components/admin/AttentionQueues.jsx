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
      <section className={`rounded-2xl bg-white p-5 shadow-card ${className}`} aria-busy="true">
        <div className="h-5 w-48 animate-pulse-subtle rounded-md bg-wk-mist" />
        <div className="mt-4 space-y-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse-subtle rounded-xl bg-wk-mist" />)}
        </div>
        <p className="sr-only">Loading action queues…</p>
      </section>
    );
  }

  const list = Array.isArray(queues) ? queues : [];
  const total = list.reduce((sum, q) => sum + (q.count || 0), 0);

  return (
    <section className={`rounded-2xl bg-white shadow-card p-5 ${className}`}>
      <p className="text-sm font-medium text-wk-orange-text">{eyebrow}</p>
      <h2 className="mt-0.5 text-lg font-semibold text-wk-ink">{title}</h2>
      <p className="mt-1 text-[13px] text-wk-body">
        {total === 0 ? 'No action queues right now.' : `${total} open action${total === 1 ? '' : 's'} across queues.`}
      </p>
      <div className="mt-4 divide-y divide-wk-line">
        {list.map((queue) => (
          <Link
            key={queue.id}
            to={queue.href || '/admin'}
            className="-mx-3 flex min-h-[56px] items-center justify-between gap-3 rounded-xl px-3 py-3 transition hover:bg-wk-cream"
          >
            <div>
              <p className="text-sm font-medium text-wk-ink">{queue.label}</p>
              <p className="text-xs text-wk-muted">
                {queue.kitsAffected != null
                  ? `${queue.count || 0} claim${queue.count === 1 ? '' : 's'} · ${queue.kitsAffected} kits affected`
                  : (agingLabel(queue.aging) || 'No aging')}
              </p>
            </div>
            <span
              className={`inline-flex h-8 min-w-[2rem] items-center justify-center rounded-full px-2 text-sm font-semibold tabular-nums ${
                queue.count ? 'bg-wk-peach text-wk-orange-text' : 'bg-wk-mist text-wk-body'
              }`}
            >
              {queue.count || 0}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
