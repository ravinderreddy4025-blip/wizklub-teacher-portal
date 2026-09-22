import React from 'react';
import StatCard from '../StatCard';
import { KPI_CARDS, kpiValue } from '../../../utils/reportsAnalytics';

export default function MonthlyPerformanceKpis({ kpis, loading }) {
  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {KPI_CARDS.map((card) => (
          <div key={card.key} className="h-28 animate-pulse rounded-2xl bg-wk-mist" />
        ))}
      </div>
    );
  }

  const accents = ['primary', 'success', 'blue', 'warning', 'error', 'slate'];

  return (
    <section aria-label="Monthly performance KPIs">
      <div className="mb-3">
        <h2 className="text-base font-semibold text-wk-ink">Monthly performance</h2>
        <p className="mt-1 text-[13px] text-wk-muted">
          What happened this month — kit units for the selected scope.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {KPI_CARDS.map((card, index) => {
          const value = kpiValue(kpis, card.key);
          return (
            <StatCard
              key={card.key}
              label={card.label}
              value={card.isRate ? value.primary : value.primary}
              hint={card.isRate ? `${value.secondary} · ${card.hint}` : card.hint}
              accent={accents[index % accents.length]}
            />
          );
        })}
      </div>
    </section>
  );
}
