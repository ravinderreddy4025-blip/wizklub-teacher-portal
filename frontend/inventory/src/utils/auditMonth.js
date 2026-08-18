/** Format audit month labels stored as YYYY-M or YYYY-MM. */
export function formatAuditMonthLabel(month) {
  const [year, m] = String(month || '').split('-').map(Number);
  if (!year || !m) return month || '—';
  return new Date(year, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function groupAuditsByMonth(audits) {
  const grouped = {};
  (audits || []).forEach((audit) => {
    const key = audit.month || 'unknown';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(audit);
  });
  return Object.entries(grouped).sort(([a], [b]) => {
    const [ay, am] = a.split('-').map(Number);
    const [by, bm] = b.split('-').map(Number);
    if (ay !== by) return (by || 0) - (ay || 0);
    return (bm || 0) - (am || 0);
  });
}
