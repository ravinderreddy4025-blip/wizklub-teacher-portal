import React, { useMemo, useState } from 'react';
import { CalendarDays, Trash2 } from 'lucide-react';
import toast from '../../utils/toast';
import api from '../../utils/api';

function getNextAuditMonth() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `${next.getFullYear()}-${next.getMonth() + 1}`;
}

function formatAuditMonthLabel(auditMonth) {
  const [year, month] = auditMonth.split('-').map(Number);
  if (!year || !month) return auditMonth;
  return new Date(year, month - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
}

const fieldClass =
  'h-11 w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] px-3 text-sm text-[#1F2937] outline-none transition focus:border-[#F89C28] focus:ring-2 focus:ring-[#F89C28]/15';
const labelClass = 'text-[11px] font-bold uppercase tracking-wider text-[#6B7280]';

const AdminAuditScheduler = ({ divisions, auditWindows, onRefresh }) => {
  const nextAuditMonth = useMemo(() => getNextAuditMonth(), []);
  const [divisionId, setDivisionId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [saving, setSaving] = useState(false);

  const existingForSelection = useMemo(() => {
    if (!divisionId) return null;
    return auditWindows.find(
      (w) => (w.divisionId?._id || w.divisionId) === divisionId && w.auditMonth === nextAuditMonth
    );
  }, [auditWindows, divisionId, nextAuditMonth]);

  const handleDivisionChange = (id) => {
    setDivisionId(id);
    const existing = auditWindows.find(
      (w) => (w.divisionId?._id || w.divisionId) === id && w.auditMonth === nextAuditMonth
    );
    if (existing) {
      setStartDate(existing.startDate ? existing.startDate.slice(0, 10) : '');
      setEndDate(existing.endDate ? existing.endDate.slice(0, 10) : '');
    } else {
      setStartDate('');
      setEndDate('');
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!divisionId) {
      toast.error('Select a division');
      return;
    }
    setSaving(true);
    try {
      const res = await api.post('/admin/audit-windows', {
        divisionId,
        auditMonth: nextAuditMonth,
        startDate,
        endDate,
      });
      toast.success(res.data.message || 'Audit window saved');
      onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save audit window');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!(await toast.confirm('Remove this scheduled audit window?'))) return;
    try {
      await api.delete(`/admin/audit-windows/${id}`);
      toast.success('Audit window removed');
      onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to remove audit window');
    }
  };

  const upcomingWindows = useMemo(
    () =>
      [...auditWindows]
        .filter((w) => w.auditMonth === nextAuditMonth)
        .sort((a, b) => (a.divisionId?.name || '').localeCompare(b.divisionId?.name || '')),
    [auditWindows, nextAuditMonth]
  );

  return (
    <div className="mb-8 space-y-6">
      <section className="overflow-hidden rounded-2xl border border-[#E5E7EB] border-t-4 border-t-[#F89C28] bg-white shadow-[0_10px_40px_rgba(0,0,0,0.04)]">
        <div className="p-4 md:p-5">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#F89C28]/10 text-[#F89C28]">
              <CalendarDays size={18} />
            </div>
            <div>
              <h3 className="font-heading text-base font-bold text-[#1F2937]">Schedule Audit Window</h3>
              <p className="mt-1 text-[13px] text-[#6B7280]">
                Select a division and set audit dates for{' '}
                <strong className="text-[#1F2937]">{formatAuditMonthLabel(nextAuditMonth)}</strong>. All schools in
                that division share the same window.
              </p>
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label className={labelClass} htmlFor="audit-scheduler-division">Division</label>
                <select
                  id="audit-scheduler-division"
                  className={fieldClass}
                  value={divisionId}
                  onChange={(e) => handleDivisionChange(e.target.value)}
                  required
                >
                  <option value="">Select division…</option>
                  {divisions.map((d) => (
                    <option key={d._id} value={d._id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelClass} htmlFor="audit-scheduler-month">Audit Month</label>
                <input id="audit-scheduler-month" className={`${fieldClass} bg-[#F1F5F9]`} readOnly value={formatAuditMonthLabel(nextAuditMonth)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelClass} htmlFor="audit-scheduler-start">Audit Start Date</label>
                <input
                  id="audit-scheduler-start"
                  type="date"
                  className={fieldClass}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelClass} htmlFor="audit-scheduler-end">Audit End Date</label>
                <input
                  id="audit-scheduler-end"
                  type="date"
                  className={fieldClass}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs italic text-[#6B7280]">
                Schools in the selected division can submit {formatAuditMonthLabel(nextAuditMonth)} audits only between
                these dates.
              </p>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center justify-center rounded-xl bg-[#F89C28] px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-orange-200 transition hover:bg-[#E88914] disabled:opacity-60"
              >
                {saving ? 'Saving…' : existingForSelection ? 'Update Audit Window' : 'Save Audit Window'}
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_10px_40px_rgba(0,0,0,0.04)]">
        <div className="border-b border-[#E5E7EB] px-4 py-3">
          <h3 className="font-heading text-base font-bold text-[#1F2937]">
            Scheduled for {formatAuditMonthLabel(nextAuditMonth)}
          </h3>
        </div>
        {upcomingWindows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-[#E5E7EB] bg-[#F8FAFC]">
                  {['Division', 'Start', 'End', 'Actions'].map((col) => (
                    <th
                      key={col}
                      className={`px-6 py-3 text-[11px] font-bold uppercase tracking-wider text-[#6B7280] ${
                        col === 'Actions' ? 'text-right' : ''
                      }`}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                {upcomingWindows.map((w) => (
                  <tr key={w._id} className="hover:bg-[#F8FAFC]">
                    <td className="px-6 py-3.5 font-bold text-[#1F2937]">{w.divisionId?.name || '—'}</td>
                    <td className="px-6 py-3.5 text-sm text-[#6B7280]">
                      {new Date(w.startDate).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-3.5 text-sm text-[#6B7280]">
                      {new Date(w.endDate).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(w._id)}
                        className="rounded-lg p-2 text-[#EF4444] transition hover:bg-[#EF4444] hover:text-white"
                        aria-label="Remove audit window"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-6 py-10 text-center text-[#6B7280]">
            No audit windows scheduled for the upcoming month yet.
          </p>
        )}
      </section>
    </div>
  );
};

export default AdminAuditScheduler;
