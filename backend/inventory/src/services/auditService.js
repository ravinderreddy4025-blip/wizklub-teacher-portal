const School = require('../models/School');
const DivisionAuditWindow = require('../models/DivisionAuditWindow');
const { getCurrentAuditMonth, getNextAuditMonth } = require('../utils/auditMonth');

function windowDateBounds(window) {
  const start = new Date(window.startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(window.endDate);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function isWithinWindowDates(window, now = new Date()) {
  if (!window?.startDate || !window?.endDate) return false;
  const { start, end } = windowDateBounds(window);
  return now >= start && now <= end;
}

async function getSchoolDivisionId(schoolId) {
  const school = await School.findById(schoolId).select('divisionId');
  return school?.divisionId || null;
}

const getAuditWindowForSchool = async (schoolId, month) => {
  const divisionId = await getSchoolDivisionId(schoolId);
  if (!divisionId || !month) return null;

  return DivisionAuditWindow.findOne({
    divisionId,
    auditMonth: month,
  });
};

/** Window whose start/end dates include today (may be next month's audit). */
const getActiveAuditWindowForSchool = async (schoolId, now = new Date()) => {
  const divisionId = await getSchoolDivisionId(schoolId);
  if (!divisionId) return null;

  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(now);
  dayEnd.setHours(23, 59, 59, 999);

  return DivisionAuditWindow.findOne({
    divisionId,
    startDate: { $lte: dayEnd },
    endDate: { $gte: dayStart },
  }).sort({ startDate: -1 });
};

/**
 * Prefer an explicitly requested month; otherwise use the date-active window,
 * then fall back to current / next calendar audit months for messaging.
 */
const resolveAuditWindowForSchool = async (schoolId, month) => {
  if (month) {
    const byMonth = await getAuditWindowForSchool(schoolId, month);
    if (byMonth) {
      return {
        window: byMonth,
        month: byMonth.auditMonth,
        open: isWithinWindowDates(byMonth),
        source: 'requested',
      };
    }
  }

  const active = await getActiveAuditWindowForSchool(schoolId);
  if (active) {
    return {
      window: active,
      month: active.auditMonth,
      open: true,
      source: 'active',
    };
  }

  const currentMonth = getCurrentAuditMonth();
  const nextMonth = getNextAuditMonth();
  const currentWindow = await getAuditWindowForSchool(schoolId, currentMonth);
  if (currentWindow) {
    return {
      window: currentWindow,
      month: currentWindow.auditMonth,
      open: isWithinWindowDates(currentWindow),
      source: 'current',
    };
  }

  const nextWindow = await getAuditWindowForSchool(schoolId, nextMonth);
  if (nextWindow) {
    return {
      window: nextWindow,
      month: nextWindow.auditMonth,
      open: isWithinWindowDates(nextWindow),
      source: 'next',
    };
  }

  return {
    window: null,
    month: month || currentMonth,
    open: false,
    source: 'none',
  };
};

const isAuditWindowOpen = async (schoolId, month) => {
  if (month) {
    const window = await getAuditWindowForSchool(schoolId, month);
    return isWithinWindowDates(window);
  }
  const resolved = await resolveAuditWindowForSchool(schoolId);
  return resolved.open;
};

function isAuditWindowExpired(window, now = new Date()) {
  if (!window?.endDate) return false;
  const { end } = windowDateBounds(window);
  return now > end;
}

module.exports = {
  isAuditWindowOpen,
  getAuditWindowForSchool,
  getActiveAuditWindowForSchool,
  resolveAuditWindowForSchool,
  isWithinWindowDates,
  isAuditWindowExpired,
};
