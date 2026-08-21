import React, { useEffect, useState, useCallback } from 'react';
import { FileDown } from 'lucide-react';
import api from '../../utils/api';
import toast from '../../utils/toast';
import downloadPdfBlob from '../../utils/downloadPdfBlob';
import { formatSchoolDisplayName } from '../../utils/schoolName';
import { formatFulfillment, formatIssueRate, formatMonthLong } from '../../utils/reportsAnalytics';
import ReportsFiltersBar from './reports/ReportsFiltersBar';
import MonthlyPerformanceKpis from './reports/MonthlyPerformanceKpis';
import IssueTrendChart from './reports/IssueTrendChart';
import IssueCompositionChart from './reports/IssueCompositionChart';
import TopSchoolsPanel from './reports/TopSchoolsPanel';

function defaultMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function AdminReportsSection({ registrySection, divisions = [] }) {
  const [reportMonth, setReportMonth] = useState(defaultMonthValue());
  const [trendMonths, setTrendMonths] = useState(6);
  const [divisionId, setDivisionId] = useState('');
  const [schoolId, setSchoolId] = useState('');
  const [issueType, setIssueType] = useState('all');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState(null);

  const loadMonthlyReport = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/reports/monthly', {
        params: {
          month: reportMonth,
          trendMonths,
          divisionId: divisionId || undefined,
          schoolId: schoolId || undefined,
          issueType,
        },
      });
      setReport(res.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load monthly report');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [reportMonth, trendMonths, divisionId, schoolId, issueType]);

  useEffect(() => {
    loadMonthlyReport();
  }, [loadMonthlyReport]);

  const handleDownloadPdf = async (rowSchoolId, schoolName) => {
    try {
      setDownloadingId(rowSchoolId);
      const res = await api.get(`/admin/reports/school/${rowSchoolId}/pdf`, {
        params: { month: reportMonth },
        responseType: 'blob',
      });
      const safeName = (schoolName || 'school').replace(/[^\w-]+/g, '_').slice(0, 40);
      downloadPdfBlob(res.data, `wizklub-report-${safeName}-${reportMonth}.pdf`);
      toast.success('PDF downloaded');
    } catch {
      toast.error('Failed to download school report PDF');
    } finally {
      setDownloadingId(null);
    }
  };

  const schools = report?.schools || [];

  return (
    <div className="space-y-6">
      <section className="stitch-card-pad md:p-5 space-y-6">
        <div>
          <h3 className="font-heading text-base font-bold text-[var(--stitch-text)]">Monthly reports</h3>
          <p className="mt-1 text-[13px] text-[var(--stitch-muted)]">
            Management analytics — what happened, where problems occurred, and whether they are improving.
          </p>
        </div>

        <ReportsFiltersBar
          reportMonth={reportMonth}
          onMonthChange={setReportMonth}
          trendMonths={trendMonths}
          onTrendMonthsChange={setTrendMonths}
          divisionId={divisionId}
          onDivisionChange={(value) => {
            setDivisionId(value);
            setSchoolId('');
          }}
          schoolId={schoolId}
          onSchoolChange={setSchoolId}
          issueType={issueType}
          onIssueTypeChange={setIssueType}
          divisions={divisions}
        />

        <MonthlyPerformanceKpis kpis={report?.kpis} loading={loading} />

        <IssueTrendChart trends={report?.trends} loading={loading} />

        <div className="grid gap-4 xl:grid-cols-2">
          <IssueCompositionChart composition={report?.composition} loading={loading} />
          <TopSchoolsPanel topSchools={report?.topSchools} loading={loading} />
        </div>

        <div className="overflow-hidden rounded-xl border border-[var(--stitch-border)]">
          <div className="border-b border-[var(--stitch-border)] bg-[var(--stitch-canvas)]/80 px-5 py-4">
            <h4 className="font-bold text-[var(--stitch-text)]">School-wise monthly report</h4>
            <p className="mt-1 text-xs text-[var(--stitch-muted)]">
              Detailed metrics for {formatMonthLong(reportMonth)}. Download PDF for audit history per school.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead className="stitch-table-head">
                <tr className="border-b border-[var(--stitch-border)]">
                  {['School', 'Division', 'Shipped', 'Received', 'Replacements', 'Affected', 'Issue rate', 'Fulfillment', 'PDF'].map(
                    (col) => (
                      <th key={col} className={col === 'PDF' ? 'text-right' : ''}>{col}</th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                {schools.map((row) => {
                  const fulfillment = formatFulfillment(row.fulfillment);
                  return (
                    <tr key={row.schoolId} className="transition hover:bg-[#F8FAFC]">
                      <td className="px-5 py-3.5 font-bold text-[#1F2937]">{formatSchoolDisplayName(row.schoolName)}</td>
                      <td className="px-5 py-3.5 text-sm text-[#6B7280]">{row.divisionName}</td>
                      <td className="px-5 py-3.5 text-sm font-semibold text-[#1F2937]">{row.shippedKits ?? 0}</td>
                      <td className="px-5 py-3.5 text-sm">{row.receivedKits ?? 0}</td>
                      <td className="px-5 py-3.5 text-sm">{row.replacedKits ?? 0}</td>
                      <td className="px-5 py-3.5 text-sm">{row.affectedKits ?? 0}</td>
                      <td className="px-5 py-3.5 text-sm tabular-nums">{formatIssueRate(row.issueRate)}</td>
                      <td className="px-5 py-3.5 text-sm">
                        <span className="font-semibold tabular-nums">{fulfillment.primary}</span>
                        <span className="ml-1 text-[10px] text-[#9CA3AF]">{fulfillment.secondary}</span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          type="button"
                          disabled={downloadingId === row.schoolId}
                          onClick={() => handleDownloadPdf(row.schoolId, row.schoolName)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-bold text-[#1F2937] transition hover:border-[#F89C28] hover:text-[#F89C28] disabled:opacity-60"
                        >
                          <FileDown size={14} />
                          {downloadingId === row.schoolId ? 'Generating…' : 'Download'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!loading && schools.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-5 py-10 text-center text-[#6B7280]">
                      No school activity recorded for this scope and month.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {registrySection}
    </div>
  );
}
