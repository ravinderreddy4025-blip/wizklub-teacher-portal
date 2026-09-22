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
    <div className="flex min-h-[18rem] flex-col items-center justify-center rounded-2xl bg-wk-cream px-6 py-12 text-center">
      <p className="text-base font-semibold text-wk-ink">Not enough historical data yet</p>
      <p className="mt-2 max-w-md text-sm text-wk-body">
        Issue trends will appear here as monthly data accumulates.
      </p>
      {availableMonths === 1 && (
        <p className="mt-4 text-[13px] font-medium text-wk-orange-text">
          1 month of data available
        </p>
      )}
      {availableMonths === 0 && (
        <p className="mt-4 text-[13px] font-medium text-wk-muted">
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
    return <div className="h-72 animate-pulse rounded-2xl bg-wk-mist" />;
  }

  const subtitle = showChart
    ? showRate
      ? `Showing ${chartMonths} month${chartMonths === 1 ? '' : 's'} of available history — issue rate per month.`
      : `Showing ${chartMonths} month${chartMonths === 1 ? '' : 's'} of available history — affected kits by type.`
    : 'Issue volume — receipt-issue affected kits by type over time.';

  return (
    <section className="rounded-2xl bg-white shadow-card p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-wk-ink">Issue trends</h2>
          <p className="mt-0.5 text-[13px] text-wk-body">{subtitle}</p>
        </div>
        {showChart && (
          <div className="inline-flex gap-2" role="group" aria-label="Chart measure">
            <button
              type="button"
              onClick={() => setShowRate(false)}
              aria-pressed={!showRate}
              className={`wk-seg !min-h-[36px] ${!showRate ? 'wk-seg-active' : ''}`}
            >
              Volume
            </button>
            <button
              type="button"
              onClick={() => setShowRate(true)}
              aria-pressed={showRate}
              className={`wk-seg !min-h-[36px] ${showRate ? 'wk-seg-active' : ''}`}
            >
              Issue rate
            </button>
          </div>
        )}
      </div>
      {!showChart ? (
        <TrendEmptyState availableMonths={availableMonths} />
      ) : (
        <figure className="h-80 w-full" aria-label={showRate ? 'Issue rate per month, percent' : 'Affected kits per month by issue type'}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E6E7E8" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 12, fill: '#52565C' }}
                tickLine={false}
                axisLine={{ stroke: '#CECFD0' }}
                label={{ value: 'Month', position: 'insideBottom', offset: -16, fontSize: 12, fill: '#52565C' }}
              />
              <YAxis
                tick={{ fontSize: 12, fill: '#52565C' }}
                tickLine={false}
                axisLine={false}
                allowDecimals={showRate}
                label={{ value: showRate ? 'Issue rate (%)' : 'Affected kits (units)', angle: -90, position: 'insideLeft', offset: 4, fontSize: 12, fill: '#52565C', style: { textAnchor: 'middle' } }}
              />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 12px rgba(0,0,0,0.16)', fontFamily: 'Poppins, sans-serif', fontSize: 13 }}
                formatter={(value, name) => [showRate ? `${value}%` : `${value} kits`, name]}
              />
              <Legend verticalAlign="top" height={32} iconType="circle" wrapperStyle={{ fontSize: 12, color: '#52565C' }} />
              {showRate ? (
                <Line type="monotone" dataKey="issueRate" name="Issue rate %" stroke={ISSUE_COLORS.rate} strokeWidth={2.5} dot={{ r: 3 }} />
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
        </figure>
      )}
    </section>
  );
}
