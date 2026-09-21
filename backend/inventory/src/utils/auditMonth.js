/** Format: YYYY-M (no zero-pad), matches AuditReport.month */
function formatAuditMonth(date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}`;
}

function getNextAuditMonth() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return formatAuditMonth(next);
}

function getCurrentAuditMonth() {
  return formatAuditMonth(new Date());
}

function formatAuditMonthLabel(auditMonth) {
  const [year, month] = auditMonth.split('-').map(Number);
  if (!year || !month) return auditMonth;
  return new Date(year, month - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
}

function isNextAuditMonth(auditMonth) {
  return auditMonth === getNextAuditMonth();
}

function parseAuditMonth(auditMonth) {
  const [year, month] = String(auditMonth || '').split('-').map(Number);
  if (!year || !month || month < 1 || month > 12) return null;
  return { year, month };
}

function isValidAuditMonth(auditMonth) {
  return parseAuditMonth(auditMonth) !== null;
}

/** Accept YYYY-M or YYYY-MM and return both keys for DB queries. */
function auditMonthMatchValues(monthInput) {
  if (!monthInput) return [];
  const [year, month] = String(monthInput).split('-').map(Number);
  if (!year || !month || month < 1 || month > 12) return [String(monthInput)];
  return [`${year}-${month}`, `${year}-${String(month).padStart(2, '0')}`];
}

module.exports = {
  formatAuditMonth,
  getNextAuditMonth,
  getCurrentAuditMonth,
  formatAuditMonthLabel,
  isNextAuditMonth,
  parseAuditMonth,
  isValidAuditMonth,
  auditMonthMatchValues,
};
