import React, { useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { ISSUE_COLORS, trendChartData } from '../../../utils/reportsAnalytics';

function TrendEmptyState({ availableMonths }) {
  return (
    <div className="flex min-h-[18rem] flex-col items-center justify-center rounded-xl border border-dashed border-[#E5E7EB] bg-[#F8FAFC]/80 px-6 py-12 text-center">
      <p className="font-heading text-base font-bold text-[#1F2937]">Not enough historical data yet</p>
      <p className="mt-2 max-w-md text-sm text-[#6B7280]">
        Issue trends will appear here as monthly data accumulates.
      </p>
      {availableMonths === 1 && (
        <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-[#F89C28]">
          1 month of data available
        </p>
      )}
      {availableMonths === 0 && (
        <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-[#9CA3AF]">
          No reporting months in this scope yet
        </p>
      )}
    </div>
  );
}

export default function IssueTrendChart({ trends, loading }) {
  const [showRate, setShowRate] = useState(false);
  const showChart = trends?.showChart === true;
  const data = useMemo(() => (showChart ? trendChartData(trends) : []), [trends, showChart]);
  const availableMonths = trends?.availableMonths ?? 0;
  const chartMonths = trends?.chartMonths ?? data.length;

  if (loading) {
    return <div className="h-72 animate-pulse rounded-2xl bg-[#F1F5F9]" />;
  }

  const subtitle = showChart
    ? showRate
      ? `Showing ${chartMonths} month${chartMonths === 1 ? '' : 's'} of available history — issue rate per month.`
      : `Showing ${chartMonths} month${chartMonths === 1 ? '' : 's'} of available history — affected kits by type.`
    : 'Issue volume — receipt-issue affected kits by type over time.';

  return (
    <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#F89C28]">Issue trends</p>
          <p className="mt-1 text-[13px] text-[#6B7280]">{subtitle}</p>
        </div>
        {showChart && (
          <div className="inline-flex rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] p-0.5 text-xs font-bold">
            <button
              type="button"
              onClick={() => setShowRate(false)}
              className={`rounded-md px-3 py-1.5 transition ${!showRate ? 'bg-white text-[#1F2937] shadow-sm' : 'text-[#6B7280]'}`}
            >
              Volume
            </button>
            <button
              type="button"
              onClick={() => setShowRate(true)}
              className={`rounded-md px-3 py-1.5 transition ${showRate ? 'bg-white text-[#1F2937] shadow-sm' : 'text-[#6B7280]'}`}
            >
              Issue rate
            </button>
          </div>
        )}
      </div>
      {!showChart ? (
        <TrendEmptyState availableMonths={availableMonths} />
      ) : (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6B7280' }} />
              <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} allowDecimals={showRate} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {showRate ? (
                <Line type="monotone" dataKey="issueRate" name="Issue rate %" stroke={ISSUE_COLORS.rate} strokeWidth={2} dot={{ r: 3 }} />
              ) : (
                <>
                  <Line type="monotone" dataKey="mismatch" name="Mismatch" stroke={ISSUE_COLORS.mismatch} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="notReceived" name="Not received" stroke={ISSUE_COLORS.notReceived} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="damaged" name="Damaged" stroke={ISSUE_COLORS.damaged} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="lost" name="Lost" stroke={ISSUE_COLORS.lost} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="totalAffected" name="Total affected" stroke={ISSUE_COLORS.totalAffected} strokeWidth={2} strokeDasharray="4 4" dot={false} />
                </>
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
