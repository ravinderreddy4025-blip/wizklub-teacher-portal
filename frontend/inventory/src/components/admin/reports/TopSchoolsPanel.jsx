import React from 'react';
import { formatIssueRate } from '../../../utils/reportsAnalytics';
import { formatSchoolDisplayName as formatName } from '../../../utils/schoolName';

function RankingTable({ title, subtitle, rows, valueKey, formatValue }) {
  return (
    <div className="rounded-2xl bg-white shadow-card p-4">
      <p className="text-sm font-bold text-wk-ink">{title}</p>
      <p className="mt-0.5 text-xs text-wk-muted">{subtitle}</p>
      <table className="mt-3 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-wk-line text-sm font-medium text-wk-muted">
            <th className="w-8 pb-2 pr-2">#</th>
            <th className="pb-2">School</th>
            <th className="pb-2 text-right">{valueKey}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-wk-line">
          {rows.length === 0 && (
            <tr>
              <td colSpan={3} className="py-6 text-center text-wk-muted">No schools in this ranking.</td>
            </tr>
          )}
          {rows.map((row) => (
            <tr key={`${row.schoolId}-${row.rank}`}>
              <td className="py-2.5 pr-2 text-wk-muted">{row.rank}</td>
              <td className="py-2.5">
                <p className="font-semibold text-wk-ink">{formatName(row.schoolName)}</p>
                <p className="text-xs text-wk-muted">{row.divisionName}</p>
              </td>
              <td className="py-2.5 text-right font-medium tabular-nums text-wk-ink">
                {formatValue(row)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function TopSchoolsPanel({ topSchools, loading }) {
  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-64 animate-pulse rounded-2xl bg-wk-mist" />
        <div className="h-64 animate-pulse rounded-2xl bg-wk-mist" />
      </div>
    );
  }

  return (
    <section>
      <div className="mb-3">
        <h2 className="text-base font-semibold text-wk-ink">Schools with most issues</h2>
        <p className="mt-1 text-[13px] text-wk-muted">
          Volume shows operational workload; rate compares quality (min. 10 shipped kits).
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <RankingTable
          title="Top 5 by affected kits"
          subtitle="Highest problem volume this month"
          rows={topSchools?.byAffected || []}
          valueKey="Affected"
          formatValue={(row) => row.affectedKits ?? 0}
        />
        <RankingTable
          title="Top 5 by issue rate"
          subtitle="Highest affected ÷ shipped %"
          rows={topSchools?.byIssueRate || []}
          valueKey="Rate"
          formatValue={(row) => formatIssueRate(row.issueRate)}
        />
      </div>
    </section>
  );
}
