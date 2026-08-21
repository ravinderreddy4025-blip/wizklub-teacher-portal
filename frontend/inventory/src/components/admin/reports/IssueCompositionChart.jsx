import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ISSUE_COLORS, compositionChartData } from '../../../utils/reportsAnalytics';

export default function IssueCompositionChart({ composition, loading }) {
  const data = useMemo(() => compositionChartData(composition), [composition]);
  const total = composition?.totalAffected ?? 0;

  if (loading) {
    return <div className="h-64 animate-pulse rounded-2xl bg-[#F1F5F9]" />;
  }

  return (
    <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
      <div className="mb-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#F89C28]">Issue composition</p>
        <p className="mt-1 text-[13px] text-[#6B7280]">
          How affected kits split by issue type this month ({total} total).
        </p>
      </div>
      {data.length === 0 ? (
        <p className="py-16 text-center text-sm text-[#6B7280]">No receipt issues recorded for this month.</p>
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={88} paddingAngle={2}>
                {data.map((entry) => (
                  <Cell key={entry.key} fill={ISSUE_COLORS[entry.key]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
