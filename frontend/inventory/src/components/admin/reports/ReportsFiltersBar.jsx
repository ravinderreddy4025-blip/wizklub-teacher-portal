import React, { useEffect, useState } from 'react';
import api from '../../../utils/api';
import { ISSUE_TYPE_OPTIONS } from '../../../utils/reportsAnalytics';

export default function ReportsFiltersBar({
  reportMonth,
  onMonthChange,
  trendMonths,
  onTrendMonthsChange,
  divisionId,
  onDivisionChange,
  schoolId,
  onSchoolChange,
  issueType,
  onIssueTypeChange,
  divisions = [],
}) {
  const [schoolOptions, setSchoolOptions] = useState([]);
  const [schoolsLoading, setSchoolsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadSchools() {
      try {
        setSchoolsLoading(true);
        const params = {};
        if (divisionId) params.divisionId = divisionId;
        params.limit = 500;
        const res = await api.get('/admin/schools', { params });
        if (!cancelled) setSchoolOptions(res.data.data || res.data.schools || []);
      } catch {
        if (!cancelled) setSchoolOptions([]);
      } finally {
        if (!cancelled) setSchoolsLoading(false);
      }
    }
    loadSchools();
    return () => { cancelled = true; };
  }, [divisionId]);

  useEffect(() => {
    if (schoolId && !schoolOptions.some((s) => String(s._id) === String(schoolId))) {
      onSchoolChange('');
    }
  }, [schoolOptions, schoolId, onSchoolChange]);

  return (
    <div className="rounded-2xl border border-wk-line bg-wk-cream p-4">
      <p className="mb-3 text-sm font-medium text-wk-orange-text">Report filters</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="flex flex-col gap-1.5">
          <span className="stitch-label">Report month</span>
          <input type="month" className="stitch-input" value={reportMonth} onChange={(e) => onMonthChange(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="stitch-label">Trend window</span>
          <select className="stitch-input" value={trendMonths} onChange={(e) => onTrendMonthsChange(Number(e.target.value))}>
            <option value={6}>Last 6 months</option>
            <option value={12}>Last 12 months</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="stitch-label">Division</span>
          <select className="stitch-input" value={divisionId} onChange={(e) => onDivisionChange(e.target.value)}>
            <option value="">All divisions</option>
            {divisions.map((d) => (
              <option key={d._id} value={d._id}>{d.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="stitch-label">School</span>
          <select
            className="stitch-input"
            value={schoolId}
            onChange={(e) => onSchoolChange(e.target.value)}
            disabled={schoolsLoading}
          >
            <option value="">All schools</option>
            {schoolOptions.map((s) => (
              <option key={s._id} value={s._id}>{s.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="stitch-label">Issue type</span>
          <select className="stitch-input" value={issueType} onChange={(e) => onIssueTypeChange(e.target.value)}>
            {ISSUE_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
