/**
 * Monthly report rule (every dispatch, every school, every issue type):
 *   sent originally → received OK remainder → affected (lost / damaged / mismatch)
 *   → affected qty is shipped again and also counts as dispatched.
 * Example: 12 sent, 4 mismatch, 8 received OK, then 4 reshipped; a clean 2 received
 * in full still counts as acknowledged.
 */
const Dispatch = require('../models/Dispatch');
const AuditReport = require('../models/AuditReport');
const School = require('../models/School');
const ReceiptIssue = require('../models/ReceiptIssue');
const ReplacementRequest = require('../models/ReplacementRequest');
const { formatAuditMonth } = require('../utils/auditMonth');
const { buildIssueMonthMatch } = require('../utils/dispatchHub');
const { fulfillmentFromDispatches } = require('../utils/operationsKpi');
const { closeExpiredAuditWindows } = require('./auditCloseoutService');

const MIN_SHIPPED_FOR_RATE_RANK = 10;

function currentMonth() {
  return formatAuditMonth(new Date());
}

function auditMonthKeys(monthStr) {
  const [year, month] = String(monthStr || '').split('-').map(Number);
  if (!year || !month || month < 1 || month > 12) {
    const error = new Error('Invalid month. Use YYYY-MM format.');
    error.status = 400;
    throw error;
  }
  return {
    year,
    month,
    auditMonth: `${year}-${month}`,
    auditMonthPadded: `${year}-${String(month).padStart(2, '0')}`,
  };
}

function parseMonth(monthStr) {
  const keys = auditMonthKeys(monthStr);
  const start = new Date(keys.year, keys.month - 1, 1, 0, 0, 0, 0);
  const end = new Date(keys.year, keys.month, 0, 23, 59, 59, 999);
  return { ...keys, start, end };
}

function inRange(date, start, end) {
  if (!date) return false;
  const t = new Date(date).getTime();
  return t >= start.getTime() && t <= end.getTime();
}

function emptySchoolStats(school) {
  return {
    schoolId: school._id,
    schoolName: school.name,
    schoolCode: school.code,
    divisionName: school.divisionId?.name || '—',
    pendingKits: 0,
    scheduledKits: 0,
    sentKits: 0,
    dispatchedKits: 0,
    replacedKits: 0,
    lostKits: 0,
    notReceivedKits: 0,
    damagedKits: 0,
    mismatchKits: 0,
    affectedKits: 0,
    acknowledgedKits: 0,
    rejectedKits: 0,
    rejectedByAm: 0,
    rejectedByAdmin: 0,
    auditLostKits: 0,
    auditDamagedKits: 0,
    fulfillment: { eligibleDsps: 0, fulfilledDsps: 0, rate: 0 },
    issueRate: 0,
    dispatchCount: 0,
    auditSubmitted: false,
  };
}

function emptySummary(month) {
  return {
    month,
    pendingKits: 0,
    scheduledKits: 0,
    sentKits: 0,
    dispatchedKits: 0,
    replacedKits: 0,
    lostKits: 0,
    notReceivedKits: 0,
    damagedKits: 0,
    mismatchKits: 0,
    affectedKits: 0,
    acknowledgedKits: 0,
    rejectedKits: 0,
    rejectedByAm: 0,
    rejectedByAdmin: 0,
    auditLostKits: 0,
    auditDamagedKits: 0,
    fulfillment: { eligibleDsps: 0, fulfilledDsps: 0, rate: 0 },
    issueRate: 0,
    schoolsWithActivity: 0,
  };
}

const KPI_FIELDS = [
  'pendingKits',
  'scheduledKits',
  'sentKits',
  'dispatchedKits',
  'replacedKits',
  'lostKits',
  'notReceivedKits',
  'damagedKits',
  'mismatchKits',
  'affectedKits',
  'acknowledgedKits',
  'rejectedKits',
  'rejectedByAm',
  'rejectedByAdmin',
  'auditLostKits',
  'auditDamagedKits',
];

function addRejection(stats, qty, doc) {
  const n = Number(qty) || 0;
  if (n <= 0) return;
  stats.rejectedKits += n;
  if (doc?.adminNotes) stats.rejectedByAdmin += n;
  else stats.rejectedByAm += n;
}

function originalSentQuantity(dispatch) {
  const cycles = Array.isArray(dispatch.redispatchCycles) ? dispatch.redispatchCycles : [];
  const originalQty = Number(cycles[0]?.quantity);
  if (cycles.length > 0 && Number.isFinite(originalQty) && originalQty > 0) {
    return originalQty;
  }
  return dispatch.quantity || 0;
}

function replacementQtyForCycle(dispatch, cycles, index) {
  if (index + 1 < cycles.length) return Number(cycles[index + 1].quantity) || 0;
  return dispatch.quantity || 0;
}

function originalSentThisMonth(dispatch, start, end) {
  const cycles = Array.isArray(dispatch.redispatchCycles) ? dispatch.redispatchCycles : [];
  if (cycles.length === 0) {
    const sentAt = dispatch.dispatchedAt || dispatch.createdAt;
    return inRange(sentAt, start, end) ? (dispatch.quantity || 0) : 0;
  }
  return inRange(dispatch.createdAt, start, end) ? originalSentQuantity(dispatch) : 0;
}

function cycleQtyInMonth(dispatch, start, end, movementType) {
  const cycles = Array.isArray(dispatch.cycles) ? dispatch.cycles : [];
  if (!cycles.length) return null;
  return cycles.reduce((sum, cycle) => {
    if (movementType && cycle.movementType !== movementType) return sum;
    if (!inRange(cycle.dispatchedAt, start, end)) return sum;
    return sum + (Number(cycle.quantityDispatched) || 0);
  }, 0);
}

function acknowledgedFromCycles(dispatch, start, end) {
  const cycles = Array.isArray(dispatch.cycles) ? dispatch.cycles : [];
  return cycles.reduce((sum, cycle) => {
    if (!inRange(cycle.acknowledgedAt, start, end)) return sum;
    return sum + (Number(cycle.quantityAcknowledged) || 0);
  }, 0);
}

function dispatchedUnitsInMonth(dispatch, start, end) {
  if (dispatch.status === 'Pending') return 0;

  const cycles = Array.isArray(dispatch.redispatchCycles) ? dispatch.redispatchCycles : [];
  if (cycles.length === 0) return originalSentThisMonth(dispatch, start, end);

  let total = originalSentThisMonth(dispatch, start, end);
  for (let i = 0; i < cycles.length; i += 1) {
    if (!inRange(cycles[i].authorizedAt, start, end)) continue;
    total += replacementQtyForCycle(dispatch, cycles, i);
  }
  return total;
}

function receivedOkQuantity(dispatch) {
  const received = Number(dispatch.quantityReceived);
  if (Number.isFinite(received) && received >= 0) return received;
  if (['Received', 'Delivery Completed', 'Completed'].includes(dispatch.status)) {
    return dispatch.quantity || 0;
  }
  return 0;
}

function isCleanReceiptStatus(status) {
  return status === 'Received' || status === 'Delivery Completed' || status === 'Completed';
}

const CLOSED_ISSUE_STATUSES = new Set(['Approved', 'Resolved', 'Superseded']);

function accumulateDispatchStats(stats, dispatch, start, end, receiptState) {
  if (dispatch.status === 'Pending' && inRange(dispatch.createdAt, start, end)) {
    const pendingQty = dispatch.quantity || 0;
    stats.pendingKits += pendingQty;
    stats.scheduledKits += pendingQty;
  }

  const initialThisMonth = cycleQtyInMonth(dispatch, start, end, 'INITIAL');
  if (initialThisMonth != null) {
    const replacedThisMonth = cycleQtyInMonth(dispatch, start, end, 'REPLACEMENT') || 0;
    if (initialThisMonth > 0) {
      stats.sentKits += initialThisMonth;
      stats.dispatchedKits += initialThisMonth;
      stats.scheduledKits += initialThisMonth;
      stats.dispatchCount += 1;
    }
    if (replacedThisMonth > 0) stats.replacedKits += replacedThisMonth;

    const ackThisMonth = acknowledgedFromCycles(dispatch, start, end);
    if (ackThisMonth > 0) {
      const dispatchId = String(dispatch._id);
      stats.acknowledgedKits += ackThisMonth;
      receiptState.ackFromDispatchIds.add(dispatchId);
      receiptState.liveReceiptDispatchIds.add(dispatchId);
    }
    return;
  }

  const sentThisMonth = dispatchedUnitsInMonth(dispatch, start, end);
  if (sentThisMonth > 0) {
    stats.sentKits += sentThisMonth;
    stats.dispatchedKits += sentThisMonth;
    stats.scheduledKits += sentThisMonth;
    stats.dispatchCount += 1;
  }

  if (!inRange(dispatch.receivedAt, start, end)) return;

  const dispatchId = String(dispatch._id);
  receiptState.liveReceiptDispatchIds.add(dispatchId);

  const hasIssue = Boolean(dispatch.receiptIssue);
  const receivedOk = receivedOkQuantity(dispatch);

  if (!hasIssue) {
    if (receivedOk > 0) {
      stats.acknowledgedKits += receivedOk;
      receiptState.ackFromDispatchIds.add(dispatchId);
    }
    return;
  }

  // Replacement received in full: count this cycle's OK qty. Prior-cycle remainder
  // still comes from the receipt issue (12 sent − 4 mismatch = 8).
  if (isCleanReceiptStatus(dispatch.status) && receivedOk > 0) {
    stats.acknowledgedKits += receivedOk;
    receiptState.ackFromDispatchIds.add(dispatchId);
  }
}

function accumulateAuditStats(stats, audit) {
  stats.auditSubmitted = true;
  if (audit.assumedIntact) return;
  for (const item of audit.items || []) {
    stats.auditLostKits += item.lostQuantity || 0;
    stats.auditDamagedKits += item.damagedQuantity || 0;
  }
}

function accumulateReceiptIssueStats(stats, issue, receiptState) {
  const receivedOk = issue.quantityReceived || 0;
  const affected = issue.quantityAffected || 0;

  const dispatchHasCycles = Array.isArray(issue.dispatch?.cycles) && issue.dispatch.cycles.length > 0;

  if (affected > 0) {
    stats.affectedKits += affected;
    if (issue.status !== 'Rejected') {
      if (issue.issueType === 'Quantity Mismatch') stats.mismatchKits += affected;
      else if (issue.issueType === 'Damaged Product') stats.damagedKits += affected;
      else if (issue.issueType === 'Shipment Not Received') stats.notReceivedKits += affected;
      else if (issue.issueType === 'Missing Product') stats.lostKits += affected;
    }
  }

  // Rejected = replacement claim denied. Kits already received stay in the school
  // warehouse, so they still count as acknowledged.
  if (issue.status === 'Rejected') {
    if (receivedOk > 0 && !dispatchHasCycles) stats.acknowledgedKits += receivedOk;
    addRejection(stats, affected || receivedOk, issue);
    return;
  }

  const dispatchId = String(issue.dispatch?._id || issue.dispatch || '');
  const currentIssueId = String(issue.dispatch?.receiptIssue || '');
  const isLiveCycleIssue = receiptState.liveReceiptDispatchIds.has(dispatchId)
    && currentIssueId === String(issue._id);

  // 12 sent / 4 affected => 8 acknowledged, for mismatch, damage, or missing.
  const alreadyCountedOpenIssue = isLiveCycleIssue
    && receiptState.ackFromDispatchIds.has(dispatchId)
    && !CLOSED_ISSUE_STATUSES.has(issue.status);
  if (receivedOk > 0 && !alreadyCountedOpenIssue && !dispatchHasCycles) {
    stats.acknowledgedKits += receivedOk;
  }
}

function ensureSchoolStats(schoolMap, schoolDoc) {
  const schoolId = String(schoolDoc?._id || schoolDoc);
  if (!schoolId || schoolId === 'undefined') return null;
  if (!schoolMap.has(schoolId)) {
    schoolMap.set(schoolId, emptySchoolStats({
      _id: schoolDoc._id || schoolDoc,
      name: schoolDoc.name,
      code: schoolDoc.code,
      divisionId: schoolDoc.divisionId,
    }));
  }
  return schoolMap.get(schoolId);
}

function accumulateReplacementRejection(stats, request) {
  if (request.status !== 'Rejected') return;
  addRejection(stats, request.quantity || 0, request);
}

function hasReportActivity(row) {
  return row.scheduledKits > 0
    || row.sentKits > 0
    || row.dispatchedKits > 0
    || row.affectedKits > 0
    || row.lostKits > 0
    || row.notReceivedKits > 0
    || row.damagedKits > 0
    || row.mismatchKits > 0
    || row.acknowledgedKits > 0
    || row.replacedKits > 0
    || row.rejectedKits > 0
    || row.auditSubmitted;
}

function computeIssueRate(shippedKits, affectedKits) {
  const shipped = Number(shippedKits) || 0;
  const affected = Number(affectedKits) || 0;
  if (shipped <= 0) return 0;
  return Math.round((affected / shipped) * 1000) / 10;
}

function enrichReportRow(row, fulfillment) {
  row.fulfillment = fulfillment || row.fulfillment || { eligibleDsps: 0, fulfilledDsps: 0, rate: 0 };
  row.issueRate = computeIssueRate(row.sentKits, row.affectedKits);
  row.shippedKits = row.sentKits;
  row.receivedKits = row.acknowledgedKits;
  row.pendingDispatchKits = row.pendingKits;
  return row;
}

function buildComposition(stats) {
  const mismatch = stats.mismatchKits || 0;
  const notReceived = stats.notReceivedKits || 0;
  const damaged = stats.damagedKits || 0;
  const lost = stats.lostKits || 0;
  const totalAffected = stats.affectedKits || mismatch + notReceived + damaged + lost;
  return { mismatch, notReceived, damaged, lost, totalAffected };
}

function schoolFilter(schoolIds) {
  if (schoolIds == null) return {};
  return { school: { $in: schoolIds } };
}

async function getMonthlyReport(monthInput, options = {}) {
  const month = monthInput || currentMonth();
  const { start, end, auditMonth, auditMonthPadded } = parseMonth(month);
  const issueMonthMatch = buildIssueMonthMatch(`${auditMonthPadded}`);
  const schoolIds = options.schoolIds ?? null;
  const dispatchMatch = schoolFilter(schoolIds);
  const schoolMatch = schoolIds == null ? {} : { _id: { $in: schoolIds } };
  const auditMatch = {
    month: { $in: [auditMonth, auditMonthPadded] },
    ...(schoolIds == null ? {} : { school: { $in: schoolIds } }),
  };
  const replacementMatch = {
    status: 'Rejected',
    updatedAt: { $gte: start, $lte: end },
    ...dispatchMatch,
  };

  await closeExpiredAuditWindows({
    schoolIds: schoolIds?.length ? schoolIds : undefined,
    month,
  });

  const [dispatches, audits, schools, receiptIssues, rejectedReplacements] = await Promise.all([
    Dispatch.find(dispatchMatch).populate('school', 'name code divisionId').populate('kit', 'name kitId').lean(),
    AuditReport.find(auditMatch)
      .populate('school', 'name code divisionId')
      .populate('items.kit', 'name kitId')
      .lean(),
    School.find(schoolMatch).populate('divisionId', 'name').sort({ name: 1 }).lean(),
    ReceiptIssue.find({ ...issueMonthMatch, ...dispatchMatch })
      .populate('school', 'name code divisionId')
      .populate('kit', 'name kitId')
      .populate('dispatch', 'dispatchId status receiptIssue quantityReceived cycles')
      .lean(),
    ReplacementRequest.find(replacementMatch).lean(),
  ]);

  const schoolMap = new Map();
  schools.forEach((school) => {
    schoolMap.set(String(school._id), emptySchoolStats(school));
  });

  const summary = emptySummary(month);

  const receiptState = {
    liveReceiptDispatchIds: new Set(),
    ackFromDispatchIds: new Set(),
  };

  dispatches.forEach((dispatch) => {
    const stats = ensureSchoolStats(schoolMap, dispatch.school);
    if (!stats) return;
    accumulateDispatchStats(stats, dispatch, start, end, receiptState);
  });

  audits.forEach((audit) => {
    const stats = ensureSchoolStats(schoolMap, audit.school);
    if (!stats) return;
    accumulateAuditStats(stats, audit);
  });

  receiptIssues.forEach((issue) => {
    const stats = ensureSchoolStats(schoolMap, issue.school);
    if (!stats) return;
    accumulateReceiptIssueStats(stats, issue, receiptState);
  });

  rejectedReplacements.forEach((request) => {
    const stats = ensureSchoolStats(schoolMap, request.school);
    if (!stats) return;
    accumulateReplacementRejection(stats, request);
  });

  const dispatchesBySchool = new Map();
  dispatches.forEach((dispatch) => {
    const schoolId = String(dispatch.school?._id || dispatch.school || '');
    if (!schoolId) return;
    if (!dispatchesBySchool.has(schoolId)) dispatchesBySchool.set(schoolId, []);
    dispatchesBySchool.get(schoolId).push(dispatch);
  });

  const summaryFulfillment = fulfillmentFromDispatches(dispatches, start, end);

  const schoolBreakdown = [...schoolMap.values()]
    .map((row) => {
      const hasActivity = hasReportActivity(row);
      if (hasActivity) summary.schoolsWithActivity += 1;
      KPI_FIELDS.forEach((field) => {
        summary[field] += row[field] || 0;
      });
      const schoolDispatches = dispatchesBySchool.get(String(row.schoolId)) || [];
      enrichReportRow(row, fulfillmentFromDispatches(schoolDispatches, start, end));
      return { ...row, hasActivity };
    })
    .filter((row) => row.hasActivity)
    .sort((a, b) => (a.schoolName || '').localeCompare(b.schoolName || ''));

  summary.fulfillment = summaryFulfillment;
  summary.issueRate = computeIssueRate(summary.sentKits, summary.affectedKits);
  summary.shippedKits = summary.sentKits;
  summary.receivedKits = summary.acknowledgedKits;
  summary.pendingDispatchKits = summary.pendingKits;

  return { summary, schools: schoolBreakdown };
}

async function getSchoolReportData(schoolId, monthInput) {
  const month = monthInput || currentMonth();
  const { start, end, auditMonth, auditMonthPadded } = parseMonth(month);
  const issueMonthMatch = buildIssueMonthMatch(auditMonthPadded);

  const school = await School.findById(schoolId).populate('divisionId', 'name').lean();
  if (!school) {
    const error = new Error('School not found');
    error.status = 404;
    throw error;
  }

  await closeExpiredAuditWindows({ schoolIds: [schoolId], month });

  const [dispatches, audit, receiptIssues, rejectedReplacements] = await Promise.all([
    Dispatch.find({ school: schoolId })
      .populate('kit', 'name kitId')
      .sort({ createdAt: -1 })
      .lean(),
    AuditReport.findOne({ school: schoolId, month: { $in: [auditMonth, auditMonthPadded] } })
      .populate('items.kit', 'name kitId')
      .lean(),
    ReceiptIssue.find({ school: schoolId, ...issueMonthMatch })
      .populate('kit', 'name kitId')
      .populate('dispatch', 'dispatchId status trackingId receiptIssue quantityReceived cycles')
      .sort({ createdAt: -1 })
      .lean(),
    ReplacementRequest.find({
      school: schoolId,
      status: 'Rejected',
      updatedAt: { $gte: start, $lte: end },
    }).lean(),
  ]);

  const stats = emptySchoolStats(school);
  const dispatchesInMonth = [];
  const receiptState = {
    liveReceiptDispatchIds: new Set(),
    ackFromDispatchIds: new Set(),
  };

  dispatches.forEach((dispatch) => {
    const sentThisMonth = dispatchedUnitsInMonth(dispatch, start, end);
    const inReceiptMonth = inRange(dispatch.receivedAt, start, end);

    if (sentThisMonth > 0 || inReceiptMonth || (dispatch.status === 'Pending' && inRange(dispatch.createdAt, start, end))) {
      const originalThisMonth = originalSentThisMonth(dispatch, start, end);
      dispatchesInMonth.push({
        ...dispatch,
        reportSentQty: sentThisMonth,
        reportOriginalQty: originalThisMonth,
        reportReshipQty: Math.max(0, sentThisMonth - originalThisMonth),
      });
    }
    accumulateDispatchStats(stats, dispatch, start, end, receiptState);
  });

  if (audit) {
    accumulateAuditStats(stats, audit);
  }

  receiptIssues.forEach((issue) => {
    accumulateReceiptIssueStats(stats, issue, receiptState);
  });

  rejectedReplacements.forEach((request) => {
    accumulateReplacementRejection(stats, request);
  });

  enrichReportRow(stats, fulfillmentFromDispatches(dispatches, start, end));

  return {
    month,
    school,
    stats,
    composition: buildComposition(stats),
    dispatches: dispatchesInMonth,
    receiptIssues,
    audit,
  };
}

module.exports = {
  currentMonth,
  parseMonth,
  getMonthlyReport,
  getSchoolReportData,
  computeIssueRate,
  buildComposition,
  enrichReportRow,
  MIN_SHIPPED_FOR_RATE_RANK,
};
