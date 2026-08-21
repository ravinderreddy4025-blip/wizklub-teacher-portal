import React from 'react';
import { formatIssueRate } from '../../../utils/reportsAnalytics';
import { formatSchoolDisplayName as formatName } from '../../../utils/schoolName';

function RankingTable({ title, subtitle, rows, valueKey, formatValue }) {
  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
      <p className="text-sm font-bold text-[#1F2937]">{title}</p>
      <p className="mt-0.5 text-xs text-[#6B7280]">{subtitle}</p>
      <table className="mt-3 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-[#E5E7EB] text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
            <th className="w-8 pb-2 pr-2">#</th>
            <th className="pb-2">School</th>
            <th className="pb-2 text-right">{valueKey}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#F1F5F9]">
          {rows.length === 0 && (
            <tr>
              <td colSpan={3} className="py-6 text-center text-[#6B7280]">No schools in this ranking.</td>
            </tr>
          )}
          {rows.map((row) => (
            <tr key={`${row.schoolId}-${row.rank}`}>
              <td className="py-2.5 pr-2 text-[#6B7280]">{row.rank}</td>
              <td className="py-2.5">
                <p className="font-semibold text-[#1F2937]">{formatName(row.schoolName)}</p>
                <p className="text-[11px] text-[#9CA3AF]">{row.divisionName}</p>
              </td>
              <td className="py-2.5 text-right font-bold tabular-nums text-[#1F2937]">
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
        <div className="h-64 animate-pulse rounded-2xl bg-[#F1F5F9]" />
        <div className="h-64 animate-pulse rounded-2xl bg-[#F1F5F9]" />
      </div>
    );
  }

  return (
    <section>
      <div className="mb-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#F89C28]">Schools with most issues</p>
        <p className="mt-1 text-[13px] text-[#6B7280]">
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
