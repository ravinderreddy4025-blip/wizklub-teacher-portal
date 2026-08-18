import React, { useEffect, useState, useCallback } from 'react';
import { FileDown } from 'lucide-react';
import api from '../../utils/api';
import toast from '../../utils/toast';
import OperationsKpiPanel from '../shared/OperationsKpiPanel';
import downloadPdfBlob from '../../utils/downloadPdfBlob';
import { formatSchoolDisplayName } from '../../utils/schoolName';

function defaultMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(month) {
  const [year, m] = (month || '').split('-').map(Number);
  if (!year || !m) return month;
  return new Date(year, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export default function AdminReportsSection({ registrySection }) {
  const [reportMonth, setReportMonth] = useState(defaultMonthValue());
  const [summary, setSummary] = useState(null);
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState(null);

  const loadMonthlyReport = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/reports/monthly', { params: { month: reportMonth } });
      setSummary(res.data.summary || null);
      setSchools(res.data.schools || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load monthly report');
      setSummary(null);
      setSchools([]);
    } finally {
      setLoading(false);
    }
  }, [reportMonth]);

  useEffect(() => {
    loadMonthlyReport();
  }, [loadMonthlyReport]);

  const handleDownloadPdf = async (schoolId, schoolName) => {
    try {
      setDownloadingId(schoolId);
      const res = await api.get(`/admin/reports/school/${schoolId}/pdf`, {
        params: { month: reportMonth },
        responseType: 'blob',
      });
      const safeName = (schoolName || 'school').replace(/[^\w-]+/g, '_').slice(0, 40);
      downloadPdfBlob(res.data, `wizklub-report-${safeName}-${reportMonth}.pdf`);
      toast.success('PDF downloaded');
    } catch (err) {
      toast.error('Failed to download school report PDF');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="stitch-card-pad md:p-5">
        <div className="mb-4 flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
          <div>
            <h3 className="font-heading text-base font-bold text-[var(--stitch-text)]">Monthly operations report</h3>
            <p className="mt-1 text-[13px] text-[var(--stitch-muted)]">
              Sent is kits that actually left the warehouse. Scheduled includes sent plus still-pending
              dispatches. Then acknowledged, mismatch, lost, damaged, and rejected (by AM or Admin).
            </p>
          </div>
          <div className="flex min-w-[180px] flex-col gap-1.5">
            <label className="stitch-label">Report month</label>
            <input
              type="month"
              className="stitch-input"
              value={reportMonth}
              onChange={(e) => setReportMonth(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <p className="py-10 text-center text-[#6B7280]">Loading monthly report…</p>
        ) : (
          <>
            <div className="mb-4">
              <OperationsKpiPanel summary={summary} />
            </div>

            <div className="overflow-hidden rounded-xl border border-[var(--stitch-border)]">
              <div className="border-b border-[var(--stitch-border)] bg-[var(--stitch-canvas)]/80 px-5 py-4">
                <h4 className="font-bold text-[var(--stitch-text)]">School consolidated reports</h4>
                <p className="mt-1 text-xs text-[var(--stitch-muted)]">
                  Download a PDF summary per school for {formatMonthLabel(reportMonth)}.
                  Scheduled includes sent. Rejected shows AM vs Admin.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead className="stitch-table-head">
                    <tr className="border-b border-[var(--stitch-border)]">
                      {['School', 'Division', 'Sent', 'Scheduled', 'Ack', 'Mismatch', 'Lost', 'Damaged', 'Rejected', 'PDF'].map(
                        (col) => (
                          <th key={col} className={col === 'PDF' ? 'text-right' : ''}>
                            {col}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E7EB]">
                    {schools.map((row) => (
                      <tr key={row.schoolId} className="transition hover:bg-[#F8FAFC]">
                        <td className="px-5 py-3.5 font-bold text-[#1F2937]">
                          {formatSchoolDisplayName(row.schoolName)}
                        </td>
                        <td className="px-5 py-3.5 text-sm text-[#6B7280]">{row.divisionName}</td>
                        <td className="px-5 py-3.5 text-sm font-semibold text-[#1F2937]">{row.sentKits ?? row.dispatchedKits}</td>
                        <td className="px-5 py-3.5 text-sm">{row.scheduledKits ?? 0}</td>
                        <td className="px-5 py-3.5 text-sm">{row.acknowledgedKits}</td>
                        <td className="px-5 py-3.5 text-sm">{row.mismatchKits ?? 0}</td>
                        <td className="px-5 py-3.5 text-sm">{row.lostKits}</td>
                        <td className="px-5 py-3.5 text-sm">{row.damagedKits}</td>
                        <td className="px-5 py-3.5 text-sm">
                          {row.rejectedKits ?? 0}
                          <span className="ml-1 text-[10px] text-[#9CA3AF]">
                            AM {row.rejectedByAm ?? 0} · Admin {row.rejectedByAdmin ?? 0}
                          </span>
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
                    ))}
                    {schools.length === 0 && (
                      <tr>
                        <td colSpan={10} className="px-5 py-10 text-center text-[#6B7280]">
                          No school activity recorded for this month.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </section>

      {registrySection}
    </div>
  );
}
