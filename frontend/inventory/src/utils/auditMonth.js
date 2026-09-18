/** Format: YYYY-M (no zero-pad), matches AuditReport.month */
export function formatAuditMonthValue(date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}`;
}

export function getCurrentAuditMonth() {
  return formatAuditMonthValue(new Date());
}

export function getNextAuditMonth() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return formatAuditMonthValue(next);
}

export function compareAuditMonths(a, b) {
  const [ay, am] = String(a || '').split('-').map(Number);
  const [by, bm] = String(b || '').split('-').map(Number);
  if (ay !== by) return ay - by;
  return (am || 0) - (bm || 0);
}

export function addAuditMonths(auditMonth, count = 1) {
  const [year, month] = String(auditMonth || '').split('-').map(Number);
  if (!year || !month) return auditMonth;
  const date = new Date(year, month - 1 + count, 1);
  return formatAuditMonthValue(date);
}

/** First upcoming month that still needs division windows scheduled. */
export function findActiveScheduleMonth(divisions, auditWindows, startMonth = getNextAuditMonth()) {
  let month = startMonth;
  for (let step = 0; step < 24; step += 1) {
    const allScheduled = !divisions.length || divisions.every((division) =>
      auditWindows.some(
        (window) =>
          (window.divisionId?._id || window.divisionId) === division._id
          && window.auditMonth === month
      )
    );
    if (!allScheduled) return month;
    month = addAuditMonths(month, 1);
  }
  return month;
}

/** Build selectable audit months: current month plus upcoming months. */
export function buildAuditMonthOptions({ monthsAhead = 12, extraMonths = [] } = {}) {
  const now = new Date();
  const options = [];

  for (let offset = 0; offset <= monthsAhead; offset += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    options.push(formatAuditMonthValue(date));
  }

  extraMonths.forEach((month) => {
    if (month && !options.includes(month)) options.push(month);
  });

  return options.sort((a, b) => {
    const [ay, am] = a.split('-').map(Number);
    const [by, bm] = b.split('-').map(Number);
    if (ay !== by) return ay - by;
    return am - bm;
  });
}

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
