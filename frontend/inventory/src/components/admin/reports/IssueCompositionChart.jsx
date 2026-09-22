import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ISSUE_COLORS, compositionChartData } from '../../../utils/reportsAnalytics';

export default function IssueCompositionChart({ composition, loading }) {
  const data = useMemo(() => compositionChartData(composition), [composition]);
  const total = composition?.totalAffected ?? 0;

  if (loading) {
    return <div className="h-64 animate-pulse rounded-2xl bg-wk-mist" />;
  }

  return (
    <section className="rounded-2xl bg-white shadow-card p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-wk-ink">Issue composition</h2>
        <p className="mt-0.5 text-[13px] text-wk-body">
          How affected kits split by issue type this month ({total} total).
        </p>
      </div>
      {data.length === 0 ? (
        <p className="inv-empty inv-empty__text">No receipt issues recorded for this month.</p>
      ) : (
        <figure className="h-64 w-full" aria-label={`Affected kits by issue type, ${total} kits total`}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={88} paddingAngle={2} stroke="#FFFFFF" strokeWidth={2}>
                {data.map((entry) => (
                  <Cell key={entry.key} fill={ISSUE_COLORS[entry.key]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 12px rgba(0,0,0,0.16)', fontFamily: 'Poppins, sans-serif', fontSize: 13 }}
                formatter={(value, name) => [`${value} kits`, name]}
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: '#52565C' }} />
            </PieChart>
          </ResponsiveContainer>
        </figure>
      )}
    </section>
  );
}
