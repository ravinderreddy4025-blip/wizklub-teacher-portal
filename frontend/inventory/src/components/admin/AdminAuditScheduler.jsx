import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Trash2 } from 'lucide-react';
import toast from '../../utils/toast';
import api from '../../utils/api';
import {
  addAuditMonths,
  buildAuditMonthOptions,
  compareAuditMonths,
  findActiveScheduleMonth,
  formatAuditMonthLabel,
  getNextAuditMonth,
} from '../../utils/auditMonth';

const fieldClass =
  'stitch-input';
const labelClass = 'stitch-label';

function findWindowForSelection(auditWindows, divisionId, auditMonth) {
  if (!divisionId || !auditMonth) return null;
  return auditWindows.find(
    (w) => (w.divisionId?._id || w.divisionId) === divisionId && w.auditMonth === auditMonth
  );
}

function isMonthFullyScheduled(divisions, auditWindows, auditMonth) {
  if (!divisions.length) return false;
  return divisions.every((division) =>
    auditWindows.some(
      (window) =>
        (window.divisionId?._id || window.divisionId) === division._id
        && window.auditMonth === auditMonth
    )
  );
}

function groupWindowsByMonth(windows) {
  const grouped = {};
  windows.forEach((window) => {
    const key = window.auditMonth || 'unknown';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(window);
  });
  return Object.entries(grouped)
    .sort(([a], [b]) => compareAuditMonths(b, a))
    .map(([month, items]) => ({
      month,
      items: [...items].sort((a, b) => (a.divisionId?.name || '').localeCompare(b.divisionId?.name || '')),
    }));
}

const AdminAuditScheduler = ({ divisions, auditWindows, onRefresh }) => {
  const [scheduleMonth, setScheduleMonth] = useState(() => getNextAuditMonth());
  const [divisionId, setDivisionId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [saving, setSaving] = useState(false);
  const userPickedMonthRef = useRef(false);

  useEffect(() => {
    if (userPickedMonthRef.current || !divisions.length) return;
    setScheduleMonth(findActiveScheduleMonth(divisions, auditWindows));
  }, [divisions, auditWindows]);

  const auditMonthOptions = useMemo(
    () =>
      buildAuditMonthOptions({
        monthsAhead: 12,
        extraMonths: [
          scheduleMonth,
          ...auditWindows.map((w) => w.auditMonth).filter(Boolean),
        ],
      }),
    [scheduleMonth, auditWindows]
  );

  const existingForSelection = useMemo(
    () => findWindowForSelection(auditWindows, divisionId, scheduleMonth),
    [auditWindows, divisionId, scheduleMonth]
  );

  const applyExistingWindow = (existing) => {
    if (existing) {
      setStartDate(existing.startDate ? existing.startDate.slice(0, 10) : '');
      setEndDate(existing.endDate ? existing.endDate.slice(0, 10) : '');
    } else {
      setStartDate('');
      setEndDate('');
    }
  };

  const handleDivisionChange = (id) => {
    setDivisionId(id);
    applyExistingWindow(findWindowForSelection(auditWindows, id, scheduleMonth));
  };

  const handleMonthChange = (month) => {
    userPickedMonthRef.current = true;
    setScheduleMonth(month);
    applyExistingWindow(findWindowForSelection(auditWindows, divisionId, month));
  };

  const advanceToNextMonthIfComplete = (savedMonth, windows) => {
    if (!isMonthFullyScheduled(divisions, windows, savedMonth)) return;
    const nextMonth = addAuditMonths(savedMonth, 1);
    userPickedMonthRef.current = false;
    setScheduleMonth(nextMonth);
    setStartDate('');
    setEndDate('');
    applyExistingWindow(findWindowForSelection(windows, divisionId, nextMonth));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!divisionId) {
      toast.error('Select a division');
      return;
    }
    const savedMonth = scheduleMonth;
    setSaving(true);
    try {
      const res = await api.post('/admin/audit-windows', {
        divisionId,
        auditMonth: savedMonth,
        startDate,
        endDate,
      });
      toast.success(res.data.message || 'Audit window saved');
      await onRefresh();
      const refreshed = await api.get('/admin/audit-windows');
      const windows = refreshed.data.windows || refreshed.data.auditWindows || [];
      advanceToNextMonthIfComplete(savedMonth, windows);
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

  const windowsForMonth = useMemo(
    () =>
      [...auditWindows]
        .filter((w) => w.auditMonth === scheduleMonth)
        .sort((a, b) => (a.divisionId?.name || '').localeCompare(b.divisionId?.name || '')),
    [auditWindows, scheduleMonth]
  );

  const historyGroups = useMemo(
    () =>
      groupWindowsByMonth(
        auditWindows.filter((window) => window.auditMonth && window.auditMonth !== scheduleMonth)
      ),
    [auditWindows, scheduleMonth]
  );

  return (
    <div className="mb-8 space-y-6">
      <section className="overflow-hidden rounded-2xl bg-white shadow-card">
        <div className="p-4 md:p-5">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-wk-peach text-wk-orange-text">
              <CalendarDays size={18} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-wk-ink">Schedule Audit Window</h3>
              <p className="mt-1 text-[13px] text-wk-muted">
                Select a division and audit month, then set the dates when schools can submit audits. All schools in
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
                <select
                  id="audit-scheduler-month"
                  className={fieldClass}
                  value={scheduleMonth}
                  onChange={(e) => handleMonthChange(e.target.value)}
                  required
                >
                  {auditMonthOptions.map((month) => (
                    <option key={month} value={month}>
                      {formatAuditMonthLabel(month)}
                    </option>
                  ))}
                </select>
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
              <p className="text-xs italic text-wk-muted">
                Schools in the selected division can submit {formatAuditMonthLabel(scheduleMonth)} audits only between
                these dates.
              </p>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center justify-center rounded-full bg-wk-orange px-6 py-2.5 text-sm font-bold text-wk-navy shadow-brand transition hover:bg-wk-orange-hover disabled:opacity-60"
              >
                {saving ? 'Saving…' : existingForSelection ? 'Update Audit Window' : 'Save Audit Window'}
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl bg-white shadow-card">
        <div className="border-b border-wk-line px-4 py-3">
          <h3 className="text-base font-semibold text-wk-ink">
            Scheduled for {formatAuditMonthLabel(scheduleMonth)}
          </h3>
          <p className="mt-1 text-xs text-wk-muted">
            Upcoming audit windows for the month you are currently scheduling.
          </p>
        </div>
        {windowsForMonth.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-wk-line bg-wk-cream">
                  {['Division', 'Start', 'End', 'Actions'].map((col) => (
                    <th
                      key={col}
                      className={`px-6 py-3 text-sm font-medium text-wk-muted ${
                        col === 'Actions' ? 'text-right' : ''
                      }`}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-wk-line">
                {windowsForMonth.map((w) => (
                  <tr key={w._id} className="hover:bg-wk-cream">
                    <td className="px-6 py-3.5 font-medium text-wk-ink">{w.divisionId?.name || '—'}</td>
                    <td className="px-6 py-3.5 text-sm text-wk-muted">
                      {new Date(w.startDate).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-3.5 text-sm text-wk-muted">
                      {new Date(w.endDate).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(w._id)}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full text-error-600 transition hover:bg-error-50"
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
          <p className="px-6 py-10 text-center text-wk-muted">
            No audit windows scheduled for {formatAuditMonthLabel(scheduleMonth)} yet.
          </p>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl bg-white shadow-card">
        <div className="border-b border-wk-line px-4 py-3">
          <h3 className="text-base font-semibold text-wk-ink">Scheduled audit history</h3>
          <p className="mt-1 text-xs text-wk-muted">
            Previously scheduled audit windows for other months.
          </p>
        </div>
        {historyGroups.length > 0 ? (
          <div className="divide-y divide-wk-line">
            {historyGroups.map(({ month, items }) => (
              <div key={month}>
                <div className="bg-wk-cream px-6 py-2.5 text-sm font-bold text-wk-ink">
                  {formatAuditMonthLabel(month)}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-wk-line">
                        {['Division', 'Start', 'End', 'Actions'].map((col) => (
                          <th
                            key={col}
                            className={`px-6 py-3 text-sm font-medium text-wk-muted ${
                              col === 'Actions' ? 'text-right' : ''
                            }`}
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-wk-line">
                      {items.map((w) => (
                        <tr key={w._id} className="hover:bg-wk-cream">
                          <td className="px-6 py-3.5 font-medium text-wk-ink">{w.divisionId?.name || '—'}</td>
                          <td className="px-6 py-3.5 text-sm text-wk-muted">
                            {new Date(w.startDate).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-3.5 text-sm text-wk-muted">
                            {new Date(w.endDate).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-3.5 text-right">
                            <button
                              type="button"
                              onClick={() => handleDelete(w._id)}
                              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-error-600 transition hover:bg-error-50"
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
              </div>
            ))}
          </div>
        ) : (
          <p className="px-6 py-10 text-center text-wk-muted">
            No previous audit windows scheduled yet.
          </p>
        )}
      </section>
    </div>
  );
};

export default AdminAuditScheduler;
